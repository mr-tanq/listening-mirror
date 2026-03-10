(() => {
  "use strict";

  let realmViewInstance = null;
  let booted = false;

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRealmTab, { once: true });
  } else {
    initRealmTab();
  }

  window.RealmTab = {
    init: initRealmTab,
    getView: getRealmView,
    applyState: applyRealmState,
    pulse: pulseRealm
  };
})();
