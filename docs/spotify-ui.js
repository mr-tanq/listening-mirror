/* spotify-ui.js (FULL REPLACE) — PART 1/4
   Only changes requested:
   - Spotify icon +10px right
   - Glyph left of "Listening Mirror" toggles play/pause
*/

(function () {
  "use strict";

  const API_BASE = String(window.LISTENING_MIRROR_API || "https://i.errtanq9.workers.dev").replace(/\/+$/, "");

  // ---------------- helpers ----------------
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
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
/* --- Click-to-play affordance --- */
.spArtworkPlayable{ cursor: pointer !important; border-radius: 12px; }
.spRowPlayable{ cursor: pointer !important; }

/* --- Spotify icon button (always visible) --- */
#lmSpotifyBtn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:18px;
  height:18px;
  border-radius:999px;
  border:0;
  padding:0;
  margin:0;
  background:transparent;
  line-height:1;
  cursor:pointer;
  opacity:1;
  user-select:none;
  -webkit-tap-highlight-color: transparent;
}
#lmSpotifyBtn svg{ width:18px; height:18px; display:block; }
#lmSpotifyBtn.lmOff{ opacity:.35; filter: grayscale(1); }
#lmSpotifyBtn.lmOn{ opacity:.95; filter:none; }

/* Placement: -5px up, +35px right from the "Online" label area (was +25px) */
.lmOnlineRow{ position:relative !important; }
#lmSpotifyBtn{
  position:absolute !important;
  top:50% !important;
  transform: translate(55px, calc(-50% - 5px)) !important;
  left:0 !important;
}

/* Important: NEVER block tabs */
[data-lm-tab="1"], [data-lm-tab="1"] *{
  pointer-events:auto !important;
}

