/* spotify-ui.js (FULL REPLACE)
   Fixes:
   - Dock placed bottom-inside NOW card (premium)
   - One main button toggles play/pause correctly (no micro-stop/restart)
   - Artwork click works for IMG covers AND background-image covers (Recent/Top)
*/

(function () {
  "use strict";

  const API_BASE = (window.LISTENING_MIRROR_API || "https://i.errtanq9.workers.dev").replace(/\/+$/, "");

  // ---------------- DOM helpers ----------------
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
    // fallback common keys
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

  function pulse(node) {
    if (!node) return;
    node.classList.remove("spPulse");
    void node.offsetWidth;
    node.classList.add("spPulse");
    setTimeout(() => node.classList.remove("spPulse"), 220);
  }

  // ---------------- CSS ----------------
  function ensureCss() {
    if (document.getElementById("spotifyUiCss")) return;

    const css = `
#spDock{
  position: fixed;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 10px;
  pointer-events: auto;
  transform: translate3d(0,0,0);
}
#spDock::before{
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
#spDock, #spDock *{ pointer-events: auto !important; -webkit-user-select:none; user-select:none; }

#spIndicator{
  width: 18px; height: 18px;
  display: grid; place-items: center;
  opacity: .35; filter: grayscale(1);
  cursor: pointer;
}
#spIndicator.linked{ opacity:.95; filter:none; }
#spIndicator svg{ width:18px; height:18px; display:block; }

#spDock .spBtn{
  border: 0;
  width: 34px; height: 34px;
  border-radius: 999px;
  display: grid; place-items: center;
  background: rgba(255,255,255,.06);
  outline: 1px solid rgba(255,255,255,.10);
  box-shadow: 0 14px 45px rgba(0,0,0,.24);
  color: rgba(255,255,255,.92);
  padding: 0;
  transition: transform .12s ease, background .12s ease, outline-color .12s ease;
}
#spDock .spBtn:active{ transform: translateY(1px); background: rgba(255,255,255,.08); }
#spDock .spBtn:disabled{ opacity:.32; }
#spDock svg.icon{ width:16px; height:16px; display:block; }
#spDock .spPulse{ outline-color: rgba(49,208,124,.55); box-shadow: 0 18px 70px rgba(0,0,0,.28); }

/* Click-to-play affordance on artworks */
.spArtworkPlayable{
  cursor: pointer !important;
  outline: 1px solid rgba(49,208,124,.0);
  border-radius: 12px;
  transition: outline-color .12s ease, transform .12s ease, filter .12s ease;
}
.spArtworkPlayable:active{ transform: translateY(1px); outline-color: rgba(49,208,124,.35); }
    `.trim();

    const style = document.createElement("style");
    style.id = "spotifyUiCss";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------------- Icons ----------------
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
// ---------------- Spotify actions ----------------
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

  async function pauseSafe() {
    const r = safeCall("SpotifyPlayer.pause");
    if (!r.ok) console.warn("[Spotify UI] Pause failed:", r.reason);
  }

  async function resumeSafe() {
    // IMPORTANT: calling play() while already playing can cause the micro-stop/restart.
    // So we ONLY call resume when we are NOT currently playing.
    let r = safeCall("SpotifyPlayer.play");
    if (r.ok) return;
    r = safeCall("SpotifyPlayer.resume");
    if (r.ok) return;
    console.warn("[Spotify UI] Resume failed (missing function).");
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

  // ---------------- Dock (fixed, never lost) ----------------
  function ensureDock() {
    ensureCss();

    let dock = document.getElementById("spDock");
    if (dock) return dock;

    const indicator = el("div", { id: "spIndicator", title: "Spotify (login/logout)" });
    indicator.innerHTML = spotifyLogoSvg();

    const btnPrev = el("button", { class: "spBtn", id: "spPrev", type: "button", "aria-label": "Previous" });
    const btnToggle = el("button", { class: "spBtn", id: "spToggle", type: "button", "aria-label": "Play/Pause" });
    const btnNext = el("button", { class: "spBtn", id: "spNext", type: "button", "aria-label": "Next" });

    btnPrev.innerHTML = iconSvg("prev");
    btnToggle.innerHTML = iconSvg("play"); // will switch to pause when playing
    btnNext.innerHTML = iconSvg("next");

    dock = el("div", { id: "spDock" }, [indicator, btnPrev, btnToggle, btnNext]);
    document.body.appendChild(dock);

    bindDockHandlers();
    return dock;
  }

  function setEnabled(enabled) {
    for (const id of ["spPrev", "spToggle", "spNext"]) {
      const b = document.getElementById(id);
      if (b) b.disabled = !enabled;
    }
  }

  function setIndicatorLinked(linked) {
    const ind = document.getElementById("spIndicator");
    if (!ind) return;
    ind.classList.toggle("linked", !!linked);
  }

  function setToggleIcon(isPlaying) {
    const t = document.getElementById("spToggle");
    if (!t) return;
    t.innerHTML = isPlaying ? iconSvg("pause") : iconSvg("play");
  }

  function bindDockHandlers() {
    const $ = (id) => document.getElementById(id);

    $("spIndicator")?.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        doLoginOrLogout();
      },
      { passive: false }
    );

    $("spToggle")?.addEventListener(
      "click",
      async (e) => {
        e.preventDefault();
        pulse($("spToggle"));

        const st = await getPlaybackState();
        const isPlaying =
          !!st &&
          (st.isPlaying === true ||
            st.playing === true ||
            (typeof st.paused === "boolean" ? !st.paused : false));

        if (isPlaying) {
          await pauseSafe();
        } else {
          await resumeSafe();
        }
      },
      { passive: false }
    );

    $("spNext")?.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        pulse($("spNext"));
        const r = safeCall("SpotifyPlayer.next");
        if (!r.ok) console.warn("[Spotify UI] Next failed:", r.reason);
      },
      { passive: false }
    );

    $("spPrev")?.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        pulse($("spPrev"));
        const r = safeCall("SpotifyPlayer.prev");
        if (!r.ok) console.warn("[Spotify UI] Prev failed:", r.reason);
      },
      { passive: false }
    );
  }
