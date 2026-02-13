/* spotify-ui.js — FULL REPLACE (PART 1/2)
   - Move player controls BELOW MIRROR panel (NOT in tabs)
   - Keep controls visible even when nothing playing
   - Prevent Orb from triggering playback ("Mirror" bug)
   - Make artwork-slot clickable even when no artwork
*/

(function () {
  "use strict";

  // ---------- CONFIG ----------
  const CFG = {
    // Player dock selectors (existing node created elsewhere in your app)
    playerDockSelectors: [
      '[data-lm="playerDock"]',
      ".playerDock",
      ".playerControlsDock",
      ".playerControls",
    ],

    // Orb / glyph selectors (round thing left of Listening Mirror)
    orbSelectors: [
      '[data-lm="orb"]',
      ".orb",
      ".statusOrb",
      ".brandOrb",
      ".appOrb",
    ],

    // Mirror panel selectors (we want to mount dock BELOW this)
    // We'll detect by presence of "SESSION COVERS" text OR MIRROR label container.
    mirrorPanelHintSelectors: [
      '[data-lm="mirrorPanel"]',
      ".mirrorPanel",
      ".mirrorCard",
      ".sessionCoversCard",
    ],

    // List item row selectors (Recent / Top lists)
    listRowSelectors: [
      '[data-lm="row"]',
      ".row",
      ".listRow",
      ".trackRow",
      ".topRow",
    ],

    // Clickable artwork container inside a row
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

    // A row may carry a URI on dataset, or have a nested link/button
    uriDatasetKeys: ["uri", "spotifyUri", "trackUri", "contextUri"],
  };

  // ---------- HELPERS ----------
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $1 = (sel, root = document) => root.querySelector(sel);

  function firstExistingSelector(selectors, root = document) {
    for (const s of selectors) {
      try {
        const el = $1(s, root);
        if (el) return el;
      } catch {
        // ignore unsupported selectors
      }
    }
    return null;
  }

  function ensureStylesOnce() {
    if (document.getElementById("lm-dock-styles")) return;

    const css = `
/* --- Listening Mirror: Dock BELOW MIRROR panel --- */
.lmMirrorDockWrap{
  width:100%;
  display:flex;
  justify-content:flex-start;
  padding:12px 0 0 0;
}
.lmDockPill{
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
.lmDockPill button,
.lmDockPill a{
  border:0;
  background: transparent;
  padding:0;
  margin:0;
  line-height:0;
}
.lmDockPill .lmBtn{
  width:38px;
  height:38px;
  border-radius:999px;
  display:grid;
  place-items:center;
  background: rgba(0,0,0,0.18);
  border: 1px solid rgba(255,255,255,0.08);
}
.lmDockPill .lmBtn:active{
  transform: translateY(1px);
}
.lmDockPill .lmBtn svg{
  width:18px;
  height:18px;
}
.lmDockHidden{
  display:flex !important; /* never fully disappears */
  opacity:0.45;
}
.lmDockHidden .lmBtn{
  pointer-events:auto; /* still clickable */
}
    `.trim();

    const style = document.createElement("style");
    style.id = "lm-dock-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function safeStop(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // ---------- SPOTIFY PLAYBACK BRIDGE ----------
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

  // ---------- FIND MIRROR PANEL (robust) ----------
  function findMirrorPanel() {
    // 1) direct selectors if exist
    const direct = firstExistingSelector(CFG.mirrorPanelHintSelectors);
    if (direct) return direct;

    // 2) by text: find element containing "SESSION COVERS"
    const nodes = $$("div,section,article");
    for (const el of nodes) {
      const t = (el.textContent || "").toUpperCase();
      if (t.includes("SESSION COVERS")) {
        // climb a bit to get the full panel container
        let cur = el;
        for (let i = 0; i < 6 && cur; i++) {
          const r = cur.getBoundingClientRect();
          if (r.width > 250 && r.height > 70) return cur;
          cur = cur.parentElement;
        }
        return el;
      }
    }

    // 3) fallback by "MIRROR" label
    for (const el of nodes) {
      const t = (el.textContent || "").toUpperCase();
      if (t.includes("MIRROR") && t.includes("SESSION")) {
        return el;
      }
    }

    return null;
  }

  // ---------- DOCK: move controls BELOW MIRROR ----------
  function dockPlayerBelowMirror() {
    ensureStylesOnce();

    const dock = firstExistingSelector(CFG.playerDockSelectors);
    if (!dock) return false;

    const mirrorPanel = findMirrorPanel();
    if (!mirrorPanel) return false;

    // Create mount wrap once (below mirror panel)
    let wrap = mirrorPanel.parentElement
      ? mirrorPanel.parentElement.querySelector(".lmMirrorDockWrap")
      : null;

    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "lmMirrorDockWrap";

      // insert wrap RIGHT AFTER mirrorPanel
      if (mirrorPanel.parentNode) {
        mirrorPanel.parentNode.insertBefore(wrap, mirrorPanel.nextSibling);
      } else {
        document.body.appendChild(wrap);
      }
    }

    // Pill container
    let pill = wrap.querySelector(".lmDockPill");
    if (!pill) {
      pill = document.createElement("div");
      pill.className = "lmDockPill";
      wrap.appendChild(pill);
    }

    // Move dock into pill
    pill.appendChild(dock);

    // Neutralize dock's own absolute/overlay styles (so it doesn't vanish)
    dock.style.position = "static";
    dock.style.inset = "auto";
    dock.style.margin = "0";
    dock.style.transform = "none";
    dock.style.background = "transparent";
    dock.style.backdropFilter = "none";
    dock.style.webkitBackdropFilter = "none";
    dock.style.border = "0";
    dock.style.boxShadow = "none";
    dock.style.padding = "0";

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

  // ---------- LIST CLICK: play when clicking artwork slot ----------
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

        // Ignore clicks on the dock pill itself
        if (target.closest(".lmDockPill")) return;

        // If it’s an orb click, let orb handler stop it
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

  // ---------- KEEP DOCK VISIBLE ----------
  function keepDockVisible() {
    const observer = new MutationObserver(() => {
      const d = firstExistingSelector(CFG.playerDockSelectors);
      if (!d) return;

      const cs = window.getComputedStyle(d);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") {
        d.style.display = "flex";
        d.style.visibility = "visible";
        d.style.opacity = "1";
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "hidden", "data-state"],
    });
  }

  // ---------- BOOT ----------
  function boot() {
    dockPlayerBelowMirror();
    fixOrbClick();
    enableArtworkSlotClicks();
    keepDockVisible();

    // Re-dock after SPA route changes / re-renders
    const mo = new MutationObserver(() => {
      dockPlayerBelowMirror();
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
   - Button sizing/spacing polish
   - Prevent duplicate docks appearing elsewhere
   - Ensure placeholder artwork exists so clicks work even without artwork
*/

(function () {
  "use strict";

  function setSpotifyButtonState(btn, linked) {
    if (!btn) return;
    btn.style.opacity = linked ? "1" : "0.55";
    btn.style.filter = linked ? "none" : "grayscale(1)";
  }

  function findDockRoot() {
    // We moved dock inside .lmDockPill below mirror panel
    return document.querySelector(".lmDockPill");
  }

  function polishDockButtons() {
    const pill = findDockRoot();
    if (!pill) return;

    const dock =
      pill.querySelector('[data-lm="playerDock"]') ||
      pill.querySelector(".playerDock") ||
      pill.querySelector(".playerControlsDock") ||
      pill.querySelector(".playerControls");

    if (!dock) return;

    dock.style.display = "flex";
    dock.style.alignItems = "center";
    dock.style.gap = "10px";

    const clickable = dock.querySelectorAll("button, a");
    clickable.forEach((el) => {
      if (!el.classList.contains("lmBtn")) el.classList.add("lmBtn");
      Array.from(el.childNodes).forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) n.textContent = "";
      });
    });

    const spotifyBtn =
      dock.querySelector('[data-lm="spotifyBtn"]') ||
      dock.querySelector(".spotifyBtn") ||
      clickable[0] ||
      null;

    let linked = false;
    try {
      const s = window.LMSpotify || window.SpotifyBridge || window.spotifyBridge || null;
      linked = !!(s && (s.isLinked?.() || s.linked === true || s.isConnected === true));
    } catch {}

    setSpotifyButtonState(spotifyBtn, linked);
  }

  function preventDuplicateDocks() {
    const ensureSingle = () => {
      const allDocks = Array.from(
        document.querySelectorAll('[data-lm="playerDock"], .playerDock, .playerControlsDock, .playerControls')
      );

      if (allDocks.length <= 1) return;

      const pill = findDockRoot();
      if (!pill) return;

      allDocks.forEach((d) => {
        const inside = pill.contains(d);
        if (!inside) {
          d.style.display = "none";
          d.setAttribute("data-lm-hidden-duplicate", "1");
        }
      });
    };

    ensureSingle();

    const mo = new MutationObserver(() => {
      ensureSingle();
      polishDockButtons();
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });
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
    polishDockButtons();
    preventDuplicateDocks();
    ensurePlaceholderArtworkIsClickable();

    const mo = new MutationObserver(() => {
      polishDockButtons();
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