/* Safety: don't let our injected button be blocked by any pointer-events rules */
#lmSpotifyBtn, #lmSpotifyBtn *{ pointer-events:auto !important; }
    `.trim();

    const st = document.createElement("style");
    st.id = "spotifyUiCss";
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------------- Spotify Web API fallback ----------------
  async function spotifyApi(endpoint, method = "GET", body = null) {
    const token = getToken();
    if (!token) return { ok: false, status: 401, json: null };
    try {
      const r = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        method,
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : null
      });

      let json = null;
      try { json = await r.json(); } catch {}
      return { ok: r.ok, status: r.status, json };
    } catch {
      return { ok: false, status: 0, json: null };
    }
  }

  async function apiPlayUri(uri) {
    if (!uri || typeof uri !== "string") return false;
    const m = uri.match(/^spotify:track:([A-Za-z0-9]{22})$/);
    if (!m) return false;
    return !!(await spotifyApi("/me/player/play", "PUT", { uris: [uri] })).ok;
  }

  async function apiTogglePlayPause() {
    const st = await spotifyApi("/me/player", "GET");
    if (!st.ok) return false;

    const isPlaying = !!st.json?.is_playing;

    if (isPlaying) {
      const r = await spotifyApi("/me/player/pause", "PUT");
      return !!r.ok;
    } else {
      const r = await spotifyApi("/me/player/play", "PUT");
      return !!r.ok;
    }
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

  async function togglePlayPause() {
    let r = safeCall("SpotifyPlayer.togglePlay");
    if (r.ok) return true;

    const ok = await apiTogglePlayPause();
    return !!ok;
  }
/* spotify-ui.js (FULL REPLACE) — PART 2/4 */

  // ---------------- Header / Glyph / Spotify icon ----------------

  function findHeaderTitleNode() {
    const nodes = $$("h1,h2,h3,div,span").slice(0, 1200);
    for (const n of nodes) {
      const t = (n.textContent || "").trim();
      if (t === "Listening Mirror") {
        const r = n.getBoundingClientRect?.();
        if (r && r.width > 120 && r.height > 16 && r.bottom > 0 && r.top < window.innerHeight) return n;
      }
    }
    for (const n of nodes) {
      const t = (n.textContent || "").trim();
      if (t.includes("Listening Mirror")) {
        const r = n.getBoundingClientRect?.();
        if (r && r.width > 120 && r.height > 16 && r.bottom > 0 && r.top < window.innerHeight) return n;
      }
    }
    return null;
  }

  function pickCompactHeaderContainer(titleNode) {
    if (!titleNode) return null;

    const chain = [];
    let cur = titleNode;
    for (let i = 0; i < 8 && cur; i++) {
      cur = cur.parentElement;
      if (cur) chain.push(cur);
    }

    for (const el of chain) {
      const r = el.getBoundingClientRect?.();
      if (!r) continue;
      if (r.height >= 40 && r.height <= 170) return el;
    }

    return (
      titleNode.closest("header") ||
      titleNode.closest("section") ||
      titleNode.closest("article") ||
      titleNode.closest("div") ||
      titleNode.parentElement ||
      null
    );
  }

  function findOnlineLabelNode(headerEl) {
    if (!headerEl) return null;

    const candidates = $$("div,span,p", headerEl).slice(0, 300);
    for (const n of candidates) {
      const t = (n.textContent || "").trim().toLowerCase();
      if (t === "online") return n;
    }
    return null;
  }

  // NEW: pick the glyph that is immediately left of the title (guaranteed)
  function findGlyphLeftOfTitle(titleNode) {
    if (!titleNode) return null;

    const titleRect = titleNode.getBoundingClientRect?.();
    if (!titleRect) return null;

    const container =
      titleNode.parentElement ||
      titleNode.closest("header") ||
      titleNode.closest("div") ||
      null;

    if (!container) return null;

    const candidates = Array.from(container.children || []);
    // If titleNode itself isn't a direct child, fallback to query within container
    const pool = candidates.length ? candidates : $$("div,span,button,a", container).slice(0, 80);

    let best = null;
    let bestScore = Infinity;

    for (const n of pool) {
      if (!n || n === titleNode) continue;

      const r = n.getBoundingClientRect?.();
      if (!r) continue;

      // small, roundish element near left of title
      const small = r.width >= 10 && r.width <= 60 && r.height >= 10 && r.height <= 60;
      if (!small) continue;

      const cs = window.getComputedStyle(n);
      const br = parseFloat(cs.borderRadius || "0");
      const roundish = br > 12 || cs.borderRadius === "999px";
      if (!roundish) continue;

      const sameLine = Math.abs(((r.top + r.bottom) / 2) - ((titleRect.top + titleRect.bottom) / 2)) < 42;
      if (!sameLine) continue;

      const isLeft = r.right <= titleRect.left + 8;
      if (!isLeft) continue;

      const dx = Math.abs(titleRect.left - r.right);
      const dy = Math.abs(((titleRect.top + titleRect.bottom) / 2) - ((r.top + r.bottom) / 2));
      const score = dx + dy * 2;

      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }

    return best;
  }

  function svgSpotify() {
    return `
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm4.59 14.37a.75.75 0 0 1-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.15a.75.75 0 1 1-.34-1.46c4.55-1.05 8.45-.6 11.6 1.31.36.22.47.68.32 1.05zm1.05-2.6a.9.9 0 0 1-1.24.3c-3.23-1.98-8.16-2.55-11.99-1.38a.9.9 0 0 1-.53-1.72c4.37-1.33 9.81-.69 13.54 1.6.42.25.55.79.22 1.2zm.12-2.71c-3.73-2.22-9.9-2.43-13.45-1.35a1.05 1.05 0 0 1-.61-2.01c4.08-1.24 10.87-1 15.22 1.6a1.05 1.05 0 0 1-1.16 1.76z"/>
</svg>`.trim();
  }

  function ensureSpotifyIconNearOnline(headerEl) {
    if (!headerEl) return;

    const onlineNode = findOnlineLabelNode(headerEl);
    if (!onlineNode) return;

    const row = onlineNode.parentElement || onlineNode;
    row.classList.add("lmOnlineRow");

    let btn = document.getElementById("lmSpotifyBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "lmSpotifyBtn";
      btn.type = "button";
      btn.setAttribute("aria-label", "Spotify login/logout");
      btn.innerHTML = svgSpotify();

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const token = getToken();

        if (!token) {
          if (window.SpotifyAuth) {
            const r1 = safeCall("SpotifyAuth.login");
            if (r1.ok) return;
            const r2 = safeCall("SpotifyAuth.authorize");
            if (r2.ok) return;
            const r3 = safeCall("SpotifyAuth.connect");
            if (r3.ok) return;
          }
          console.warn("[Spotify UI] No SpotifyAuth login method found.");
          return;
        } else {
          if (window.SpotifyAuth) {
            const r1 = safeCall("SpotifyAuth.logout");
            if (r1.ok) return;
            const r2 = safeCall("SpotifyAuth.disconnect");
            if (r2.ok) return;
          }
          if (window.SpotifyAuth) {
            safeCall("SpotifyAuth.login");
          }
        }
      }, { passive: false });
    }

    if (btn.parentElement !== row) {
      row.appendChild(btn);
    }

    const token = getToken();
    btn.classList.toggle("lmOn", !!token);
    btn.classList.toggle("lmOff", !token);
  }

  function markTabsClickable() {
    const tabTexts = new Set(["now", "recent", "top", "econcerts"]);
    const nodes = $$("button,a,div,span").slice(0, 1200);
    for (const n of nodes) {
      const t = (n.textContent || "").trim().toLowerCase();
      if (!tabTexts.has(t)) continue;
      const p = n.closest("[role=tablist], nav, header, section, div");
      if (p) p.setAttribute("data-lm-tab", "1");
    }
  }

  let LM_TITLE = null;
  let LM_HEADER = null;
  let LM_ORB = null;

  function bindOrbAsPlayPause() {
    if (!LM_ORB) return;
    if (LM_ORB.dataset && LM_ORB.dataset.lmOrbBound === "1") return;

    LM_ORB.dataset.lmOrbBound = "1";

    LM_ORB.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!getToken()) return;
      await togglePlayPause();
    }, { passive: false });
  }

  function refreshHeader() {
    LM_TITLE = findHeaderTitleNode();
    if (!LM_TITLE) {
      LM_HEADER = null;
      LM_ORB = null;
      return;
    }

    LM_HEADER = pickCompactHeaderContainer(LM_TITLE);
    if (!LM_HEADER) return;

    // CHANGE: force the glyph left of title to be the orb for play/pause
    LM_ORB = findGlyphLeftOfTitle(LM_TITLE) || null;
    bindOrbAsPlayPause();

    ensureSpotifyIconNearOnline(LM_HEADER);
    markTabsClickable();
  }
/* spotify-ui.js (FULL REPLACE) — PART 3/4 */

  // ---------------- Click-to-play (delegated) ----------------

  function isExplicitNoPlay(node) {
    return !!(node?.closest?.("[data-sp-no-play='1']"));
  }

  function isInsideHeaderOrTabs(node) {
    if (!node) return false;
    if (node.closest && node.closest("#lmSpotifyBtn")) return true;
    if (node.closest && node.closest("[data-lm-tab='1']")) return true;
    if (LM_HEADER && node.closest && node.closest("*") && LM_HEADER.contains(node)) return true;
    if (node.closest && node.closest("[role=tablist], nav")) return true;
    return false;
  }

  function isUiControlTarget(node) {
    if (!node) return false;
    const tag = (node.tagName || "").toLowerCase();
    if (tag === "button" || tag === "a" || tag === "input" || tag === "textarea" || tag === "select") return true;

    const role = (node.getAttribute?.("role") || "").toLowerCase();
    if (role === "tab" || role === "button" || role === "link") return true;

    return false;
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

  function normalizeArtistLine(line) {
    const s = (line || "").trim();
    if (!s) return "";
    const parts = s.split("•").map(x => x.trim()).filter(Boolean);
    return parts.length ? parts[0] : s;
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
    if (l1 && /^[\d,.\s]+$/.test(l1)) return true;
    return false;
  }

  async function resolveUriForRow(row) {
    const u0 = extractSpotifyUriFromNode(row);
    if (u0) return u0;

    const { artist, track } = guessArtistTrackFromRow(row);
    const a = (artist || "").trim();
    const t = (track || "").trim();
    if (!a || !t) return "";
    if (a.endsWith("…") || t.endsWith("…")) return "";

    const q = `${a} ${t}`.trim();

    try {
      const r = await fetch(`${API_BASE}/resolve?q=${encodeURIComponent(q)}`, { method: "GET" });
      if (!r.ok) return "";
      const j = await r.json();
      const id = j?.best?.id;
      if (id && /^[A-Za-z0-9]{22}$/.test(id)) return `spotify:track:${id}`;
    } catch {}

    return "";
  }

  function findRowFromTarget(target) {
    if (!target) return null;

    const row =
      target.closest?.("li") ||
      target.closest?.("[role='listitem']") ||
      null;

    if (!row) return null;

    if (isInsideHeaderOrTabs(row)) return null;
    if (isExplicitNoPlay(row)) return null;
    if (looksLikeArtistOnlyRow(row)) return null;

    return row;
  }

  async function handleDocumentClick(e) {
    if (!getToken()) return;

    const target = e.target;
    if (!target) return;

    if (isInsideHeaderOrTabs(target)) return;
    if (isUiControlTarget(target)) return;
    if (isExplicitNoPlay(target)) return;

    const row = findRowFromTarget(target);
    if (!row) return;

    const innerControl = target.closest?.("a,button,input,[role='button'],[role='link'],[role='tab']");
    if (innerControl) return;

    row.classList.add("spRowPlayable");

    e.preventDefault();
    e.stopPropagation();

    const uri = await resolveUriForRow(row);
    if (uri) await playUri(uri);
  }
/* spotify-ui.js (FULL REPLACE) — PART 4/4 */

  // ---------------- Boot / observers (no heavy loops) ----------------

  let clickBound = false;

  function boot() {
    ensureCss();
    refreshHeader();

    if (!clickBound) {
      clickBound = true;
      document.addEventListener("click", handleDocumentClick, { passive: false, capture: false });
    }

    const refreshDebounced = debounce(() => {
      ensureCss();
      refreshHeader();
      const btn = document.getElementById("lmSpotifyBtn");
      if (btn) {
        const token = getToken();
        btn.classList.toggle("lmOn", !!token);
        btn.classList.toggle("lmOff", !token);
      }
    }, 120);

    const mo = new MutationObserver(() => refreshDebounced());
    mo.observe(document.documentElement, { subtree: true, childList: true });

    window.addEventListener("resize", refreshDebounced, { passive: true });
    window.addEventListener("orientationchange", refreshDebounced, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();