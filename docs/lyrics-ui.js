/* lyrics-ui.js (FULL FILE REPLACE)
   Listening Mirror — Mirror lyrics line
   ✅ Updates #currentLyricLine
   ✅ Updates #currentLyricMeta as: Artist - Track
   ✅ Works with synced or plain lyrics worker responses
   ✅ Follows progress from Spotify and advances lyric line correctly
*/

(() => {
  "use strict";

  const LYRICS_ENDPOINT = "https://lyrics.errtanq9.workers.dev/lyrics";
  const SPOTIFY_API = "https://api.spotify.com/v1";

  const TRACK_POLL_MS = 1800;
  const PLAYER_POLL_MS = 700;

  let lastSongKey = "";
  let currentTrackId = "";
  let timedLines = null;        // [{ timeMs, text }]
  let plainLines = null;        // string[]
  let lastActiveIndex = -1;
  let lyricsAbort = null;

  const lyricLineEl = document.getElementById("currentLyricLine");
  const lyricMetaEl = document.getElementById("currentLyricMeta");

  function safeText(v) {
    return (v || "").toString().trim();
  }

  function cleanTitle(s) {
    s = safeText(s);
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

  function setLine(text) {
    if (!lyricLineEl) return;
    lyricLineEl.textContent = safeText(text) || "—";
  }

  function setMeta(artist, track) {
    if (!lyricMetaEl) return;

    const a = cleanTitle(artist);
    const t = cleanTitle(track);

    if (!a && !t) {
      lyricMetaEl.textContent = "Waiting for playback…";
      return;
    }

    if (a && t) {
      lyricMetaEl.textContent = `${a} - ${t}`;
      return;
    }

    lyricMetaEl.textContent = a || t || "Waiting for playback…";
  }

  function clearLyricsState() {
    timedLines = null;
    plainLines = null;
    lastActiveIndex = -1;
    currentTrackId = "";
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

  function normalizeTimedSync(sync) {
    const out = [];
    let lastText = "";

    for (const it of (sync || [])) {
      const text = safeText(it?.text ?? it?.line ?? "");
      const ms = Number(it?.timeMs ?? it?.t ?? it?.time);

      if (!text) continue;
      if (!Number.isFinite(ms) || ms < 0) continue;
      if (text === lastText) continue;

      lastText = text;
      out.push({ timeMs: ms, text });
    }

    out.sort((a, b) => a.timeMs - b.timeMs);
    return out;
  }

  function normalizePlainLines(data) {
    if (Array.isArray(data?.lines) && data.lines.length) {
      return data.lines.map(safeText).filter(Boolean);
    }

    const plain = safeText(data?.plain || data?.plainLyrics || "");
    if (!plain) return null;

    return plain
      .split("\n")
      .map(safeText)
      .filter(Boolean);
  }

  function findActiveTimedIndex(positionMs) {
    if (!timedLines || !timedLines.length) return -1;

    let lo = 0;
    let hi = timedLines.length - 1;
    let ans = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (timedLines[mid].timeMs <= positionMs) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    return ans;
  }

  function findActivePlainIndex(positionMs, durationMs) {
    if (!plainLines || !plainLines.length) return -1;
    if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;

    const ratio = Math.max(0, Math.min(0.9999, positionMs / durationMs));
    const idx = Math.floor(ratio * plainLines.length);
    return Math.max(0, Math.min(plainLines.length - 1, idx));
  }

  async function fetchLyrics(artist, track, album) {
    const a = cleanTitle(artist);
    const t = cleanTitle(track);
    const al = cleanTitle(album || "");

    if (!a || !t) {
      clearLyricsState();
      setLine("—");
      setMeta(a, t);
      return;
    }

    const songKey = `${a}::${t}::${al}`;
    if (songKey === lastSongKey) return;
    lastSongKey = songKey;

    clearLyricsState();
    setMeta(a, t);
    setLine("—");

    if (lyricsAbort) lyricsAbort.abort();
    lyricsAbort = new AbortController();

    try {
      const qs = new URLSearchParams({ artist: a, track: t });
      if (al) qs.set("album", al);

      const res = await fetch(`${LYRICS_ENDPOINT}?${qs.toString()}`, {
        signal: lyricsAbort.signal
      });

      const data = await res.json().catch(() => null);

      if (!data || !data.ok || !data.found) {
        setLine("—");
        return;
      }

      const syncArr = Array.isArray(data.sync) ? data.sync : null;
      if (syncArr && syncArr.length) {
        const norm = normalizeTimedSync(syncArr);
        if (norm.length) {
          timedLines = norm;
          setLine(norm[0]?.text || "—");
          return;
        }
      }

      const lines = normalizePlainLines(data);
      if (lines && lines.length) {
        plainLines = lines;
        setLine(lines[0] || "—");
        return;
      }

      setLine("—");
    } catch {
      setLine("—");
    }
  }

  async function pollTrackAndLyrics() {
    const st = await spotifyMePlayer();

    if (!st || !st.item) {
      currentTrackId = "";
      lastSongKey = "";
      clearLyricsState();
      setLine("—");
      setMeta("", "");
      return;
    }

    const item = st.item;
    const trackId = safeText(item.id);
    const artist = safeText(item.artists?.[0]?.name || item.album?.artists?.[0]?.name || "");
    const track = safeText(item.name || "");
    const album = safeText(item.album?.name || "");

    setMeta(artist, track);

    if (trackId && trackId !== currentTrackId) {
      currentTrackId = trackId;
      lastSongKey = "";
      await fetchLyrics(artist, track, album);
    } else if (!timedLines && !plainLines) {
      await fetchLyrics(artist, track, album);
    }
  }

  async function updateActiveLyricLine() {
    const st = await spotifyMePlayer();

    if (!st || !st.item) return;

    const item = st.item;
    const trackId = safeText(item.id);
    const pos = Number(st.progress_ms || 0);
    const dur = Number(item.duration_ms || 0);

    const artist = safeText(item.artists?.[0]?.name || item.album?.artists?.[0]?.name || "");
    const track = safeText(item.name || "");
    setMeta(artist, track);

    if (currentTrackId && trackId && currentTrackId !== trackId) {
      currentTrackId = trackId;
      lastSongKey = "";
      await fetchLyrics(artist, track, item.album?.name || "");
      return;
    }

    let idx = -1;

    if (timedLines && timedLines.length) {
      idx = findActiveTimedIndex(pos);
      if (idx >= 0 && idx !== lastActiveIndex) {
        lastActiveIndex = idx;
        setLine(timedLines[idx].text);
      }
      return;
    }

    if (plainLines && plainLines.length) {
      idx = findActivePlainIndex(pos, dur);
      if (idx >= 0 && idx !== lastActiveIndex) {
        lastActiveIndex = idx;
        setLine(plainLines[idx]);
      }
      return;
    }

    setLine("—");
  }

  async function boot() {
    setLine("—");
    setMeta("", "");

    await pollTrackAndLyrics();
    await updateActiveLyricLine();

    setInterval(() => {
      pollTrackAndLyrics();
    }, TRACK_POLL_MS);

    setInterval(() => {
      updateActiveLyricLine();
    }, PLAYER_POLL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
