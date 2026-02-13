/* spotify-ui.js — FULL REPLACE (SAFE)
   - Fixed player dock TOP-RIGHT (always visible)
   - Orb click never triggers playback ("Mirror" bug)
   - Play by clicking artwork ONLY inside #topList / #recentList
   - No hiding of other UI, no aggressive observers
*/

(function () {
  "use strict";

  // ---- selectors that are stable in YOUR app.js ----
  const LIST_CONTAINERS = ["#topList", "#recentList"];
  const ORB_SELECTORS = ['[data-lm="orb"]', ".orb", ".statusOrb", ".brandOrb", ".appOrb"];

  // For rows & artwork (your UI uses .row and .thumb)
  const ROW_SELECTORS = [".row", '[data-lm="row"]', ".listRow", ".trackRow", ".topRow"];
  const ART_SELECTORS = [".thumb", ".art", ".artwork", ".cover", '[data-lm="artwork"]'];

  const URI_DATA_KEYS = ["uri", "spotifyUri", "trackUri", "contextUri"];

  const $1 = (sel, root = document) => root.querySelector(sel);

  function safeStop(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // ---------- STYLES ----------
  function ensureStylesOnce() {
    if (document.getElementById("lm-fixedtr-styles")) return;

    const css = `
.lmFixedTR{
  position: fixed;
  top: 14px;
  right: 14px;
  z-index: 2147483647;
  display:flex;
  align-items:center;
  justify-content:flex-end;
  pointer-events: none;
}
.lmFixedTRPill{
  pointer-events: auto;
  display:flex;
  align-items:center;
  gap:10px;
  padding:8px 10px;
  border-radius:999px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: rgba(15,16,18,0.55);
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow: 0 16px 55px rgba(0,0,0,0.55);
  transform: scale(0.85);
  transform-origin: right top;
}
.lmFixedTRBtn{
  width:38px;
  height:38px;
  border-radius:999px;
  display:grid;
  place-items:center;
  background: rgba(0,0,0,0.22);
  border: 1px solid rgba(255,255,255,0.10);
  padding:0;
  margin:0;
  cursor:pointer;
  -webkit-tap-highlight-color: transparent;
}
.lmFixedTRBtn:active{ transform: translateY(1px); }
.lmFixedTRBtn svg{ width:18px; height:18px; }

.lmFixedTRDim{ opacity:0.55; filter: grayscale(1); }
    `.trim();

    const style = document.createElement("style");
    style.id = "lm-fixedtr-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------- SPOTIFY BRIDGE ----------
  function bridge() {
    return window.LMSpotify || window.SpotifyBridge || window.spotifyBridge || null;
  }

  function callSpotify(action, payload) {
    const s = bridge();
    try {
      if (s && typeof s[action] === "function") return s[action](payload);
    } catch {}

    // fallback globals (if you ever used these)
    try {
      if (action === "toggle" && typeof window.spotifyToggle === "function") return window.spotifyToggle();
      if (action === "playUri" && typeof window.spotifyPlayUri === "function") return window.spotifyPlayUri(payload);
      if (action === "login" && typeof window.spotifyLogin === "function") return window.spotifyLogin();
      if (action === "prev" && typeof window.spotifyPrev === "function") return window.spotifyPrev();
      if (action === "next" && typeof window.spotifyNext === "function") return window.spotifyNext();
    } catch {}

    return null;
  }

  function isLinked() {
    const s = bridge();
    try {
      if (!s) return false;
      if (typeof s.isLinked === "function") return !!s.isLinked();
      if (typeof s.isConnected === "function") return !!s.isConnected();
      if ("linked" in s) return !!s.linked;
      if ("isConnected" in s) return !!s.isConnected;
    } catch {}
    return false;
  }

  function isPlaying() {
    const s = bridge();
    try {
      if (!s) return false;
      if (typeof s.getState === "function") {
        const st = s.getState();
        if (st && typeof st.is_playing === "boolean") return st.is_playing;
        if (st && typeof st.isPlaying === "boolean") return st.isPlaying;
      }
      if ("isPlaying" in s) return !!s.isPlaying;
    } catch {}
    return false;
  }

  // ---------- ICONS ----------
  const svg = {
    spotify() {
      return `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path fill="rgba(255,255,255,0.92)" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm4.59 14.52a.75.75 0 0 1-1.03.25c-2.82-1.72-6.36-2.11-10.53-1.16a.75.75 0 1 1-.33-1.46c4.57-1.04 8.5-.6 11.64 1.32a.75.75 0 0 1 .25 1.05Zm1.03-2.5a.9.9 0 0 1-1.23.3c-3.23-1.99-8.15-2.56-11.96-1.4a.9.9 0 1 1-.53-1.72c4.35-1.33 9.76-.68 13.47 1.61a.9.9 0 0 1 .25 1.21Zm.09-2.63c-3.87-2.3-10.25-2.51-13.95-1.39a1.05 1.05 0 1 1-.61-2.01c4.26-1.29 11.35-1.04 15.83 1.62a1.05 1.05 0 1 1-1.27 1.78Z"/>
</svg>`.trim();
    },
    prev() {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="rgba(255,255,255,0.92)" d="M6 6h2v12H6V6zm3.5 6 10 6V6l-10 6z"/></svg>`;
    },
    next() {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="rgba(255,255,255,0.92)" d="M16 6h2v12h-2V6zM4.5 18l10-6-10-6v12z"/></svg>`;
    },
    play() {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="rgba(255,255,255,0.92)" d="M8 5v14l11-7L8 5z"/></svg>`;
    },
    pause() {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="rgba(255,255,255,0.92)" d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/></svg>`;
    },
  };

  // ---------- FIXED DOCK ----------
  function renderDock() {
    ensureStylesOnce();

    let host = document.querySelector(".lmFixedTR");
    if (!host) {
      host = document.createElement("div");
      host.className = "lmFixedTR";
      document.body.appendChild(host);
    }

    let pill = host.querySelector(".lmFixedTRPill");
    if (!pill) {
      pill = document.createElement("div");
      pill.className = "lmFixedTRPill";
      host.appendChild(pill);
    }

    if (!pill.querySelector('[data-lmtr="spotify"]')) {
      pill.innerHTML = `
        <button class="lmFixedTRBtn" data-lmtr="spotify" aria-label="Spotify">${svg.spotify()}</button>
        <button class="lmFixedTRBtn" data-lmtr="prev" aria-label="Previous">${svg.prev()}</button>
        <button class="lmFixedTRBtn" data-lmtr="toggle" aria-label="Play/Pause">${svg.play()}</button>
        <button class="lmFixedTRBtn" data-lmtr="next" aria-label="Next">${svg.next()}</button>
      `.trim();

      pill.addEventListener(
        "click",
        (e) => {
          const btn = e.target.closest("button[data-lmtr]");
          if (!btn) return;
          safeStop(e);

          const key = btn.getAttribute("data-lmtr");
          if (key === "spotify") return callSpotify("login");
          if (key === "prev") return callSpotify("prev");
          if (key === "next") return callSpotify("next");
          if (key === "toggle") return callSpotify("toggle");
        },
        true
      );
    }

    const toggle = pill.querySelector('[data-lmtr="toggle"]');
    if (toggle) toggle.innerHTML = isPlaying() ? svg.pause() : svg.play();

    const sp = pill.querySelector('[data-lmtr="spotify"]');
    if (sp) {
      if (isLinked()) sp.classList.remove("lmFixedTRDim");
      else sp.classList.add("lmFixedTRDim");
    }
  }

  // ---------- ORB CLICK BLOCK ----------
  function fixOrb() {
    const orb = firstExistingSelector(ORB_SELECTORS);
    if (!orb) return;

    orb.addEventListener(
      "click",
      (e) => {
        safeStop(e);
        if (typeof window.openStats === "function") window.openStats();
      },
      { capture: true }
    );
  }

  function firstExistingSelector(selectors, root = document) {
    for (const s of selectors) {
      try {
        const el = $1(s, root);
        if (el) return el;
      } catch {}
    }
    return null;
  }

  // ---------- PLAY BY CLICKING ARTWORK (TOP/RECENT ONLY) ----------
  function getRowUri(row) {
    if (!row) return "";
    for (const k of URI_DATA_KEYS) {
      const v = row.dataset ? row.dataset[k] : "";
      if (v) return v;
    }

    const any = row.querySelector("[data-uri], [data-spotify-uri], [data-track-uri]");
    if (any) return any.dataset.uri || any.dataset.spotifyUri || any.dataset.trackUri || "";

    const a = row.querySelector('a[href^="spotify:"], a[href*="open.spotify.com"]');
    if (a) return a.getAttribute("href") || "";

    return "";
  }

  function isInsideAllowedList(node) {
    return LIST_CONTAINERS.some((sel) => !!node.closest(sel));
  }

  function enableArtworkClicks() {
    document.addEventListener(
      "click",
      (e) => {
        const t = e.target;

        // ignore dock clicks
        if (t.closest(".lmFixedTRPill")) return;

        // orb is blocked elsewhere
        if (ORB_SELECTORS.some((s) => t.closest(s))) return;

        const row = t.closest(ROW_SELECTORS.join(","));
        if (!row) return;

        // Only Top/Recent lists (not artists list / other panels)
        if (!isInsideAllowedList(row)) return;

        const art = t.closest(ART_SELECTORS.join(","));
        if (!art) return;

        const uri = getRowUri(row);
        if (!uri) return;

        safeStop(e);
        callSpotify("playUri", uri);
      },
      true
    );
  }

  // ---------- BOOT ----------
  function boot() {
    fixOrb();
    enableArtworkClicks();

    renderDock();
    // light refresh (no heavy observers)
    setInterval(renderDock, 1200);

    // if DOM changes, re-apply orb fix (safe)
    const mo = new MutationObserver(() => {
      fixOrb();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();