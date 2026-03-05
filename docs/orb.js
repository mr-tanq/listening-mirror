/* orb.js (FULL FILE REPLACE)
   Listening Mirror — Header Glyph Orb (Now Aura Edition)
   ✅ Bigger, clearer orb in header (.glyph) without layout break
   ✅ Tap toggles popup open/close, tap outside closes
   ✅ Popup: Weight / Motion / Depth / Edge (musical, premium)
   ✅ Strong, noticeable color shifts per artist/track (hash → aura palette)
   ✅ Robust: works even if API endpoints fail (DOM-only fallback)
*/

(() => {
  "use strict";

  // ==== CONFIG ====
  const API_BASE = "https://i.errtanq9.workers.dev"; // optional; used if endpoints exist
  const POLL_MS = 15000;      // optional mood refresh
  const NOW_POLL_MS = 1200;   // detect track/artist changes fast
  const ANIM_FPS_CAP = 60;

  const MAX_DPR = 2.25;

  // Bigger orb (still anchored in the 16px glyph, but allowed to overflow)
  const ORB_SIZE = 30;        // CSS px (visual size)
  const HIT_PAD = 22;         // expand tap area

  // Popup sizing
  const POP_W = 290;

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
  glyph.setAttribute("aria-expanded", "false");

  // Big tap target (no layout changes)
  const hit = document.createElement("div");
  hit.style.position = "absolute";
  hit.style.inset = `${-HIT_PAD}px`;
  hit.style.borderRadius = "999px";
  hit.style.background = "transparent";
  hit.style.zIndex = "2";
  glyph.appendChild(hit);

  // Canvas (orb)
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
  canvas.style.pointerEvents = "none"; // clicks handled by glyph/hit
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
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      margin-bottom:10px;
    ">
      <div style="
        font-size:11px;
        letter-spacing:.34px;
        color:rgba(255,255,255,.62);
        text-transform:uppercase;
        display:flex;
        align-items:center;
        gap:8px;
        min-width:0;
      ">
        <span id="orbHeadDot" style="width:7px;height:7px;border-radius:999px;background:rgba(255,255,255,.35);box-shadow:0 0 0 3px rgba(255,255,255,.08);"></span>
        Now Aura
      </div>

      <div id="orbAuraTag" style="
        font-size:11px;
        letter-spacing:.28px;
        color:rgba(255,255,255,.78);
        padding:6px 10px;
        border-radius:999px;
        background:rgba(255,255,255,.04);
        outline:1px solid rgba(255,255,255,.08);
        white-space:nowrap;
      ">—</div>
    </div>

    <div style="
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:10px;
    ">
      ${miniTile("Weight", "orbWBar", "orbWNum")}
      ${miniTile("Motion", "orbMBar", "orbMNum")}
      ${miniTile("Depth",  "orbDBar", "orbDNum")}
      ${miniTile("Edge",   "orbEBar", "orbENum")}
    </div>

    <div style="
      margin-top:10px;
      padding-top:10px;
      border-top:1px solid rgba(255,255,255,.07);
      color:rgba(255,255,255,.68);
      font-size:12px;
      line-height:1.45;
      display:flex;
      flex-direction:column;
      gap:6px;
    ">
      <div id="orbVerdict" style="color:rgba(255,255,255,.78);">—</div>
      <div id="orbTinyLine" style="color:rgba(255,255,255,.55);">—</div>
    </div>
  `;

  function miniTile(label, barId, numId){
    return `
      <div style="border-radius:14px;background:rgba(255,255,255,.03);outline:1px solid rgba(255,255,255,.07);padding:10px;overflow:hidden;">
        <div style="font-size:10px;letter-spacing:.28px;color:rgba(255,255,255,.58);text-transform:uppercase;">${label}</div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:10px;">
          <span style="flex:1 1 auto;height:6px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden;outline:1px solid rgba(255,255,255,.06);">
            <i id="${barId}" style="display:block;height:100%;width:40%;border-radius:999px;background:linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,.38));box-shadow:inset 0 1px 0 rgba(255,255,255,.25);"></i>
          </span>
          <span id="${numId}" style="font-size:12px;font-weight:750;color:rgba(255,255,255,.82);white-space:nowrap;">—</span>
        </div>
      </div>
    `;
  }

  popup.appendChild(inner);
  glyph.appendChild(popup);

  const headDot = $("#orbHeadDot", popup);
  const auraTag = $("#orbAuraTag", popup);
  const verdict = $("#orbVerdict", popup);
  const tinyLine = $("#orbTinyLine", popup);

  const wBar = $("#orbWBar", popup), wNum = $("#orbWNum", popup);
  const mBar = $("#orbMBar", popup), mNum = $("#orbMNum", popup);
  const dBar = $("#orbDBar", popup), dNum = $("#orbDNum", popup);
  const eBar = $("#orbEBar", popup), eNum = $("#orbENum", popup);

  // ==== Popup open/close ====
  let open = false;

  function setOpen(next){
    open = !!next;
    if(open){
      popup.style.opacity = "1";
      popup.style.transform = "translateY(0) scale(1)";
      popup.style.pointerEvents = "auto";
      glyph.setAttribute("aria-expanded", "true");
    }else{
      popup.style.opacity = "0";
      popup.style.transform = "translateY(-4px) scale(.98)";
      popup.style.pointerEvents = "none";
      glyph.setAttribute("aria-expanded", "false");
    }
  }
  function toggle(){ setOpen(!open); }

  // Outside click close (capture avoids open→instant-close)
  document.addEventListener("pointerdown", (e) => {
    if(!open) return;
    if(glyph.contains(e.target)) return;
    setOpen(false);
  }, { capture:true, passive:true });

  document.addEventListener("keydown", (e) => {
    if(open && e.key === "Escape") setOpen(false);
  });

  glyph.addEventListener("pointerdown", (e) => {
    if(popup.contains(e.target)) return; // interact with popup
    e.stopPropagation();
    toggle();
  }, { passive:false });

  // ==== Now DOM reading ====
  const safeText = (el) => (el?.textContent || "").trim();
  function readNowDom(){
    const track = safeText(document.getElementById("nowTrack"));
    const artist = safeText(document.getElementById("nowArtist"));
    const album = safeText(document.getElementById("nowAlbum"));
    return {
      track: (track && track !== "—") ? track : "",
      artist: (artist && artist !== "—") ? artist : "",
      album: (album && album !== "—") ? album : ""
    };
  }

  // ==== Hash → aura palette (noticeable but premium) ====
  // Curated families: Ember / Indigo / Violet / Emerald / Cyan
  const AURAS = [
    { name:"Ember",   hueA:  14, hueB:  42 }, // warm fire
    { name:"Indigo",  hueA: 210, hueB: 250 }, // deep blue
    { name:"Violet",  hueA: 270, hueB: 315 }, // mystic purple
    { name:"Emerald", hueA: 130, hueB: 165 }, // green
    { name:"Cyan",    hueA: 175, hueB: 205 }, // cool teal
  ];

  function hash32(str){
    // fast stable hash
    let h = 2166136261 >>> 0;
    for(let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function auraFrom(artist, track){
    const key = (artist + "::" + track).toLowerCase().trim();
    const h = hash32(key || "idle");
    const idx = h % AURAS.length;
    const a = AURAS[idx];

    // pick hue inside family range, so same family but still varies per track
    const t = ((h >>> 8) & 255) / 255;
    const hue = Math.round(lerp(a.hueA, a.hueB, t));

    // a second hue for gradients
    const t2 = ((h >>> 16) & 255) / 255;
    const hue2 = Math.round(lerp(a.hueA, a.hueB, t2));

    return { name: a.name, hue, hue2 };
  }

  // ==== Signals (0..1) ====
  // We keep soft “mood” numbers if your worker exposes them, but we ALSO
  // bias them with the current artist/track so changes are obvious.
  let energy = 0.55;     // overall intensity
  let focus = 0.55;      // tightness / control
  let discovery = 0.45;  // exploration / atmosphere

  // derived (B mode):
  let weight = 0.55;
  let motion = 0.55;
  let depth = 0.55;
  let edge = 0.55;

  // aura
  let auraName = "—";
  let hue = 220;
  let hue2 = 250;

  let lastKey = "";

  // ==== Optional API sampling (robust) ====
  function normalizeMaybePercent(x, fallback){
    const n = Number(x);
    if(!Number.isFinite(n)) return fallback;
    if(n > 1.001) return clamp01(n / 100);
    return clamp01(n);
  }
  function pick(obj, path, fallback){
    try{
      const parts = path.split(".");
      let cur = obj;
      for(const p of parts) cur = cur?.[p];
      return cur == null ? fallback : cur;
    }catch{
      return fallback;
    }
  }

  async function pollApi(){
    try{
      const candidates = ["/diag", "/signals", "/orb", "/status"];
      let data = null;
      for(const p of candidates){
        try{
          data = await apiGet(p);
          if(data) break;
        }catch{}
      }
      if(!data) throw new Error("no endpoint");

      const eRaw = pick(data, "energy", null) ?? pick(data, "mood.energy", null) ?? pick(data, "signals.energy", null);
      const fRaw = pick(data, "focus", null) ?? pick(data, "mood.focus", null) ?? pick(data, "signals.focus", null);
      const dRaw = pick(data, "discovery", null) ?? pick(data, "mood.discovery", null) ?? pick(data, "signals.discovery", null);

      const e = normalizeMaybePercent(eRaw, energy);
      const f = normalizeMaybePercent(fRaw, focus);
      const d = normalizeMaybePercent(dRaw, discovery);

      // smooth
      energy = lerp(energy, e, 0.35);
      focus = lerp(focus, f, 0.35);
      discovery = lerp(discovery, d, 0.35);
    } catch {
      // tiny drift only (keeps it alive)
      const drift = () => (Math.random() - 0.5) * 0.035;
      energy = clamp01(energy + drift());
      focus = clamp01(focus + drift());
      discovery = clamp01(discovery + drift());
    }
  }

  // ==== Track/artist bias (makes changes obvious) ====
  function applyTrackBias(artist, track){
    // Derive a “profile” from hash: gives consistent differences across artists/tracks
    const h = hash32((artist + "::" + track).toLowerCase().trim() || "idle");
    const a = ((h >>> 0) & 255) / 255;   // 0..1
    const b = ((h >>> 8) & 255) / 255;
    const c = ((h >>> 16) & 255) / 255;

    // Bias the base signals, but keep them premium (not extreme random)
    const eBias = lerp(0.35, 0.85, a);
    const fBias = lerp(0.35, 0.85, b);
    const dBias = lerp(0.30, 0.90, c);

    // Blend current values toward bias so transitions feel “real”
    energy = lerp(energy, eBias, 0.55);
    focus = lerp(focus, fBias, 0.55);
    discovery = lerp(discovery, dBias, 0.55);
  }

  // ==== Compute B-metrics (musical) ====
  function computeAuraMetrics(){
    // Weight: density + control + low exploration
    weight = clamp01(0.45 * focus + 0.40 * energy + 0.15 * (1 - discovery));

    // Motion: energy-driven, but reduced if too “wide/floaty”
    motion = clamp01(0.65 * energy + 0.20 * (1 - discovery) + 0.15 * focus);

    // Depth: discovery-heavy + a touch of lower energy (space)
    depth = clamp01(0.70 * discovery + 0.18 * (1 - energy) + 0.12 * (1 - focus));

    // Edge: bite/attack = energy + focus
    edge = clamp01(0.55 * energy + 0.45 * focus);

    // A little “premium smoothing”
    weight = lerp(weight, clamp01(weight), 0.8);
    motion = lerp(motion, clamp01(motion), 0.8);
    depth  = lerp(depth,  clamp01(depth),  0.8);
    edge   = lerp(edge,   clamp01(edge),   0.8);
  }

  function setPopupUI(){
    const setBar = (bar, num, v) => {
      const pct = Math.round(clamp01(v) * 100);
      if(bar) bar.style.width = `${pct}%`;
      if(num) num.textContent = `${pct}`;
    };

    setBar(wBar, wNum, weight);
    setBar(mBar, mNum, motion);
    setBar(dBar, dNum, depth);
    setBar(eBar, eNum, edge);

    // aura label
    if(auraTag) auraTag.textContent = `Aura: ${auraName}`;

    // header dot accent
    const dotCol = `hsla(${hue}, 92%, 62%, .95)`;
    if(headDot){
      headDot.style.background = dotCol;
      headDot.style.boxShadow = `0 0 0 3px hsla(${hue}, 92%, 62%, .12)`;
    }

    // verdict line (short, musical)
    const w = weight, m = motion, d = depth, e = edge;
    let v =
      (m > 0.72 && e > 0.70) ? "Fast heat. Sharp edge." :
      (w > 0.72 && e > 0.66) ? "Heavy. Controlled. Cutting." :
      (d > 0.72 && m < 0.52) ? "Wide space. Slow drift." :
      (d > 0.66 && e < 0.55) ? "Deep and soft-focus." :
      (m > 0.66 && w < 0.55) ? "Lightweight motion." :
      "Balanced pressure.";

    if(verdict) verdict.textContent = v;

    // tiny line: show the “shape” in 4 words max
    const tag =
      `${w > .66 ? "Dense" : w < .45 ? "Airy" : "Solid"} · ` +
      `${m > .66 ? "Driving" : m < .45 ? "Still" : "Steady"} · ` +
      `${d > .66 ? "Wide" : d < .45 ? "Close" : "Deep"} · ` +
      `${e > .66 ? "Sharp" : e < .45 ? "Smooth" : "Clean"}`;

    if(tinyLine) tinyLine.textContent = tag;

    // Tint the bar fills subtly with aura hue (premium, not neon)
    const tint = `linear-gradient(180deg, hsla(${hue}, 92%, 72%, .85), hsla(${hue2}, 92%, 60%, .45))`;
    [wBar,mBar,dBar,eBar].forEach(b => { if(b) b.style.background = tint; });
  }

  // ==== Orb drawing ====
  let t0 = performance.now();
  let rafId = 0;
  let lastFrame = 0;

  function drawOrb(ts){
    // FPS cap
    if(ANIM_FPS_CAP > 0){
      const minFrame = 1000 / ANIM_FPS_CAP;
      if(ts - lastFrame < minFrame){
        rafId = requestAnimationFrame(drawOrb);
        return;
      }
      lastFrame = ts;
    }

    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const W = 64, H = 64;

    const wantW = Math.round(W * dpr);
    const wantH = Math.round(H * dpr);
    if(canvas.width !== wantW || canvas.height !== wantH){
      canvas.width = wantW;
      canvas.height = wantH;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    ctx.clearRect(0, 0, W, H);

    // Use aura hue family, brightness from Motion/Edge, “fog” from Depth
    const cx = W/2, cy = H/2;

    const pulse = 0.5 + 0.5 * Math.sin(ts * 0.0032 + discovery * 2.1);
    const r = lerp(10.5, 13.3, motion) * (0.985 + pulse * 0.06);

    const glow = lerp(0.22, 0.62, clamp01(0.55*motion + 0.45*edge));
    const fog = lerp(0.10, 0.40, depth);

    // Outer aura glow
    const g1 = ctx.createRadialGradient(cx, cy, r*0.25, cx, cy, r*2.15);
    g1.addColorStop(0, `hsla(${hue}, 92%, 70%, ${glow})`);
    g1.addColorStop(0.55, `hsla(${hue2}, 92%, 62%, ${glow*0.34})`);
    g1.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.arc(cx, cy, r*2.15, 0, Math.PI*2);
    ctx.fill();

    // Soft depth fog ring
    const gFog = ctx.createRadialGradient(cx, cy, r*0.7, cx, cy, r*1.75);
    gFog.addColorStop(0, `rgba(0,0,0,0)`);
    gFog.addColorStop(1, `rgba(0,0,0,${fog})`);
    ctx.fillStyle = gFog;
    ctx.beginPath();
    ctx.arc(cx, cy, r*1.75, 0, Math.PI*2);
    ctx.fill();

    // Core (tightness from Weight)
    const tight = lerp(0.90, 0.62, weight);
    const g2 = ctx.createRadialGradient(cx - r*0.25, cy - r*0.25, r*0.18, cx, cy, r);
    g2.addColorStop(0, `hsla(${hue}, 95%, 88%, ${0.72})`);
    g2.addColorStop(tight, `hsla(${hue2}, 95%, 66%, ${0.20 + 0.30*edge})`);
    g2.addColorStop(1, `hsla(${hue2}, 90%, 40%, ${0.10})`);

    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.fill();

    // Specular highlight (more if Edge high)
    ctx.fillStyle = `rgba(255,255,255,${0.10 + edge*0.14})`;
    ctx.beginPath();
    ctx.ellipse(cx - r*0.25, cy - r*0.35, r*0.38, r*0.26, -0.6, 0, Math.PI*2);
    ctx.fill();

    // Tiny “spark” dots (more if Discovery high)
    const sparks = Math.round(lerp(2, 9, discovery));
    for(let i=0;i<sparks;i++){
      const a = ts*0.0012 + i*1.7;
      const rad = r*lerp(0.9, 1.45, ((i*37)%100)/100);
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a*1.07) * rad;
      ctx.fillStyle = `hsla(${hue}, 92%, 78%, ${0.08 + 0.10*discovery})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.6 + 0.5*discovery, 0, Math.PI*2);
      ctx.fill();
    }

    rafId = requestAnimationFrame(drawOrb);
  }

  // ==== Main update loop ====
  async function updateFromNow(){
    const { track, artist } = readNowDom();
    const key = `${artist}::${track}`;

    // Always maintain aura (even if offline)
    const a = auraFrom(artist || "—", track || "—");
    auraName = a.name;
    hue = a.hue;
    hue2 = a.hue2;

    // Only bias signals when track changes (so it “snaps” to a new identity)
    if(key && key !== lastKey){
      lastKey = key;
      applyTrackBias(artist, track);
    }

    // Optional: let API gently influence the baseline too
    await pollApi();

    computeAuraMetrics();
    if(open) setPopupUI(); // update live while open
  }

  // ==== Boot ====
  function boot(){
    setOpen(false);

    // Initial
    updateFromNow().catch(()=>{});
    computeAuraMetrics();
    setPopupUI();

    // Timers
    setInterval(() => { updateFromNow().catch(()=>{}); }, NOW_POLL_MS);
    setInterval(() => { pollApi().catch(()=>{}); }, POLL_MS);

    // Animation
    if(!rafId) rafId = requestAnimationFrame(drawOrb);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot, { once:true });
  } else {
    boot();
  }
})();
