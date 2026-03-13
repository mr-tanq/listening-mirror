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
    walk1: ASSET_BASE + "dog_walk_1.png",
    walk2: ASSET_BASE + "dog_walk_2.png",
    walk3: ASSET_BASE + "dog_walk_3.png",
    walk4: ASSET_BASE + "dog_walk_4.png",
    walk5: ASSET_BASE + "dog_walk_5.png",
    walk6: ASSET_BASE + "dog_walk_6.png",
    walk7: ASSET_BASE + "dog_walk_7.png",
    walk8: ASSET_BASE + "dog_walk_8.png",
    walk9: ASSET_BASE + "dog_walk_9.png",
    walk10: ASSET_BASE + "dog_walk_10.png",
    walk11: ASSET_BASE + "dog_walk_11.png",
    walk12: ASSET_BASE + "dog_walk_12.png"
  };

  const WALK_SEQUENCE = [
    "walk1",
    "walk2",
    "walk3",
    "walk4",
    "walk5",
    "walk6",
    "walk7",
    "walk8",
    "walk9",
    "walk10",
    "walk11",
    "walk12"
  ];

  const dogController = {
    assets: { ...DOG_ASSETS },
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
    dog.frameMs = 85;
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

  function getDogSnapshot() {
    return {
      x: dog.x,
      direction: dog.dir,
      state: "walk",
      sprite: ASSET_BASE + WALK_SEQUENCE[dog.frame],
      bob: 0
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

    const dt = Math.max(0, Number(runtime.dtMs || 16));
    const currentMs = Number(runtime.currentMs || 0);
    const durationMs = Math.max(
      1,
      Number(runtime.durationMs || playerState?.duration_ms || 1)
    );
    const progress = clamp01(currentMs / durationMs);

    const trackKey = trackId || `${trackName}::${artistName}::${albumName}`;
    if (trackKey && trackKey !== dog.lastTrackKey) {
      dog.lastTrackKey = trackKey;
      resetDog();
    }

    updateDog(dt);

    return {
      biome: biome.biome,
      mood: biome.mood,
      motion: biome.motion,
      track: trackName,
      artist: artistName,
      album: albumName,
      albumImage: albumImage,
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
    dog.x = 0.18;
    dog.dir = 1;
    dog.vel = 0;
    dog.targetVel = 0;
    dog.frame = 0;
    dog.timer = 0;
    dog.frameMs = 85;
    dog.initialized = false;
    dog.lastTrackKey = "";
  }

  window.RealmEngine = {
    fromTrackAndAura,
    resetYoda,
    getYodaSnapshot: getDogSnapshot
  };
})();