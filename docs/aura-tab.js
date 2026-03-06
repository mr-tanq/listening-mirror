/* aura-tab.js (FULL FILE REPLACE) — 1 PART
   Listening Mirror — Aura Popup (title portal) + Spotify quick-sync
   ✅ Title: "listening mirror" (lowercase) + premium styling
   ✅ Tap title => Aura modal (orb + signals)
   ✅ Keeps/ensures Spotify icon button at right of tabs (icon-only, no circle outline)
   ✅ Spotify icon color:
      - Connected => BLACK icon (with subtle light drop-shadow so it's visible)
      - Disconnected => GREY icon
      - Tap toggles connect / disconnect (best-effort)
   ✅ FAST sync on open/connect
   ✅ Spotify button self-heals if DOM changes
   ✅ Same track = same core palette / same seed
   ✅ If /audio-features fails (403 etc), Aura still works from strong metadata fallback
   ✅ FIX: fallback is no longer flat 50/50/50/50
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
  const PHI = (1 + Math.sqrt(5)) / 2;
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const $ = (sel, root = document) => root.querySelector(sel);

  function safeCall(fn) {
    try { return fn(); } catch { return undefined; }
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
  style.id = "auraTabStyles";
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
      border-radius: 16px;
      background:
        radial-gradient(120px 44px at 35% 40%, rgba(150,190,255,.10), transparent 60%),
        radial-gradient(120px 44px at 70% 55%, rgba(255,215,140,.06), transparent 62%);
      opacity: 0;
      transition: opacity .18s ease, transform .18s ease;
      transform: translateY(0px);
      pointer-events:none;
    }
    .wordmark .title:active:after{ opacity:.85; transform: translateY(1px); }
    .wordmark .title.auraHover:after{ opacity:.55; }

    .lmSpotifyIcoBtn{
      margin-left: auto;
      border: 0;
      background: transparent;
      padding: 8px 10px;
      border-radius: 12px;
      cursor: pointer;
      line-height: 0;
      -webkit-tap-highlight-color: transparent;
    }
    .lmSpotifyIcoBtn:active{ transform: translateY(1px); }
    .lmSpotifyIcoBtn svg{
      width: 20px;
      height: 20px;
      display:block;
      transition: opacity .15s ease, filter .15s ease;
    }
    .lmSpotifyIcoBtn[data-state="off"] svg{
      fill: rgba(255,255,255,.55);
      opacity: .95;
      filter: none;
    }
    .lmSpotifyIcoBtn[data-state="on"] svg{
      fill: #000000;
      opacity: 1;
      filter: drop-shadow(0 0 1.5px rgba(255,255,255,.45));
    }

    .auraOverlay{
      position: fixed;
      inset: 0;
      z-index: 999999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right))
               max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
      background:
        radial-gradient(900px 600px at 30% 20%, rgba(255,255,255,.06), transparent 60%),
        radial-gradient(900px 600px at 70% 80%, rgba(255,255,255,.04), transparent 62%),
        rgba(0,0,0,.52);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .auraCard{
      width: min(420px, calc(100vw - 26px));
      border-radius: 22px;
      background: linear-gradient(180deg, rgba(18,20,24,.92), rgba(12,13,16,.92));
      outline: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 30px 90px rgba(0,0,0,.68);
      overflow: hidden;
      transform: translateY(6px) scale(.985);
      opacity: 0;
      transition: transform .18s ease, opacity .18s ease;
      will-change: transform, opacity;
    }
    .auraOverlay.on{ display:flex; }
    .auraOverlay.on .auraCard{ transform: translateY(0) scale(1); opacity: 1; }

    .auraTop{
      padding: 14px 16px 10px 16px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap: 10px;
      border-bottom: 1px solid rgba(255,255,255,.07);
    }
    .auraLabel{
      font-size: 11px;
      letter-spacing: .34px;
      text-transform: uppercase;
      color: rgba(255,255,255,.62);
      display:flex;
      align-items:center;
      gap:10px;
      min-width:0;
    }
    .auraDot{
      width: 8px; height: 8px;
      border-radius: 999px;
      background: rgba(160,190,255,.65);
      box-shadow: 0 0 0 3px rgba(160,190,255,.10);
      outline: 1px solid rgba(255,255,255,.10);
      flex: 0 0 auto;
    }
    .auraClose{
      border:0;
      cursor:pointer;
      padding: 8px 10px;
      border-radius: 999px;
      font-size: 12px;
      letter-spacing:.2px;
      background: rgba(255,255,255,.06);
      outline: 1px solid rgba(255,255,255,.10);
      color: rgba(255,255,255,.90);
    }
    .auraClose:active{ transform: translateY(1px); }

    .auraBody{ padding: 16px; }

    .auraOrbWrap{
      border-radius: 20px;
      outline: 1px solid rgba(255,255,255,.08);
      background: rgba(255,255,255,.02);
      overflow:hidden;
      position: relative;
      height: 260px;
      display:grid;
      place-items:center;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
    }
    .auraOrbHint{
      position:absolute;
      left: 14px;
      bottom: 12px;
      right: 14px;
      font-size: 12px;
      line-height: 1.4;
      color: rgba(255,255,255,.66);
      letter-spacing: .15px;
      text-shadow: 0 6px 18px rgba(0,0,0,.55);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: .92;
    }

    .auraGrid{
      margin-top: 14px;
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .auraBox{
      border-radius: 16px;
      background: rgba(255,255,255,.03);
      outline: 1px solid rgba(255,255,255,.07);
      padding: 12px;
      overflow:hidden;
    }
    .auraBoxWide{ grid-column: 1/-1; }

    .auraK{
      font-size: 10px;
      letter-spacing: .30px;
      color: rgba(255,255,255,.58);
      text-transform: uppercase;
    }
    .auraRow{
      margin-top: 9px;
      display:flex;
      align-items:center;
      gap: 10px;
    }
    .auraBar{
      flex: 1 1 auto;
      height: 7px;
      border-radius: 999px;
      background: rgba(255,255,255,.06);
      outline: 1px solid rgba(255,255,255,.06);
      overflow:hidden;
    }
    .auraFill{
      display:block;
      height:100%;
      width: 50%;
      border-radius: 999px;
      background: linear-gradient(180deg, rgba(255,255,255,.62), rgba(255,255,255,.34));
      box-shadow: inset 0 1px 0 rgba(255,255,255,.26);
    }
    .auraN{
      font-size: 12px;
      font-weight: 780;
      color: rgba(255,255,255,.84);
      white-space: nowrap;
      min-width: 28px;
      text-align:right;
    }
    .auraLine{
      margin-top: 12px;
      color: rgba(255,255,255,.62);
      font-size: 12.5px;
      line-height: 1.45;
      letter-spacing: .12px;
    }
  `;
  document.head.appendChild(style);

  // ---------- Modal ----------
  const overlay = document.createElement("div");
  overlay.className = "auraOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Aura");
  overlay.innerHTML = `
    <div class="auraCard">
      <div class="auraTop">
        <div class="auraLabel">
          <span class="auraDot" aria-hidden="true"></span>
          <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;">Aura</span>
        </div>
        <button class="auraClose" type="button" aria-label="Close aura">Close</button>
      </div>
      <div class="auraBody">
        <div class="auraOrbWrap">
          <canvas id="auraOrbCanvas" width="320" height="320" style="width:240px;height:240px;display:block;"></canvas>
          <div id="auraOrbHint" class="auraOrbHint">—</div>
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
  `;
  document.body.appendChild(overlay);

  const closeBtn = $(".auraClose", overlay);
  const card = $(".auraCard", overlay);

  const c = $("#auraOrbCanvas", overlay);
  const ctx = c ? c.getContext("2d") : null;

  const hint = $("#auraOrbHint", overlay);

  const heatBar = $("#auraHeatBar", overlay);
  const focusBar = $("#auraFocusBar", overlay);
  const depthBar = $("#auraDepthBar", overlay);
  const fluxBar = $("#auraFluxBar", overlay);

  const heatNum = $("#auraHeatNum", overlay);
  const focusNum = $("#auraFocusNum", overlay);
  const depthNum = $("#auraDepthNum", overlay);
  const fluxNum = $("#auraFluxNum", overlay);

  const auraLine = $("#auraLine", overlay);

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
    if (!hint) return;
    hint.textContent = txt || "—";
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
      "sun","gold","light","love","honey","fire","heart","soul","rose","summer","warm","kiss","crazy","crazyz","heat"
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

    // Strong seed-based base, not flat 0.5
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
    if (artistLc.includes("nightstalker") || artistLc.includes("metallica") || artistLc.includes("zeal & ardor")) {
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

    // push away from fake-neutral center if too flat
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
    deep:    ["#09091c", "#1b1547", "#41218a", "#ff8a38", "#ffd7b4"],
    kinetic: ["#04101d", "#063f68", "#00d7d9", "#7e39ff", "#ff64b0"],
    warm:    ["#140b0b", "#3a1415", "#8d2b1f", "#ffc047", "#fff0c9"],
    airy:    ["#0a1119", "#12303a", "#3eb9b4", "#b5ecd8", "#fff3dc"],
    cosmic:  ["#060913", "#1a1152", "#432caa", "#2cc6ff", "#ffba66"]
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
    return {
      glow: lerp(0.52, 1.00, clamp01(vibe.heat * 0.7 + vibe.flux * 0.3)),
      turbulence: lerp(0.42, 1.00, clamp01(vibe.depth * 0.55 + vibe.flux * 0.45)),
      starDensity: lerp(0.35, 1.00, clamp01(vibe.focus * 0.45 + vibe.heat * 0.20 + (1 - vibe.acoustic) * 0.35)),
      rim: lerp(0.22, 0.78, clamp01(vibe.focus * 0.5 + vibe.heat * 0.5))
    };
  }

  // ---------- Color helpers ----------
  function hexToRgb(hex) {
    const h = String(hex).replace("#", "").trim();
    const v = parseInt(h.length === 3 ? h.split("").map(x => x + x).join("") : h, 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }

  function mixRgb(a, b, t) {
    return {
      r: Math.round(lerp(a.r, b.r, t)),
      g: Math.round(lerp(a.g, b.g, t)),
      b: Math.round(lerp(a.b, b.b, t))
    };
  }

  function smoothstep(t) {
    t = clamp01(t);
    return t * t * (3 - 2 * t);
  }

  // ---------- Noise ----------
  function randAt(ix, iy, seed) {
    let n = (ix * 374761393 + iy * 668265263) ^ (seed | 0);
    n = (n ^ (n >>> 13)) >>> 0;
    n = Math.imul(n, 1274126177) >>> 0;
    return (n >>> 0) / 4294967296;
  }

  function valueNoise2D(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;

    const v00 = randAt(xi, yi, seed);
    const v10 = randAt(xi + 1, yi, seed);
    const v01 = randAt(xi, yi + 1, seed);
    const v11 = randAt(xi + 1, yi + 1, seed);

    const u = smoothstep(xf);
    const v = smoothstep(yf);

    const x1 = lerp(v00, v10, u);
    const x2 = lerp(v01, v11, u);
    return lerp(x1, x2, v);
  }

  function fbm(x, y, seed, octaves = 5, lac = PHI + 0.42, gain = 1 / PHI) {
    let amp = 0.5;
    let f = 1.0;
    let sum = 0.0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * valueNoise2D(x * f, y * f, seed + i * 1013);
      f *= lac;
      amp *= gain;
    }
    return sum;
  }

  // ---------- Nebula texture ----------
  function buildNebulaTexture(seed, palName, tone) {
    orbSeed = seed >>> 0;
    paletteName = palName || "cosmic";
    orbTone = tone || orbTone;

    const colors = (PALETTES[paletteName] || PALETTES.cosmic).map(hexToRgb);

    const W = 256, H = 256;
    tex.width = W;
    tex.height = H;

    const img = texCtx.createImageData(W, H);
    const data = img.data;

    const rand = mulberry32(orbSeed ^ 0xA53C9E3);
    const swirl1 = lerp(0.75, 1.45, rand());
    const swirl2 = lerp(0.85, 1.35, rand());
    const warp = lerp(0.45, 1.30, rand()) * orbTone.turbulence;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const nx = (x / (W - 1)) * 2 - 1;
        const ny = (y / (H - 1)) * 2 - 1;

        const r = Math.sqrt(nx * nx + ny * ny);
        const ang = Math.atan2(ny, nx);

        const wx = nx + warp * 0.16 * Math.sin(ang * PHI + r * PI * 1.35 + orbSeed * 0.00017);
        const wy = ny + warp * 0.16 * Math.cos(ang * (PHI + 0.22) - r * PI * 1.10 + orbSeed * 0.00013);

        const n1 = fbm(wx * 1.10 + 12.4, wy * 1.10 - 3.7, orbSeed, 5);
        const n2 = fbm(wx * PHI - 5.1, wy * PHI + 8.9, orbSeed ^ 0x9e3779b9, 4);
        const n3 = fbm(wx * 0.82 + 1.7, wy * 0.82 + 11.2, orbSeed ^ 0x85ebca6b, 5);

        const band1 = Math.abs(Math.sin(ang * swirl1 + r * PI * 1.8 + n2 * PI * 0.9));
        const band2 = Math.abs(Math.cos(ang * swirl2 - r * PI * 1.45 + n1 * PI * 0.7));
        const clouds = clamp01((n1 * 0.62 + n3 * 0.52) * 0.95 + band1 * 0.16 + band2 * 0.10);

        const core1 = Math.exp(-Math.pow((r - 0.22 - n2 * 0.06) * 3.6, 2));
        const core2 = Math.exp(-Math.pow((r - (0.22 * PHI) - n1 * 0.08) * 3.0, 2));
        const glow = clamp01(core1 * 0.78 + core2 * 0.52) * orbTone.glow;

        const t = clamp01(clouds * 0.76 + glow * 0.60);
        const seg = t * 4;
        const i0 = Math.max(0, Math.min(3, Math.floor(seg)));
        const f = seg - i0;

        const cA = colors[i0];
        const cB = colors[i0 + 1];
        let col = mixRgb(cA, cB, smoothstep(f));

        const vign = smoothstep(1.0 - clamp01(r * 0.95));
        col.r = Math.round(col.r * (0.14 + 0.86 * vign));
        col.g = Math.round(col.g * (0.14 + 0.86 * vign));
        col.b = Math.round(col.b * (0.14 + 0.86 * vign));

        const sparks = Math.pow(n2, 5.3) * 0.85 * orbTone.glow;
        col.r = Math.min(255, col.r + Math.round(255 * sparks * 0.24));
        col.g = Math.min(255, col.g + Math.round(255 * sparks * 0.18));
        col.b = Math.min(255, col.b + Math.round(255 * sparks * 0.32));

        const st = valueNoise2D(wx * 10.0 + 100.0, wy * 10.0 - 50.0, orbSeed ^ 0x27d4eb2d);
        const starProb = Math.pow(clamp01(st - 0.88) / 0.12, 2.8) * orbTone.starDensity;
        const star = starProb * 0.9;

        const alpha = r <= 1.0 ? 255 : 0;
        const idx = (y * W + x) * 4;
        const boost = 1.0 + glow * 0.25;

        data[idx + 0] = Math.min(255, Math.round(col.r * boost + 255 * star));
        data[idx + 1] = Math.min(255, Math.round(col.g * boost + 255 * star));
        data[idx + 2] = Math.min(255, Math.round(col.b * boost + 255 * star));
        data[idx + 3] = alpha;
      }
    }

    texCtx.putImageData(img, 0, 0);

    texCtx.save();
    texCtx.globalCompositeOperation = "screen";

    const starCount = Math.round(40 + 110 * orbTone.starDensity);
    for (let i = 0; i < starCount; i++) {
      const t = (i + 0.5) / starCount;
      const rr = Math.sqrt(t) * 0.92;
      const a = i * GOLDEN_ANGLE + (orbSeed % 1024) * 0.0007;

      const x = W * 0.5 + Math.cos(a) * rr * W * 0.42;
      const y = H * 0.5 + Math.sin(a) * rr * H * 0.42;

      const bright = Math.pow(1 - t, 1 / PHI) * (0.25 + 0.75 * ((i % 7) / 6));
      const rad = lerp(0.6, 2.2, bright) * (0.75 + 0.25 * orbTone.glow);

      const g = texCtx.createRadialGradient(x, y, 0, x, y, rad * PHI * 2.4);
      g.addColorStop(0, `rgba(255,255,255,${0.22 + bright * 0.78})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      texCtx.fillStyle = g;
      texCtx.beginPath();
      texCtx.arc(x, y, rad * PHI * 2.4, 0, TAU);
      texCtx.fill();
    }

    texCtx.restore();

    texReady = true;
    texSignature = `${orbSeed}|${paletteName}|${orbTone.glow.toFixed(3)}|${orbTone.turbulence.toFixed(3)}|${orbTone.starDensity.toFixed(3)}|${orbTone.rim.toFixed(3)}`;
  }

  function ensureTexture(seed, palName, tone) {
    const sig = `${seed >>> 0}|${palName}|${tone.glow.toFixed(3)}|${tone.turbulence.toFixed(3)}|${tone.starDensity.toFixed(3)}|${tone.rim.toFixed(3)}`;
    if (!texReady || sig !== texSignature) {
      buildNebulaTexture(seed, palName, tone);
    }
  }

  // ---------- Track lock helpers ----------
  function lockTrackIdentity(trackId, palName, tone, artist, track) {
    lockedTrackId = trackId;
    lockedPaletteName = palName;
    lockedSeed = hashStringToSeed(trackId);
    lockedTone = { ...tone };
    lockedHint = `${artist} — ${track}`;
    ensureTexture(lockedSeed, lockedPaletteName, lockedTone);
  }

  function applyLockedIdentity() {
    if (!lockedTrackId || !lockedTone) return false;
    ensureTexture(lockedSeed, lockedPaletteName, lockedTone);
    if (lockedHint) setHintText(lockedHint);
    return true;
  }

  function clearLockedIdentity() {
    lockedTrackId = "";
    lockedPaletteName = "";
    lockedSeed = 0;
    lockedTone = null;
    lockedHint = "";
  }

  function applyVibeToBars(vibe, strong = false) {
    const k = strong ? 0.52 : 0.32;
    heat = lerp(heat, vibe.heat, k);
    focus = lerp(focus, vibe.focus, k);
    depth = lerp(depth, vibe.depth, k);
    flux = lerp(flux, vibe.flux, k);
  }

  // ---------- Spotify-driven vibe ----------
  async function pollSpotify() {
    try {
      const st = await getPlayer();

      if (st && st.__no_content) {
        hasSpotifyPlayback = false;
        setHintText("Open Spotify and press Play (no active playback).");
        if (applyLockedIdentity()) {
          setBars();
          return false;
        }
        setBars();
        return false;
      }

      if (!st || !st.item) {
        hasSpotifyPlayback = false;
        setHintText("Open Spotify and press Play (no active playback).");
        if (applyLockedIdentity()) {
          setBars();
          return false;
        }
        setBars();
        return false;
      }

      hasSpotifyPlayback = true;

      const track = st.item?.name || "—";
      const artist = st.item?.artists?.[0]?.name || "—";
      const id = st.item?.id || "";
      const album = st.item?.album?.name || "";
      const durationMs = Number(st.item?.duration_ms || 0);

      setHintText(`${artist} — ${track}`);

      if (!id) {
        if (applyLockedIdentity()) {
          setBars();
          return false;
        }
        setBars();
        return false;
      }

      if (id === lockedTrackId && lockedTone) {
        const vibe = deriveVibeFromMetadata({ track, artist, album, durationMs });
        applyVibeToBars(vibe, false);
        ensureTexture(lockedSeed, lockedPaletteName, lockedTone);
        setHintText(lockedHint || `${artist} — ${track}`);
        setBars();
        return true;
      }

      let vibe = null;

      try {
        const af = await getAudioFeatures(id);
        if (af && !af.__no_content) {
          const e = normalize01(af.energy, heat);
          const v = normalize01(af.valence, 0.5);
          const da = normalize01(af.danceability, flux);
          const ac = normalize01(af.acousticness, 0.45);
          const ins = normalize01(af.instrumentalness, focus);
          const tempo = Number(af.tempo || 0);

          vibe = {
            heat: clamp01(e * 0.82 + clamp01((tempo - 70) / 120) * 0.18),
            focus: clamp01(ins * 0.70 + (1 - da) * 0.30),
            depth: clamp01((1 - v) * 0.70 + ac * 0.30),
            flux: clamp01(da * 0.68 + clamp01((tempo - 60) / 140) * 0.32),
            valence: v,
            acoustic: ac
          };
        }
      } catch {
        // metadata fallback below
      }

      if (!vibe) {
        vibe = deriveVibeFromMetadata({ track, artist, album, durationMs });
      }

      applyVibeToBars(vibe, true);

      const pal = choosePaletteFromVibe(vibe);
      const tone = vibeToTone(vibe);

      lockTrackIdentity(id, pal, tone, artist, track);
      setBars();
      return true;
    } catch {
      hasSpotifyPlayback = false;
      setHintText("Aura waiting for Spotify…");

      if (applyLockedIdentity()) {
        setBars();
        return false;
      }

      setBars();
      return false;
    }
  }

  // ---------- Burst / polling ----------
  function clearBurst() {
    if (!burstTimeouts.length) return;
    for (const t of burstTimeouts) clearTimeout(t);
    burstTimeouts = [];
  }

  function burstPoll() {
    clearBurst();
    for (const ms of BURST_STEPS) {
      const t = setTimeout(async () => { await pollSpotify(); }, ms);
      burstTimeouts.push(t);
    }
  }

  function startPolling(isOpen) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollSpotify, isOpen ? OPEN_POLL_MS : CLOSED_POLL_MS);
  }

  // ---------- Draw ----------
  function resizeCanvas() {
    if (!c || !ctx) return;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const css = 240;
    const px = Math.round(css * dpr);
    if (c.width !== px || c.height !== px) {
      c.width = px;
      c.height = px;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function fallbackPalette(ts) {
    const t = (ts % 52000) / 52000;
    if (t < 0.25) return "cosmic";
    if (t < 0.50) return "kinetic";
    if (t < 0.75) return "deep";
    return "warm";
  }

  function draw(ts) {
    if (!ctx || !c) { rafId = 0; return; }

    if (FPS_CAP > 0) {
      const minFrame = 1000 / FPS_CAP;
      if (ts - lastFrame < minFrame) {
        rafId = requestAnimationFrame(draw);
        return;
      }
      lastFrame = ts;
    }

    resizeCanvas();

    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const W = c.width, H = c.height;
    const cx = W / 2, cy = H / 2;

    ctx.clearRect(0, 0, W, H);

    if (lockedTrackId && lockedTone) {
      ensureTexture(lockedSeed, lockedPaletteName, lockedTone);
    } else if (!hasSpotifyPlayback) {
      const pal = fallbackPalette(ts);
      const seed = hashStringToSeed("fallback-" + pal);
      const tone = { glow: 0.72, turbulence: 0.68, starDensity: 0.70, rim: 0.46 };
      ensureTexture(seed, pal, tone);
    }

    const activeTone = lockedTone || orbTone;

    const baseR = Math.min(W, H) * 0.312;
    const pulse = 0.5 + 0.5 * Math.sin(ts * 0.00185 * PI + flux * PHI);
    const r = baseR * (0.965 + pulse * 0.042 + heat * 0.040);
    const rInner = r / PHI;
    const rHalo = r * PHI * 0.82;

    const bg = ctx.createRadialGradient(cx, cy, rInner * 0.2, cx, cy, rHalo * 2.2);
    bg.addColorStop(0, "rgba(255,255,255,0.05)");
    bg.addColorStop(0.40, "rgba(120,140,255,0.05)");
    bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(cx, cy, rHalo * 2.2, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const envStars = Math.round(16 + activeTone.starDensity * 24);
    for (let i = 0; i < envStars; i++) {
      const t = (i + 0.5) / envStars;
      const rr = lerp(r * 1.12, r * 1.82, Math.pow(t, 0.88));
      const ang = i * GOLDEN_ANGLE + ts * 0.00005 * PI / PHI;
      const x = cx + Math.cos(ang) * rr;
      const y = cy + Math.sin(ang) * rr * (0.96 + 0.04 * Math.sin(i));
      const size = (0.9 + (i % 3) * 0.5) * dpr;
      const alpha = 0.08 + 0.18 * (1 - t);

      const g = ctx.createRadialGradient(x, y, 0, x, y, size * PHI * 4);
      g.addColorStop(0, `rgba(255,255,255,${alpha + 0.10})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, size * PHI * 4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.clip();

    if (texReady) {
      const driftX = Math.sin(ts * 0.00021 * PI / PHI) * r * 0.10;
      const driftY = Math.cos(ts * 0.00017 * TAU / PHI) * r * 0.10;
      const scale = 1.18;
      const dw = r * 2 * scale;
      const dh = r * 2 * scale;
      ctx.globalAlpha = 1.0;
      ctx.drawImage(tex, cx - dw / 2 + driftX, cy - dh / 2 + driftY, dw, dh);
    }

    ctx.globalCompositeOperation = "multiply";
    const lane = ctx.createRadialGradient(cx - r / PHI * 0.32, cy + r / PHI * 0.22, r * 0.08, cx, cy, r * 1.22);
    lane.addColorStop(0, "rgba(0,0,0,0.0)");
    lane.addColorStop(0.72, "rgba(0,0,0,0.17)");
    lane.addColorStop(1, "rgba(0,0,0,0.34)");
    ctx.fillStyle = lane;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.22, 0, TAU);
    ctx.fill();

    ctx.globalCompositeOperation = "screen";
    const nodeG = ctx.createRadialGradient(cx, cy, 0, cx, cy, r / PHI);
    nodeG.addColorStop(0, `rgba(255,255,255,${0.06 + activeTone.glow * 0.16})`);
    nodeG.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = nodeG;
    ctx.beginPath();
    ctx.arc(cx, cy, r / PHI, 0, TAU);
    ctx.fill();

    const bloom = ctx.createRadialGradient(cx - r * 0.19, cy - r * 0.22, r * 0.05, cx, cy, r * 1.15);
    bloom.addColorStop(0, `rgba(255,255,255,${0.10 + heat * 0.12})`);
    bloom.addColorStop(0.45, "rgba(255,255,255,0.05)");
    bloom.addColorStop(1, "rgba(255,255,255,0.0)");
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.15, 0, TAU);
    ctx.fill();

    ctx.fillStyle = `rgba(255,255,255,${0.10 + heat * 0.10})`;
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.18, cy - r * 0.30, r * (0.52 / PHI + 0.20), r * (0.34 / PHI + 0.13), -0.55, 0, TAU);
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
    const rim = ctx.createRadialGradient(cx, cy, r * 0.82, cx, cy, r);
    rim.addColorStop(0, "rgba(255,255,255,0)");
    rim.addColorStop(0.72, `rgba(255,255,255,${0.06 + activeTone.rim * 0.08})`);
    rim.addColorStop(1, `rgba(255,255,255,${0.14 + activeTone.rim * 0.10})`);
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();

    ctx.restore();

    ctx.strokeStyle = `rgba(255,255,255,${0.05 + activeTone.rim * 0.10})`;
    ctx.lineWidth = Math.max(1, Math.round(1.1 * dpr));
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.018, 0, TAU);
    ctx.stroke();

    rafId = requestAnimationFrame(draw);
  }

  // ---------- Overlay ----------
  function setOverlay(on) {
    open = !!on;
    if (open) {
      overlay.classList.add("on");
      titleEl.classList.add("auraHover");
      pollSpotify();
      burstPoll();
      startPolling(true);
      if (!rafId) rafId = requestAnimationFrame(draw);
    } else {
      overlay.classList.remove("on");
      titleEl.classList.remove("auraHover");
      startPolling(false);
    }
  }

  function toggleAura() {
    setOverlay(!open);
  }

  closeBtn?.addEventListener("click", () => setOverlay(false), { passive: true });

  overlay.addEventListener("pointerdown", (e) => {
    if (!open) return;
    if (card && card.contains(e.target)) return;
    setOverlay(false);
  }, { passive: true });

  document.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") setOverlay(false);
  });

  titleEl.addEventListener("click", (e) => {
    e.preventDefault();
    toggleAura();
  });

  titleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleAura();
    }
  });

  // ---------- Spotify icon button ----------
  function spotifySvg() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.49 2 12s4.48 10 10 10 10-4.49 10-10S17.52 2 12 2zm4.58 14.51c-.2.33-.63.44-.96.24-2.63-1.61-5.94-1.97-9.85-1.07-.38.09-.76-.15-.85-.53-.09-.38.15-.76.53-.85 4.28-.98 7.95-.57 10.88 1.23.33.2.44.63.25.98zm1.37-3.05c-.25.41-.78.54-1.19.29-3.01-1.85-7.6-2.39-11.17-1.31-.46.14-.95-.12-1.09-.58-.14-.46.12-.95.58-1.09 4.08-1.24 9.15-.64 12.63 1.49.41.25.54.78.24 1.2zm.12-3.18C14.66 8.24 8.98 8.1 5.77 9.08c-.55.17-1.13-.14-1.3-.69-.17-.55.14-1.13.69-1.3 3.69-1.12 9.83-.91 13.7 1.39.5.3.66.95.36 1.45-.3.5-.95.66-1.45.35z"/>
      </svg>
    `;
  }

  function nukeSpotifyTokensBestEffort() {
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        const lk = String(k).toLowerCase();
        if (lk.includes("spotify") || lk.includes("sp_token") || lk.includes("access_token")) {
          localStorage.removeItem(k);
        }
      }
    } catch {}
    try {
      const keys = Object.keys(sessionStorage);
      for (const k of keys) {
        const lk = String(k).toLowerCase();
        if (lk.includes("spotify") || lk.includes("sp_token") || lk.includes("access_token")) {
          sessionStorage.removeItem(k);
        }
      }
    } catch {}
  }

  function updateSpotifyBtnState(btn) {
    if (!btn) return;
    const on = isConnected();
    btn.dataset.state = on ? "on" : "off";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("title", on ? "Spotify: connected (tap to disconnect)" : "Spotify: connect");
  }

  async function connectSpotifyBestEffort() {
    if (window.SpotifyAuth && typeof window.SpotifyAuth.login === "function") {
      safeCall(() => window.SpotifyAuth.login());
      return;
    }
    if (window.SpotifyAuth && typeof window.SpotifyAuth.startAuth === "function") {
      safeCall(() => window.SpotifyAuth.startAuth());
      return;
    }
    if (window.SpotifyPlayer && typeof window.SpotifyPlayer.connect === "function") {
      safeCall(() => window.SpotifyPlayer.connect());
      return;
    }
  }

  async function disconnectSpotifyBestEffort() {
    if (window.SpotifyAuth && typeof window.SpotifyAuth.logout === "function") {
      safeCall(() => window.SpotifyAuth.logout());
    }
    if (window.SpotifyPlayer && typeof window.SpotifyPlayer.logout === "function") {
      safeCall(() => window.SpotifyPlayer.logout());
    }
    nukeSpotifyTokensBestEffort();
    clearLockedIdentity();
    try { window.dispatchEvent(new CustomEvent("spotify:disconnected")); } catch {}
  }

  function ensureSpotifyIconButton() {
    const tabs = $(".tabs");
    if (!tabs) return null;

    let btn = $("#lmSpotifyIcoBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "lmSpotifyIcoBtn";
      btn.className = "lmSpotifyIcoBtn";
      btn.type = "button";
      btn.setAttribute("aria-label", "Spotify connect");
      btn.innerHTML = spotifySvg();

      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const connected = isConnected();

        if (connected) {
          await disconnectSpotifyBestEffort();
          updateSpotifyBtnState(btn);
          setHintText("Aura waiting for Spotify…");
          hasSpotifyPlayback = false;
          burstPoll();
          return;
        }

        await connectSpotifyBestEffort();
        updateSpotifyBtnState(btn);
        pollSpotify();
        burstPoll();
      });
    }

    updateSpotifyBtnState(btn);

    if (btn.parentElement !== tabs) {
      tabs.appendChild(btn);
    } else if (tabs.lastElementChild !== btn) {
      tabs.appendChild(btn);
    }

    return btn;
  }

  let tabsObserver = null;
  function watchTabsForSpotifyButton() {
    if (tabsObserver) return;
    const root = document.body;
    if (!root) return;

    tabsObserver = new MutationObserver(() => {
      ensureSpotifyIconButton();
    });

    tabsObserver.observe(root, { childList: true, subtree: true });
  }

  // ---------- Boot ----------
  function boot() {
    setBars();

    const spBtn = ensureSpotifyIconButton();
    watchTabsForSpotifyButton();

    ensureTexture(hashStringToSeed("fallback-cosmic"), "cosmic", {
      glow: 0.72,
      turbulence: 0.68,
      starDensity: 0.70,
      rim: 0.46
    });

    pollSpotify();

    setOverlay(false);
    startPolling(false);

    let t = 0;
    const invite = setInterval(() => {
      t += 1;
      if (t > 6) { clearInterval(invite); titleEl.classList.remove("auraHover"); return; }
      titleEl.classList.toggle("auraHover", t % 2 === 1);
    }, 200);

    setTimeout(() => {
      titleEl.classList.remove("auraHover");
      clearInterval(invite);
    }, 1200);

    setInterval(() => {
      ensureSpotifyIconButton();
      updateSpotifyBtnState(spBtn || $("#lmSpotifyIcoBtn"));
    }, 2000);

    window.addEventListener("resize", () => {
      if (open) resizeCanvas();
    }, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
