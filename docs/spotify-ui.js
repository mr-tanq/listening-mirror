/* spotify-ui.js — FULL REPLACE (PART 1/2)
   - Create our OWN always-visible Player Dock under MIRROR (never disappears)
   - Do NOT rely on existing dock node (which keeps vanishing)
   - Prevent Orb from triggering playback ("Mirror" bug)
   - Play by clicking artwork in Recent/Top (including placeholder artwork)
*/

(function () {
  "use strict";

  const CFG = {
    // Orb selectors
    orbSelectors: [
      '[data-lm="orb"]',
      ".orb",
      ".statusOrb",
      ".brandOrb",
      ".appOrb",
    ],

    // Mirror panel hint selectors (fallbacks)
    mirrorPanelHintSelectors: [
      '[data-lm="mirrorPanel"]',
      ".mirrorPanel",
      ".mirrorCard",
      ".sessionCoversCard",
    ],

    // List rows + artwork slots
    listRowSelectors: [
      '[data-lm="row"]',
      ".row",
      ".listRow",
      ".trackRow",
      ".topRow",
    ],
    artworkSlotSelectors: [
      '[data-lm="artwork"]',
      ".art",
      ".artwork",
      ".cover",
      ".thumb",
      ".imgWrap",
      ".media",
      ".lmGeneratedArtSlot",
    ],
    uriDatasetKeys: ["uri", "spotifyUri", "trackUri", "contextUri"],
  };

  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
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

  function ensureStylesOnce() {
    if (document.getElementById("lm-fixeddock-styles")) return;

    const css = `
/* --- Fixed dock under MIRROR --- */
.lmFixedDockWrap{
  width:100%;
  display:flex;
  justify-content:flex-start;
  padding:12px 0 0 0;
}
.lmFixedDockPill{
  display:flex;
  align-items:center;
  gap:10px;
  padding:8px 10px;
  border-radius:999px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 10px 30px rgba(0,0,0,0.25);
  transform: scale(0.85); /* -15% */
  transform-origin: left center;
}
.lmFixedDockBtn{
  width:38px;
  height:38px;
  border-radius:999px;
  display:grid;
  place-items:center;
  background: rgba(0,0,0,0.18);
  border: 1px solid rgba(255,255,255,0.08);
  padding:0;
  margin:0;
  cursor:pointer;
}
.lmFixedDockBtn:active{ transform: translateY(1px); }
.lmFixedDockBtn svg{ width:18px; height:18px; }

.lmFixedDockDim{ opacity:0.55; filter: grayscale(1); }
.lmFixedDockAlways{ display:flex !important; visibility:visible !important; opacity:1 !important; }
    `.trim();

    const style = document.createElement("style");
    style.id = "lm-fixeddock-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function safeStop(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // ---------- SPOTIFY BRIDGE ----------
  function callSpotify(action, payload) {
    const s = window.LMSpotify || window.SpotifyBridge || window.spotifyBridge || null;

    try {
      if (s && typeof s[action] === "function") return s[action](payload);
    } catch {}

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
    try {
      const s = window.LMSpotify || window.SpotifyBridge || window.spotifyBridge || null;
      if (!s) return false;
      if (typeof s.isLinked === "function") return !!s.isLinked();
      if (typeof s.isConnected === "function") return !!s.isConnected();
      if ("linked" in s) return !!s.linked;
      if ("isConnected" in s) return !!s.isConnected;
    } catch {}
    return false;
  }

  function isPlaying() {
    try {
      const s = window.LMSpotify || window.SpotifyBridge || window.spotifyBridge || null;
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

  // ---------- FIND MIRROR PANEL ROBUST ----------
  function findMirrorPanel() {
    // 1) direct selector if exists
    const direct = firstExistingSelector(CFG.mirrorPanelHintSelectors);
    if (direct) return direct;

    // 2) by text "SESSION COVERS"
    const nodes = $$("div,section,article");
    for (const el of nodes) {
      const t = (el.textContent || "").toUpperCase();
      if (t.includes("SESSION COVERS")) {
        // climb to a reasonable card container
        let cur = el;
        for (let i = 0; i < 8 && cur; i++) {
          const r = cur.getBoundingClientRect();
          if (r.width > 260 && r.height > 80) return cur;
          cur = cur.parentElement;
        }
        return el;
      }
    }
    return null;
  }

  // ---------- CREATE OUR FIXED DOCK ----------
  function svgSpotify() {
    return `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path fill="rgba(255,255,255,0.9)" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm4.59 14.52a.75.75 0 0 1-1.03.25c-2.82-1.72-6.36-2.11-10.53-1.16a.75.75 0 1 1-.33-1.46c4.57-1.04 8.5-.6 11.64 1.32a.75.75 0 0 1 .25 1.05Zm1.03-2.5a.9.9 0 0 1-1.23.3c-3.23-1.99-8.15-2.56-11.96-1.4a.9.9 0 1 1-.53-1.72c4.35-1.33 9.76-.68 13.47 1.61a.9.9 0 0 1 .25 1.21Zm.09-2.63c-3.87-2.3-10.25-2.51-13.95-1.39a1.05 1.05 0 1 1-.61-2.01c4.26-1.29 11.35-1.04 15.83 1.62a1.05 1.05 0 1 1-1.27 1.78Z"/>
</svg>`.trim();
  }

  function svgPrev() {
    return `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path fill="rgba(255,255,255,0.9)" d="M6 6h2v12H6V6zm3.5 6 10 6V6l-10 6z"/>
</svg>`.trim();
  }

  function svgNext() {
    return `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path fill="rgba(255,255,255,0.9)" d="M16 6h2v12h-2V6zM4.5 18l10-6-10-6v12z"/>
</svg>`.trim();
  }

  function svgPlay() {
    return `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path fill="rgba(255,255,255,0.9)" d="M8 5v14l11-7L8 5z"/>
</svg>`.trim();
  }

  function svgPause() {
    return `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path fill="rgba(255,255,255,0.9)" d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/>
</svg>`.trim();
  }

  function renderFixedDock() {
    ensureStylesOnce();

    const mirrorPanel = findMirrorPanel();
    if (!mirrorPanel || !mirrorPanel.parentNode) return false;

    // Create wrap AFTER the mirror card container (not inside it)
    // We anchor to the mirrorPanel itself; wrap becomes sibling after it.
    let wrap = mirrorPanel.parentNode.querySelector(".lmFixedDockWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "lmFixedDockWrap";
      mirrorPanel.parentNode.insertBefore(wrap, mirrorPanel.nextSibling);
    }

    let pill = wrap.querySelector(".lmFixedDockPill");
    if (!pill) {
      pill = document.createElement("div");
      pill.className = "lmFixedDockPill lmFixedDockAlways";
      wrap.appendChild(pill);
    }

    // Build buttons once
    if (!pill.querySelector('[data-lmfd="spotify"]')) {
      pill.innerHTML = `
        <button class="lmFixedDockBtn" data-lmfd="spotify" aria-label="Spotify">
          ${svgSpotify()}
        </button>
        <button class="lmFixedDockBtn" data-lmfd="prev" aria-label="Previous">
          ${svgPrev()}
        </button>
        <button class="lmFixedDockBtn" data-lmfd="toggle" aria-label="Play/Pause">
          ${svgPlay()}
        </button>
        <button class="lmFixedDockBtn" data-lmfd="next" aria-label="Next">
          ${svgNext()}
        </button>
      `.trim();

      pill.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-lmfd]");
        if (!btn) return;
        safeStop(e);

        const key = btn.getAttribute("data-lmfd");
        if (key === "spotify") {
          // If not linked -> login; else do nothing (or could open spotify)
          callSpotify("login");
          return;
        }
        if (key === "prev") return callSpotify("prev");
        if (key === "next") return callSpotify("next");
        if (key === "toggle") return callSpotify("toggle");
      }, true);
    }

    // Update visuals (play/pause + linked dim)
    const toggleBtn = pill.querySelector('[data-lmfd="toggle"]');
    if (toggleBtn) toggleBtn.innerHTML = isPlaying() ? svgPause() : svgPlay();

    const spotifyBtn = pill.querySelector('[data-lmfd="spotify"]');
    if (spotifyBtn) {
      if (isLinked()) spotifyBtn.classList.remove("lmFixedDockDim");
      else spotifyBtn.classList.add("lmFixedDockDim");
    }

    return true;
  }

  // ---------- ORB FIX ----------
  function fixOrbClick() {
    const orb = firstExistingSelector(CFG.orbSelectors);
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

  // ---------- CLICK ARTWORK TO PLAY ----------
  function getRowUri(row) {
    if (!row) return "";
    for (const k of CFG.uriDatasetKeys) {
      const v = row.dataset ? row.dataset[k] : "";
      if (v) return v;
    }

    const any = row.querySelector("[data-uri], [data-spotify-uri], [data-track-uri]");
    if (any) return any.dataset.uri || any.dataset.spotifyUri || any.dataset.trackUri || "";

    const a = row.querySelector('a[href*="open.spotify.com"], a[href^="spotify:"]');
    if (a) return a.getAttribute("href") || "";

    return "";
  }

  function playFromRow(row) {
    const uri = getRowUri(row);
    if (!uri) return false;
    callSpotify("playUri", uri);
    return true;
  }

  function enableArtworkSlotClicks() {
    document.addEventListener(
      "click",
      (e) => {
        const target = e.target;

        // Ignore dock clicks
        if (target.closest(".lmFixedDockPill")) return;

        // orb handled separately
        if (target.closest(CFG.orbSelectors.join(","))) return;

        const row = target.closest(CFG.listRowSelectors.join(","));
        if (!row) return;

        const art = target.closest(CFG.artworkSlotSelectors.join(","));
        if (!art) return;

        safeStop(e);
        playFromRow(row);
      },
      true
    );
  }

  // ---------- BOOT ----------
  function boot() {
    fixOrbClick();
    enableArtworkSlotClicks();

    // Render dock now + keep re-rendering on UI changes
    renderFixedDock();
    setInterval(renderFixedDock, 1500); // lightweight keep-alive (prevents "vanish" after refresh)

    const mo = new MutationObserver(() => {
      renderFixedDock();
      fixOrbClick();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
/* spotify-ui.js — FULL REPLACE (PART 2/2)
   - Ensure placeholder artwork exists so tracks without artwork still play via artwork click
   - Hide any legacy/duplicate player docks to avoid weird ghost UI
*/

(function () {
  "use strict";

  function hideLegacyDocks() {
    // If your old UI still creates a dock, we hide it so only the fixed dock is used.
    const legacy = Array.from(
      document.querySelectorAll('[data-lm="playerDock"], .playerDock, .playerControlsDock, .playerControls')
    );

    legacy.forEach((d) => {
      // Do not hide inside our fixed dock (we don’t use it anyway), but safe:
      if (d.closest(".lmFixedDockPill")) return;
      d.style.display = "none";
      d.setAttribute("data-lm-hidden-legacy", "1");
    });
  }

  function ensurePlaceholderArtworkIsClickable() {
    const rowSelectors = ['[data-lm="row"]', ".row", ".listRow", ".trackRow", ".topRow"].join(",");
    const rows = document.querySelectorAll(rowSelectors);

    rows.forEach((row) => {
      const hasArt =
        row.querySelector('[data-lm="artwork"], .art, .artwork, .cover, .thumb, .imgWrap, .media, .lmGeneratedArtSlot');

      if (hasArt) return;

      const ph = document.createElement("div");
      ph.className = "artwork thumb lmGeneratedArtSlot";
      ph.setAttribute("data-lm", "artwork");
      ph.style.width = "56px";
      ph.style.height = "56px";
      ph.style.borderRadius = "18px";
      ph.style.background = "rgba(255,255,255,0.06)";
      ph.style.border = "1px solid rgba(255,255,255,0.08)";
      ph.style.display = "grid";
      ph.style.placeItems = "center";
      ph.style.flex = "0 0 auto";

      ph.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path fill="rgba(255,255,255,0.45)" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
        </svg>
      `.trim();

      row.insertBefore(ph, row.firstChild);
    });
  }

  function boot2() {
    hideLegacyDocks();
    ensurePlaceholderArtworkIsClickable();

    const mo = new MutationObserver(() => {
      hideLegacyDocks();
      ensurePlaceholderArtworkIsClickable();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot2);
  } else {
    boot2();
  }
})();