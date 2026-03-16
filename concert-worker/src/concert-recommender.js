// concert-recommender.js
// FULL FILE REPLACE

const PREFERRED_VENUES = new Set([
  "tivolivredenburg",
  "paradiso",
  "013",
  "patronaat",
  "melkweg",
  "effenaar",
  "paard",
  "doornroosje",
  "vera",
  "hedon",
  "fluor",
  "muziekgieterij",
  "boerderij"
]);

export function scoreConcerts(events, affinityMap) {
  const now = new Date();

  return (Array.isArray(events) ? events : [])
    .map((event) => scoreSingleConcert(event, affinityMap, now))
    .filter(Boolean)
    .sort(sortByRecommendation);
}

function scoreSingleConcert(event, affinityMap, now) {
  if (!event || !event.date_local) return null;

  const affinity = getBestAffinityForEvent(event, affinityMap);
  const matchedArtist = affinity?.matchedArtist || null;
  const matchedScore = clamp01(affinity?.score || 0);

  const why = [];

  if (matchedArtist) {
    why.push(`matched_artist:${matchedArtist}`);
  }

  let score = 0;

  // --- Core affinity from Last.fm / taste profile ---
  score += matchedScore * 0.62;

  if (matchedScore >= 0.75) {
    why.push("core_artist_history");
  } else if (matchedScore >= 0.45) {
    why.push("strong_artist_history");
  } else if (matchedScore >= 0.18) {
    why.push("heard_this_artist_before");
  }

  // --- Multi-artist small bonus ---
  const artistCount = Array.isArray(event.artists_all) ? event.artists_all.length : 0;
  if (artistCount >= 2) {
    score += 0.035;
    why.push("multi_artist_event");
  }

  // --- Venue preference bonus ---
  const venueKey = normalizeText(event.venue_name || "");
  if (PREFERRED_VENUES.has(venueKey)) {
    score += 0.04;
    why.push("preferred_venue");
  }

  // --- Date logic: do NOT kill far future, just classify it lower ---
  const daysAway = getDaysAway(event.date_local, now);

  if (daysAway !== null) {
    if (daysAway < 0) {
      score -= 0.25;
      why.push("past_event_penalty");
    } else if (daysAway <= 14) {
      score += 0.06;
      why.push("soon_event");
    } else if (daysAway <= 45) {
      score += 0.04;
      why.push("near_future_event");
    } else if (daysAway <= 120) {
      score += 0.015;
      why.push("future_event");
    } else if (daysAway <= 240) {
      score -= 0.015;
      why.push("far_future_event");
    } else {
      score -= 0.035;
      why.push("very_far_future_event");
    }
  }

  score = clamp01(score);

  const tier = classifyTier(score, matchedScore, daysAway);
  const matchType = classifyMatchType(score, matchedScore);

  return {
    ...event,
    recommendation_score: round3(score),
    match_type: matchType,
    matched_artist: matchedArtist,
    recommendation_tier: tier,
    why
  };
}
export function filterRecommendedConcerts(scoredConcerts, options = {}) {
  const {
    minScore = 0.12,
    includeWeakSignals = false,
    includeFarFuture = true,
    limitPerTier = 50,
    returnTiers = false
  } = options || {};

  const input = Array.isArray(scoredConcerts) ? scoredConcerts : [];

  const filtered = input.filter((item) => {
    if (!item) return false;
    if (!includeWeakSignals && (item.recommendation_score || 0) < minScore) return false;
    if (!includeFarFuture && item.recommendation_tier === "far_future") return false;
    return true;
  });

  if (!returnTiers) {
    return filtered.sort(sortByRecommendation);
  }

  const mustSee = [];
  const strong = [];
  const radar = [];
  const farFuture = [];

  for (const item of filtered.sort(sortByRecommendation)) {
    const tier = item.recommendation_tier || "radar";

    if (tier === "must_see") {
      if (mustSee.length < limitPerTier) mustSee.push(item);
      continue;
    }

    if (tier === "strong") {
      if (strong.length < limitPerTier) strong.push(item);
      continue;
    }

    if (tier === "radar") {
      if (radar.length < limitPerTier) radar.push(item);
      continue;
    }

    if (tier === "far_future") {
      if (farFuture.length < limitPerTier) farFuture.push(item);
    }
  }

  return {
    must_see: mustSee,
    strong,
    radar,
    far_future: farFuture
  };
}

