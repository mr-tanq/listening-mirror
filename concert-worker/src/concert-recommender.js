/* concert-recommender.js
   Listening Mirror — Concert Recommender
   FULL FILE REPLACE
*/

export function scoreConcerts(concerts = [], affinityMap = {}) {
  const scored = [];

  for (const concert of concerts) {
    const scoredConcert = scoreSingleConcert(concert, affinityMap);
    if (!scoredConcert) continue;
    scored.push(scoredConcert);
  }

  return scored.sort((a, b) => {
    if (b.recommendation_score !== a.recommendation_score) {
      return b.recommendation_score - a.recommendation_score;
    }

    return String(a.date_local || "").localeCompare(String(b.date_local || ""));
  });
}

export function scoreSingleConcert(concert, affinityMap = {}) {
  if (!concert || !concert.title) return null;

  const candidateNames = buildCandidateNames(concert);
  const matches = [];

  for (const candidate of candidateNames) {
    const hit = affinityMap[candidate];
    if (hit) {
      matches.push(hit);
    }
  }

  const bestMatch = pickBestMatch(matches);

  const artistAffinity = bestMatch ? bestMatch.affinity : 0;
  const totalWeight = bestMatch ? normalizeTotal(bestMatch.total) : 0;
  const recentWeight = bestMatch ? normalizeRecent(bestMatch.recent) : 0;

  const titleBoost = hasMultiArtistTitle(concert.raw_title || concert.title) ? 0.03 : 0;
  const venueBoost = venuePreferenceBoost(concert.venue_name || "");
  const recencyPenalty = isPastConcert(concert.date_local) ? -0.4 : 0;

  let recommendationScore =
    artistAffinity * 0.72 +
    totalWeight * 0.12 +
    recentWeight * 0.08 +
    titleBoost +
    venueBoost +
    recencyPenalty;

  recommendationScore = clamp01(recommendationScore);

  const reasons = buildReasons({
    bestMatch,
    concert,
    totalWeight,
    recentWeight,
    titleBoost,
    venueBoost
  });

  return {
    ...concert,
    recommendation_score: round3(recommendationScore),
    match_type: classifyMatchType(recommendationScore, bestMatch),
    matched_artist: bestMatch ? bestMatch.name : null,
    why: reasons
  };
}

function buildCandidateNames(concert) {
  const set = new Set();

  const push = (value) => {
    const normalizedValues = expandCandidateVariants(value);
    for (const norm of normalizedValues) {
      if (norm) set.add(norm);
    }
  };

  push(concert.title);
  push(concert.artists_main);

  if (Array.isArray(concert.artists_all)) {
    concert.artists_all.forEach(push);
  }

  if (concert.raw_title) {
    splitArtistsFromRawTitle(concert.raw_title).forEach(push);
  }

  return Array.from(set);
}
function expandCandidateVariants(value) {
  const original = String(value || "").trim();
  if (!original) return [];

  const variants = new Set();

  const cleaned = cleanArtistNoise(original);
  const normalized = normalizeArtistKey(cleaned);
  if (normalized) variants.add(normalized);

  for (const part of splitArtistsFromRawTitle(cleaned)) {
    const n = normalizeArtistKey(part);
    if (n) variants.add(n);
  }

  return Array.from(variants);
}

function splitArtistsFromRawTitle(rawTitle) {
  return String(rawTitle || "")
    .split(/\s+\+\s+|\s*&\s*|\s*,\s*|\/| \| | featuring | feat\. | ft\. /i)
    .map((x) => cleanArtistNoise(x))
    .map((x) => x.trim())
    .filter(Boolean);
}

function cleanArtistNoise(value) {
  return String(value || "")
    .replace(/^ga naar:\s*/i, "")
    .replace(/^geannuleerd:\s*/i, "")
    .replace(/^cancelled:\s*/i, "")
    .replace(/^canceled:\s*/i, "")
    .replace(/^verplaatst:\s*/i, "")
    .replace(/^uitverkocht:\s*/i, "")
    .replace(/^sold out:\s*/i, "")
    .replace(/^tickets?:\s*/i, "")
    .replace(/^ticketinfo:\s*/i, "")
    .replace(/^nieuw:\s*/i, "")
    .replace(/^new:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickBestMatch(matches) {
  if (!matches.length) return null;
  return matches.sort((a, b) => b.affinity - a.affinity)[0];
}

function normalizeArtistKey(name) {
  return cleanArtistNoise(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/\blive\b/gi, " ")
    .replace(/\bconcert\b/gi, " ")
    .replace(/[:"'`´’]/g, " ")
    .replace(/[#]|&amp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTotal(total) {
  if (!total) return 0;
  const capped = Math.min(total, 1000);
  return Math.log(capped + 1) / Math.log(1001);
}

function normalizeRecent(recent) {
  if (!recent) return 0;
  const capped = Math.min(recent, 50);
  return capped / 50;
}

function hasMultiArtistTitle(rawTitle) {
  const t = String(rawTitle || "").toLowerCase();
  return (
    t.includes(" + ") ||
    t.includes("&") ||
    t.includes(" feat.") ||
    t.includes(" ft.") ||
    t.includes(" featuring ")
  );
}

function venuePreferenceBoost(venueName) {
  const v = String(venueName || "").toLowerCase();

  const preferred = [
    "013",
    "paradiso",
    "melkweg",
    "tivolivredenburg",
    "doornroosje",
    "patronaat",
    "paard",
    "effenaar",
    "fluor"
  ];

  return preferred.some((x) => v.includes(x)) ? 0.02 : 0;
}

function isPastConcert(dateLocal) {
  if (!dateLocal) return false;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;

  return String(dateLocal) < todayStr;
}
function buildReasons({
  bestMatch,
  concert,
  totalWeight,
  recentWeight,
  titleBoost,
  venueBoost
}) {
  const reasons = [];

  if (bestMatch) {
    reasons.push(`matched_artist:${bestMatch.name}`);
  }

  if (bestMatch?.total >= 5 && bestMatch?.total < 50) {
    reasons.push("heard_this_artist_before");
  }

  if (bestMatch?.total >= 50 && bestMatch?.total < 200) {
    reasons.push("strong_artist_history");
  }

  if (bestMatch?.total >= 200) {
    reasons.push("core_artist_history");
  }

  if (bestMatch?.recent >= 5 && bestMatch?.recent < 15) {
    reasons.push("recent_interest");
  }

  if (bestMatch?.recent >= 15) {
    reasons.push("current_rotation");
  }

  if (totalWeight >= 0.8) {
    reasons.push("high_total_scrobbles");
  }

  if (recentWeight >= 0.5) {
    reasons.push("high_recent_activity");
  }

  if (titleBoost > 0) {
    reasons.push("multi_artist_event");
  }

  if (venueBoost > 0) {
    reasons.push("preferred_venue");
  }

  if (!bestMatch) {
    reasons.push("no_direct_match_yet");
  }

  return reasons;
}

function classifyMatchType(score, bestMatch) {
  if (!bestMatch && score < 0.2) return "weak_signal";
  if (!bestMatch) return "discovery_candidate";

  if (score >= 0.8) return "exact_high_priority";
  if (score >= 0.55) return "strong_match";
  if (score >= 0.3) return "medium_match";
  return "light_match";
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

export function filterRecommendedConcerts(scoredConcerts = [], options = {}) {
  const {
    minScore = 0.18,
    includeWeakSignals = false
  } = options;

  return scoredConcerts.filter((item) => {
    if (!item) return false;
    if (includeWeakSignals) return true;
    return (item.recommendation_score || 0) >= minScore;
  });
}