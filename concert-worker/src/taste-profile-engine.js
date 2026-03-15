/* taste-profile-engine.js
   Listening Mirror — Taste Profile Engine
   FULL FILE REPLACE
*/

export function buildTasteProfile({
  topArtistsLong = [],
  topArtistsMedium = [],
  topArtistsShort = [],
  recentTracks = []
}) {
  const artistMap = new Map();

  function ensureArtist(name) {
    const cleanName = String(name || "").trim();
    if (!cleanName) return null;

    const key = normalizeArtistKey(cleanName);

    if (!key) return null;

    if (!artistMap.has(key)) {
      artistMap.set(key, {
        key,
        name: cleanName,
        total: 0,
        recent: 0,
        long: false,
        medium: false,
        short: false
      });
    }

    return artistMap.get(key);
  }

  topArtistsLong.forEach((a) => {
    const entry = ensureArtist(a?.name);
    if (!entry) return;
    entry.total += Number(a?.playcount || 0);
    entry.long = true;
  });

  topArtistsMedium.forEach((a) => {
    const entry = ensureArtist(a?.name);
    if (!entry) return;
    entry.total += Number(a?.playcount || 0);
    entry.medium = true;
  });

  topArtistsShort.forEach((a) => {
    const entry = ensureArtist(a?.name);
    if (!entry) return;
    entry.total += Number(a?.playcount || 0);
    entry.short = true;
  });

  recentTracks.forEach((t) => {
    const name = t?.artist?.name || t?.artist || "";
    const entry = ensureArtist(name);
    if (!entry) return;
    entry.recent += 1;
  });

  const artists = Array.from(artistMap.values());

  if (!artists.length) {
    return {};
  }

  const maxTotal = Math.max(...artists.map((a) => a.total), 1);
  const maxRecent = Math.max(...artists.map((a) => a.recent), 1);

  function logNormalize(value, max) {
    if (!max) return 0;
    return Math.log(value + 1) / Math.log(max + 1);
  }

  function linearNormalize(value, max) {
    if (!max) return 0;
    return value / max;
  }

  function corePresenceScore(a) {
    let score = 0;
    if (a.long) score += 0.15;
    if (a.medium) score += 0.1;
    if (a.short) score += 0.1;
    return Math.min(score, 0.35);
  }

  const affinityMap = {};

  artists.forEach((a) => {
    const totalScore = logNormalize(a.total, maxTotal);
    const recentScore = linearNormalize(a.recent, maxRecent);
    const presence = corePresenceScore(a);

    let affinity =
      totalScore * 0.6 +
      recentScore * 0.25 +
      presence * 0.15;

    if (a.recent >= 15) {
      affinity *= 1.08;
    }

    if (a.recent >= 30) {
      affinity *= 1.15;
    }

    affinity = Math.max(0, Math.min(1, affinity));

    affinityMap[a.key] = {
      name: a.name,
      affinity,
      total: a.total,
      recent: a.recent,
      presence
    };
  });

  return affinityMap;
}

function normalizeArtistKey(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/[:"'`´’]/g, " ")
    .replace(/\blive\b/gi, " ")
    .replace(/\bconcert\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* helper — sort artists by affinity */
export function sortAffinityMap(map) {
  return Object.values(map).sort((a, b) => b.affinity - a.affinity);
}