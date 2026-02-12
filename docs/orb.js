/* Listening Mirror — orb.js (FULL REPLACE)
   - Injects a 4D Orb inside .glyph
   - Tap/press shows a tiny popup (minimal words), auto-hides when not touching / click outside
   - NO changes to app.js behavior
*/

(() => {
  "use strict";

  const API_BASE = "https://i.errtanq9.workers.dev";

  const POLL_MS = 15_000;
  const TOP_POLL_MS = 60_000;

  const RECENT_LIMIT = 20;
  const TOP_ARTISTS_LIMIT = 10;

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

  // HiDPI
  function resizeCanvas() {
    const r = glyph.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas, { passive: true });

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
    <div class="t">Orb</div>
    <div class="r"><span class="k">Intensity</span><span class="v" data-v="i">—</span></div>
    <div class="r"><span class="k">Energy</span><span class="v" data-v="e">—</span></div>
    <div class="r"><span class="k">Focus</span><span class="v" data-v="f">—</span></div>
    <div class="r"><span class="k">Discovery</span><span class="v" data-v="d">—</span></div>
    <div class="hint">Tap = show • Release = hide</div>
  `;
  document.body.appendChild(pop);

  const vI = pop.querySelector('[data-v="i"]');
  const vE = pop.querySelector('[data-v="e"]');
  const vF = pop.querySelector('[data-v="f"]');
  const vD = pop.querySelector('[data-v="d"]');

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

  function showPop() {
    positionPop();
    pop.classList.add("on");
  }

  function hidePop() {
    pop.classList.remove("on");
  }

  // Hide when click outside
  document.addEventListener("pointerdown", (e) => {
    if (!pop.classList.contains("on")) return;
    const t = e.target;
    if (t === glyph || glyph.contains(t)) return;
    if (t === pop || pop.contains(t)) return;
    hidePop();
  }, { passive: true });

  // Press behavior: show on down, hide on up/leave
  glyph.addEventListener("pointerdown", () => {
    showPop();
  }, { passive: true });

  glyph.addEventListener("pointerup", () => {
    hidePop();
  }, { passive: true });

  glyph.addEventListener("pointercancel", () => {
    hidePop();
  }, { passive: true });

  glyph.addEventListener("pointerleave", () => {
    hidePop();
  }, { passive: true });

  // ---------- Orb State ----------
  const orb = {
    intensity: 0.35, energy: 0.25, focus: 0.45, discovery: 0.25,
    tIntensity: 0.35, tEnergy: 0.25, tFocus: 0.45, tDiscovery: 0.25,
    topArtists: [],
    nowLive: false,
    lastFetchOk: true,
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

      // Update popup values (minimal words)
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

      if (vI) vI.textContent = pct(orb.tIntensity);
      if (vE) vE.textContent = pct(orb.tEnergy);
      if (vF) vF.textContent = pct(orb.tFocus);
      if (vD) vD.textContent = pct(orb.tDiscovery);
    }
  }

  // ---------- Visual ----------
  const particles = [];
  function spawnParticle() {
    const w = glyph.clientWidth || 22;
    const h = glyph.clientHeight || 22;
    const cx = w * 0.5;
    const cy = h * 0.5;

    const ang = Math.random() * Math.PI * 2;
    const r = (Math.random() * 0.45 + 0.15) * Math.min(w, h);
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;

    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      life: 1,
      size: Math.random() * 0.9 + 0.6,
    });

    if (particles.length > 18) particles.shift();
  }

  function draw(t) {
    const w = glyph.clientWidth || 22;
    const h = glyph.clientHeight || 22;

    orb.intensity = easeTo(orb.intensity, orb.tIntensity, 0.08);
    orb.energy = easeTo(orb.energy, orb.tEnergy, 0.08);
    orb.focus = easeTo(orb.focus, orb.tFocus, 0.08);
    orb.discovery = easeTo(orb.discovery, orb.tDiscovery, 0.08);

    const cx = w * 0.5;
    const cy = h * 0.5;

    // Slightly bigger orb fill inside the glyph
    const baseR = Math.min(w, h) * 0.34; // ✅ bigger than before
    const r = baseR * (0.85 + orb.intensity * 0.55);

    const pulseSpd = 0.9 + orb.energy * 2.2;
    const pulse = 0.06 + orb.intensity * 0.10;
    const p = 1 + Math.sin(t * 0.001 * pulseSpd) * pulse;

    const blur = 1.8 - orb.focus * 1.2;

    ctx.clearRect(0, 0, w, h);

    // Outer glass
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * p, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.15, cx, cy, r * 1.05);
    const a = 0.22 + orb.intensity * 0.35;
    g.addColorStop(0.00, `rgba(255,255,255,${0.18 + a})`);
    g.addColorStop(0.45, `rgba(255,255,255,${0.06 + a * 0.35})`);
    g.addColorStop(1.00, `rgba(255,255,255,${0.02 + a * 0.10})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Flow lines
    ctx.globalAlpha = 0.12 + orb.focus * 0.14;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,1)";
    ctx.filter = `blur(${blur}px)`;

    const lines = 3 + Math.round(orb.focus * 4);
    for (let i = 0; i < lines; i++) {
      const phase = (t * 0.0012 * (1 + orb.energy * 1.2)) + i * 1.3;
      const y0 = cy + Math.sin(phase) * r * (0.22 + i * 0.04);
      const x0 = cx + Math.cos(phase * 0.9) * r * 0.10;

      ctx.beginPath();
      ctx.moveTo(cx - r * 1.1, y0);
      ctx.bezierCurveTo(
        x0 - r * 0.4, y0 - r * 0.35,
        x0 + r * 0.4, y0 + r * 0.35,
        cx + r * 1.1, y0
      );
      ctx.stroke();
    }

    ctx.filter = "none";
    ctx.globalAlpha = 1;

    // Rim highlight
    ctx.globalAlpha = 0.18 + orb.intensity * 0.22;
    ctx.strokeStyle = "rgba(255,255,255,1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r * p - 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // Specular
    ctx.globalAlpha = 0.22 + orb.focus * 0.28;
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.beginPath();
    ctx.arc(cx - r * 0.28, cy - r * 0.30, Math.max(0.9, r * 0.14), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Sparks
    const sparkRate = orb.discovery * (orb.nowLive ? 0.18 : 0.10);
    if (Math.random() < sparkRate) spawnParticle();

    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.life -= 0.04 + orb.energy * 0.02;
      pt.x += pt.vx;
      pt.y += pt.vy;

      if (pt.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      const alpha = pt.life * (0.18 + orb.discovery * 0.32);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Offline dim
    if (!orb.lastFetchOk) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "rgba(0,0,0,0.30)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
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