/* spotify-ui.js (FULL REPLACE)
   Goal:
   - KEEP original header Spotify controls if they exist
   - If they DON'T exist, inject FALLBACK controls in the SAME header area (not floating)
   - HARD block playback triggered by header/orb/title area ("Mirror bug")
   - NEVER block taps on original OR fallback controls
   - Click-to-play on list rows (Recent/Top)
   Fix: rows without artwork (♪/♫) must still resolve + play
*/

(function () {
  "use strict";

  const API_BASE = String(window.LISTENING_MIRROR_API || "https://i.errtanq9.workers.dev").replace(/\/+$/, "");

  // ---------------- helpers ----------------
  function el(tag, props = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k === "style") n.setAttribute("style", v);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v, { passive: false });
      else if (v === true) n.setAttribute(k, "");
      else if (v !== false && v != null) n.setAttribute(k, String(v));
    }
    for (const c of children) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function safeCall(path, ...args) {
    try {
      const parts = path.split(".");
      let cur = window;
      for (const p of parts) {
        if (!cur || !(p in cur)) return { ok: false, reason: `missing ${path}` };
        cur = cur[p];
      }
      if (typeof cur !== "function") return { ok: false, reason: `not a function ${path}` };
      return { ok: true, value: cur(...args) };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  }

  function getToken() {
    if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
      return window.SpotifyAuth.getAccessToken();
    }
    try {
      return (
        localStorage.getItem("spotify_access_token") ||
        localStorage.getItem("SPOTIFY_ACCESS_TOKEN") ||
        sessionStorage.getItem("spotify_access_token") ||
        null
      );
    } catch {
      return null;
    }
  }

  function ensureCss() {
    if (document.getElementById("spotifyUiCss")) return;
    const css = `
/* row clickability */
.spArtworkPlayable{ cursor: pointer !important; border-radius: 12px; }
.spRowPlayable{ cursor: pointer !important; }

/* fallback controls styling (matches your header pill vibe) */
#spFallbackControls{
  display:flex;
  align-items:center;
  gap:10px;
  padding:10px 12px;
  border-radius:999px;
  background: rgba(10,12,14,.42);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  outline: 1px solid rgba(255,255,255,.10);
  box-shadow: 0 18px 60px rgba(0,0,0,.35);
}
#spFallbackControls button{
  border:0;
  width:40px;
  height:40px;
  border-radius:999px;
  background: rgba(255,255,255,.06);
  outline: 1px solid rgba(255,255,255,.10);
  display:grid;
  place-items:center;
  color: rgba(255,255,255,.92);
  padding:0;
}
#spFallbackControls button:active{ transform: translateY(1px); background: rgba(255,255,255,.08); }
#spFallbackControls svg{ width:18px; height:18px; display:block; }
    `.trim();
    const st = document.createElement("style");
    st.id = "spotifyUiCss";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function iconSvg(name) {
    if (name === "prev") return `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 6h2v12H6V6zm3.5 6L18 6v12l-8.5-6z"/></svg>`;
    if (name === "play") return `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7L8 5z"/></svg>`;
    if (name === "pause") return `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/></svg>`;
    if (name === "next") return `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 6h2v12h-2V6zM6 18V6l8.5 6L6 18z"/></svg>`;
    return "";
  }

  function spotifyLogoSvg() {
    return `
      <svg viewBox="0 0 168 168" aria-hidden="true">
        <path fill="currentColor" d="M84 0C37.6 0 0 37.6 0 84s37.6 84 84 84 84-37.6 84-84S130.4 0 84 0zm38.6 121.3c-1.5 2.4-4.6 3.2-7 1.7-19.2-11.7-43.4-14.3-72-7.8-2.8.6-5.6-1.1-6.2-3.9-.6-2.8 1.1-5.6 3.9-6.2 31.5-7.2 58.5-4.2 80.3 9.1 2.4 1.5 3.2 4.6 1.7 7.1z"/>
      </svg>
    `;
  }
// ---------------- header/orb detection ----------------
  function callIndexOrStats() {
    const tries = [
      "openStats","showStats","toggleStats",
      "openIndex","showIndex","toggleIndex",
      "openOrbIndex","showOrbIndex","toggleOrbIndex",
      "openOrbStats","showOrbStats","toggleOrbStats",
    ];
    for (const fn of tries) {
      if (typeof window[fn] === "function") {
        try { window[fn](); return true; } catch {}
      }
    }
    const nsTries = [
      "UI.openStats","UI.showStats","UI.toggleStats",
      "ListeningMirror.openStats","ListeningMirror.showStats","ListeningMirror.toggleStats",
    ];
    for (const p of nsTries) {
      const r = safeCall(p);
      if (r.ok) return true;
    }
    return false;
  }

  function findHeaderTitleNode() {
    const nodes = Array.from(document.querySelectorAll("h1,h2,div,span")).slice(0, 3500);
    for (const n of nodes) {
      const t = (n.textContent || "").trim();
      if (t === "Listening Mirror") {
        const r = n.getBoundingClientRect?.();
        if (r && r.width > 120 && r.height > 18 && r.bottom > 0 && r.top < window.innerHeight) return n;
      }
    }
    for (const n of nodes) {
      const t = (n.textContent || "").trim();
      if (t.includes("Listening Mirror")) {
        const r = n.getBoundingClientRect?.();
        if (r && r.width > 120 && r.height > 18 && r.bottom > 0 && r.top < window.innerHeight) return n;
      }
    }
    return null;
  }

  function findOrbNearTitle(titleNode) {
    if (!titleNode) return null;

    const container =
      titleNode.closest("header") ||
      titleNode.closest("section") ||
      titleNode.closest("article") ||
      titleNode.closest("div") ||
      titleNode.parentElement;

    if (!container) return null;

    const titleRect = titleNode.getBoundingClientRect();
    const candidates = Array.from(container.querySelectorAll("div,span,button,a")).slice(0, 200);

    let best = null;
    let bestScore = Infinity;

    for (const n of candidates) {
      if (n === titleNode) continue;

      const r = n.getBoundingClientRect?.();
      if (!r) continue;

      const small = r.width >= 10 && r.width <= 56 && r.height >= 10 && r.height <= 56;
      if (!small) continue;

      const midY = (r.top + r.bottom) / 2;
      const titleMidY = (titleRect.top + titleRect.bottom) / 2;
      const closeY = Math.abs(midY - titleMidY) < 28;

      const cs = window.getComputedStyle(n);
      const br = parseFloat(cs.borderRadius || "0");
      const roundish = br > 12 || cs.borderRadius === "999px";

      if (!closeY || !roundish) continue;

      const dx = Math.abs(titleRect.left - r.right);
      const dy = Math.abs(titleMidY - midY);
      const score = dx + dy * 2;

      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best;
  }

  let LM_HEADER_EL = null;
  let LM_ORB_EL = null;

  function bindOrbHoverForIndex() {
    if (!LM_ORB_EL) return;
    if (LM_ORB_EL.dataset && LM_ORB_EL.dataset.spOrbHoverBound === "1") return;

    LM_ORB_EL.dataset.spOrbHoverBound = "1";
    LM_ORB_EL.setAttribute("data-lm-orb", "1");

    LM_ORB_EL.addEventListener("mouseenter", () => { callIndexOrStats(); }, { passive: true });
    LM_ORB_EL.addEventListener("pointerenter", () => { callIndexOrStats(); }, { passive: true });

    LM_ORB_EL.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      callIndexOrStats();
    }, { passive: false });
  }

  function refreshHeaderRefs() {
    const titleNode = findHeaderTitleNode();
    if (!titleNode) {
      LM_HEADER_EL = null;
      LM_ORB_EL = null;
      return;
    }

    LM_HEADER_EL =
      titleNode.closest("header") ||
      titleNode.closest("section") ||
      titleNode.closest("article") ||
      titleNode.closest("div") ||
      titleNode.parentElement ||
      null;

    LM_ORB_EL = findOrbNearTitle(titleNode);
    if (LM_ORB_EL) bindOrbHoverForIndex();
  }

  // ---------------- allow ORIGINAL controls OR fallback ----------------
  function isOriginalSpotifyControlTarget(target) {
    if (!target) return false;

    // our fallback must always be allowed
    if (target.closest && target.closest("#spFallbackControls")) return true;

    const btn = target.closest ? target.closest("button,a,[role='button'],div") : null;
    if (!btn) return false;

    const aria = (btn.getAttribute?.("aria-label") || btn.getAttribute?.("title") || "").toLowerCase();
    if (aria) {
      if (aria.includes("spotify")) return true;
      if (aria.includes("login") || aria.includes("log in") || aria.includes("sign in")) return true;
      if (aria.includes("logout") || aria.includes("log out") || aria.includes("sign out")) return true;
      if (aria.includes("previous") || aria.includes("prev")) return true;
      if (aria.includes("next")) return true;
      if (aria.includes("play") || aria.includes("pause")) return true;
    }

    const r = btn.getBoundingClientRect?.();
    if (r && r.width >= 28 && r.width <= 80 && r.height >= 28 && r.height <= 80) {
      const cs = window.getComputedStyle(btn);
      const br = parseFloat(cs.borderRadius || "0");
      const roundish = br > 12 || cs.borderRadius === "999px";
      if (roundish && (btn.querySelector?.("svg") || btn.closest?.("svg"))) return true;
    }

    return false;
  }
