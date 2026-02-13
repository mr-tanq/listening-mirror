/* spotify-ui.js (FULL REPLACE)
   Fixes (FINAL):
   - Spotify icon fixed next to "Online": +5px UP, +25px LEFT from previous placement
   - No jitter: position updates only when Online moves materially (thresholded)
   - No scroll crashes: replaces heavy scan loops with IntersectionObserver
   - Click-to-play works even when no artwork (row listener in CAPTURE phase)
   - Keeps: header blocker, orb opens stats/index (never plays), session covers excluded
*/

(function () {
  "use strict";

  const API_BASE = String(window.LISTENING_MIRROR_API || "https://i.errtanq9.workers.dev").replace(/\/+$/, "");

  // ---------------- helpers ----------------
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

/* marker for "allowed header controls" */
[data-sp-controls='1'], [data-sp-controls='1'] *{
  pointer-events: auto !important;
}

/* FIXED Spotify icon next to Online */
#lmSpotifyOnlineBtn{
  position:fixed;
  z-index:999999;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:22px;
  height:22px;
  border-radius:999px;
  border:0;
  padding:0;
  cursor:pointer;
  box-shadow: 0 10px 26px rgba(0,0,0,.38);
  -webkit-tap-highlight-color: transparent;
  transform: translateZ(0);
  will-change: transform, top, left;
}
#lmSpotifyOnlineBtn svg{ width:14px; height:14px; display:block; }

#lmSpotifyOnlineBtn[data-logged="1"]{
  background:#1DB954;
  opacity:1;
}
#lmSpotifyOnlineBtn[data-logged="0"]{
  background:rgba(255,255,255,0.20);
  opacity:0.65;
  filter:grayscale(1);
}
#lmSpotifyOnlineBtn[data-logged="1"] svg path{ stroke:#0b0c0e; opacity:0.95; }
#lmSpotifyOnlineBtn[data-logged="0"] svg path{ stroke:rgba(255,255,255,0.88); opacity:0.95; }
    `.trim();
    const st = document.createElement("style");
    st.id = "spotifyUiCss";
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------------- Spotify Web API (fallback) ----------------
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
// ---------------- ALWAYS-visible Spotify icon next to "Online" ----------------
  function findOnlineTextNode() {
    const nodes = Array.from(document.querySelectorAll("span,div,p,small")).slice(0, 3200);
    for (const n of nodes) {
      const t = (n.textContent || "").trim();
      if (t !== "Online") continue;
      const r = n.getBoundingClientRect?.();
      if (r && r.width > 20 && r.height > 10 && r.bottom > 0 && r.top < window.innerHeight) return n;
    }
    return null;
  }

  function tryLogin() {
    const tries = ["SpotifyAuth.login","SpotifyAuth.authorize","SpotifyAuth.start","SpotifyAuth.connect"];
    for (const p of tries) { const r = safeCall(p); if (r.ok) return true; }
    const btn = document.querySelector("button[data-spotify-login], button[id*='login'], button[class*='login']");
    if (btn) { try { btn.click(); return true; } catch {} }
    return false;
  }

  function tryLogout() {
    const tries = ["SpotifyAuth.logout","SpotifyAuth.disconnect","SpotifyAuth.clear","SpotifyAuth.reset"];
    for (const p of tries) { const r = safeCall(p); if (r.ok) return true; }
    try {
      localStorage.removeItem("spotify_access_token");
      localStorage.removeItem("SPOTIFY_ACCESS_TOKEN");
      sessionStorage.removeItem("spotify_access_token");
    } catch {}
    return true;
  }

  // placement tweaks requested:
  // "5px πάνω κ 25 αριστερά"
  const SPOTIFY_BTN_SIZE = 22;
  const SPOTIFY_GAP_RIGHT_OF_ONLINE = 10; // base gap
  const SPOTIFY_OFFSET_X = -25;           // 25 left
  const SPOTIFY_OFFSET_Y = -5;            // 5 up

  // jitter control: only move if Online changed position by > threshold px
  const MOVE_THRESHOLD = 4;

  let lastBtnPos = { top: null, left: null };
  let spotifyBtn = null;

  function ensureSpotifyIconNextToOnline() {
    const onlineNode = findOnlineTextNode();
    if (!onlineNode) return;

    if (!spotifyBtn) {
      spotifyBtn = document.getElementById("lmSpotifyOnlineBtn");
    }
    if (!spotifyBtn) {
      spotifyBtn = document.createElement("button");
      spotifyBtn.id = "lmSpotifyOnlineBtn";
      spotifyBtn.setAttribute("type", "button");
      spotifyBtn.setAttribute("aria-label", "Spotify login/logout");
      spotifyBtn.setAttribute("data-sp-controls", "1");
      spotifyBtn.innerHTML = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M7.2 9.7c3.6-1.1 7.8-.7 11.2 1.0" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
  <path d="M7.8 12.5c3.0-.8 6.4-.4 9.2 0.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M8.5 15.2c2.2-.5 4.7-.2 6.7 0.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
</svg>`.trim();

      document.body.appendChild(spotifyBtn);

      spotifyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const logged = !!getToken();
        if (logged) tryLogout();
        else tryLogin();

        setTimeout(syncSpotifyIconState, 80);
        setTimeout(syncSpotifyIconState, 450);
      }, { passive: false });
    }

    // initial place + state
    syncSpotifyIconState();
    positionSpotifyBtnNearOnline(onlineNode, true);
  }

  function syncSpotifyIconState() {
    const btn = document.getElementById("lmSpotifyOnlineBtn");
    if (!btn) return;
    btn.setAttribute("data-logged", getToken() ? "1" : "0");
  }

  function positionSpotifyBtnNearOnline(onlineNode, force = false) {
    const btn = document.getElementById("lmSpotifyOnlineBtn");
    if (!btn || !onlineNode) return;

    const r = onlineNode.getBoundingClientRect();
    const baseTop = Math.round(r.top + (r.height - SPOTIFY_BTN_SIZE) / 2);
    const baseLeft = Math.round(r.right + SPOTIFY_GAP_RIGHT_OF_ONLINE);

    const top = baseTop + SPOTIFY_OFFSET_Y;
    const left = baseLeft + SPOTIFY_OFFSET_X;

    if (!force && lastBtnPos.top != null && lastBtnPos.left != null) {
      const dt = Math.abs(top - lastBtnPos.top);
      const dl = Math.abs(left - lastBtnPos.left);
      if (dt < MOVE_THRESHOLD && dl < MOVE_THRESHOLD) return; // prevent jitter
    }

    btn.style.top = `${top}px`;
    btn.style.left = `${left}px`;
    lastBtnPos = { top, left };
  }
