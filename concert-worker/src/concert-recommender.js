// concert-recommender.js
// FULL FILE REPLACE
// Strict taste-first recommender
//
// Goals:
// - NO date/soon bias
// - NO recommendation unless there is a real artist affinity match
// - Better artist normalization
// - Better multi-artist parsing
// - Small venue bonus only AFTER a real match exists

const PREFERRED_VENUES = new Set([
  "tivolivredenburg",
  "paradiso",
  "patronaat",
  "013",
  "effenaar",
  "melkweg",
  "paard",
  "doornroosje",
  "fluor",
  "vera",
  "hedon",
  "muziekgieterij",
  "boerderij"
]);

const STOP_TOKENS = new Set([
  "ga",
  "naar",
  "present",
  "presenteert",
  "presents",
  "presented",
  "with",
  "w",
  "special",
  "guest",
  "guests",
  "support",
  "plus",
  "feat",
  "featuring",
  "ft",
  "and",
  "the",
  "a",
  "an",
  "concert",
  "live",
  "tour",
  "world",
  "show",
  "session",
  "sessions",
  "festival",
  "podcast"
]);

export function scoreConcerts(events, affinityMap) {
  const safeEvents = Array.isArray(events) ? events : [];
  const safeAffinityMap = affinityMap instanceof Map ? affinityMap : new Map();

  return safeEvents
    .map((event) => scoreSingleConcert(event, safeAffinityMap))
    .sort(sortScoredConcerts);
}

export function filterRecommendedConcerts(scoredConcerts, options = {}) {
  const safe = Array.isArray(scoredConcerts) ? scoredConcerts : [];
  const minScore = clamp01(
    Number.isFinite(options?.minScore) ? options.minScore : 0.18
  );

  return safe.filter((item) => {
    if (!item) return false;
    if (!item.matched_artist) return false;
    if (!Number.isFinite(item.recommendation_score)) return false;
    return item.recommendation_score >= minScore;
  });
}

function scoreSingleConcert(event, affinityMap) {
  const candidates = extractArtistCandidates(event);
  const best = findBestAffinityMatch(candidates, affinityMap);

  const why = [];
  let score = 0;

  if (best) {
    score += best.score;
    why.push(`matched_artist:${best.display}`);

    if (best.score >= 0.55) {
      why.push("core_artist_history");
    } else if (best.score >= 0.35) {
      why.push("strong_artist_history");
    } else {
      why.push("heard_this_artist_before");
    }

    if ((Array.isArray(event?.artists_all) ? event.artists_all.length : 0) > 1) {
      score += 0.02;
      why.push("multi_artist_event");
    }

    if (isPreferredVenue(event?.venue_name)) {
      score += 0.03;
      why.push("preferred_venue");
    }
  }

  score = clamp01(round3(score));

  return {
    ...event,
    recommendation_score: score,
    match_type: score >= 0.55
      ? "strong_match"
      : score >= 0.30
        ? "medium_match"
        : score > 0
          ? "light_match"
          : "no_match",
    matched_artist: best ? best.display : null,
    recommendation_tier: best
      ? score >= 0.55
        ? "core"
        : score >= 0.30
          ? "strong"
          : "light"
      : "none",
    why
  };
}
function findBestAffinityMatch(candidates, affinityMap) {
  let best = null;

  for (const rawCandidate of candidates) {
    const candidate = String(rawCandidate || "").trim();
    if (!candidate) continue;

    const exact = getAffinityForCandidate(candidate, affinityMap);
    if (exact) {
      if (!best || exact.score > best.score) {
        best = exact;
      }
    }
  }

  return best;
}

