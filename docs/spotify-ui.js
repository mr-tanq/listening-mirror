/* spotify-ui.js (FULL REPLACE)
   Fixes:
   - Spotify icon now FIXED-positioned exactly next to "Online" (red X spot), not inside layout (no wrapping)
   - Classic Spotify look: green when logged in, grey when logged out
   - Keeps: header blocker, row click-to-play, no-play for MIRROR/SESSION COVERS, scroll safety
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
}
#lmSpotifyOnlineBtn svg{ width:14px; height:14px; display:block; }

#lmSpotifyOnlineBtn[data-logged="1"]{
  background:#1DB954; /* classic Spotify green */
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
// ---------------- ALWAYS-visible Spotify icon next to "Online" (fixed-position) ----------------
  function findOnlineTextNode() {
    const nodes = Array.from(document.querySelectorAll("span,div,p,small")).slice(0, 2800);
    for (const n of nodes) {
      const t = (n.textContent || "").trim();
      if (t !== "Online") continue;
      const r = n.getBoundingClientRect?.();
      if (r && r.width > 20 && r.height > 10 && r.bottom > 0 && r.top < window.innerHeight) return n;
    }
    return null;
  }

  function tryLogin() {
    const tries = [
      "SpotifyAuth.login",
      "SpotifyAuth.authorize",
      "SpotifyAuth.start",
      "SpotifyAuth.connect",
    ];
    for (const p of tries) {
      const r = safeCall(p);
      if (r.ok) return true;
    }
    const btn = document.querySelector("button[data-spotify-login], button[id*='login'], button[class*='login']");
    if (btn) { try { btn.click(); return true; } catch {} }
    return false;
  }

  function tryLogout() {
    const tries = [
      "SpotifyAuth.logout",
      "SpotifyAuth.disconnect",
      "SpotifyAuth.clear",
      "SpotifyAuth.reset",
    ];
    for (const p of tries) {
      const r = safeCall(p);
      if (r.ok) return true;
    }
    try {
      localStorage.removeItem("spotify_access_token");
      localStorage.removeItem("SPOTIFY_ACCESS_TOKEN");
      sessionStorage.removeItem("spotify_access_token");
    } catch {}
    return true;
  }

  function ensureSpotifyIconNextToOnline() {
    const onlineNode = findOnlineTextNode();
    if (!onlineNode) return;

    let btn = document.getElementById("lmSpotifyOnlineBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "lmSpotifyOnlineBtn";
      btn.setAttribute("type", "button");
      btn.setAttribute("aria-label", "Spotify login/logout");

      // IMPORTANT: allow clicks even with header blocker
      btn.setAttribute("data-sp-controls", "1");

      // Classic-ish Spotify mark (3 arcs) — we color via CSS above
      btn.innerHTML = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M7.2 9.7c3.6-1.1 7.8-.7 11.2 1.0" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
  <path d="M7.8 12.5c3.0-.8 6.4-.4 9.2 0.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M8.5 15.2c2.2-.5 4.7-.2 6.7 0.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
</svg>`.trim();

      document.body.appendChild(btn);

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const logged = !!getToken();
        if (logged) tryLogout();
        else tryLogin();

        setTimeout(syncSpotifyIconStateAndPosition, 80);
        setTimeout(syncSpotifyIconStateAndPosition, 400);
      }, { passive: false });
    }

    // place it exactly where you draw the red X: right of Online, centered vertically
    const r = onlineNode.getBoundingClientRect();
    const size = 22;
    const gap = 10;

    const top = Math.round(r.top + (r.height - size) / 2);
    const left = Math.round(r.right + gap);

    btn.style.top = `${top}px`;
    btn.style.left = `${left}px`;

    syncSpotifyIconStateAndPosition();
  }

  function syncSpotifyIconStateAndPosition() {
    const btn = document.getElementById("lmSpotifyOnlineBtn");
    if (!btn) return;

    const logged = !!getToken();
    btn.setAttribute("data-logged", logged ? "1" : "0");

    // keep position accurate (Online may move slightly with renders)
    const onlineNode = findOnlineTextNode();
    if (!onlineNode) return;

    const r = onlineNode.getBoundingClientRect();
    const size = 22;
    const gap = 10;

    const top = Math.round(r.top + (r.height - size) / 2);
    const left = Math.round(r.right + gap);

    btn.style.top = `${top}px`;
    btn.style.left = `${left}px`;
  }
// ---------------- Header / Orb: HARD block playback, but NOT the original controls ----------------
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
    for (const p of nsTries) {
      const r = safeCall(p);
      if (r.ok) return true;
    }
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
      return LM_HEADER_EL.confirm ? LM_HEADER_EL.contains(target) : LM_HEADER_EL.contains(target);
    };

    const inAllowedControls = (target) => {
      if (!target) return false;
      if (target.closest && target.closest("[data-sp-controls='1']")) return true;
      return false;
    };

    const killDownOrClick = (e) => {
      if (!inHeader(e.target)) return;

      // allow original Spotify controls + FIXED spotify icon (data-sp-controls)
      if (inAllowedControls(e.target)) return;

      // orb: show index, never play
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
// ---------------- List click-to-play + scroll-safe binding (same as before) ----------------
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
    const tabs = Array.from(document.querySelectorAll("button,div,span,a")).slice(0, 800);
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

    const kids = Array.from(row.querySelectorAll?.("div, span, a") || []).slice(0, 80);
    for (const n of kids) {
      if (isSessionCoversArea(n) || isExplicitNoPlay(n)) continue;
      const rr = n.getBoundingClientRect?.();
      if (!rectIsSquareish(rr)) continue;
      return n;
    }
    return null;
  }

  function guessRows() {
    const li = Array.from(document.querySelectorAll("li,[role='listitem']")).slice(0, 600);
    if (li.length) return li;

    return Array.from(document.querySelectorAll("div, article, section"))
      .slice(0, 800)
      .filter((n) => (n.textContent || "").trim().length > 6);
  }

  function getTopMode() {
    const nodes = Array.from(document.querySelectorAll("button, [role='tab'], div, span, a")).slice(0, 1200);
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

  function nearViewport(el, pad = 900) {
    const r = el.getBoundingClientRect?.();
    if (!r) return false;
    return (r.bottom >= -pad) && (r.top <= (window.innerHeight + pad));
  }

  async function bindRow(row) {
    if (!row || row.dataset.spRowBound === "1") return;

    row.dataset.spRowBound = "1";
    row.classList.add("spRowPlayable");

    row.addEventListener("click", async (e) => {
      if (e.target && e.target.closest && e.target.closest("[data-sp-controls='1']")) return;
      if (isSessionCoversArea(e.target) || isSessionCoversArea(row)) return;
      if (isExplicitNoPlay(e.target) || isExplicitNoPlay(row)) return;

      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "button" || tag === "a" || tag === "input") return;

      e.preventDefault(); e.stopPropagation();
      const uri = await resolveUriForRow(row);
      if (uri) await playUri(uri);
    }, { passive: false });

    const art = getArtworkClickable(row);
    if (art && art.dataset.spBound !== "1") {
      art.dataset.spBound = "1";
      art.classList.add("spArtworkPlayable");

      art.addEventListener("click", async (e) => {
        if (e.target && e.target.closest && e.target.closest("[data-sp-controls='1']")) return;
        if (isSessionCoversArea(e.target) || isSessionCoversArea(row)) return;
        if (isExplicitNoPlay(e.target) || isExplicitNoPlay(row)) return;

        e.preventDefault(); e.stopPropagation();
        const uri = await resolveUriForRow(row);
        if (uri) await playUri(uri);
      }, { passive: false });
    }
  }

  function attachPlayBindingsLight() {
    if (!getToken()) return;

    const topMode = getTopMode();
    const rows = guessRows();

    for (const row of rows) {
      if (!nearViewport(row)) continue;
      if (!allowedToBindRow(topMode, row)) continue;
      bindRow(row);
    }
  }

  // ---------------- scheduler: debounce scroll + mutation ----------------
  let scheduled = false;
  let lastRun = 0;

  function scheduleAttach() {
    if (scheduled) return;
    scheduled = true;

    const run = () => {
      scheduled = false;
      const now = Date.now();
      if (now - lastRun < 120) return;
      lastRun = now;

      try { ensureCss(); } catch {}
      try { refreshHeaderRefs(); } catch {}
      try { ensureSpotifyIconNextToOnline(); } catch {}
      try { attachPlayBindingsLight(); } catch {}
      try { syncSpotifyIconStateAndPosition(); } catch {}
    };

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 200 });
    } else {
      setTimeout(run, 80);
    }
  }

  function boot() {
    ensureCss();
    refreshHeaderRefs();
    installWindowCaptureBlocker();
    ensureSpotifyIconNextToOnline();

    const mo = new MutationObserver(() => scheduleAttach());
    mo.observe(document.documentElement, { subtree: true, childList: true });

    window.addEventListener("scroll", () => scheduleAttach(), { passive: true });
    window.addEventListener("resize", () => scheduleAttach(), { passive: true });

    scheduleAttach();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

})();