/* aura-tab.js (FULL FILE REPLACE) — PART 1/4
   Listening Mirror — Shared Main Orb + Aura Details Panel + Plasma Reference Renderer
   ✅ ONE orb system only (main screen)
   ✅ Title portal
   ✅ Spotify button in header
   ✅ Aura modal = details only
   ✅ Shared main orb
   ✅ Album art adaptive palette
   ✅ Hot/cold cinematic plasma renderer
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
  const ease = (t) => t * t * (3 - 2 * t);
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

  const titleEl = $(".wordmark .title");
  const brandEl = $(".brand");
  if (!titleEl || !brandEl) return;

  titleEl.textContent = "listening mirror";
  titleEl.style.cursor = "pointer";
  titleEl.style.userSelect = "none";
  titleEl.setAttribute("role", "button");
  titleEl.setAttribute("tabindex", "0");
  titleEl.setAttribute("aria-label", "Open aura");

  const style = document.createElement("style");
  style.id = "auraTabStylesPlasmaRef";
  style.textContent = `
    .wordmark .title{
      letter-spacing:1.15px !important;
      font-weight:680 !important;
      text-transform:none !important;
      background:linear-gradient(180deg, rgba(255,255,255,.90), rgba(220,225,234,.62)) !important;
      -webkit-background-clip:text !important;
      background-clip:text !important;
      color:transparent !important;
      position:relative !important;
      display:inline-block !important;
      padding:2px 2px 3px 2px !important;
      transform:translateZ(0);
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
      transition:opacity .18s ease, transform .18s ease;
      transform:translateY(0px);
      pointer-events:none;
    }
    .wordmark .title:active:after{ opacity:.85; transform:translateY(1px); }
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
    .lmSpotifyIcoBtn:active{ transform:translateY(1px); }
    .lmSpotifyIcoBtn svg{
      width:20px;
      height:20px;
      display:block;
      transition:opacity .15s ease, filter .15s ease;
    }
    .lmSpotifyIcoBtn[data-state="off"] svg{
      fill:rgba(255,255,255,.55);
      opacity:.95;
      filter:none;
    }
    .lmSpotifyIcoBtn[data-state="on"] svg{
      fill:#000000;
      opacity:1;
      filter:drop-shadow(0 0 1.5px rgba(255,255,255,.45));
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
      backdrop-filter:blur(10px);
      -webkit-backdrop-filter:blur(10px);
    }
    .auraCard{
      width:min(420px, calc(100vw - 26px));
      border-radius:22px;
      background:linear-gradient(180deg, rgba(18,20,24,.92), rgba(12,13,16,.92));
      outline:1px solid rgba(255,255,255,.10);
      box-shadow:0 30px 90px rgba(0,0,0,.68);
      overflow:hidden;
      transform:translateY(6px) scale(.985);
      opacity:0;
      transition:transform .18s ease, opacity .18s ease;
      will-change:transform, opacity;
    }
    .auraOverlay.on{ display:flex; }
    .auraOverlay.on .auraCard{ transform:translateY(0) scale(1); opacity:1; }

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
      box-shadow:0 0 0 3px rgba(160,190,255,.10);
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
    .auraClose:active{ transform:translateY(1px); }

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
      background:linear-gradient(180deg, rgba(255,255,255,.62), rgba(255,255,255,.34));
      box-shadow:inset 0 1px 0 rgba(255,255,255,.26);
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
    glow: 0.85,
    turbulence: 0.78,
    starDensity: 0.65,
    rim: 0.62
  };

  let lockedTrackId = "";
  let lockedPaletteName = "";
  let lockedSeed = 0;
  let lockedTone = null;
  let lockedHint = "";

  let beatTempo = 110;
  let beatEnergy = 0.55;

  const albumPaletteCache = new Map();
  let albumPalette = null;
  let albumPaletteTrackId = "";

  function setHintText(txt) {
    if (hint) hint.textContent = txt || "—";
    if (subHint) {
      subHint.textContent = hasSpotifyPlayback
        ? (albumPalette ? "Live from Spotify + album palette" : "Live from Spotify playback")
        : "Metadata-derived field";
    }
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

    H = clamp01(H);
    F = clamp01(F);
    D = clamp01(D);
    X = clamp01(X);
    V = clamp01(V);
    A = clamp01(A);

    return {
      heat: H,
      focus: F,
      depth: D,
      flux: X,
      valence: V,
      acoustic: A
    };
  }

  function vibeToTone(vibe) {
    const H = clamp01(vibe.heat);
    const F = clamp01(vibe.focus);
    const D = clamp01(vibe.depth);
    const X = clamp01(vibe.flux);

    return {
      glow: clamp01(0.58 + H * 0.32 + D * 0.14),
      turbulence: clamp01(0.42 + X * 0.46 + H * 0.08),
      starDensity: clamp01(0.18 + D * 0.24 + F * 0.08),
      rim: clamp01(0.34 + F * 0.30 + D * 0.18)
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
    return "#" + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
  }

  function brighten(hex, amt = 0.18) {
    const c = hexToRgb(hex);
    return rgbToHex(
      Math.round(lerp(c.r, 255, amt)),
      Math.round(lerp(c.g, 255, amt)),
      Math.round(lerp(c.b, 255, amt))
    );
  }

  function darken(hex, amt = 0.35) {
    const c = hexToRgb(hex);
    return rgbToHex(
      Math.round(c.r * (1 - amt)),
      Math.round(c.g * (1 - amt)),
      Math.round(c.b * (1 - amt))
    );
  }

  function mixHex(a, b, t) {
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    const r = Math.round(lerp(A.r, B.r, t));
    const g = Math.round(lerp(A.g, B.g, t));
    const bb = Math.round(lerp(A.b, B.b, t));
    return `rgb(${r},${g},${bb})`;
  }

  async function extractPaletteFromImage(url) {
    if (!url) return null;
    if (albumPaletteCache.has(url)) return albumPaletteCache.get(url);

    const promise = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx2 = canvas.getContext("2d", { willReadFrequently: true });
          const size = 48;
          canvas.width = size;
          canvas.height = size;
          ctx2.drawImage(img, 0, 0, size, size);

          const data = ctx2.getImageData(0, 0, size, size).data;

          let rs = 0, gs = 0, bs = 0, count = 0;
          let bestSat = -1;
          let vibrant = { r: 255, g: 180, b: 90 };

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

          const ar = Math.round(rs / count);
          const ag = Math.round(gs / count);
          const ab = Math.round(bs / count);

          const dominantHex = rgbToHex(ar, ag, ab);
          const vibrantHex = rgbToHex(vibrant.r, vibrant.g, vibrant.b);

          resolve({
            dominantHex,
            vibrantHex,
            warmHex: brighten(vibrantHex, 0.10),
            coldHex: rgbToHex(
              Math.round(lerp(vibrant.r, 80, 0.72)),
              Math.round(lerp(vibrant.g, 180, 0.72)),
              Math.round(lerp(vibrant.b, 255, 0.78))
            ),
            darkHex: darken(dominantHex, 0.62),
            lightHex: brighten(vibrantHex, 0.42)
          });
        } catch {
          resolve(null);
        }
      };

      img.onerror = () => resolve(null);
      img.src = url;
    });

    albumPaletteCache.set(url, promise);
    return promise;
  }

  function getRenderPalette() {
    if (albumPalette) {
      return {
        bg: albumPalette.darkHex,
        warm: albumPalette.warmHex,
        cold: albumPalette.coldHex,
        fusion: albumPalette.vibrantHex,
        light: albumPalette.lightHex
      };
    }

    return {
      bg: "#050812",
      warm: "#ff8a38",
      cold: "#49c9ff",
      fusion: "#c378ff",
      light: "#fff0dc"
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
      paletteName = "ref";
      orbSeed = hashStringToSeed(`${trackId || ""}__${meta.artist || ""}__${meta.track || ""}`);
      orbTone = vibeToTone(vibe);

      beatEnergy = heat;
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
        }
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

  function drawFilaments(ctx, cx, cy, r, t, palette, pulse) {
    const layers = 14;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < layers; i++) {
      const frac = i / Math.max(1, layers - 1);
      const sideWarm = i < layers / 2;
      const colA = sideWarm ? palette.warm : palette.cold;
      const colB = sideWarm ? palette.fusion : palette.light;
      const alpha = (0.15 + (1 - frac) * 0.20 + pulse * 0.10) * (0.78 + heat * 0.35);

      const a0 = (sideWarm ? PI * 0.90 : -PI * 0.08) + Math.sin(t * (0.8 + frac * 0.7) + i * 0.8) * 0.32;
      const a1 = (sideWarm ? PI * 1.95 : PI * 0.96) + Math.cos(t * (1.05 + frac * 0.55) + i * 0.9) * 0.34;

      const startR = r * lerp(0.52, 0.90, frac);
      const endR = r * lerp(0.96, 0.68, frac);

      const x1 = cx + Math.cos(a0) * startR;
      const y1 = cy + Math.sin(a0) * startR;
      const x4 = cx + Math.cos(a1) * endR;
      const y4 = cy + Math.sin(a1) * endR;

      const ctrlBias = sideWarm ? -1 : 1;
      const c1x = cx + ctrlBias * r * lerp(0.26, 0.40, frac) + Math.cos(a0 + 0.8) * r * 0.16;
      const c1y = cy - r * lerp(0.22, 0.05, frac) + Math.sin(t + i) * r * 0.02;
      const c2x = cx - ctrlBias * r * lerp(0.06, 0.20, frac) + Math.cos(a1 - 0.5) * r * 0.12;
      const c2y = cy + r * lerp(0.08, 0.22, frac) + Math.cos(t * 0.9 + i) * r * 0.02;

      const grad = ctx.createLinearGradient(x1, y1, x4, y4);
      grad.addColorStop(0.0, rgba(colA, 0.00));
      grad.addColorStop(0.18, rgba(colA, alpha * 0.85));
      grad.addColorStop(0.55, rgba(colB, alpha));
      grad.addColorStop(1.0, rgba(colB, 0.00));

      ctx.strokeStyle = grad;
      ctx.lineWidth = lerp(1.0, 4.8, 1 - frac) * (0.72 + pulse * 0.28);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x4, y4);
      ctx.stroke();
    }

    ctx.restore();
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

    const palette = getRenderPalette();

    const bpm = Math.max(60, Math.min(180, beatTempo || 110));
    const beat = (t * bpm / 60) % 1;
    const beatPulse = Math.pow(Math.max(0, 1 - beat), 3.5) * (0.10 + beatEnergy * 0.12);

    ctx.clearRect(0, 0, w, h);

    const baseR = Math.min(w, h) * 0.405;
    const radius = baseR * (1 + Math.sin(t * (0.85 + flux * 0.45)) * 0.012 + beatPulse * 0.08);

    const outerHalo = ctx.createRadialGradient(cx, cy, radius * 0.48, cx, cy, radius * 1.62);
    outerHalo.addColorStop(0.0, rgba(palette.light, 0.10 + beatPulse * 0.10));
    outerHalo.addColorStop(0.28, rgba(palette.warm, 0.12 + heat * 0.10));
    outerHalo.addColorStop(0.52, rgba(palette.cold, 0.10 + depth * 0.08));
    outerHalo.addColorStop(1.0, "rgba(0,0,0,0)");
    ctx.fillStyle = outerHalo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.70, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    const pts = 260;
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * TAU;
      const wobble =
        Math.sin(a * 3 + t * 1.15) * radius * 0.018 * (0.55 + flux * 0.60) +
        Math.sin(a * 7 - t * 1.60) * radius * 0.010 * (0.45 + heat * 0.45) +
        Math.sin(a * 11 + t * 2.0) * radius * 0.005 * (0.40 + depth * 0.30);
      const rr = radius + wobble;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.clip();

    const leftField = ctx.createRadialGradient(
      cx - radius * 0.35, cy - radius * 0.06, radius * 0.10,
      cx - radius * 0.18, cy, radius * 1.06
    );
    leftField.addColorStop(0.00, rgba(palette.light, 0.85));
    leftField.addColorStop(0.18, rgba(palette.warm, 0.78));
    leftField.addColorStop(0.58, rgba(palette.warm, 0.22));
    leftField.addColorStop(1.00, "rgba(0,0,0,0)");
    ctx.fillStyle = leftField;
    ctx.fillRect(cx - radius * 1.2, cy - radius * 1.2, radius * 2.4, radius * 2.4);

    const rightField = ctx.createRadialGradient(
      cx + radius * 0.30, cy - radius * 0.03, radius * 0.10,
      cx + radius * 0.16, cy, radius * 1.04
    );
    rightField.addColorStop(0.00, rgba(palette.light, 0.68));
    rightField.addColorStop(0.18, rgba(palette.cold, 0.82));
    rightField.addColorStop(0.58, rgba(palette.cold, 0.22));
    rightField.addColorStop(1.00, "rgba(0,0,0,0)");
    ctx.fillStyle = rightField;
    ctx.fillRect(cx - radius * 1.2, cy - radius * 1.2, radius * 2.4, radius * 2.4);

    const fusion = ctx.createRadialGradient(cx, cy + radius * 0.03, radius * 0.03, cx, cy, radius * 0.68);
    fusion.addColorStop(0.00, rgba(palette.light, 0.48 + beatPulse * 0.35));
    fusion.addColorStop(0.16, rgba(palette.fusion, 0.38 + beatPulse * 0.18));
    fusion.addColorStop(0.52, rgba(palette.fusion, 0.08));
    fusion.addColorStop(1.00, "rgba(0,0,0,0)");
    ctx.fillStyle = fusion;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.78, 0, TAU);
    ctx.fill();

    drawFilaments(ctx, cx, cy, radius, t, palette, beatPulse);

    ctx.globalCompositeOperation = "screen";

    const arcBands = 8;
    for (let i = 0; i < arcBands; i++) {
      const warmSide = i < arcBands / 2;
      const col = warmSide ? palette.warm : palette.cold;
      const rr = radius * lerp(0.48, 0.95, i / (arcBands - 1));
      const start = (warmSide ? PI * 0.88 : -0.02) + Math.sin(t * (0.9 + i * 0.07) + i) * 0.18;
      const end = start + lerp(0.7, 1.55, 0.65 + flux * 0.25);
      const grad = ctx.createLinearGradient(cx - rr, cy - rr, cx + rr, cy + rr);
      grad.addColorStop(0, rgba(col, 0));
      grad.addColorStop(0.5, rgba(col, 0.18 + beatPulse * 0.10));
      grad.addColorStop(1, rgba(col, 0));
      ctx.strokeStyle = grad;
      ctx.lineWidth = lerp(1.2, 4.6, 1 - i / arcBands);
      ctx.beginPath();
      ctx.arc(cx, cy, rr, start, end);
      ctx.stroke();
    }

    const dustRand = mulberry32((orbSeed ^ ((ts / 80) | 0)) >>> 0);
    const dustCount = Math.round(18 + depth * 10);
    for (let i = 0; i < dustCount; i++) {
      const a = dustRand() * TAU;
      const rr = Math.pow(dustRand(), 0.88) * radius * 0.98;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      const r = lerp(0.7, 2.1, dustRand());
      const col = dustRand() > 0.5 ? palette.light : palette.fusion;
      ctx.fillStyle = rgba(col, lerp(0.06, 0.26, dustRand()));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";

    const core = ctx.createRadialGradient(cx, cy, radius * 0.03, cx, cy, radius * 0.45);
    core.addColorStop(0.00, rgba(palette.light, 0.26 + beatPulse * 0.22));
    core.addColorStop(0.22, rgba(palette.fusion, 0.14 + beatPulse * 0.10));
    core.addColorStop(0.55, rgba(palette.bg, 0.10));
    core.addColorStop(1.00, "rgba(0,0,0,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.48, 0, TAU);
    ctx.fill();

    ctx.restore();

    ctx.strokeStyle = rgba(palette.light, 0.18 + beatPulse * 0.24);
    ctx.lineWidth = 1.5 + orbTone.rim * 2.4;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * (1 + beatPulse * 0.03), 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = rgba(palette.cold, 0.05 + depth * 0.12);
    ctx.lineWidth = 7 + beatPulse * 10;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.01, 0, TAU);
    ctx.stroke();

    rafId = requestAnimationFrame(drawOrb);
  }

  function startOrb() {
    if (!ctx || rafId) return;
    resizeCanvas();
    rafId = requestAnimationFrame(drawOrb);
  }

  async function syncAura() {
    let trackId = "";
    let artUrl = "";
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
        albumPalette = null;
        albumPaletteTrackId = "";
        const vibe = deriveVibeFromMetadata({ track: "", artist: "", album: "", durationMs: 0 });
        beatTempo = 96;
        beatEnergy = vibe.heat;
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
      artUrl = item?.album?.images?.[0]?.url || "";

      if (trackId !== albumPaletteTrackId) {
        albumPaletteTrackId = trackId;
        albumPalette = await extractPaletteFromImage(artUrl);
      }

      let vibe = null;
      try {
        if (trackId) {
          const feats = await getAudioFeatures(trackId);
          vibe = deriveVibeFromMetadata(meta);
          if (feats) {
            const energy = normalize01(feats.energy, vibe.heat);
            const tempo = Number(feats.tempo || 110);
            const dance = normalize01(feats.danceability, 0.50);
            vibe = {
              heat: clamp01(energy * 0.55 + dance * 0.18 + normalize01(feats.valence, 0.45) * 0.08 + 0.20),
              focus: clamp01((1 - dance) * 0.18 + normalize01(feats.instrumentalness, 0.22) * 0.34 + 0.28),
              depth: clamp01(normalize01(feats.acousticness, 0.30) * 0.24 + normalize01(feats.instrumentalness, 0.22) * 0.24 + (1 - energy) * 0.14 + 0.28),
              flux: clamp01(dance * 0.30 + energy * 0.26 + normalize01(feats.speechiness, 0.08) * 0.06 + 0.18),
              valence: normalize01(feats.valence, 0.45),
              acoustic: normalize01(feats.acousticness, 0.30)
            };
            beatTempo = Math.max(60, Math.min(180, tempo || 110));
            beatEnergy = energy;
          }
        }
      } catch {
        vibe = null;
      }

      if (!vibe) {
        vibe = deriveVibeFromMetadata(meta);
        beatTempo = 104 + Math.round(vibe.flux * 36);
        beatEnergy = vibe.heat;
      }

      applyVibe(vibe, meta, trackId);
    } catch {
      hasSpotifyPlayback = false;
      albumPalette = null;
      albumPaletteTrackId = "";
      const vibe = deriveVibeFromMetadata(meta);
      beatTempo = 104 + Math.round(vibe.flux * 36);
      beatEnergy = vibe.heat;
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

  setBars();
  resizeCanvas();
  restartPolling();
  scheduleBurstSync();
  startOrb();

  setInterval(() => {
    if (spotifyBtn) updateSpotifyBtnVisual(spotifyBtn);
  }, 2500);

  safeCall(() => syncAura());
})();
