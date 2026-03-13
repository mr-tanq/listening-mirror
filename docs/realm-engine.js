(() => {
  "use strict";

  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

  const ASSET_BASE = "/listening-mirror/assets/";

  const WALK_SEQUENCE = [
    "dog_walk_1.png",
    "dog_walk_2.png",
    "dog_walk_3.png",
    "dog_walk_4.png",
    "dog_walk_5.png",
    "dog_walk_6.png",
    "dog_walk_7.png",
    "dog_walk_8.png",
    "dog_walk_9.png",
    "dog_walk_10.png",
    "dog_walk_11.png",
    "dog_walk_12.png"
  ];

  const dog = {
    x: 0.18,
    dir: 1,
    vel: 0,
    targetVel: 0,
    frame: 0,
    timer: 0,
    frameMs: 85,
    initialized: false,
    lastTrackKey: ""
  };

  function resetDog() {
    dog.x = 0.18;
    dog.dir = Math.random() > 0.5 ? 1 : -1;
    dog.vel = 0;
    dog.targetVel = 0;
    dog.frame = 0;
    dog.timer = 0;
    dog.initialized = true;
  }

  function updateFrames(dt) {
    dog.timer += dt;

    while (dog.timer >= dog.frameMs) {
      dog.timer -= dog.frameMs;
      dog.frame = (dog.frame + 1) % WALK_SEQUENCE.length;
    }
  }

  function updateMove(dt) {
    const baseSpeed = 0.000025;

    dog.targetVel = baseSpeed * dog.dir;
    dog.vel += (dog.targetVel - dog.vel) * 0.09;
    dog.x += dog.vel * dt;

    if (dog.x < 0.08) {
      dog.x = 0.08;
      dog.dir = 1;
    }

    if (dog.x > 0.92) {
      dog.x = 0.92;
      dog.dir = -1;
    }
  }

  function updateDog(dt) {
    if (!dog.initialized) resetDog();
    updateFrames(dt);
    updateMove(dt);
  }

  function getSnapshot() {
    return {
      x: dog.x,
      direction: dog.dir,
      state: "walk",
      sprite: ASSET_BASE + WALK_SEQUENCE[dog.frame]
    };
  }

  function fromTrackAndAura(playerState, auraState = {}, runtime = {}) {
    const trackId = playerState?.track_id || "";
    const trackName = playerState?.track_name || "";
    const artist = playerState?.artist_name || "";

    const dt = Math.max(0, Number(runtime.dtMs || 16));

    const key = trackId || trackName + artist;

    if (key !== dog.lastTrackKey) {
      dog.lastTrackKey = key;
      resetDog();
    }

    updateDog(dt);

    return {
      track: trackName,
      artist,
      yoda: getSnapshot()
    };
  }

  function resetYoda() {
    dog.initialized = false;
    dog.lastTrackKey = "";
  }

  window.RealmEngine = {
    fromTrackAndAura,
    resetYoda,
    getYodaSnapshot: getSnapshot
  };
})();