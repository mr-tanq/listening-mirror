export function scoreConcertEvents(events, tasteProfile, relatedProfile, options = {}) {
  const list = Array.isArray(events) ? events : [];

  const {
    minFinalScore = 20,
    includeHidden = false
  } = options;

  const scored = list.map((event) => scoreConcertEvent(event, tasteProfile, relatedProfile));

  const filtered = includeHidden
    ? scored
    : scored.filter((event) => event.finalScore >= minFinalScore);

  return filtered.sort(compareScoredConcerts);
}

export function scoreConcertEvent(event, tasteProfile, relatedProfile) {
  const normalizedCandidates = extractNormalizedArtistCandidates(event);

  const directMatches = normalizedCandidates
    .map((candidate) => {
      const match = getDirectMatch(candidate.normalized, tasteProfile);
      if (!match) return null;

      return {
        candidate,
        match
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      return b.match.score - a.match.score || a.candidate.raw.localeCompare(b.candidate.raw);
    });

  const relatedMatches = normalizedCandidates
    .map((candidate) => {
      const match = getRelatedMatch(candidate.normalized, relatedProfile);
      if (!match) return null;

      return {
        candidate,
        match
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      return b.match.score - a.match.score || a.candidate.raw.localeCompare(b.candidate.raw);
    });

  const bestDirect = directMatches[0] || null;
  const bestRelated = relatedMatches[0] || null;

  const directScore = bestDirect?.match?.score || 0;
  const relatedScore = bestRelated?.match?.score || 0;

  const directWeighted = directScore;
  const relatedWeighted = roundTo(relatedScore * 0.85, 2);

  const finalScore = clampScore(Math.max(directWeighted, relatedWeighted));

  const matchType = resolveMatchType({
    directScore,
    relatedScore
  });

  const reasons = buildReasons({
    bestDirect,
    bestRelated
  });

  return {
    ...event,
    artist_candidates: normalizedCandidates.map((candidate) => candidate.raw),

    directScore,
    directTier: bestDirect?.match?.tier || null,
    directMatchedArtist: bestDirect?.match?.name || null,
    directMatchedNormalized: bestDirect?.match?.normalized || null,

    relatedScore,
    relatedTier: bestRelated?.match?.tier || null,
    relatedMatchedArtist: bestRelated?.match?.name || null,
    relatedMatchedNormalized: bestRelated?.match?.normalized || null,

    matchedBy: matchType.matchedBy,
    matchedArtist: matchType.matchedArtist,
    matchedTier: matchType.matchedTier,

    finalScore,
    visibility: classifyVisibility({
      finalScore,
      directScore,
      relatedScore
    }),

    reasons
  };
}

function resolveMatchType({ directScore, relatedScore }) {
  if (directScore > 0 && directScore >= relatedScore * 0.85) {
    return {
      matchedBy: "direct",
      matchedArtist: null,
      matchedTier: null
    };
  }

  if (relatedScore > 0) {
    return {
      matchedBy: "related",
      matchedArtist: null,
      matchedTier: null
    };
  }

  return {
    matchedBy: null,
    matchedArtist: null,
    matchedTier: null
  };
}
function buildReasons({ bestDirect, bestRelated }) {
  const reasons = [];

  if (bestDirect) {
    const tierLabel = directTierLabel(bestDirect.match.tier);

    if (tierLabel) {
      reasons.push(`${tierLabel}: ${bestDirect.match.name}`);
    } else {
      reasons.push(`Direct match: ${bestDirect.match.name}`);
    }

    if (bestDirect.match.libraryPlaycount > 0) {
      reasons.push(`Library plays: ${bestDirect.match.libraryPlaycount}`);
    }

    if (bestDirect.match.overallPlaycount > 0) {
      reasons.push(`Overall top plays: ${bestDirect.match.overallPlaycount}`);
    }

    if (bestDirect.match.recentTrackCount > 0) {
      reasons.push(`Recent listens: ${bestDirect.match.recentTrackCount}`);
    }
  }

  if (bestRelated) {
    const topSources = Array.isArray(bestRelated.match.sources)
      ? bestRelated.match.sources.slice(0, 3)
      : [];

    if (topSources.length) {
      const sourceNames = topSources.map((source) => source.name).filter(Boolean);
      if (sourceNames.length) {
        reasons.push(`Similar to: ${sourceNames.join(", ")}`);
      }
    } else {
      reasons.push(`Related recommendation: ${bestRelated.match.name}`);
    }
  }

  return uniqueStrings(reasons);
}

function classifyVisibility({ finalScore, directScore, relatedScore }) {
  if (directScore >= 70) return "top";
  if (directScore >= 35) return "strong";
  if (relatedScore >= 50) return "recommended";
  if (directScore >= 8) return "older-taste";
  if (relatedScore >= 25) return "recommended";
  if (finalScore >= 20) return "borderline";
  return "hidden";
}

function directTierLabel(tier) {
  if (tier === "A") return "Top match";
  if (tier === "B") return "Known artist";
  if (tier === "C") return "Older taste";
  return null;
}

function getDirectMatch(normalized, tasteProfile) {
  if (!normalized) return null;
  return tasteProfile?.directArtists?.[normalized] || null;
}

function getRelatedMatch(normalized, relatedProfile) {
  if (!normalized) return null;
  return relatedProfile?.relatedArtists?.[normalized] || null;
}

function compareScoredConcerts(a, b) {
  const scoreDiff = (b.finalScore || 0) - (a.finalScore || 0);
  if (scoreDiff !== 0) return scoreDiff;

  const dateA = `${a.date_local || ""} ${a.time_local || "99:99"}`;
  const dateB = `${b.date_local || ""} ${b.time_local || "99:99"}`;
  const dateCmp = dateA.localeCompare(dateB);
  if (dateCmp !== 0) return dateCmp;

  return String(a.title || "").localeCompare(String(b.title || ""));
}
function extractNormalizedArtistCandidates(event) {
  const rawCandidates = [];

  if (event?.artists_main) {
    rawCandidates.push(event.artists_main);
  }

  if (event?.title) {
    rawCandidates.push(event.title);
  }

  if (event?.raw_title) {
    rawCandidates.push(event.raw_title);
  }

  if (Array.isArray(event?.artists_all)) {
    for (const artist of event.artists_all) {
      rawCandidates.push(artist);
    }
  }

  const splitCandidates = rawCandidates
    .flatMap((value) => splitPotentialArtists(value))
    .map(cleanText)
    .filter(Boolean);

  const unique = new Map();

  for (const raw of splitCandidates) {
    const normalized = normalizeArtistKey(raw);
    if (!normalized) continue;

    if (!unique.has(normalized)) {
      unique.set(normalized, {
        raw,
        normalized
      });
    }
  }

  return Array.from(unique.values());
}

function splitPotentialArtists(value) {
  const text = cleanText(value);
  if (!text) return [];

  const stripped = stripEventSuffixes(text);

  const parts = stripped
    .split(/\s+(?:\+|\/|&|and|with|w\/)\s+/i)
    .map(cleanText)
    .filter(Boolean);

  return parts.length ? parts : [stripped];
}

function stripEventSuffixes(value) {
  return cleanText(value)
    .replace(/\s+@\s+.+$/i, "")
    .replace(/\s+-\s+at\s+.+$/i, "")
    .replace(/\s+at\s+.+$/i, "")
    .replace(/\s+\|\s+.+$/i, "")
    .replace(/\s+-\s+live\s+.+$/i, "")
    .replace(/\s+-\s+tour\s*$/i, "")
    .trim();
}

function normalizeArtistKey(value) {
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
export function summarizeScoredConcerts(scoredEvents) {
  const list = Array.isArray(scoredEvents) ? scoredEvents : [];

  const byVisibility = Object.create(null);
  const byMatchedBy = Object.create(null);

  for (const event of list) {
    const visibility = event?.visibility || "unknown";
    const matchedBy = event?.matchedBy || "none";

    byVisibility[visibility] = (byVisibility[visibility] || 0) + 1;
    byMatchedBy[matchedBy] = (byMatchedBy[matchedBy] || 0) + 1;
  }

  return {
    total: list.length,
    byVisibility,
    byMatchedBy,
    topMatches: list.slice(0, 20).map((event) => ({
      title: event.title,
      source: event.source,
      date_local: event.date_local,
      venue_name: event.venue_name,
      city: event.city,
      finalScore: event.finalScore,
      directScore: event.directScore,
      relatedScore: event.relatedScore,
      matchedBy: event.matchedBy,
      visibility: event.visibility,
      reasons: event.reasons
    }))
  };
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];

  for (const value of values) {
    const v = cleanText(value);
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }

  return out;
}

function clampScore(score) {
  return roundTo(Math.min(100, Math.max(0, score)), 2);
}

function roundTo(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}