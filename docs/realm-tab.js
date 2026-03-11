(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let realmView = null;
  let rafId = 0;
  let mounted = false;
  let lastTs = 0;

  let auraState = {
    heat: 64,
    flux: 41,
    focus: 72,
    depth: 86
  };

  function ensureRealmView() {
    if (realmView) return realmView;

    const mount = $("realmMount");
    if (!mount || !window.RealmView) return null;

    realmView = window.RealmView.create(mount);
    return realmView;
  }

  function getSpotifyState() {
    try {
      if (window.SpotifyPlayer && typeof window.SpotifyPlayer.getState === "function") {
        return window.SpotifyPlayer.getState() || null;
      }
    } catch {}
    return null;
  }

  function getRuntime(playerState, ts) {
    const nowSec = ts / 1000;
    const dtMs = lastTs ? Math.max(0, ts - lastTs) : 16;
    lastTs = ts;

    const durationMs = Number(playerState?.duration_ms || 0);
    let currentMs = Number(playerState?.progress_ms || 0);

    if (playerState?.is_playing && dtMs > 0) {
      currentMs += dtMs;
    }

    return {
      nowSec,
      dtMs,
      currentMs,
      durationMs
    };
  }

  function buildFallbackState() {
    const defaults = window.RealmView?.defaults || null;
    if (!defaults) return null;
    return {
      ...defaults,
      yoda: { ...(defaults.yoda || {}) }
    };
  }

  function tick(ts) {
    const view = ensureRealmView();
    const engine = window.RealmEngine;

    if (!view || !engine || typeof engine.fromTrackAndAura !== "function") {
      rafId = requestAnimationFrame(tick);
      return;
    }

    const playerState = getSpotifyState();
    const hasTrack = !!(playerState && playerState.track_name);

    if (!hasTrack) {
      const fallback = buildFallbackState();
      if (fallback) {
        view.applyState(fallback);
      }
      rafId = requestAnimationFrame(tick);
      return;
    }

    const runtime = getRuntime(playerState, ts);

    const realmState = engine.fromTrackAndAura(
      playerState,
      auraState,
      runtime
    );

    view.applyState(realmState);

    rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    lastTs = 0;
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function onAura(ev) {
    const d = ev?.detail || {};
    auraState = {
      heat: d.heat ?? auraState.heat,
      flux: d.flux ?? auraState.flux,
      focus: d.focus ?? auraState.focus,
      depth: d.depth ?? auraState.depth
    };
  }

  function boot() {
    if (mounted) return;
    mounted = true;

    ensureRealmView();

    window.addEventListener("lm:aura", onAura);
    window.addEventListener("spotify:state", startLoop);
    window.addEventListener("focus", startLoop);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") startLoop();
      else stopLoop();
    });

    startLoop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
