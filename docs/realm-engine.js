(() => {
  "use strict";

  const BIOMES = [
    {
      biome: "Moonlit Ruins",
      mood: "Melancholic",
      motion: "Drift",
      portalGlow: "rgba(122,215,255,.30)",
      portalGlow2: "rgba(184,140,255,.18)",
      portalEdge: "rgba(180,220,255,.18)",
      sky: "linear-gradient(180deg, #09111E 0%, #101827 48%, #13151A 100%)",
      skyGlow: "radial-gradient(circle, rgba(122,215,255,.28), rgba(122,215,255,.06) 45%, transparent 70%)",
      moon: "radial-gradient(circle at 35% 35%, rgba(255,255,255,.95), rgba(214,227,255,.72) 55%, rgba(159,187,228,.18) 75%, transparent 100%)",
      far: "linear-gradient(180deg, rgba(39,60,88,.20), rgba(15,26,39,.94))",
      mid: "linear-gradient(180deg, rgba(22,34,49,.12), rgba(9,13,20,.98))",
      ground: "linear-gradient(180deg, rgba(8,11,16,.30), rgba(4,6,9,1))",
      particle: "rgba(210,233,255,.82)",
      towerOpacity: 0.92,
      birds: true,
      metricRanges: {
        heat: [0.48, 0.72],
        focus: [0.62, 0.88],
        depth: [0.72, 0.96],
        flux: [0.24, 0.52]
      }
    },
    {
      biome: "Storm Coast",
      mood: "Tense",
      motion: "Surge",
      portalGlow: "rgba(114,198,255,.34)",
      portalGlow2: "rgba(96,120,255,.20)",
      portalEdge: "rgba(169,226,255,.18)",
      sky: "linear-gradient(180deg, #08121B 0%, #0E1D2A 48%, #14161B 100%)",
      skyGlow: "radial-gradient(circle, rgba(92,168,255,.22), rgba(92,168,255,.04) 45%, transparent 70%)",
      moon: "radial-gradient(circle at 35% 35%, rgba(232,245,255,.85), rgba(136,176,225,.45) 58%, rgba(120,160,215,.10) 75%, transparent 100%)",
      far: "linear-gradient(180deg, rgba(31,58,78,.28), rgba(12,24,37,.96))",
      mid: "linear-gradient(180deg, rgba(16,29,40,.20), rgba(8,12,18,.99))",
      ground: "linear-gradient(180deg, rgba(10,16,22,.26), rgba(4,8,11,1))",
      particle: "rgba(180,223,255,.78)",
      towerOpacity: 0.88,
      birds: true,
      metricRanges: {
        heat: [0.58, 0.82],
        focus: [0.42, 0.70],
        depth: [0.68, 0.90],
        flux: [0.58, 0.88]
      }
    },
    {
      biome: "Frozen Peaks",
      mood: "Majestic",
      motion: "Bloom",
      portalGlow: "rgba(180,236,255,.28)",
      portalGlow2: "rgba(112,255,214,.16)",
      portalEdge: "rgba(220,245,255,.20)",
      sky: "linear-gradient(180deg, #0C1726 0%, #102233 50%, #15181D 100%)",
      skyGlow: "radial-gradient(circle, rgba(156,244,255,.22), rgba(156,244,255,.05) 48%, transparent 74%)",
      moon: "radial-gradient(circle at 35% 35%, rgba(255,255,255,.98), rgba(225,239,255,.80) 54%, rgba(174,255,243,.15) 76%, transparent 100%)",
      far: "linear-gradient(180deg, rgba(78,128,158,.18), rgba(24,42,58,.90))",
      mid: "linear-gradient(180deg, rgba(26,54,71,.12), rgba(8,15,22,.98))",
      ground: "linear-gradient(180deg, rgba(14,20,28,.22), rgba(6,10,14,1))",
      particle: "rgba(228,247,255,.88)",
      towerOpacity: 0.70,
      birds: false,
      metricRanges: {
        heat: [0.20, 0.44],
        focus: [0.72, 0.96],
        depth: [0.82, 0.98],
        flux: [0.18, 0.44]
      }
    },
    {
      biome: "Ashen Keep",
      mood: "Ominous",
      motion: "March",
      portalGlow: "rgba(255,144,84,.30)",
      portalGlow2: "rgba(255,76,76,.16)",
      portalEdge: "rgba(255,186,148,.18)",
      sky: "linear-gradient(180deg, #150B0B 0%, #241111 46%, #181212 100%)",
      skyGlow: "radial-gradient(circle, rgba(255,138,74,.24), rgba(255,138,74,.05) 48%, transparent 74%)",
      moon: "radial-gradient(circle at 35% 35%, rgba(255,213,184,.88), rgba(255,132,78,.52) 56%, rgba(255,91,76,.10) 78%, transparent 100%)",
      far: "linear-gradient(180deg, rgba(87,44,31,.24), rgba(33,18,14,.94))",
      mid: "linear-gradient(180deg, rgba(50,24,19,.16), rgba(11,8,8,.99))",
      ground: "linear-gradient(180deg, rgba(18,10,9,.24), rgba(7,4,4,1))",
      particle: "rgba(255,176,120,.82)",
      towerOpacity: 0.96,
      birds: false,
      metricRanges: {
        heat: [0.78, 0.96],
        focus: [0.50, 0.78],
        depth: [0.42, 0.68],
        flux: [0.34, 0.62]
      }
    }
  ];

  let demoIndex = 0;

  function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function hashString(input) {
    const str = String(input || "");
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seeded01(seed, salt = 0) {
    let x = (seed ^ (salt * 374761393)) >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10000) / 10000;
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }
  function makeStateFromSeed(seed, trackName = "", artistName = "", isPlaying = false) {
    const biomeIndex = seed % BIOMES.length;
    const biomeBase = BIOMES[biomeIndex];

    const heat = lerp(biomeBase.metricRanges.heat[0], biomeBase.metricRanges.heat[1], seeded01(seed, 11));
    const focus = lerp(biomeBase.metricRanges.focus[0], biomeBase.metricRanges.focus[1], seeded01(seed, 22));
    const depth = lerp(biomeBase.metricRanges.depth[0], biomeBase.metricRanges.depth[1], seeded01(seed, 33));
    const fluxBase = lerp(biomeBase.metricRanges.flux[0], biomeBase.metricRanges.flux[1], seeded01(seed, 44));
    const flux = clamp01(isPlaying ? fluxBase : Math.max(0.12, fluxBase * 0.55));

    return {
      biome: biomeBase.biome,
      mood: biomeBase.mood,
      motion: biomeBase.motion,
      track: trackName || "Unknown Track",
      artist: artistName || "Unknown Artist",
      stateLabel: isPlaying ? "Now Playing" : "Paused",
      heat: Number(heat.toFixed(2)),
      focus: Number(focus.toFixed(2)),
      depth: Number(depth.toFixed(2)),
      flux: Number(flux.toFixed(2)),
      portalGlow: biomeBase.portalGlow,
      portalGlow2: biomeBase.portalGlow2,
      portalEdge: biomeBase.portalEdge,
      sky: biomeBase.sky,
      skyGlow: biomeBase.skyGlow,
      moon: biomeBase.moon,
      far: biomeBase.far,
      mid: biomeBase.mid,
      ground: biomeBase.ground,
      particle: biomeBase.particle,
      towerOpacity: biomeBase.towerOpacity,
      birds: biomeBase.birds
    };
  }

  function fromTrack(playerState) {
    const trackId = playerState?.track_id || "";
    const trackName = playerState?.track_name || "Unknown Track";
    const artistName = playerState?.artist_name || "Unknown Artist";
    const isPlaying = !!playerState?.is_playing;

    const seedSource = trackId || `${trackName}::${artistName}`;
    const seed = hashString(seedSource);

    return makeStateFromSeed(seed, trackName, artistName, isPlaying);
  }

  function getStateAt(index) {
    const safeIndex = ((index % BIOMES.length) + BIOMES.length) % BIOMES.length;
    const biome = BIOMES[safeIndex];
    return cloneState({
      ...makeStateFromSeed(hashString(biome.biome), "The Listening Realm", "Prototype Track • Realm Portal v1", true),
      biome: biome.biome,
      mood: biome.mood,
      motion: biome.motion
    });
  }

  function getCurrentState() {
    return getStateAt(demoIndex);
  }

  function nextDemoState() {
    demoIndex = (demoIndex + 1) % BIOMES.length;
    return getCurrentState();
  }

  function prevDemoState() {
    demoIndex = (demoIndex - 1 + BIOMES.length) % BIOMES.length;
    return getCurrentState();
  }

  function reset() {
    demoIndex = 0;
    return getCurrentState();
  }

  function getAllDemoStates() {
    return BIOMES.map((biome, i) => {
      const st = getStateAt(i);
      st.biome = biome.biome;
      st.mood = biome.mood;
      st.motion = biome.motion;
      return st;
    });
  }
  window.RealmEngine = {
    getCurrentState,
    nextDemoState,
    prevDemoState,
    reset,
    getAllDemoStates,
    fromTrack
  };
})();
