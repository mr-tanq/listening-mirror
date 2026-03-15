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
    const key = name.toLowerCase();
    if (!artistMap.has(key)) {
      artistMap.set(key, {
        name,
        total: 0,
        recent: 0,
        long: false,
        medium: false,
        short: false
      });
    }
    return artistMap.get(key);
  }

  // LONG TERM
  topArtistsLong.forEach((a, i) => {
    const entry = ensureArtist(a.name);
    entry.total += Number(a.playcount || 0);
    entry.long = true;
  });

  // MEDIUM TERM
  topArtistsMedium.forEach((a) => {
    const entry = ensureArtist(a.name);
    entry.total += Number(a.playcount || 0);
    entry.medium = true;
  });

  // SHORT TERM
  topArtistsShort.forEach((a) => {
    const entry = ensureArtist(a.name);
    entry.total += Number(a.playcount || 0);
    entry.short = true;
  });

  // RECENT TRACKS
  recentTracks.forEach((t) => {
    const name = t.artist?.name || t.artist || "";
    if (!name) return;
    const entry = ensureArtist(name);
    entry.recent += 1;
  });

  const artists = Array.from(artistMap.values());

  if (!artists.length) {
    return {};
  }

  const maxTotal = Math.max(...artists.map(a => a.total));
  const maxRecent = Math.max(...artists.map(a => a.recent));
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

    affinityMap[a.name.toLowerCase()] = {
      name: a.name,
      affinity,
      total: a.total,
      recent: a.recent,
      presence
    };

  });
return affinityMap;
}



/* helper — sort artists by affinity */

export function sortAffinityMap(map) {
  return Object.values(map)
    .sort((a, b) => b.affinity - a.affinity);
}