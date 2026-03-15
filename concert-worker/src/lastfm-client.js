// lastfm-client.js
// Listening Mirror — Last.fm client
// FULL FILE REPLACE

const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";

export async function fetchLastfmProfile(env) {
  const apiKey = env.LASTFM_API_KEY;
  const username = env.LASTFM_USER;

  if (!apiKey) {
    throw new Error("Missing LASTFM_API_KEY");
  }

  if (!username) {
    throw new Error("Missing LASTFM_USER");
  }

  const [
    libraryArtists,
    topArtistsOverall,
    recentTracks
  ] = await Promise.all([
    fetchLibraryArtists({
      apiKey,
      username,
      perPage: 200,
      maxPages: 10
    }),
    fetchTopArtistsPaged({
      apiKey,
      username,
      period: "overall",
      perPage: 200,
      maxPages: 5
    }),
    fetchRecentTracks({
      apiKey,
      username,
      limit: 200
    })
  ]);

  return {
    libraryArtists,
    topArtistsOverall,
    topArtistsShort: [],
    topArtistsMedium: [],
    topArtistsLong: topArtistsOverall,
    recentTracks
  };
}

async function fetchLibraryArtists({ apiKey, username, perPage = 200, maxPages = 10 }) {
  const combined = new Map();

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(LASTFM_BASE);
    url.searchParams.set("method", "library.getartists");
    url.searchParams.set("user", username);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(perPage));
    url.searchParams.set("page", String(page));

    const data = await fetchJson(url.toString());
    const artists = data?.artists?.artist || [];

    for (const artist of artists) {
      const name = artist?.name || "";
      if (!name) continue;

      const key = normalizeKey(name);
      const playcount = Number(artist?.playcount || 0);

      const prev = combined.get(key);
      if (!prev || playcount > prev.playcount) {
        combined.set(key, {
          name,
          playcount
        });
      }
    }

    const attr = data?.artists?.["@attr"] || {};
    const totalPages = Number(attr?.totalPages || 0);

    if (!artists.length) break;
    if (totalPages && page >= totalPages) break;
  }

  return Array.from(combined.values()).sort((a, b) => b.playcount - a.playcount);
}

async function fetchTopArtistsPaged({
  apiKey,
  username,
  period = "overall",
  perPage = 200,
  maxPages = 5
}) {
  const combined = new Map();

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(LASTFM_BASE);
    url.searchParams.set("method", "user.gettopartists");
    url.searchParams.set("user", username);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("period", period);
    url.searchParams.set("limit", String(perPage));
    url.searchParams.set("page", String(page));

    const data = await fetchJson(url.toString());
    const artists = data?.topartists?.artist || [];

    for (const artist of artists) {
      const name = artist?.name || "";
      if (!name) continue;

      const key = normalizeKey(name);
      const playcount = Number(artist?.playcount || 0);

      const prev = combined.get(key);
      if (!prev || playcount > prev.playcount) {
        combined.set(key, {
          name,
          playcount
        });
      }
    }

    const attr = data?.topartists?.["@attr"] || {};
    const totalPages = Number(attr?.totalPages || 0);

    if (!artists.length) break;
    if (totalPages && page >= totalPages) break;
  }

  return Array.from(combined.values()).sort((a, b) => b.playcount - a.playcount);
}

async function fetchRecentTracks({ apiKey, username, limit }) {
  const url = new URL(LASTFM_BASE);
  url.searchParams.set("method", "user.getrecenttracks");
  url.searchParams.set("user", username);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));

  const data = await fetchJson(url.toString());
  const tracks = data?.recenttracks?.track || [];

  return tracks
    .map((track) => ({
      name: track?.name || "",
      artist: {
        name: track?.artist?.["#text"] || track?.artist?.name || ""
      },
      album: track?.album?.["#text"] || "",
      nowplaying: track?.["@attr"]?.nowplaying === "true"
    }))
    .filter((track) => track.artist.name && track.name);
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "ListeningMirrorConcertBot/1.0"
    }
  });

  if (!res.ok) {
    throw new Error(`Last.fm fetch failed ${res.status}`);
  }

  const data = await res.json();

  if (data?.error) {
    throw new Error(`Last.fm error: ${data.message || data.error}`);
  }

  return data;
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function summarizeLastfmProfile(profile) {
  return {
    libraryCount: profile?.libraryArtists?.length || 0,
    overallCount: profile?.topArtistsOverall?.length || 0,
    longCount: profile?.topArtistsLong?.length || 0,
    recentCount: profile?.recentTracks?.length || 0
  };
}