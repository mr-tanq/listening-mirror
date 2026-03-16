// concert-recommender.js
// FULL FILE REPLACE

import {
  normalizeArtistList,
  normalizeArtistName,
  normalizeText
} from "./artist-normalizer.js";

const PREFERRED_VENUES = new Set([
  "tivolivredenburg",
  "tivoli",
  "013",
  "paradiso",
  "patronaat",
  "effenaar",
  "melkweg",
  "paard",
  "doornroosje",
  "vera",
  "hedon"
]);

export function scoreConcerts(events, affinityMap) {
  const rows = Array.isArray(events) ? events : [];
  const scored = [];

  for (const event of rows) {
    scored.push(scoreSingleConcert(event, affinityMap));
  }

  scored.sort((a, b) => {
    if (b.recommendation_score !== a.recommendation_score) {
      return b.recommendation_score - a.recommendation_score;
    }

    const da = String(a.date_local || "");
    const db = String(b.date_local || "");
    if (da !== db) return da.localeCompare(db);

    return String(a.title || "").localeCompare(String(b.title || ""));
  });

  return scored;
}

export function filterRecommendedConcerts(scored, options = {}) {
  const minScore = Number.isFinite(options.minScore) ? options.minScore : 0.12;
  const includeWeakSignals = Boolean(options.includeWeakSignals);

  return (Array.isArray(scored) ? scored : []).filter((item) => {
    if ((item.recommendation_score || 0) >= minScore) return true;
    if (includeWeakSignals && item.match_type !== "no_match") return true;
    return false;
  });
}

function scoreSingleConcert(event, affinityMap) {
  const artists = collectEventArtists(event);
  const why = [];

  let bestArtist = null;
  let bestAffinity = 0;
  let bestStrength = "none";

  for (const artist of artists) {
    const hit = affinityMap instanceof Map ? affinityMap.get(artist.normalized) : null;

    if (hit) {
      const affinity = Number(hit.affinity || 0);

      if (affinity > bestAffinity) {
        bestAffinity = affinity;
        bestArtist = hit.name || artist.pretty;
        bestStrength = "exact";
      }
      continue;
    }

    const fuzzy = findFuzzyAffinity(artist.normalized, affinityMap);
    if (fuzzy && fuzzy.affinity > bestAffinity) {
      bestAffinity = fuzzy.affinity;
      bestArtist = fuzzy.name || artist.pretty;
      bestStrength = fuzzy.kind;
    }
  }

  let score = 0;

  if (bestStrength === "exact") {
    score += 0.65 + bestAffinity * 0.35;
    why.push(`matched_artist:${bestArtist}`);
  } else if (bestStrength === "contains") {
    score += 0.40 + bestAffinity * 0.25;
    why.push(`partial_artist_match:${bestArtist}`);
  } else if (bestStrength === "token") {
    score += 0.24 + bestAffinity * 0.20;
    why.push(`token_artist_match:${bestArtist}`);
  }

  if (bestArtist && bestAffinity >= 0.55) {
    why.push("core_artist_history");
  } else if (bestArtist && bestAffinity >= 0.35) {
    why.push("strong_artist_history");
  } else if (bestArtist && bestAffinity > 0) {
    why.push("heard_this_artist_before");
  }

  if ((artists.length || 0) > 1 && bestArtist) {
    score += 0.03;
    why.push("multi_artist_event");
  }

  const venueNorm = normalizeArtistName(event?.venue_name || "");
  if (bestArtist && venueNorm && PREFERRED_VENUES.has(venueNorm)) {
    score += 0.02;
    why.push("preferred_venue");
  }

  score = clamp(round3(score), 0, 1);

  const recommendationTier =
    score >= 0.55 ? "high" :
    score >= 0.35 ? "medium" :
    score >= 0.18 ? "light" :
    "none";

  const matchType =
    bestStrength === "exact" ? "strong_match" :
    bestStrength === "contains" ? "medium_match" :
    bestStrength === "token" ? "light_match" :
    "no_match";

  return {
    ...event,
    recommendation_score: score,
    match_type: matchType,
    matched_artist: bestArtist,
    recommendation_tier: recommendationTier,
    why
  };
}

function collectEventArtists(event) {
  const list = [];

  const title = normalizeText(event?.title || "");
  const artistsMain = normalizeText(event?.artists_main || "");
  const rawTitle = normalizeText(event?.raw_title || "");

  list.push(...normalizeArtistList(event?.artists_all || []));
  if (artistsMain) list.push(...normalizeArtistList(artistsMain));
  if (title) list.push(...normalizeArtistList(title));
  if (rawTitle) list.push(...normalizeArtistList(rawTitle));

  const seen = new Set();
  const unique = [];

  for (const item of list) {
    if (!item?.normalized) continue;
    if (seen.has(item.normalized)) continue;
    seen.add(item.normalized);
    unique.push(item);
  }

  return unique;
}

function findFuzzyAffinity(target, affinityMap) {
  if (!target || !(affinityMap instanceof Map)) return null;

  let best = null;

  for (const [normalized, value] of affinityMap.entries()) {
    if (!normalized) continue;

    if (normalized.includes(target) || target.includes(normalized)) {
      const minLen = Math.min(normalized.length, target.length);
      if (minLen >= 5) {
        const candidate = {
          kind: "contains",
          name: value.name,
          affinity: Number(value.affinity || 0)
        };

        if (!best || candidate.affinity > best.affinity) {
          best = candidate;
        }
        continue;
      }
    }

    const tokenScore = tokenOverlap(target, normalized);
    if (tokenScore >= 0.75) {
      const candidate = {
        kind: "token",
        name: value.name,
        affinity: Number(value.affinity || 0) * tokenScore
      };

      if (!best || candidate.affinity > best.affinity) {
        best = candidate;
      }
    }
  }

  return best;
}

function tokenOverlap(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);

  if (!ta.size || !tb.size) return 0;

  let shared = 0;
  for (const token of ta) {
    if (tb.has(token)) shared += 1;
  }

  return shared / Math.max(ta.size, tb.size);
}

function tokenize(input) {
  return new Set(
    normalizeArtistName(input)
      .split(/\s+/)
      .map((x) => x.trim())
      .filter((x) => x && x.length >= 2)
  );
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}