// ---------------- Find NOW card (better) ----------------
  function isGoodCardRect(rect) {
    if (!rect) return false;
    // "card-ish" bounds on mobile
    return rect.width > 250 && rect.height > 120 && rect.top >= 0 && rect.left >= 0;
  }

  function findNowCardElement() {
    // Strategy:
    // 1) Find LIVE badge, climb up until we hit a reasonably sized card.
    const liveNodes = Array.from(document.querySelectorAll("*"))
      .filter((n) => (n?.textContent || "").trim().toLowerCase() === "live")
      .slice(0, 20);

    for (const ln of liveNodes) {
      let cur = ln;
      for (let i = 0; i < 8 && cur; i++) {
        const r = cur.getBoundingClientRect?.();
        if (r && isGoodCardRect(r)) {
          // prefer ones that also contain track title + artist (at least 2 lines)
          const txt = (cur.innerText || "").split("\n").map(s => s.trim()).filter(Boolean);
          if (txt.length >= 2) return cur;
        }
        cur = cur.parentElement;
      }
    }

    // 2) Fallback: find the largest element near top that contains the current track text
    // (Often a card with big background artwork)
    const candidates = Array.from(document.querySelectorAll("section, article, div"))
      .filter((n) => {
        const t = (n.innerText || "").toLowerCase();
        return t.includes("now") === false && t.length > 0;
      })
      .filter((n) => {
        const r = n.getBoundingClientRect?.();
        return r && isGoodCardRect(r) && r.top < window.innerHeight * 0.55;
      });

    // Choose the widest among candidates in upper half
    candidates.sort((a, b) => (b.getBoundingClientRect().width - a.getBoundingClientRect().width));
    return candidates[0] || null;
  }

  function positionDock() {
    const dock = ensureDock();
    if (!dock) return;

    const nowCard = findNowCardElement();

    if (!nowCard) {
      // fallback: keep visible
      dock.style.right = `16px`;
      dock.style.top = `180px`;
      dock.style.left = "auto";
      dock.style.bottom = "auto";
      dock.style.transform = "none";
      return;
    }

    const r = nowCard.getBoundingClientRect();

    // PREMIUM placement: bottom-right inside card, but not stuck on edge.
    // If you want even lower, increase bottomPad.
    const rightPad = 18;
    const bottomPad = 18;

    const x = Math.max(10, r.right - rightPad);
    const y = Math.max(10, r.bottom - bottomPad);

    dock.style.left = `${x}px`;
    dock.style.top = `${y}px`;
    dock.style.right = "auto";
    dock.style.bottom = "auto";
    dock.style.transform = "translate(-100%, -100%)"; // anchor bottom-right
  }

  // ---------------- Artwork click => play (img OR background-image) ----------------
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

  function guessArtistTrackFromRow(row) {
    const ds = row?.dataset || {};
    const a1 = (ds.artist || ds.lastfmArtist || "").trim();
    const t1 = (ds.track || ds.name || ds.lastfmTrack || "").trim();
    if (a1 && t1) return { artist: a1, track: t1 };

    const text = (row?.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean);
    if (!text.length) return { artist: "", track: "" };

    const line0 = (text[0] || "").replace(/^\s*\d+\.\s+/, "").trim();
    const line1 = (text[1] || "").replace(/^\s*\d+\.\s+/, "").trim();

    return { track: line0, artist: line1 };
  }

  async function resolveUriForRow(row) {
    const u0 = extractSpotifyUriFromNode(row);
    if (u0) return u0;

    const hook = window.ListeningMirror?.resolveRowToSpotifyUri;
    if (typeof hook === "function") {
      try {
        const u1 = await hook(row);
        if (u1) return u1;
      } catch {}
    }

    const { artist, track } = guessArtistTrackFromRow(row);
    const q = [artist, track].filter(Boolean).join(" ");
    if (!q) return "";

    try {
      const r = await fetch(`${API_BASE}/resolve?q=${encodeURIComponent(q)}`, { method: "GET" });
      const j = await r.json();
      const id = j?.best?.id;
      if (id && /^[A-Za-z0-9]{22}$/.test(id)) return `spotify:track:${id}`;
    } catch {}

    return "";
  }

  function getArtworkClickable(row) {
    // 1) IMG artwork
    const img = row.querySelector?.("img");
    if (img) return img;

    // 2) Background-image artwork (common in “premium” UI cards)
    const bgCandidates = Array.from(row.querySelectorAll?.("div, span, a") || []);
    for (const n of bgCandidates) {
      const st = window.getComputedStyle(n);
      const bg = st?.backgroundImage || "";
      if (bg && bg !== "none" && bg.includes("url(")) return n;
    }
    return null;
  }

  function guessRows() {
    // Prefer real list items first
    const li = Array.from(document.querySelectorAll("li"));
    if (li.length) return li;

    // fallback: row-ish containers that have either img or background-image cover
    const nodes = Array.from(document.querySelectorAll("div, article, section"))
      .filter((n) => (n.textContent || "").trim().length > 6);

    return nodes;
  }
