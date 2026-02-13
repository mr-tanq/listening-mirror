/* spotify-ui.js — FULL REPLACE (WORKING BRIDGE)
   - Fixed player dock TOP-RIGHT (always visible)
   - Spotify icon = login (if not linked) / connect (if linked & connect exists)
   - Play/Pause/Prev/Next call your existing globals:
       window.SpotifyPlayer.* and window.SpotifyAuth.*
   - Artwork click plays ONLY in #topList / #recentList (and works even if no artwork image)
   - Orb click never triggers playback ("Mirror" bug)
*/

(function () {
  "use strict";

  // ---- stable in YOUR app.js ----
  const LIST_CONTAINERS = ["#topList", "#recentList"];
  const ORB_SELECTORS = ['[data-lm="orb"]', ".orb", ".statusOrb", ".brandOrb", ".appOrb"];

  const ROW_SELECTORS = [".row", '[data-lm="row"]', ".listRow", ".trackRow", ".topRow"];
  const ART_SELECTORS = [".thumb", ".art", ".artwork", ".cover", '[data-lm="artwork"]'];

  // dataset keys we might have on rows
  const URI_DATA_KEYS = ["uri", "spotifyUri", "trackUri", "contextUri"];

  const $1 = (sel, root = document) => root.querySelector(sel);

  function safeStop(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function log(...a) {
    console.log("[spotify-ui]", ...a);
  }
  function warn(...a) {
    console.warn("[spotify-ui]", ...a);
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

  // ---------- YOUR EXISTING GLOBALS (MOST IMPORTANT) ----------
  function auth() {
    return window.SpotifyAuth || null;
  }
  function player() {
    return window.SpotifyPlayer || null;
  }

  function isLinked() {
    try {
      const a = auth();
      if (a && typeof a.getAccessToken === "function") return !!a.getAccessToken();
      // fallback: token in LS set by spotify-auth.js
      const t = localStorage.getItem("lm_spotify_access_token");
      return !!t;
    } catch {
      return false;
    }
  }

  // We can’t 100% know playing state unless your player exposes it
  function isPlaying() {
    try {
      const p = player();
      if (!p) return false;
      if (typeof p.getState === "function") {
        const st = p.getState();
        if (st && typeof st.isPlaying === "boolean") return st.isPlaying;
        if (st && typeof st.is_playing === "boolean") return st.is_playing;
      }
      if (typeof p.isPlaying === "function") return !!p.isPlaying();
      if (typeof p.isPlaying === "boolean") return !!p.isPlaying;
    } catch {}
    return false;
  }

  // Robust call helper (tries multiple method names)
  function callPlayer(methodNames, ...args) {
    const p = player();
    if (!p) {
      warn("SpotifyPlayer missing on window");
      return { ok: false, reason: "SpotifyPlayer missing" };
    }

    for (const m of methodNames) {
      try {
        if (typeof p[m] === "function") {
          log("Calling SpotifyPlayer." + m, args);
          const r = p[m](...args);
          return { ok: true, used: m, value: r };
        }
      } catch (e) {
        warn("SpotifyPlayer." + m + " error:", e);
        return { ok: false, reason: String(e?.message || e) };
      }
    }
    warn("No method found on SpotifyPlayer:", methodNames);
    return { ok: false, reason: "No method found: " + methodNames.join(", ") };
  }

  function loginOrConnect() {
    const linked = isLinked();
    if (!linked) {
      const a = auth();
      if (a && typeof a.login === "function") {
        log("SpotifyAuth.login()");
        a.login();
        return;
      }
      warn("SpotifyAuth.login missing");
      return;
    }

    // If already linked, try to connect device (if your player supports it)
    callPlayer(["connect", "ensureDevice", "init"]);
  }

  function togglePlayPause() {
    // Prefer explicit methods if exist
    const playing = isPlaying();
    if (playing) {
      const r = callPlayer(["pause"]);
      if (!r.ok) callPlayer(["toggle", "playPause"]);
      return;
    } else {
      const r = callPlayer(["resume", "play"]);
      if (!r.ok) callPlayer(["toggle", "playPause"]);
      return;
    }
  }

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
          if (key === "spotify") return loginOrConnect();
          if (key === "prev") return callPlayer(["prev", "previous"]);
          if (key === "next") return callPlayer(["next"]);
          if (key === "toggle") return togglePlayPause();
        },
        true
      );
    }

    // Update icons/state
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

    // Capture phase so NOTHING above/below can hijack it
    orb.addEventListener(
      "click",
      (e) => {
        safeStop(e);
        // do nothing else (no playback)
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

    // 1) dataset on row
    for (const k of URI_DATA_KEYS) {
      const v = row.dataset ? row.dataset[k] : "";
      if (v) return v;
    }

    // 2) any dataset child
    const any = row.querySelector("[data-uri], [data-spotify-uri], [data-track-uri]");
    if (any) return any.dataset.uri || any.dataset.spotifyUri || any.dataset.trackUri || "";

    // 3) spotify link
    const a = row.querySelector('a[href^="spotify:"], a[href*="open.spotify.com"]');
    if (a) return a.getAttribute("href") || "";

    return "";
  }

  function isInsideAllowedList(node) {
    return LIST_CONTAINERS.some((sel) => !!node.closest(sel));
  }

  function ensureArtSlotExists(row) {
    // If no artwork element exists, create a placeholder slot so clicks still work
    const hasArt = row.querySelector(ART_SELECTORS.join(","));
    if (hasArt) return;

    const ph = document.createElement("div");
    ph.className = "thumb lmGeneratedArtSlot";
    ph.setAttribute("data-lm", "artwork");
    ph.style.width = "56px";
    ph.style.height = "56px";
    ph.style.borderRadius = "18px";
    ph.style.background = "rgba(255,255,255,0.06)";
    ph.style.border = "1px solid rgba(255,255,255,0.08)";
    ph.style.display = "grid";
    ph.style.placeItems = "center";
    ph.style.flex = "0 0 auto";
    ph.innerHTML = `<div style="opacity:.45;font-size:18px;line-height:1">♪</div>`;
    row.insertBefore(ph, row.firstChild);
  }

  function enableArtworkClicks() {
    // Ensure placeholder art slot exists for rows that have no image
const seed = () => {
      for (const containerSel of LIST_CONTAINERS) {
        const c = document.querySelector(containerSel);
        if (!c) continue;
        const rows = c.querySelectorAll(ROW_SELECTORS.join(","));
        rows.forEach(ensureArtSlotExists);
      }
    };
    seed();

    // Re-seed when lists re-render
    const mo = new MutationObserver(seed);
    mo.observe(document.body, { childList: true, subtree: true });

    // Delegate clicks
    document.addEventListener(
      "click",
      (e) => {
        const t = e.target;

        // ignore dock clicks
        if (t.closest(".lmFixedTRPill")) return;

        // orb blocked elsewhere
        if (ORB_SELECTORS.some((s) => t.closest(s))) return;

        const row = t.closest(ROW_SELECTORS.join(","));
        if (!row) return;

        if (!isInsideAllowedList(row)) return;

        const art = t.closest(ART_SELECTORS.join(","));
        if (!art) return;

        const uri = getRowUri(row);
        if (!uri) {
          warn("No URI found for clicked row (need dataset uri or link).");
          return;
        }

        safeStop(e);

        // Try playUri first, then generic play with uri
        const r = callPlayer(["playUri", "playURI", "play_track_uri", "playTrackUri"], uri);
        if (!r.ok) {
          // fallback: maybe your player expects { uri } object
          callPlayer(["playUri", "play"], { uri });
        }
      },
      true
    );
  }

  // ---------- BOOT ----------
  function boot() {
    log("boot");

    fixOrb();
    enableArtworkClicks();

    renderDock();

    // light refresh (no heavy hide)
    setInterval(renderDock, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();