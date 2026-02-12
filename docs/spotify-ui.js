/* spotify-ui.js (FULL REPLACE)
   Premium dock + safe play popup + play/pause toggle + Spotify logo login/logout
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

  function closestAny(node, selectors) {
    for (const sel of selectors) {
      const hit = node?.closest?.(sel);
      if (hit) return hit;
    }
    return null;
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
    // force reflow
    void btn.offsetWidth;
    btn.classList.add("spPulse");
    setTimeout(() => btn.classList.remove("spPulse"), 220);
  }

  // ---------- CSS ----------
  function ensureCss() {
    if (document.getElementById("spotifyUiCss")) return;

    const css = `
/* Host must be relative */
.spNowHost{ position: relative !important; }

/* --- Dock pinned bottom-right inside NOW card --- */
#spNowDock{
  position: absolute;
  right: 16px;
  bottom: 14px; /* ✅ DOWN DOWN */
  z-index: 70;
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

/* Subtle premium base behind dock (optional) */
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

/* Spotify indicator: acts as login/logout button */
#spIndicator{
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  opacity: .35;
  filter: grayscale(1);
  transform: translateY(.5px);
  cursor: pointer;
}
#spIndicator.linked{
  opacity: .95;
  filter: none;
}
#spIndicator svg{ width:18px; height:18px; display:block; }

/* Transport buttons smaller + premium */
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

/* Pulse feedback */
#spNowDock .spPulse{
  outline-color: rgba(49,208,124,.55);
  box-shadow: 0 18px 70px rgba(0,0,0,.28);
}

/* -------- SAFE PLAY: mini play button for rows -------- */
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

/* -------- SAFE PLAY POPUP -------- */
#spModal{
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: none;
  align-items: center;
  justify-content: center;
}
#spModal.show{ display:flex; }

#spModalBackdrop{
  position:absolute;
  inset:0;
  background: rgba(0,0,0,.55);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