function attachArtworkPlay() {
    if (!getToken()) return;

    const rows = guessRows();

    for (const row of rows) {
      const art = getArtworkClickable(row);
      if (!art) continue;

      if (art.dataset.spBound === "1") continue;
      art.dataset.spBound = "1";

      art.classList.add("spArtworkPlayable");

      // Use CAPTURE so we beat other handlers that swallow taps
      art.addEventListener(
        "click",
        async (e) => {
          e.preventDefault();
          e.stopPropagation();
          pulse(art);

          const uri = await resolveUriForRow(row);
          if (uri) return playUri(uri);

          console.warn("[Spotify UI] Could not resolve URI for row.");
        },
        { passive: false, capture: true }
      );
    }
  }

  // ---------------- State loop ----------------
  async function observeLoop() {
    let lastLinked = null;
    let lastPlaying = null;

    async function tick() {
      ensureDock();
      positionDock();

      const linked = !!getToken();
      if (linked !== lastLinked) {
        setIndicatorLinked(linked);
        setEnabled(linked);
        lastLinked = linked;
      }

      if (!linked) {
        setToggleIcon(false);
      } else {
        const st = await getPlaybackState();
        const isPlaying =
          !!st &&
          (st.isPlaying === true ||
            st.playing === true ||
            (typeof st.paused === "boolean" ? !st.paused : false));

        if (isPlaying !== lastPlaying) {
          setToggleIcon(isPlaying);
          lastPlaying = isPlaying;
        }

        attachArtworkPlay();
      }

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  function boot() {
    ensureDock();

    const mo = new MutationObserver(() => {
      ensureDock();
      positionDock();
      attachArtworkPlay();
    });
    mo.observe(document.documentElement, { subtree: true, childList: true });

    observeLoop();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();