function getBestAffinityForEvent(event, affinityMap) {
  const candidates = [];

  if (event.artists_main) candidates.push(String(event.artists_main));
  if (event.title) candidates.push(String(event.title));
  if (event.raw_title) candidates.push(...splitArtistish(String(event.raw_title)));

  if (Array.isArray(event.artists_all)) {
    for (const artist of event.artists_all) {
      candidates.push(String(artist));
    }
  }

  const seen = new Set();
  const uniqueCandidates = candidates
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .filter((x) => {
      const k = normalizeText(x);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  let best = {
    matchedArtist: null,
    score: 0
  };

  for (const candidate of uniqueCandidates) {
    const res = lookupAffinity(candidate, affinityMap);
    if (res.score > best.score) {
      best = {
        matchedArtist: res.matchedArtist || candidate,
        score: res.score
      };
    }
  }

  return best;
}

function lookupAffinity(name, affinityMap) {
  const key = normalizeText(name);
  if (!key) return { matchedArtist: null, score: 0 };

  // Map support
  if (affinityMap instanceof Map) {
    if (affinityMap.has(key)) {
      return normalizeAffinityValue(name, affinityMap.get(key));
    }

    for (const [storedKey, value] of affinityMap.entries()) {
      const nk = normalizeText(storedKey);
      if (!nk) continue;

      if (nk === key) return normalizeAffinityValue(storedKey, value);

      if (nk.includes(key) || key.includes(nk)) {
        const normalized = normalizeAffinityValue(storedKey, value);
        normalized.score *= 0.9;
        return normalized;
      }
    }
  }

  // Object support
  if (affinityMap && typeof affinityMap === "object") {
    if (Object.prototype.hasOwnProperty.call(affinityMap, key)) {
      return normalizeAffinityValue(name, affinityMap[key]);
    }

    for (const storedKey of Object.keys(affinityMap)) {
      const nk = normalizeText(storedKey);
      if (!nk) continue;

      if (nk === key) return normalizeAffinityValue(storedKey, affinityMap[storedKey]);

      if (nk.includes(key) || key.includes(nk)) {
        const normalized = normalizeAffinityValue(storedKey, affinityMap[storedKey]);
        normalized.score *= 0.9;
        return normalized;
      }
    }
  }

  return { matchedArtist: null, score: 0 };
}
function normalizeAffinityValue(name, value) {
  if (typeof value === "number") {
    return {
      matchedArtist: name,
      score: clamp01(value)
    };
  }

  if (value && typeof value === "object") {
    const raw =
      value.affinityScore ??
      value.score ??
      value.weight ??
      value.normalizedScore ??
      0;

    return {
      matchedArtist: value.artist || value.name || name,
      score: clamp01(Number(raw) || 0)
    };
  }

  return {
    matchedArtist: name,
    score: 0
  };
}

function classifyTier(score, matchedScore, daysAway) {
  if (score >= 0.50 && matchedScore >= 0.45) return "must_see";
  if (score >= 0.32 && matchedScore >= 0.22) return "strong";
  if (score >= 0.16) {
    if (daysAway !== null && daysAway > 120) return "far_future";
    return "radar";
  }
  return "far_future";
}

function classifyMatchType(score, matchedScore) {
  if (score >= 0.5 || matchedScore >= 0.6) return "strong_match";
  if (score >= 0.26 || matchedScore >= 0.25) return "medium_match";
  return "light_match";
}

function splitArtistish(text) {
  return String(text || "")
    .split(/\s+\+\s+|,|\/|&|•|·|\|/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&#038;/gi, "&")
    .replace(/&#039;/gi, "'")
    .replace(/&quot;/gi, '"')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDaysAway(dateLocal, now) {
  if (!dateLocal) return null;

  const d = new Date(`${dateLocal}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;

  const today = new Date(now);
  today.setHours(12, 0, 0, 0);

  const diff = d.getTime() - today.getTime();
  return Math.round(diff / 86400000);
}

function sortByRecommendation(a, b) {
  const scoreDiff = (b?.recommendation_score || 0) - (a?.recommendation_score || 0);
  if (scoreDiff !== 0) return scoreDiff;

  const dateA = String(a?.date_local || "");
  const dateB = String(b?.date_local || "");
  if (dateA !== dateB) return dateA.localeCompare(dateB);

  return String(a?.title || "").localeCompare(String(b?.title || ""));
}

function clamp01(n) {
  const x = Number(n) || 0;
  return Math.max(0, Math.min(1, x));
}

function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}