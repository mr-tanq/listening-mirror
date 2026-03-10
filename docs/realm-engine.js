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
      birds: true
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
      birds: true
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
      birds: false
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
      birds: false
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

  function hashString(input) {
    const str = String(input || "");
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function normalizeAuraValue(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    if (n > 1.001) return clamp01(n / 100);
    return clamp01(n);
  }
  function biomeFromSeed(seed) {
    const biomeIndex = seed % BIOMES.length;
    return BIOMES[biomeIndex];
  }

  function fromTrackAndAura(playerState, auraState = {}) {
    const trackId = playerState?.track_id || "";
    const trackName = playerState?.track_name || "Unknown Track";
    const artistName = playerState?.artist_name || "Unknown Artist";
    const isPlaying = !!playerState?.is_playing;

    const seedSource = trackId || `${trackName}::${artistName}`;
    const seed = hashString(seedSource);
    const biomeBase = biomeFromSeed(seed);

    const heat = normalizeAuraValue(auraState.heat, 0.55);
    const focus = normalizeAuraValue(auraState.focus, 0.55);
    const depth = normalizeAuraValue(auraState.depth, 0.55);
    const fluxRaw = normalizeAuraValue(auraState.flux, 0.50);
    const flux = isPlaying ? fluxRaw : Math.max(0.10, fluxRaw * 0.55);

    return {
      biome: biomeBase.biome,
      mood: biomeBase.mood,
      motion: biomeBase.motion,
      track: trackName,
      artist: artistName,
      stateLabel: isPlaying ? "Now Playing" : "Paused",
      heat: Number(heat.toFixed(2)),
      focus: Number(focus.toFixed(2)),
      depth: Number(depth.toFixed(2)),
      flux: Number(clamp01(flux).toFixed(2)),
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

  function getStateAt(index) {
    const safeIndex = ((index % BIOMES.length) + BIOMES.length) % BIOMES.length;
    const biome = BIOMES[safeIndex];

    return cloneState({
      biome: biome.biome,
      mood: biome.mood,
      motion: biome.motion,
      track: "The Listening Realm",
      artist: "Prototype Track • Realm Portal v1",
      stateLabel: "Now Playing",
      heat: 0.64,
      focus: 0.72,
      depth: 0.86,
      flux: 0.41,
      portalGlow: biome.portalGlow,
      portalGlow2: biome.portalGlow2,
      portalEdge: biome.portalEdge,
      sky: biome.sky,
      skyGlow: biome.skyGlow,
      moon: biome.moon,
      far: biome.far,
      mid: biome.mid,
      ground: biome.ground,
      particle: biome.particle,
      towerOpacity: biome.towerOpacity,
      birds: biome.birds
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
    return BIOMES.map((_, i) => getStateAt(i));
  }

  window.RealmEngine = {
    getCurrentState,
    nextDemoState,
    prevDemoState,
    reset,
    getAllDemoStates,
    fromTrackAndAura
  };
})();