// ---------------- HARD blocker (header click bug) ----------------
  let blockerInstalled = false;
  function installWindowCaptureBlocker() {
    if (blockerInstalled) return;
    blockerInstalled = true;

    const inHeader = (target) => {
      if (!target || !LM_HEADER_EL) return false;
      return LM_HEADER_EL.contains(target);
    };

    const killDownOrClick = (e) => {
      if (!inHeader(e.target)) return;

      // ✅ NEVER block the original controls OR fallback controls
      if (isOriginalSpotifyControlTarget(e.target)) return;

      // orb: show index, never play
      if (LM_ORB_EL && (e.target === LM_ORB_EL || (e.target.closest && e.target.closest("[data-lm-orb='1']")))) {
        try { e.preventDefault(); } catch {}
        try { e.stopImmediatePropagation(); } catch {}
        try { e.stopPropagation(); } catch {}
        callIndexOrStats();
        return;
      }

      try { e.preventDefault(); } catch {}
      try { e.stopImmediatePropagation(); } catch {}
      try { e.stopPropagation(); } catch {}
    };

    window.addEventListener("pointerdown", killDownOrClick, { capture: true, passive: false });
    window.addEventListener("mousedown",   killDownOrClick, { capture: true, passive: false });
    window.addEventListener("touchstart",  killDownOrClick, { capture: true, passive: false });
    window.addEventListener("click",       killDownOrClick, { capture: true, passive: false });
  }

  // ---------------- FALLBACK header controls (ONLY if originals missing) ----------------
  function findExistingHeaderControls(headerEl) {
    if (!headerEl) return null;

    // detect cluster of 3+ round buttons near top-right of header
    const candidates = Array.from(headerEl.querySelectorAll("button,a,[role='button'],div,span")).slice(0, 600);
    const round = candidates.filter(n => {
      const r = n.getBoundingClientRect?.();
      if (!r) return false;
      if (r.width < 26 || r.width > 80) return false;
      if (r.height < 26 || r.height > 80) return false;
      const cs = window.getComputedStyle(n);
      const br = parseFloat(cs.borderRadius || "0");
      const roundish = br > 12 || cs.borderRadius === "999px";
      if (!roundish) return false;
      // must have svg icon or be inside one
      return !!(n.querySelector?.("svg") || n.closest?.("svg"));
    });

    // if we see multiple round icon buttons, assume controls exist
    if (round.length >= 3) return round[0].closest("div,nav,section,header") || headerEl;

    return null;
  }

  async function spotifyApi(endpoint, method = "GET", body = null) {
    const token = getToken();
    if (!token) return { ok: false, status: 401 };
    try {
      const r = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        method,
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : null
      });
      return { ok: r.ok, status: r.status };
    } catch {
      return { ok: false, status: 0 };
    }
  }

  async function apiPause() { return (await spotifyApi("/me/player/pause", "PUT")).ok; }
  async function apiPlay()  { return (await spotifyApi("/me/player/play", "PUT")).ok; }

  async function getPlaybackState() {
    let r = safeCall("SpotifyPlayer.getState");
    if (r.ok) return await Promise.resolve(r.value);

    r = safeCall("SpotifyPlayer.getPlaybackState");
    if (r.ok) return await Promise.resolve(r.value);

    const token = getToken();
    if (!token) return null;
    try {
      const rr = await fetch("https://api.spotify.com/v1/me/player", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!rr.ok) return null;
      const j = await rr.json();
      return { isPlaying: !!j?.is_playing, paused: typeof j?.is_playing === "boolean" ? !j.is_playing : undefined };
    } catch {
      return null;
    }
  }

  function inferIsPlaying(state) {
    if (!state) return null;
    if (state.isPlaying === true) return true;
    if (state.playing === true) return true;
    if (typeof state.paused === "boolean") return !state.paused;
    return null;
  }

  function doLoginOrLogout() {
    const token = getToken();
    if (!token) {
      const r = safeCall("SpotifyAuth.login");
      if (!r.ok) console.warn("[Spotify UI] SpotifyAuth.login missing:", r.reason);
      return;
    }
    let r = safeCall("SpotifyAuth.logout");
    if (r.ok) return;
    try {
      localStorage.removeItem("spotify_access_token");
      localStorage.removeItem("spotify_refresh_token");
      localStorage.removeItem("SPOTIFY_ACCESS_TOKEN");
      localStorage.removeItem("SPOTIFY_REFRESH_TOKEN");
      sessionStorage.removeItem("spotify_access_token");
      sessionStorage.removeItem("spotify_refresh_token");
    } catch {}
  }

  async function pauseSafe() {
    const ok = await apiPause();
    if (ok) return true;
    const r = safeCall("SpotifyPlayer.pause");
    return !!r.ok;
  }

  async function resumeSafe() {
    const ok = await apiPlay();
    if (ok) return true;
    let r = safeCall("SpotifyPlayer.play");
    if (r.ok) return true;
    r = safeCall("SpotifyPlayer.resume");
    return !!r.ok;
  }

  function ensureFallbackControls(headerEl) {
    if (!headerEl) return;

    // if original controls exist, do nothing
    const existing = findExistingHeaderControls(headerEl);
    if (existing && !document.getElementById("spFallbackControls")) return;

    let fc = document.getElementById("spFallbackControls");
    if (fc) return;

    // create fallback bar
    const bSpotify = el("button", { type: "button", title: "Spotify (login/logout)", "aria-label": "Spotify login" });
    bSpotify.innerHTML = spotifyLogoSvg();

    const bPrev = el("button", { type: "button", title: "Previous", "aria-label": "Previous" });
    bPrev.innerHTML = iconSvg("prev");

    const bToggle = el("button", { type: "button", title: "Play/Pause", "aria-label": "Play/Pause" });
    bToggle.innerHTML = iconSvg("play");

    const bNext = el("button", { type: "button", title: "Next", "aria-label": "Next" });
    bNext.innerHTML = iconSvg("next");

    fc = el("div", { id: "spFallbackControls" }, [bSpotify, bPrev, bToggle, bNext]);

    // place it top-right inside header
    // (we don't change layout; we overlay safely)
    const wrap = el("div", {
      id: "spFallbackWrap",
      style: "position:absolute; top:14px; right:14px; z-index:50;"
    }, [fc]);

    // make header positioned so absolute works
    const cs = window.getComputedStyle(headerEl);
    if (cs.position === "static") headerEl.style.position = "relative";

    headerEl.appendChild(wrap);

    // bind handlers
    bSpotify.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); doLoginOrLogout(); }, { passive: false });
    bPrev.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const r = safeCall("SpotifyPlayer.prev");
      if (!r.ok) console.warn("[Spotify UI] Prev failed:", r.reason);
    }, { passive: false });

    bNext.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const r = safeCall("SpotifyPlayer.next");
      if (!r.ok) console.warn("[Spotify UI] Next failed:", r.reason);
    }, { passive: false });

    bToggle.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      const st = await getPlaybackState();
      const isPlaying = inferIsPlaying(st);
      if (isPlaying === true) {
        bToggle.innerHTML = iconSvg("play");
        const ok = await pauseSafe();
        if (!ok) bToggle.innerHTML = iconSvg("pause");
      } else {
        bToggle.innerHTML = iconSvg("pause");
        const ok = await resumeSafe();
        if (!ok) bToggle.innerHTML = iconSvg("play");
      }
    }, { passive: false });
  }
