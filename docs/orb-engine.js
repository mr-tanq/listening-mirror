/* orb-engine.js (FULL FILE REPLACE) — PART 1/4
   Listening Mirror — Neural Orb Engine V2
   ✅ Canvas core + PNG neural layers
   ✅ Auto-injects assets into .orb-wrap
   ✅ Uses:
      ./orb-assets/orb-core-glow.png
      ./orb-assets/orb-neural-threads.png
      ./orb-assets/orb-particle-halo.png
      ./orb-assets/orb-outer-halo.png
   Exposes: window.LMOrbEngine
*/

(() => {
  "use strict";

  const TAU = Math.PI * 2;

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  function hashStringToSeed(str) {
    const s = String(str || "");
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexToRgb(hex) {
    const h = String(hex || "").replace("#", "").trim();
    if (h.length !== 6) return { r: 255, g: 255, b: 255 };
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  function rgbToHex(r, g, b) {
    return "#" + [r, g, b]
      .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("");
  }

  function rgba(hex, a) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  function brighten(hex, amt = 0.18) {
    const c = hexToRgb(hex);
    return rgbToHex(
      lerp(c.r, 255, amt),
      lerp(c.g, 255, amt),
      lerp(c.b, 255, amt)
    );
  }

  function darken(hex, amt = 0.35) {
    const c = hexToRgb(hex);
    return rgbToHex(
      c.r * (1 - amt),
      c.g * (1 - amt),
      c.b * (1 - amt)
    );
  }

  function makeDefaultPalette() {
    return {
      bg: "#050913",
      warm: "#ff8a38",
      cold: "#4ecaff",
      fusion: "#bb77ff",
      light: "#fff5ea"
    };
  }

  function makePaletteFromBase(baseHex) {
    const base = hexToRgb(baseHex || "#ff8a38");

    const warm = rgbToHex(
      lerp(base.r, 255, 0.18),
      lerp(base.g, 165, 0.12),
      lerp(base.b, 85, 0.08)
    );

    const cold = rgbToHex(
      lerp(base.r, 70, 0.82),
      lerp(base.g, 190, 0.82),
      lerp(base.b, 255, 0.88)
    );

    const fusion = rgbToHex(
      lerp(hexToRgb(warm).r, hexToRgb(cold).r, 0.45),
      lerp(hexToRgb(warm).g, hexToRgb(cold).g, 0.45),
      lerp(hexToRgb(warm).b, hexToRgb(cold).b, 0.45)
    );

    return {
      bg: darken(baseHex || warm, 0.78),
      warm,
      cold,
      fusion,
      light: brighten(warm, 0.58)
    };
  }

  async function extractPaletteFromArtwork(url) {
    if (!url) return null;

    return await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          const size = 48;
          canvas.width = size;
          canvas.height = size;
          ctx.drawImage(img, 0, 0, size, size);

          const data = ctx.getImageData(0, 0, size, size).data;

          let rs = 0, gs = 0, bs = 0, count = 0;
          let bestSat = -1;
          let vibrant = { r: 255, g: 180, b: 90 };

          for (let i = 0; i < data.length; i += 16) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            if (a < 120) continue;

            rs += r;
            gs += g;
            bs += b;
            count++;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const sat = max - min;
            const bright = (r + g + b) / 3;

            if (sat > bestSat && bright > 26 && bright < 235) {
              bestSat = sat;
              vibrant = { r, g, b };
            }
          }

          if (!count) {
            resolve(null);
            return;
          }

          const dominant = rgbToHex(rs / count, gs / count, bs / count);
          const vibrantHex = rgbToHex(vibrant.r, vibrant.g, vibrant.b);

          resolve({
            bg: darken(dominant, 0.80),
            warm: brighten(vibrantHex, 0.12),
            cold: rgbToHex(
              lerp(vibrant.r, 70, 0.78),
              lerp(vibrant.g, 188, 0.78),
              lerp(vibrant.b, 255, 0.84)
            ),
            fusion: vibrantHex,
            light: brighten(vibrantHex, 0.60)
          });
        } catch {
          resolve(null);
        }
      };

      img.onerror = () => resolve(null);
      img.src = url;
    });
           }
   class OrbEngine {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas?.getContext("2d", { alpha: true }) || null;

      this.maxDpr = opts.maxDpr || 2.25;
      this.fpsCap = opts.fpsCap || 60;

      this.seed = hashStringToSeed(opts.seed || "listening-mirror");
      this.palette = opts.palette || makeDefaultPalette();

      this.heat = 0.55;
      this.focus = 0.55;
      this.depth = 0.55;
      this.flux = 0.50;

      this.beatTempo = 110;
      this.beatEnergy = 0.55;

      this.running = false;
      this.rafId = 0;
      this.lastFrame = 0;

      this.orbitPhase = 0;
      this.noisePhase = 0;
      this.fusionPhase = 0;

      this.artworkCache = new Map();

      this.boundFrame = this.frame.bind(this);
      this.boundResize = this.resize.bind(this);

      this.wrap = canvas?.closest(".orb-wrap") || null;
      this.layers = null;

      this.injectStyles();
      this.ensureAssetLayers();
    }

    injectStyles() {
      if (document.getElementById("lmOrbLayerStyles")) return;

      const st = document.createElement("style");
      st.id = "lmOrbLayerStyles";
      st.textContent = `
        .orb-wrap{
          position:relative;
          overflow:visible;
        }

        .lmOrbAssetLayer{
          position:absolute;
          inset:-10%;
          width:120%;
          height:120%;
          object-fit:contain;
          pointer-events:none;
          user-select:none;
          -webkit-user-drag:none;
          mix-blend-mode:screen;
          transform-origin:50% 50%;
          will-change:transform, opacity, filter;
        }

        .lmOrbLayerCore{
          z-index:4;
        }

        .lmOrbLayerThreads{
          z-index:5;
        }

        .lmOrbLayerParticles{
          z-index:6;
        }

        .lmOrbLayerHalo{
          z-index:3;
        }
      `;
      document.head.appendChild(st);
    }

    ensureAssetLayers() {
      if (!this.wrap) return;
      if (this.layers) return this.layers;

      const makeImg = (cls, src) => {
        let img = this.wrap.querySelector(`.${cls}`);
        if (!img) {
          img = document.createElement("img");
          img.className = `lmOrbAssetLayer ${cls}`;
          img.alt = "";
          img.decoding = "async";
          img.loading = "eager";
          img.src = src;
          this.wrap.appendChild(img);
        }
        return img;
      };

      this.layers = {
        halo: makeImg("lmOrbLayerHalo", "./orb-assets/orb-outer-halo.png"),
        core: makeImg("lmOrbLayerCore", "./orb-assets/orb-core-glow.png"),
        threads: makeImg("lmOrbLayerThreads", "./orb-assets/orb-neural-threads.png"),
        particles: makeImg("lmOrbLayerParticles", "./orb-assets/orb-particle-halo.png")
      };

      return this.layers;
    }

    setSeed(seed) {
      this.seed = hashStringToSeed(seed || "listening-mirror");
    }

    setSignals({ heat, focus, depth, flux }) {
      if (Number.isFinite(heat)) this.heat = clamp01(heat);
      if (Number.isFinite(focus)) this.focus = clamp01(focus);
      if (Number.isFinite(depth)) this.depth = clamp01(depth);
      if (Number.isFinite(flux)) this.flux = clamp01(flux);
    }

    setBeat({ tempo, energy }) {
      if (Number.isFinite(tempo)) this.beatTempo = Math.max(60, Math.min(180, tempo));
      if (Number.isFinite(energy)) this.beatEnergy = clamp01(energy);
    }

    setPalette(palette) {
      if (!palette) return;
      this.palette = {
        bg: palette.bg || this.palette.bg,
        warm: palette.warm || this.palette.warm,
        cold: palette.cold || this.palette.cold,
        fusion: palette.fusion || this.palette.fusion,
        light: palette.light || this.palette.light
      };
    }

    async setArtwork(url) {
      if (!url) return false;
      if (this.artworkCache.has(url)) {
        const cached = await this.artworkCache.get(url);
        if (cached) this.setPalette(cached);
        return !!cached;
      }

      const p = extractPaletteFromArtwork(url);
      this.artworkCache.set(url, p);
      const palette = await p;
      if (palette) this.setPalette(palette);
      return !!palette;
    }

    resize() {
      if (!this.canvas || !this.ctx) return;
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
      const w = Math.max(64, Math.round(rect.width * dpr));
      const h = Math.max(64, Math.round(rect.height * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
    }

    start() {
      if (!this.ctx || this.running) return;
      this.running = true;
      this.resize();
      window.addEventListener("resize", this.boundResize, { passive: true });
      this.rafId = requestAnimationFrame(this.boundFrame);
    }

    stop() {
      this.running = false;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = 0;
      window.removeEventListener("resize", this.boundResize);
    }

    destroy() {
      this.stop();
      this.canvas = null;
      this.ctx = null;
      this.layers = null;
      this.wrap = null;
          }
      updateAssetLayers(ts, pulse) {
      const layers = this.ensureAssetLayers();
      if (!layers) return;

      const t = ts * 0.001;
      const heat = this.heat;
      const flux = this.flux;
      const focus = this.focus;
      const depth = this.depth;

      const coreScale = 0.90 + focus * 0.10 + pulse * 0.06;
      const threadScale = 1.00 + flux * 0.04 + Math.sin(t * 0.9) * 0.01;
      const particleScale = 1.02 + depth * 0.05 + pulse * 0.03;
      const haloScale = 1.06 + depth * 0.08 + Math.sin(t * 0.5) * 0.01;

      const threadRot = t * (2.5 + flux * 7.0);
      const particleRot = -t * (1.4 + flux * 4.5);
      const haloRot = t * 0.8;
      const coreRot = Math.sin(t * 0.6) * 2.4;

      const coreOpacity = 0.42 + heat * 0.42 + pulse * 0.20;
      const threadsOpacity = 0.20 + flux * 0.42 + focus * 0.08;
      const particlesOpacity = 0.12 + depth * 0.26 + flux * 0.12 + pulse * 0.10;
      const haloOpacity = 0.10 + depth * 0.34 + pulse * 0.08;

      const warmGlow = `drop-shadow(0 0 ${18 + heat * 30}px ${rgba(this.palette.warm, 0.25 + heat * 0.20)})`;
      const coolGlow = `drop-shadow(0 0 ${18 + depth * 32}px ${rgba(this.palette.cold, 0.18 + depth * 0.18)})`;

      layers.core.style.opacity = `${coreOpacity}`;
      layers.core.style.transform = `scale(${coreScale}) rotate(${coreRot}deg)`;
      layers.core.style.filter = `${warmGlow} ${coolGlow}`;

      layers.threads.style.opacity = `${threadsOpacity}`;
      layers.threads.style.transform = `scale(${threadScale}) rotate(${threadRot}deg)`;
      layers.threads.style.filter = `drop-shadow(0 0 ${14 + flux * 20}px ${rgba(this.palette.light, 0.18 + flux * 0.12)})`;

      layers.particles.style.opacity = `${particlesOpacity}`;
      layers.particles.style.transform = `scale(${particleScale}) rotate(${particleRot}deg)`;
      layers.particles.style.filter = `drop-shadow(0 0 ${10 + depth * 16}px ${rgba(this.palette.fusion, 0.16 + depth * 0.12)})`;

      layers.halo.style.opacity = `${haloOpacity}`;
      layers.halo.style.transform = `scale(${haloScale}) rotate(${haloRot}deg)`;
      layers.halo.style.filter = `drop-shadow(0 0 ${22 + depth * 22}px ${rgba(this.palette.cold, 0.16 + depth * 0.12)})`;
    }

    drawCore(ts) {
      if (!this.ctx || !this.canvas) return;

      const w = this.canvas.width;
      const h = this.canvas.height;
      const cx = w * 0.5;
      const cy = h * 0.5;
      const t = ts * 0.001;

      const palette = this.palette;
      const bpm = Math.max(60, Math.min(180, this.beatTempo || 110));
      const beat = (t * bpm / 60) % 1;
      const pulse = Math.pow(Math.max(0, 1 - beat), 4.4) * (0.16 + this.beatEnergy * 0.20);

      this.orbitPhase += 0.004 + this.flux * 0.002;
      this.noisePhase += 0.006 + this.heat * 0.0015;
      this.fusionPhase += 0.008 + this.depth * 0.001;

      const radiusBase = Math.min(w, h) * 0.32;
      const radius = radiusBase * (1 + Math.sin(t * (0.82 + this.flux * 0.34)) * 0.008 + pulse * 0.06);

      this.ctx.clearRect(0, 0, w, h);

      const outer = this.ctx.createRadialGradient(cx, cy, radius * 0.10, cx, cy, radius * 1.55);
      outer.addColorStop(0.00, rgba(palette.light, 0.10 + pulse * 0.10));
      outer.addColorStop(0.22, rgba(palette.warm, 0.12 + this.heat * 0.08));
      outer.addColorStop(0.46, rgba(palette.cold, 0.12 + this.depth * 0.08));
      outer.addColorStop(1.00, "rgba(0,0,0,0)");
      this.ctx.fillStyle = outer;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius * 1.55, 0, TAU);
      this.ctx.fill();

      const core = this.ctx.createRadialGradient(cx, cy, radius * 0.01, cx, cy, radius * 0.95);
      core.addColorStop(0.00, rgba("#ffffff", 0.95));
      core.addColorStop(0.05, rgba(palette.light, 0.85));
      core.addColorStop(0.12, rgba(palette.warm, 0.34));
      core.addColorStop(0.22, rgba(palette.cold, 0.28));
      core.addColorStop(0.42, rgba(palette.fusion, 0.14));
      core.addColorStop(0.70, rgba(palette.bg, 0.06));
      core.addColorStop(1.00, "rgba(0,0,0,0)");
      this.ctx.fillStyle = core;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius, 0, TAU);
      this.ctx.fill();

      const rand = mulberry32((this.seed ^ ((ts / 80) | 0)) >>> 0);
      for (let i = 0; i < 16; i++) {
        const a = rand() * TAU;
        const rr = Math.pow(rand(), 0.85) * radius * (0.72 + this.focus * 0.18);
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        const r = lerp(0.8, 2.2, rand());
        const col = rand() > 0.5 ? palette.light : (rand() > 0.5 ? palette.warm : palette.cold);

        this.ctx.fillStyle = rgba(col, lerp(0.08, 0.22, rand()));
        this.ctx.beginPath();
        this.ctx.arc(x, y, r, 0, TAU);
        this.ctx.fill();
      }

      const innerRing = this.ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius * 1.02);
      innerRing.addColorStop(0.00, "rgba(255,255,255,0)");
      innerRing.addColorStop(0.70, rgba(palette.light, 0.08 + this.focus * 0.06));
      innerRing.addColorStop(1.00, rgba(palette.cold, 0.14 + this.depth * 0.08));

      this.ctx.strokeStyle = rgba(palette.light, 0.10 + pulse * 0.20);
      this.ctx.lineWidth = 1.1 + this.focus * 0.7;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius * (1 + pulse * 0.02), 0, TAU);
      this.ctx.stroke();

      this.ctx.strokeStyle = innerRing;
      this.ctx.lineWidth = 5 + pulse * 7;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius * 0.98, 0, TAU);
      this.ctx.stroke();

      this.updateAssetLayers(ts, pulse);
                                                                    }
      frame(ts) {
      if (!this.running || !this.ctx) return;

      const minFrame = 1000 / this.fpsCap;
      if (ts - this.lastFrame >= minFrame) {
        this.lastFrame = ts;
        this.drawCore(ts);
      }

      this.rafId = requestAnimationFrame(this.boundFrame);
    }
  }

  function mount(canvas, opts = {}) {
    const engine = new OrbEngine(canvas, opts);
    engine.start();
    return engine;
  }

  window.LMOrbEngine = {
    mount,
    makeDefaultPalette,
    makePaletteFromBase
  };
})();
