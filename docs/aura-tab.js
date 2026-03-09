/* aura-tab.js (FULL FILE REPLACE) — PART 1/4
   Listening Mirror — Shared Main Orb + Aura Details Panel + Orb Renderer V3
   ✅ ONE orb system only (main screen)
   ✅ Title portal
   ✅ Spotify button in header
   ✅ Aura modal = details only
   ✅ Shared main orb
   ✅ Album art adaptive palette
   ✅ V3: dark sphere + strong plasma bands + clear filaments + white-hot center
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
  style.id = "auraTabStylesPlasmaV3";
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
  `;
  document.head.appendChild(style);
   style.textContent += `
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
  let beatTempo = 110;
  let beatEnergy = 0.55;

  let lockedTrackId = "";
  let lockedSeed = 0;
  let lockedHint = "";

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

    const all = new Set([...words(track), ...words(artist), ...words(album)]);

    let H = 0.42;
    let F = 0.48;
    let D = 0.52;
    let X = 0.46;

    if (hasAny(all, ["doom","slow","ashes","dark","night","shadow","funeral","void","grave"])) {
      D += 0.24; H -= 0.04; X -= 0.02;
    }
    if (hasAny(all, ["sun","gold","light","love","fire","heart","soul","summer","warm"])) {
      H += 0.20;
    }
    if (hasAny(all, ["run","burn","dance","electric","speed","wild","riot","move","fast","drive"])) {
      H += 0.12; X += 0.24;
    }
    if (hasAny(all, ["instrumental","interlude","theme","reprise","solo","suite","nocturne"])) {
      F += 0.22; X -= 0.08;
    }

    const durMin = durationMs / 60000;
    if (durMin >= 7.5) { D += 0.16; F += 0.10; X -= 0.08; }
    else if (durMin > 0 && durMin <= 3.2) { X += 0.14; H += 0.08; }

    return {
      heat: clamp01(H),
      focus: clamp01(F),
      depth: clamp01(D),
      flux: clamp01(X)
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
            warmHex: brighten(vibrantHex, 0.12),
            coldHex: rgbToHex(
              Math.round(lerp(vibrant.r, 70, 0.78)),
              Math.round(lerp(vibrant.g, 188, 0.78)),
              Math.round(lerp(vibrant.b, 255, 0.84))
            ),
            darkHex: darken(dominantHex, 0.72),
            lightHex: brighten(vibrantHex, 0.56)
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
      bg: "#050913",
      warm: "#ff8a38",
      cold: "#4ecaff",
      fusion: "#bb77ff",
      light: "#fff3e6"
    };
  }

  function applyVibe(vibe, meta, trackId) {
    heat = clamp01(vibe.heat);
    focus = clamp01(vibe.focus);
    depth = clamp01(vibe.depth);
    flux = clamp01(vibe.flux);

    if (trackId && lockedTrackId === trackId && lockedSeed) {
      orbSeed = lockedSeed;
      if (lockedHint) setHintText(lockedHint);
    } else {
      orbSeed = hashStringToSeed(`${trackId || ""}__${meta.artist || ""}__${meta.track || ""}`);
      beatEnergy = heat;

      const newHint = [
        meta.artist || "Unknown artist",
        meta.track || "Unknown track"
      ].filter(Boolean).join(" — ");

      setHintText(newHint);

      if (trackId) {
        lockedTrackId = trackId;
        lockedSeed = orbSeed;
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

  function drawFilament(ctx, x1, y1, c1x, c1y, c2x, c2y, x2, y2, colorA, colorB, width, alpha) {
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0.00, rgba(colorA, 0.00));
    grad.addColorStop(0.16, rgba(colorA, alpha * 0.9));
    grad.addColorStop(0.54, rgba(colorB, alpha));
    grad.addColorStop(1.00, rgba(colorB, 0.00));

    ctx.strokeStyle = grad;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x2, y2);
    ctx.stroke();
  }

  function drawBand(ctx, cx, cy, r, t, palette, pulse, side) {
    const warm = side === "warm";
    const base = warm ? palette.warm : palette.cold;
    const hi = palette.light;
    const sign = warm ? -1 : 1;
    const count = 26;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < count; i++) {
      const frac = i / (count - 1);

      const startA = (warm ? PI * 1.05 : -0.04) + Math.sin(t * (0.90 + frac * 0.45) + i * 0.52) * 0.18;
      const endA   = (warm ? PI * 1.92 : PI * 0.90) + Math.cos(t * (1.00 + frac * 0.35) + i * 0.58) * 0.16;

      const startR = r * lerp(0.56, 0.98, frac);
      const endR   = r * lerp(0.90, 0.54, frac);

      const x1 = cx + Math.cos(startA) * startR;
      const y1 = cy + Math.sin(startA) * startR;
      const x2 = cx + Math.cos(endA) * endR;
      const y2 = cy + Math.sin(endA) * endR;

      const c1x = cx + sign * r * lerp(0.28, 0.42, frac) + Math.cos(startA + sign * 0.55) * r * 0.08;
      const c1y = cy - r * lerp(0.24, 0.06, frac) + Math.sin(t * 0.7 + i) * r * 0.012;
      const c2x = cx - sign * r * lerp(0.02, 0.12, frac) + Math.cos(endA - sign * 0.28) * r * 0.06;
      const c2y = cy + r * lerp(0.08, 0.24, frac) + Math.cos(t * 0.85 + i) * r * 0.012;

      const width = lerp(0.8, 4.8, 1 - frac) * (0.90 + pulse * 0.40);
      const alpha = lerp(0.10, 0.34, 1 - frac) + pulse * 0.12;

      drawFilament(ctx, x1, y1, c1x, c1y, c2x, c2y, x2, y2, base, hi, width, alpha);
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
    const pulse = Math.pow(Math.max(0, 1 - beat), 4.0) * (0.14 + beatEnergy * 0.18);

    ctx.clearRect(0, 0, w, h);

    const baseR = Math.min(w, h) * 0.408;
    const radius = baseR * (1 + Math.sin(t * (0.82 + flux * 0.36)) * 0.008 + pulse * 0.055);

    const halo = ctx.createRadialGradient(cx, cy, radius * 0.38, cx, cy, radius * 1.85);
    halo.addColorStop(0.00, rgba(palette.light, 0.12 + pulse * 0.16));
    halo.addColorStop(0.24, rgba(palette.warm, 0.16 + heat * 0.10));
    halo.addColorStop(0.42, rgba(palette.cold, 0.16 + depth * 0.10));
    halo.addColorStop(1.00, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.85, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    const pts = 260;
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * TAU;
      const wobble =
        Math.sin(a * 3 + t * 0.95) * radius * 0.008 +
        Math.sin(a * 7 - t * 1.35) * radius * 0.004;
      const rr = radius + wobble;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.clip();

    const sphereBase = ctx.createRadialGradient(cx, cy, radius * 0.06, cx, cy, radius * 1.02);
    sphereBase.addColorStop(0.00, rgba("#0b0f18", 0.02));
    sphereBase.addColorStop(0.42, rgba(palette.bg, 0.58));
    sphereBase.addColorStop(1.00, rgba("#03050a", 0.98));
    ctx.fillStyle = sphereBase;
    ctx.fillRect(cx - radius * 1.2, cy - radius * 1.2, radius * 2.4, radius * 2.4);

    const warmField = ctx.createRadialGradient(
      cx - radius * 0.34, cy - radius * 0.04, radius * 0.03,
      cx - radius * 0.18, cy, radius * 0.96
    );
    warmField.addColorStop(0.00, rgba(palette.light, 0.78));
    warmField.addColorStop(0.08, rgba(palette.warm, 0.88));
    warmField.addColorStop(0.34, rgba(palette.warm, 0.36));
    warmField.addColorStop(0.72, rgba(palette.warm, 0.05));
    warmField.addColorStop(1.00, "rgba(0,0,0,0)");
    ctx.fillStyle = warmField;
    ctx.fillRect(cx - radius * 1.2, cy - radius * 1.2, radius * 2.4, radius * 2.4);

    const coldField = ctx.createRadialGradient(
      cx + radius * 0.30, cy - radius * 0.02, radius * 0.03,
      cx + radius * 0.16, cy, radius * 0.96
    );
    coldField.addColorStop(0.00, rgba(palette.light, 0.72));
    coldField.addColorStop(0.08, rgba(palette.cold, 0.92));
    coldField.addColorStop(0.34, rgba(palette.cold, 0.38));
    coldField.addColorStop(0.72, rgba(palette.cold, 0.05));
    coldField.addColorStop(1.00, "rgba(0,0,0,0)");
    ctx.fillStyle = coldField;
    ctx.fillRect(cx - radius * 1.2, cy - radius * 1.2, radius * 2.4, radius * 2.4);

    drawBand(ctx, cx, cy, radius, t, palette, pulse, "warm");
    drawBand(ctx, cx, cy, radius, t + 0.22, palette, pulse, "cold");

    ctx.globalCompositeOperation = "lighter";

    const ringCount = 8;
    for (let i = 0; i < ringCount; i++) {
      const warm = i < ringCount / 2;
      const col = warm ? palette.warm : palette.cold;
      const rr = radius * lerp(0.54, 0.98, i / (ringCount - 1));
      const start = (warm ? PI * 0.96 : -0.02) + Math.sin(t * (0.9 + i * 0.05) + i) * 0.10;
      const end = start + lerp(0.86, 1.60, 0.60 + flux * 0.22);
      const grad = ctx.createLinearGradient(cx - rr, cy - rr, cx + rr, cy + rr);
      grad.addColorStop(0, rgba(col, 0));
      grad.addColorStop(0.5, rgba(col, 0.18 + pulse * 0.16));
      grad.addColorStop(1, rgba(col, 0));
      ctx.strokeStyle = grad;
      ctx.lineWidth = lerp(0.8, 2.8, 1 - i / ringCount);
      ctx.beginPath();
      ctx.arc(cx, cy, rr, start, end);
      ctx.stroke();
    }

    const fusion = ctx.createRadialGradient(cx, cy, radius * 0.01, cx, cy, radius * 0.42);
    fusion.addColorStop(0.00, rgba("#ffffff", 0.86 + pulse * 0.40));
    fusion.addColorStop(0.10, rgba(palette.light, 0.54 + pulse * 0.22));
    fusion.addColorStop(0.22, rgba(palette.warm, 0.20));
    fusion.addColorStop(0.36, rgba(palette.cold, 0.18));
    fusion.addColorStop(0.62, rgba("#ffffff", 0.03));
    fusion.addColorStop(1.00, "rgba(255,255,255,0)");
    ctx.fillStyle = fusion;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.44, 0, TAU);
    ctx.fill();

    const rand = mulberry32((orbSeed ^ ((ts / 100) | 0)) >>> 0);
    for (let i = 0; i < 10; i++) {
      const a = rand() * TAU;
      const rr = Math.pow(rand(), 0.9) * radius * 0.92;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      const r = lerp(0.6, 1.6, rand());
      const col = rand() > 0.5 ? palette.light : palette.warm;
      ctx.fillStyle = rgba(col, lerp(0.06, 0.18, rand()));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.restore();

    ctx.strokeStyle = rgba("#ffffff", 0.16 + pulse * 0.22);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = rgba(palette.cold, 0.08 + pulse * 0.08);
    ctx.lineWidth = 6 + pulse * 8;
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
    let meta = { track: "", artist: "", album: "", durationMs: 0 };

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
          if (feats) {
            const energy = normalize01(feats.energy, 0.55);
            const dance = normalize01(feats.danceability, 0.50);
            const instr = normalize01(feats.instrumentalness, 0.18);
            const acoustic = normalize01(feats.acousticness, 0.30);
            const tempo = Number(feats.tempo || 110);

            vibe = {
              heat: clamp01(0.26 + energy * 0.44 + dance * 0.18),
              focus: clamp01(0.22 + instr * 0.28 + (1 - dance) * 0.12),
              depth: clamp01(0.28 + acoustic * 0.14 + instr * 0.18 + (1 - energy) * 0.06),
              flux: clamp01(0.22 + dance * 0.24 + energy * 0.22)
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
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeAura(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) closeAura(); });
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
