const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";

export async function buildLastfmRelatedProfile(env, tasteProfile, options = {}) {
  const apiKey = env?.LASTFM_API_KEY;

  if (!apiKey) {
    throw new Error("Missing LASTFM_API_KEY");
  }

  const selectedSeeds = Array.isArray(tasteProfile?.selectedSeeds)
    ? tasteProfile.selectedSeeds
    : [];

  const {
    maxSeeds = 50,
    similarPerSeed = 30,
    minRelatedScore = 10
  } = options;

  const directArtists = tasteProfile?.directArtists || {};
  const seeds = selectedSeeds.slice(0, maxSeeds);
  const relatedMap = new Map();

  for (const seed of seeds) {
    const similarArtists = await fetchSimilarArtists({
      apiKey,
      artistName: seed.name,
      limit: similarPerSeed,
      autocorrect: 1
    });

    for (let i = 0; i < similarArtists.length; i += 1) {
      const similar = similarArtists[i];
      const similarName = cleanArtistName(similar?.name);
      if (!similarName) continue;

      const normalized = normalizeKey(similarName);
      if (!normalized) continue;

      if (directArtists[normalized]) {
        continue;
      }

      if (normalized === seed.normalized) {
        continue;
      }

      const contribution = scoreRelatedContribution({
        seed,
        similar,
        rank: i,
        total: similarArtists.length
      });

      if (contribution <= 0) continue;

      const existing = getOrCreateRelatedArtist(relatedMap, normalized, similarName);
      existing.score += contribution;
      existing.seedCount += 1;
      existing.sources.push({
        normalized: seed.normalized,
        name: seed.name,
        directScore: seed.directScore,
        seedWeight: seed.seedWeight,
        contribution: roundTo(contribution, 4),
        similarRank: i + 1
      });
    }
  }

  const relatedArtists = finalizeRelatedArtists(relatedMap, minRelatedScore);
  const tiers = classifyRelatedArtists(relatedArtists);

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      seedCount: seeds.length,
      similarPerSeed,
      minRelatedScore
    },
    relatedArtists,
    tierA: tiers.tierA,
    tierB: tiers.tierB,
    tierC: tiers.tierC
  };
}

async function fetchSimilarArtists({
  apiKey,
  artistName,
  limit = 30,
  autocorrect = 1
}) {
  const url = new URL(LASTFM_BASE);
  url.searchParams.set("method", "artist.getsimilar");
  url.searchParams.set("artist", artistName);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("autocorrect", String(autocorrect));
  url.searchParams.set("limit", String(limit));

  const data = await fetchJson(url.toString());
  const artists = data?.similarartists?.artist || [];

  return Array.isArray(artists) ? artists : [];
}

function getOrCreateRelatedArtist(map, normalized, name) {
  let existing = map.get(normalized);

  if (!existing) {
    existing = {
      name,
      normalized,
      score: 0,
      tier: null,
      seedCount: 0,
      sources: []
    };
    map.set(normalized, existing);
  }

  if (!existing.name || existing.name.length < name.length) {
    existing.name = name;
  }

  return existing;
}
function scoreRelatedContribution({ seed, similar, rank, total }) {
  const seedWeight = Number(seed?.seedWeight || 0);
  const seedDirectScore = Number(seed?.directScore || 0);

  if (seedWeight <= 0 || seedDirectScore <= 0) {
    return 0;
  }

  const apiMatch = toNumber(similar?.match);
  const matchWeight = apiMatch > 0
    ? clamp01(apiMatch)
    : rankToWeight(rank, total);

  const base = seedDirectScore * seedWeight * matchWeight * 0.8;
  return roundTo(base, 4);
}

function rankToWeight(rank, total) {
  const safeRank = Number(rank || 0);
  const safeTotal = Math.max(1, Number(total || 1));

  const rankFactor = 1 - safeRank / safeTotal;
  const softened = Math.max(0.15, Math.sqrt(Math.max(0, rankFactor)));

  return roundTo(Math.min(1, softened), 4);
}

function finalizeRelatedArtists(map, minRelatedScore) {
  const out = Object.create(null);

  for (const [normalized, artist] of map.entries()) {
    const finalScore = clampScore(artist.score);

    if (finalScore < minRelatedScore) {
      continue;
    }

    const sortedSources = artist.sources
      .slice()
      .sort((a, b) => b.contribution - a.contribution || a.name.localeCompare(b.name));

    out[normalized] = {
      name: artist.name,
      normalized,
      score: finalScore,
      tier: classifyRelatedTier(finalScore),
      seedCount: artist.seedCount,
      sources: sortedSources
    };
  }

  return out;
}

function classifyRelatedArtists(relatedArtists) {
  const artists = Object.values(relatedArtists).sort((a, b) => {
    return b.score - a.score || a.name.localeCompare(b.name);
  });

  const tierA = [];
  const tierB = [];
  const tierC = [];

  for (const artist of artists) {
    if (artist.tier === "A") {
      tierA.push(artist.normalized);
      continue;
    }

    if (artist.tier === "B") {
      tierB.push(artist.normalized);
      continue;
    }

    if (artist.tier === "C") {
      tierC.push(artist.normalized);
    }
  }

  return { tierA, tierB, tierC };
}

function classifyRelatedTier(score) {
  if (score >= 50) return "A";
  if (score >= 25) return "B";
  if (score >= 10) return "C";
  return null;
}

function clampScore(score) {
  return roundTo(Math.min(100, Math.max(0, score)), 2);
}
export function getRelatedArtistMatch(artistName, relatedProfile) {
  const normalized = normalizeKey(artistName);
  if (!normalized) return null;

  const relatedArtist = relatedProfile?.relatedArtists?.[normalized];
  if (!relatedArtist) return null;

  return {
    normalized,
    ...relatedArtist
  };
}

export function summarizeRelatedProfile(relatedProfile) {
  const relatedArtists = Object.values(relatedProfile?.relatedArtists || {});

  return {
    relatedArtistCount: relatedArtists.length,
    tierACount: Array.isArray(relatedProfile?.tierA) ? relatedProfile.tierA.length : 0,
    tierBCount: Array.isArray(relatedProfile?.tierB) ? relatedProfile.tierB.length : 0,
    tierCCount: Array.isArray(relatedProfile?.tierC) ? relatedProfile.tierC.length : 0,
    topRelatedArtists: relatedArtists
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 20)
      .map((artist) => ({
        name: artist.name,
        normalized: artist.normalized,
        score: artist.score,
        tier: artist.tier,
        seedCount: artist.seedCount,
        topSources: artist.sources.slice(0, 3)
      }))
  };
}

export function debugExplainRelatedArtist(artistName, relatedProfile) {
  const match = getRelatedArtistMatch(artistName, relatedProfile);

  if (!match) {
    return {
      found: false,
      artistName,
      normalized: normalizeKey(artistName),
      reason: "Artist not present in related taste map"
    };
  }

  return {
    found: true,
    artistName,
    normalized: match.normalized,
    name: match.name,
    score: match.score,
    tier: match.tier,
    seedCount: match.seedCount,
    topSources: match.sources.slice(0, 10)
  };
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "ListeningMirrorConcertBot/1.0"
    }
  });

  if (!res.ok) {
    throw new Error(`Last.fm fetch failed ${res.status}`);
  }

  const data = await res.json();

  if (data?.error) {
    throw new Error(`Last.fm error: ${data.message || data.error}`);
  }

  return data;
}
function cleanArtistName(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function roundTo(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}