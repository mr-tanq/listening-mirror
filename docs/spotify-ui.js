/* spotify-ui.js (FULL REPLACE)
   - No status text ("Spotify: linked" removed)
   - Spotify logo indicator: gray when not linked, normal when linked
   - Transport buttons smaller + placed INSIDE the Now frame (top-right, LOWER)
   - Tap glyph to login (no hint text)
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
/* --- Spotify UI (inside NOW card) --- */
#spNowDock{
  position: absolute;
  /* ✅ MOVED DOWN (was 12px) */
  top: 58px;
  right: 14px;
  z-index: 50;
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

/* Spotify logo indicator */
#spIndicator{
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  opacity: .35;
  filter: grayscale(1);
  transform: translateY(0.5px);
}
#spIndicator.linked{
  opacity: .95;
  filter: none;
  drop-shadow: 0 6px 18px rgba(0,0,0,.35);
}
#spIndicator svg{
  width: 18px;
  height: 18px;
  display: block;
}

/* Smaller transport buttons */
#spNowDock .spBtn{
  border: 0;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(255,255,255,.05);
  outline: 1px solid rgba(255,255,255,.09);
  box-shadow: 0 14px 40px rgba(0,0,0,.22);
  color: rgba(255,255,255,.92);
  padding: 0;
}
#spNowDock .spBtn:active{
  transform: translateY(1px);
  background: rgba(255,255,255,.07);
}
#spNowDock .spBtn:disabled{
  opacity: .32;
}

/* Icons size */
#spNowDock svg.icon{
  width: 16px;
  height: 16px;
  display: block;
}

/* Make sure the NOW frame can host absolute children */
.spNowHost{
  position: relative !important;
}
    `.trim();

    const style = document.createElement("style");
    style.id = "spotifyUiCss";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function iconSvg(name) {
    if (name === "prev") return `
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M6 6h2v12H6V6zm3.5 6L18 6v12l-8.5-6z"/>
      </svg>`;
    if (name === "play") return `
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M8 5v14l11-7L8 5z"/>
      </svg>`;
    if (name === "pause") return `
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/>
      </svg>`;
    if (name === "next") return `
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M16 6h2v12h-2V6zM6 18V6l8.5 6L6 18z"/>
      </svg>`;
    return "";
  }
function spotifyLogoSvg(){
    // Minimal Spotify logo (single color, inherits currentColor)
    return `
      <svg viewBox="0 0 168 168" aria-hidden="true">
        <path fill="currentColor" d="M84 0C37.6 0 0 37.6 0 84s37.6 84 84 84 84-37.6 84-84S130.4 0 84 0zm38.6 121.3c-1.5 2.4-4.6 3.2-7 1.7-19.2-11.7-43.4-14.3-72-7.8-2.8.6-5.6-1.1-6.2-3.9-.6-2.8 1.1-5.6 3.9-6.2 31.5-7.2 58.5-4.2 80.3 9.1 2.4 1.5 3.2 4.6 1.7 7.1zm9.9-22c-1.9 3-5.8 4-8.8 2.1-22-13.5-55.6-17.4-81.8-9.5-3.4 1-7-0.9-8-4.3-1-3.4.9-7 4.3-8 30-9.1 67.3-4.7 92.8 11.1 3 1.9 4 5.9 2.1 8.6zm.8-23c-26.3-15.6-69.7-17.1-94.8-9.5-4 .1-7.4-2.6-8.5-6.4-1.1-3.8 1.2-7.8 5-8.9 29.1-8.8 77.5-7.1 108.1 11.1 3.5 2.1 4.7 6.7 2.6 10.2-2.1 3.5-6.7 4.7-10.2 2.6z"/>
      </svg>
    `;
  }

  // Try to find the NOW panel/card to dock controls into
  function findNowHost() {
    // 1) obvious ids/classes
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

    // 2) heuristic: card that contains LIVE pill
    const allCards = Array.from(document.querySelectorAll(".card, .panel, section, .tile"));
    for (const c of allCards) {
      const txt = (c.innerText || "").toLowerCase();
      if (txt.includes("live") && txt.includes("now")) return c;
      if (txt.includes("live") && txt.includes("listening")) return c;
    }

    // 3) last resort: the first big card under tabs
    const tabs = document.querySelector(".tabs");
    if (tabs) {
      const after = tabs.nextElementSibling;
      if (after) return after;
    }

    return null;
  }

  function ensureDock() {
    ensureCss();

    let dock = document.getElementById("spNowDock");
    if (dock) return dock;

    const host = findNowHost();
    if (!host) return null;

    host.classList.add("spNowHost");

    const indicator = el("div", { id: "spIndicator", title: "Spotify" });
    indicator.innerHTML = spotifyLogoSvg();

    // Buttons (icons only)
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

  function bindHandlers() {
    const byId = (id) => document.getElementById(id);

    byId("spPlay")?.addEventListener("click", (e) => {
      e.preventDefault();
      const r = safeCall("SpotifyPlayer.play");
      if (!r.ok) console.warn("[Spotify UI] Play failed:", r.reason);
    });

    byId("spPause")?.addEventListener("click", (e) => {
      e.preventDefault();
      const r = safeCall("SpotifyPlayer.pause");
      if (!r.ok) console.warn("[Spotify UI] Pause failed:", r.reason);
    });

    byId("spNext")?.addEventListener("click", (e) => {
      e.preventDefault();
      const r = safeCall("SpotifyPlayer.next");
      if (!r.ok) console.warn("[Spotify UI] Next failed:", r.reason);
    });

    byId("spPrev")?.addEventListener("click", (e) => {
      e.preventDefault();
      const r = safeCall("SpotifyPlayer.prev");
      if (!r.ok) console.warn("[Spotify UI] Prev failed:", r.reason);
    });
  }

  function bindGlyphConnect() {
    const glyph = document.querySelector(".glyph");
    if (!glyph) return;

    glyph.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        const token = getToken();
        if (token) return; // already linked
        const r = safeCall("SpotifyAuth.login");
        if (!r.ok) console.warn("[Spotify UI] SpotifyAuth.login missing:", r.reason);
      },
      { passive: false }
    );
  }

  function observeLinkState() {
    function tick() {
      const linked = !!getToken();
      setIndicatorLinked(linked);
      setEnabled(linked);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
function boot() {
    const dock = ensureDock();
    if (!dock) {
      // If NOW host isn't ready yet, retry a few times
      let tries = 0;
      const t = setInterval(() => {
        tries += 1;
        const d2 = ensureDock();
        if (d2) {
          clearInterval(t);
          bindHandlers();
          bindGlyphConnect();
          observeLinkState();
        }
        if (tries > 20) clearInterval(t);
      }, 250);
      return;
    }

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