/* orb.js (FULL FILE REPLACE)
   Listening Mirror — Header Glyph Orb
   ✅ Injects a premium "Listening Soul" orb inside .glyph (Canvas 2D)
   ✅ NOTICEABLE mood differences (Mono vs Nightstalker vs Metallica etc)
   ✅ 4 signals:
      - Energy (Spotify audio_features.energy)
      - Focus (inverse speechiness + inverse liveness + instrumentalness boost)
      - Discovery (local “first-seen / rarity” cache)
      - Depth (duration + acousticness + instrumentalness)
   ✅ Beat-reactive pulse (tempo BPM) + genre-ish feel from audio features
   ✅ Popup behavior:
      - Tap = toggle (stays open until tap again)
      - Tap outside = closes
      - Press/hold = opens while holding, closes on release (unless toggled open)
   ✅ No app.js changes
*/

(() => {
  "use strict";

  // ---------- Config ----------
  const POPUP_Z = 99999;
  const POLL_PLAYER_MS = 1500;         // how often we read /me/player
  const POLL_FEATURES_MIN_MS = 9000;   // avoid hammering audio-features
  const MAX_DPR = 2.25;

  const PRESS_THRESHOLD_MS = 180;

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  function getToken() {
    if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
      return window.SpotifyAuth.getAccessToken();
    }
    if (window.SpotifyPlayer && typeof window.SpotifyPlayer.getAccessToken === "function") {
      return window.SpotifyPlayer.getAccessToken();
    }
    return null;
  }

  async function spotifyGet(path) {
    const token = getToken();
    if (!token) return null;
    try {
      const res = await fetch(`https://api.spotify.com/v1${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 204) return null;
      const json = await res.json().catch(() => null);
      if (!res.ok) return null;
      return json;
    } catch {
      return null;
    }
  }

  // ---------- Target (.glyph) ----------
  const glyph = $(".glyph");
  if (!glyph) return;

  // Make it bigger + better tap target (without editing index.css)
  // Visual size (orb) ~24px, tap target ~36px.
  glyph.style.width = "24px";
  glyph.style.height = "24px";
  glyph.style.borderRadius = "999px";
  glyph.style.position = "relative";
  glyph.style.overflow = "visible";
  glyph.style.cursor = "pointer";
  glyph.style.touchAction = "manipulation";
  glyph.style.userSelect = "none";

  // Add a larger invisible hit area
  const hit = document.createElement("div");
  hit.style.position = "absolute";
  hit.style.inset = "-6px";
  hit.style.borderRadius = "999px";
  hit.style.background = "transparent";
  hit.style.pointerEvents = "auto";
  glyph.appendChild(hit);

  // Canvas
  const c = document.createElement("canvas");
  c.style.position = "absolute";
  c.style.inset = "0";
  c.style.width = "24px";
  c.style.height = "24px";
  c.style.borderRadius = "999px";
  c.style.pointerEvents = "none";
  glyph.appendChild(c);

  const ctx = c.getContext("2d");

  function setCanvasScale() {
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const px = 24;
    c.width = Math.round(px * dpr);
    c.height = Math.round(px * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setCanvasScale();
  window.addEventListener("resize", setCanvasScale, { passive: true });

  // ---------- Popup ----------
  const popup = document.createElement("div");
  popup.style.position = "fixed";
  popup.style.zIndex = String(POPUP_Z);
  popup.style.minWidth = "240px";
  popup.style.maxWidth = "calc(100vw - 28px)";
  popup.style.padding = "12px 12px";
  popup.style.borderRadius = "16px";
  popup.style.background = "linear-gradient(180deg, rgba(22,24,28,.92), rgba(14,16,19,.92))";
  popup.style.outline = "1px solid rgba(255,255,255,.10)";
  popup.style.boxShadow = "0 22px 70px rgba(0,0,0,.62)";
  popup.style.backdropFilter = "blur(10px)";
  popup.style.webkitBackdropFilter = "blur(10px)";
  popup.style.color = "rgba(255,255,255,.92)";
  popup.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  popup.style.fontSize = "12.5px";
  popup.style.letterSpacing = ".15px";
  popup.style.lineHeight = "1.35";
  popup.style.opacity = "0";
  popup.style.transform = "translateY(-4px) scale(.98)";
  popup.style.transformOrigin = "10px 0";
  popup.style.pointerEvents = "none";
  popup.style.transition = "opacity .14s ease, transform .14s ease";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "Listening Soul");
  document.body.appendChild(popup);

  function setPopupContent(html) {
    popup.innerHTML = html;
  }

  function placePopup() {
    const r = glyph.getBoundingClientRect();
    const gap = 10;
    const x = Math.max(10, Math.min(window.innerWidth - 10, r.left));
    const y = Math.min(window.innerHeight - 10, r.bottom + gap);

    // Default align left with glyph, clamp to viewport once we know width
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;

    // Clamp after layout
    requestAnimationFrame(() => {
      const pr = popup.getBoundingClientRect();
      let left = pr.left;
      let top = pr.top;

      if (pr.right > window.innerWidth - 10) left -= (pr.right - (window.innerWidth - 10));
      if (left < 10) left = 10;

      // If near bottom, flip above
      if (pr.bottom > window.innerHeight - 10) {
        top = r.top - gap - pr.height;
        if (top < 10) top = 10;
      }

      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    });
  }

  let popupOpen = false;     // toggled open
  let holdMode = false;      // opened due to press
  let pressTimer = null;

  function openPopup(mode) {
    // mode: "toggle" | "hold"
    placePopup();
    popup.style.opacity = "1";
    popup.style.transform = "translateY(0) scale(1)";
    popup.style.pointerEvents = "auto";
    if (mode === "hold") holdMode = true;
  }

  function closePopup() {
    popup.style.opacity = "0";
    popup.style.transform = "translateY(-4px) scale(.98)";
    popup.style.pointerEvents = "none";
    holdMode = false;
  }

  function togglePopup() {
    popupOpen = !popupOpen;
    if (popupOpen) openPopup("toggle");
    else closePopup();
  }

  // Tap/hold handling (on hit target)
  hit.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();

    // Setup press detection
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      // Press/hold: open while holding, but do not toggle state
      if (!popupOpen) openPopup("hold");
    }, PRESS_THRESHOLD_MS);
  });

  hit.addEventListener("pointerup", (e) => {
    e.preventDefault();
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;

    // If hold-mode opened and not toggled, close on release
    if (holdMode && !popupOpen) closePopup();
    // If it was a quick tap (no hold), toggle
    if (!holdMode) togglePopup();
  });

  hit.addEventListener("pointercancel", () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
    if (holdMode && !popupOpen) closePopup();
  });

  // Tap outside closes (only if toggled open OR hold open)
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!popupOpen && !holdMode) return;
      if (glyph.contains(e.target) || popup.contains(e.target)) return;
      popupOpen = false;
      closePopup();
    },
    { passive: true }
  );

  // ---------- Visual “mystic labels” ----------
  function labelEnergy(x) {
    if (x < 0.25) return "Low";
    if (x < 0.55) return "Rising";
    if (x < 0.80) return "Hot";
    return "Intense";
  }
  function labelFocus(x) {
    if (x < 0.28) return "Drifting";
    if (x < 0.60) return "Steady";
    if (x < 0.82) return "Locked";
    return "Immersed";
  }
  function labelDiscovery(x) {
    if (x < 0.25) return "Familiar";
    if (x < 0.55) return "Exploring";
    if (x < 0.80) return "Uncharted";
    return "Unknown Paths";
  }
  function labelDepth(x) {
    if (x < 0.25) return "Surface";
    if (x < 0.55) return "Diving";
    if (x < 0.80) return "Deep";
    return "Abyss";
  }

  // ---------- State ----------
  const storeKey = "lm_orb_seen_v1";
  let seen = {};
  try {
    seen = JSON.parse(localStorage.getItem(storeKey) || "{}") || {};
  } catch {
    seen = {};
  }

  function markSeen(trackId) {
    if (!trackId) return 0;
    const v = (seen[trackId] || 0) + 1;
    seen[trackId] = v;
    // Keep small
    const keys = Object.keys(seen);
    if (keys.length > 900) {
      // Drop oldest-ish by count (cheap)
      keys
        .sort((a, b) => (seen[a] || 0) - (seen[b] || 0))
        .slice(0, 150)
        .forEach((k) => delete seen[k]);
    }
    try {
      localStorage.setItem(storeKey, JSON.stringify(seen));
    } catch {}
    return v;
  }

  let lastTrackId = "";
  let lastFeaturesAt = 0;
  let features = null;
  let tempoBpm = 72;

  // 4 signals
  let sigEnergy = 0.15;
  let sigFocus = 0.55;
  let sigDiscovery = 0.20;
  let sigDepth = 0.45;

  // UI state
  let nowTitle = "—";
  let nowArtist = "—";

  function computeSignalsFromFeatures(af, trackMeta) {
    // af: Spotify Audio Features
    if (!af) return;

    const energy = clamp01(Number(af.energy ?? 0));
    const dance = clamp01(Number(af.danceability ?? 0));
    const valence = clamp01(Number(af.valence ?? 0));
    const speech = clamp01(Number(af.speechiness ?? 0));
    const live = clamp01(Number(af.liveness ?? 0));
    const inst = clamp01(Number(af.instrumentalness ?? 0));
    const acoustic = clamp01(Number(af.acousticness ?? 0));
    const dur = clamp01(Number(af.duration_ms ?? 0) / (8 * 60 * 1000)); // 0..~8min scaled
    const tempo = Number(af.tempo ?? 72);

    // 1) Energy (mostly Spotify energy, with small drive from tempo)
    sigEnergy = clamp01(energy * 0.78 + clamp01(tempo / 190) * 0.22);

    // 2) Focus (opposite of speech + liveness, boosted by instrumentalness)
    sigFocus = clamp01((1 - speech) * 0.45 + (1 - live) * 0.30 + inst * 0.25);

    // 3) Discovery (local cache rarity)
    // First time seen => high discovery; repeated => low
    const plays = markSeen(trackMeta?.id || "");
    const rarity = plays <= 1 ? 1 : plays === 2 ? 0.65 : plays === 3 ? 0.45 : 0.25;
    // Nudge up if valence is mid-low and dance is mid (often “new rabbit holes”)
    sigDiscovery = clamp01(rarity * 0.85 + (1 - valence) * 0.10 + (1 - dance) * 0.05);

    // 4) Depth (longer + acoustic + instrumental)
    sigDepth = clamp01(dur * 0.38 + acoustic * 0.30 + inst * 0.32);

    tempoBpm = Number.isFinite(tempo) && tempo > 30 ? tempo : 72;

    // Update popup text whenever we have new data
    renderPopup(trackMeta);
  }

  function moodColor() {
    // Build a premium palette by mixing “base moods”
    // CALM: ice blue | FOCUSED: teal | INTENSE: amber | EXPLORING: ultraviolet
    // Weighting from signals:
    const calm = clamp01(sigDepth * 0.55 + (1 - sigEnergy) * 0.45);
    const intense = clamp01(sigEnergy);
    const focused = clamp01(sigFocus);
    const exploring = clamp01(sigDiscovery);

    // Normalize weights (avoid wash-out)
    const sum = calm + intense + focused + exploring + 1e-6;
    const wc = calm / sum, wi = intense / sum, wf = focused / sum, we = exploring / sum;

    // Colors in RGB
    const C_CALM = [143, 211, 255];   // ice blue
    const C_FOCUS = [ 64, 214, 178];  // teal
    const C_INTENSE = [255, 180,  72];// amber
    const C_EXPLORE = [172, 116, 255];// ultraviolet

    const r = C_CALM[0]*wc + C_FOCUS[0]*wf + C_INTENSE[0]*wi + C_EXPLORE[0]*we;
    const g = C_CALM[1]*wc + C_FOCUS[1]*wf + C_INTENSE[1]*wi + C_EXPLORE[1]*we;
    const b = C_CALM[2]*wc + C_FOCUS[2]*wf + C_INTENSE[2]*wi + C_EXPLORE[2]*we;

    return [r, g, b];
  }

  function renderPopup(trackMeta) {
    const t = (trackMeta?.name || nowTitle || "—").toString();
    const a = (trackMeta?.artist || nowArtist || "—").toString();

    const miniDot = (rgb, glow) => {
      const [r, g, b] = rgb.map((x) => Math.round(x));
      return `
        <span style="
          width:8px;height:8px;border-radius:999px;display:inline-block;
          background: rgb(${r},${g},${b});
          box-shadow: 0 0 0 3px rgba(${r},${g},${b},.14), 0 0 ${glow}px rgba(${r},${g},${b},.25);
          outline:1px solid rgba(255,255,255,.12);
        "></span>
      `;
    };

    const rgb = moodColor();
    const bpm = Math.round(tempoBpm || 0);

    const row = (lbl, val) => `
      <div style="display:flex; justify-content:space-between; gap:10px; padding:6px 0;">
        <div style="color:rgba(255,255,255,.62); font-size:11px; text-transform:uppercase; letter-spacing:.26px;">${lbl}</div>
        <div style="font-weight:760; color:rgba(255,255,255,.92);">${val}</div>
      </div>
    `;

    setPopupContent(`
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
        ${miniDot(rgb, 18)}
        <div style="min-width:0;">
          <div style="font-weight:820; letter-spacing:.2px;">Listening Soul</div>
          <div style="color:rgba(255,255,255,.68); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${t} — ${a}
          </div>
        </div>
        <div style="margin-left:auto; color:rgba(255,255,255,.68); font-weight:750;">
          ${bpm ? `${bpm} BPM` : ""}
        </div>
      </div>

      <div style="border-top:1px solid rgba(255,255,255,.08); padding-top:8px;">
        ${row("Energy", labelEnergy(sigEnergy))}
        ${row("Focus", labelFocus(sigFocus))}
        ${row("Discovery", labelDiscovery(sigDiscovery))}
        ${row("Depth", labelDepth(sigDepth))}
      </div>

      <div style="margin-top:10px; color:rgba(255,255,255,.60); font-size:11px;">
        Tap = toggle • Hold = peek
      </div>
    `);
  }

  // ---------- Drawing ----------
  let rafId = 0;
  let t0 = performance.now();

  // A few particles for “mystic” feel (lightweight)
  const particles = Array.from({ length: 14 }, (_, i) => ({
    a: (i / 14) * Math.PI * 2,
    r: 6 + Math.random() * 3,
    s: 0.35 + Math.random() * 0.85,
    p: Math.random(),
  }));

  function draw(ts) {
    rafId = requestAnimationFrame(draw);

    const dt = (ts - t0) / 1000;
    t0 = ts;

    ctx.clearRect(0, 0, 24, 24);

    const cx = 12, cy = 12;
    const baseR = 11.2;

    // Beat pulse from tempo
    // phase increments in beats/sec
    const bps = clamp01((tempoBpm || 72) / 180) * 2.0 + 0.4; // 0.4..2.4-ish
    const phase = ts / 1000 * bps * Math.PI * 2;

    // Pulse intensity driven by energy (Mono vs Metallica difference)
    const pulseAmp = lerp(0.35, 1.25, sigEnergy);
    const pulse = 1 + Math.sin(phase) * 0.045 * pulseAmp;

    // Color palette from signals
    const [r, g, b] = moodColor();
    const colA = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},`;
    const cold = `rgba(255,255,255,`;

    // Outer glow (stronger when intense + exploring)
    const glow = lerp(6, 14, clamp01(sigEnergy * 0.65 + sigDiscovery * 0.35));
    const gAlpha = lerp(0.10, 0.28, clamp01(sigEnergy * 0.75 + sigDiscovery * 0.25));

    const grdGlow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 12);
    grdGlow.addColorStop(0, `${colA}${gAlpha})`);
    grdGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grdGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();

    // Core body gradient (premium glass)
    const coreR = baseR * pulse;
    const grd = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, coreR);
    const coreAlpha = lerp(0.60, 0.78, sigFocus); // focus makes it “cleaner”
    grd.addColorStop(0, `${cold}${0.22})`);
    grd.addColorStop(0.28, `${colA}${coreAlpha})`);
    grd.addColorStop(1, "rgba(10,12,16,0.90)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();

    // Inner sheen
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const sheen = ctx.createRadialGradient(cx - 3, cy - 4, 1, cx - 1, cy - 2, 9);
    sheen.addColorStop(0, `${cold}${0.18})`);
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 0.98, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Mystic ring (more visible when exploring)
    const ringAlpha = lerp(0.05, 0.22, sigDiscovery);
    ctx.strokeStyle = `${colA}${ringAlpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 8.6 + Math.sin(phase * 0.5) * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // Particles swirl (more when exploring, less when calm)
    const swirl = clamp01(sigDiscovery * 0.85 + (1 - sigEnergy) * 0.15);
    const partA = lerp(0.02, 0.14, swirl);
    ctx.fillStyle = `${cold}${partA})`;

    for (const p of particles) {
      p.a += (0.35 + p.s * 0.6) * dt * (0.5 + swirl);
      const rr = p.r + Math.sin(phase + p.p * 6) * (0.5 + swirl);
      const x = cx + Math.cos(p.a) * rr;
      const y = cy + Math.sin(p.a) * rr;

      const size = 0.8 + swirl * 0.8;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Outline (crisp premium edge)
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
    ctx.stroke();

    // Micro “heartbeat” tick line (tempo-reactive, subtle)
    const tickAlpha = lerp(0.05, 0.18, sigEnergy);
    ctx.strokeStyle = `${cold}${tickAlpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const ang = phase * 0.25;
    ctx.moveTo(cx + Math.cos(ang) * 5.6, cy + Math.sin(ang) * 5.6);
    ctx.lineTo(cx + Math.cos(ang) * 10.2, cy + Math.sin(ang) * 10.2);
    ctx.stroke();
  }

  // ---------- Player polling ----------
  let playerTimer = 0;

  async function pollPlayer() {
    // /me/player gives current track id + artist + name
    const st = await spotifyGet("/me/player");
    if (!st || !st.item) return;

    const id = st.item.id || "";
    const name = st.item.name || "—";
    const artist = (st.item.artists && st.item.artists[0] && st.item.artists[0].name) ? st.item.artists[0].name : "—";
    nowTitle = name;
    nowArtist = artist;

    // If popup is visible, keep it “alive” with current text
    if (popupOpen || holdMode) renderPopup({ id, name, artist });

    // Track changed: fetch audio features (rate-limited)
    const now = Date.now();
    if (id && id !== lastTrackId) {
      lastTrackId = id;
      lastFeaturesAt = 0; // force refresh
    }

    if (id && (now - lastFeaturesAt) > POLL_FEATURES_MIN_MS) {
      lastFeaturesAt = now;
      const af = await spotifyGet(`/audio-features/${encodeURIComponent(id)}`);
      if (af) {
        features = af;
        computeSignalsFromFeatures(af, { id, name, artist });
      }
    }
  }

  function boot() {
    // Initial popup content (so it’s not empty if you tap instantly)
    renderPopup({ id: "", name: "—", artist: "—" });

    // Start animation + polling
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(draw);

    if (playerTimer) clearInterval(playerTimer);
    playerTimer = setInterval(pollPlayer, POLL_PLAYER_MS);

    // First poll quickly
    setTimeout(pollPlayer, 60);
    setTimeout(pollPlayer, 420);
  }

  boot();
})();  async function apiGet(path) {
    const url = absApi(path);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  // ==== Target ====
  const glyph = $(".glyph");
  if (!glyph) return;

  // Make glyph reliable anchor
  glyph.style.position = "relative";
  glyph.style.overflow = "visible";
  glyph.style.cursor = "pointer";
  glyph.style.touchAction = "manipulation";
  glyph.setAttribute("role", "button");
  glyph.setAttribute("aria-label", "Open Listening orb");

  // Make tap target effectively bigger (without changing layout)
  const hit = document.createElement("div");
  hit.style.position = "absolute";
  hit.style.inset = `${-HIT_PAD}px`;
  hit.style.borderRadius = "999px";
  hit.style.background = "transparent";
  hit.style.zIndex = "2";
  glyph.appendChild(hit);

  // Canvas
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  canvas.style.width = `${ORB_SIZE}px`;
  canvas.style.height = `${ORB_SIZE}px`;
  canvas.style.position = "absolute";
  canvas.style.left = "50%";
  canvas.style.top = "50%";
  canvas.style.transform = "translate(-50%, -50%)";
  canvas.style.zIndex = "1";
  canvas.style.pointerEvents = "none"; // click handled by hit/glyph
  glyph.appendChild(canvas);

  const ctx = canvas.getContext("2d");

  // Popup
  const popup = document.createElement("div");
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "Listening orb popup");
  popup.style.position = "absolute";
  popup.style.left = "0";
  popup.style.top = "calc(100% + 10px)";
  popup.style.width = `min(${POP_W}px, calc(100vw - 40px))`;
  popup.style.padding = "12px";
  popup.style.borderRadius = "18px";
  popup.style.background = "linear-gradient(180deg, rgba(22,24,28,.92), rgba(14,16,19,.92))";
  popup.style.outline = "1px solid rgba(255,255,255,.10)";
  popup.style.boxShadow = "0 22px 70px rgba(0,0,0,.62)";
  popup.style.backdropFilter = "blur(10px)";
  popup.style.webkitBackdropFilter = "blur(10px)";
  popup.style.transformOrigin = "12px 0";
  popup.style.transform = "translateY(-4px) scale(.98)";
  popup.style.opacity = "0";
  popup.style.pointerEvents = "none";
  popup.style.transition = "opacity .16s ease, transform .16s ease";
  popup.style.zIndex = "9999";

  // little arrow
  const arrow = document.createElement("div");
  arrow.style.position = "absolute";
  arrow.style.top = "-7px";
  arrow.style.left = "16px";
  arrow.style.width = "14px";
  arrow.style.height = "14px";
  arrow.style.transform = "rotate(45deg)";
  arrow.style.background = "rgba(22,24,28,.92)";
  arrow.style.outline = "1px solid rgba(255,255,255,.10)";
  arrow.style.borderRadius = "4px";
  popup.appendChild(arrow);

  const inner = document.createElement("div");
  inner.innerHTML = `
    <div style="
      font-size:11px;
      letter-spacing:.34px;
      color:rgba(255,255,255,.62);
      text-transform:uppercase;
      display:flex;
      align-items:center;
      gap:8px;
      margin-bottom:10px;
    ">
      <span style="width:7px;height:7px;border-radius:999px;background:rgba(49,208,124,.85);box-shadow:0 0 0 3px rgba(49,208,124,.10);"></span>
      Listening Soul
    </div>

    <div id="orbMiniGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div style="border-radius:14px;background:rgba(255,255,255,.03);outline:1px solid rgba(255,255,255,.07);padding:10px;overflow:hidden;">
        <div style="font-size:10px;letter-spacing:.28px;color:rgba(255,255,255,.60);text-transform:uppercase;">Energy</div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:10px;">
          <span style="flex:1 1 auto;height:6px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden;outline:1px solid rgba(255,255,255,.06);">
            <i id="orbEnergyBar" style="display:block;height:100%;width:40%;border-radius:999px;background:linear-gradient(180deg, rgba(255,255,255,.62), rgba(255,255,255,.38));box-shadow:inset 0 1px 0 rgba(255,255,255,.28);"></i>
          </span>
          <span id="orbEnergyNum" style="font-size:12px;font-weight:750;color:rgba(255,255,255,.82);white-space:nowrap;">—</span>
        </div>
      </div>

      <div style="border-radius:14px;background:rgba(255,255,255,.03);outline:1px solid rgba(255,255,255,.07);padding:10px;overflow:hidden;">
        <div style="font-size:10px;letter-spacing:.28px;color:rgba(255,255,255,.60);text-transform:uppercase;">Focus</div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:10px;">
          <span style="flex:1 1 auto;height:6px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden;outline:1px solid rgba(255,255,255,.06);">
            <i id="orbFocusBar" style="display:block;height:100%;width:40%;border-radius:999px;background:linear-gradient(180deg, rgba(255,255,255,.62), rgba(255,255,255,.38));box-shadow:inset 0 1px 0 rgba(255,255,255,.28);"></i>
          </span>
          <span id="orbFocusNum" style="font-size:12px;font-weight:750;color:rgba(255,255,255,.82);white-space:nowrap;">—</span>
        </div>
      </div>

      <div style="grid-column:1/-1;border-radius:14px;background:rgba(255,255,255,.03);outline:1px solid rgba(255,255,255,.07);padding:10px;overflow:hidden;">
        <div style="font-size:10px;letter-spacing:.28px;color:rgba(255,255,255,.60);text-transform:uppercase;">Discovery</div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:10px;">
          <span style="flex:1 1 auto;height:6px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden;outline:1px solid rgba(255,255,255,.06);">
            <i id="orbDiscBar" style="display:block;height:100%;width:40%;border-radius:999px;background:linear-gradient(180deg, rgba(255,255,255,.62), rgba(255,255,255,.38));box-shadow:inset 0 1px 0 rgba(255,255,255,.28);"></i>
          </span>
          <span id="orbDiscNum" style="font-size:12px;font-weight:750;color:rgba(255,255,255,.82);white-space:nowrap;">—</span>
        </div>
      </div>

      <div style="grid-column:1/-1;margin-top:2px;color:rgba(255,255,255,.60);font-size:12px;line-height:1.45;">
        <span id="orbTinyLine">—</span>
      </div>
    </div>
  `;
  popup.appendChild(inner);

  glyph.appendChild(popup);

  const energyBar = $("#orbEnergyBar", popup);
  const focusBar  = $("#orbFocusBar", popup);
  const discBar   = $("#orbDiscBar", popup);
  const energyNum = $("#orbEnergyNum", popup);
  const focusNum  = $("#orbFocusNum", popup);
  const discNum   = $("#orbDiscNum", popup);
  const tinyLine  = $("#orbTinyLine", popup);

  // ==== State ====
  let open = false;

  // Mood signals (0..1)
  let energy = 0.55;
  let focus = 0.55;
  let discovery = 0.45;

  // Visual dynamics
  let t0 = performance.now();
  let rafId = 0;
  let lastFrame = 0;

  function setOpen(next) {
    open = !!next;
    if (open) {
      popup.style.opacity = "1";
      popup.style.transform = "translateY(0) scale(1)";
      popup.style.pointerEvents = "auto";
      glyph.setAttribute("aria-expanded", "true");
    } else {
      popup.style.opacity = "0";
      popup.style.transform = "translateY(-4px) scale(.98)";
      popup.style.pointerEvents = "none";
      glyph.setAttribute("aria-expanded", "false");
    }
  }

  function toggle() {
    setOpen(!open);
  }
   /* orb.js (FULL FILE REPLACE) — PART 2/3 */

  // ==== Outside click close (Option 2) ====
  // Use CAPTURE so we catch it before other handlers. Also avoids the “open then instantly close” bug.
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!open) return;
      if (glyph.contains(e.target)) return; // inside -> keep open
      setOpen(false);
    },
    { capture: true, passive: true }
  );

  // Also allow ESC close (nice on desktop)
  document.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") setOpen(false);
  });

  // Toggle on tap/click
  // Stop propagation so it doesn’t fight with document listeners in some browsers.
  glyph.addEventListener(
    "pointerdown",
    (e) => {
      // If user taps directly inside popup, don't toggle/close; let popup be interactive.
      if (popup.contains(e.target)) return;
      e.stopPropagation();
      toggle();
    },
    { passive: false }
  );

  // ==== UI update ====
  function setBars() {
    const e = clamp01(energy);
    const f = clamp01(focus);
    const d = clamp01(discovery);

    if (energyBar) energyBar.style.width = `${Math.round(e * 100)}%`;
    if (focusBar)  focusBar.style.width  = `${Math.round(f * 100)}%`;
    if (discBar)   discBar.style.width   = `${Math.round(d * 100)}%`;

    if (energyNum) energyNum.textContent = `${Math.round(e * 100)}`;
    if (focusNum)  focusNum.textContent  = `${Math.round(f * 100)}`;
    if (discNum)   discNum.textContent   = `${Math.round(d * 100)}`;

    if (tinyLine) {
      // minimal words
      const vibe =
        (e > 0.72 && f > 0.62) ? "Locked in." :
        (d > 0.68) ? "Exploring." :
        (e < 0.38) ? "Slow & deep." :
        "Steady.";
      tinyLine.textContent = vibe;
    }
  }

  // ==== API sampling (robust fallback) ====
  // We accept ANY of these shapes if your worker returns them:
  //  - { energy, focus, discovery }  (0..1 or 0..100)
  //  - { mood: {energy, focus, discovery} }
  //  - { signals: { ... } }
  function normalizeMaybePercent(x, fallback) {
    const n = Number(x);
    if (!Number.isFinite(n)) return fallback;
    if (n > 1.001) return clamp01(n / 100);
    return clamp01(n);
  }

  function pick(obj, path, fallback) {
    try {
      const parts = path.split(".");
      let cur = obj;
      for (const p of parts) cur = cur?.[p];
      return cur == null ? fallback : cur;
    } catch {
      return fallback;
    }
  }

  async function poll() {
    try {
      // Try a few plausible endpoints, first one that works wins.
      // If you already have a known endpoint, tell me and I'll hard-wire it.
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

      // smooth so it feels organic
      const e = normalizeMaybePercent(eRaw, energy);
      const f = normalizeMaybePercent(fRaw, focus);
      const d = normalizeMaybePercent(dRaw, discovery);

      energy = lerp(energy, e, 0.35);
      focus = lerp(focus, f, 0.35);
      discovery = lerp(discovery, d, 0.35);

      setBars();
    } catch {
      // Fallback micro-drift so orb still feels alive
      const drift = () => (Math.random() - 0.5) * 0.05;
      energy = clamp01(energy + drift());
      focus = clamp01(focus + drift());
      discovery = clamp01(discovery + drift());
      setBars();
    }
  }

  // ==== Orb drawing ====
  function drawOrb(ts) {
    const dt = ts - t0;
    t0 = ts;

    // Cap FPS for mobile
    if (ANIM_FPS_CAP > 0) {
      const minFrame = 1000 / ANIM_FPS_CAP;
      if (ts - lastFrame < minFrame) {
        rafId = requestAnimationFrame(drawOrb);
        return;
      }
      lastFrame = ts;
    }

    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const W = 64, H = 64;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    ctx.clearRect(0, 0, W, H);

    // hue based on discovery, brightness based on energy, tightness based on focus
    const hue = lerp(190, 320, discovery);           // blue -> violet
    const glow = lerp(0.20, 0.55, energy);
    const tight = lerp(0.85, 0.65, focus);           // higher focus = tighter core
    const pulse = 0.5 + 0.5 * Math.sin(ts * 0.003 + discovery * 2);

    const cx = W / 2, cy = H / 2;
    const r = lerp(10.5, 12.8, energy) * (0.98 + pulse * 0.05);

    // Outer glow
    const g1 = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.0);
    g1.addColorStop(0, `hsla(${hue}, 90%, 70%, ${glow})`);
    g1.addColorStop(0.55, `hsla(${hue}, 90%, 60%, ${glow * 0.35})`);
    g1.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.0, 0, Math.PI * 2);
    ctx.fill();

    // Core
    const g2 = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.15, cx, cy, r);
    g2.addColorStop(0, `hsla(${hue}, 95%, 85%, ${0.65})`);
    g2.addColorStop(tight, `hsla(${hue}, 95%, 65%, ${0.22 + energy * 0.22})`);
    g2.addColorStop(1, `hsla(${hue}, 90%, 40%, ${0.12})`);

    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.fillStyle = `rgba(255,255,255,${0.10 + energy * 0.10})`;
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.25, cy - r * 0.35, r * 0.35, r * 0.25, -0.6, 0, Math.PI * 2);
    ctx.fill();

    rafId = requestAnimationFrame(drawOrb);
         }
   /* orb.js (FULL FILE REPLACE) — PART 3/3 */

  // ==== Boot ====
  function boot() {
    setBars();
    poll();
    setInterval(poll, POLL_MS);

    if (!rafId) rafId = requestAnimationFrame(drawOrb);

    // Start closed
    setOpen(false);
  }

  // DOM ready safety
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
