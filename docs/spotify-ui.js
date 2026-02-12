/* spotify-ui.js (FULL REPLACE)
   - Bullet-proof mount for Spotify dock (never disappears)
   - Dock pinned bottom-right inside NOW card
   - Spotify logo = login/logout indicator
   - Mini-play button per row to avoid accidents (no row-click autoplay)
*/

(function () {
  "use strict";

  // ---------- DOM helpers ----------
  function el(tag, props = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k === "style") n.setAttribute("style", v);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v, { passive: false });
      else if (v === true) n.setAttribute(k, "");
      else if (v !== false && v != null) n.setAttribute(k, String(v));
    }
    for (const c of children) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
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
    return null;
  }

  function pulse(btn) {
    if (!btn) return;
    btn.classList.remove("spPulse");
    void btn.offsetWidth;
    btn.classList.add("spPulse");
    setTimeout(() => btn.classList.remove("spPulse"), 220);
  }

  // ---------- CSS ----------
  function ensureCss() {
    if (document.getElementById("spotifyUiCss")) return;

    const css = `
/* Ensure host is relative */
.spNowHost{ position: relative !important; }

/* Dock pinned bottom-right inside NOW card */
#spNowDock{
  position: absolute;
  right: 16px;
  bottom: 14px; /* ✅ DOWN DOWN */
  z-index: 999;
  display: flex;
  align-items: center;
  gap: 10px;
  pointer-events: auto;
}
#spNowDock, #spNowDock *{
  pointer-events: auto !important;
  -webkit-user-select: none;
  user-select: none;
}
#spNowDock::before{
  content:"";
  position:absolute;
  inset:-10px -12px -10px -12px;
  border-radius: 999px;
  background: rgba(10,12,14,.38);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  outline: 1px solid rgba(255,255,255,.08);
  box-shadow: 0 18px 60px rgba(0,0,0,.35);
  z-index:-1;
}

/* Spotify indicator */
#spIndicator{
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  opacity: .35;
  filter: grayscale(1);
  cursor: pointer;
}
#spIndicator.linked{
  opacity: .95;
  filter: none;
}
#spIndicator svg{ width:18px; height:18px; display:block; }

/* Transport buttons */
#spNowDock .spBtn{
  border: 0;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(255,255,255,.06);
  outline: 1px solid rgba(255,255,255,.10);
  box-shadow: 0 14px 45px rgba(0,0,0,.24);
  color: rgba(255,255,255,.92);
  padding: 0;
  transition: transform .12s ease, background .12s ease, outline-color .12s ease;
}
#spNowDock .spBtn:active{ transform: translateY(1px); background: rgba(255,255,255,.08); }
#spNowDock .spBtn:disabled{ opacity:.32; }
#spNowDock svg.icon{ width:16px; height:16px; display:block; }
#spNowDock .spPulse{
  outline-color: rgba(49,208,124,.55);
  box-shadow: 0 18px 70px rgba(0,0,0,.28);
}

/* Mini play button per list row */
.spMiniPlay{
  border:0;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  display:grid;
  place-items:center;
  background: rgba(255,255,255,.05);
  outline: 1px solid rgba(255,255,255,.08);
  color: rgba(255,255,255,.85);
  margin-left: 10px;
  flex: 0 0 auto;
}
.spMiniPlay svg{ width: 13px; height: 13px; }
.spMiniPlay:active{ transform: translateY(1px); }

/* Make rows accept appended mini play without breaking layout */
.spRowFlex{
  display:flex !important;
  align-items:center !important;
}
.spRowFlex .spRowMain{
  flex: 1 1 auto;
  min-width: 0;
}
    `.trim();

    const style = document.createElement("style");
    style.id = "spotifyUiCss";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------- Icons ----------
  function iconSvg(name) {
    if (name === "prev") return `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M6 6h2v12H6V6zm3.5 6L18 6v12l-8.5-6z"/></svg>`;
    if (name === "play") return `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7L8 5z"/></svg>`;
    if (name === "pause") return `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/></svg>`;
    if (name === "next") return `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M16 6h2v12h-2V6zM6 18V6l8.5 6L6 18z"/></svg>`;
    return "";
  }

  function spotifyLogoSvg() {
    return `
      <svg viewBox="0 0 168 168" aria-hidden="true">
        <path fill="currentColor" d="M84 0C37.6 0 0 37.6 0 84s37.6 84 84 84 84-37.6 84-84S130.4 0 84 0zm38.6 121.3c-1.5 2.4-4.6 3.2-7 1.7-19.2-11.7-43.4-14.3-72-7.8-2.8.6-5.6-1.1-6.2-3.9-.6-2.8 1.1-5.6 3.9-6.2 31.5-7.2 58.5-4.2 80.3 9.1 2.4 1.5 3.2 4.6 1.7 7.1zm9.9-22c-1.9 3-5.8 4-8.8 2.1-22-13.5-55.6-17.4-81.8-9.5-3.4 1-7-0.9-8-4.3-1-3.4.9-7 4.3-8 30-9.1 67.3-4.7 92.8 11.1 3 1.9 4 5.9 2.1 8.6zm.8-23c-26.3-15.6-69.7-17.1-94.8-9.5-4 .1-7.4-2.6-8.5-6.4-1.1-3.8 1.2-7.8 5-8.9 29.1-8.8 77.5-7.1 108.1 11.1 3.5 2.1 4.7 6.7 2.6 10.2-2.1 3.5-6.7 4.7-10.2 2.6z"/>
      </svg>
    `;
  }
// ---------- Spotify actions ----------
  async function playUri(uri) {
    let r = safeCall("SpotifyPlayer.playUri", uri);
    if (r.ok) return;

    r = safeCall("SpotifyPlayer.play", { uri });
    if (r.ok) return;

    r = safeCall("SpotifyPlayer.play", uri);
    if (r.ok) return;

    console.warn("[Spotify UI] Cannot play URI (missing function):", uri);
  }

  async function getPlaybackState() {
    let r = safeCall("SpotifyPlayer.getState");
    if (r.ok) return await Promise.resolve(r.value);

    r = safeCall("SpotifyPlayer.getPlaybackState");
    if (r.ok) return await Promise.resolve(r.value);

    return null;
  }

  function doLoginOrLogout() {
    const token = getToken();
    if (!token) {
      const r = safeCall("SpotifyAuth.login");
      if (!r.ok) console.warn("[Spotify UI] SpotifyAuth.login missing:", r.reason);
      return;
    }

    let r = safeCall("SpotifyAuth.logout");
    if (r.ok) return;

    try {
      localStorage.removeItem("spotify_access_token");
      localStorage.removeItem("spotify_refresh_token");
      localStorage.removeItem("SPOTIFY_ACCESS_TOKEN");
      localStorage.removeItem("SPOTIFY_REFRESH_TOKEN");
      sessionStorage.removeItem("spotify_access_token");
      sessionStorage.removeItem("spotify_refresh_token");
    } catch {}
  }

  // ---------- Find NOW host (bullet-proof) ----------
  function findNowHost() {
    // 1) If we already mounted before
    const mounted = document.querySelector(".spNowHost");
    if (mounted) return mounted;

    // 2) Prefer card that contains LIVE badge
    const liveNodes = Array.from(document.querySelectorAll("*"))
      .filter(n => n && n.childElementCount < 30) // small-ish nodes
      .filter(n => (n.textContent || "").trim().toLowerCase() === "live");

    for (const ln of liveNodes) {
      const card = ln.closest(".card, .panel, .tile, section, article, div");
      if (card) return card;
    }

    // 3) Fallback: tab bar (Now/Recent/Top) exists -> take next big card under it
    const tab = Array.from(document.querySelectorAll("*"))
      .find(n => {
        const t = (n.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        return t.includes("now") && t.includes("recent") && t.includes("top");
      });

    if (tab) {
      const container = tab.closest(".card, .panel, .tile, section, article, div") || tab.parentElement;
      if (container) {
        // first big card after tabs
        const nextCards = Array.from(container.querySelectorAll(".card, .panel, .tile, section, article, div"));
        if (nextCards.length) return nextCards[0];
      }
    }

    // 4) Absolute fallback: first big card on page
    const first = document.querySelector(".card, .panel, .tile, section, article");
    return first || null;
  }

  // ---------- Dock ----------
  function ensureDock() {
    ensureCss();

    let dock = document.getElementById("spNowDock");
    if (dock) return dock;

    const host = findNowHost();
    if (!host) return null;

    host.classList.add("spNowHost");

    const indicator = el("div", { id: "spIndicator", title: "Spotify (login/logout)" });
    indicator.innerHTML = spotifyLogoSvg();

    const btnPrev = el("button", { class: "spBtn", id: "spPrev", type: "button", "aria-label": "Previous" });
    const btnPlay = el("button", { class: "spBtn", id: "spPlay", type: "button", "aria-label": "Play" });
    const btnPause = el("button", { class: "spBtn", id: "spPause", type: "button", "aria-label": "Pause" });
    const btnNext = el("button", { class: "spBtn", id: "spNext", type: "button", "aria-label": "Next" });

    btnPrev.innerHTML = iconSvg("prev");
    btnPlay.innerHTML = iconSvg("play");
    btnPause.innerHTML = iconSvg("pause");
    btnNext.innerHTML = iconSvg("next");

    dock = el("div", { id: "spNowDock" }, [indicator, btnPrev, btnPlay, btnPause, btnNext]);
    host.appendChild(dock);

    return dock;
  }

  function setEnabled(enabled) {
    for (const id of ["spPrev", "spPlay", "spPause", "spNext"]) {
      const b = document.getElementById(id);
      if (b) b.disabled = !enabled;
    }
  }

  function setIndicatorLinked(linked) {
    const ind = document.getElementById("spIndicator");
    if (!ind) return;
    ind.classList.toggle("linked", !!linked);
  }

  function setPlayPauseVisible(isPlaying) {
    const play = document.getElementById("spPlay");
    const pause = document.getElementById("spPause");
    if (!play || !pause) return;

    if (isPlaying) {
      play.style.display = "none";
      pause.style.display = "grid";
    } else {
      play.style.display = "grid";
      pause.style.display = "none";
    }
  }
function bindDockHandlers() {
    const $ = (id) => document.getElementById(id);

    $("spIndicator")?.addEventListener("click", (e) => {
      e.preventDefault();
      doLoginOrLogout();
    }, { passive: false });

    $("spPlay")?.addEventListener("click", (e) => {
      e.preventDefault();
      pulse($("spPlay"));
      const r = safeCall("SpotifyPlayer.play");
      if (!r.ok) console.warn("[Spotify UI] Play failed:", r.reason);
    }, { passive: false });

    $("spPause")?.addEventListener("click", (e) => {
      e.preventDefault();
      pulse($("spPause"));
      const r = safeCall("SpotifyPlayer.pause");
      if (!r.ok) console.warn("[Spotify UI] Pause failed:", r.reason);
    }, { passive: false });

    $("spNext")?.addEventListener("click", (e) => {
      e.preventDefault();
      pulse($("spNext"));
      const r = safeCall("SpotifyPlayer.next");
      if (!r.ok) console.warn("[Spotify UI] Next failed:", r.reason);
    }, { passive: false });

    $("spPrev")?.addEventListener("click", (e) => {
      e.preventDefault();
      pulse($("spPrev"));
      const r = safeCall("SpotifyPlayer.prev");
      if (!r.ok) console.warn("[Spotify UI] Prev failed:", r.reason);
    }, { passive: false });
  }

  // ---------- Mini play for list rows ----------
  function extractSpotifyUriFromNode(node) {
    const ds = node?.dataset || {};
    const cand =
      ds.spotifyUri ||
      ds.uri ||
      ds.spotifyTrackUri ||
      ds.spotifyId ||
      null;

    if (cand) {
      if (cand.startsWith("spotify:")) return cand;
      if (/^[A-Za-z0-9]{22}$/.test(cand)) return `spotify:track:${cand}`;
    }

    const a = node?.querySelector?.("a[href*='open.spotify.com/track/'], a[href^='spotify:track:']") ||
              node?.closest?.("a[href*='open.spotify.com/track/'], a[href^='spotify:track:']");
    const href = a?.getAttribute?.("href") || "";
    if (href.includes("open.spotify.com/track/")) {
      const m = href.match(/track\/([A-Za-z0-9]{22})/);
      if (m?.[1]) return `spotify:track:${m[1]}`;
    }
    if (href.startsWith("spotify:")) return href;

    return null;
  }

  function rowLabel(row) {
    const t = (row?.innerText || "").trim().replace(/\s+/g, " ");
    return t ? t.slice(0, 120) : "";
  }

  function guessTrackRows() {
    // The UI seems to use list rows with artwork + title + artist.
    // We'll take any element that contains a numbered title like "1. Something"
    // or any row with an artwork img + text.
    const candidates = Array.from(document.querySelectorAll("li, .row, .track, .trackRow, .listItem, div"))
      .filter(n => n && n.children && n.children.length)
      .filter(n => {
        const txt = (n.textContent || "").trim();
        if (!txt) return false;
        // numbered list pattern: "12. Track Name"
        if (/^\s*\d+\.\s+/.test(txt)) return true;
        // has artwork img + some title text
        const hasImg = !!n.querySelector("img");
        const hasWords = txt.length > 8;
        return hasImg && hasWords;
      });

    // de-dup (keep higher-level rows)
    const uniq = [];
    for (const c of candidates) {
      if (uniq.some(u => u.contains(c))) continue;
      uniq.push(c);
    }
    return uniq;
  }

  function attachMiniPlayButtons() {
    if (!getToken()) return;

    const rows = guessTrackRows();
    for (const r of rows) {
      if (r.id === "spNowDock") continue;
      if (r.querySelector(".spMiniPlay")) continue;

      const uri = extractSpotifyUriFromNode(r);
      // If uri not present in DOM, we still might resolve later (Top list uses backend resolve)
      // We'll still add button, and on click we'll try:
      // 1) uri from dataset / link
      // 2) window.resolveSpotifyForRow(row) if app provides
      // 3) no-op
      const btn = el("button", { class: "spMiniPlay", type: "button", "aria-label": "Play" });
      btn.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 7v10l8-5-8-5z"/></svg>`;

      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        pulse(btn);

        const u1 = extractSpotifyUriFromNode(r);
        if (u1) return playUri(u1);

        // Optional hook if your app exposes a resolver:
        // window.ListeningMirror.resolveRowToSpotifyUri(row) -> Promise<string>
        const hook = window.ListeningMirror?.resolveRowToSpotifyUri;
        if (typeof hook === "function") {
          try {
            const u2 = await hook(r);
            if (u2) return playUri(u2);
          } catch {}
        }

        console.warn("[Spotify UI] No URI found for row:", rowLabel(r));
      }, { passive: false });

      // Make row flex-friendly without breaking existing layout
      r.classList.add("spRowFlex");
      // Wrap existing children into main container if not already wrapped
      if (!r.querySelector(":scope > .spRowMain")) {
        const main = el("div", { class: "spRowMain" });
        while (r.firstChild) main.appendChild(r.firstChild);
        r.appendChild(main);
      }
      r.appendChild(btn);
    }
  }
