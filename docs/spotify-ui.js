/* spotify-ui.js (FULL FILE REPLACE) — v4
   Listening Mirror — playback UI bridge
   Handles ONLY:
   - progress / times
   - play / pause / prev / next / seek
   - spotify glyph
   - metrics from lm:aura
   DOES NOT control lyrics
*/

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const progressBar = $("progressBar");
  const progressFill = $("progressFill");
  const progressThumb = $("progressThumb");

  const timeCurrent = $("currentTimeLabel");
  const timeTotal = $("durationLabel");

  const playPauseBtn = $("playPauseBtn");
  const prevBtn = $("prevTrackBtn");
  const nextBtn = $("nextTrackBtn");

  const heatEl = $("metricHeatValue");
  const fluxEl = $("metricFluxValue");
  const focusEl = $("metricFocusValue");
  const depthEl = $("metricDepthValue");

  const headerActions = $("headerActions");

  const state = {
    progress_ms: 0,
    duration_ms: 0,
    is_playing: false,
    is_linked: false,
    aura: {
      heat: null,
      flux: null,
      focus: null,
      depth: null
    }
  };

  function safeCall(path, ...args) {
    try {
      const parts = path.split(".");
      let cur = window;
      for (const p of parts) {
        if (!cur || !(p in cur)) return { ok: false };
        cur = cur[p];
      }
      if (typeof cur !== "function") return { ok: false };
      return { ok: true, value: cur(...args) };
    } catch {
      return { ok: false };
    }
  }

  function getToken() {
    if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
      return window.SpotifyAuth.getAccessToken();
    }
    if (window.SpotifyPlayer && typeof window.SpotifyPlayer.getAccessToken === "function") {
      return window.SpotifyPlayer.getAccessToken();
    }
    return null;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function formatMs(ms) {
    const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function setMetric(el, value) {
    if (!el) return;
    const n = Number(value);
    if (!Number.isFinite(n)) {
      el.innerHTML = `—<small>%</small>`;
      return;
    }
    el.innerHTML = `${Math.round(n)}<small>%</small>`;
  }

  function svgSpotify() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm4.59 14.37a.75.75 0 0 1-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.15a.75.75 0 1 1-.34-1.46c4.55-1.05 8.45-.6 11.6 1.31.36.22.47.68.32 1.05zm1.05-2.6a.9.9 0 0 1-1.24.3c-3.23-1.98-8.16-2.55-11.99-1.38a.9.9 0 0 1-.53-1.72c4.37-1.33 9.81-.69 13.54 1.6.42.25.55.79.22 1.2zm.12-2.71c-3.73-2.22-9.9-2.43-13.45-1.35a1.05 1.05 0 0 1-.61-2.01c4.08-1.24 10.87-1 15.22 1.6a1.05 1.05 0 0 1-1.16 1.76z"/>
      </svg>
    `.trim();
  }

  function svgPause() {
    return `
      <svg id="playPauseIcon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 6h3v12H8zM13 6h3v12h-3z"></path>
      </svg>
    `.trim();
  }

  function svgPlay() {
    return `
      <svg id="playPauseIcon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 6.5v11l9-5.5-9-5.5z"></path>
      </svg>
    `.trim();
  }

  function ensureCss() {
    if ($("spotifyUiBridgeCssV4")) return;

    const style = document.createElement("style");
    style.id = "spotifyUiBridgeCssV4";
    style.textContent = `
      #progressBar{ touch-action:none; }
      #lmSpotifyBtn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:18px;
        height:18px;
        border-radius:999px;
        border:0;
        padding:0;
        margin:0;
        background:transparent;
        line-height:1;
        cursor:pointer;
        user-select:none;
        -webkit-tap-highlight-color:transparent;
      }
      #lmSpotifyBtn svg{ width:18px; height:18px; display:block; }
      #lmSpotifyBtn.lmOff{ opacity:.35; filter:grayscale(1); }
      #lmSpotifyBtn.lmOn{ opacity:.95; filter:none; }
    `;
    document.head.appendChild(style);
  }
function ensureSpotifyGlyph() {
    if (!headerActions) return null;

    let btn = $("lmSpotifyBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "lmSpotifyBtn";
      btn.type = "button";
      btn.setAttribute("aria-label", "Spotify login/logout");
      btn.innerHTML = svgSpotify();

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const token = getToken();
        if (!token) {
          let r = safeCall("SpotifyAuth.login");
          if (r.ok) return;
          r = safeCall("SpotifyAuth.authorize");
          if (r.ok) return;
          r = safeCall("SpotifyAuth.connect");
          if (r.ok) return;
          return;
        }

        let r = safeCall("SpotifyAuth.logout");
        if (!r.ok) r = safeCall("SpotifyAuth.disconnect");
        window.dispatchEvent(new CustomEvent("spotify:auth-changed"));
      }, { passive: false });

      headerActions.appendChild(btn);
    }

    const linked = !!getToken();
    state.is_linked = linked;
    btn.classList.toggle("lmOn", linked);
    btn.classList.toggle("lmOff", !linked);
    return btn;
  }

  function renderMetrics() {
    setMetric(heatEl, state.aura.heat);
    setMetric(fluxEl, state.aura.flux);
    setMetric(focusEl, state.aura.focus);
    setMetric(depthEl, state.aura.depth);
  }

  function renderProgress() {
    const progress = Number(state.progress_ms || 0);
    const duration = Number(state.duration_ms || 0);
    const ratio = duration > 0 ? clamp(progress / duration, 0, 1) : 0;
    const pct = ratio * 100;

    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressThumb) progressThumb.style.left = `${pct}%`;

    if (timeCurrent) timeCurrent.textContent = formatMs(progress);
    if (timeTotal) timeTotal.textContent = formatMs(duration);

    if (progressBar) progressBar.setAttribute("aria-valuenow", String(Math.round(pct)));
  }

  function renderPlayPause() {
    if (!playPauseBtn) return;
    playPauseBtn.setAttribute("aria-label", state.is_playing ? "Pause" : "Play");
    playPauseBtn.innerHTML = state.is_playing ? svgPause() : svgPlay();
  }

  function renderAll() {
    ensureSpotifyGlyph();
    renderMetrics();
    renderProgress();
    renderPlayPause();
  }

  function applyPlaybackState(st) {
    if (!st) return;
    state.progress_ms = Number(st.progress_ms || 0);
    state.duration_ms = Number(st.duration_ms || 0);
    state.is_playing = !!st.is_playing;
    renderProgress();
    renderPlayPause();
  }

  function bindSpotifyState() {
    if (window.SpotifyPlayer && typeof window.SpotifyPlayer.subscribe === "function") {
      window.SpotifyPlayer.subscribe((st) => {
        applyPlaybackState(st);
      });
    }

    window.addEventListener("spotify:state", (e) => {
      if (!e.detail) return;
      applyPlaybackState(e.detail);
    });

    window.addEventListener("spotify:auth-changed", () => {
      ensureSpotifyGlyph();
    });
  }

  function bindAuraState() {
    window.addEventListener("lm:aura", (e) => {
      if (!e.detail) return;
      state.aura = {
        heat: Number.isFinite(Number(e.detail.heat)) ? Number(e.detail.heat) : state.aura.heat,
        flux: Number.isFinite(Number(e.detail.flux)) ? Number(e.detail.flux) : state.aura.flux,
        focus: Number.isFinite(Number(e.detail.focus)) ? Number(e.detail.focus) : state.aura.focus,
        depth: Number.isFinite(Number(e.detail.depth)) ? Number(e.detail.depth) : state.aura.depth
      };
      renderMetrics();
    });
  }

  function bindPlaybackControls() {
    prevBtn?.addEventListener("click", () => {
      safeCall("SpotifyPlayer.prev");
    });

    playPauseBtn?.addEventListener("click", () => {
      safeCall("SpotifyPlayer.togglePlay");
    });

    nextBtn?.addEventListener("click", () => {
      safeCall("SpotifyPlayer.next");
    });

    function seekFromClientX(clientX) {
      const duration = Number(state.duration_ms || 0);
      if (!duration || !progressBar) return;

      const rect = progressBar.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      const ms = Math.round(duration * ratio);
      safeCall("SpotifyPlayer.seek", ms);
    }

    progressBar?.addEventListener("click", (e) => {
      seekFromClientX(e.clientX);
    });

    let dragging = false;

    progressBar?.addEventListener("pointerdown", (e) => {
      dragging = true;
      progressBar.setPointerCapture?.(e.pointerId);
      seekFromClientX(e.clientX);
    });

    progressBar?.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      seekFromClientX(e.clientX);
    });

    const stopDrag = (e) => {
      dragging = false;
      progressBar?.releasePointerCapture?.(e.pointerId);
    };

    progressBar?.addEventListener("pointerup", stopDrag);
    progressBar?.addEventListener("pointercancel", stopDrag);
  }

  function bindTabs() {
    const tabs = $$(".tab[data-view]");
    const views = $$(".view");

    function activate(viewId) {
      views.forEach((view) => {
        view.hidden = view.id !== viewId;
      });

      tabs.forEach((tab) => {
        const active = tab.dataset.view === viewId;
        tab.classList.toggle("tab--active", active);
        if (active) tab.setAttribute("aria-current", "page");
        else tab.removeAttribute("aria-current");
      });
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const viewId = tab.dataset.view;
        if (viewId) activate(viewId);
      });
    });

    activate("viewMirror");
  }

  function boot() {
    ensureCss();
    ensureSpotifyGlyph();
    bindTabs();
    bindSpotifyState();
    bindAuraState();
    bindPlaybackControls();
    renderAll();
    safeCall("SpotifyPlayer.refresh");
    setInterval(() => ensureSpotifyGlyph(), 2500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();