// ---------------- Header / Orb: HARD block playback ----------------
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
    const candidates = Array.from(container.querySelectorAll("div,span,button,a")).slice(0, 220);

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
    for (const p of nsTries) { const r = safeCall(p); if (r.ok) return true; }
    return false;
  }

  function markOriginalHeaderControls(headerEl) {
    if (!headerEl) return null;

    const candidates = Array.from(headerEl.querySelectorAll("button, a, div, span")).slice(0, 650);
    const buttons = candidates.filter(n => {
      const r = n.getBoundingClientRect?.();
      if (!r) return false;
      if (r.width < 22 || r.width > 60) return false;
      if (r.height < 22 || r.height > 60) return false;
      const cs = window.getComputedStyle(n);
      const br = parseFloat(cs.borderRadius || "0");
      return br > 12 || cs.borderRadius === "999px";
    });

    for (const b of buttons) {
      const p = b.closest("div, nav, header, section");
      if (!p) continue;

      const inside = Array.from(p.querySelectorAll("button, a, div, span")).filter(x => {
        const r = x.getBoundingClientRect?.();
        if (!r) return false;
        if (r.width < 22 || r.width > 60) return false;
        if (r.height < 22 || r.height > 60) return false;
        const cs = window.getComputedStyle(x);
        const br = parseFloat(cs.borderRadius || "0");
        return br > 12 || cs.borderRadius === "999px";
      });

      if (inside.length >= 2) {
        p.setAttribute("data-sp-controls", "1");
        return p;
      }
    }
    return null;
  }

  let LM_HEADER_EL = null;
  let LM_ORB_EL = null;
  let LM_CONTROLS_EL = null;

  let blockerInstalled = false;
  function installWindowCaptureBlocker() {
    if (blockerInstalled) return;
    blockerInstalled = true;

    const inHeader = (target) => {
      if (!target || !LM_HEADER_EL) return false;
      return LM_HEADER_EL.contains(target);
    };

    const inAllowedControls = (target) => {
      if (!target) return false;
      if (target.closest && target.closest("[data-sp-controls='1']")) return true;
      return false;
    };

    const killDownOrClick = (e) => {
      if (!inHeader(e.target)) return;

      // allow original controls + fixed spotify icon
      if (inAllowedControls(e.target)) return;

      // orb: show index/stats, never play
      if (LM_ORB_EL && (e.target === LM_ORB_EL || (e.target.closest && e.target.closest("[data-lm-orb='1']")))) {
        try { e.preventDefault(); } catch {}
        try { e.stopImmediatePropagation(); } catch {}
        try { e.stopPropagation(); } catch {}
        callIndexOrStats();
        return;
      }

      // rest of header: block playback triggers
      try { e.preventDefault(); } catch {}
      try { e.stopImmediatePropagation(); } catch {}
      try { e.stopPropagation(); } catch {}
    };

    window.addEventListener("pointerdown", killDownOrClick, { capture: true, passive: false });
    window.addEventListener("mousedown",   killDownOrClick, { capture: true, passive: false });
    window.addEventListener("touchstart",  killDownOrClick, { capture: true, passive: false });
    window.addEventListener("click",       killDownOrClick, { capture: true, passive: false });
  }

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
      LM_CONTROLS_EL = null;
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

    LM_CONTROLS_EL = markOriginalHeaderControls(LM_HEADER_EL);
  }
