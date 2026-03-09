/* orb-engine.js (FULL FILE REPLACE)
   Listening Mirror — Hybrid Neural Orb Engine v3
   ✅ canvas core + png overlays
   ✅ uses docs/orb-assets/
   ✅ mobile-safe
   ✅ reacts to heat / flux / focus / depth
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

  function rgba(hex, a) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  function rgbToHex(r, g, b) {
    return "#" + [r, g, b]
      .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("");
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
      cold: "#55caff",
      fusion: "#b488ff",
      light: "#fff5ea"
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
          let vibrant = { r: 255, g: 138, b: 56 };

          for (let i = 0; i < data.length; i += 16) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            if (a < 120) continue;

            rs += r; gs += g; bs += b; count++;

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
            bg: darken(dominant, 0.82),
            warm: brighten(vibrantHex, 0.10),
            cold: rgbToHex(
              lerp(vibrant.r, 70, 0.80),
              lerp(vibrant.g, 190, 0.80),
              lerp(vibrant.b, 255, 0.86)
            ),
            fusion: rgbToHex(
              lerp(vibrant.r, 180, 0.35),
              lerp(vibrant.g, 120, 0.25),
              lerp(vibrant.b, 255, 0.35)
            ),
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
      this.wrap = canvas?.closest(".orb-wrap") || null;

      this.maxDpr = opts.maxDpr || 2.0;
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

      this.struts = this.makeStrands();
      this.particles = this.makeParticles();

      this.boundFrame = this.frame.bind(this);
      this.boundResize = this.resize.bind(this);

      this.artworkCache = new Map();
      this.overlayEls = null;

      this.injectStyles();
      this.ensureOverlays();
    }

    injectStyles() {
      if (document.getElementById("lmOrbOverlayStyles")) return;

      const st = document.createElement("style");
      st.id = "lmOrbOverlayStyles";
      st.textContent = `
        .lmOrbOverlay{
          position:absolute;
          left:50%;
          top:50%;
          width:112%;
          height:112%;
          transform:translate(-50%, -50%);
          pointer-events:none;
          object-fit:contain;
          mix-blend-mode:screen;
          user-select:none;
          -webkit-user-drag:none;
          will-change:transform, opacity, filter;
        }
        .lmOrbOverlay--halo{ z-index:4; }
        .lmOrbOverlay--particles{ z-index:5; }
        .lmOrbOverlay--threads{ z-index:6; }
        .lmOrbOverlay--core{ z-index:7; }
      `;
      document.head.appendChild(st);
    }

    ensureOverlays() {
      if (!this.wrap) return null;
      if (this.overlayEls) return this.overlayEls;

      const makeImg = (cls, src) => {
        let el = this.wrap.querySelector(`.${cls}`);
        if (!el) {
          el = document.createElement("img");
          el.className = `lmOrbOverlay ${cls}`;
          el.alt = "";
          el.decoding = "async";
          el.loading = "eager";
          el.src = src;
          this.wrap.appendChild(el);
        }
        return el;
      };

      this.overlayEls = {
        halo: makeImg("lmOrbOverlay--halo", "./orb-assets/orb-halo.png"),
        particles: makeImg("lmOrbOverlay--particles", "./orb-assets/orb-particles.png"),
        threads: makeImg("lmOrbOverlay--threads", "./orb-assets/orb-threads.png"),
        core: makeImg("lmOrbOverlay--core", "./orb-assets/orb-core.png")
      };

      return this.overlayEls;
    }

    makeStrands() {
      const strands = [];
      const rand = mulberry32(this.seed ^ 0xABCDEF);

      for (let i = 0; i < 16; i++) {
        strands.push({
          a0: rand() * TAU,
          speed: lerp(0.10, 0.34, rand()),
          radiusBias: lerp(0.36, 0.92, rand()),
          width: lerp(0.6, 2.0, rand()),
          bend: lerp(0.16, 0.42, rand()),
          phase: rand() * TAU,
          warmMix: rand()
        });
      }

      return strands;
    }

    makeParticles() {
      const pts = [];
      const rand = mulberry32(this.seed ^ 0x13579B);

      for (let i = 0; i < 34; i++) {
        pts.push({
          a0: rand() * TAU,
          speed: lerp(-0.22, 0.22, rand()),
          ring: lerp(0.42, 1.00, rand()),
          size: lerp(0.8, 2.2, rand()),
          twinkle: rand() * TAU,
          warmMix: rand()
        });
      }

      return pts;
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

    setSeed(seed) {
      this.seed = hashStringToSeed(seed || "listening-mirror");
      this.struts = this.makeStrands();
      this.particles = this.makeParticles();
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

    drawBackgroundGlow(ctx, cx, cy, radius, pulse) {
      const g = ctx.createRadialGradient(cx, cy, radius * 0.08, cx, cy, radius * 1.35);
      g.addColorStop(0.00, rgba(this.palette.light, 0.04 + pulse * 0.06));
      g.addColorStop(0.24, rgba(this.palette.warm, 0.08 + this.heat * 0.06));
      g.addColorStop(0.48, rgba(this.palette.cold, 0.08 + this.depth * 0.06));
      g.addColorStop(1.00, "rgba(0,0,0,0)");

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.35, 0, TAU);
      ctx.fill();
    }

    drawCore(ctx, cx, cy, radius, pulse) {
      const core = ctx.createRadialGradient(cx, cy, radius * 0.01, cx, cy, radius * 0.82);
      core.addColorStop(0.00, rgba("#ffffff", 0.92));
      core.addColorStop(0.08, rgba(this.palette.light, 0.84));
      core.addColorStop(0.20, rgba(this.palette.warm, 0.24 + this.heat * 0.10));
      core.addColorStop(0.38, rgba(this.palette.cold, 0.12 + this.depth * 0.08));
      core.addColorStop(1.00, "rgba(0,0,0,0)");

      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (0.76 + pulse * 0.03), 0, TAU);
      ctx.fill();
    }

    drawStrands(ctx, cx, cy, radius, t) {
      const fluxBoost = 0.38 + this.flux * 0.8;
      const focusTight = 0.90 - this.focus * 0.14;
      const strandAlpha = 0.05 + this.flux * 0.10 + this.focus * 0.04;

      ctx.save();
      ctx.globalCompositeOperation = "screen";

      for (const s of this.struts) {
        const a = s.a0 + t * s.speed * fluxBoost;
        const r0 = radius * (0.18 + s.radiusBias * 0.14) * focusTight;
        const r1 = radius * (0.46 + s.radiusBias * 0.16);
        const bend = radius * s.bend * (0.55 + this.flux * 0.30);

        const x0 = cx + Math.cos(a) * r0;
        const y0 = cy + Math.sin(a) * r0;
        const x3 = cx + Math.cos(a + Math.sin(t + s.phase) * 0.22) * r1;
        const y3 = cy + Math.sin(a + Math.sin(t + s.phase) * 0.22) * r1;
        const x1 = cx + Math.cos(a - 0.7) * bend;
        const y1 = cy + Math.sin(a - 0.7) * bend;
        const x2 = cx + Math.cos(a + 0.7) * bend;
        const y2 = cy + Math.sin(a + 0.7) * bend;

        const col = s.warmMix > 0.5 ? this.palette.warm : this.palette.cold;

        ctx.strokeStyle = rgba(col, strandAlpha);
        ctx.lineWidth = s.width * (0.65 + this.focus * 0.22);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
        ctx.stroke();
      }

      ctx.restore();
    }

    drawParticles(ctx, cx, cy, radius, t) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";

      for (const p of this.particles) {
        const a = p.a0 + t * p.speed * (0.6 + this.flux * 0.6);
        const rr = radius * p.ring * (0.96 + Math.sin(t * 0.8 + p.twinkle) * 0.03);
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;

        const tw = 0.35 + 0.65 * ((Math.sin(t * 2.2 + p.twinkle) + 1) * 0.5);
        const size = p.size * (0.6 + this.depth * 0.4) * tw;

        const col = p.warmMix > 0.52 ? this.palette.warm : this.palette.cold;
        ctx.fillStyle = rgba(col, 0.08 + tw * 0.10);

        ctx.beginPath();
        ctx.arc(x, y, size, 0, TAU);
        ctx.fill();
      }

      ctx.restore();
    }

    updateOverlays(t, pulse) {
      const o = this.ensureOverlays();
      if (!o) return;

      const warmGlow = `drop-shadow(0 0 ${10 + this.heat * 10}px ${rgba(this.palette.warm, 0.18)})`;
      const coolGlow = `drop-shadow(0 0 ${10 + this.depth * 10}px ${rgba(this.palette.cold, 0.16)})`;

      o.core.style.opacity = `${0.18 + this.heat * 0.18 + pulse * 0.08}`;
      o.core.style.transform = `translate(-50%, -50%) scale(${0.62 + this.focus * 0.10 + pulse * 0.03}) rotate(${Math.sin(t * 0.5) * 2}deg)`;
      o.core.style.filter = `${warmGlow} ${coolGlow}`;

      o.threads.style.opacity = `${0.12 + this.flux * 0.18}`;
      o.threads.style.transform = `translate(-50%, -50%) scale(${0.72 + this.flux * 0.10}) rotate(${t * 8}deg)`;
      o.threads.style.filter = `drop-shadow(0 0 ${10 + this.flux * 10}px ${rgba(this.palette.light, 0.12)})`;

      o.particles.style.opacity = `${0.10 + this.depth * 0.16}`;
      o.particles.style.transform = `translate(-50%, -50%) scale(${0.78 + this.depth * 0.10}) rotate(${-t * 4.5}deg)`;
      o.particles.style.filter = `drop-shadow(0 0 ${8 + this.depth * 10}px ${rgba(this.palette.fusion, 0.12)})`;

      o.halo.style.opacity = `${0.10 + this.depth * 0.14 + pulse * 0.04}`;
      o.halo.style.transform = `translate(-50%, -50%) scale(${0.86 + this.depth * 0.10 + pulse * 0.02}) rotate(${t * 2}deg)`;
      o.halo.style.filter = `drop-shadow(0 0 ${12 + this.depth * 14}px ${rgba(this.palette.cold, 0.12)})`;
      }
      draw(ts) {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const cx = w * 0.5;
      const cy = h * 0.5;

      const t = ts * 0.001;
      const bpm = Math.max(60, Math.min(180, this.beatTempo || 110));
      const beat = (t * bpm / 60) % 1;
      const pulse = Math.pow(Math.max(0, 1 - beat), 4.0) * (0.08 + this.beatEnergy * 0.18);

      const radiusBase = Math.min(w, h) * 0.26;
      const radius = radiusBase * (
        1
        + Math.sin(t * (0.7 + this.flux * 0.4)) * 0.010
        + pulse * 0.03
      );

      ctx.clearRect(0, 0, w, h);

      this.drawBackgroundGlow(ctx, cx, cy, radius, pulse);
      this.drawStrands(ctx, cx, cy, radius, t);
      this.drawParticles(ctx, cx, cy, radius, t);
      this.drawCore(ctx, cx, cy, radius, pulse);
      this.updateOverlays(t, pulse);
    }

    frame(ts) {
      if (!this.running || !this.ctx) return;

      const minFrame = 1000 / this.fpsCap;
      if (ts - this.lastFrame >= minFrame) {
        this.lastFrame = ts;
        this.resize();
        this.draw(ts);
      }

      this.rafId = requestAnimationFrame(this.boundFrame);
    }
  }

  function mount(canvas, opts = {}) {
    const engine = new OrbEngine(canvas, opts);
    engine.start();
    return engine;
  }

  window.LMOrbEngine = { mount };
})();