// ---------- State loop ----------
  async function observeStateLoop() {
    let lastLinked = null;
    let lastPlaying = null;

    async function tick() {
      // ensure dock always exists (page transitions / tab switches)
      ensureDock();

      const linked = !!getToken();
      if (linked !== lastLinked) {
        setIndicatorLinked(linked);
        setEnabled(linked);
        lastLinked = linked;
      }

      if (!linked) {
        setPlayPauseVisible(false);
      } else {
        let isPlaying = false;
        const st = await getPlaybackState();
        if (st && typeof st === "object") {
          if (typeof st.isPlaying === "boolean") isPlaying = st.isPlaying;
          else if (typeof st.playing === "boolean") isPlaying = st.playing;
          else if (typeof st.paused === "boolean") isPlaying = !st.paused;
        }
        if (isPlaying !== lastPlaying) {
          setPlayPauseVisible(isPlaying);
          lastPlaying = isPlaying;
        }
        // keep adding mini-play buttons (lists change)
        attachMiniPlayButtons();
      }

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  function boot() {
    const dock = ensureDock();
    if (dock) bindDockHandlers();

    // also handle re-mount after navigation
    const mo = new MutationObserver(() => {
      const d = ensureDock();
      if (d && !d._bound) {
        bindDockHandlers();
        d._bound = true;
      }
    });
    mo.observe(document.documentElement, { subtree: true, childList: true });

    observeStateLoop();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();