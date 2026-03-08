/* aura-tab.js (FULL FILE REPLACE) — PART 1/4
   Listening Mirror — Shared Main Orb + Aura Details Panel
   ✅ ONE orb system only (main screen)
   ✅ Title: "listening mirror" (lowercase) + premium styling
   ✅ Tap title => Aura modal (details only, NO second orb canvas)
   ✅ Keeps/ensures Spotify icon button at RIGHT OF HEADER (#headerActions), not tabs
   ✅ Spotify icon color:
      - Connected => BLACK icon (with subtle light drop-shadow so it's visible)
      - Disconnected => GREY icon
      - Tap toggles connect / disconnect (best-effort)
   ✅ FAST sync on open/connect
   ✅ Spotify button self-heals if DOM changes
   ✅ Same track = same core palette / same seed
   ✅ If /audio-features fails (403 etc), Aura still works from strong metadata fallback
   ✅ FIX: fallback is no longer flat 50/50/50/50
   ✅ NEW: shared premium plasma orb on main UI
*/

(() => {
  "use strict";

  const SPOTIFY_API = "https://api.spotify.com/v1";

  const OPEN_POLL_MS = 8000;
  const CLOSED_POLL_MS = 60000;
  const BURST_STEPS = [0, 350, 900, 1800, 3200, 5200];

  const MAX_DPR = 2.25;
  const FPS_CAP = 60;

  const PI = Math.PI;
  const TAU = Math.PI * 2;

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => (v - a) / (b - a || 1);
  const $ = (sel, root = document) => root.querySelector(sel);

  function safeCall(fn) {
    try { return fn(); } catch { return undefined; }
  }

  function createEl(tag, attrs = {}, html = "") {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else el.setAttribute(k, v);
    }
    if (html) el.innerHTML = html;
    return el;
  }

  // ---------- Spotify auth ----------
  function getToken() {
    if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
      return safeCall(() => window.SpotifyAuth.getAccessToken());
    }
    if (window.SpotifyPlayer && typeof window.SpotifyPlayer.getAccessToken === "function") {
      return safeCall(() => window.SpotifyPlayer.getAccessToken());
    }
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        const lk = String(k || "").toLowerCase();
        if (!lk.includes("spotify")) continue;
        const v = localStorage.getItem(k);
        if (v && v.length > 20 && v.includes(".")) return v;
      }
    } catch {}
    return null;
  }

  function isConnected() {
    return !!getToken();
  }

  async function spotifyGet(path) {
    const token = getToken();
    if (!token) {
      const err = new Error("NO_TOKEN");
      err.code = "NO_TOKEN";
      throw err;
    }

    const res = await fetch(`${SPOTIFY_API}${path}`, {
      headers: { Authorization: "Bearer " + token }
    });

    if (res.status === 204) return { __no_content: true, __status: 204 };

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const err = new Error(`SPOTIFY_HTTP_${res.status}`);
      err.status = res.status;
      err.payload = json;
      throw err;
    }
    return json;
  }

  async function getPlayer() {
    return await spotifyGet("/me/player");
  }

  async function getAudioFeatures(trackId) {
    return await spotifyGet(`/audio-features/${encodeURIComponent(trackId)}`);
  }

  // ---------- Find title ----------
  const titleEl = $(".wordmark .title");
  const brandEl = $(".brand");
  if (!titleEl || !brandEl) return;

  titleEl.textContent = "listening mirror";
  titleEl.style.cursor = "pointer";
  titleEl.style.userSelect = "none";
  titleEl.setAttribute("role", "button");
  titleEl.setAttribute("tabindex", "0");
  titleEl.setAttribute("aria-label", "Open aura");

  // ---------- Styles ----------
  const style = document.createElement("style");
  style.id = "auraTabStylesSharedOrb";
  style.textContent = `
    .wordmark .title{
      letter-spacing: 1.15px !important;
      font-weight: 680 !important;
      text-transform: none !important;
      background: linear-gradient(180deg, rgba(255,255,255,.90), rgba(220,225,234,.62)) !important;
      -webkit-background-clip: text !important;
      background-clip: text !important;
      color: transparent !important;
      position: relative !important;
      display: inline-block !important;
      padding: 2px 2px 3px 2px !important;
      transform: translateZ(0);
    }
    .wordmark .title:after{
      content:"";
      position:absolute;
      inset:-8px -10px -10px -10px;
      border-radius:16px;
      background:
        radial-gradient(120px 44px at 35% 40%, rgba(150,190,255,.10), transparent 60%),
        radial-gradient(120px 44px at 70% 55%, rgba(255,215,140,.06), transparent 62%);
      opacity:0;
      transition: opacity .18s ease, transform .18s ease;
      transform: translateY(0px);
      pointer-events:none;
    }
    .wordmark .title:active:after{ opacity:.85; transform: translateY(1px); }
    .wordmark .title.auraHover:after{ opacity:.55; }

    .lmSpotifyIcoBtn{
      margin-left:auto;
      border:0;
      background:transparent;
      padding:8px 10px;
      border-radius:12px;
      cursor:pointer;
      line-height:0;
      -webkit-tap-highlight-color:transparent;
      flex:0 0 auto;
    }
    .lmSpotifyIcoBtn:active{ transform: translateY(1px); }
    .lmSpotifyIcoBtn svg{
      width:20px;
      height:20px;
      display:block;
      transition: opacity .15s ease, filter .15s ease;
    }
    .lmSpotifyIcoBtn[data-state="off"] svg{
      fill: rgba(255,255,255,.55);
      opacity:.95;
      filter:none;
    }
    .lmSpotifyIcoBtn[data-state="on"] svg{
      fill:#000000;
      opacity:1;
      filter: drop-shadow(0 0 1.5px rgba(255,255,255,.45));
    }

    .auraOverlay{
      position:fixed;
      inset:0;
      z-index:999999;
      display:none;
      align-items:center;
      justify-content:center;
      padding:max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right))
              max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
      background:
        radial-gradient(900px 600px at 30% 20%, rgba(255,255,255,.06), transparent 60%),
        radial-gradient(900px 600px at 70% 80%, rgba(255,255,255,.04), transparent 62%),
        rgba(0,0,0,.52);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .auraCard{
      width:min(420px, calc(100vw - 26px));
      border-radius:22px;
      background: linear-gradient(180deg, rgba(18,20,24,.92), rgba(12,13,16,.92));
      outline:1px solid rgba(255,255,255,.10);
      box-shadow:0 30px 90px rgba(0,0,0,.68);
      overflow:hidden;
      transform: translateY(6px) scale(.985);
      opacity:0;
      transition: transform .18s ease, opacity .18s ease;
      will-change: transform, opacity;
    }
    .auraOverlay.on{ display:flex; }
    .auraOverlay.on .auraCard{ transform: translateY(0) scale(1); opacity:1; }

    .auraTop{
      padding:14px 16px 10px 16px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      border-bottom:1px solid rgba(255,255,255,.07);
    }
    .auraLabel{
      font-size:11px;
      letter-spacing:.34px;
      text-transform:uppercase;
      color:rgba(255,255,255,.62);
      display:flex;
      align-items:center;
      gap:10px;
      min-width:0;
    }
    .auraDot{
      width:8px;
      height:8px;
      border-radius:999px;
      background:rgba(160,190,255,.65);
      box-shadow: 0 0 0 3px rgba(160,190,255,.10);
      outline:1px solid rgba(255,255,255,.10);
      flex:0 0 auto;
    }
    .auraClose{
      border:0;
      cursor:pointer;
      padding:8px 10px;
      border-radius:999px;
      font-size:12px;
      letter-spacing:.2px;
      background:rgba(255,255,255,.06);
      outline:1px solid rgba(255,255,255,.10);
      color:rgba(255,255,255,.90);
    }
    .auraClose:active{ transform: translateY(1px); }

    .auraBody{ padding:16px; }

    .auraHero{
      border-radius:20px;
      outline:1px solid rgba(255,255,255,.08);
      background:
        radial-gradient(160px 160px at 50% 35%, rgba(120,150,255,.06), transparent 65%),
        rgba(255,255,255,.02);
      overflow:hidden;
      position:relative;
      min-height:106px;
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.06),
        inset 0 -20px 40px rgba(0,0,0,.18);
      padding:14px 14px 12px 14px;
    }
    .auraHeroTitle{
      font-size:11px;
      letter-spacing:.22em;
      text-transform:uppercase;
      color:rgba(255,255,255,.52);
      margin-bottom:10px;
    }
    .auraOrbHint{
      font-size:13px;
      line-height:1.5;
      color:rgba(255,255,255,.82);
      letter-spacing:.14px;
      text-shadow:0 6px 18px rgba(0,0,0,.45);
      word-break:break-word;
    }
    .auraSubHint{
      margin-top:8px;
      font-size:12px;
      line-height:1.45;
      color:rgba(255,255,255,.56);
    }
  `;
  document.head.appendChild(style);
