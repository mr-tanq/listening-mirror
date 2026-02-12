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
    // path like "SpotifyAuth.login" or "SpotifyPlayer.play"
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

  function ensureCss() {
    if (document.getElementById("spotifyUiCss")) return;

    const css = `
/* --- Spotify UI hardening --- */
#spotifyBar{
  position: relative;
  z-index: 9999;         /* ✅ above any ambient layers */
  pointer-events: auto;  /* ✅ clickable */
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
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(255,255,255,.055);
  outline: 1px solid rgba(255,255,255,.10);
  box-shadow: 0 14px 40px rgba(0,0,0,.25);
  color: rgba(255,255,255,.92);
  font-size: 14px;
  letter-spacing: .15px;
}
#spotifyBar .spBtn:active{
  transform: translateY(1px);
  background: rgba(255,255,255,.075);
}
#spotifyBar .spBtn:disabled{
  opacity: .38;                 /* ✅ obvious */
  filter: grayscale(0.15);
}
    `.trim();

    const style = document.createElement("style");
    style.id = "spotifyUiCss";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function insertBar() {
    ensureCss();

    // Avoid duplicates
    const existing = document.getElementById("spotifyBar");
    if (existing) return existing;

    const tabs = document.querySelector(".tabs");
    const anchor = tabs ? tabs.parentElement : document.querySelector(".app") || document.body;

    const status = el("div", { class: "spStatus", id: "spStatus" }, ["Spotify: not linked"]);

    const btnPrev = el("button", { class: "spBtn", id: "spPrev", type: "button" }, ["Prev"]);
    const btnPlay = el("button", { class: "spBtn", id: "spPlay", type: "button" }, ["Play"]);
    const btnPause = el("button", { class: "spBtn", id: "spPause", type: "button" }, ["Pause"]);
    const btnNext = el("button", { class: "spBtn", id: "spNext", type: "button" }, ["Next"]);
    const btnConnect = el("button", { class: "spBtn", id: "spConnect", type: "button" }, ["Connect"]);

    const row = el("div", { class: "spRow" }, [status, btnPrev, btnPlay, btnPause, btnNext, btnConnect]);

    const bar = el("div", { id: "spotifyBar" }, [row]);

    // Put it right under tabs (like your screenshot)
    if (tabs && tabs.nextSibling) {
      tabs.insertAdjacentElement("afterend", bar);
    } else if (tabs) {
      tabs.parentElement.appendChild(bar);
    } else {
      anchor.insertBefore(bar, anchor.firstChild);
    }

    return bar;
  }

  function setStatus(text) {
    const s = document.getElementById("spStatus");
    if (s) s.textContent = text;
  }

  function setEnabled(enabled) {
    // Connect should always be enabled
    const ids = ["spPrev", "spPlay", "spPause", "spNext"];
    for (const id of ids) {
      const b = document.getElementById(id);
      if (b) b.disabled = !enabled;
    }
    const c = document.getElementById("spConnect");
    if (c) c.disabled = false;
  }

  function bindHandlers() {
    const byId = (id) => document.getElementById(id);

    // ✅ Make it super obvious if taps reach JS at all
    function tapPing(label) {
      // You can comment this out later
      // alert(label);
      // For now keep it silent but log:
      console.log("[Spotify UI tap]", label);
    }

    byId("spConnect")?.addEventListener("click", async (e) => {
      e.preventDefault();
      tapPing("Connect");

      // Try common APIs
      let r = safeCall("SpotifyAuth.login");
      if (!r.ok) r = safeCall("SpotifyPlayer.connect");
      if (!r.ok) {
        console.warn("[Spotify UI] No connect handler found (SpotifyAuth.login / SpotifyPlayer.connect).");
        setStatus("Spotify: UI ok (no connect handler)");
        return;
      }
    });

    byId("spPlay")?.addEventListener("click", (e) => {
      e.preventDefault();
      tapPing("Play");
      let r = safeCall("SpotifyPlayer.play");
      if (!r.ok) r = safeCall("SpotifyPlayer.resume");
      if (!r.ok) console.warn("[Spotify UI] No play handler found.");
    });

    byId("spPause")?.addEventListener("click", (e) => {
      e.preventDefault();
      tapPing("Pause");
      let r = safeCall("SpotifyPlayer.pause");
      if (!r.ok) console.warn("[Spotify UI] No pause handler found.");
    });

    byId("spNext")?.addEventListener("click", (e) => {
      e.preventDefault();
      tapPing("Next");
      let r = safeCall("SpotifyPlayer.next");
      if (!r.ok) console.warn("[Spotify UI] No next handler found.");
    });

    byId("spPrev")?.addEventListener("click", (e) => {
      e.preventDefault();
      tapPing("Prev");
      let r = safeCall("SpotifyPlayer.prev");
      if (!r.ok) r = safeCall("SpotifyPlayer.previous");
      if (!r.ok) console.warn("[Spotify UI] No prev handler found.");
    });

    // Initial UI state
    setEnabled(false);
  }

  function observeLinkState() {
    // If your auth/player exposes a token getter, we’ll reflect it.
    // Works with several patterns:
    // - SpotifyAuth.getAccessToken()
    // - SpotifyAuth.token
    // - SpotifyPlayer.getAccessToken()
    function getToken() {
      if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
        return window.SpotifyAuth.getAccessToken();
      }
      if (window.SpotifyAuth && typeof window.SpotifyAuth.token === "string") return window.SpotifyAuth.token;
      if (window.SpotifyPlayer && typeof window.SpotifyPlayer.getAccessToken === "function") {
        return window.SpotifyPlayer.getAccessToken();
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