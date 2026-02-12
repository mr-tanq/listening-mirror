/* Listening Mirror — orb.js (FULL REPLACE)
   - ZERO changes to app.js logic
   - Injects a 4D "Orb" inside the existing .glyph (top-left)
   - No words. Pure visual indicator.
   - Reads data from the same Worker endpoints:
       /api/now
       /api/history?limit=20
       /api/top?type=artists&period=week&limit=10  (lightweight, for "discovery")
*/

(() => {
  "use strict";

  // Same base as your app.js
  const API_BASE = "https://i.errtanq9.workers.dev";

  // Polling
  const POLL_MS = 15_000;      // history/now refresh
  const TOP_POLL_MS = 60_000;  // top artists refresh

  // Limits
  const RECENT_LIMIT = 20;
  const TOP_ARTISTS_LIMIT = 10;

  // ---------- Helpers ----------
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

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  // String safe (worker returns sometimes empty)
  function s(v) {
    return (v == null) ? "" : String(v);
  }

  // ---------- Find target (existing dot) ----------
  const glyph = $(".glyph");
  if (!glyph) return;

  // Make sure we can place canvas cleanly without touching CSS files
  glyph.style.position = "relative";
  glyph.style.overflow = "hidden";

  // Inject canvas
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

  // ---------- Orb State (4 dimensions) ----------
  // D1 Intensity: how "full" the orb is (size/brightness)
  // D2 Energy: pulse speed
  // D3 Focus: sharpness / coherence
  // D4 Discovery: particle sparks
  const orb = {
    intensity: 0.35,
    energy: 0.25,
    focus: 0.45,
    discovery: 0.25,

    // smooth targets
    tIntensity: 0.35,
    tEnergy: 0.25,
    tFocus: 0.45,
    tDiscovery: 0.25,

    // data caches
    topArtists: [],
    nowLive: false,
    lastFetchOk: true,
  };

  // Smooth step towards target
  function easeTo(current, target, k) {
    return current + (target - current) * k;
  }

  // ---------- Metrics from endpoints ----------
  function computeFromHistory(items, topArtists) {
    const n = Array.isArray(items) ? items.length : 0;
    if (!n) {
      return {
        intensity: 0.18,
        energy: 0.18,
        focus: 0.25,
        discovery: 0.18,
      };
    }

    // Unique tracks (artist+name)
    const trackKeys = new Set();
    const artists = [];
    for (const it of items) {
      const a = s(it.artist).trim();
      const name = s(it.name).trim();
      trackKeys.add((a + " — " + name).toLowerCase());
      if (a) artists.push(a);
    }

    const uniqueTrackRatio = clamp01(trackKeys.size / Math.min(RECENT_LIMIT, Math.max(1, n)));

    // Energy: how often artist changes from row to row
    let changes = 0;
    for (let i = 1; i < artists.length; i++) {
      if (artists[i] && artists[i - 1] && artists[i] !== artists[i - 1]) changes++;
    }
    const changeRatio = artists.length > 1 ? clamp01(changes / (artists.length - 1)) : 0;

    // Focus: longest run of same artist at the top of the list
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
    const focusRatio = clamp01(longestRun / Math.min(6, Math.max(1, artists.length))); // cap makes it responsive

    // Discovery: how many recent artists are NOT in weekly top artists
    const topSet = new Set((topArtists || []).map(x => x.toLowerCase()));
    const recentArtistSet = new Set(artists.map(x => x.toLowerCase()));
    let overlap = 0;
    for (const a of recentArtistSet) if (topSet.has(a)) overlap++;

    const overlapRatio = recentArtistSet.size ? clamp01(overlap / recentArtistSet.size) : 0;
    const discoveryRatio = clamp01(1 - overlapRatio);

    // Map into orb dimensions (tuned for “premium subtle”)
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
      // keep old topArtists; don't kill the orb
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

      // NOW live
      const nowItem = nowJ?.ok ? (nowJ.item || null) : null;
      orb.nowLive = !!nowItem;

      const items =
        (histJ?.ok && Array.isArray(histJ.items) && histJ.items) ||
        (histJ?.ok && Array.isArray(histJ.history) && histJ.history) ||
        [];

      const m = computeFromHistory(items, orb.topArtists);

      // Bias: if LIVE, the orb is more “awake”
      const liveBoost = orb.nowLive ? 0.10 : 0.0;

      orb.tIntensity = clamp01(m.intensity + liveBoost);
      orb.tEnergy = clamp01(m.energy + (orb.nowLive ? 0.12 : 0.0));
      orb.tFocus = clamp01(m.focus + (orb.nowLive ? 0.05 : 0.0));
      orb.tDiscovery = clamp01(m.discovery);

    } catch {
      // If fetch fails, go calmer but keep movement
      orb.lastFetchOk = false;
      orb.nowLive = false;
      orb.tIntensity = 0.18;
      orb.tEnergy = 0.16;
      orb.tFocus = 0.22;
      orb.tDiscovery = 0.12;
    }
  }

  // ---------- Visual (4D orb) ----------
  // We keep it high-end: subtle, no neon, no “gamey” look.
  // We use a soft, glassy orb with:
  // - coherent inner flow (focus)
  // - pulse speed (energy)
  // - fill/brightness (intensity)
  // - spark particles (discovery)
  const particles = [];
  function spawnParticle() {
    const w = glyph.clientWidth || 16;
    const h = glyph.clientHeight || 16;
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
    const w = glyph.clientWidth || 16;
    const h = glyph.clientHeight || 16;

    // smooth towards targets
    orb.intensity = easeTo(orb.intensity, orb.tIntensity, 0.08);
    orb.energy = easeTo(orb.energy, orb.tEnergy, 0.08);
    orb.focus = easeTo(orb.focus, orb.tFocus, 0.08);
    orb.discovery = easeTo(orb.discovery, orb.tDiscovery, 0.08);

    // orb geometry
    const cx = w * 0.5;
    const cy = h * 0.5;
    const baseR = Math.min(w, h) * 0.30;
    const r = baseR * (0.85 + orb.intensity * 0.55);

    // energy controls pulse
    const pulseSpd = 0.9 + orb.energy * 2.2;
    const pulse = 0.06 + orb.intensity * 0.10;
    const p = 1 + Math.sin(t * 0.001 * pulseSpd) * pulse;

    // focus controls sharpness (less blur)
    const blur = 1.8 - orb.focus * 1.2; // 1.8 -> 0.6

    // clear
    ctx.clearRect(0, 0, w, h);

    // Outer glass
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * p, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // Inner flow (fake “4D” by mixing 2 sinus fields)
    const g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.15, cx, cy, r * 1.05);
    const a = 0.22 + orb.intensity * 0.35;
    g.addColorStop(0.00, `rgba(255,255,255,${0.18 + a})`);
    g.addColorStop(0.45, `rgba(255,255,255,${0.06 + a * 0.35})`);
    g.addColorStop(1.00, `rgba(255,255,255,${0.02 + a * 0.10})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Flow lines (coherence = focus)
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

    // Specular dot
    ctx.globalAlpha = 0.22 + orb.focus * 0.28;
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.beginPath();
    ctx.arc(cx - r * 0.28, cy - r * 0.30, Math.max(0.8, r * 0.14), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Discovery sparks (outside clip but still inside glyph)
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

    // If offline, “dim” slightly (no words, just subtle)
    if (!orb.lastFetchOk) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "rgba(0,0,0,0.30)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    requestAnimationFrame(draw);
  }

  // ---------- Start loops ----------
  // Initial fetches
  refreshTopArtists().finally(() => {
    refreshNowAndHistory().finally(() => {
      // start animation once we have something
      requestAnimationFrame(draw);
    });
  });

  // Timers
  let pollTimer = setInterval(refreshNowAndHistory, POLL_MS);
  let topTimer = setInterval(refreshTopArtists, TOP_POLL_MS);

  // Visibility: don’t waste resources when hidden, and refresh on return
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInterval(pollTimer);
      clearInterval(topTimer);
    } else {
      refreshTopArtists();
      refreshNowAndHistory();
      pollTimer = setInterval(refreshNowAndHistory, POLL_MS);
      topTimer = setInterval(refreshTopArtists, TOP_POLL_MS);
    }
  }, { passive: true });

})();