style.textContent += `
    .auraGrid{
      margin-top:14px;
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:10px;
    }
    .auraBox{
      border-radius:16px;
      background:rgba(255,255,255,.03);
      outline:1px solid rgba(255,255,255,.07);
      padding:12px;
      overflow:hidden;
    }
    .auraBoxWide{ grid-column:1/-1; }

    .auraK{
      font-size:10px;
      letter-spacing:.30px;
      color:rgba(255,255,255,.58);
      text-transform:uppercase;
    }
    .auraRow{
      margin-top:9px;
      display:flex;
      align-items:center;
      gap:10px;
    }
    .auraBar{
      flex:1 1 auto;
      height:7px;
      border-radius:999px;
      background:rgba(255,255,255,.06);
      outline:1px solid rgba(255,255,255,.06);
      overflow:hidden;
    }
    .auraFill{
      display:block;
      height:100%;
      width:50%;
      border-radius:999px;
      background: linear-gradient(180deg, rgba(255,255,255,.62), rgba(255,255,255,.34));
      box-shadow: inset 0 1px 0 rgba(255,255,255,.26);
    }
    .auraN{
      font-size:12px;
      font-weight:780;
      color:rgba(255,255,255,.84);
      white-space:nowrap;
      min-width:28px;
      text-align:right;
    }
    .auraLine{
      margin-top:12px;
      color:rgba(255,255,255,.62);
      font-size:12.5px;
      line-height:1.45;
      letter-spacing:.12px;
    }

    .lmOrbCanvasMain{
      width:100%;
      height:100%;
      display:block;
      border-radius:50%;
    }
    .orb-wrap{
      position:relative;
      overflow:visible;
    }
    .orb-wrap .lmOrbCanvasMain{
      position:absolute;
      inset:0;
      width:100%;
      height:100%;
      border-radius:50%;
      pointer-events:none;
    }
  `;

  // ---------- Modal ----------
  const overlay = createEl("div", {
    class: "auraOverlay",
    role: "dialog",
    "aria-label": "Aura"
  }, `
    <div class="auraCard">
      <div class="auraTop">
        <div class="auraLabel">
          <span class="auraDot" aria-hidden="true"></span>
          <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;">Aura</span>
        </div>
        <button class="auraClose" type="button" aria-label="Close aura">Close</button>
      </div>
      <div class="auraBody">
        <div class="auraHero">
          <div class="auraHeroTitle">Current field</div>
          <div id="auraOrbHint" class="auraOrbHint">—</div>
          <div id="auraSubHint" class="auraSubHint">Shared main orb active</div>
        </div>

        <div class="auraGrid" aria-label="Aura signals">
          <div class="auraBox">
            <div class="auraK">Heat</div>
            <div class="auraRow">
              <span class="auraBar"><i id="auraHeatBar" class="auraFill"></i></span>
              <span id="auraHeatNum" class="auraN">—</span>
            </div>
          </div>

          <div class="auraBox">
            <div class="auraK">Focus</div>
            <div class="auraRow">
              <span class="auraBar"><i id="auraFocusBar" class="auraFill"></i></span>
              <span id="auraFocusNum" class="auraN">—</span>
            </div>
          </div>

          <div class="auraBox">
            <div class="auraK">Depth</div>
            <div class="auraRow">
              <span class="auraBar"><i id="auraDepthBar" class="auraFill"></i></span>
              <span id="auraDepthNum" class="auraN">—</span>
            </div>
          </div>

          <div class="auraBox">
            <div class="auraK">Flux</div>
            <div class="auraRow">
              <span class="auraBar"><i id="auraFluxBar" class="auraFill"></i></span>
              <span id="auraFluxNum" class="auraN">—</span>
            </div>
          </div>

          <div class="auraBox auraBoxWide">
            <div class="auraLine"><span id="auraLine">—</span></div>
          </div>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);

  const closeBtn = $(".auraClose", overlay);
  const hint = $("#auraOrbHint", overlay);
  const subHint = $("#auraSubHint", overlay);

  const heatBar = $("#auraHeatBar", overlay);
  const focusBar = $("#auraFocusBar", overlay);
  const depthBar = $("#auraDepthBar", overlay);
  const fluxBar = $("#auraFluxBar", overlay);

  const heatNum = $("#auraHeatNum", overlay);
  const focusNum = $("#auraFocusNum", overlay);
  const depthNum = $("#auraDepthNum", overlay);
  const fluxNum = $("#auraFluxNum", overlay);

  const auraLine = $("#auraLine", overlay);

  // ---------- Main orb host ----------
  function ensureMainOrbCanvas() {
    let canvas = $("#lmOrbCanvas");
    if (canvas) return canvas;

    const wrap = $(".orb-wrap");
    if (!wrap) return null;

    canvas = createEl("canvas", {
      id: "lmOrbCanvas",
      class: "lmOrbCanvasMain",
      "aria-hidden": "true"
    });
    wrap.appendChild(canvas);
    return canvas;
  }

  const c = ensureMainOrbCanvas();
  const ctx = c ? c.getContext("2d", { alpha: true }) : null;

  // ---------- State ----------
  let open = false;
  let rafId = 0;
  let lastFrame = 0;
  let pollTimer = 0;
  let burstTimeouts = [];

  let heat = 0.55;
  let focus = 0.55;
  let depth = 0.55;
  let flux = 0.50;
  let hasSpotifyPlayback = false;

  let orbSeed = 1337;
  let paletteName = "cosmic";
  let orbTone = {
    glow: 0.75,
    turbulence: 0.65,
    starDensity: 0.60,
    rim: 0.40
  };

  let lockedTrackId = "";
  let lockedPaletteName = "";
  let lockedSeed = 0;
  let lockedTone = null;
  let lockedHint = "";

  const tex = document.createElement("canvas");
  const texCtx = tex.getContext("2d", { willReadFrequently: true });
  let texReady = false;
  let texSignature = "";

  // ---------- UI helpers ----------
  function setHintText(txt) {
    if (hint) hint.textContent = txt || "—";
    if (subHint) subHint.textContent = hasSpotifyPlayback
      ? "Live from Spotify playback"
      : "Metadata-derived field";
  }

  function setBars() {
    const H = clamp01(heat);
    const F = clamp01(focus);
    const D = clamp01(depth);
    const X = clamp01(flux);

    if (heatBar) heatBar.style.width = `${Math.round(H * 100)}%`;
    if (focusBar) focusBar.style.width = `${Math.round(F * 100)}%`;
    if (depthBar) depthBar.style.width = `${Math.round(D * 100)}%`;
    if (fluxBar) fluxBar.style.width = `${Math.round(X * 100)}%`;

    if (heatNum) heatNum.textContent = `${Math.round(H * 100)}`;
    if (focusNum) focusNum.textContent = `${Math.round(F * 100)}`;
    if (depthNum) depthNum.textContent = `${Math.round(D * 100)}`;
    if (fluxNum) fluxNum.textContent = `${Math.round(X * 100)}`;

    if (auraLine) {
      const line =
        (H > 0.78 && X > 0.66) ? "Volcanic. Fast surface." :
        (D > 0.78 && H < 0.46) ? "Deep. Heavy gravity." :
        (F > 0.78 && X < 0.46) ? "Focused. Ritual center." :
        (X > 0.76) ? "Restless. Shifting field." :
        (H > 0.68 && D > 0.60) ? "Hot core. Dark horizon." :
        "Steady. Balanced field.";
      auraLine.textContent = line;
    }
  }

  function normalize01(n, fallback) {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    if (v > 1.001) return clamp01(v / 100);
    return clamp01(v);
  }

  // ---------- Hash / RNG ----------
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
    return function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededUnit(seed, salt) {
    const rand = mulberry32((seed ^ salt) >>> 0);
    return rand();
  }

  function seededRange(seed, salt, a, b) {
    return lerp(a, b, seededUnit(seed, salt));
  }

  function words(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9&+\- ]+/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  }

  function hasAny(set, arr) {
    return arr.some(x => set.has(x));
  }
// ---------- Strong metadata fallback ----------
  function deriveVibeFromMetadata(meta) {
    const track = String(meta.track || "");
    const artist = String(meta.artist || "");
    const album = String(meta.album || "");
    const durationMs = Number(meta.durationMs || 0);

    const seed = hashStringToSeed(`${artist}__${track}__${album}__${durationMs}`);
    const all = new Set([...words(track), ...words(artist), ...words(album)]);

    const deepWords = [
      "doom","slow","grief","ashes","dark","night","shadow","funeral","ocean","void","endless","sorrow","deep","black",
      "pain","grave","blood","ghost","wolf","winter","storm","firewake"
    ];
    const warmWords = [
      "sun","gold","light","love","honey","fire","heart","soul","rose","summer","warm","kiss","crazy","heat"
    ];
    const kineticWords = [
      "run","burn","dance","electric","speed","motor","wild","riot","shake","move","crazy","fuerza","fast","drive"
    ];
    const airyWords = [
      "sky","wind","air","sea","moon","cloud","dream","echo","ambient","mist","soft","blue","float","endless"
    ];
    const focusedWords = [
      "instrumental","interlude","theme","reprise","part","movement","solo","suite","op","nocturne"
    ];

    let H = seededRange(seed, 0x1111, 0.28, 0.78);
    let F = seededRange(seed, 0x2222, 0.22, 0.82);
    let D = seededRange(seed, 0x3333, 0.24, 0.84);
    let X = seededRange(seed, 0x4444, 0.20, 0.86);
    let V = seededRange(seed, 0x5555, 0.18, 0.82);
    let A = seededRange(seed, 0x6666, 0.12, 0.76);

    if (hasAny(all, deepWords)) { D += 0.22; H -= 0.06; V -= 0.16; }
    if (hasAny(all, warmWords)) { H += 0.18; V += 0.16; }
    if (hasAny(all, kineticWords)) { H += 0.14; X += 0.22; }
    if (hasAny(all, airyWords)) { A += 0.22; D -= 0.05; V += 0.04; }
    if (hasAny(all, focusedWords)) { F += 0.22; X -= 0.08; }

    const durMin = durationMs / 60000;
    if (durMin >= 7.5) { D += 0.16; F += 0.10; X -= 0.08; }
    else if (durMin >= 5.5) { D += 0.10; F += 0.06; }
    else if (durMin > 0 && durMin <= 3.2) { X += 0.12; H += 0.06; }

    const artistLc = artist.toLowerCase();
    if (artistLc.includes("mono") || artistLc.includes("sigur") || artistLc.includes("olafur")) {
      D += 0.18; F += 0.12; A += 0.10; H -= 0.04; X -= 0.06;
    }
    if (artistLc.includes("nightstalker") || artistLc.includes("metallica") || artistLc.includes("zeal") || artistLc.includes("ardor")) {
      H += 0.16; X += 0.10; D += 0.06; V -= 0.03;
    }
    if (artistLc.includes("bonobo") || artistLc.includes("quantic") || artistLc.includes("thievery")) {
      X += 0.10; A += 0.10; V += 0.06;
    }
    if (artistLc.includes("yo la tengo")) {
      D += 0.10; A += 0.12; X -= 0.02; V += 0.02;
    }

    H = clamp01(H);
    F = clamp01(F);
    D = clamp01(D);
    X = clamp01(X);
    V = clamp01(V);
    A = clamp01(A);

    const arr = [H, F, D, X];
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;

    if (variance < 0.008) {
      H = clamp01(H + seededRange(seed, 0x7777, -0.16, 0.16));
      F = clamp01(F + seededRange(seed, 0x8888, -0.16, 0.16));
      D = clamp01(D + seededRange(seed, 0x9999, -0.16, 0.16));
      X = clamp01(X + seededRange(seed, 0xAAAA, -0.16, 0.16));
    }

    return {
      heat: H,
      focus: F,
      depth: D,
      flux: X,
      valence: V,
      acoustic: A
    };
  }

  // ---------- Palettes ----------
  const PALETTES = {
    deep:    ["#060814", "#17143d", "#34247d", "#ff8a38", "#ffd7b4"],
    kinetic: ["#04101d", "#063f68", "#00d7d9", "#7e39ff", "#ff64b0"],
    warm:    ["#140b0b", "#3a1415", "#8d2b1f", "#ffc047", "#fff0c9"],
    airy:    ["#091219", "#12303a", "#3eb9b4", "#b5ecd8", "#fff3dc"],
    cosmic:  ["#050812", "#1a1152", "#432caa", "#2cc6ff", "#ffba66"]
  };

  function choosePaletteFromVibe(vibe) {
    const H = vibe.heat, D = vibe.depth, X = vibe.flux;
    const V = vibe.valence, A = vibe.acoustic;

    if (D > 0.70 && H < 0.58) return "deep";
    if (V > 0.62 && H > 0.52) return "warm";
    if (X > 0.68 && H > 0.60) return "kinetic";
    if (A > 0.62 && H < 0.62) return "airy";
    return "cosmic";
  }

  function vibeToTone(vibe) {
    const H = clamp01(vibe.heat);
    const F = clamp01(vibe.focus);
    const D = clamp01(vibe.depth);
    const X = clamp01(vibe.flux);

    return {
      glow: clamp01(0.35 + H * 0.40 + D * 0.18),
      turbulence: clamp01(0.20 + X * 0.65 + H * 0.10),
      starDensity: clamp01(0.22 + D * 0.45 + F * 0.12),
      rim: clamp01(0.18 + F * 0.40 + D * 0.18)
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

  function mixHex(a, b, t) {
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    const r = Math.round(lerp(A.r, B.r, t));
    const g = Math.round(lerp(A.g, B.g, t));
    const bb = Math.round(lerp(A.b, B.b, t));
    return `rgb(${r},${g},${bb})`;
  }

  // ---------- Texture builder ----------
  function rebuildTextureIfNeeded() {
    const sig = [
      paletteName,
      orbSeed,
      Math.round(heat * 100),
      Math.round(focus * 100),
      Math.round(depth * 100),
      Math.round(flux * 100)
    ].join("|");

    if (sig === texSignature && texReady) return;

    texSignature = sig;
    tex.width = 320;
    tex.height = 320;

    const w = tex.width;
    const h = tex.height;
    texCtx.clearRect(0, 0, w, h);

    const pal = PALETTES[paletteName] || PALETTES.cosmic;
    const rand = mulberry32(orbSeed ^ 0x91ab32cd);

    const bg = texCtx.createRadialGradient(w * 0.5, h * 0.5, 10, w * 0.5, h * 0.5, w * 0.52);
    bg.addColorStop(0.00, rgba(pal[2], 0.15 + depth * 0.12));
    bg.addColorStop(0.40, rgba(pal[1], 0.14 + heat * 0.08));
    bg.addColorStop(1.00, "rgba(0,0,0,0)");
    texCtx.fillStyle = bg;
    texCtx.fillRect(0, 0, w, h);

    const blobCount = Math.round(12 + heat * 10 + flux * 10);
    for (let i = 0; i < blobCount; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = lerp(18, 74, rand()) * (0.85 + heat * 0.55);
      const col = pal[1 + (i % 3)];
      const g = texCtx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(col, 0.15 + rand() * 0.14));
      g.addColorStop(0.55, rgba(col, 0.06 + rand() * 0.06));
      g.addColorStop(1, "rgba(0,0,0,0)");
      texCtx.fillStyle = g;
      texCtx.beginPath();
      texCtx.arc(x, y, r, 0, TAU);
      texCtx.fill();
    }

    const threads = Math.round(34 + flux * 36 + heat * 16);
    texCtx.lineCap = "round";
    for (let i = 0; i < threads; i++) {
      const a = rand() * TAU;
      const len = lerp(32, 108, rand()) * (0.85 + flux * 0.35);
      const ox = w * 0.5 + Math.cos(a) * lerp(12, 58, rand());
      const oy = h * 0.5 + Math.sin(a) * lerp(12, 58, rand());
      const ex = ox + Math.cos(a + rand() * 0.7 - 0.35) * len;
      const ey = oy + Math.sin(a + rand() * 0.7 - 0.35) * len;
      const grad = texCtx.createLinearGradient(ox, oy, ex, ey);
      grad.addColorStop(0, rgba(pal[4], 0.10 + rand() * 0.08));
      grad.addColorStop(1, rgba(pal[2], 0.00));
      texCtx.strokeStyle = grad;
      texCtx.lineWidth = 0.7 + rand() * 1.6;
      texCtx.beginPath();
      texCtx.moveTo(ox, oy);
      texCtx.quadraticCurveTo(
        lerp(ox, ex, 0.5) + rand() * 30 - 15,
        lerp(oy, ey, 0.5) + rand() * 30 - 15,
        ex,
        ey
      );
      texCtx.stroke();
    }

    const starCount = Math.round(22 + orbTone.starDensity * 58 + depth * 24);
    for (let i = 0; i < starCount; i++) {
      const a = rand() * TAU;
      const rr = lerp(10, 130, Math.pow(rand(), 0.85));
      const x = w * 0.5 + Math.cos(a) * rr;
      const y = h * 0.5 + Math.sin(a) * rr;
      const r = lerp(0.4, 1.9, rand());
      const alpha = lerp(0.10, 0.65, rand()) * (0.65 + depth * 0.40);
      texCtx.fillStyle = rgba(rand() > 0.45 ? pal[4] : pal[3], alpha);
      texCtx.beginPath();
      texCtx.arc(x, y, r, 0, TAU);
      texCtx.fill();
    }

    texReady = true;
  }

  function vibeFromAudioFeatures(f) {
    const energy = normalize01(f?.energy, 0.55);
    const dance = normalize01(f?.danceability, 0.50);
    const acoustic = normalize01(f?.acousticness, 0.30);
    const instrumental = normalize01(f?.instrumentalness, 0.20);
    const speech = normalize01(f?.speechiness, 0.08);
    const valence = normalize01(f?.valence, 0.45);
    const tempo = Number.isFinite(Number(f?.tempo)) ? Number(f.tempo) : 110;

    const loudRaw = Number.isFinite(Number(f?.loudness)) ? Number(f.loudness) : -10;
    const loudNorm = clamp01(invLerp(-32, -3, loudRaw));
    const tempoNorm = clamp01(invLerp(60, 180, tempo));

    const H = clamp01(
      energy * 0.44 +
      loudNorm * 0.22 +
      tempoNorm * 0.14 +
      dance * 0.10 +
      (1 - acoustic) * 0.10
    );

    const F = clamp01(
      instrumental * 0.30 +
      (1 - speech) * 0.20 +
      (1 - dance) * 0.10 +
      acoustic * 0.12 +
      (1 - Math.abs(valence - 0.50) * 1.45) * 0.12 +
      (1 - tempoNorm) * 0.16
    );

    const D = clamp01(
      acoustic * 0.20 +
      instrumental * 0.24 +
      (1 - valence) * 0.14 +
      (1 - loudNorm) * 0.14 +
      (1 - tempoNorm) * 0.16 +
      energy * 0.12
    );

    const X = clamp01(
      dance * 0.26 +
      tempoNorm * 0.20 +
      energy * 0.22 +
      speech * 0.08 +
      (1 - instrumental) * 0.10 +
      loudNorm * 0.14
    );

    return {
      heat: H,
      focus: F,
      depth: D,
      flux: X,
      valence,
      acoustic
    };
  }

  function applyVibe(vibe, meta, trackId) {
    heat = clamp01(vibe.heat);
    focus = clamp01(vibe.focus);
    depth = clamp01(vibe.depth);
    flux = clamp01(vibe.flux);

    if (trackId && lockedTrackId === trackId && lockedPaletteName && lockedSeed && lockedTone) {
      paletteName = lockedPaletteName;
      orbSeed = lockedSeed;
      orbTone = { ...lockedTone };
      if (lockedHint) setHintText(lockedHint);
    } else {
      paletteName = choosePaletteFromVibe(vibe);
      orbSeed = hashStringToSeed(`${trackId || ""}__${meta.artist || ""}__${meta.track || ""}__${paletteName}`);
      orbTone = vibeToTone(vibe);

      const newHint = [
        meta.artist || "Unknown artist",
        meta.track || "Unknown track"
      ].filter(Boolean).join(" — ");

      setHintText(newHint);

      if (trackId) {
        lockedTrackId = trackId;
        lockedPaletteName = paletteName;
        lockedSeed = orbSeed;
        lockedTone = { ...orbTone };
        lockedHint = newHint;
      }
    }

    setBars();
    rebuildTextureIfNeeded();
  }
// ---------- Shared main orb draw ----------
  function resizeCanvas() {
    if (!c || !ctx) return;

    const rect = c.getBoundingClientRect();
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const w = Math.max(64, Math.round(rect.width * dpr));
    const h = Math.max(64, Math.round(rect.height * dpr));

    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
  }

  function drawOrb(ts) {
    if (!ctx || !c) return;

    const minFrame = 1000 / FPS_CAP;
    if (ts - lastFrame < minFrame) {
      rafId = requestAnimationFrame(drawOrb);
      return;
    }
    lastFrame = ts;

    const w = c.width;
    const h = c.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const t = ts * 0.001;
    const pal = PALETTES[paletteName] || PALETTES.cosmic;

    ctx.clearRect(0, 0, w, h);

    const radius = Math.min(w, h) * lerp(0.40, 0.455, 0.55 + heat * 0.20);
    const breathing = 1 + Math.sin(t * lerp(0.7, 1.8, 0.2 + flux * 0.5)) * (0.015 + heat * 0.020);
    const turbulenceAmp = lerp(3, 16, orbTone.turbulence);
    const rimAlpha = 0.10 + orbTone.rim * 0.30;

    const farHalo = ctx.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius * 2.0);
    farHalo.addColorStop(0.0, rgba(pal[2], 0.07 + heat * 0.06));
    farHalo.addColorStop(0.32, rgba(pal[3], 0.05 + depth * 0.05));
    farHalo.addColorStop(1.0, "rgba(0,0,0,0)");
    ctx.fillStyle = farHalo;
    ctx.fillRect(0, 0, w, h);

    const outerGlow = ctx.createRadialGradient(cx, cy, radius * 0.42, cx, cy, radius * 1.30);
    outerGlow.addColorStop(0, rgba(pal[4], 0.12 + orbTone.glow * 0.06));
    outerGlow.addColorStop(0.45, rgba(pal[3], 0.08 + orbTone.glow * 0.06));
    outerGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.32, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    const pts = 220;
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * TAU;
      const wobble =
        Math.sin(a * 3 + t * 0.8) * turbulenceAmp * 0.18 +
        Math.sin(a * 5 - t * 1.2) * turbulenceAmp * 0.10 +
        Math.sin(a * 9 + t * 1.7) * turbulenceAmp * 0.05;
      const rr = radius * breathing + wobble;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.clip();

    const base = ctx.createRadialGradient(
      cx - radius * 0.22, cy - radius * 0.26, radius * 0.10,
      cx, cy, radius * 1.02
    );
    base.addColorStop(0.00, rgba(pal[4], 0.80));
    base.addColorStop(0.15, rgba(pal[3], 0.58));
    base.addColorStop(0.42, rgba(pal[2], 0.46));
    base.addColorStop(0.72, rgba(pal[1], 0.70));
    base.addColorStop(1.00, rgba(pal[0], 0.98));
    ctx.fillStyle = base;
    ctx.fillRect(cx - radius * 1.2, cy - radius * 1.2, radius * 2.4, radius * 2.4);

    if (texReady) {
      const driftA = Math.sin(t * 0.34 + orbSeed * 0.000001) * radius * 0.05;
      const driftB = Math.cos(t * 0.41 + orbSeed * 0.0000017) * radius * 0.05;

      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.36 + heat * 0.14;
      ctx.drawImage(tex, cx - radius - driftA, cy - radius - driftB, radius * 2, radius * 2);

      ctx.globalAlpha = 0.22 + flux * 0.12;
      ctx.drawImage(tex, cx - radius + driftB * 0.6, cy - radius - driftA * 0.6, radius * 2, radius * 2);

      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = 0.12 + depth * 0.10;
      ctx.drawImage(tex, cx - radius * 0.96, cy - radius * 0.96, radius * 1.92, radius * 1.92);

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    ctx.globalCompositeOperation = "lighter";
    const arcCount = Math.round(4 + flux * 7 + heat * 2);
    for (let i = 0; i < arcCount; i++) {
      const n = (i + 1) / arcCount;
      const a0 = t * (0.35 + i * 0.07) + i * 1.3;
      const a1 = a0 + lerp(0.55, 1.35, 0.25 + flux * 0.65);
      const rr = radius * lerp(0.38, 0.88, n) + Math.sin(t * 1.2 + i) * radius * 0.02;
      const arcGrad = ctx.createLinearGradient(cx - rr, cy - rr, cx + rr, cy + rr);
      arcGrad.addColorStop(0, rgba(pal[4], 0.00));
      arcGrad.addColorStop(0.3, rgba(pal[3], 0.12 + heat * 0.10));
      arcGrad.addColorStop(1, rgba(pal[2], 0.00));
      ctx.strokeStyle = arcGrad;
      ctx.lineWidth = lerp(0.7, 2.1, 0.2 + orbTone.glow * 0.7) * (0.8 + n * 0.6);
      ctx.beginPath();
      ctx.arc(cx, cy, rr, a0, a1);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";

    const inner = ctx.createRadialGradient(cx, cy, radius * 0.04, cx, cy, radius * 0.65);
    inner.addColorStop(0, rgba(pal[4], 0.16 + heat * 0.14));
    inner.addColorStop(0.50, rgba(pal[3], 0.08 + depth * 0.06));
    inner.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.68, 0, TAU);
    ctx.fill();

    const core = ctx.createRadialGradient(
      cx - radius * 0.08, cy - radius * 0.10, radius * 0.02,
      cx, cy, radius * 0.44
    );
    core.addColorStop(0, rgba(mixHex(pal[4], "#ffffff", 0.45), 0.22 + heat * 0.08));
    core.addColorStop(0.22, rgba(pal[3], 0.16 + heat * 0.08));
    core.addColorStop(0.72, rgba(pal[1], 0.14 + depth * 0.08));
    core.addColorStop(1, rgba(pal[0], 0.0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.46, 0, TAU);
    ctx.fill();

    const rand = mulberry32((orbSeed ^ ((ts / 100) | 0)) >>> 0);
    const sparkCount = Math.round(10 + orbTone.starDensity * 24);
    for (let i = 0; i < sparkCount; i++) {
      const a = rand() * TAU;
      const rr = Math.pow(rand(), 0.92) * radius * 0.90;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      const r = lerp(0.4, 1.7, rand()) * (0.75 + heat * 0.40);
      const alpha = lerp(0.05, 0.45, rand()) * (0.70 + depth * 0.35);
      ctx.fillStyle = rgba(rand() > 0.4 ? pal[4] : pal[3], alpha);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    ctx.restore();

    ctx.strokeStyle = rgba(pal[4], rimAlpha);
    ctx.lineWidth = 1.3 + orbTone.rim * 1.7;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * breathing, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = rgba(pal[3], 0.07 + orbTone.rim * 0.12);
    ctx.lineWidth = 4 + orbTone.rim * 5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * breathing * 1.02, 0, TAU);
    ctx.stroke();

    rafId = requestAnimationFrame(drawOrb);
  }

  function startOrb() {
    if (!ctx || rafId) return;
    resizeCanvas();
    rebuildTextureIfNeeded();
    rafId = requestAnimationFrame(drawOrb);
  }

  // ---------- Spotify sync ----------
  async function syncAura() {
    let trackId = "";
    let meta = {
      track: "",
      artist: "",
      album: "",
      durationMs: 0
    };

    try {
      const player = await getPlayer();
      if (!player || player.__no_content || !player.item) {
        hasSpotifyPlayback = false;
        const vibe = deriveVibeFromMetadata({ track: "", artist: "", album: "", durationMs: 0 });
        applyVibe(vibe, meta, "");
        return;
      }

      hasSpotifyPlayback = true;
      const item = player.item || {};
      trackId = String(item.id || "");
      meta.track = String(item.name || "");
      meta.artist = Array.isArray(item.artists) ? item.artists.map(a => a && a.name).filter(Boolean).join(", ") : "";
      meta.album = item.album && item.album.name ? String(item.album.name) : "";
      meta.durationMs = Number(item.duration_ms || 0);

      let vibe = null;
      try {
        if (trackId) {
          const feats = await getAudioFeatures(trackId);
          vibe = vibeFromAudioFeatures(feats || {});
        }
      } catch {
        vibe = null;
      }

      if (!vibe) vibe = deriveVibeFromMetadata(meta);
      applyVibe(vibe, meta, trackId);
    } catch {
      hasSpotifyPlayback = false;
      const vibe = deriveVibeFromMetadata(meta);
      applyVibe(vibe, meta, trackId);
    }
  }

  function clearBurst() {
    burstTimeouts.forEach(id => clearTimeout(id));
    burstTimeouts = [];
  }

  function scheduleBurstSync() {
    clearBurst();
    BURST_STEPS.forEach(ms => {
      const id = setTimeout(() => { safeCall(() => syncAura()); }, ms);
      burstTimeouts.push(id);
    });
  }

  function restartPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      safeCall(() => syncAura());
    }, open ? OPEN_POLL_MS : CLOSED_POLL_MS);
  }

  // ---------- Modal open / close ----------
  function openAura() {
    open = true;
    overlay.classList.add("on");
    setBars();
    restartPolling();
    scheduleBurstSync();
    safeCall(() => syncAura());
  }

  function closeAura() {
    open = false;
    overlay.classList.remove("on");
    restartPolling();
    clearBurst();
  }

  closeBtn?.addEventListener("click", closeAura);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeAura();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) closeAura();
  });
  window.addEventListener("resize", resizeCanvas, { passive: true });

  titleEl.addEventListener("click", openAura);
  titleEl.addEventListener("mouseenter", () => titleEl.classList.add("auraHover"));
  titleEl.addEventListener("mouseleave", () => titleEl.classList.remove("auraHover"));
  titleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAura();
    }
  });

  // ---------- Spotify icon in header ----------
  function spotifySvg() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 1.75A10.25 10.25 0 1 0 22.25 12 10.26 10.26 0 0 0 12 1.75Zm4.7 14.78a.92.92 0 0 1-1.27.3 8.95 8.95 0 0 0-8.9-.45.92.92 0 1 1-.78-1.67 10.8 10.8 0 0 1 10.76.54.92.92 0 0 1 .19 1.28Zm1.8-3.02a1.12 1.12 0 0 1-1.53.37 11.78 11.78 0 0 0-11.67-.58 1.12 1.12 0 1 1-.97-2.02 14.02 14.02 0 0 1 13.88.68 1.12 1.12 0 0 1 .29 1.55Zm.15-3.18a1.34 1.34 0 0 1-1.82.46 14.9 14.9 0 0 0-14.69-.71 1.34 1.34 0 0 1-1.18-2.41 17.58 17.58 0 0 1 17.36.84 1.34 1.34 0 0 1 .33 1.82Z"/>
      </svg>
    `;
  }

  function findHeaderActions() {
    return $("#headerActions") || $(".header-actions") || $(".header__actions") || brandEl;
  }

  function updateSpotifyBtnVisual(btn) {
    if (!btn) return;
    btn.setAttribute("data-state", isConnected() ? "on" : "off");
  }

  async function handleSpotifyButtonTap(btn) {
    if (!btn) return;

    if (isConnected()) {
      try {
        if (window.SpotifyAuth && typeof window.SpotifyAuth.disconnect === "function") {
          await window.SpotifyAuth.disconnect();
        } else if (window.SpotifyPlayer && typeof window.SpotifyPlayer.disconnect === "function") {
          await window.SpotifyPlayer.disconnect();
        } else {
          try {
            const keys = Object.keys(localStorage);
            keys.forEach(k => {
              const lk = String(k || "").toLowerCase();
              if (lk.includes("spotify")) localStorage.removeItem(k);
            });
          } catch {}
        }
      } catch {}
      updateSpotifyBtnVisual(btn);
      safeCall(() => syncAura());
      return;
    }

    try {
      if (window.SpotifyAuth && typeof window.SpotifyAuth.connect === "function") {
        await window.SpotifyAuth.connect();
      } else if (window.SpotifyPlayer && typeof window.SpotifyPlayer.connect === "function") {
        await window.SpotifyPlayer.connect();
      } else if (window.SpotifyAuth && typeof window.SpotifyAuth.login === "function") {
        await window.SpotifyAuth.login();
      }
    } catch {}

    updateSpotifyBtnVisual(btn);
    scheduleBurstSync();
  }

  function ensureSpotifyButton() {
    const host = findHeaderActions();
    if (!host) return null;

    let btn = $(".lmSpotifyIcoBtn", host);
    if (!btn) {
      btn = createEl("button", {
        class: "lmSpotifyIcoBtn",
        type: "button",
        "aria-label": "Spotify connection"
      }, spotifySvg());

      btn.addEventListener("click", () => handleSpotifyButtonTap(btn));
      host.appendChild(btn);
    }

    updateSpotifyBtnVisual(btn);
    return btn;
  }

  let spotifyBtn = ensureSpotifyButton();

  const mo = new MutationObserver(() => {
    spotifyBtn = ensureSpotifyButton() || spotifyBtn;
    if (spotifyBtn) updateSpotifyBtnVisual(spotifyBtn);
    resizeCanvas();
  });

  mo.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // ---------- Boot ----------
  setBars();
  resizeCanvas();
  rebuildTextureIfNeeded();
  restartPolling();
  scheduleBurstSync();
  startOrb();

  setInterval(() => {
    if (spotifyBtn) updateSpotifyBtnVisual(spotifyBtn);
  }, 2500);

  safeCall(() => syncAura());
})();