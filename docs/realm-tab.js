(() => {
  "use strict";

  let realmViewInstance = null;
  let booted = false;
  let unsubscribeSpotify = null;
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

  function applyTrackToRealm(playerState, { force = false } = {}) {
    if (!realmViewInstance) return;
    if (!window.RealmEngine || typeof window.RealmEngine.fromTrack !== "function") return;

    const hasTrack = !!(playerState?.track_id || playerState?.track_name);
    if (!hasTrack) return;

    if (!force && !shouldApplyNewRealm(playerState)) {
      const currentRealm = window.RealmEngine.fromTrack(playerState);
      realmViewInstance.applyState(currentRealm);
      return;
    }

    const nextRealmState = window.RealmEngine.fromTrack(playerState);
    realmViewInstance.applyState(nextRealmState);
  }

  function bindSpotify() {
    if (!window.SpotifyPlayer || typeof window.SpotifyPlayer.subscribe !== "function") {
      console.warn("[Realm] SpotifyPlayer is not available.");
      return;
    }

    unsubscribeSpotify = window.SpotifyPlayer.subscribe((playerState) => {
      applyTrackToRealm(playerState);
    });

    if (typeof window.SpotifyPlayer.getState === "function") {
      const initialPlayerState = window.SpotifyPlayer.getState();
      applyTrackToRealm(initialPlayerState, { force: true });
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
  }

  function getRealmView() {
    return realmViewInstance;
  }

  function applyRealmState(state) {
    if (!realmViewInstance || !state) return;
    realmViewInstance.applyState(state);
  }

  function pulseRealm() {
    if (!realmViewInstance) return;
    realmViewInstance.peakPulse();
  }

  function destroyRealm() {
    if (unsubscribeSpotify) {
      try { unsubscribeSpotify(); } catch {}
      unsubscribeSpotify = null;
    }

    if (realmViewInstance && typeof realmViewInstance.unmount === "function") {
      realmViewInstance.unmount();
    }

    realmViewInstance = null;
    booted = false;
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
    getView: getRealmView,
    applyState: applyRealmState,
    pulse: pulseRealm,
    destroy: destroyRealm
  };
})();
