import { fetchLastfmProfile, summarizeLastfmProfile } from "./lastfm-client.js";

export async function buildLastfmTasteProfile(env) {
  const rawProfile = await fetchLastfmProfile(env);

  const directArtists = buildDirectArtists(rawProfile);
  const tiers = classifyDirectArtists(directArtists);
  const selectedSeeds = selectRecommendationSeeds(directArtists, tiers);

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      rawSummary: summarizeLastfmProfile(rawProfile)
    },
    rawProfile,
    directArtists,
    tierA: tiers.tierA,
    tierB: tiers.tierB,
    tierC: tiers.tierC,
    selectedSeeds
  };
}

function buildDirectArtists(profile) {
  const direct = new Map();

  const libraryArtists = Array.isArray(profile?.libraryArtists)
    ? profile.libraryArtists
    : [];

  const overallArtists = Array.isArray(profile?.topArtistsOverall)
    ? profile.topArtistsOverall
    : [];

  const recentTracks = Array.isArray(profile?.recentTracks)
    ? profile.recentTracks
    : [];

  for (const artist of libraryArtists) {
    const name = cleanArtistName(artist?.name);
    if (!name) continue;

    const key = normalizeKey(name);
    const existing = getOrCreateDirectArtist(direct, key, name);

    existing.libraryPlaycount = Math.max(
      existing.libraryPlaycount,
      toNumber(artist?.playcount)
    );
  }

  for (const artist of overallArtists) {
    const name = cleanArtistName(artist?.name);
    if (!name) continue;

    const key = normalizeKey(name);
    const existing = getOrCreateDirectArtist(direct, key, name);

    existing.overallPlaycount = Math.max(
      existing.overallPlaycount,
      toNumber(artist?.playcount)
    );
  }

  for (const track of recentTracks) {
    const name = cleanArtistName(track?.artist?.name);
    if (!name) continue;

    const key = normalizeKey(name);
    const existing = getOrCreateDirectArtist(direct, key, name);

    existing.recentTrackCount += 1;
  }

  for (const artist of direct.values()) {
    const libraryScore = scoreLibraryPlaycount(artist.libraryPlaycount);
    const overallScore = scoreOverallPlaycount(artist.overallPlaycount);
    const recentBoost = scoreRecentTrackCount(artist.recentTrackCount);
    const directScore = clampScore(libraryScore + overallScore + recentBoost);

    artist.libraryScore = libraryScore;
    artist.overallScore = overallScore;
    artist.recentBoost = recentBoost;
    artist.score = directScore;
    artist.tier = classifyTier(directScore);
    artist.eligibleForSeed =
      artist.libraryPlaycount >= 5 ||
      artist.overallPlaycount >= 3 ||
      artist.recentTrackCount >= 2;
  }

  const out = Object.create(null);

  for (const [key, artist] of direct.entries()) {
    out[key] = {
      name: artist.name,
      normalized: key,
      libraryPlaycount: artist.libraryPlaycount,
      overallPlaycount: artist.overallPlaycount,
      recentTrackCount: artist.recentTrackCount,
      libraryScore: artist.libraryScore,
      overallScore: artist.overallScore,
      recentBoost: artist.recentBoost,
      score: artist.score,
      tier: artist.tier,
      eligibleForSeed: artist.eligibleForSeed
    };
  }

  return out;
}

