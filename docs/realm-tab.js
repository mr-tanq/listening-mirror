(() => {
  "use strict";

  let realmViewInstance = null;
  let booted = false;
  let unsubscribeSpotify = null;
  let lastPlayerState = null;
  let lastAuraState = null;
  let lastRealmTrackId = "";
  let lastRealmFallbackKey = "";

  function buildFallbackKey(playerState) {
    const trackName = playerState?.track_name || "";
    const artistName = playerState?.artist_name || "";
    return `${trackName}::${artistName}`;
  }

  function shouldApplyNewRealm(playerState) {
    const trackId = playerState?.track_id || "";
    const fallbackKey = buildFallbackKey(playerState);

    if (trackId) {
      if (trackId !== lastRealmTrackId) {
        lastRealmTrackId = trackId;
        lastRealmFallbackKey = fallbackKey;
        return true;
      }
      return false;
    }

    if (fallbackKey && fallbackKey !== lastRealmFallbackKey) {
      lastRealmTrackId = "";
      lastRealmFallbackKey = fallbackKey;
      return true;
    }

    return false;
  }

  function applyRealmFromSources(playerState, auraState, { force = false } = {}) {
    if (!realmViewInstance) return;
    if (!window.RealmEngine || typeof window.RealmEngine.fromTrackAndAura !== "function") return;

    const hasTrack = !!(playerState?.track_id || playerState?.track_name);
    if (!hasTrack) return;

    const state = window.RealmEngine.fromTrackAndAura(playerState, auraState || {});
    realmViewInstance.applyState(state);

    if (!force) {
      shouldApplyNewRealm(playerState);
    } else {
      const trackId = playerState?.track_id || "";
      lastRealmTrackId = trackId;
      lastRealmFallbackKey = buildFallbackKey(playerState);
    }
  }

  function onAuraEvent(e) {
    lastAuraState = e?.detail || null;
    if (lastPlayerState) {
      applyRealmFromSources(lastPlayerState, lastAuraState);
    }
  }

  function bindSpotify() {
    if (!window.SpotifyPlayer || typeof window.SpotifyPlayer.subscribe !== "function") {
      console.warn("[Realm] SpotifyPlayer is not available.");
      return;
    }

    unsubscribeSpotify = window.SpotifyPlayer.subscribe((playerState) => {
      lastPlayerState = playerState;
      applyRealmFromSources(playerState, lastAuraState);
    });

    if (typeof window.SpotifyPlayer.getState === "function") {
      lastPlayerState = window.SpotifyPlayer.getState();
    }
  }
  function initRealmTab() {
    if (booted) return;
    booted = true;

    const mountEl = document.getElementById("realmMount");
    if (!mountEl) return;

    if (!window.RealmView || typeof window.RealmView.create !== "function") {
      console.warn("[Realm] RealmView is not available.");
      return;
    }

    realmViewInstance = window.RealmView.create(mountEl);

    if (window.RealmEngine && typeof window.RealmEngine.getCurrentState === "function") {
      const initialState = window.RealmEngine.getCurrentState();
      if (initialState) {
        realmViewInstance.applyState(initialState);
      }
    }

    bindSpotify();
    window.addEventListener("lm:aura", onAuraEvent);

    if (lastPlayerState) {
      applyRealmFromSources(lastPlayerState, lastAuraState, { force: true });
    }
  }

  function destroyRealm() {
    if (unsubscribeSpotify) {
      try { unsubscribeSpotify(); } catch {}
      unsubscribeSpotify = null;
    }

    window.removeEventListener("lm:aura", onAuraEvent);

    if (realmViewInstance && typeof realmViewInstance.unmount === "function") {
      realmViewInstance.unmount();
    }

    realmViewInstance = null;
    booted = false;
    lastPlayerState = null;
    lastAuraState = null;
    lastRealmTrackId = "";
    lastRealmFallbackKey = "";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRealmTab, { once: true });
  } else {
    initRealmTab();
  }

  window.RealmTab = {
    init: initRealmTab,
    destroy: destroyRealm,
    getView() {
      return realmViewInstance;
    },
    pulse() {
      if (realmViewInstance) realmViewInstance.peakPulse();
    }
  };
})();
