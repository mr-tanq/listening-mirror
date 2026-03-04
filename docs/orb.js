/* Listening Mirror — orb.js (FULL FILE REPLACE)
   - Injects a "Listening Soul" Orb inside .glyph (Canvas 2D)
   - Subtle color mood (no Spotify needed): derived from intensity/energy/focus/discovery
   - Tap/press shows a tiny popup (minimal words)
     • Quick tap => stays briefly (grace) then auto-hides
     • Press/hold => stays while holding, hides on release/outside
   - No changes to app.js behavior
*/

(() => {
  "use strict";

  const API_BASE = "https://i.errtanq9.workers.dev";

  const POLL_MS = 15_000;
  const TOP_POLL_MS = 60_000;

  const RECENT_LIMIT = 20;
  const TOP_ARTISTS_LIMIT = 10;

  // Popup timings (mobile-friendly)
  const TAP_GRACE_MS = 900;  // quick tap keeps popup visible a moment
  const PRESS_THRESHOLD_MS = 180; // treat as press if held beyond this

  // Motion / perf caps
  const MAX_DPR = 2.25;
  const MAX_PARTICLES = 28;

  const $ = (sel, root = document) => root.querySelector(sel);

  function absApi(urlOrPath) {
    if (!urlOrPath) return "";
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
    if (urlOrPath.startsWith("/")) return API_BASE + urlOrPath;
    return API_BASE + "/" + urlOrPath;
  }

  async function apiGet(path) {
    const url = absApi(path);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const s = (v) => (v == null ? "" : String(v));

  // ---------- Target ----------
  const glyph = $(".glyph");
  if (!glyph) return;

  // Style safety (no CSS file edits needed)
  glyph.style.position = "relative";
  glyph.style.overflow = "hidden";
  glyph.style.cursor = "pointer";
  glyph.style.touchAction = "manipulation";

  // Canvas
  const c = document.createElement("canvas");
  c.setAttribute("aria-hidden", "true");
  c.style.position = "absolute";
  c.style.inset = "0";
  c.style.width = "100%";
  c.style.height = "100%";
  c.style.display = "block";
  c.style.pointerEvents = "none";
  glyph.appendChild(c);

  const ctx = c.getContext("2d", { alpha: true });
  if (!ctx) return;

  // Reduced motion
  const prefersReducedMotion = (() => {
    try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch { return false; }
  })();

  // HiDPI + resize tracking (window resize + element resize)
  let _dpr = 1;
  function resizeCanvas() {
    const r = glyph.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(MAX_DPR, window.devicePixelRatio || 1));
    _dpr = dpr;

    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas, { passive: true });

  let ro = null;
  try {
    ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(glyph);
  } catch {
    // ok: ResizeObserver not available
  }

  // ---------- Popup (injected) ----------
  const style = document.createElement("style");
  style.textContent = `
    .lmOrbPop{
      position: fixed;
      z-index: 9999;
      min-width: 210px;
      max-width: 260px;
      padding: 10px 11px;
      border-radius: 14px;
      background: rgba(20,22,26,.88);
      outline: 1px solid rgba(255,255,255,.12);
      box-shadow: 0 18px 55px rgba(0,0,0,.55);
      color: rgba(255,255,255,.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      transform: translateY(6px);
      opacity: 0;
      pointer-events: none;
      transition: opacity .14s ease, transform .14s ease;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
    }
    .lmOrbPop.on{
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    .lmOrbPop .t{
      font-size: 12px;
      font-weight: 750;
      letter-spacing: .3px;
      margin: 0 0 6px 0;
      color: rgba(255,255,255,.92);
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
    }
    .lmOrbPop .dot{
      width:10px;height:10px;border-radius:999px;
      outline:1px solid rgba(255,255,255,.18);
      box-shadow: 0 10px 22px rgba(0,0,0,.35);
      flex:0 0 auto;
    }
    .lmOrbPop .r{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      font-size: 11px;
      letter-spacing: .2px;
      color: rgba(255,255,255,.70);
      padding: 4px 0;
      border-top: 1px solid rgba(255,255,255,.06);
    }
    .lmOrbPop .r:first-of-type{ border-top: 0; padding-top: 2px; }
    .lmOrbPop .k{ color: rgba(255,255,255,.82); }
    .lmOrbPop .v{ color: rgba(255,255,255,.92); font-weight: 700; }
    .lmOrbPop .hint{
      margin-top: 7px;
      font-size: 10.5px;
      color: rgba(255,255,255,.55);
      letter-spacing: .25px;
    }
  `;
  document.head.appendChild(style);

  const pop = document.createElement("div");
  pop.className = "lmOrbPop";
  pop.innerHTML = `
    <div class="t">
      <span>Orb</span>
      <span class="dot" data-dot="1"></span>
    </div>
    <div class="r"><span class="k">Intensity</span><span class="v" data-v="i">—</span></div>
    <div class="r"><span class="k">Energy</span><span class="v" data-v="e">—</span></div>
    <div class="r"><span class="k">Focus</span><span class="v" data-v="f">—</span></div>
    <div class="r"><span class="k">Discovery</span><span class="v" data-v="d">—</span></div>
    <div class="hint">Tap = peek • Hold = stay</div>
  `;
  document.body.appendChild(pop);

  const vI = pop.querySelector('[data-v="i"]');
  const vE = pop.querySelector('[data-v="e"]');
  const vF = pop.querySelector('[data-v="f"]');
  const vD = pop.querySelector('[data-v="d"]');
  const dot = pop.querySelector('[data-dot="1"]');

  function pct(x) {
    return `${Math.round(clamp01(x) * 100)}%`;
  }

  function positionPop() {
    const r = glyph.getBoundingClientRect();
    const pad = 10;
    const w = pop.offsetWidth || 240;
    const h = pop.offsetHeight || 120;

    // Prefer below-right, but keep inside viewport
    let left = r.left + r.width + 10;
    let top = r.top + (r.height * 0.5) - (h * 0.5);

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (left + w + pad > vw) left = r.left - w - 10;
    left = Math.max(pad, Math.min(vw - w - pad, left));

    if (top + h + pad > vh) top = vh - h - pad;
    if (top < pad) top = pad;

    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  let popTapTimer = null;
  let pressTimer = null;
  let isPress = false;
  let pointerDownAt = 0;

  function showPop() {
    positionPop();
    pop.classList.add("on");
  }

  function hidePop() {
    pop.classList.remove("on");
    if (popTapTimer) { clearTimeout(popTapTimer); popTapTimer = null; }
  }

  // Hide when click outside
  document.addEventListener("pointerdown", (e) => {
    if (!pop.classList.contains("on")) return;
    const t = e.target;
    if (t === glyph || glyph.contains(t)) return;
    if (t === pop || pop.contains(t)) return;
    hidePop();
  }, { passive: true });

  // Press behavior:
  // - On pointerdown: show immediately, start press timer
  // - On pointerup quickly: keep for TAP_GRACE_MS then hide
  // - On press/hold: hide on release
  glyph.addEventListener("pointerdown", (e) => {
    pointerDownAt = performance.now();
    isPress = false;

    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { isPress = true; }, PRESS_THRESHOLD_MS);

    showPop();

    // Avoid accidental text selection on long press
    try { glyph.setPointerCapture(e.pointerId); } catch {}
  }, { passive: true });

  glyph.addEventListener("pointerup", () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }

    const held = performance.now() - pointerDownAt;
    if (!isPress && held < PRESS_THRESHOLD_MS + 40) {
      // quick tap: grace peek
      if (popTapTimer) clearTimeout(popTapTimer);
      popTapTimer = setTimeout(() => hidePop(), TAP_GRACE_MS);
    } else {
      hidePop();
    }
  }, { passive: true });

  glyph.addEventListener("pointercancel", () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    hidePop();
  }, { passive: true });

  glyph.addEventListener("pointerleave", () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    // Only hide if holding/press; for tap-peek let grace finish
    if (isPress) hidePop();
  }, { passive: true });

  // ---------- Orb State ----------
  const orb = {
    intensity: 0.35, energy: 0.25, focus: 0.45, discovery: 0.25,
    tIntensity: 0.35, tEnergy: 0.25, tFocus: 0.45, tDiscovery: 0.25,

    topArtists: [],
    nowLive: false,
    lastFetchOk: true,

    // visual dynamics
    hue: 220,      // current hue
    tHue: 220,     // target hue
    flare: 0,      // micro beat flare
    tFlare: 0,
  };

  function easeTo(current, target, k) {
    return current + (target - current) * k;
  }

  function computeFromHistory(items, topArtists) {
    const n = Array.isArray(items) ? items.length : 0;
    if (!n) {
      return { intensity: 0.18, energy: 0.18, focus: 0.25, discovery: 0.18 };
    }

    const trackKeys = new Set();
    const artists = [];
    for (const it of items) {
      const a = s(it.artist).trim();
      const name = s(it.name).trim();
      trackKeys.add((a + " — " + name).toLowerCase());
      if (a) artists.push(a);
    }

    const uniqueTrackRatio = clamp01(trackKeys.size / Math.min(RECENT_LIMIT, Math.max(1, n)));

    let changes = 0;
    for (let i = 1; i < artists.length; i++) {
      if (artists[i] && artists[i - 1] && artists[i] !== artists[i - 1]) changes++;
    }
    const changeRatio = artists.length > 1 ? clamp01(changes / (artists.length - 1)) : 0;

    let longestRun = 1;
    let run = 1;
    for (let i = 1; i < artists.length; i++) {
      if (artists[i] && artists[i - 1] && artists[i] === artists[i - 1]) {
        run++;
        longestRun = Math.max(longestRun, run);
      } else {
        run = 1;
      }
    }
    const focusRatio = clamp01(longestRun / Math.min(6, Math.max(1, artists.length)));

    const topSet = new Set((topArtists || []).map(x => x.toLowerCase()));
    const recentArtistSet = new Set(artists.map(x => x.toLowerCase()));
    let overlap = 0;
    for (const a of recentArtistSet) if (topSet.has(a)) overlap++;

    const overlapRatio = recentArtistSet.size ? clamp01(overlap / recentArtistSet.size) : 0;
    const discoveryRatio = clamp01(1 - overlapRatio);

    const intensity = clamp01(0.22 + uniqueTrackRatio * 0.65);
    const energy = clamp01(0.18 + changeRatio * 0.70);
    const focus = clamp01(0.22 + focusRatio * 0.70);
    const discovery = clamp01(0.15 + discoveryRatio * 0.80);

    return { intensity, energy, focus, discovery };
  }

  // Mood hue mapping (subtle, stable, no Spotify)
  // - energy -> warmer (red/orange)
  // - focus  -> cooler (blue/indigo)
  // - discovery -> cosmic (violet/cyan)
  // - intensity -> brightness handled separately
  function computeHue(intensity, energy, focus, discovery, nowLive) {
    // anchor hues
    const H_FOCUS = 218;     // deep blue
    const H_DISCOVERY = 285; // cosmic violet
    const H_ENERGY = 18;     // warm ember
    const H_NEUTRAL = 210;   // steel blue

    // weights: keep subtle, avoid wild jumping
    const wFocus = 0.42 + focus * 0.25;
    const wDisc  = 0.24 + discovery * 0.18;
    const wEner  = 0.18 + energy * 0.28;
    const wNeut  = 0.22;

    const sum = (wFocus + wDisc + wEner + wNeut) || 1;

    // circular hue blend via vector sum
    function v(h, w) {
      const a = (h % 360) * Math.PI / 180;
      return { x: Math.cos(a) * w, y: Math.sin(a) * w };
    }
    const a = v(H_FOCUS, wFocus);
    const b = v(H_DISCOVERY, wDisc);
    const d = v(H_ENERGY, wEner);
    const n = v(H_NEUTRAL, wNeut);

    const x = (a.x + b.x + d.x + n.x) / sum;
    const y = (a.y + b.y + d.y + n.y) / sum;

    let hue = (Math.atan2(y, x) * 180 / Math.PI);
    if (hue < 0) hue += 360;

    // live nudges slightly toward vibrant
    if (nowLive) hue = (hue + 6) % 360;

    // clamp to a tasteful range that fits your UI (avoid green-ish)
    // Wrap-safe clamp: if hue in (90..165) push toward 170 (teal/blue)
    if (hue > 90 && hue < 165) hue = 170;

    return hue;
  }

  async function refreshTopArtists() {
    try {
      const j = await apiGet(`/api/top?type=artists&period=week&limit=${TOP_ARTISTS_LIMIT}`);
      if (j?.ok && Array.isArray(j.items)) {
        orb.topArtists = j.items.map(it => s(it.name).trim()).filter(Boolean);
      }
      orb.lastFetchOk = true;
    } catch {
      orb.lastFetchOk = false;
    }
  }

  async function refreshNowAndHistory() {
    try {
      const [nowJ, histJ] = await Promise.all([
        apiGet("/api/now"),
        apiGet(`/api/history?limit=${RECENT_LIMIT}`),
      ]);

      orb.lastFetchOk = true;

      const nowItem = nowJ?.ok ? (nowJ.item || null) : null;
      orb.nowLive = !!nowItem;

      const items =
        (histJ?.ok && Array.isArray(histJ.items) && histJ.items) ||
        (histJ?.ok && Array.isArray(histJ.history) && histJ.history) ||
        [];

      const m = computeFromHistory(items, orb.topArtists);

      const liveBoost = orb.nowLive ? 0.10 : 0.0;

      orb.tIntensity = clamp01(m.intensity + liveBoost);
      orb.tEnergy = clamp01(m.energy + (orb.nowLive ? 0.12 : 0.0));
      orb.tFocus = clamp01(m.focus + (orb.nowLive ? 0.05 : 0.0));
      orb.tDiscovery = clamp01(m.discovery);

      // update mood hue target
      orb.tHue = computeHue(orb.tIntensity, orb.tEnergy, orb.tFocus, orb.tDiscovery, orb.nowLive);

      // micro flare target: feels like "beat ticks" without audio
      // (More energy => more frequent / slightly stronger ticks)
      orb.tFlare = clamp01(0.08 + orb.tEnergy * 0.32 + (orb.nowLive ? 0.06 : 0.0));

      // Update popup values
      if (vI) vI.textContent = pct(orb.tIntensity);
      if (vE) vE.textContent = pct(orb.tEnergy);
      if (vF) vF.textContent = pct(orb.tFocus);
      if (vD) vD.textContent = pct(orb.tDiscovery);

    } catch {
      orb.lastFetchOk = false;
      orb.nowLive = false;
      orb.tIntensity = 0.18;
      orb.tEnergy = 0.16;
      orb.tFocus = 0.22;
      orb.tDiscovery = 0.12;
      orb.tHue = computeHue(orb.tIntensity, orb.tEnergy, orb.tFocus, orb.tDiscovery, false);
      orb.tFlare = 0.10;

      if (vI) vI.textContent = pct(orb.tIntensity);
      if (vE) vE.textContent = pct(orb.tEnergy);
      if (vF) vF.textContent = pct(orb.tFocus);
      if (vD) vD.textContent = pct(orb.tDiscovery);
    }
  }

  // ---------- Visual ----------
  const particles = [];
  function spawnParticle(hue, r, cx, cy) {
    const w = glyph.clientWidth || 22;
    const h = glyph.clientHeight || 22;

    const ang = Math.random() * Math.PI * 2;
    const rr = (Math.random() * 0.48 + 0.12) * Math.min(w, h) * 0.5;

    const x = cx + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr;

    // orbit-ish velocity around center
    const tang = ang + Math.PI * 0.5;
    const spin = (0.35 + orb.energy * 0.65) * (Math.random() < 0.5 ? -1 : 1);
    const vx = Math.cos(tang) * spin * 0.55 + (Math.random() - 0.5) * 0.12;
    const vy = Math.sin(tang) * spin * 0.55 + (Math.random() - 0.5) * 0.12;

    particles.push({
      x, y,
      vx, vy,
      life: 1,
      size: Math.random() * 0.85 + 0.55,
      hue: hue,
      // slight outward drift for "nebula dust"
      drift: (Math.random() * 0.18 + 0.06) * (Math.random() < 0.5 ? -1 : 1),
    });

    if (particles.length > MAX_PARTICLES) particles.shift();
  }

  function hsla(h, s, l, a) {
    return `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${a})`;
  }

  // Micro-tick oscillator (beat feel)
  let lastTickAt = performance.now();
  function tickValue(now) {
    const e = orb.energy;
    const baseBpm = 46 + e * 96; // 46..142
    const period = 60_000 / baseBpm;

    // fire a tick roughly each period, with slight random wobble
    if (now - lastTickAt > period * (0.85 + Math.random() * 0.30)) {
      lastTickAt = now;
      return 1;
    }
    return 0;
  }

  function draw(now) {
    const w = glyph.clientWidth || 22;
    const h = glyph.clientHeight || 22;

    // Smooth state
    orb.intensity = easeTo(orb.intensity, orb.tIntensity, 0.08);
    orb.energy = easeTo(orb.energy, orb.tEnergy, 0.08);
    orb.focus = easeTo(orb.focus, orb.tFocus, 0.08);
    orb.discovery = easeTo(orb.discovery, orb.tDiscovery, 0.08);
    orb.hue = easeTo(orb.hue, orb.tHue, 0.06);

    // flare: decays, spikes on tick
    orb.flare = easeTo(orb.flare, 0, 0.11);
    const tick = prefersReducedMotion ? 0 : tickValue(now);
    if (tick) orb.flare = clamp01(orb.flare + orb.tFlare * 0.85);

    // dimensions
    const cx = w * 0.5;
    const cy = h * 0.5;

    // Orb size (bigger fill)
    const baseR = Math.min(w, h) * 0.355;
    const breatheSpd = 0.72 + orb.energy * 1.9;
    const breatheAmt = (prefersReducedMotion ? 0.02 : (0.05 + orb.intensity * 0.10));
    const breathe = 1 + Math.sin(now * 0.001 * breatheSpd) * breatheAmt;

    // micro flare bump
    const flareBump = 1 + orb.flare * (0.06 + orb.energy * 0.06);
    const r = baseR * (0.86 + orb.intensity * 0.62) * breathe * flareBump;

    // tastefully subtle saturation/lightness
    const sat = 18 + orb.discovery * 22 + orb.energy * 10;
    const coreLight = 58 + orb.intensity * 12;
    const rimLight = 66 + orb.focus * 10;

    // blur: less blur when focused
    const blur = Math.max(0, Math.min(1.7, (1.55 - orb.focus * 1.25)));
    const flowBlur = prefersReducedMotion ? 0.2 : blur;

    ctx.clearRect(0, 0, w, h);

    // ---------- LAYER 0: faint outer halo (ambient) ----------
    ctx.save();
    const haloR = r * (1.28 + orb.energy * 0.12);
    const halo = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, haloR);
    halo.addColorStop(0.0, hsla(orb.hue, sat, 62, 0.08 + orb.intensity * 0.08));
    halo.addColorStop(0.55, hsla(orb.hue, sat, 55, 0.04 + orb.discovery * 0.06));
    halo.addColorStop(1.0, hsla(orb.hue, sat, 50, 0.0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ---------- LAYER 1: orb body (glass + colored core) ----------
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // core gradient (subtle color)
    const core = ctx.createRadialGradient(cx - r * 0.16, cy - r * 0.18, r * 0.10, cx, cy, r * 1.06);
    core.addColorStop(0.00, hsla(orb.hue, sat + 6, coreLight + 10, 0.42 + orb.intensity * 0.18));
    core.addColorStop(0.36, hsla(orb.hue, sat, coreLight, 0.18 + orb.intensity * 0.12));
    core.addColorStop(0.72, "rgba(255,255,255," + (0.05 + orb.intensity * 0.06) + ")");
    core.addColorStop(1.00, hsla(orb.hue, sat - 2, 50, 0.02));
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, w, h);

    // glass sheen (white)
    const glass = ctx.createRadialGradient(cx - r * 0.30, cy - r * 0.32, r * 0.12, cx, cy, r * 1.10);
    const ga = 0.16 + orb.intensity * 0.20;
    glass.addColorStop(0.00, `rgba(255,255,255,${0.16 + ga})`);
    glass.addColorStop(0.48, `rgba(255,255,255,${0.06 + ga * 0.35})`);
    glass.addColorStop(1.00, `rgba(255,255,255,${0.02 + ga * 0.10})`);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = glass;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;

    // ---------- LAYER 2: flow field (swirl lines) ----------
    const lines = 3 + Math.round(orb.focus * 5);
    ctx.globalAlpha = 0.10 + orb.focus * 0.16;
    ctx.lineWidth = 1;
    ctx.filter = `blur(${flowBlur}px)`;

    // swirl amount grows with discovery
    const swirl = 0.12 + orb.discovery * 0.42;
    const speed = (0.0010 + orb.energy * 0.0012) * (prefersReducedMotion ? 0.5 : 1);

    for (let i = 0; i < lines; i++) {
      const t = now * speed + i * 1.35;
      const wave = Math.sin(t * (1.25 + i * 0.12));
      const wave2 = Math.cos(t * (0.95 + i * 0.08));

      const y0 = cy + wave * r * (0.22 + i * 0.045);
      const x0 = cx + wave2 * r * 0.10;

      // rotate-ish by "swirl"
      const k = swirl * r;
      const dy = (y0 - cy);
      const dx = (x0 - cx);
      const rx = x0 + (-dy) * (swirl * 0.35);
      const ry = y0 + (dx) * (swirl * 0.35);

      const colA = hsla(orb.hue, sat + 10, 70, 1);
      ctx.strokeStyle = colA;

      ctx.beginPath();
      ctx.moveTo(cx - r * 1.18, ry);
      ctx.bezierCurveTo(
        rx - k * 0.42, ry - k * 0.28,
        rx + k * 0.42, ry + k * 0.28,
        cx + r * 1.18, ry
      );
      ctx.stroke();
    }

    ctx.filter = "none";
    ctx.globalAlpha = 1;

    // ---------- LAYER 3: rim + specular ----------
    // rim
    ctx.globalAlpha = 0.18 + orb.intensity * 0.20 + orb.flare * 0.10;
    ctx.strokeStyle = hsla(orb.hue, sat - 2, rimLight, 1);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // inner rim (adds depth)
    ctx.globalAlpha = 0.10 + orb.focus * 0.12;
    ctx.strokeStyle = "rgba(255,255,255,1)";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
    ctx.stroke();

    // specular highlight (white)
    ctx.globalAlpha = 0.20 + orb.focus * 0.30;
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.beginPath();
    ctx.arc(cx - r * 0.30, cy - r * 0.32, Math.max(0.9, r * (0.13 + orb.flare * 0.02)), 0, Math.PI * 2);
    ctx.fill();

    // tiny second highlight (color)
    ctx.globalAlpha = 0.10 + orb.discovery * 0.12;
    ctx.fillStyle = hsla(orb.hue, sat + 18, 72, 1);
    ctx.beginPath();
    ctx.arc(cx - r * 0.08, cy - r * 0.14, Math.max(0.6, r * 0.06), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // ---------- Star dust / sparks (orbiting) ----------
    // spawn rate tied to discovery + live
    const sparkRate = (prefersReducedMotion ? 0.02 : (0.06 + orb.discovery * 0.16)) * (orb.nowLive ? 1.25 : 1);
    if (Math.random() < sparkRate) spawnParticle(orb.hue, r, cx, cy);

    // animate particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];

      const decay = 0.030 + orb.energy * 0.020 + (prefersReducedMotion ? 0.010 : 0.0);
      pt.life -= decay;

      // orbit-ish attraction
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const pull = (0.002 + orb.focus * 0.003) * (r / dist);

      pt.vx += (-dx / dist) * pull + (-dy / dist) * (pt.drift * 0.0006);
      pt.vy += (-dy / dist) * pull + ( dx / dist) * (pt.drift * 0.0006);

      pt.x += pt.vx;
      pt.y += pt.vy;

      if (pt.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      const a = pt.life * (0.14 + orb.discovery * 0.28) + orb.flare * 0.06;
      ctx.globalAlpha = a;

      // subtle colored dust + white sparkle core
      ctx.fillStyle = hsla(pt.hue, 22 + orb.discovery * 24, 70, 1);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = a * 0.65;
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.beginPath();
      ctx.arc(pt.x + 0.25, pt.y - 0.15, Math.max(0.5, pt.size * 0.55), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ---------- Offline dim ----------
    if (!orb.lastFetchOk) {
      ctx.globalAlpha = 0.40;
      ctx.fillStyle = "rgba(0,0,0,0.30)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // Update popup dot color (subtle)
    if (dot) {
      dot.style.background = hsla(orb.hue, 28 + orb.discovery * 18, 62 + orb.intensity * 8, 1);
    }

    requestAnimationFrame(draw);
  }

  // ---------- Start ----------
  refreshTopArtists().finally(() => {
    refreshNowAndHistory().finally(() => {
      requestAnimationFrame(draw);
    });
  });

  let pollTimer = setInterval(refreshNowAndHistory, POLL_MS);
  let topTimer = setInterval(refreshTopArtists, TOP_POLL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInterval(pollTimer);
      clearInterval(topTimer);
      hidePop();
    } else {
      refreshTopArtists();
      refreshNowAndHistory();
      pollTimer = setInterval(refreshNowAndHistory, POLL_MS);
      topTimer = setInterval(refreshTopArtists, TOP_POLL_MS);
    }
  }, { passive: true });

})();