function getAffinityForCandidate(candidate, affinityMap) {
  const normalized = normalizeArtist(candidate);
  if (!normalized) return null;

  // 1) exact normalized
  if (affinityMap.has(normalized)) {
    return {
      key: normalized,
      display: candidate,
      score: normalizeAffinityScore(affinityMap.get(normalized))
    };
  }

  // 2) exact after aggressive cleanup
  const aggressive = aggressivelyNormalizeArtist(candidate);
  if (aggressive && affinityMap.has(aggressive)) {
    return {
      key: aggressive,
      display: candidate,
      score: normalizeAffinityScore(affinityMap.get(aggressive))
    };
  }

  // 3) contains fallback for long artist names
  // important for bands like "Villagers of Ioannina City"
  for (const [affinityKey, rawScore] of affinityMap.entries()) {
    if (!affinityKey) continue;

    if (
      normalized === affinityKey ||
      aggressive === affinityKey ||
      normalized.includes(affinityKey) ||
      affinityKey.includes(normalized) ||
      (aggressive && aggressive.includes(affinityKey)) ||
      (aggressive && affinityKey.includes(aggressive))
    ) {
      return {
        key: affinityKey,
        display: candidate,
        score: normalizeAffinityScore(rawScore) * 0.97
      };
    }
  }

  return null;
}

function extractArtistCandidates(event) {
  const out = [];
  const seen = new Set();

  const push = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return;

    const n = normalizeArtist(raw);
    if (!n || seen.has(n)) return;

    seen.add(n);
    out.push(raw);
  };

  push(event?.artists_main);
  push(event?.title);
  push(event?.raw_title);

  if (Array.isArray(event?.artists_all)) {
    for (const item of event.artists_all) {
      push(item);
    }
  }

  const splitSources = [
    event?.raw_title,
    event?.title,
    event?.artists_main
  ];

  for (const source of splitSources) {
    for (const part of splitArtistLine(source)) {
      push(part);
    }
  }

  return out;
}

function splitArtistLine(value) {
  const text = decodeEntities(String(value || "").trim());
  if (!text) return [];

  const separators = [
    " + ",
    " & ",
    " x ",
    " / ",
    " • ",
    " , ",
    ", ",
    " | ",
    " feat. ",
    " feat ",
    " ft. ",
    " ft ",
    " featuring ",
    " support ",
    " special guest "
  ];

  let parts = [text];

  for (const sep of separators) {
    parts = parts.flatMap((part) => String(part).split(sep));
  }

  return parts
    .map((part) => cleanupSplitPart(part))
    .filter(Boolean);
}

function cleanupSplitPart(value) {
  let s = decodeEntities(String(value || "").trim());
  if (!s) return "";

  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\[[^\]]*\]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  if (!s) return "";

  const tokens = s.split(" ").filter(Boolean);
  const useful = tokens.filter((t) => !STOP_TOKENS.has(normalizeToken(t)));

  if (!useful.length) return "";
  return useful.join(" ").trim();
}
function normalizeArtist(value) {
  let s = decodeEntities(String(value || "").trim().toLowerCase());
  if (!s) return "";

  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/&#\d+;/g, " ");
  s = s.replace(/&[a-z0-9#]+;/gi, " ");
  s = s.replace(/[’'`]/g, "");
  s = s.replace(/[:;!?]/g, " ");
  s = s.replace(/[(){}\[\]]/g, " ");
  s = s.replace(/[|]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

function aggressivelyNormalizeArtist(value) {
  let s = normalizeArtist(value);
  if (!s) return "";

  s = s
    .replace(/\bga naar\b/g, " ")
    .replace(/\bpresents?\b/g, " ")
    .replace(/\bpresenteert\b/g, " ")
    .replace(/\bpodcast\b/g, " ")
    .replace(/\blive\b/g, " ")
    .replace(/\bconcert\b/g, " ")
    .replace(/\btour\b/g, " ")
    .replace(/\bworld\b/g, " ")
    .replace(/\bshow\b/g, " ")
    .replace(/\bsession(s)?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return s;
}

function normalizeAffinityScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;

  // assumes affinity map roughly in 0..1 already,
  // but clamps safely if slightly above/below
  return clamp01(round3(n));
}

function isPreferredVenue(value) {
  const normalized = normalizeArtist(value);
  return PREFERRED_VENUES.has(normalized);
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&#038;|&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function sortScoredConcerts(a, b) {
  const scoreDiff = Number(b?.recommendation_score || 0) - Number(a?.recommendation_score || 0);
  if (scoreDiff !== 0) return scoreDiff;

  const aDate = String(a?.date_local || "");
  const bDate = String(b?.date_local || "");
  if (aDate !== bDate) return aDate.localeCompare(bDate);

  const aTitle = String(a?.title || "");
  const bTitle = String(b?.title || "");
  return aTitle.localeCompare(bTitle);
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}