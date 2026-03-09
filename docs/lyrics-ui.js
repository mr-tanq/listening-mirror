/* lyrics-ui.js (FULL FILE REPLACE) — PART 1/2
   Listening Mirror — Lyrics bridge for the new main layout
   ✅ Writes directly into:
      - #currentLyricLine
      - #currentLyricMeta
   ✅ Works with worker schema:
      - type:"plain" + plain
      - type:"plain" + lines[]
      - type:"synced" + sync[]
   ✅ Karaoke highlight line on main rail when timed sync exists
   ✅ Falls back to plain lyrics
   ✅ Shows instrumental / unavailable states cleanly
*/

(() => {
  "use strict";

  const LYRICS_ENDPOINT = "https://lyrics.errtanq9.workers.dev/lyrics";
  const SPOTIFY_API = "https://api.spotify.com/v1";

  const NOW_POLL_MS = 2200;
  const PLAYER_POLL_MS = 900;
  const MIN_TEXT_LEN = 20;

  let lyricsAbort = null;

  let lastSongKey = "";
  let lastRenderedKey = "";

  let timedLines = null;      // [{timeMs, text}]
  let plainLines = null;      // string[]
  let currentTrackId = "";
  let lastActiveIndex = -1;

  const $ = (id) => document.getElementById(id);

  function setLine(text) {
    const el = $("currentLyricLine");
    if (el) el.textContent = text || "—";
  }

  function setMeta(text) {
    const el = $("currentLyricMeta");
    if (el) el.textContent = text || "";
  }

  function cleanTitle(s) {
    s = (s || "").toString().trim();
    if (!s) return "";
    return s
      .replace(/\s+/g, " ")
      .replace(/[’‘]/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/\s*[\(\[]\s*(feat\.?|ft\.?)\s+[^)\]]+[\)\]]\s*/gi, " ")
      .replace(/\s*[\(\[]\s*(remaster(ed)?|live|radio edit|edit|version|mix|demo|bonus track|deluxe|expanded|anniversary)\b[^)\]]*[\)\]]\s*/gi, " ")
      .replace(/\s*-\s*(remaster(ed)?|live|radio edit|edit|version|mix|demo|bonus track|deluxe|expanded|anniversary)\b.*$/i, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getToken() {
    if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
      return window.SpotifyAuth.getAccessToken();
    }
    if (window.SpotifyPlayer && typeof window.SpotifyPlayer.getAccessToken === "function") {
      return window.SpotifyPlayer.getAccessToken();
    }
    return null;
  }

  function strongInstrumentalGuess(track) {
    const t = (track || "").toLowerCase();
    if (!t) return false;
    const kws = ["instrumental", "intro", "interlude", "overture", "theme", "ost", "score", "ambient mix"];
    return kws.some(k => t.includes(k));
  }

  function clearLyricsState() {
    timedLines = null;
    plainLines = null;
    currentTrackId = "";
    lastActiveIndex = -1;
  }

  function normalizeTimedSync(sync) {
    const out = [];
    let last = "";

    for (const it of (sync || [])) {
      const text = (it?.text ?? it?.line ?? "").toString().trim();
      const ms = Number(it?.timeMs ?? it?.t ?? it?.time);

      if (!text) continue;
      if (!Number.isFinite(ms) || ms < 0) continue;
      if (text === last) continue;

      last = text;
      out.push({ timeMs: ms, text });
    }

    out.sort((a, b) => a.timeMs - b.timeMs);
    return out;
  }

  function findActiveIndex(positionMs) {
    const lines = timedLines;
    if (!lines || !lines.length) return -1;

    let lo = 0;
    let hi = lines.length - 1;
    let ans = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].timeMs <= positionMs) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  async function spotifyMePlayer() {
    const token = getToken();
    if (!token) return null;

    try {
      const res = await fetch(`${SPOTIFY_API}/me/player`, {
        headers: { Authorization: "Bearer " + token }
      });

      if (res.status === 204) return null;
      const json = await res.json().catch(() => null);
      if (!res.ok) return null;
      return json;
    } catch {
      return null;
    }
  }

  async function syncTrackIdFromSpotify() {
    if (window.SpotifyPlayer && typeof window.SpotifyPlayer.getState === "function") {
      const st = window.SpotifyPlayer.getState();
      if (st?.track_id) {
        currentTrackId = st.track_id;
        return;
      }
    }

    const st = await spotifyMePlayer();
    if (!st || !st.item) return;
    currentTrackId = st.item.id || "";
  }

  function readCurrentTrack() {
    if (window.SpotifyPlayer && typeof window.SpotifyPlayer.getState === "function") {
      const st = window.SpotifyPlayer.getState();
      if (st?.track_name || st?.artist_name) {
        return {
          track: cleanTitle(st.track_name || ""),
          artist: cleanTitle(st.artist_name || ""),
          album: cleanTitle(st.album_name || ""),
          trackId: st.track_id || ""
        };
      }
    }

    return {
      track: "",
      artist: "",
      album: "",
      trackId: ""
    };
  }
   async function fetchLyrics(artist, track, album) {
    const a = cleanTitle(artist);
    const t = cleanTitle(track);
    const al = cleanTitle(album || "");

    if (!a || !t || a === "—" || t === "—") {
      clearLyricsState();
      setLine("—");
      setMeta(getToken() ? "Waiting for playback…" : "Spotify not linked");
      return;
    }

    const songKey = `${a}::${t}::${al}`;
    if (songKey === lastSongKey) return;
    lastSongKey = songKey;

    clearLyricsState();
    setLine("Loading lyrics…");
    setMeta(`Playing from Spotify · ${a}`);

    if (strongInstrumentalGuess(t)) {
      setLine("Instrumental / no lyrics available");
      setMeta(`Playing from Spotify · ${a}`);
      lastRenderedKey = songKey;
      return;
    }

    if (lyricsAbort) lyricsAbort.abort();
    lyricsAbort = new AbortController();

    try {
      const qs = new URLSearchParams({ artist: a, track: t });
      if (al) qs.set("album", al);

      const url = `${LYRICS_ENDPOINT}?${qs.toString()}`;
      const res = await fetch(url, { signal: lyricsAbort.signal });
      const data = await res.json().catch(() => null);

      if (!data || !data.ok || !data.found) {
        setLine("Lyrics unavailable");
        setMeta(`Playing from Spotify · ${a}`);
        lastRenderedKey = songKey;
        return;
      }

      const syncArr = Array.isArray(data.sync) ? data.sync : null;
      if (syncArr && syncArr.length) {
        const norm = normalizeTimedSync(syncArr);
        if (norm.length) {
          timedLines = norm;
          plainLines = norm.map(x => x.text);
          await syncTrackIdFromSpotify();

          setLine(norm[0]?.text || "—");
          setMeta(`Synced lyrics · ${a}`);
          lastRenderedKey = songKey;
          return;
        }
      }

      const plain = (data.plain || data.plainLyrics || "").toString().trim();
      if (plain && plain.length >= MIN_TEXT_LEN) {
        plainLines = plain
          .split(/\n+/)
          .map(x => x.trim())
          .filter(Boolean);

        setLine(plainLines[0] || plain);
        setMeta(`Lyrics loaded · ${a}`);
        lastRenderedKey = songKey;
        return;
      }

      if (Array.isArray(data.lines) && data.lines.length && typeof data.lines[0] === "string") {
        const lines = data.lines
          .map(x => (x || "").toString().trim())
          .filter(Boolean);

        const joined = lines.join("\n").trim();
        if (joined.length >= MIN_TEXT_LEN) {
          plainLines = lines;
          setLine(lines[0] || "—");
          setMeta(`Lyrics loaded · ${a}`);
          lastRenderedKey = songKey;
          return;
        }
      }

      setLine("Lyrics unavailable");
      setMeta(`Playing from Spotify · ${a}`);
    } catch (err) {
      if (err?.name === "AbortError") return;
      setLine("Lyrics unavailable");
      setMeta(`Playing from Spotify · ${a}`);
    }
  }

  async function progressTick() {
    if (!timedLines || !timedLines.length) return;

    let pos = 0;
    let trackId = "";

    if (window.SpotifyPlayer && typeof window.SpotifyPlayer.getState === "function") {
      const st = window.SpotifyPlayer.getState();
      pos = Number(st?.progress_ms || 0);
      trackId = st?.track_id || "";
    } else {
      const st = await spotifyMePlayer();
      if (!st || !st.item) return;
      pos = Number(st.progress_ms || 0);
      trackId = st.item.id || "";
    }

    if (currentTrackId && trackId && currentTrackId !== trackId) return;

    const idx = findActiveIndex(pos);
    if (idx < 0) return;
    if (idx === lastActiveIndex) return;

    lastActiveIndex = idx;
    const line = timedLines[idx]?.text || "—";
    setLine(line);
    setMeta("Synced lyrics");
  }

  async function refreshLyricsForCurrentTrack() {
    const { track, artist, album } = readCurrentTrack();

    if (!track || !artist) {
      if (getToken()) {
        setLine("—");
        setMeta("Waiting for playback…");
      } else {
        setLine("—");
        setMeta("Spotify not linked");
      }
      return;
    }

    const key = `${artist}::${track}::${album}`;
    if (key !== lastRenderedKey) {
      await fetchLyrics(artist, track, album);
    }
  }

  function bindSpotifyState() {
    if (window.SpotifyPlayer && typeof window.SpotifyPlayer.subscribe === "function") {
      window.SpotifyPlayer.subscribe(() => {
        refreshLyricsForCurrentTrack();
        progressTick();
      });
    }

    window.addEventListener("spotify:state", () => {
      refreshLyricsForCurrentTrack();
      progressTick();
    });
  }

  function boot() {
    bindSpotifyState();

    setInterval(() => {
      refreshLyricsForCurrentTrack();
    }, NOW_POLL_MS);

    setInterval(() => {
      progressTick();
    }, PLAYER_POLL_MS);

    refreshLyricsForCurrentTrack();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
