/* spotify-ui.js — FULL REPLACE (PART 1/2)
   Fix: Dock hidden behind tabs -> mount INSIDE tabs pill with z-index
*/
(function () {
  "use strict";

  const CFG = {
    tabsBarSelectors: [
      '[data-lm="tabsbar"]',
      ".tabsBar",
      ".tabs",
      ".segmentedTabs",
      ".navTabs",
      ".segmented",
      ".segmented-control",
    ],
    // the actual pill container that holds Now/Recent/Top
    tabsPillSelectors: [
      '[data-lm="tabsPill"]',
      ".tabsPill",
      ".segmentedPill",
      ".segmented",
      ".segmented-control",
      ".tabsBar",
      ".tabs",
    ],
    playerDockSelectors: [
      '[data-lm="playerDock"]',
      ".playerDock",
      ".playerControlsDock",
      ".playerControls",
      ".spotifyControls",
      ".lmDock",
    ],
    orbSelectors: ['[data-lm="orb"]', ".orb", ".statusOrb", ".brandOrb", ".appOrb"],
    listRowSelectors: ['[data-lm="row"]', ".row", ".listRow", ".trackRow", ".topRow", ".itemRow"],
    artworkSlotSelectors: [
      '[data-lm="artwork"]',
      ".art",
      ".artwork",
      ".cover",
      ".thumb",
      ".imgWrap",
      ".media",
      ".artSlot",
      ".lmGeneratedArtSlot",
    ],
    uriDatasetKeys: ["uri", "spotifyUri", "trackUri", "contextUri"],
  };

  const $1 = (sel, root = document) => root.querySelector(sel);

  function firstExistingSelector(selectors, root = document) {
    for (const s of selectors) {
      try {
        const el = $1(s, root);
        if (el) return el;
      } catch {}
    }
    return null;
  }

  function safeStop(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function ensureStylesOnce() {
    if (document.getElementById("lm-dock-styles")) return;

    const css = `
/* --- Dock inside tabs pill --- */
.lmTabsPillHost{
  position: relative !important;
  overflow: visible !important;
  padding-right: 150px !important; /* space for dock so Top isn't covered */
}

.lmDockInTabs{
  position: absolute !important;
  top: 50% !important;
  right: 12px !important;
  transform: translateY(-50%) scale(0.85); /* -15% */
  transform-origin: right center;
  z-index: 9999 !important;
  pointer-events: auto !important;
}

.lmDockPill{
  display:flex; align-items:center; gap:10px;
  padding:8px 10px;
  border-radius:999px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 10px 30px rgba(0,0,0,0.25);
}

.lmDock{
  display:flex; align-items:center; gap:10px;
}

.lmBtn{
  width:38px; height:38px;
  border-radius:999px;
  display:grid; place-items:center;
  background: rgba(0,0,0,0.18);
  border: 1px solid rgba(255,255,255,0.08);
  padding:0; margin:0;
}
.lmBtn:active{ transform: translateY(1px); }
.lmBtn svg{ width:18px; height:18px; }

.lmGeneratedArtSlot{
  width:56px; height:56px;
  border-radius:18px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  display:grid; place-items:center;
  flex:0 0 auto;
}
.lmGeneratedArtSlot svg{ width:18px; height:18px; }
    `.trim();

    const style = document.createElement("style");
    style.id = "lm-dock-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------- SPOTIFY PLAYBACK BRIDGE (no backend change) ----------
  function callSpotify(action, payload) {
    const s = window.LMSpotify || window.SpotifyBridge || window.spotifyBridge || null;
    try {
      if (s && typeof s[action] === "function") return s[action](payload);
    } catch {}
    try {
      if (action === "toggle" && typeof window.spotifyToggle === "function") return window.spotifyToggle();
      if (action === "playUri" && typeof window.spotifyPlayUri === "function") return window.spotifyPlayUri(payload);
      if (action === "login" && typeof window.spotifyLogin === "function") return window.spotifyLogin();
      if (action === "logout" && typeof window.spotifyLogout === "function") return window.spotifyLogout();
      if (action === "prev" && typeof window.spotifyPrev === "function") return window.spotifyPrev();
      if (action === "next" && typeof window.spotifyNext === "function") return window.spotifyNext();
    } catch {}
    return null;
  }

  function svgIcon(name) {
    if (name === "spotify") return `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="rgba(255,255,255,0.9)"
      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.57 14.36a.8.8 0 0 1-1.1.26c-3.02-1.85-6.82-2.27-11.3-1.25a.8.8 0 0 1-.36-1.56c4.9-1.12 9.12-.64 12.5 1.43.38.23.5.72.26 1.12zm1.05-2.48a.95.95 0 0 1-1.3.31c-3.46-2.13-8.73-2.75-12.82-1.5a.95.95 0 1 1-.56-1.81c4.67-1.43 10.47-.74 14.44 1.7.45.28.6.87.24 1.3zm.1-2.58C14.6 9.5 8.56 9.32 5.15 10.35a1.1 1.1 0 1 1-.63-2.1c3.91-1.18 10.63-.95 14.74 1.44a1.1 1.1 0 0 1-1.1 1.9z"/></svg>`;
    if (name === "prev") return `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="rgba(255,255,255,0.9)"
      d="M6 6h2v12H6V6zm3.5 6 10-6v12l-10-6z"/></svg>`;
    if (name === "next") return `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="rgba(255,255,255,0.9)"
      d="M16 6h2v12h-2V6zM6 6l10 6-10 6V6z"/></svg>`;
    if (name === "play") return `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="rgba(255,255,255,0.9)"
      d="M8 5v14l11-7z"/></svg>`;
    if (name === "pause") return `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="rgba(255,255,255,0.45)"
      d="M7 6h4v12H7V6zm6 0h4v12h-4V6z"/></svg>`;
    if (name === "note") return `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="rgba(255,255,255,0.45)"
      d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>`;
    return "";
  }
/* spotify-ui.js — FULL REPLACE (PART 2/2)
   Inject dock + mount inside tabs pill + artwork click play + orb fix
*/
  function buildDock() {
    const dock = document.createElement("div");
    dock.className = "lmDock";
    dock.setAttribute("data-lm", "playerDock");

    const btnSpotify = document.createElement("button");
    btnSpotify.className = "lmBtn";
    btnSpotify.type = "button";
    btnSpotify.setAttribute("aria-label", "Spotify login/logout");
    btnSpotify.innerHTML = svgIcon("spotify");

    const btnPrev = document.createElement("button");
    btnPrev.className = "lmBtn";
    btnPrev.type = "button";
    btnPrev.setAttribute("aria-label", "Previous");
    btnPrev.innerHTML = svgIcon("prev");

    const btnToggle = document.createElement("button");
    btnToggle.className = "lmBtn";
    btnToggle.type = "button";
    btnToggle.setAttribute("aria-label", "Play/Pause");
    btnToggle.innerHTML = svgIcon("play");

    const btnNext = document.createElement("button");
    btnNext.className = "lmBtn";
    btnNext.type = "button";
    btnNext.setAttribute("aria-label", "Next");
    btnNext.innerHTML = svgIcon("next");

    btnSpotify.addEventListener("click", (e) => {
      safeStop(e);
      const s = window.LMSpotify || window.SpotifyBridge || window.spotifyBridge || null;
      const linked = !!(s && (s.linked === true || s.isConnected === true || (typeof s.isLinked === "function" && s.isLinked())));
      callSpotify(linked ? "logout" : "login");
    });
    btnPrev.addEventListener("click", (e) => { safeStop(e); callSpotify("prev"); });
    btnNext.addEventListener("click", (e) => { safeStop(e); callSpotify("next"); });
    btnToggle.addEventListener("click", (e) => { safeStop(e); callSpotify("toggle"); });

    dock.appendChild(btnSpotify);
    dock.appendChild(btnPrev);
    dock.appendChild(btnToggle);
    dock.appendChild(btnNext);

    return dock;
  }

  function ensureDock() {
    let dock = firstExistingSelector(CFG.playerDockSelectors);
    if (dock) return dock;
    dock = buildDock();
    document.body.appendChild(dock);
    return dock;
  }

  function mountDockInsideTabs() {
    ensureStylesOnce();

    const tabsBar = firstExistingSelector(CFG.tabsBarSelectors);
    if (!tabsBar) return false;

    const pill = firstExistingSelector(CFG.tabsPillSelectors, tabsBar) || tabsBar;
    pill.classList.add("lmTabsPillHost");

    let host = pill.querySelector(".lmDockInTabs");
    if (!host) {
      host = document.createElement("div");
      host.className = "lmDockInTabs";
      pill.appendChild(host);
    }

    let pillWrap = host.querySelector(".lmDockPill");
    if (!pillWrap) {
      pillWrap = document.createElement("div");
      pillWrap.className = "lmDockPill";
      host.appendChild(pillWrap);
    }

    const dock = ensureDock();
    dock.style.position = "static";
    dock.style.inset = "auto";
    dock.style.margin = "0";
    dock.style.background = "transparent";
    dock.style.border = "0";
    dock.style.boxShadow = "none";
    dock.style.padding = "0";

    pillWrap.appendChild(dock);
    return true;
  }

  function fixOrb() {
    const orb = firstExistingSelector(CFG.orbSelectors);
    if (!orb) return;
    orb.addEventListener("click", (e) => {
      safeStop(e);
      if (typeof window.openStats === "function") window.openStats();
    }, { capture: true });
  }

  function getRowUri(row) {
    if (!row) return "";
    for (const k of CFG.uriDatasetKeys) {
      const v = row.dataset ? row.dataset[k] : "";
      if (v) return v;
    }
    const any = row.querySelector("[data-uri], [data-spotify-uri], [data-track-uri]");
    if (any) return any.dataset.uri || any.dataset.spotifyUri || any.dataset.trackUri || "";
    const a = row.querySelector('a[href^="spotify:"], a[href*="open.spotify.com"]');
    if (a) return a.getAttribute("href") || "";
    return "";
  }

  function playFromRow(row) {
    const uri = getRowUri(row);
    if (!uri) return false;
    callSpotify("playUri", uri);
    return true;
  }

  function ensureArtworkPlaceholders() {
    const rowSel = CFG.listRowSelectors.join(",");
    const rows = document.querySelectorAll(rowSel);

    rows.forEach((row) => {
      const hasArt = row.querySelector(CFG.artworkSlotSelectors.join(","));
      if (hasArt) return;

      const ph = document.createElement("div");
      ph.className = "lmGeneratedArtSlot";
      ph.setAttribute("data-lm", "artwork");
      ph.innerHTML = svgIcon("note");
      row.insertBefore(ph, row.firstChild);
    });
  }

  function enableArtworkClickPlay() {
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (t.closest(".lmDockInTabs")) return; // don't steal clicks from dock
      if (t.closest(CFG.orbSelectors.join(","))) return;

      const row = t.closest(CFG.listRowSelectors.join(","));
      if (!row) return;

      const art = t.closest(CFG.artworkSlotSelectors.join(","));
      if (!art) return;

      safeStop(e);
      playFromRow(row);
    }, true);
  }

  function keepStable() {
    const mo = new MutationObserver(() => {
      mountDockInsideTabs();
      fixOrb();
      ensureArtworkPlaceholders();
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });
  }

  function boot() {
    mountDockInsideTabs();
    fixOrb();
    ensureArtworkPlaceholders();
    enableArtworkClickPlay();
    keepStable();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();