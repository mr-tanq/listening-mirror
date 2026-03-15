// lastfm-client.js
// Listening Mirror — Last.fm client

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

  const [topArtistsShort, topArtistsMedium, topArtistsLong, recentTracks] =
    await Promise.all([
      fetchTopArtists({ apiKey, username, period: "1month", limit: 100 }),
      fetchTopArtists({ apiKey, username, period: "6month", limit: 100 }),
      fetchTopArtists({ apiKey, username, period: "overall", limit: 150 }),
      fetchRecentTracks({ apiKey, username, limit: 200 })
    ]);

  return {
    topArtistsShort,
    topArtistsMedium,
    topArtistsLong,
    recentTracks
  };
}

async function fetchTopArtists({ apiKey, username, period, limit }) {
  const url = new URL(LASTFM_BASE);
  url.searchParams.set("method", "user.gettopartists");
  url.searchParams.set("user", username);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("period", period);
  url.searchParams.set("limit", String(limit));

  const data = await fetchJson(url.toString());

  const artists = data?.topartists?.artist || [];

  return artists.map((artist) => ({
    name: artist?.name || "",
    playcount: Number(artist?.playcount || 0)
  })).filter((artist) => artist.name);
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

  return tracks.map((track) => ({
    name: track?.name || "",
    artist: {
      name:
        track?.artist?.["#text"] ||
        track?.artist?.name ||
        ""
    },
    album: track?.album?.["#text"] || "",
    nowplaying: track?.["@attr"]?.nowplaying === "true"
  })).filter((track) => track.artist.name && track.name);
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
export function summarizeLastfmProfile(profile) {
  return {
    shortCount: profile?.topArtistsShort?.length || 0,
    mediumCount: profile?.topArtistsMedium?.length || 0,
    longCount: profile?.topArtistsLong?.length || 0,
    recentCount: profile?.recentTracks?.length || 0
  };
}