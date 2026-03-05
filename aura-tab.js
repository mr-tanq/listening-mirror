/* aura-tab.js (FULL FILE REPLACE)
   Listening Mirror — Aura Tab
   ✅ Adds new "Aura" tab + panel (no app.js edits)
   ✅ Premium neon/iridescent glass UI (inspired by your screenshot)
   ✅ Hero Orb (Canvas 2D): particles + glow + rim
   ✅ Color palette is STABLE per track/artist (seed hash), but breathes with signals
   ✅ Robust: if API signals missing, uses gentle fallback drift
*/

(() => {
  "use strict";

  // ===== CONFIG =====
  const API_BASE = "https://i.errtanq9.workers.dev";

  // UI polling
  const NOW_POLL_MS = 900;
  const SIGNALS_POLL_MS = 15000;

  // Canvas perf
  const FPS_CAP = 55;
  const MAX_DPR = 2.25;
  const MAX_PARTICLES = 18;

  // Helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  function absApi(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith("/")) return API_BASE + path;
    return API_BASE + "/" + path;
  }

  async function apiGet(path) {
    const url = absApi(path);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function pick(obj, path, fallback = null) {
    try {
      const parts = path.split(".");
      let cur = obj;
      for (const p of parts) cur = cur?.[p];
      return cur == null ? fallback : cur;
    } catch {
      return fallback;
    }
  }

  function normalizeMaybePercent(x, fallback) {
    const n = Number(x);
    if (!Number.isFinite(n)) return fallback;
    if (n > 1.001) return clamp01(n / 100);
    return clamp01(n);
  }

  // Stable hash -> uint32
  function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Seed -> nice hue pair (premium: cyan/violet/gold range, not clowny)
  function paletteFromSeed(seedStr) {
    const h = hash32(seedStr);
    const base = (h % 360);
    // Keep in premium-ish zones by biasing away from muddy greens
    // (not strict, but nudges results)
    const hue1 = (base + (base > 95 && base < 165 ? 80 : 0)) % 360;
    const hue2 = (hue1 + 120 + (h % 40)) % 360;

    // Accent (rim spark)
    const hue3 = (hue1 + 240 + (h % 30)) % 360;
    return { hue1, hue2, hue3 };
  }

  // ===== Inject styles (Aura look) =====
  function injectCSS() {
    if ($("#auraTabStyles")) return;
    const st = document.createElement("style");
    st.id = "auraTabStyles";
    st.textContent = `
/* Aura Tab — premium neon glass (scoped by .auraPanelRoot) */
.auraPanelRoot{
  --a-h1: 210;
  --a-h2: 300;
  --a-h3: 40;

  --aGlowA: hsla(var(--a-h1), 95%, 65%, .55);
  --aGlowB: hsla(var(--a-h2), 95%, 65%, .48);
  --aGlowC: hsla(var(--a-h3), 95%, 62%, .38);

  --aGlassTop: rgba(24, 26, 32, .78);
  --aGlassBot: rgba(12, 13, 16, .78);

  --aStroke: rgba(255,255,255,.10);
  --aStroke2: rgba(255,255,255,.07);

  --aShadow: 0 22px 75px rgba(0,0,0,.62);
}

.auraWrap{
  border-radius: var(--r);
  overflow:hidden;
  position:relative;
}

.auraFrame{
  position:relative;
  border-radius: var(--r);
  padding: 1px;
  background:
    conic-gradient(
      from 230deg,
      hsla(var(--a-h1),95%,65%,.95),
      hsla(var(--a-h2),95%,65%,.95),
      hsla(var(--a-h3),95%,62%,.92),
      hsla(var(--a-h1),95%,65%,.95)
    );
  filter: saturate(1.12) contrast(1.04);
}

.auraFrame:before{
  content:"";
  position:absolute;
  inset:-22px;
  background:
    radial-gradient(520px 280px at 25% 20%, var(--aGlowA), transparent 62%),
    radial-gradient(560px 320px at 78% 28%, var(--aGlowB), transparent 65%),
    radial-gradient(520px 320px at 55% 90%, rgba(255,255,255,.08), transparent 62%);
  opacity:.25;
  filter: blur(18px);
  pointer-events:none;
}

.auraCard{
  border-radius: calc(var(--r) - 1px);
  background: linear-gradient(180deg, var(--aGlassTop), var(--aGlassBot));
  outline: 1px solid var(--aStroke);
  box-shadow: var(--aShadow);
  position:relative;
  overflow:hidden;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.auraCard:before{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;
  background:
    radial-gradient(900px 520px at 20% 0%, rgba(255,255,255,.10), transparent 55%),
    radial-gradient(700px 420px at 86% 10%, rgba(255,255,255,.08), transparent 60%),
    linear-gradient(180deg, rgba(0,0,0,.10), rgba(0,0,0,.35));
  opacity:.70;
}

.auraHero{
  padding: 16px;
  position:relative;
}

.auraHeroTop{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  position:relative;
  z-index:2;
  margin-bottom: 10px;
}

.auraTag{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,.045);
  outline: 1px solid rgba(255,255,255,.085);
  color: rgba(255,255,255,.85);
  font-size: 12px;
  letter-spacing:.25px;
  white-space:nowrap;
}

.auraTag .aDot{
  width:6px;height:6px;border-radius:999px;
  background: rgba(255,255,255,.16);
  box-shadow: 0 0 0 3px rgba(255,255,255,.06);
}

.auraTag.on .aDot{
  background: rgba(49,208,124,.90);
  box-shadow: 0 0 0 3px rgba(49,208,124,.12);
}

.auraTitle{
  font-size: 14px;
  font-weight: 780;
  color: rgba(255,255,255,.94);
  letter-spacing:.12px;
}

.auraSub{
  margin-top: 6px;
  font-size: 12px;
  color: rgba(255,255,255,.72);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.auraOrbStage{
  margin-top: 12px;
  border-radius: 18px;
  outline: 1px solid var(--aStroke2);
  background: rgba(255,255,255,.02);
  position:relative;
  overflow:hidden;
}

.auraOrbStage:before{
  content:"";
  position:absolute;
  inset:-1px;
  pointer-events:none;
  background:
    radial-gradient(420px 260px at 35% 30%, var(--aGlowA), transparent 62%),
    radial-gradient(420px 260px at 72% 35%, var(--aGlowB), transparent 66%),
    radial-gradient(520px 320px at 50% 105%, rgba(255,255,255,.08), transparent 66%);
  opacity:.18;
  filter: blur(10px);
}

.auraCanvas{
  width:100%;
  height: 310px;
  display:block;
}

@media (max-width: 520px){
  .auraCanvas{ height: 280px; }
}

.auraMiniRow{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap:10px;
  padding: 14px 16px 16px 16px;
  position:relative;
  z-index:2;
}

.auraMini{
  border-radius: 16px;
  background: rgba(255,255,255,.03);
  outline: 1px solid rgba(255,255,255,.08);
  padding: 10px 10px 11px 12px;
  overflow:hidden;
  position:relative;
}

.auraMini:before{
  content:"";
  position:absolute;
  inset:-1px;
  pointer-events:none;
  background: radial-gradient(220px 160px at 15% 20%, rgba(255,255,255,.08), transparent 60%);
  opacity:.60;
}

.auraMiniLbl{
  font-size: 10px;
  letter-spacing:.28px;
  color: rgba(255,255,255,.60);
  text-transform: uppercase;
}

.auraMiniVal{
  margin-top: 9px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
}

.auraBar{
  flex: 1 1 auto;
  height: 6px;
  border-radius: 999px;
  background: rgba(255,255,255,.06);
  outline: 1px solid rgba(255,255,255,.06);
  overflow:hidden;
}

.auraBar > i{
  display:block;
  height:100%;
  width: 40%;
  border-radius:999px;
  background: linear-gradient(90deg,
    hsla(var(--a-h1),95%,70%,.85),
    hsla(var(--a-h2),95%,70%,.70),
    hsla(var(--a-h3),95%,66%,.62)
  );
  box-shadow: inset 0 1px 0 rgba(255,255,255,.22);
}

.auraNum{
  font-size: 12px;
  font-weight: 800;
  color: rgba(255,255,255,.86);
  min-width: 34px;
  text-align:right;
}

.auraLine{
  grid-column:1/-1;
  margin-top: 2px;
  color: rgba(255,255,255,.70);
  font-size: 13px;
  line-height:1.45;
  padding: 0 2px;
}
    `;
    document.head.appendChild(st);
  }

  // ===== Create Aura tab + panel =====
  function ensureAuraTab() {
    const tabs = $(".tabs");
    if (!tabs) return null;

    if (!$("#tab-aura")) {
      const btn = document.createElement("button");
      btn.id = "tab-aura";
      btn.className = "tabBtn";
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", "false");
      btn.dataset.tab = "aura";
      btn.textContent = "Aura";
      tabs.appendChild(btn);
    }

    const app = $(".app");
    if (!app) return null;

    if (!$("#panel-aura")) {
      const section = document.createElement("section");
      section.id = "panel-aura";
      section.className = "panel hidden";
      section.dataset.panel = "aura";

      section.innerHTML = `
        <div class="card auraPanelRoot" id="auraRoot">
          <div class="auraWrap">
            <div class="auraFrame">
              <div class="auraCard">
                <div class="auraHero">
                  <div class="auraHeroTop">
                    <div class="auraTag" id="auraLiveTag">
                      <span class="aDot" aria-hidden="true"></span>
                      <span id="auraLiveText">AURA</span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                      <span class="auraTag" style="opacity:.95;">
                        <span class="aDot" style="background: rgba(255,255,255,.18); box-shadow:0 0 0 3px rgba(255,255,255,.06);" aria-hidden="true"></span>
                        <span id="auraLabel">Listening</span>
                      </span>
                    </div>
                  </div>

                  <div class="auraTitle" id="auraTrack">—</div>
                  <div class="auraSub" id="auraArtist">—</div>
                  <div class="auraSub" id="auraAlbum" style="color: rgba(255,255,255,.58);">—</div>

                  <div class="auraOrbStage">
                    <canvas id="auraCanvas" class="auraCanvas"></canvas>
                  </div>
                </div>

                <div class="auraMiniRow">
                  <div class="auraMini">
                    <div class="auraMiniLbl">Energy</div>
                    <div class="auraMiniVal">
                      <span class="auraBar"><i id="auraEnergyBar"></i></span>
                      <span class="auraNum" id="auraEnergyNum">—</span>
                    </div>
                  </div>
                  <div class="auraMini">
                    <div class="auraMiniLbl">Focus</div>
                    <div class="auraMiniVal">
                      <span class="auraBar"><i id="auraFocusBar"></i></span>
                      <span class="auraNum" id="auraFocusNum">—</span>
                    </div>
                  </div>

                  <div class="auraMini" style="grid-column:1/-1;">
                    <div class="auraMiniLbl">Discovery</div>
                    <div class="auraMiniVal">
                      <span class="auraBar"><i id="auraDiscBar"></i></span>
                      <span class="auraNum" id="auraDiscNum">—</span>
                    </div>
                  </div>

                  <div class="auraLine" id="auraLine">—</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      // Append after existing panels (end of .app)
      app.appendChild(section);
    }

    return true;
  }

  // ===== Tab switching (compat-friendly) =====
  // We do a tiny safe enhancer:
  // - If app.js already handles it, fine.
  // - If not (or it doesn't include our tab), we handle clicks and set hidden/aria-selected.
  function wireTabs() {
    const tabs = $(".tabs");
    if (!tabs) return;

    function setActive(tabName) {
      const btns = $$(".tabBtn", tabs);
      for (const b of btns) b.setAttribute("aria-selected", b.dataset.tab === tabName ? "true" : "false");

      const panels = $$("section.panel[data-panel]");
      for (const p of panels) {
        const on = p.dataset.panel === tabName;
        p.classList.toggle("hidden", !on);
      }
    }

    tabs.addEventListener(
      "click",
      (e) => {
        const btn = e.target?.closest?.(".tabBtn");
        if (!btn) return;
        const t = btn.dataset.tab;
        if (!t) return;
        // let existing handlers run too; we just ensure aura works
        setActive(t);
      },
      { passive: true }
    );

    // If URL hash set (optional), respect it
    const h = (location.hash || "").replace("#", "");
    if (h && $(`.tabBtn[data-tab="${h}"]`, tabs)) setActive(h);
  }

  // ===== Aura data (Now + signals) =====
  const state = {
    seed: "—",
    palette: { hue1: 210, hue2: 300, hue3: 40 },
    energy: 0.55,
    focus: 0.55,
    discovery: 0.45,
    live: false,
    track: "—",
    artist: "—",
    album: "—"
  };

  function applyPaletteCSS() {
    const root = $("#auraRoot");
    if (!root) return;
    root.style.setProperty("--a-h1", String(state.palette.hue1));
    root.style.setProperty("--a-h2", String(state.palette.hue2));
    root.style.setProperty("--a-h3", String(state.palette.hue3));
  }

  function setBars() {
    const e = clamp01(state.energy);
    const f = clamp01(state.focus);
    const d = clamp01(state.discovery);

    const setW = (id, v) => {
      const el = $(id);
      if (el) el.style.width = `${Math.round(v * 100)}%`;
    };
    const setN = (id, v) => {
      const el = $(id);
      if (el) el.textContent = `${Math.round(v * 100)}`;
    };

    setW("#auraEnergyBar", e);
    setW("#auraFocusBar", f);
    setW("#auraDiscBar", d);

    setN("#auraEnergyNum", e);
    setN("#auraFocusNum", f);
    setN("#auraDiscNum", d);

    const line = $("#auraLine");
    if (line) {
      const vibe =
        (e > 0.72 && f > 0.62) ? "Locked in. Bright core, sharp edges." :
        (d > 0.68) ? "Exploring. Colors drifting outward." :
        (e < 0.38) ? "Slow & deep. Heavy gravity." :
        "Steady. Clean glow.";
      line.textContent = vibe;
    }
  }

  function syncNowFromDOM() {
    const t = ($("#nowTrack")?.textContent || "—").trim();
    const a = ($("#nowArtist")?.textContent || "—").trim();
    const al = ($("#nowAlbum")?.textContent || "—").trim();

    const badge = ($("#nowBadgeText")?.textContent || "").toUpperCase();
    const live = badge.includes("LIVE") || badge.includes("ON");

    const changed = (t !== state.track) || (a !== state.artist);

    state.track = t || "—";
    state.artist = a || "—";
    state.album = al || "—";
    state.live = !!live;

    const trackEl = $("#auraTrack");
    const artistEl = $("#auraArtist");
    const albumEl = $("#auraAlbum");
    if (trackEl) trackEl.textContent = state.track;
    if (artistEl) artistEl.textContent = state.artist;
    if (albumEl) albumEl.textContent = state.album;

    const liveTag = $("#auraLiveTag");
    const liveText = $("#auraLiveText");
    if (liveTag) liveTag.classList.toggle("on", state.live);
    if (liveText) liveText.textContent = state.live ? "LIVE AURA" : "AURA";

    const seed = `${state.artist} — ${state.track}`;
    if (changed && seed && seed !== state.seed) {
      state.seed = seed;
      state.palette = paletteFromSeed(seed);
      applyPaletteCSS();
      // small “snap” so it feels responsive
      state.discovery = clamp01(state.discovery + 0.06);
      setBars();
    }
  }

  async function pollSignals() {
    try {
      const candidates = ["/diag", "/signals", "/orb", "/status"];
      let data = null;

      for (const p of candidates) {
        try {
          data = await apiGet(p);
          if (data) break;
        } catch {}
      }
      if (!data) throw new Error("No endpoint");

      const eRaw =
        pick(data, "energy", null) ??
        pick(data, "mood.energy", null) ??
        pick(data, "signals.energy", null);

      const fRaw =
        pick(data, "focus", null) ??
        pick(data, "mood.focus", null) ??
        pick(data, "signals.focus", null);

      const dRaw =
        pick(data, "discovery", null) ??
        pick(data, "mood.discovery", null) ??
        pick(data, "signals.discovery", null);

      const e = normalizeMaybePercent(eRaw, state.energy);
      const f = normalizeMaybePercent(fRaw, state.focus);
      const d = normalizeMaybePercent(dRaw, state.discovery);

      // smooth
      state.energy = lerp(state.energy, e, 0.35);
      state.focus = lerp(state.focus, f, 0.35);
      state.discovery = lerp(state.discovery, d, 0.35);

      setBars();
    } catch {
      // fallback drift (premium subtle)
      const drift = () => (Math.random() - 0.5) * 0.045;
      state.energy = clamp01(state.energy + drift());
      state.focus = clamp01(state.focus + drift());
      state.discovery = clamp01(state.discovery + drift());
      setBars();
    }
  }

  // ===== Orb canvas (Aura hero) =====
  function makeOrbRenderer() {
    const canvas = $("#auraCanvas");
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");

    let raf = 0;
    let lastFrame = 0;
    let t0 = performance.now();

    const particles = [];
    function resetParticles() {
      particles.length = 0;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        particles.push({
          x: Math.random(),
          y: Math.random(),
          r: 0.6 + Math.random() * 1.8,
          s: 0.08 + Math.random() * 0.30,
          a: 0.18 + Math.random() * 0.30,
          h: Math.random()
        });
      }
    }
    resetParticles();

    function resizeToCSS() {
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(10, Math.round(rect.width));
      const h = Math.max(10, Math.round(rect.height));
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);

      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return { w, h };
    }

    function draw(ts) {
      // FPS cap
      const minFrame = 1000 / FPS_CAP;
      if (ts - lastFrame < minFrame) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastFrame = ts;

      const { w: W, h: H } = resizeToCSS();
      ctx.clearRect(0, 0, W, H);

      const dt = ts - t0;
      t0 = ts;

      const { hue1, hue2, hue3 } = state.palette;

      // Signals
      const e = clamp01(state.energy);
      const f = clamp01(state.focus);
      const d = clamp01(state.discovery);

      const cx = W * 0.5;
      const cy = H * 0.52;

      // Orb size: responsive, big hero
      const baseR = Math.min(W, H) * 0.22;
      const pulse = 0.5 + 0.5 * Math.sin(ts * (0.0019 + d * 0.0007) + (hue1 * 0.01));
      const r = baseR * (0.98 + pulse * (0.05 + e * 0.05));

      // Background bloom
      ctx.globalCompositeOperation = "source-over";
      const bg = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 3.2);
      bg.addColorStop(0, `hsla(${hue1}, 95%, 68%, ${0.14 + e * 0.10})`);
      bg.addColorStop(0.45, `hsla(${hue2}, 95%, 65%, ${0.10 + d * 0.10})`);
      bg.addColorStop(0.78, `hsla(${hue3}, 95%, 62%, ${0.06 + e * 0.08})`);
      bg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 3.2, 0, Math.PI * 2);
      ctx.fill();

      // Particles (premium subtle)
      ctx.globalCompositeOperation = "lighter";
      for (const p of particles) {
        p.y -= (p.s * (0.10 + e * 0.25)) * (dt / 16);
        p.x += Math.sin(ts * 0.0006 + p.h * 9) * 0.00035 * (dt / 16);
        if (p.y < -0.05) {
          p.y = 1.05;
          p.x = Math.random();
        }

        const px = p.x * W;
        const py = p.y * H;

        const ph = lerp(hue1, hue2, (p.h + d * 0.35) % 1);
        const a = p.a * (0.45 + e * 0.65);

        ctx.fillStyle = `hsla(${ph}, 95%, 70%, ${a})`;
        ctx.beginPath();
        ctx.arc(px, py, p.r * (0.85 + pulse * 0.20), 0, Math.PI * 2);
        ctx.fill();
      }

      // Orb core (tightness from focus)
      ctx.globalCompositeOperation = "source-over";
      const tight = lerp(0.88, 0.62, f); // higher focus => tighter core
      const gCore = ctx.createRadialGradient(cx - r * 0.20, cy - r * 0.25, r * 0.12, cx, cy, r);
      gCore.addColorStop(0, `hsla(${hue1}, 95%, 86%, ${0.70})`);
      gCore.addColorStop(tight, `hsla(${hue2}, 95%, 68%, ${0.22 + e * 0.22})`);
      gCore.addColorStop(1, `hsla(${hue3}, 90%, 42%, ${0.10})`);

      ctx.fillStyle = gCore;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Rim ring (iridescent)
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = Math.max(1.2, r * 0.075);
      const ringA = 0.12 + e * 0.18;
      const ringGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      ringGrad.addColorStop(0, `hsla(${hue1}, 95%, 72%, ${ringA})`);
      ringGrad.addColorStop(0.5, `hsla(${hue2}, 95%, 70%, ${ringA * 0.92})`);
      ringGrad.addColorStop(1, `hsla(${hue3}, 95%, 68%, ${ringA * 0.85})`);
      ctx.strokeStyle = ringGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.06, 0, Math.PI * 2);
      ctx.stroke();

      // Specular highlight
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `rgba(255,255,255,${0.08 + e * 0.10})`;
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.25, cy - r * 0.35, r * 0.40, r * 0.28, -0.65, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    }

    function start() {
      if (!raf) raf = requestAnimationFrame(draw);
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    window.addEventListener("resize", () => {
      // refresh particles a bit on resize
      resetParticles();
    }, { passive: true });

    return { start, stop };
  }

  // ===== Boot =====
  function boot() {
    injectCSS();
    if (!ensureAuraTab()) return;

    wireTabs();

    // Initial palette
    state.seed = `${state.artist} — ${state.track}`;
    state.palette = paletteFromSeed(state.seed);
    applyPaletteCSS();
    setBars();
    syncNowFromDOM();

    // Poll DOM now-info
    setInterval(syncNowFromDOM, NOW_POLL_MS);

    // Poll signals
    pollSignals();
    setInterval(pollSignals, SIGNALS_POLL_MS);

    // Start orb renderer
    const orb = makeOrbRenderer();
    if (orb) orb.start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
