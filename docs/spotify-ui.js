/* spotify-ui.js (FULL REPLACE)
   - No Connect button
   - Tap glyph to login
   - Icon-only transport buttons
*/

(function () {
  "use strict";

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

  function ensureCss() {
    if (document.getElementById("spotifyUiCss")) return;

    const css = `
/* --- Spotify UI hardening --- */
#spotifyBar{
  position: relative;
  z-index: 9999;
  pointer-events: auto;
  margin: 12px 0 0 0;
}
#spotifyBar, #spotifyBar *{
  pointer-events: auto !important;
  -webkit-user-select: none;
  user-select: none;
}
#spotifyBar .spRow{
  display:flex;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
}
#spotifyBar .spStatus{
  color: rgba(255,255,255,.70);
  font-size: 13px;
  letter-spacing: .2px;
  margin-right: 6px;
  min-width: 140px;
}
#spotifyBar .spBtn{
  border:0;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display:grid;
  place-items:center;
  background: rgba(255,255,255,.055);
  outline: 1px solid rgba(255,255,255,.10);
  box-shadow: 0 14px 40px rgba(0,0,0,.25);
  color: rgba(255,255,255,.92);
}
#spotifyBar .spBtn:active{
  transform: translateY(1px);
  background: rgba(255,255,255,.075);
}
#spotifyBar .spBtn:disabled{
  opacity: .38;
  filter: grayscale(0.15);
}
#spotifyBar svg{
  width: 18px;
  height: 18px;
  display:block;
}
.glyph{
  cursor: pointer;
}
    `.trim();

    const style = document.createElement("style");
    style.id = "spotifyUiCss";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function iconSvg(name){
    // simple inline icons
    if (name === "prev") return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M6 6h2v12H6V6zm3.5 6L18 6v12l-8.5-6z"/>
      </svg>`;
    if (name === "play") return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M8 5v14l11-7L8 5z"/>
      </svg>`;
    if (name === "pause") return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/>
      </svg>`;
    if (name === "next") return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M16 6h2v12h-2V6zM6 18V6l8.5 6L6 18z"/>
      </svg>`;
    return "";
  }

  function insertBar() {
    ensureCss();

    const existing = document.getElementById("spotifyBar");
    if (existing) return existing;

    const tabs = document.querySelector(".tabs");
    const status = el("div", { class: "spStatus", id: "spStatus" }, ["Spotify: not linked"]);

    const btnPrev = el("button", { class: "spBtn", id: "spPrev", type: "button", "aria-label":"Previous" });
    const btnPlay = el("button", { class: "spBtn", id: "spPlay", type: "button", "aria-label":"Play" });
    const btnPause = el("button", { class: "spBtn", id: "spPause", type: "button", "aria-label":"Pause" });
    const btnNext = el("button", { class: "spBtn", id: "spNext", type: "button", "aria-label":"Next" });

    btnPrev.innerHTML = iconSvg("prev");
    btnPlay.innerHTML = iconSvg("play");
    btnPause.innerHTML = iconSvg("pause");
    btnNext.innerHTML = iconSvg("next");

    const row = el("div", { class: "spRow" }, [status, btnPrev, btnPlay, btnPause, btnNext]);
    const bar = el("div", { id: "spotifyBar" }, [row]);

    if (tabs) tabs.insertAdjacentElement("afterend", bar);
    else (document.querySelector(".app") || document.body).appendChild(bar);

    return bar;
  }

  function setStatus(text) {
    const s = document.getElementById("spStatus");
    if (s) s.textContent = text;
  }

  function setEnabled(enabled) {
    const ids = ["spPrev", "spPlay", "spPause", "spNext"];
    for (const id of ids) {
      const b = document.getElementById(id);
      if (b) b.disabled = !enabled;
    }
  }

  function bindHandlers() {
    const byId = (id) => document.getElementById(id);

    byId("spPlay")?.addEventListener("click", async (e) => {
      e.preventDefault();
      let r = safeCall("SpotifyPlayer.play");
      if (!r.ok) console.warn("[Spotify UI] Play failed:", r.reason);
    });

    byId("spPause")?.addEventListener("click", async (e) => {
      e.preventDefault();
      let r = safeCall("SpotifyPlayer.pause");
      if (!r.ok) console.warn("[Spotify UI] Pause failed:", r.reason);
    });

    byId("spNext")?.addEventListener("click", async (e) => {
      e.preventDefault();
      let r = safeCall("SpotifyPlayer.next");
      if (!r.ok) console.warn("[Spotify UI] Next failed:", r.reason);
    });

    byId("spPrev")?.addEventListener("click", async (e) => {
      e.preventDefault();
      let r = safeCall("SpotifyPlayer.prev");
      if (!r.ok) console.warn("[Spotify UI] Prev failed:", r.reason);
    });

    // Listen for status events from spotify-player.js
    window.addEventListener("spotify:status", (ev) => {
      const t = ev?.detail?.text;
      if (t) setStatus(t);
    });
  }

  function bindGlyphConnect() {
    const glyph = document.querySelector(".glyph");
    if (!glyph) return;

    glyph.addEventListener("click", (e) => {
      e.preventDefault();
      const token = getToken();
      if (token) {
        // already linked — keep quiet (no logout here)
        setStatus("Spotify: linked");
        return;
      }
      // login via PKCE
      const r = safeCall("SpotifyAuth.login");
      if (!r.ok) {
        console.warn("[Spotify UI] SpotifyAuth.login missing:", r.reason);
        setStatus("Spotify: auth missing");
      }
    }, { passive: false });
  }

  function observeLinkState() {
    function tick() {
      const t = getToken();
      if (t) {
        setStatus("Spotify: linked");
        setEnabled(true);
      } else {
        setStatus("Spotify: not linked (tap glyph)");
        setEnabled(false);
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function boot() {
    insertBar();
    bindHandlers();
    bindGlyphConnect();
    observeLinkState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();