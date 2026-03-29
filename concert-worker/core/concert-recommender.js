import {
  buildLastfmTasteProfile,
  summarizeTasteProfile
} from "./lastfm-profile.js";

import {
  buildLastfmRelatedProfile,
  summarizeRelatedProfile
} from "./lastfm-related.js";

import {
  scoreConcertEvents,
  summarizeScoredConcerts
} from "./concert-matcher.js";

export async function buildConcertRecommendations(env, events, options = {}) {
  const {
    matcher = {},
    related = {}
  } = options;

  const eventList = Array.isArray(events) ? events : [];

  const tasteProfile = await buildLastfmTasteProfile(env);
  const relatedProfile = await buildLastfmRelatedProfile(
    env,
    tasteProfile,
    related
  );

  const scoredEvents = scoreConcertEvents(
    eventList,
    tasteProfile,
    relatedProfile,
    matcher
  );

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      inputEventCount: eventList.length,
      outputEventCount: scoredEvents.length
    },
    profiles: {
      taste: tasteProfile,
      related: relatedProfile
    },
    summary: {
      taste: summarizeTasteProfile(tasteProfile),
      related: summarizeRelatedProfile(relatedProfile),
      concerts: summarizeScoredConcerts(scoredEvents)
    },
    events: scoredEvents
  };
}

export async function buildConcertRecommendationsLight(env, events, options = {}) {
  const result = await buildConcertRecommendations(env, events, options);

  return {
    meta: result.meta,
    summary: result.summary,
    events: result.events
  };
}
export function bucketRecommendedConcerts(scoredEvents) {
  const list = Array.isArray(scoredEvents) ? scoredEvents : [];

  const buckets = {
    top: [],
    strong: [],
    recommended: [],
    olderTaste: [],
    borderline: [],
    hidden: []
  };

  for (const event of list) {
    switch (event?.visibility) {
      case "top":
        buckets.top.push(event);
        break;
      case "strong":
        buckets.strong.push(event);
        break;
      case "recommended":
        buckets.recommended.push(event);
        break;
      case "older-taste":
        buckets.olderTaste.push(event);
        break;
      case "borderline":
        buckets.borderline.push(event);
        break;
      default:
        buckets.hidden.push(event);
        break;
    }
  }

  return buckets;
}

export function flattenVisibleRecommendations(buckets) {
  return [
    ...(Array.isArray(buckets?.top) ? buckets.top : []),
    ...(Array.isArray(buckets?.strong) ? buckets.strong : []),
    ...(Array.isArray(buckets?.recommended) ? buckets.recommended : []),
    ...(Array.isArray(buckets?.olderTaste) ? buckets.olderTaste : []),
    ...(Array.isArray(buckets?.borderline) ? buckets.borderline : [])
  ];
}

export function summarizeRecommendationBuckets(buckets) {
  return {
    top: countArray(buckets?.top),
    strong: countArray(buckets?.strong),
    recommended: countArray(buckets?.recommended),
    olderTaste: countArray(buckets?.olderTaste),
    borderline: countArray(buckets?.borderline),
    hidden: countArray(buckets?.hidden)
  };
}
export async function buildBucketedConcertRecommendations(env, events, options = {}) {
  const result = await buildConcertRecommendations(env, events, options);
  const buckets = bucketRecommendedConcerts(result.events);

  return {
    meta: result.meta,
    profiles: result.profiles,
    summary: {
      ...result.summary,
      buckets: summarizeRecommendationBuckets(buckets)
    },
    buckets,
    events: result.events
  };
}

export function filterRecommendationsByMinimum(scoredEvents, minimumVisibility = "recommended") {
  const list = Array.isArray(scoredEvents) ? scoredEvents : [];
  const minimumRank = visibilityRank(minimumVisibility);

  return list.filter((event) => visibilityRank(event?.visibility) <= minimumRank);
}

export function getTopRecommendationCandidates(scoredEvents, limit = 50) {
  const list = Array.isArray(scoredEvents) ? scoredEvents : [];

  return list
    .filter((event) => event?.visibility !== "hidden")
    .slice(0, limit)
    .map((event) => ({
      source: event.source,
      source_id: event.source_id,
      title: event.title,
      artists_main: event.artists_main,
      date_local: event.date_local,
      time_local: event.time_local,
      venue_name: event.venue_name,
      city: event.city,
      finalScore: event.finalScore,
      directScore: event.directScore,
      relatedScore: event.relatedScore,
      matchedBy: event.matchedBy,
      visibility: event.visibility,
      reasons: event.reasons
    }));
}
function visibilityRank(value) {
  switch (value) {
    case "top":
      return 1;
    case "strong":
      return 2;
    case "recommended":
      return 3;
    case "older-taste":
      return 4;
    case "borderline":
      return 5;
    default:
      return 99;
  }
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0;
}