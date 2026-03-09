/* spotify-ui.js (FULL FILE REPLACE) — PART 1/3
   Listening Mirror — Real UI bridge v2
   ✅ Live metrics from lm:aura event
   ✅ Live progress / times / controls
   ✅ Real tabs / views
   ✅ Spotify glyph
*/

(function () {
  "use strict";

  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $ = (sel, root = document) => root.querySelector(sel);

  const state = {
    playback: {
      is_ready: false,
      is_linked: false,
      is_playing: false,
      progress_ms: 0,
      duration_ms: 0,
      track_id: "",
      track_name: "",
      artist_name: "",
      album_name: "",
      album_image: "",
      uri: ""
    },
    aura: {
      heat: null,
      flux: null,
      focus: null,
      depth: null
    },
    lyric: {
      line: "",
      meta: ""
    }
  };

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function formatMs(ms) {
    const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setMetric(id, value) {
    const el = document.getElementById(id);
    if (!el) return;

    if (value == null || !Number.isFinite(Number(value))) {
      el.innerHTML = `—<small>%</small>`;
      return;
    }

    el.innerHTML = `${Math.round(Number(value))}<small>%</small>`;
  }

  function ensureCss() {
    if (document.getElementById("spotifyUiBridgeCssV2")) return;

    const style = document.createElement("style");
    style.id = "spotifyUiBridgeCssV2";
    style.textContent = `
      #progressBar{
        touch-action:none;
      }

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
        opacity:1;
        user-select:none;
        -webkit-tap-highlight-color: transparent;
      }

      #lmSpotifyBtn svg{
        width:18px;
        height:18px;
        display:block;
      }

      #lmSpotifyBtn.lmOff{
        opacity:.35;
        filter:grayscale(1);
      }

      #lmSpotifyBtn.lmOn{
        opacity:.95;
        filter:none;
      }

      .lmHeaderRow{
        position:relative !important;
      }

      #lmSpotifyBtn{
        position:absolute !important;
        right:0 !important;
        top:50% !important;
        transform:translateY(-50%) !important;
      }

      .tab[hidden]{
        display:none !important;
      }
    `.trim();

    document.head.appendChild(style);
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

  function getToken() {
    if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
      return window.SpotifyAuth.getAccessToken();
    }
    return null;
  }

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
   function findHeaderRow() {
    return document.getElementById("headerActions")?.parentElement || $(".header");
  }

  function ensureSpotifyGlyph() {
    const row = findHeaderRow();
    const actions = document.getElementById("headerActions");
    if (!row || !actions) return null;

    row.classList.add("lmHeaderRow");

    let btn = document.getElementById("lmSpotifyBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "lmSpotifyBtn";
      btn.type = "button";
      btn.setAttribute("aria-label", "Spotify login/logout");
      btn.innerHTML = svgSpotify();

      btn.addEventListener("click", async (e) => {
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

      actions.appendChild(btn);
    }

    const linked = !!getToken();
    btn.classList.toggle("lmOn", linked);
    btn.classList.toggle("lmOff", !linked);
    return btn;
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
        if (!viewId) return;
        activate(viewId);
      });
    });

    activate("viewMirror");
  }

  function updateProgressUi() {
    const fill = document.getElementById("progressFill");
    const thumb = document.getElementById("progressThumb");
    const bar = document.getElementById("progressBar");

    const progress = Number(state.playback.progress_ms || 0);
    const duration = Number(state.playback.duration_ms || 0);
    const ratio = duration > 0 ? clamp(progress / duration, 0, 1) : 0;
    const pct = ratio * 100;

    if (fill) fill.style.width = `${pct}%`;
    if (thumb) thumb.style.left = `${pct}%`;

    setText("currentTimeLabel", formatMs(progress));
    setText("durationLabel", formatMs(duration));

    if (bar) bar.setAttribute("aria-valuenow", String(Math.round(pct)));
  }

  function updatePlayPauseUi() {
    const btn = document.getElementById("playPauseBtn");
    if (!btn) return;

    const playing = !!state.playback.is_playing;
    btn.setAttribute("aria-label", playing ? "Pause" : "Play");
    btn.innerHTML = playing ? svgPause() : svgPlay();
  }

  function updatePlaybackMeta() {
    const track = state.playback.track_name || "";
    const artist = state.playback.artist_name || "";

    const metaText = track && artist
      ? `Playing from Spotify · ${artist}`
      : (getToken() ? "Playing from Spotify" : "Spotify not linked");

    if (!state.lyric.meta) {
      setText("currentLyricMeta", metaText);
    }
  }

  function updateMetricsUi() {
    setMetric("metricHeatValue", state.aura.heat);
    setMetric("metricFluxValue", state.aura.flux);
    setMetric("metricFocusValue", state.aura.focus);
    setMetric("metricDepthValue", state.aura.depth);
  }

  function updateLyricUi() {
    const line = state.lyric.line || "—";
    const meta = state.lyric.meta || "";

    setText("currentLyricLine", line);
    if (meta) setText("currentLyricMeta", meta);
    else updatePlaybackMeta();
  }

  function renderAll() {
    updateMetricsUi();
    updateProgressUi();
    updatePlayPauseUi();
    updateLyricUi();
    ensureSpotifyGlyph();
  }

  function bindPlaybackControls() {
    const prevBtn = document.getElementById("prevTrackBtn");
    const playPauseBtn = document.getElementById("playPauseBtn");
    const nextBtn = document.getElementById("nextTrackBtn");
    const progressBar = document.getElementById("progressBar");

    prevBtn?.addEventListener("click", async () => {
      safeCall("SpotifyPlayer.prev");
    });

    playPauseBtn?.addEventListener("click", async () => {
      safeCall("SpotifyPlayer.togglePlay");
    });

    nextBtn?.addEventListener("click", async () => {
      safeCall("SpotifyPlayer.next");
    });

    function seekFromClientX(clientX) {
      const duration = Number(state.playback.duration_ms || 0);
      if (!duration) return;

      const rect = progressBar?.getBoundingClientRect();
      if (!rect) return;

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
   function bindSpotifyState() {
    if (window.SpotifyPlayer && typeof window.SpotifyPlayer.subscribe === "function") {
      window.SpotifyPlayer.subscribe((next) => {
        state.playback = {
          ...state.playback,
          ...next
        };
        renderAll();
      });
    }

    window.addEventListener("spotify:state", (e) => {
      if (!e.detail) return;
      state.playback = {
        ...state.playback,
        ...e.detail
      };
      renderAll();
    });

    window.addEventListener("spotify:auth-changed", () => {
      ensureSpotifyGlyph();
      renderAll();
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

      updateMetricsUi();
    });
  }

  function bindLyricsBridge() {
    const lyricEl = document.getElementById("currentLyricLine");
    const metaEl = document.getElementById("currentLyricMeta");

    const syncFromDom = () => {
      if (!lyricEl || !metaEl) return;

      const line = (lyricEl.textContent || "").trim();
      const meta = (metaEl.textContent || "").trim();

      if (line && line !== "—") state.lyric.line = line;
      if (meta) state.lyric.meta = meta;
    };

    setInterval(syncFromDom, 1500);
  }

  function bootEmptyLists() {
    const ids = ["recentList", "topList", "concertsList", "concertMatchesList", "archiveList"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!el.children.length) {
        el.innerHTML = "";
      }
    });
  }

  function boot() {
    ensureCss();
    ensureSpotifyGlyph();
    bindTabs();
    bindPlaybackControls();
    bindSpotifyState();
    bindAuraState();
    bindLyricsBridge();
    bootEmptyLists();
    renderAll();

    setInterval(() => {
      ensureSpotifyGlyph();
      renderAll();
    }, 2500);

    safeCall("SpotifyPlayer.refresh");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