// ---------------- Click-to-play on list rows ----------------
  function isSessionCoversArea(node) {
    const root = node?.closest?.("section, article, div") || null;
    const txt = ((root?.innerText || node?.innerText || "")).toUpperCase();
    if (!txt) return false;
    if (txt.includes("SESSION COVERS")) return true;
    if (txt.includes("MIRROR") && txt.includes("LISTENING")) return true;
    return false;
  }

  function isExplicitNoPlay(node) {
    return !!(node?.closest?.("[data-sp-no-play='1']"));
  }

  function extractSpotifyUriFromNode(node) {
    const ds = node?.dataset || {};
    const cand = ds.spotifyUri || ds.uri || ds.spotifyTrackUri || ds.spotifyId || null;

    if (cand) {
      if (cand.startsWith("spotify:")) return cand;
      if (/^[A-Za-z0-9]{22}$/.test(cand)) return `spotify:track:${cand}`;
    }

    const a =
      node?.querySelector?.("a[href*='open.spotify.com/track/'], a[href^='spotify:track:']") ||
      node?.closest?.("a[href*='open.spotify.com/track/'], a[href^='spotify:track:']");
    const href = a?.getAttribute?.("href") || "";
    if (href.includes("open.spotify.com/track/")) {
      const m = href.match(/track\/([A-Za-z0-9]{22})/);
      if (m?.[1]) return `spotify:track:${m[1]}`;
    }
    if (href.startsWith("spotify:")) return href;

    return null;
  }

  function normalizeArtistLine(line) {
    const s = (line || "").trim();
    if (!s) return "";
    const parts = s.split("•").map(x => x.trim()).filter(Boolean);
    return parts.length ? parts[0] : s;
  }

  // ✅ FIX: remove music-note placeholders so "no artwork" rows resolve correctly
  function cleanLine(s) {
    let x = (s || "").replace(/\s+/g, " ").trim();
    if (!x) return "";
    x = x.replace(/[♪♫♬♩]/g, "").trim();
    if (!x) return "";
    x = x.replace(/^LIVE$/i, "").trim();
    x = x.replace(/^\d+\.\s+/, "").trim();
    x = x.replace(/\b\d{1,2}\s+[A-Za-z]{3}\s+\d{4}(,\s*\d{2}:\d{2})?\b/gi, "").trim();
    x = x.replace(/\b\d{2}:\d{2}\b/g, "").trim();
    if (/^\d+$/.test(x)) return "";
    return x;
  }

  function guessArtistTrackFromRow(row) {
    const ds = row?.dataset || {};
    const a1 = (ds.artist || ds.lastfmArtist || "").trim();
    const t1 = (ds.track || ds.name || ds.lastfmTrack || "").trim();
    if (a1 && t1) return { artist: a1, track: t1 };

    const lines = (row?.innerText || "")
      .split("\n")
      .map(cleanLine)
      .filter(Boolean);

    const filtered = lines.filter(l => {
      const u = l.toUpperCase();
      if (u === "ONLINE") return false;
      if (u === "NOW" || u === "RECENT" || u === "TOP") return false;
      if (u === "TRACK" || u === "ARTIST" || u === "ALBUM") return false;
      if (u === "TODAY" || u === "WEEK" || u === "YEAR") return false;
      if (u.includes("SESSION COVERS")) return false;
      return true;
    });

    const track = cleanLine(filtered[0] || "");
    const artist = normalizeArtistLine(cleanLine(filtered[1] || ""));
    return { track, artist };
  }

  function looksLikeArtistOnlyRow(row) {
    const text = (row?.innerText || "").split("\n").map(cleanLine).filter(Boolean);
    if (!text.length) return true;
    if (text.length === 1) return true;
    const l1 = (text[1] || "").trim();
    const l1IsCount = !!l1 && /^[\d,.\s]+$/.test(l1);
    return l1IsCount;
  }

  function isTopTabActive() {
    const tabs = Array.from(document.querySelectorAll("button,div,span,a")).slice(0, 2000);
    for (const n of tabs) {
      const tx = (n.textContent || "").trim().toLowerCase();
      if (tx !== "top") continue;
      const ariaSel = n.getAttribute("aria-selected");
      const ariaPress = n.getAttribute("aria-pressed");
      const cls = (n.className || "").toString().toLowerCase();
      if (ariaSel === "true" || ariaPress === "true" || cls.includes("active") || cls.includes("selected")) return true;
    }
    return false;
  }

  function isLikelyFirstRowInTop(row) {
    if (!isTopTabActive()) return false;
    const r = row.getBoundingClientRect?.();
    if (!r) return false;
    return r.top >= 0 && r.top < 320;
  }

  function strictOk(row, artist, track) {
    const a = (artist || "").trim();
    const t = (track || "").trim();
    if (!a || !t) return false;
    if (a.length < 2 || t.length < 2) return false;
    const rowTxt = ((row?.innerText || "")).toLowerCase();
    if (!rowTxt.includes(a.toLowerCase())) return false;
    if (!rowTxt.includes(t.toLowerCase())) return false;
    return true;
  }

  function relaxedOk(artist, track) {
    const a = (artist || "").trim();
    const t = (track || "").trim();
    if (!a || !t) return false;
    if (a.length < 2 || t.length < 2) return false;
    if (t.endsWith("…") || a.endsWith("…")) return false;
    return true;
  }

  async function resolveUriForRow(row) {
    const u0 = extractSpotifyUriFromNode(row);
    if (u0) return u0;

    const { artist, track } = guessArtistTrackFromRow(row);
    const strict = isLikelyFirstRowInTop(row);
    const ok = strict ? strictOk(row, artist, track) : relaxedOk(artist, track);
    if (!ok) return "";

    const q = `${artist} ${track}`.trim();

    try {
      const r = await fetch(`${API_BASE}/resolve?q=${encodeURIComponent(q)}`, { method: "GET" });
      if (!r.ok) return "";
      const j = await r.json();
      const id = j?.best?.id;
      if (id && /^[A-Za-z0-9]{22}$/.test(id)) return `spotify:track:${id}`;
    } catch {}

    return "";
  }

  async function apiPlayUri(uri) {
    if (!uri || typeof uri !== "string") return false;
    const m = uri.match(/^spotify:track:([A-Za-z0-9]{22})$/);
    if (!m) return false;
    return !!(await spotifyApi("/me/player/play", "PUT", { uris: [uri] })).ok;
  }

  async function playUri(uri) {
    let r = safeCall("SpotifyPlayer.playUri", uri);
    if (r.ok) return true;
    r = safeCall("SpotifyPlayer.play", { uri });
    if (r.ok) return true;
    r = safeCall("SpotifyPlayer.play", uri);
    if (r.ok) return true;

    const ok = await apiPlayUri(uri);
    if (ok) return true;

    console.warn("[Spotify UI] Cannot play URI:", uri);
    return false;
  }

  function rectIsSquareish(r) {
    if (!r) return false;
    const w = r.width, h = r.height;
    if (w < 24 || h < 24) return false;
    if (w > 170 || h > 170) return false;
    const ratio = w / h;
    return ratio > 0.72 && ratio < 1.38;
  }

  function getArtworkClickable(row) {
    if (isSessionCoversArea(row) || isExplicitNoPlay(row)) return null;

    const img = row.querySelector?.("img");
    if (img && !isExplicitNoPlay(img)) return img;

    const kids = Array.from(row.querySelectorAll?.("div, span, a") || []);
    for (const n of kids) {
      if (isSessionCoversArea(n) || isExplicitNoPlay(n)) continue;
      const rr = n.getBoundingClientRect?.();
      if (!rectIsSquareish(rr)) continue;
      return n;
    }
    return null;
  }

  function guessRows() {
    const li = Array.from(document.querySelectorAll("li"));
    if (li.length) return li;
    return Array.from(document.querySelectorAll("div, article, section"))
      .filter((n) => (n.textContent || "").trim().length > 6);
  }

  function allowedToBindRow(topMode, row) {
    if (isSessionCoversArea(row)) return false;
    if (isExplicitNoPlay(row)) return false;
    if (topMode === "artist") return false;
    if (looksLikeArtistOnlyRow(row)) return false;
    return true;
  }

  function getTopMode() {
    const nodes = Array.from(document.querySelectorAll("*")).slice(0, 3500);
    for (const n of nodes) {
      const t = (n.innerText || "").replace(/\s+/g, " ").trim();
      if (!t) continue;
      const lt = t.toLowerCase();
      if (!(lt.includes("track") && lt.includes("artist") && lt.includes("album"))) continue;

      const opts = Array.from(n.querySelectorAll("button, div, span, a")).filter(x => {
        const tx = (x.textContent || "").trim().toLowerCase();
        return tx === "track" || tx === "artist" || tx === "album";
      });

      for (const o of opts) {
        const tx = (o.textContent || "").trim().toLowerCase();
        const ariaSel = o.getAttribute("aria-selected");
        const ariaPress = o.getAttribute("aria-pressed");
        const cls = (o.className || "").toString().toLowerCase();
        if (ariaSel === "true" || ariaPress === "true" || cls.includes("active") || cls.includes("selected")) return tx;
      }
    }
    return null;
  }

  function attachPlayBindings() {
    if (!getToken()) return;

    const topMode = getTopMode();
    const rows = guessRows();

    for (const row of rows) {
      if (!allowedToBindRow(topMode, row)) continue;

      const art = getArtworkClickable(row);

      if (art && art.dataset.spBound !== "1") {
        art.dataset.spBound = "1";
        art.classList.add("spArtworkPlayable");

        art.addEventListener("click", async (e) => {
          if (isOriginalSpotifyControlTarget(e.target)) return;
          if (isExplicitNoPlay(e.target) || isSessionCoversArea(e.target)) return;

          e.preventDefault(); e.stopPropagation();
          const uri = await resolveUriForRow(row);
          if (uri) await playUri(uri);
        }, { passive: false });
      }

      if (row.dataset.spRowBound !== "1") {
        row.dataset.spRowBound = "1";
        row.classList.add("spRowPlayable");

        row.addEventListener("click", async (e) => {
          if (isOriginalSpotifyControlTarget(e.target)) return;
          if (isExplicitNoPlay(e.target) || isSessionCoversArea(e.target)) return;

          const tag = (e.target?.tagName || "").toLowerCase();
          if (tag === "button" || tag === "a" || tag === "input") return;

          e.preventDefault(); e.stopPropagation();
          const uri = await resolveUriForRow(row);
          if (uri) await playUri(uri);
        }, { passive: false });
      }
    }
  }

  // ---------------- loops ----------------
  let bindTimer = null;

  function tick() {
    refreshHeaderRefs();
    installWindowCaptureBlocker();

    // fallback controls only if originals missing
    if (LM_HEADER_EL) ensureFallbackControls(LM_HEADER_EL);

    try { attachPlayBindings(); } catch {}
  }

  function boot() {
    ensureCss();
    tick();

    const mo = new MutationObserver(() => { ensureCss(); tick(); });
    mo.observe(document.documentElement, { subtree: true, childList: true });

    if (bindTimer) clearInterval(bindTimer);
    bindTimer = setInterval(tick, 900);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

})();