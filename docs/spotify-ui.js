/* spotify-ui.js — DEBUG BUILD (PART 1/2) — FULL REPLACE */
(function () {
  "use strict";

  const VERSION = "LM-UI-DEBUG-1";
  const LOG = (...a) => console.log(`[${VERSION}]`, ...a);
  const WARN = (...a) => console.warn(`[${VERSION}]`, ...a);
  const ERR = (...a) => console.error(`[${VERSION}]`, ...a);

  function badge(text, isErr = false) {
    let el = document.getElementById("lm-ui-badge");
    if (!el) {
      el = document.createElement("div");
      el.id = "lm-ui-badge";
      el.style.cssText = [
        "position:fixed",
        "left:10px",
        "top:10px",
        "z-index:999999",
        "font:12px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Arial",
        "padding:8px 10px",
        "border-radius:999px",
        "backdrop-filter: blur(10px)",
        "-webkit-backdrop-filter: blur(10px)",
        "border:1px solid rgba(255,255,255,0.12)",
        "background:rgba(0,0,0,0.35)",
        "color:rgba(255,255,255,0.92)",
        "box-shadow: 0 10px 30px rgba(0,0,0,0.35)",
      ].join(";");
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.borderColor = isErr ? "rgba(255,90,90,0.55)" : "rgba(49,208,124,0.45)";
  }

  function ensureStylesOnce() {
    if (document.getElementById("lm-dock-styles")) return;
    const css = `
.lmDockHost{ position: relative; overflow: visible; }
.lmDockWrap{
  display:flex; align-items:center; justify-content:flex-end;
  padding:10px 12px;
}
.lmDockPill{
  display:flex; align-items:center; gap:10px;
  padding:8px 10px;
  border-radius:999px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow: 0 10px 30px rgba(0,0,0,0.25);
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
  border: 1px solid rgba(255,255,255,0.10);
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

  function svgIcon(name) {
    const fill = "rgba(255,255,255,0.92)";
    if (name === "spotify") return `<svg viewBox="0 0 24 24"><path fill="${fill}" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.57 14.36a.8.8 0 0 1-1.1.26c-3.02-1.85-6.82-2.27-11.3-1.25a.8.8 0 0 1-.36-1.56c4.9-1.12 9.12-.64 12.5 1.43.38.23.5.72.26 1.12zm1.05-2.48a.95.95 0 0 1-1.3.31c-3.46-2.13-8.73-2.75-12.82-1.5a.95.95 0 1 1-.56-1.81c4.67-1.43 10.47-.74 14.44 1.7.45.28.6.87.24 1.3zm.1-2.58C14.6 9.5 8.56 9.32 5.15 10.35a1.1 1.1 0 1 1-.63-2.1c3.91-1.18 10.63-.95 14.74 1.44a1.1 1.1 0 0 1-1.1 1.9z"/></svg>`;
    if (name === "prev") return `<svg viewBox="0 0 24 24"><path fill="${fill}" d="M6 6h2v12H6V6zm3.5 6 10-6v12l-10-6z"/></svg>`;
    if (name === "next") return `<svg viewBox="0 0 24 24"><path fill="${fill}" d="M16 6h2v12h-2V6zM6 6l10 6-10 6V6z"/></svg>`;
    if (name === "play") return `<svg viewBox="0 0 24 24"><path fill="${fill}" d="M8 5v14l11-7z"/></svg>`;
    if (name === "pause") return `<svg viewBox="0 0 24 24"><path fill="${fill}" d="M7 6h4v12H7V6zm6 0h4v12h-4V6z"/></svg>`;
    if (name === "note") return `<svg viewBox="0 0 24 24"><path fill="rgba(255,255,255,0.55)" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>`;
    return "";
  }

  function safeStop(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // ---- Spotify bridge wrapper (logs what exists) ----
  function getBridge() {
    return window.LMSpotify || window.SpotifyBridge || window.spotifyBridge || null;
  }
  function callSpotify(action, payload) {
    const b = getBridge();
    try {
      if (b && typeof b[action] === "function") return b[action](payload);
    } catch (e) {
      ERR("Bridge call failed", action, e);
    }
    // fallback globals
    try {
      if (action === "toggle" && typeof window.spotifyToggle === "function") return window.spotifyToggle();
      if (action === "playUri" && typeof window.spotifyPlayUri === "function") return window.spotifyPlayUri(payload);
      if (action === "login" && typeof window.spotifyLogin === "function") return window.spotifyLogin();
      if (action === "logout" && typeof window.spotifyLogout === "function") return window.spotifyLogout();
      if (action === "prev" && typeof window.spotifyPrev === "function") return window.spotifyPrev();
      if (action === "next" && typeof window.spotifyNext === "function") return window.spotifyNext();
    } catch (e) {
      ERR("Fallback call failed", action, e);
    }
    WARN("No spotify function available for:", action);
    return null;
  }

  function buildDock() {
    const wrap = document.createElement("div");
    wrap.className = "lmDockWrap";
    wrap.setAttribute("data-lm", "dockWrap");

    const pill = document.createElement("div");
    pill.className = "lmDockPill";
    pill.setAttribute("data-lm", "playerDock");

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

    btnSpotify.addEventListener("click", (e) => { safeStop(e); callSpotify("login"); });
    btnPrev.addEventListener("click", (e) => { safeStop(e); callSpotify("prev"); });
    btnNext.addEventListener("click", (e) => { safeStop(e); callSpotify("next"); });
    btnToggle.addEventListener("click", (e) => { safeStop(e); callSpotify("toggle"); });

    pill.appendChild(btnSpotify);
    pill.appendChild(btnPrev);
    pill.appendChild(btnToggle);
    pill.appendChild(btnNext);

    wrap.appendChild(pill);
    return wrap;
  }
/* spotify-ui.js — DEBUG BUILD (PART 2/2) — FULL REPLACE */
  function findMirrorRow() {
    // Find the line that contains "MIRROR" text (small header bar)
    const all = Array.from(document.querySelectorAll("div,section,header"));
    for (const el of all) {
      const txt = (el.textContent || "").trim();
      if (!txt) continue;
      if (!/\bMIRROR\b/i.test(txt)) continue;
      const r = el.getBoundingClientRect();
      if (r.height >= 40 && r.height <= 140 && r.width > 200) return el;
    }
    return null;
  }

  function findMirrorPanel() {
    // Try to find the block that includes "SESSION COVERS"
    const all = Array.from(document.querySelectorAll("div,section"));
    for (const el of all) {
      const txt = (el.textContent || "").trim();
      if (!txt) continue;
      if (!/SESSION\s+COVERS/i.test(txt)) continue;
      // walk up a bit to get the panel container
      let cur = el;
      for (let i = 0; i < 5 && cur; i++) {
        const r = cur.getBoundingClientRect();
        if (r.height > 80 && r.width > 260) return cur;
        cur = cur.parentElement;
      }
      return el;
    }
    return null;
  }

  function ensureDockMounted() {
    ensureStylesOnce();

    // remove any old dockWrap to avoid duplicates
    const old = document.querySelector('[data-lm="dockWrap"]');
    if (old) old.remove();

    const dock = buildDock();

    const mirrorRow = findMirrorRow();
    const mirrorPanel = findMirrorPanel();

    LOG("Mount targets:", { mirrorRow: !!mirrorRow, mirrorPanel: !!mirrorPanel });

    if (mirrorRow) {
      mirrorRow.classList.add("lmDockHost");
      mirrorRow.appendChild(dock);
      badge("LM UI: OK (mounted on MIRROR row)");
      return true;
    }

    if (mirrorPanel) {
      mirrorPanel.appendChild(dock);
      badge("LM UI: OK (mounted on MIRROR panel)");
      return true;
    }

    // final fallback: fixed top-right
    dock.style.position = "fixed";
    dock.style.top = "12px";
    dock.style.right = "12px";
    dock.style.zIndex = "999999";
    document.body.appendChild(dock);
    badge("LM UI: OK (fixed fallback)");
    return true;
  }

  // ---- Tracks without artwork: create placeholder and make it clickable ----
  const URI_KEYS = ["uri", "spotifyUri", "trackUri", "contextUri"];

  function getRowUri(row) {
    if (!row) return "";
    for (const k of URI_KEYS) {
      const v = row.dataset ? row.dataset[k] : "";
      if (v) return v;
    }
    const any = row.querySelector("[data-uri], [data-spotify-uri], [data-track-uri]");
    if (any) return any.dataset.uri || any.dataset.spotifyUri || any.dataset.trackUri || "";
    const a = row.querySelector('a[href^="spotify:"], a[href*="open.spotify.com"]');
    return a ? (a.getAttribute("href") || "") : "";
  }

  function ensureArtworkPlaceholders() {
    const rows = document.querySelectorAll(".row,.listRow,.trackRow,.topRow,.itemRow,[data-lm='row']");
    let added = 0;

    rows.forEach((row) => {
      // already has artwork?
      const hasArt = row.querySelector(".art,.artwork,.cover,.thumb,.imgWrap,.media,[data-lm='artwork'],.lmGeneratedArtSlot");
      if (hasArt) return;

      const ph = document.createElement("div");
      ph.className = "lmGeneratedArtSlot";
      ph.setAttribute("data-lm", "artwork");
      ph.innerHTML = svgIcon("note");
      row.insertBefore(ph, row.firstChild);
      added++;
    });

    if (added) LOG("Artwork placeholders added:", added);
  }

  function enableArtworkClickPlay() {
    document.addEventListener(
      "click",
      (e) => {
        const t = e.target;
        // ignore dock clicks
        if (t.closest('[data-lm="dockWrap"]')) return;

        const art = t.closest('[data-lm="artwork"],.art,.artwork,.cover,.thumb,.imgWrap,.media,.lmGeneratedArtSlot');
        if (!art) return;

        const row = art.closest(".row,.listRow,.trackRow,.topRow,.itemRow,[data-lm='row']");
        if (!row) return;

        const uri = getRowUri(row);
        if (!uri) {
          WARN("No URI found for row click");
          return;
        }

        safeStop(e);
        LOG("Play from artwork click:", uri);
        callSpotify("playUri", uri);
      },
      true
    );
  }

  function keepStable() {
    const mo = new MutationObserver(() => {
      ensureDockMounted();
      ensureArtworkPlaceholders();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function boot() {
    try {
      badge("LM UI: booting…");
      LOG("Boot", { readyState: document.readyState });

      const b = getBridge();
      LOG("Spotify bridge found:", !!b, b ? Object.keys(b) : null);

      ensureDockMounted();
      ensureArtworkPlaceholders();
      enableArtworkClickPlay();
      keepStable();

      badge("LM UI: OK (boot complete)");
    } catch (e) {
      ERR("BOOT ERROR", e);
      badge("LM UI: ERROR (open console)", true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();