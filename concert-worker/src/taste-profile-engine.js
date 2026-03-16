// taste-profile-engine.js
// FULL FILE REPLACE

import {
  normalizeArtistName,
  normalizeText
} from "./artist-normalizer.js";

export function buildTasteProfile(lastfmProfile) {
  const buckets = collectArtistBuckets(lastfmProfile);
  const map = new Map();

  for (const item of buckets) {
    const normalized = normalizeArtistName(item.name);
    if (!normalized) continue;

    const existing = map.get(normalized) || {
      name: normalizeText(item.name),
      total: 0,
      recent: 0,
      long: 0,
      library: 0,
      presence: 0,
      affinity: 0
    };

    existing.total += item.total || 0;
    existing.recent += item.recent || 0;
    existing.long += item.long || 0;
    existing.library += item.library || 0;

    map.set(normalized, existing);
  }

  let maxTotal = 1;
  let maxRecent = 1;
  let maxLibrary = 1;

  for (const value of map.values()) {
    if (value.total > maxTotal) maxTotal = value.total;
    if (value.recent > maxRecent) maxRecent = value.recent;
    if (value.library > maxLibrary) maxLibrary = value.library;
  }

  for (const value of map.values()) {
    const totalNorm = safeRatio(value.total, maxTotal);
    const recentNorm = safeRatio(value.recent, maxRecent);
    const libraryNorm = safeRatio(value.library, maxLibrary);

    const presence =
      (value.total > 0 ? 1 : 0) +
      (value.recent > 0 ? 1 : 0) +
      (value.library > 0 ? 1 : 0);

    value.presence = presence / 3;

    value.affinity =
      totalNorm * 0.55 +
      recentNorm * 0.25 +
      libraryNorm * 0.20;

    value.affinity = round4(value.affinity);
  }

  return map;
}

export function sortAffinityMap(affinityMap) {
  const rows = [];

  if (!(affinityMap instanceof Map)) return rows;

  for (const [normalized, value] of affinityMap.entries()) {
    rows.push({
      normalized,
      name: value.name,
      affinity: value.affinity,
      total: value.total,
      recent: value.recent,
      library: value.library,
      presence: value.presence
    });
  }

  rows.sort((a, b) => {
    if (b.affinity !== a.affinity) return b.affinity - a.affinity;
    if (b.total !== a.total) return b.total - a.total;
    return a.name.localeCompare(b.name);
  });

  return rows;
}

function collectArtistBuckets(profile) {
  const buckets = [];
  const recentWeight = 1.0;
  const longWeight = 1.0;
  const libraryWeight = 1.0;

  const recentArtists = pluckArtists(profile?.recentArtists || profile?.recent || []);
  const longArtists = pluckArtists(profile?.topArtistsLong || profile?.long || profile?.overall || []);
  const libraryArtists = pluckArtists(profile?.libraryArtists || profile?.library || []);

  for (const artist of recentArtists) {
    buckets.push({
      name: artist.name,
      total: 0,
      recent: toCount(artist.plays, 1) * recentWeight,
      long: 0,
      library: 0
    });
  }

  for (const artist of longArtists) {
    const count = toCount(artist.plays, artist.playcount || 1);
    buckets.push({
      name: artist.name,
      total: count * longWeight,
      recent: 0,
      long: count * longWeight,
      library: 0
    });
  }

  for (const artist of libraryArtists) {
    const count = toCount(artist.plays, artist.playcount || 1);
    buckets.push({
      name: artist.name,
      total: count * libraryWeight,
      recent: 0,
      long: 0,
      library: count * libraryWeight
    });
  }

  return buckets;
}

function pluckArtists(input) {
  if (Array.isArray(input)) {
    return input
      .map(normalizeArtistRecord)
      .filter((x) => x.name);
  }

  if (input && Array.isArray(input.artist)) {
    return input.artist
      .map(normalizeArtistRecord)
      .filter((x) => x.name);
  }

  if (input?.topartists?.artist && Array.isArray(input.topartists.artist)) {
    return input.topartists.artist
      .map(normalizeArtistRecord)
      .filter((x) => x.name);
  }

  return [];
}

function normalizeArtistRecord(item) {
  if (!item) return { name: "", plays: 0 };

  if (typeof item === "string") {
    return { name: item, plays: 1 };
  }

  return {
    name: normalizeText(
      item.name ||
      item.artist ||
      item.label ||
      ""
    ),
    plays: toCount(
      item.plays,
      item.playcount ||
      item.count ||
      item.scrobbles ||
      1
    )
  };
}

function toCount(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function safeRatio(a, b) {
  if (!b) return 0;
  return a / b;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}