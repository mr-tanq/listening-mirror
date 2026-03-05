/* orb.js (FULL FILE REPLACE) — PART 1/3
   Listening Mirror — Header Glyph Orb
   ✅ Injects animated orb canvas inside .glyph
   ✅ Tap toggles popup open/close
   ✅ Tap outside closes (Option 2)
   ✅ Robust: API errors won't break UI (fallback values)
*/

(() => {
  "use strict";

  // ==== CONFIG ====
  const API_BASE = "https://i.errtanq9.workers.dev";

  const POLL_MS = 15000;      // refresh mood numbers
  const ANIM_FPS_CAP = 60;

  const MAX_DPR = 2.25;
  const ORB_SIZE = 25;        // visual canvas size inside .glyph (CSS px)
  const HIT_PAD = 18;         // bigger tap target feel

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
