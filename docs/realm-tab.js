(() => {
  "use strict";

  let view = null;
  let raf = null;

  const WALK_SPRITES = [
    "./assets/yoda_walk_1.png",
    "./assets/yoda_walk_2.png"
  ];

  let walkFrame = 0;
  let lastSwap = 0;

  function ensureView() {
    if (view) return;

    const mount = document.getElementById("realmMount");
    if (!mount) return;

    view = window.RealmView.create(mount);
  }

  function loop(ts) {
    ensureView();
    if (!view) {
      raf = requestAnimationFrame(loop);
      return;
    }

    const engine = window.realmEngine;
    if (!engine) {
      raf = requestAnimationFrame(loop);
      return;
    }

    const s = engine.getState();

    // WALK SPRITE SWITCH
    if (ts - lastSwap > 320) {
      walkFrame = (walkFrame + 1) % 2;
      lastSwap = ts;
    }

    const progress = s.progress || 0;

    // YODA POSITION BASED ON TRACK PROGRESS
    let yodaX = 0.1 + progress * 0.8;

    // MID TRACK RANDOM ACTION
    let sprite = WALK_SPRITES[walkFrame];
    let bob = Math.sin(ts * 0.004) * 3;

    if (progress > 0.45 && progress < 0.6) {
      sprite = "./assets/yoda_sniff.png";
      bob = 0;
    }

    if (progress > 0.7 && progress < 0.85) {
      sprite = "./assets/yoda_sit.png";
      bob = 0;
    }

    if (progress > 0.92) {
      sprite = "./assets/yoda_lay.png";
      bob = 0;
    }

    view.applyState({
      ...s,
      yoda: {
        x: yodaX,
        direction: 1,
        state: "auto",
        sprite,
        bob
      }
    });

    raf = requestAnimationFrame(loop);
  }

  function start() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  document.addEventListener("visibilitychange", start);
  window.addEventListener("focus", start);

  start();

})();
