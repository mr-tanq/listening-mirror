/* orb.js (FULL FILE REPLACE) — 1 PART
   Listening Mirror — Header Glyph Orb
   ✅ Bigger, clearer orb in header
   ✅ NOTICEABLE premium color shifts per artist/track (hash + curated palette)
   ✅ Tap toggles popup open/close
   ✅ Tap outside closes
   ✅ Robust: API errors won't break UI (fallback values)
*/

(() => {
  "use strict";

  // ==== CONFIG ====
  const API_BASE = "https://i.errtanq9.workers.dev";

  const POLL_MS = 15000;      // refresh mood numbers
  const ANIM_FPS_CAP = 60;

  const MAX_DPR = 2.25;

  // ✅ Size: make it actually visible in header
  const GLYPH_SIZE = 28;      // header orb container size (px)
  const ORB_SIZE = 28;        // canvas CSS size (px)
  const HIT_PAD = 18;         // larger tap target feel

  // Popup sizing
  const POP_W = 280;

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  const $ = (sel, root = document) => root.querySelector(sel);

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

  // ==== Target ====
  const glyph = $(".glyph");
  if (!glyph) return;

  // Make glyph reliable anchor + make it bigger without touching index.html
  glyph.style.position = "relative";
  glyph.style.overflow = "visible";
  glyph.style.cursor = "pointer";
  glyph.style.touchAction = "manipulation";
  glyph.style.width = `${GLYPH_SIZE}px`;
  glyph.style.height = `${GLYPH_SIZE}px`;
  glyph.style.borderRadius = "999px";

  // Keep the original premium look but stronger presence
  glyph.style.outline = "1px solid rgba(255,255,255,.12)";
  glyph.style.boxShadow = "0 12px 34px rgba(0,0,0,.55)";
  glyph.setAttribute("role", "button");
  glyph.setAttribute("aria-label", "Open Listening orb");

  // Make tap target effectively bigger (without changing layout)
  const hit = document.createElement("div");
  hit.style.position = "absolute";
  hit.style.inset = `${-HIT_PAD}px`;
  hit.style.borderRadius = "999px";
  hit.style.background = "transparent";
  hit.style.zIndex = "3";
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
  canvas.style.zIndex = "2";
  canvas.style.pointerEvents = "none"; // click handled by hit/glyph
  glyph.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

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

  // Music-driven color identity
  let artistKey = "";
  let trackKey = "";
  let baseHue = 260; // will be set

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

  // ==== Outside click close ====
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!open) return;
      if (glyph.contains(e.target)) return;
      setOpen(false);
    },
    { capture: true, passive: true }
  );

  document.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") setOpen(false);
  });

  glyph.addEventListener(
    "pointerdown",
    (e) => {
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
      const vibe =
        (e > 0.72 && f > 0.62) ? "Locked in." :
        (d > 0.68) ? "Exploring." :
        (e < 0.38) ? "Slow & deep." :
        "Steady.";
      tinyLine.textContent = vibe;
    }
  }

  // ==== Music -> Hue (premium + noticeable) ====
  // Curated hue anchors (no rainbow chaos)
  const HUES = [210, 252, 285, 320, 28, 160]; // deep cyan, indigo, violet, magenta, ember, emerald

  function fnv1a(str) {
    str = String(str || "");
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function snapHueFromKey(key) {
    const h = fnv1a(key);
    const idx = h % HUES.length;
    // tiny deterministic offset so two artists in same bucket still differ a bit
    const micro = ((h >>> 8) % 21) - 10; // -10..+10
    return (HUES[idx] + micro + 360) % 360;
  }

  function readNowKey() {
    const a = ($("#nowArtist")?.textContent || "").trim();
    const t = ($("#nowTrack")?.textContent || "").trim();
    if (!a || !t || a === "—" || t === "—") return null;
    return { a, t };
  }

  function updateMusicHue() {
    const k = readNowKey();
    if (!k) return;

    // only re-snap when artist/track changes
    const ak = k.a.toLowerCase();
    const tk = k.t.toLowerCase();

    if (ak !== artistKey || tk !== trackKey) {
      artistKey = ak;
      trackKey = tk;

      // Stronger identity from ARTIST, slight seasoning from TRACK
      const hArtist = snapHueFromKey(artistKey);
      const hTrack = snapHueFromKey(artistKey + "::" + trackKey);

      // blend: mostly artist, some track (keeps "band identity")
      baseHue = (hArtist * 0.82 + hTrack * 0.18) % 360;
    }
  }

  // ==== API sampling (robust fallback) ====
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

      const e = normalizeMaybePercent(eRaw, energy);
      const f = normalizeMaybePercent(fRaw, focus);
      const d = normalizeMaybePercent(dRaw, discovery);

      energy = lerp(energy, e, 0.35);
      focus = lerp(focus, f, 0.35);
      discovery = lerp(discovery, d, 0.35);

      setBars();
    } catch {
      const drift = () => (Math.random() - 0.5) * 0.05;
      energy = clamp01(energy + drift());
      focus = clamp01(focus + drift());
      discovery = clamp01(discovery + drift());
      setBars();
    }
  }

  // ==== Orb drawing ====
  function drawOrb(ts) {
    // Cap FPS for mobile
    if (ANIM_FPS_CAP > 0) {
      const minFrame = 1000 / ANIM_FPS_CAP;
      if (ts - lastFrame < minFrame) {
        rafId = requestAnimationFrame(drawOrb);
        return;
      }
      lastFrame = ts;
    }

    updateMusicHue();

    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const W = 64, H = 64;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    ctx.clearRect(0, 0, W, H);

    // 🔥 Make differences clearly visible:
    // - Hue: from artist/track identity (baseHue)
    // - Brightness/glow: energy
    // - Tightness: focus
    // - Motion: discovery
    const hue = baseHue;
    const glow = lerp(0.22, 0.70, energy);
    const tight = lerp(0.88, 0.62, focus);
    const warp = lerp(0.6, 1.35, discovery);
    const pulse = 0.5 + 0.5 * Math.sin(ts * (0.0026 + discovery * 0.0016) + (hue * 0.02));

    const cx = W / 2, cy = H / 2;
    const r = lerp(10.8, 14.2, energy) * (0.98 + pulse * 0.06);

    // Outer aura
    const g1 = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.25);
    g1.addColorStop(0, `hsla(${hue}, 92%, 72%, ${glow})`);
    g1.addColorStop(0.55, `hsla(${hue}, 92%, 62%, ${glow * 0.38})`);
    g1.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.25, 0, Math.PI * 2);
    ctx.fill();

    // Mystic ring (gives character per genre/artist)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ts * 0.00035 * warp);
    ctx.strokeStyle = `hsla(${(hue + 18) % 360}, 95%, 70%, ${0.18 + discovery * 0.22})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 32; i++) {
      const ang = (i / 32) * Math.PI * 2;
      const rr = r * (1.18 + 0.06 * Math.sin(ang * (3 + discovery * 3) + ts * 0.0012));
      const x = Math.cos(ang) * rr;
      const y = Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Core
    const g2 = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.28, r * 0.15, cx, cy, r);
    g2.addColorStop(0, `hsla(${hue}, 95%, 88%, 0.72)`);
    g2.addColorStop(tight, `hsla(${hue}, 95%, 64%, ${0.26 + energy * 0.26})`);
    g2.addColorStop(1, `hsla(${hue}, 90%, 38%, 0.14)`);

    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.fillStyle = `rgba(255,255,255,${0.12 + energy * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.22, cy - r * 0.34, r * 0.38, r * 0.26, -0.55, 0, Math.PI * 2);
    ctx.fill();

    // Tiny star specks (subtle)
    const specks = 6 + Math.round(discovery * 6);
    for (let i = 0; i < specks; i++) {
      const ang = (i / specks) * Math.PI * 2 + ts * 0.0006 * warp;
      const rr = r * (0.55 + 0.55 * ((i % 3) / 2));
      const x = cx + Math.cos(ang) * rr;
      const y = cy + Math.sin(ang) * rr;
      ctx.fillStyle = `hsla(${(hue + 40) % 360}, 90%, 80%, ${0.08 + energy * 0.10})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    rafId = requestAnimationFrame(drawOrb);
  }

  // ==== Boot ====
  function boot() {
    setBars();
    poll();
    setInterval(poll, POLL_MS);

    if (!rafId) rafId = requestAnimationFrame(drawOrb);

    setOpen(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
