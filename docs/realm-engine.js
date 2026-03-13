(() => {
  "use strict";

  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  const rand = (a, b) => a + Math.random() * (b - a);

  const ASSET_BASE = "/listening-mirror/assets/";

  const BIOMES = [
    {
      biome: "Moonlit Ruins",
      mood: "Melancholic",
      motion: "Drift",
      sky: "linear-gradient(180deg, #09111E 0%, #101827 48%, #13151A 100%)",
      skyGlow: "radial-gradient(circle, rgba(122,215,255,.28), rgba(122,215,255,.06) 45%, transparent 70%)",
      moon: "radial-gradient(circle at 35% 35%, rgba(255,255,255,.95), rgba(214,227,255,.72) 55%, rgba(159,187,228,.18) 75%, transparent 100%)",
      particle: "rgba(210,233,255,.82)"
    },
    {
      biome: "Ashen Keep",
      mood: "Ominous",
      motion: "March",
      sky: "linear-gradient(180deg, #150B0B 0%, #241111 46%, #181212 100%)",
      skyGlow: "radial-gradient(circle, rgba(255,138,74,.24), rgba(255,138,74,.05) 48%, transparent 74%)",
      moon: "radial-gradient(circle at 35% 35%, rgba(255,213,184,.88), rgba(255,132,78,.52) 56%, rgba(255,91,76,.10) 78%, transparent 100%)",
      particle: "rgba(255,176,120,.82)"
    },
    {
      biome: "Frozen Peaks",
      mood: "Majestic",
      motion: "Bloom",
      sky: "linear-gradient(180deg, #0C1726 0%, #102233 50%, #15181D 100%)",
      skyGlow: "radial-gradient(circle, rgba(156,244,255,.22), rgba(156,244,255,.05) 48%, transparent 74%)",
      moon: "radial-gradient(circle at 35% 35%, rgba(255,255,255,.98), rgba(225,239,255,.80) 54%, rgba(174,255,243,.15) 76%, transparent 100%)",
      particle: "rgba(228,247,255,.88)"
    },
    {
      biome: "Storm Coast",
      mood: "Tense",
      motion: "Surge",
      sky: "linear-gradient(180deg, #08121B 0%, #0E1D2A 48%, #14161B 100%)",
      skyGlow: "radial-gradient(circle, rgba(92,168,255,.22), rgba(92,168,255,.04) 45%, transparent 70%)",
      moon: "radial-gradient(circle at 35% 35%, rgba(232,245,255,.85), rgba(136,176,225,.45) 58%, rgba(120,160,215,.10) 75%, transparent 100%)",
      particle: "rgba(180,223,255,.78)"
    }
  ];

  function hashString(input) {
    const str = String(input || "");
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  const YODA_ASSETS = {
    walk1: ASSET_BASE + "yoda_walk_1.png",
    walk2: ASSET_BASE + "yoda_walk_2.png",
    walk3: ASSET_BASE + "yoda_walk_3.png",
    walk4: ASSET_BASE + "yoda_walk_4.png",
    walk5: ASSET_BASE + "yoda_walk_5.png",
    walk6: ASSET_BASE + "yoda_walk_6.png",
    sniff: ASSET_BASE + "yoda_sniff.png",
    stay: ASSET_BASE + "yoda_stay.png",
    lay: ASSET_BASE + "yoda_lay.png"
  };

  const WALK_SEQUENCE = [
    "walk1",
    "walk2",
    "walk3",
    "walk4",
    "walk5",
    "walk6"
  ];

  const yodaController = {
    assets: { ...YODA_ASSETS },
    state: "walk",
    direction: 1,
    x: 0.18,
    velocity: 0,
    targetVelocity: 0,
    minX: 0.10,
    maxX: 0.90,
    frameIndex: 0,
    frameTimer: 0,
    frameMs: 120,
    stateUntil: 0,
    bob: 0,
    initialized: false,
    lastTrackId: "",
    lastTrackKey: ""
  };

  function chooseAmbientState(nowSec) {
    const roll = Math.random();

    if (roll < 0.58) {
      yodaController.state = "walk";
      yodaController.stateUntil = nowSec + rand(3.8, 6.5);
      return;
    }

    if (roll < 0.76) {
      yodaController.state = "sniff";
      yodaController.stateUntil = nowSec + rand(1.6, 2.6);
      return;
    }

    if (roll < 0.91) {
      yodaController.state = "stay";
      yodaController.stateUntil = nowSec + rand(2.8, 4.5);
      return;
    }

    yodaController.state = "lay";
    yodaController.stateUntil = nowSec + rand(4.0, 6.2);
  }

  function resetForNewTrack(nowSec) {
    yodaController.state = "walk";
    yodaController.direction = Math.random() > 0.5 ? 1 : -1;
    yodaController.x = 0.18;
    yodaController.velocity = 0;
    yodaController.targetVelocity = 0;
    yodaController.frameIndex = 0;
    yodaController.frameTimer = 0;
    yodaController.frameMs = 120;
    yodaController.stateUntil = nowSec + rand(3.2, 5.4);
    yodaController.bob = 0;
    yodaController.initialized = true;
  }

  function updateWalkAnimation(dtMs) {
    yodaController.frameMs = 120;
    yodaController.frameTimer += dtMs;

    while (yodaController.frameTimer >= yodaController.frameMs) {
      yodaController.frameTimer -= yodaController.frameMs;
      yodaController.frameIndex =
        (yodaController.frameIndex + 1) % WALK_SEQUENCE.length;
    }
  }

  function updateMovement(dtMs) {
    const walking = yodaController.state === "walk";
    const baseSpeed = 0.000026;

    yodaController.targetVelocity = walking
      ? (baseSpeed * yodaController.direction)
      : 0;

    yodaController.velocity +=
      (yodaController.targetVelocity - yodaController.velocity) * 0.08;

    yodaController.x += yodaController.velocity * dtMs;

    if (yodaController.x <= yodaController.minX) {
      yodaController.x = yodaController.minX;
      yodaController.direction = 1;
    }

    if (yodaController.x >= yodaController.maxX) {
      yodaController.x = yodaController.maxX;
      yodaController.direction = -1;
    }

    yodaController.bob = 0;
  }

  function updateYoda(progress, dtMs, nowSec) {
    if (!yodaController.initialized) {
      resetForNewTrack(nowSec);
    }

    if (progress < 0.50) {
      if (nowSec >= yodaController.stateUntil) {
        chooseAmbientState(nowSec);
      }
    } else if (progress < 0.92) {
      yodaController.state = "walk";
      yodaController.stateUntil = nowSec + 999;
    } else {
      yodaController.state = progress < 0.97 ? "stay" : "lay";
      yodaController.stateUntil = nowSec + 999;
    }

    if (yodaController.state === "walk") {
      updateWalkAnimation(dtMs);
    } else {
      yodaController.frameIndex = 0;
      yodaController.frameTimer = 0;
    }

    updateMovement(dtMs);
  }

  function getYodaSprite() {
    switch (yodaController.state) {
      case "sniff":
        return yodaController.assets.sniff;
      case "stay":
        return yodaController.assets.stay;
      case "lay":
        return yodaController.assets.lay;
      case "walk":
      default: {
        const key = WALK_SEQUENCE[yodaController.frameIndex] || "walk1";
        return yodaController.assets[key];
      }
    }
  }

  function getYodaSnapshot() {
    return {
      x: yodaController.x,
      direction: yodaController.direction,
      state: yodaController.state,
      sprite: getYodaSprite(),
      bob: yodaController.bob
    };
  }

  function fromTrackAndAura(playerState, auraState = {}, runtime = {}) {
    const trackId = playerState?.track_id || "";
    const trackName = playerState?.track_name || "Unknown Track";
    const artistName = playerState?.artist_name || "Unknown Artist";
    const albumName = playerState?.album_name || "";
    const albumImage = playerState?.album_image || "";
    const isPlaying = !!playerState?.is_playing;

    const heat = clamp01(
      auraState.heat != null
        ? (auraState.heat > 1 ? auraState.heat / 100 : auraState.heat)
        : 0.55
    );

    const focus = clamp01(
      auraState.focus != null
        ? (auraState.focus > 1 ? auraState.focus / 100 : auraState.focus)
        : 0.55
    );

    const depth = clamp01(
      auraState.depth != null
        ? (auraState.depth > 1 ? auraState.depth / 100 : auraState.depth)
        : 0.55
    );

    const flux = clamp01(
      auraState.flux != null
        ? (auraState.flux > 1 ? auraState.flux / 100 : auraState.flux)
        : 0.50
    );

    const seed = hashString(trackId || `${trackName}::${artistName}`);
    const biome = BIOMES[seed % BIOMES.length];

    const currentMs = Number(runtime.currentMs || 0);
    const durationMs = Math.max(
      1,
      Number(runtime.durationMs || playerState?.duration_ms || 1)
    );
    const progress = clamp01(currentMs / durationMs);
    const nowSec = Number(runtime.nowSec || 0);
    const dtMs = Math.max(0, Number(runtime.dtMs || 16));

    const trackKey = trackId || `${trackName}::${artistName}::${albumName}`;
    if (trackKey && trackKey !== yodaController.lastTrackKey) {
      yodaController.lastTrackKey = trackKey;
      yodaController.lastTrackId = trackId;
      resetForNewTrack(nowSec);
    }

    updateYoda(progress, dtMs, nowSec);

    return {
      biome: biome.biome,
      mood: biome.mood,
      motion: biome.motion,
      track: trackName,
      artist: artistName,
      album: albumName,
      albumImage,
      stateLabel: isPlaying ? "Now Playing" : "Paused",
      heat: Number(heat.toFixed(2)),
      focus: Number(focus.toFixed(2)),
      depth: Number(depth.toFixed(2)),
      flux: Number(flux.toFixed(2)),
      sky: biome.sky,
      skyGlow: biome.skyGlow,
      moon: biome.moon,
      particle: biome.particle,
      yoda: getYodaSnapshot(),
      progress
    };
  }

  function resetYoda() {
    yodaController.state = "walk";
    yodaController.direction = 1;
    yodaController.x = 0.18;
    yodaController.velocity = 0;
    yodaController.targetVelocity = 0;
    yodaController.frameIndex = 0;
    yodaController.frameTimer = 0;
    yodaController.frameMs = 120;
    yodaController.stateUntil = 0;
    yodaController.bob = 0;
    (() => {
  "use strict";

  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

  const ASSET_BASE = "/listening-mirror/assets/";

  const BIOMES = [
    {
      biome: "Moonlit Ruins",
      mood: "Melancholic",
      motion: "Drift",
      sky: "linear-gradient(180deg, #09111E 0%, #101827 48%, #13151A 100%)",
      skyGlow: "radial-gradient(circle, rgba(122,215,255,.28), rgba(122,215,255,.06) 45%, transparent 70%)",
      moon: "radial-gradient(circle at 35% 35%, rgba(255,255,255,.95), rgba(214,227,255,.72) 55%, rgba(159,187,228,.18) 75%, transparent 100%)",
      particle: "rgba(210,233,255,.82)"
    },
    {
      biome: "Ashen Keep",
      mood: "Ominous",
      motion: "March",
      sky: "linear-gradient(180deg, #150B0B 0%, #241111 46%, #181212 100%)",
      skyGlow: "radial-gradient(circle, rgba(255,138,74,.24), rgba(255,138,74,.05) 48%, transparent 74%)",
      moon: "radial-gradient(circle at 35% 35%, rgba(255,213,184,.88), rgba(255,132,78,.52) 56%, rgba(255,91,76,.10) 78%, transparent 100%)",
      particle: "rgba(255,176,120,.82)"
    },
    {
      biome: "Frozen Peaks",
      mood: "Majestic",
      motion: "Bloom",
      sky: "linear-gradient(180deg, #0C1726 0%, #102233 50%, #15181D 100%)",
      skyGlow: "radial-gradient(circle, rgba(156,244,255,.22), rgba(156,244,255,.05) 48%, transparent 74%)",
      moon: "radial-gradient(circle at 35% 35%, rgba(255,255,255,.98), rgba(225,239,255,.80) 54%, rgba(174,255,243,.15) 76%, transparent 100%)",
      particle: "rgba(228,247,255,.88)"
    },
    {
      biome: "Storm Coast",
      mood: "Tense",
      motion: "Surge",
      sky: "linear-gradient(180deg, #08121B 0%, #0E1D2A 48%, #14161B 100%)",
      skyGlow: "radial-gradient(circle, rgba(92,168,255,.22), rgba(92,168,255,.04) 45%, transparent 70%)",
      moon: "radial-gradient(circle at 35% 35%, rgba(232,245,255,.85), rgba(136,176,225,.45) 58%, rgba(120,160,215,.10) 75%, transparent 100%)",
      particle: "rgba(180,223,255,.78)"
    }
  ];

  function hashString(input) {
    const str = String(input || "");
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  const DOG_ASSETS = {
    walk01: ASSET_BASE + "dog_walk_1.png",
    walk02: ASSET_BASE + "dog_walk_2.png",
    walk03: ASSET_BASE + "dog_walk_3.png",
    walk04: ASSET_BASE + "dog_walk_4.png",
    walk05: ASSET_BASE + "dog_walk_5.png",
    walk06: ASSET_BASE + "dog_walk_6.png",
    walk07: ASSET_BASE + "dog_walk_7.png",
    walk08: ASSET_BASE + "dog_walk_8.png",
    walk09: ASSET_BASE + "dog_walk_9.png",
    walk10: ASSET_BASE + "dog_walk_10.png",
    walk11: ASSET_BASE + "dog_walk_11.png",
    walk12: ASSET_BASE + "dog_walk_12.png"
  };

  const WALK_SEQUENCE = [
    "walk01",
    "walk02",
    "walk03",
    "walk04",
    "walk05",
    "walk06",
    "walk07",
    "walk08",
    "walk09",
    "walk10",
    "walk11",
    "walk12"
  ];

  const dogController = {
    assets: { ...DOG_ASSETS },
    direction: 1,
    x: 0.18,
    velocity: 0,
    targetVelocity: 0,
    minX: 0.10,
    maxX: 0.90,
    frameIndex: 0,
    frameTimer: 0,
    frameMs: 90,
    bob: 0,
    initialized: false,
    lastTrackKey: ""
  };

  function resetForNewTrack() {
    dogController.direction = Math.random() > 0.5 ? 1 : -1;
    dogController.x = 0.18;
    dogController.velocity = 0;
    dogController.targetVelocity = 0;
    dogController.frameIndex = 0;
    dogController.frameTimer = 0;
    dogController.frameMs = 90;
    dogController.bob = 0;
    dogController.initialized = true;
  }

  function updateWalkAnimation(dtMs) {
    dogController.frameTimer += dtMs;

    while (dogController.frameTimer >= dogController.frameMs) {
      dogController.frameTimer -= dogController.frameMs;
      dogController.frameIndex =
        (dogController.frameIndex + 1) % WALK_SEQUENCE.length;
    }
  }

  function updateMovement(dtMs) {
    const baseSpeed = 0.000024;

    dogController.targetVelocity = baseSpeed * dogController.direction;

    dogController.velocity +=
      (dogController.targetVelocity - dogController.velocity) * 0.08;

    dogController.x += dogController.velocity * dtMs;

    if (dogController.x <= dogController.minX) {
      dogController.x = dogController.minX;
      dogController.direction = 1;
    }

    if (dogController.x >= dogController.maxX) {
      dogController.x = dogController.maxX;
      dogController.direction = -1;
    }

    dogController.bob = 0;
  }

  function updateDog(dtMs) {
    if (!dogController.initialized) {
      resetForNewTrack();
    }

    updateWalkAnimation(dtMs);
    updateMovement(dtMs);
  }

  function getDogSprite() {
    const key = WALK_SEQUENCE[dogController.frameIndex] || "walk01";
    return dogController.assets[key];
  }

  function getDogSnapshot() {
    return {
      x: dogController.x,
      direction: dogController.direction,
      state: "walk",
      sprite: getDogSprite(),
      bob: dogController.bob
    };
  }

  function fromTrackAndAura(playerState, auraState = {}, runtime = {}) {
    const trackId = playerState?.track_id || "";
    const trackName = playerState?.track_name || "Unknown Track";
    const artistName = playerState?.artist_name || "Unknown Artist";
    const albumName = playerState?.album_name || "";
    const albumImage = playerState?.album_image || "";
    const isPlaying = !!playerState?.is_playing;

    const heat = clamp01(
      auraState.heat != null
        ? (auraState.heat > 1 ? auraState.heat / 100 : auraState.heat)
        : 0.55
    );

    const focus = clamp01(
      auraState.focus != null
        ? (auraState.focus > 1 ? auraState.focus / 100 : auraState.focus)
        : 0.55
    );

    const depth = clamp01(
      auraState.depth != null
        ? (auraState.depth > 1 ? auraState.depth / 100 : auraState.depth)
        : 0.55
    );

    const flux = clamp01(
      auraState.flux != null
        ? (auraState.flux > 1 ? auraState.flux / 100 : auraState.flux)
        : 0.50
    );

    const seed = hashString(trackId || `${trackName}::${artistName}`);
    const biome = BIOMES[seed % BIOMES.length];

    const currentMs = Number(runtime.currentMs || 0);
    const durationMs = Math.max(
      1,
      Number(runtime.durationMs || playerState?.duration_ms || 1)
    );
    const progress = clamp01(currentMs / durationMs);
    const dtMs = Math.max(0, Number(runtime.dtMs || 16));

    const trackKey = trackId || `${trackName}::${artistName}::${albumName}`;
    if (trackKey && trackKey !== dogController.lastTrackKey) {
      dogController.lastTrackKey = trackKey;
      resetForNewTrack();
    }

    updateDog(dtMs);

    return {
      biome: biome.biome,
      mood: biome.mood,
      motion: biome.motion,
      track: trackName,
      artist: artistName,
      album: albumName,
      albumImage,
      stateLabel: isPlaying ? "Now Playing" : "Paused",
      heat: Number(heat.toFixed(2)),
      focus: Number(focus.toFixed(2)),
      depth: Number(depth.toFixed(2)),
      flux: Number(flux.toFixed(2)),
      sky: biome.sky,
      skyGlow: biome.skyGlow,
      moon: biome.moon,
      particle: biome.particle,
      yoda: getDogSnapshot(),
      progress
    };
  }

  function resetYoda() {
    dogController.direction = 1;
    dogController.x = 0.18;
    dogController.velocity = 0;
    dogController.targetVelocity = 0;
    dogController.frameIndex = 0;
    dogController.frameTimer = 0;
    dogController.frameMs = 90;
    dogController.bob = 0;
    dogController.initialized = false;
    dogController.lastTrackKey = "";
  }

  window.RealmEngine = {
    fromTrackAndAura,
    resetYoda,
    getYodaSnapshot: getDogSnapshot
  };
})(); = false;
    yodaController.lastTrackId = "";
    yodaController.lastTrackKey = "";
  }

  window.RealmEngine = {
    fromTrackAndAura,
    resetYoda,
    getYodaSnapshot
  };
})();
