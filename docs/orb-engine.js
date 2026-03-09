/* orb-engine.js (FULL FILE REPLACE) — PART 1/4
   Listening Mirror — Orb Engine V1
   Standalone plasma orb renderer for main canvas
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

  function extractPaletteFromArtwork(url) {
    return new Promise((resolve) => {
      if (!url) {
        resolve(null);
        return;
      }

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
    }

    filamentCurve(ctx, x1, y1, c1x, c1y, c2x, c2y, x2, y2, cA, cB, width, alpha) {
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0.00, rgba(cA, 0.00));
      grad.addColorStop(0.14, rgba(cA, alpha * 0.95));
      grad.addColorStop(0.52, rgba(cB, alpha));
      grad.addColorStop(1.00, rgba(cB, 0.00));

      ctx.strokeStyle = grad;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x2, y2);
      ctx.stroke();
    }

    drawBand(ctx, cx, cy, r, t, pulse, side) {
      const palette = this.palette;
      const warm = side === "warm";
      const base = warm ? palette.warm : palette.cold;
      const hi = palette.light;
      const sign = warm ? -1 : 1;

      const count = 38;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < count; i++) {
        const frac = i / (count - 1);

        const startA = (warm ? Math.PI * 1.05 : -0.03) +
          Math.sin(t * (0.92 + frac * 0.35) + i * 0.44 + this.orbitPhase) * 0.16;

        const endA = (warm ? Math.PI * 1.94 : Math.PI * 0.90) +
          Math.cos(t * (1.02 + frac * 0.30) + i * 0.48 + this.orbitPhase * 0.7) * 0.14;

        const startR = r * lerp(0.56, 0.995, frac);
        const endR = r * lerp(0.92, 0.50, frac);

        const x1 = cx + Math.cos(startA) * startR;
        const y1 = cy + Math.sin(startA) * startR;
        const x2 = cx + Math.cos(endA) * endR;
        const y2 = cy + Math.sin(endA) * endR;

        const c1x = cx + sign * r * lerp(0.26, 0.42, frac) + Math.cos(startA + sign * 0.50) * r * 0.05;
        const c1y = cy - r * lerp(0.22, 0.04, frac) + Math.sin(t * 0.62 + i + this.noisePhase) * r * 0.009;
        const c2x = cx - sign * r * lerp(0.01, 0.10, frac) + Math.cos(endA - sign * 0.24) * r * 0.04;
        const c2y = cy + r * lerp(0.08, 0.24, frac) + Math.cos(t * 0.76 + i + this.noisePhase) * r * 0.009;

        const width = lerp(0.65, 4.2, 1 - frac) * (0.92 + pulse * 0.42);
        const alpha = lerp(0.12, 0.40, 1 - frac) + pulse * 0.18;

        this.filamentCurve(ctx, x1, y1, c1x, c1y, c2x, c2y, x2, y2, base, hi, width, alpha);
      }

      ctx.restore();
                         }
    drawOrb(ts) {
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

      this.ctx.clearRect(0, 0, w, h);

      const baseR = Math.min(w, h) * 0.408;
      const radius = baseR * (1 + Math.sin(t * (0.82 + this.flux * 0.34)) * 0.006 + pulse * 0.045);

      const halo = this.ctx.createRadialGradient(cx, cy, radius * 0.34, cx, cy, radius * 1.95);
      halo.addColorStop(0.00, rgba(palette.light, 0.14 + pulse * 0.18));
      halo.addColorStop(0.22, rgba(palette.warm, 0.20 + this.heat * 0.12));
      halo.addColorStop(0.40, rgba(palette.cold, 0.20 + this.depth * 0.12));
      halo.addColorStop(1.00, "rgba(0,0,0,0)");
      this.ctx.fillStyle = halo;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius * 1.95, 0, TAU);
      this.ctx.fill();

      this.ctx.save();
      this.ctx.beginPath();

      const pts = 260;
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * TAU;
        const wobble =
          Math.sin(a * 3 + t * 0.95) * radius * 0.006 +
          Math.sin(a * 7 - t * 1.20) * radius * 0.003;
        const rr = radius + wobble;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (i === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
      }

      this.ctx.closePath();
      this.ctx.clip();

      const sphereBase = this.ctx.createRadialGradient(cx, cy, radius * 0.04, cx, cy, radius * 1.02);
      sphereBase.addColorStop(0.00, rgba("#0a0d14", 0.02));
      sphereBase.addColorStop(0.48, rgba(palette.bg, 0.48));
      sphereBase.addColorStop(1.00, rgba("#020409", 0.98));
      this.ctx.fillStyle = sphereBase;
      this.ctx.fillRect(cx - radius * 1.2, cy - radius * 1.2, radius * 2.4, radius * 2.4);

      const warmField = this.ctx.createRadialGradient(
        cx - radius * 0.34, cy - radius * 0.03, radius * 0.02,
        cx - radius * 0.16, cy, radius * 0.94
      );
      warmField.addColorStop(0.00, rgba(palette.light, 0.92));
      warmField.addColorStop(0.06, rgba(palette.warm, 0.96));
      warmField.addColorStop(0.28, rgba(palette.warm, 0.40));
      warmField.addColorStop(0.60, rgba(palette.warm, 0.06));
      warmField.addColorStop(1.00, "rgba(0,0,0,0)");
      this.ctx.fillStyle = warmField;
      this.ctx.fillRect(cx - radius * 1.2, cy - radius * 1.2, radius * 2.4, radius * 2.4);

      const coldField = this.ctx.createRadialGradient(
        cx + radius * 0.30, cy - radius * 0.01, radius * 0.02,
        cx + radius * 0.15, cy, radius * 0.94
      );
      coldField.addColorStop(0.00, rgba(palette.light, 0.88));
      coldField.addColorStop(0.06, rgba(palette.cold, 0.98));
      coldField.addColorStop(0.28, rgba(palette.cold, 0.42));
      coldField.addColorStop(0.60, rgba(palette.cold, 0.06));
      coldField.addColorStop(1.00, "rgba(0,0,0,0)");
      this.ctx.fillStyle = coldField;
      this.ctx.fillRect(cx - radius * 1.2, cy - radius * 1.2, radius * 2.4, radius * 2.4);

      this.drawBand(this.ctx, cx, cy, radius, t, pulse, "warm");
      this.drawBand(this.ctx, cx, cy, radius, t + 0.20, pulse, "cold");

      this.ctx.globalCompositeOperation = "lighter";

      const ringCount = 10;
      for (let i = 0; i < ringCount; i++) {
        const warm = i < ringCount / 2;
        const col = warm ? palette.warm : palette.cold;
        const rr = radius * lerp(0.56, 0.99, i / (ringCount - 1));
        const start = (warm ? Math.PI * 0.98 : -0.01) + Math.sin(t * (0.9 + i * 0.04) + i) * 0.08;
        const end = start + lerp(0.90, 1.56, 0.58 + this.flux * 0.18);

        const grad = this.ctx.createLinearGradient(cx - rr, cy - rr, cx + rr, cy + rr);
        grad.addColorStop(0, rgba(col, 0));
        grad.addColorStop(0.5, rgba(col, 0.22 + pulse * 0.18));
        grad.addColorStop(1, rgba(col, 0));

        this.ctx.strokeStyle = grad;
        this.ctx.lineWidth = lerp(0.7, 2.3, 1 - i / ringCount);
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, rr, start, end);
        this.ctx.stroke();
      }
      const fusion = this.ctx.createRadialGradient(cx, cy, radius * 0.005, cx, cy, radius * 0.46);
      fusion.addColorStop(0.00, rgba("#ffffff", 0.98));
      fusion.addColorStop(0.05, rgba("#ffffff", 0.94));
      fusion.addColorStop(0.12, rgba(palette.light, 0.72 + pulse * 0.24));
      fusion.addColorStop(0.20, rgba(palette.warm, 0.24));
      fusion.addColorStop(0.28, rgba(palette.cold, 0.24));
      fusion.addColorStop(0.44, rgba("#ffffff", 0.06));
      fusion.addColorStop(1.00, "rgba(255,255,255,0)");
      this.ctx.fillStyle = fusion;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius * 0.48, 0, TAU);
      this.ctx.fill();

      const rand = mulberry32((this.seed ^ ((ts / 100) | 0)) >>> 0);
      for (let i = 0; i < 8; i++) {
        const a = rand() * TAU;
        const rr = Math.pow(rand(), 0.92) * radius * 0.88;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        const r = lerp(0.5, 1.2, rand());
        const col = rand() > 0.5 ? palette.light : palette.warm;
        this.ctx.fillStyle = rgba(col, lerp(0.04, 0.12, rand()));
        this.ctx.beginPath();
        this.ctx.arc(x, y, r, 0, TAU);
        this.ctx.fill();
      }

      this.ctx.globalCompositeOperation = "source-over";
      this.ctx.restore();

      this.ctx.strokeStyle = rgba("#ffffff", 0.12 + pulse * 0.20);
      this.ctx.lineWidth = 1.1;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius, 0, TAU);
      this.ctx.stroke();

      this.ctx.strokeStyle = rgba(palette.cold, 0.06 + pulse * 0.08);
      this.ctx.lineWidth = 5 + pulse * 7;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius * 1.01, 0, TAU);
      this.ctx.stroke();
    }

    frame(ts) {
      if (!this.running || !this.ctx) return;

      const minFrame = 1000 / this.fpsCap;
      if (ts - this.lastFrame >= minFrame) {
        this.lastFrame = ts;
        this.drawOrb(ts);
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
