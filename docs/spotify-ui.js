/* spotify-ui.js — FULL REPLACE (PART 1/2)
   - Dock player controls into tabs bar (right of "Top"), -15% size
   - Keep controls visible even when nothing playing
   - Prevent Orb from triggering playback ("Mirror" bug)
   - Make artwork-slot clickable even when no artwork
*/

(function () {
  "use strict";

  // ---------- CONFIG ----------
  const CFG = {
    // We try a few candidates because your DOM evolved
    tabsBarSelectors: [
      '[data-lm="tabsbar"]',
      ".tabsBar",
      ".tabs",
      ".segmentedTabs",
      ".navTabs",
    ],
    topTabSelectors: [
      '[data-tab="top"]',
      '[data-lm-tab="top"]',
      ".tabTop",
      'button:has-text("Top")', // harmless if unsupported
    ],
    playerDockSelectors: [
      '[data-lm="playerDock"]',
      ".playerDock",
      ".playerControlsDock",
      ".playerControls",
    ],
    // Orb / glyph selectors (the round thing left of Listening Mirror)
    orbSelectors: [
      '[data-lm="orb"]',
      ".orb",
      ".statusOrb",
      ".brandOrb",
      ".appOrb",
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
        // ignore unsupported selectors like :has-text
      }
    }
    return null;
  }

  function ensureStylesOnce() {
    if (document.getElementById("lm-dock-styles")) return;
    const css = `
/* --- Listening Mirror: Docked player in tabs --- */
.lmTabsDockWrap{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  width:100%;
}
.lmTabsLeft{
  display:flex;
  align-items:center;
  min-width:0;
}
.lmTabsRight{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  flex:0 0 auto;
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
  transform-origin: right center;
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
  pointer-events:auto; /* still clickable for login/resume */
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
  // We try to call whatever you already have.
  function callSpotify(action, payload) {
    // Preferred: window.LMSpotify
    const s = window.LMSpotify || window.SpotifyBridge || window.spotifyBridge || null;

    try {
      if (s && typeof s[action] === "function") return s[action](payload);
    } catch {}

    // Fallbacks: common names
    try {
      if (action === "toggle" && typeof window.spotifyToggle === "function") return window.spotifyToggle();
      if (action === "playUri" && typeof window.spotifyPlayUri === "function") return window.spotifyPlayUri(payload);
      if (action === "login" && typeof window.spotifyLogin === "function") return window.spotifyLogin();
      if (action === "logout" && typeof window.spotifyLogout === "function") return window.spotifyLogout();
    } catch {}

    // If nothing exists, do nothing (but don’t crash UI)
    return null;
  }

  // ---------- DOCK: move controls into tabs ----------
  function dockPlayerIntoTabs() {
    ensureStylesOnce();

    const tabsBar = firstExistingSelector(CFG.tabsBarSelectors);
    const dock = firstExistingSelector(CFG.playerDockSelectors);

    if (!tabsBar || !dock) return false;

    // Build wrap structure once
    let wrap = tabsBar.querySelector(".lmTabsDockWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "lmTabsDockWrap";

      const left = document.createElement("div");
      left.className = "lmTabsLeft";
      const right = document.createElement("div");
      right.className = "lmTabsRight";

      // Move existing tabs content into left
      while (tabsBar.firstChild) left.appendChild(tabsBar.firstChild);

      wrap.appendChild(left);
      wrap.appendChild(right);

      tabsBar.appendChild(wrap);
    }

    const right = tabsBar.querySelector(".lmTabsRight");
    if (!right) return false;

    // Put dock inside a pill container
    let pill = right.querySelector(".lmDockPill");
    if (!pill) {
      pill = document.createElement("div");
      pill.className = "lmDockPill";
      right.appendChild(pill);
    }

    // Move dock into pill (keep the dock node itself)
    pill.appendChild(dock);

    // Make sure dock is not absolute-positioned somewhere weird
    dock.style.position = "static";
    dock.style.inset = "auto";
    dock.style.margin = "0";
    dock.style.transform = "none";

    // If your dock had its own pill/overlay background, neutralize lightly
    dock.style.background = "transparent";
    dock.style.backdropFilter = "none";
    dock.style.webkitBackdropFilter = "none";
    dock.style.border = "0";
    dock.style.boxShadow = "none";
    dock.style.padding = "0";

    return true;
  }

  // ---------- ORB FIX: prevent orb clicks from triggering playback ----------
  function fixOrbClick() {
    const orb = firstExistingSelector(CFG.orbSelectors);
    if (!orb) return;

    // If orb is inside something clickable, kill click in capture phase.
    orb.addEventListener(
      "click",
      (e) => {
        // Allow hover/focus UI, but stop any parent handler that triggers playback.
        safeStop(e);
        // Here you can open stats instead (if you have a function)
        if (typeof window.openStats === "function") window.openStats();
      },
      { capture: true }
    );
  }

  // ---------- LIST CLICK: play when clicking artwork slot even if no artwork ----------
  function getRowUri(row) {
    if (!row) return "";
    for (const k of CFG.uriDatasetKeys) {
      const v = row.dataset ? row.dataset[k] : "";
      if (v) return v;
    }

    // Look for nested elements carrying uri
    const any = row.querySelector("[data-uri], [data-spotify-uri], [data-track-uri]");
    if (any) {
      return any.dataset.uri || any.dataset.spotifyUri || any.dataset.trackUri || "";
    }

    // Look for links
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
    // Event delegation: click on artwork slot => play
    document.addEventListener("click", (e) => {
      const target = e.target;

      // Ignore clicks on the dock itself
      if (target.closest(".lmDockPill")) return;

      // If it’s an orb click, let orb handler stop it
      if (target.closest(CFG.orbSelectors.join(","))) return;

      // Find a row
      const row = target.closest(CFG.listRowSelectors.join(","));
      if (!row) return;

      // Only when clicking artwork slot (including placeholder)
      const art = target.closest(CFG.artworkSlotSelectors.join(","));
      if (!art) return;

      // Prevent navigation/other handlers
      safeStop(e);

      // Play
      playFromRow(row);
    }, true);
  }

  // ---------- KEEP DOCK VISIBLE even when "nothing playing" ----------
  function keepDockVisible() {
    const dock = firstExistingSelector(CFG.playerDockSelectors);
    if (!dock) return;

    // Many UIs hide controls by removing node or setting display:none.
    // We force a visible state and apply a "dim" class instead.
    const observer = new MutationObserver(() => {
      const d = firstExistingSelector(CFG.playerDockSelectors);
      if (!d) return;

      // If app tried to hide it:
      const computed = window.getComputedStyle(d);
      if (computed.display === "none" || computed.visibility === "hidden" || computed.opacity === "0") {
        d.style.display = "block";
        d.style.visibility = "visible";
        d.style.opacity = "1";
      }

      // If there is no active track, you can dim it by setting a data attr elsewhere.
      // We just keep it consistent; you can toggle lmDockHidden yourself.
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
    dockPlayerIntoTabs();
    fixOrbClick();
    enableArtworkSlotClicks();
    keepDockVisible();

    // Re-dock after SPA route changes / re-renders
    const mo = new MutationObserver(() => {
      dockPlayerIntoTabs();
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
   - Ensures dock doesn't "jump" into other tabs when you scroll
   - Optional: dim dock when logged out (spotify icon grey)
*/

(function () {
  "use strict";

  // Small SVG helpers (if your UI already renders icons, this won't interfere)
  function setSpotifyButtonState(btn, linked) {
    if (!btn) return;
    btn.style.opacity = linked ? "1" : "0.55";
    btn.style.filter = linked ? "none" : "grayscale(1)";
  }

  function findDockRoot() {
    // The dock has been moved inside .lmDockPill
    return document.querySelector(".lmDockPill");
  }

  function polishDockButtons() {
    const pill = findDockRoot();
    if (!pill) return;

    // Make sure inner dock layout is horizontal
    const dock = pill.querySelector('[data-lm="playerDock"], .playerDock, .playerControlsDock, .playerControls');
    if (!dock) return;

    dock.style.display = "flex";
    dock.style.alignItems = "center";
    dock.style.gap = "10px";

    // If buttons are there, give them the .lmBtn class for consistent size
    const clickable = dock.querySelectorAll("button, a");
    clickable.forEach((el) => {
      // If it already has a shape class, leave it; else add lmBtn
      if (!el.classList.contains("lmBtn")) el.classList.add("lmBtn");
      // Remove any text labels (you wanted icons only)
      // Keep aria-label though for accessibility
      Array.from(el.childNodes).forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) n.textContent = "";
      });
    });

    // Detect spotify button (first one often)
    const spotifyBtn =
      dock.querySelector('[data-lm="spotifyBtn"]') ||
      dock.querySelector(".spotifyBtn") ||
      clickable[0] ||
      null;

    // Linked state: ask bridge if available
    let linked = false;
    try {
      const s = window.LMSpotify || window.SpotifyBridge || window.spotifyBridge || null;
      linked = !!(s && (s.isLinked?.() || s.linked === true || s.isConnected === true));
    } catch {}

    setSpotifyButtonState(spotifyBtn, linked);
  }

  function preventDockFromAppearingInOtherTabs() {
    // The bug you showed: when you scroll / change tab, dock shows up weirdly.
    // This usually happens because the old container still duplicates it or re-renders a second dock.
    // We enforce: only ONE dock exists, and it must live inside .lmDockPill.
    const ensureSingle = () => {
      const allDocks = Array.from(
        document.querySelectorAll('[data-lm="playerDock"], .playerDock, .playerControlsDock, .playerControls')
      );

      if (allDocks.length <= 1) return;

      const pill = findDockRoot();
      if (!pill) return;

      // Keep the one that is inside pill; remove/hide others
      allDocks.forEach((d) => {
        const inside = pill.contains(d);
        if (!inside) {
          // Don’t delete (could break re-render logic). Just hide extra instances.
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
    // Some rows have no artwork and your UI may not render an artwork slot at all.
    // We create a consistent "artwork slot" so the Part1 click handler always finds it.
    const rowSelectors = ['[data-lm="row"]', ".row", ".listRow", ".trackRow", ".topRow"].join(",");
    const rows = document.querySelectorAll(rowSelectors);

    rows.forEach((row) => {
      // If row already has a known artwork container, ok
      const hasArt =
        row.querySelector('[data-lm="artwork"], .art, .artwork, .cover, .thumb, .imgWrap, .media');

      if (hasArt) return;

      // Try to find where artwork normally sits (left side)
      // If the row is flex, insert a placeholder at the start.
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

      // a tiny note icon
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
    preventDockFromAppearingInOtherTabs();
    ensurePlaceholderArtworkIsClickable();

    // Re-run lightly as UI updates
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