#spModalCard{
  position:relative;
  width: min(92vw, 420px);
  border-radius: 22px;
  background: rgba(14,16,18,.78);
  outline: 1px solid rgba(255,255,255,.10);
  box-shadow: 0 28px 90px rgba(0,0,0,.55);
  padding: 16px 16px 14px 16px;
}
#spModalTitle{ font-size: 16px; font-weight: 700; color: rgba(255,255,255,.95); margin: 0 0 6px 0; }
#spModalMeta{ font-size: 13px; color: rgba(255,255,255,.68); margin: 0 0 14px 0; }
#spModalActions{ display:flex; gap: 10px; justify-content: flex-end; }
.spModalBtn{
  border: 0;
  height: 36px;
  padding: 0 14px;
  border-radius: 12px;
  background: rgba(255,255,255,.07);
  outline: 1px solid rgba(255,255,255,.10);
  color: rgba(255,255,255,.92);
}
.spModalBtn.primary{
  background: rgba(49,208,124,.16);
  outline-color: rgba(49,208,124,.35);
}
.spModalBtn:active{ transform: translateY(1px); }
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
// ---------- Find NOW card host ----------
  function findNowHost() {
    const candidates = [
      document.querySelector("#nowCard"),
      document.querySelector(".nowCard"),
      document.querySelector(".now-card"),
      document.querySelector('[data-view="now"] .card'),
      document.querySelector('[data-section="now"]'),
      document.querySelector(".view.now"),
      document.querySelector("#viewNow"),
    ].filter(Boolean);
    if (candidates.length) return candidates[0];

    // heuristic: card that contains LIVE pill
    const allCards = Array.from(document.querySelectorAll(".card, .panel, section, .tile"));
    for (const c of allCards) {
      const txt = (c.innerText || "").toLowerCase();
      if (txt.includes("live") && (txt.includes("now") || txt.includes("listening"))) return c;
    }
    return null;
  }

  // ---------- Modal (confirm play) ----------
  function ensureModal() {
    if (document.getElementById("spModal")) return;

    const backdrop = el("div", { id: "spModalBackdrop" });
    const title = el("p", { id: "spModalTitle" }, ["Play this track?"]);
    const meta = el("p", { id: "spModalMeta" }, [""]);
    const btnCancel = el("button", { class: "spModalBtn", type: "button" }, ["Cancel"]);
    const btnPlay = el("button", { class: "spModalBtn primary", type: "button" }, ["Play"]);
    const actions = el("div", { id: "spModalActions" }, [btnCancel, btnPlay]);
    const card = el("div", { id: "spModalCard" }, [title, meta, actions]);

    const modal = el("div", { id: "spModal" }, [backdrop, card]);
    document.body.appendChild(modal);

    backdrop.addEventListener("click", () => hideModal(), { passive: true });
    btnCancel.addEventListener("click", () => hideModal(), { passive: true });

    modal._metaEl = meta;
    modal._confirmBtn = btnPlay;

    btnPlay.addEventListener("click", async () => {
      const uri = modal._pendingUri;
      if (!uri) return hideModal();
      await playUri(uri);
      hideModal();
    });
  }

  function showModal(uri, label) {
    ensureModal();
    const modal = document.getElementById("spModal");
    if (!modal) return;

    modal._pendingUri = uri;
    modal._metaEl.textContent = label || uri;

    modal.classList.add("show");
  }

  function hideModal() {
    const modal = document.getElementById("spModal");
    if (!modal) return;
    modal.classList.remove("show");
    modal._pendingUri = null;
  }

  // ---------- Spotify actions ----------
  async function playUri(uri) {
    // 1) prefer explicit playUri if exists
    let r = safeCall("SpotifyPlayer.playUri", uri);
    if (r.ok) return;

    // 2) fallback to play({ uri })
    r = safeCall("SpotifyPlayer.play", { uri });
    if (r.ok) return;

    // 3) fallback to play(uri)
    r = safeCall("SpotifyPlayer.play", uri);
    if (r.ok) return;

    console.warn("[Spotify UI] Cannot play URI (missing function):", uri);
  }

  async function getPlaybackState() {
    // Try a few known patterns
    let r = safeCall("SpotifyPlayer.getState");
    if (r.ok) {
      const v = await Promise.resolve(r.value);
      return v || null;
    }
    r = safeCall("SpotifyPlayer.getPlaybackState");
    if (r.ok) {
      const v = await Promise.resolve(r.value);
      return v || null;
    }
    return null;
  }

  function doLoginOrLogout() {
    const token = getToken();
    if (!token) {
      const r = safeCall("SpotifyAuth.login");
      if (!r.ok) console.warn("[Spotify UI] SpotifyAuth.login missing:", r.reason);
      return;
    }

    // logout if available, otherwise soft logout (clear common storage keys)
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
// ---------- Dock ----------
  function ensureDock() {
    ensureCss();

    let dock = document.getElementById("spNowDock");
    if (dock) return dock;

    const host = findNowHost();
    if (!host) return null;

    host.classList.add("spNowHost");

    const indicator = el("div", { id: "spIndicator", title: "Spotify" });
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
    const ids = ["spPrev", "spPlay", "spPause", "spNext"];
    for (const id of ids) {
      const b = document.getElementById(id);
      if (b) b.disabled = !enabled;
    }
  }

  function setIndicatorLinked(linked) {
    const ind = document.getElementById("spIndicator");
    if (!ind) return;
    if (linked) ind.classList.add("linked");
    else ind.classList.remove("linked");
  }

  function setPlayPauseVisible(isPlaying) {
    const play = document.getElementById("spPlay");
    const pause = document.getElementById("spPause");
    if (!play || !pause) return;

    // ✅ show only one
    if (isPlaying) {
      play.style.display = "none";
      pause.style.display = "grid";
    } else {
      play.style.display = "grid";
      pause.style.display = "none";
    }
  }

  function bindDockHandlers() {
    const byId = (id) => document.getElementById(id);

    byId("spIndicator")?.addEventListener("click", (e) => {
      e.preventDefault();
      doLoginOrLogout();
    }, { passive: false });

    byId("spPlay")?.addEventListener("click", (e) => {
      e.preventDefault();
      pulse(byId("spPlay"));
      const r = safeCall("SpotifyPlayer.play");
      if (!r.ok) console.warn("[Spotify UI] Play failed:", r.reason);
    }, { passive: false });

    byId("spPause")?.addEventListener("click", (e) => {
      e.preventDefault();
      pulse(byId("spPause"));
      const r = safeCall("SpotifyPlayer.pause");
      if (!r.ok) console.warn("[Spotify UI] Pause failed:", r.reason);
    }, { passive: false });

    byId("spNext")?.addEventListener("click", (e) => {
      e.preventDefault();
      pulse(byId("spNext"));
      const r = safeCall("SpotifyPlayer.next");
      if (!r.ok) console.warn("[Spotify UI] Next failed:", r.reason);
    }, { passive: false });

    byId("spPrev")?.addEventListener("click", (e) => {
      e.preventDefault();
      pulse(byId("spPrev"));
      const r = safeCall("SpotifyPlayer.prev");
      if (!r.ok) console.warn("[Spotify UI] Prev failed:", r.reason);
    }, { passive: false });
  }
// ---------- Safe play for list items ----------
  function extractSpotifyUriFromNode(node) {
    // Accept:
    // - data-spotify-uri / data-uri
    // - links to open.spotify.com/track/...
    // - spotify:track:...
    const ds = node?.dataset || {};
    const cand =
      ds.spotifyUri ||
      ds.uri ||
      ds.spotifyTrackUri ||
      ds.spotifyId ||
      null;

    if (cand) {
      if (cand.startsWith("spotify:")) return cand;
      // if it's an ID, assume track id
      if (/^[A-Za-z0-9]{22}$/.test(cand)) return `spotify:track:${cand}`;
    }

    const a = node?.closest?.("a[href]");
    const href = a?.getAttribute?.("href") || "";
    if (href.includes("open.spotify.com/track/")) {
      const m = href.match(/track\/([A-Za-z0-9]{22})/);
      if (m?.[1]) return `spotify:track:${m[1]}`;
    }
    if (href.startsWith("spotify:")) return href;

    return null;
  }

  function extractLabelFromNode(node) {
    // Try to build a nice label for the popup
    const row = node.closest?.(".row, .track, .trackRow, .item, li, .listItem") || node;
    const text = (row?.innerText || "").trim().replace(/\s+/g, " ");
    if (text) return text.slice(0, 90);
    return "";
  }

  function attachMiniPlayButtons() {
    // try to find list rows that represent tracks
    const rows = Array.from(document.querySelectorAll(".row, .track, .trackRow, .listItem, li"))
      .filter(r => extractSpotifyUriFromNode(r));

    for (const r of rows) {
      if (r.querySelector(".spMiniPlay")) continue;

      // Make sure it's not the NOW card
      if (r.closest?.("#spNowDock")) continue;

      const btn = el("button", { class: "spMiniPlay", type: "button", "aria-label": "Play track" });
      btn.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 7v10l8-5-8-5z"/></svg>`;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uri = extractSpotifyUriFromNode(r) || extractSpotifyUriFromNode(e.target);
        if (!uri) return;
        const label = extractLabelFromNode(r);
        showModal(uri, label);
      }, { passive: false });

      // append at end, keep layout safe
      r.style.display = r.style.display || "flex";
      r.style.alignItems = r.style.alignItems || "center";
      r.appendChild(btn);
    }
  }

  function interceptRowClicks() {
    // Click anywhere on a track row opens confirmation modal (prevents accidental play)
    document.addEventListener("click", (e) => {
      const token = getToken();
      if (!token) return;

      const hit = closestAny(e.target, [
        ".row[data-spotify-uri]",
        ".row[data-uri]",
        ".track[data-spotify-uri]",
        ".track[data-uri]",
        ".trackRow[data-spotify-uri]",
        ".trackRow[data-uri]",
        "a[href*='open.spotify.com/track/']",
        "a[href^='spotify:track:']"
      ]);

      if (!hit) return;

      // If user clicked the mini play button, let it handle it
      if (e.target?.closest?.(".spMiniPlay")) return;

      // Do NOT intercept clicks inside the NOW dock
      if (e.target?.closest?.("#spNowDock")) return;

      const uri = extractSpotifyUriFromNode(hit);