/* spotify-ui.js
   UI layer for Spotify controls.
   - Guarantees clickability (no overlays stealing taps)
   - Shows disabled state clearly
   - Calls existing globals if present: window.SpotifyAuth / window.SpotifyPlayer
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

  function icon(kind){
    const s = (svg) => {
      const wrap = document.createElement("span");
      wrap.className = "spIc";
      wrap.innerHTML = svg;
      return wrap;
    };
    const common = `width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
    if (kind === "prev")  return s(`<svg ${common}><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>`);
    if (kind === "play")  return s(`<svg ${common}><polygon points="8 5 19 12 8 19 8 5"></polygon></svg>`);
    if (kind === "pause") return s(`<svg ${common}><line x1="8" y1="5" x2="8" y2="19"></line><line x1="16" y1="5" x2="16" y2="19"></line></svg>`);
    if (kind === "next")  return s(`<svg ${common}><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>`);
    if (kind === "link")  return s(`<svg ${common}><path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0 0-7.07 5 5 0 0 0-7.07 0L10 5"></path><path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 0 7.07 5 5 0 0 0 7.07 0L14 19"></path></svg>`);
    return document.createTextNode("");
  }

  function ensureCss() {
    if (document.getElementById("spotifyUiCss")) return;

    const css = `
#spotifyBar{
  position: relative;
  z-index: 9999;
  pointer-events: auto;
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
  margin: 10px 0 0 0;
}
#spotifyBar .spStatus{
  color: rgba(255,255,255,.70);
  font-size: 13px;
  letter-spacing: .2px;
  margin-right: 6px;
}
#spotifyBar .spBtn{
  border:0;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(255,255,255,.055);
  outline: 1px solid rgba(255,255,255,.10);
  box-shadow: 0 14px 40px rgba(0,0,0,.25);
  color: rgba(255,255,255,.92);
  font-size: 13px;
  letter-spacing: .15px;
  display:inline-flex;
  align-items:center;
  gap:8px;
}
#spotifyBar .spIc{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  opacity:.95;
}
#spotifyBar .spBtn:active{
  transform: translateY(1px);
  background: rgba(255,255,255,.075);
}
#spotifyBar .spBtn:disabled{
  opacity: .38;
}
    `.trim();

    const style = document.createElement("style");
    style.id = "spotifyUiCss";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function insertBar() {
    ensureCss();

    const existing = document.getElementById("spotifyBar");
    if (existing) return existing;

    const tabs = document.querySelector(".tabs");
    const anchor = tabs ? tabs.parentElement : document.querySelector(".app") || document.body;

    const status = el("div", { class: "spStatus", id: "spStatus" }, ["Spotify: not linked"]);

    const btnPrev = el("button", { class: "spBtn", id: "spPrev", type: "button" }, [icon("prev"), "Prev"]);
    const btnPlay = el("button", { class: "spBtn", id: "spPlay", type: "button" }, [icon("play"), "Play"]);
    const btnPause = el("button", { class: "spBtn", id: "spPause", type: "button" }, [icon("pause"), "Pause"]);
    const btnNext = el("button", { class: "spBtn", id: "spNext", type: "button" }, [icon("next"), "Next"]);
    const btnConnect = el("button", { class: "spBtn", id: "spConnect", type: "button" }, [icon("link"), "Connect"]);

    const row = el("div", { class: "spRow" }, [status, btnPrev, btnPlay, btnPause, btnNext, btnConnect]);
    const bar = el("div", { id: "spotifyBar" }, [row]);

    if (tabs && tabs.nextSibling) tabs.insertAdjacentElement("afterend", bar);
    else if (tabs) tabs.parentElement.appendChild(bar);
    else anchor.insertBefore(bar, anchor.firstChild);

    return bar;
  }

  function setStatus(text) {
    const s = document.getElementById("spStatus");
    if (s) s.textContent = text;
  }

  function setEnabled(enabled) {
    for (const id of ["spPrev", "spPlay", "spPause", "spNext"]) {
      const b = document.getElementById(id);
      if (b) b.disabled = !enabled;
    }
    const c = document.getElementById("spConnect");
    if (c) c.disabled = false;
  }

  function bindHandlers() {
    const byId = (id) => document.getElementById(id);

    byId("spConnect")?.addEventListener("click", async (e) => {
      e.preventDefault();
      let r = safeCall("SpotifyAuth.login");
      if (!r.ok) r = safeCall("SpotifyPlayer.connect");
      if (!r.ok) {
        console.warn("[Spotify UI] No connect handler found.");
        setStatus("Spotify: UI ok (no connect handler)");
      }
    });

    byId("spPlay")?.addEventListener("click", async (e) => {
      e.preventDefault();
      let r = safeCall("SpotifyPlayer.play");
      if (!r.ok) r = safeCall("SpotifyPlayer.resume");
      if (!r.ok) console.warn("[Spotify UI] No play handler found.");
    });

    byId("spPause")?.addEventListener("click", async (e) => {
      e.preventDefault();
      let r = safeCall("SpotifyPlayer.pause");
      if (!r.ok) console.warn("[Spotify UI] No pause handler found.");
    });

    byId("spNext")?.addEventListener("click", async (e) => {
      e.preventDefault();
      let r = safeCall("SpotifyPlayer.next");
      if (!r.ok) console.warn("[Spotify UI] No next handler found.");
    });

    byId("spPrev")?.addEventListener("click", async (e) => {
      e.preventDefault();
      let r = safeCall("SpotifyPlayer.prev");
      if (!r.ok) r = safeCall("SpotifyPlayer.previous");
      if (!r.ok) console.warn("[Spotify UI] No prev handler found.");
    });

    setEnabled(false);
  }

  function observeLinkState() {
    function getToken() {
      if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
        return window.SpotifyAuth.getAccessToken();
      }
      return null;
    }

    function tick() {
      const t = getToken();
      if (t) {
        setStatus("Spotify: linked");
        setEnabled(true);
      } else {
        setStatus("Spotify: not linked");
        setEnabled(false);
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function boot() {
    insertBar();
    bindHandlers();
    observeLinkState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();