// ---------------- Click-to-play (IO-based, no crash) ----------------
  function isSessionCoversArea(node) {
    const root = node?.closest?.("section, article, div") || null;
    const txt = ((root?.innerText || node?.innerText || "")).toUpperCase();
    if (!txt) return false;

    if (txt.includes("SESSION COVERS")) return true;

    const hasMirror = txt.includes("MIRROR");
    const hasState = (txt.includes("LISTENING") || txt.includes("IDLE") || txt.includes("OFF"));
    if (hasMirror && (hasState || txt.includes("COVERS"))) return true;

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

  function cleanLine(s) {
    let x = (s || "").replace(/\s+/g, " ").trim();
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
      if (u === "NOW" || u === "RECENT" || u === "TOP" || u === "ECONCERTS") return false;
      if (u === "TRACK" || u === "ARTIST" || u === "ALBUM") return false;
      if (u === "TODAY" || u === "WEEK" || u === "YEAR") return false;
      if (u.includes("SESSION COVERS")) return false;
      if (u === "MIRROR") return false;
      if (u === "LISTENING" || u === "IDLE" || u === "OFF") return false;
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
    const tabs = Array.from(document.querySelectorAll("button,div,span,a")).slice(0, 900);
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

  function getTopMode() {
    const nodes = Array.from(document.querySelectorAll("button, [role='tab'], div, span, a")).slice(0, 1400);
    let foundCluster = false;

    for (const n of nodes) {
      const t = (n.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (t === "track" || t === "artist" || t === "album") foundCluster = true;
      if (!foundCluster) continue;

      const tx = (n.textContent || "").trim().toLowerCase();
      if (tx !== "track" && tx !== "artist" && tx !== "album") continue;

      const ariaSel = n.getAttribute("aria-selected");
      const ariaPress = n.getAttribute("aria-pressed");
      const cls = (n.className || "").toString().toLowerCase();
      if (ariaSel === "true" || ariaPress === "true" || cls.includes("active") || cls.includes("selected")) return tx;
    }
    return null;
  }

  function allowedToBindRow(topMode, row) {
    if (!row) return false;
    if (isSessionCoversArea(row)) return false;
    if (isExplicitNoPlay(row)) return false;
    if (topMode === "artist") return false;
    if (looksLikeArtistOnlyRow(row)) return false;
    return true;
  }

  // --- IO binding ---
  const boundRows = new WeakSet();
  let io = null;

  async function bindRow(row) {
    if (!row || boundRows.has(row)) return;
    boundRows.add(row);

    row.classList.add("spRowPlayable");

    // CAPTURE so it works even if child elements swallow bubbling (fix for "no artwork" rows)
    row.addEventListener("click", async (e) => {
      if (e.target && e.target.closest && e.target.closest("[data-sp-controls='1']")) return;
      if (isSessionCoversArea(e.target) || isSessionCoversArea(row)) return;
      if (isExplicitNoPlay(e.target) || isExplicitNoPlay(row)) return;

      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "a" || tag === "input") return;

      e.preventDefault(); e.stopPropagation();

      const uri = await resolveUriForRow(row);
      if (uri) await playUri(uri);
    }, { passive: false, capture: true });
  }

  function startIntersectionObserver() {
    if (io) return;
    io = new IntersectionObserver((entries) => {
      const topMode = getTopMode();
      for (const ent of entries) {
        if (!ent.isIntersecting) continue;
        const row = ent.target;
        if (!allowedToBindRow(topMode, row)) continue;
        bindRow(row);
      }
    }, { root: null, rootMargin: "900px 0px 900px 0px", threshold: 0.01 });
  }

  function observeRowsLight() {
    startIntersectionObserver();

    const candidates =
      Array.from(document.querySelectorAll("li,[role='listitem']")).slice(0, 900);

    if (candidates.length) {
      for (const r of candidates) io.observe(r);
      return;
    }

    // fallback (light): observe only medium-size blocks (avoid whole DOM)
    const blocks = Array.from(document.querySelectorAll("article, section, div"))
      .slice(0, 900)
      .filter(n => (n.textContent || "").trim().length > 10);

    for (const b of blocks) io.observe(b);
  }

  // ---------------- scheduler (NO scroll heavy work) ----------------
  let scheduled = false;
  function scheduleLightTick() {
    if (scheduled) return;
    scheduled = true;

    const run = () => {
      scheduled = false;
      try { ensureCss(); } catch {}
      try { refreshHeaderRefs(); } catch {}
      try { ensureSpotifyIconNextToOnline(); } catch {}
      try { observeRowsLight(); } catch {}
      try { syncSpotifyIconState(); } catch {}

      // jitter-safe re-position (only if moved enough)
      const onlineNode = findOnlineTextNode();
      if (onlineNode) positionSpotifyBtnNearOnline(onlineNode, false);
    };

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 250 });
    } else {
      setTimeout(run, 120);
    }
  }

  function boot() {
    ensureCss();
    refreshHeaderRefs();
    installWindowCaptureBlocker();
    ensureSpotifyIconNextToOnline();
    observeRowsLight();
    syncSpotifyIconState();

    const mo = new MutationObserver(() => scheduleLightTick());
    mo.observe(document.documentElement, { subtree: true, childList: true });

    // IMPORTANT: no heavy scroll handler. We only do a light tick rarely.
    window.addEventListener("scroll", () => scheduleLightTick(), { passive: true });
    window.addEventListener("resize", () => scheduleLightTick(), { passive: true });

    // periodic safety (keeps icon state correct without jitter)
    setInterval(() => {
      try { syncSpotifyIconState(); } catch {}
      const onlineNode = findOnlineTextNode();
      if (onlineNode) positionSpotifyBtnNearOnline(onlineNode, false);
    }, 1200);

    scheduleLightTick();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

})();