function getOrCreateDirectArtist(map, key, name) {
  let existing = map.get(key);

  if (!existing) {
    existing = {
      name,
      libraryPlaycount: 0,
      overallPlaycount: 0,
      recentTrackCount: 0,
      libraryScore: 0,
      overallScore: 0,
      recentBoost: 0,
      score: 0,
      tier: null,
      eligibleForSeed: false
    };
    map.set(key, existing);
  }

  if (!existing.name || existing.name.length < name.length) {
    existing.name = name;
  }

  return existing;
}
function classifyDirectArtists(directArtists) {
  const artists = Object.values(directArtists).sort((a, b) => {
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

function selectRecommendationSeeds(directArtists, tiers) {
  const tierASeeds = tiers.tierA
    .map((key) => directArtists[key])
    .filter(Boolean);

  const tierBSeeds = tiers.tierB
    .map((key) => directArtists[key])
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 25);

  const tierCSeeds = tiers.tierC
    .map((key) => directArtists[key])
    .filter(Boolean)
    .filter((artist) => artist.eligibleForSeed)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 10);

  const combined = [...tierASeeds, ...tierBSeeds, ...tierCSeeds]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 50);

  return combined.map((artist) => ({
    normalized: artist.normalized,
    name: artist.name,
    directScore: artist.score,
    tier: artist.tier,
    seedWeight: calculateSeedWeight(artist.score),
    libraryPlaycount: artist.libraryPlaycount,
    overallPlaycount: artist.overallPlaycount,
    recentTrackCount: artist.recentTrackCount
  }));
}

function scoreLibraryPlaycount(playcount) {
  if (playcount <= 0) return 0;
  return Math.min(40, Math.log10(playcount + 1) * 18);
}

function scoreOverallPlaycount(playcount) {
  if (playcount <= 0) return 0;
  return Math.min(45, Math.log10(playcount + 1) * 20);
}

function scoreRecentTrackCount(count) {
  if (count <= 0) return 0;
  return Math.min(15, count * 2);
}

function classifyTier(score) {
  if (score >= 70) return "A";
  if (score >= 35) return "B";
  if (score >= 8) return "C";
  return null;
}

function calculateSeedWeight(score) {
  if (score <= 0) return 0;
  return roundTo(Math.max(0.2, score / 100), 4);
}

function clampScore(score) {
  return roundTo(Math.min(100, Math.max(0, score)), 2);
}
export function getDirectArtistMatch(artistName, tasteProfile) {
  const normalized = normalizeKey(artistName);
  if (!normalized) return null;

  const directArtist = tasteProfile?.directArtists?.[normalized];
  if (!directArtist) return null;

  return {
    normalized,
    ...directArtist
  };
}

export function summarizeTasteProfile(tasteProfile) {
  const directArtists = Object.values(tasteProfile?.directArtists || {});
  const selectedSeeds = Array.isArray(tasteProfile?.selectedSeeds)
    ? tasteProfile.selectedSeeds
    : [];

  return {
    directArtistCount: directArtists.length,
    tierACount: Array.isArray(tasteProfile?.tierA) ? tasteProfile.tierA.length : 0,
    tierBCount: Array.isArray(tasteProfile?.tierB) ? tasteProfile.tierB.length : 0,
    tierCCount: Array.isArray(tasteProfile?.tierC) ? tasteProfile.tierC.length : 0,
    selectedSeedCount: selectedSeeds.length,
    topDirectArtists: directArtists
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 20)
      .map((artist) => ({
        name: artist.name,
        normalized: artist.normalized,
        score: artist.score,
        tier: artist.tier,
        libraryPlaycount: artist.libraryPlaycount,
        overallPlaycount: artist.overallPlaycount,
        recentTrackCount: artist.recentTrackCount
      })),
    topSeeds: selectedSeeds.slice(0, 20)
  };
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

function roundTo(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
export function debugExplainArtist(artistName, tasteProfile) {
  const match = getDirectArtistMatch(artistName, tasteProfile);

  if (!match) {
    return {
      found: false,
      artistName,
      normalized: normalizeKey(artistName),
      reason: "Artist not present in direct taste map"
    };
  }

  return {
    found: true,
    artistName,
    normalized: match.normalized,
    name: match.name,
    tier: match.tier,
    score: match.score,
    eligibleForSeed: match.eligibleForSeed,
    components: {
      libraryPlaycount: match.libraryPlaycount,
      overallPlaycount: match.overallPlaycount,
      recentTrackCount: match.recentTrackCount,
      libraryScore: match.libraryScore,
      overallScore: match.overallScore,
      recentBoost: match.recentBoost
    }
  };
}