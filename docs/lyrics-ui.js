/* lyrics-ui.js (FULL FILE REPLACE) — PART 1/2
   Listening Mirror — Lyrics bridge with sync stability fix
   ✅ Writes directly into:
      - #currentLyricLine
      - #currentLyricMeta
   ✅ Works with worker schema:
      - type:"plain" + plain
      - type:"plain" + lines[]
      - type:"synced" + sync[]
   ✅ Anti-jitter synced lyrics
*/

(() => {
  "use strict";

  const LYRICS_ENDPOINT = "https://lyrics.errtanq9.workers.dev/lyrics";
  const SPOTIFY_API = "https://api.spotify.com/v1";

  const NOW_POLL_MS = 2200;
  const PLAYER_POLL_MS = 900;
  const MIN_TEXT_LEN = 20;

  // stability tuning
  const SWITCH_EARLY_MS = 40;      // allow tiny early transition only
  const SWITCH_HOLD_MS = 140;      // candidate line must remain valid briefly
  const BACKWARD_TOLERANCE_MS = 900; // ignore tiny backward jumps from jitter
  const MIN_PROGRESS_ADVANCE_MS = -120; // tolerate tiny regressions

  let lyricsAbort = null;

  let lastSongKey = "";
  let lastRenderedKey = "";

  let timedLines = null;      // [{timeMs, text}]
  let plainLines = null;      // string[]
  let currentTrackId = "";
  let syncedArtist = "";

  let activeIndex = -1;
  let candidateIndex = -1;
  let candidateSince = 0;
  let lastProgressMs = 0;
  let lastTrackIdSeen = "";
  let lastTickTs = 0;

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
    syncedArtist = "";
    activeIndex = -1;
    candidateIndex = -1;
    candidateSince = 0;
    lastProgressMs = 0;
    lastTrackIdSeen = "";
    lastTickTs = 0;
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
          syncedArtist = a;
          await syncTrackIdFromSpotify();

          activeIndex = 0;
          candidateIndex = -1;
          candidateSince = 0;
          lastProgressMs = 0;
          lastTrackIdSeen = currentTrackId || "";
          lastTickTs = 0;

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
    let nowTs = Date.now();

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

    // reset guards on real track change
    if (trackId && lastTrackIdSeen && trackId !== lastTrackIdSeen) {
      activeIndex = -1;
      candidateIndex = -1;
      candidateSince = 0;
      lastProgressMs = 0;
    }
    lastTrackIdSeen = trackId || lastTrackIdSeen;

    // ignore micro backward jitter
    const delta = pos - lastProgressMs;
    if (lastProgressMs > 0 && delta < MIN_PROGRESS_ADVANCE_MS && Math.abs(delta) < BACKWARD_TOLERANCE_MS) {
      pos = lastProgressMs;
    }

    const targetIdx = findActiveIndex(pos + SWITCH_EARLY_MS);

    // nothing valid yet
    if (targetIdx < 0) {
      lastProgressMs = pos;
      lastTickTs = nowTs;
      return;
    }

    // first lock
    if (activeIndex < 0) {
      activeIndex = targetIdx;
      setLine(timedLines[activeIndex]?.text || "—");
      setMeta(`Synced lyrics · ${syncedArtist || ""}`.trim());
      lastProgressMs = pos;
      lastTickTs = nowTs;
      return;
    }

    // prevent tiny backward flicker
    if (targetIdx < activeIndex && (lastProgressMs - pos) < BACKWARD_TOLERANCE_MS) {
      lastProgressMs = Math.max(lastProgressMs, pos);
      lastTickTs = nowTs;
      return;
    }

    // same line -> clear candidate
    if (targetIdx === activeIndex) {
      candidateIndex = -1;
      candidateSince = 0;
      lastProgressMs = pos;
      lastTickTs = nowTs;
      return;
    }

    // new candidate line
    if (candidateIndex !== targetIdx) {
      candidateIndex = targetIdx;
      candidateSince = nowTs;
      lastProgressMs = pos;
      lastTickTs = nowTs;
      return;
    }

    // candidate must hold for a bit
    if ((nowTs - candidateSince) >= SWITCH_HOLD_MS) {
      activeIndex = candidateIndex;
      candidateIndex = -1;
      candidateSince = 0;

      const line = timedLines[activeIndex]?.text || "—";
      setLine(line);
      setMeta(`Synced lyrics · ${syncedArtist || ""}`.trim());
    }

    lastProgressMs = pos;
    lastTickTs = nowTs;
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

  function boot() {
    // single polling path for stability
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