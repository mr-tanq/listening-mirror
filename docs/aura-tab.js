/* aura-tab.js (FULL FILE REPLACE)
   Listening Mirror — Aura Popup (title portal)
   ✅ Title lowercase: "listening mirror" + sacred premium styling
   ✅ Tap title opens Aura popup (modal card)
   ✅ Spotify-driven orb (player + audio-features)
   ✅ Faster attach: instant poll + rapid retries on open
   ✅ Color is NOT “always blue”:
      - No-Spotify fallback: slow premium drift within a curated hue band
      - Spotify mapping: teal↔amber with “depth” affecting lightness/sat (NOT forcing hue to blue)
*/

(() => {
  "use strict";

  const SPOTIFY_API = "https://api.spotify.com/v1";

  // Polling
  const OPEN_POLL_MS = 9000;     // normal open polling after attach
  const CLOSED_POLL_MS = 45000;  // background
  const RAPID_RETRY_MS = 1200;   // rapid attach retry when opening
  const RAPID_WINDOW_MS = 12000; // how long we rapid-retry after opening

  // Perf caps
  const MAX_DPR = 2.25;
  const FPS_CAP = 60;

  // Helpers
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const $ = (sel, root = document) => root.querySelector(sel);

  function nowMs() { return Date.now(); }

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
    if (!token) throw new Error("No Spotify token");
    const res = await fetch(`${SPOTIFY_API}${path}`, {
      headers: { "Authorization": "Bearer " + token }
    });

    // /me/player may return 204 when no active device
    if (res.status === 204) return null;

    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Spotify HTTP ${res.status}`);
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

  // Force lowercase label
  titleEl.textContent = "listening mirror";

  // Make it the portal button (subtle)
  titleEl.style.cursor = "pointer";
  titleEl.style.userSelect = "none";
  titleEl.setAttribute("role", "button");
  titleEl.setAttribute("tabindex", "0");
  titleEl.setAttribute("aria-label", "Open aura");

  // Inject premium styling (no index edits needed)
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
      opacity: .0;
      transition: opacity .18s ease, transform .18s ease;
      transform: translateY(0px);
      pointer-events:none;
    }
    .wordmark .title:active:after{
      opacity: .85;
      transform: translateY(1px);
    }
    .wordmark .title.auraHover:after{
      opacity: .55;
    }

    /* Modal overlay */
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
    .auraOverlay.on .auraCard{
      transform: translateY(0) scale(1);
      opacity: 1;
    }

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

  // ---------- Build modal ----------
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

  const canvas = $("#auraOrbCanvas", overlay);
  const ctx = canvas ? canvas.getContext("2d") : null;

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

  let lastTrackId = "";
  let pollTimer = 0;

  // Rapid attach window
  let rapidTimer = 0;
  let rapidUntil = 0;

  // Signals (0..1)
  let heat = 0.55;
  let focus = 0.55;
  let depth = 0.55;
  let flux = 0.50;

  // Color driver (premium band default)
  // We'll keep hue mostly in a curated band unless Spotify drives it.
  let hue = 200;  // teal-ish default
  let sat = 78;
  let light = 62;

  // Track attach state
  let hasSpotifyData = false;
  let lastPlayerOkAt = 0;

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
        (H > .72 && X > .62) ? "Kinetic. Bright edges." :
        (D > .72 && H < .52) ? "Deep. Slow gravity." :
        (F > .72) ? "Focused. Clean center." :
        (X > .70) ? "Restless. Moving surface." :
        "Steady. Balanced field.";
      auraLine.textContent = line;
    }
  }

  function setHintText(txt) {
    if (!hint) return;
    hint.textContent = txt || "—";
  }

  function normalizePercent01(n, fallback) {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    if (v > 1.001) return clamp01(v / 100);
    return clamp01(v);
  }

  // ---------- Premium fallback color drift (NOT always blue) ----------
  // Curated band: teal(190) → indigo(240) → amber(35) and back smoothly.
  // We do a slow time-based param that moves through these anchors.
  function fallbackHue(ts) {
    // 0..1 slow loop (about ~28s)
    const t = (ts % 28000) / 28000;

    // Piecewise: 0..0.45 teal->indigo, 0.45..0.72 indigo->amber, 0.72..1 amber->teal
    let h;
    if (t < 0.45) {
      const u = t / 0.45;
      h = lerp(192, 238, u);
    } else if (t < 0.72) {
      const u = (t - 0.45) / (0.27);
      // wrap through 360: indigo(238) -> amber(35)
      // do it by moving upward to 360 then to 35
      const mid = lerp(238, 360, Math.min(1, u * 0.55));
      h = (u < 0.55) ? mid : lerp(0, 35, (u - 0.55) / 0.45);
    } else {
      const u = (t - 0.72) / 0.28;
      h = lerp(35, 192, u);
    }
    return (h % 360 + 360) % 360;
  }

  function driftFallback(ts) {
    // Very gentle signal drift (keeps it alive)
    const d = () => (Math.random() - 0.5) * 0.03;
    heat = clamp01(heat + d());
    focus = clamp01(focus + d());
    depth = clamp01(depth + d());
    flux = clamp01(flux + d());

    // Premium drift in curated hue band (time-based, visible but tasteful)
    hue = fallbackHue(ts);

    // Keep sat/light in a luxurious zone, modulated by signals
    sat = lerp(68, 90, clamp01(heat * 0.55 + flux * 0.45));
    // depth makes it darker, focus makes it clearer
    light = lerp(56, 72, clamp01(0.55 + heat * 0.18 + focus * 0.10 - depth * 0.20));
  }

  // ---------- Spotify mapping (teal ↔ amber; depth affects lightness/sat, not hue) ----------
  function applySpotifyColor({ valence, energy, danceability, tempo, depthT }) {
    // Base hue from valence: low valence => teal/indigo-ish, high => amber/orange
    // We keep it premium: teal(200) to amber(38)
    const warm = clamp01(valence);
    const baseHue = lerp(202, 38, warm);

    // Small “motion” tilt from flux/tempo (subtle, not rainbow)
    const tempoN = clamp01((tempo - 70) / 120);
    const motion = clamp01(danceability * 0.6 + tempoN * 0.4);
    const hueTilt = lerp(-10, +10, motion); // subtle

    hue = (baseHue + hueTilt + 360) % 360;

    // Saturation: energy/flux lift, depth tames it
    const satT = clamp01(energy * 0.70 + motion * 0.30);
    sat = lerp(66, 96, satT) * (1 - depthT * 0.18);

    // Lightness: energy lifts, depth darkens
    light = lerp(56, 74, clamp01(0.50 + energy * 0.32 - depthT * 0.22));
  }

  // ---------- Spotify-driven aura ----------
  async function pollSpotify() {
    try {
      const st = await getPlayer();

      if (!st || !st.item) {
        hasSpotifyData = false;
        setHintText(getToken() ? "No active playback." : "Aura waiting for Spotify…");
        // fallback drift will run in draw()
        setBars();
        return;
      }

      lastPlayerOkAt = nowMs();
      hasSpotifyData = true;

      const track = st.item?.name || "—";
      const artist = st.item?.artists?.[0]?.name || "—";
      const id = st.item?.id || "";

      setHintText(`${artist} — ${track}`);

      if (!id) {
        setBars();
        return;
      }

      // Only refetch audio-features when track changes
      if (id === lastTrackId) {
        setBars();
        return;
      }
      lastTrackId = id;

      const af = await getAudioFeatures(id);
      if (!af) {
        setBars();
        return;
      }

      // Audio-features
      const e = normalizePercent01(af.energy, heat);
      const v = normalizePercent01(af.valence, 0.5);
      const da = normalizePercent01(af.danceability, flux);
      const ac = normalizePercent01(af.acousticness, 0.45);
      const ins = normalizePercent01(af.instrumentalness, focus);
      const tempo = Number(af.tempo || 0);

      const tempoN1 = clamp01((tempo - 70) / 120);
      const tempoN2 = clamp01((tempo - 60) / 140);

      // Signals
      const heatT = clamp01(e * 0.82 + tempoN1 * 0.18);
      const focusT = clamp01(ins * 0.70 + (1 - da) * 0.30);
      const depthT = clamp01((1 - v) * 0.70 + ac * 0.30);
      const fluxT = clamp01(da * 0.68 + tempoN2 * 0.32);

      // Smooth transitions
      heat = lerp(heat, heatT, 0.32);
      focus = lerp(focus, focusT, 0.32);
      depth = lerp(depth, depthT, 0.32);
      flux = lerp(flux, fluxT, 0.32);

      // Color (premium band, not locked to blue)
      applySpotifyColor({
        valence: v,
        energy: e,
        danceability: da,
        tempo,
        depthT
      });

      setBars();
    } catch {
      hasSpotifyData = false;
      setHintText(getToken() ? "Aura waiting for Spotify…" : "Aura waiting for Spotify…");
      setBars();
    }
  }

  // ---------- Poll scheduling ----------
  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = 0;
  }

  function startPolling(isOpen) {
    stopPolling();
    pollTimer = setInterval(pollSpotify, isOpen ? OPEN_POLL_MS : CLOSED_POLL_MS);
  }

  function stopRapidRetry() {
    if (rapidTimer) clearInterval(rapidTimer);
    rapidTimer = 0;
    rapidUntil = 0;
  }

  function startRapidRetry() {
    stopRapidRetry();
    rapidUntil = nowMs() + RAPID_WINDOW_MS;
    rapidTimer = setInterval(async () => {
      if (!open) { stopRapidRetry(); return; }
      if (nowMs() > rapidUntil) { stopRapidRetry(); return; }

      await pollSpotify();

      // If we've successfully seen player recently, we can stop rapid mode
      if (hasSpotifyData && (nowMs() - lastPlayerOkAt) < 6000) {
        stopRapidRetry();
      }
    }, RAPID_RETRY_MS);
  }

  // ---------- Orb draw ----------
  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const css = 240;
    const px = Math.round(css * dpr);
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function draw(ts) {
    if (!ctx || !canvas) { rafId = 0; return; }

    // FPS cap
    if (FPS_CAP > 0) {
      const minFrame = 1000 / FPS_CAP;
      if (ts - lastFrame < minFrame) {
        rafId = requestAnimationFrame(draw);
        return;
      }
      lastFrame = ts;
    }

    resizeCanvas();

    // If Spotify not attached, drift (but still premium and visibly changing)
    if (!hasSpotifyData) {
      driftFallback(ts);
    }

    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;

    ctx.clearRect(0, 0, W, H);

    const baseR = (Math.min(W, H) * 0.26);
    const pulse = 0.5 + 0.5 * Math.sin(ts * 0.0022 + flux * 2.3);
    const r = baseR * (0.92 + pulse * 0.08 + heat * 0.06);

    // Background aura field
    const field = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.6);
    field.addColorStop(0, `hsla(${hue}, ${sat}%, ${light + 10}%, ${0.18 + heat * 0.20})`);
    field.addColorStop(0.55, `hsla(${(hue + 22) % 360}, ${sat}%, ${light}%, ${0.10 + depth * 0.16})`);
    field.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = field;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.6, 0, Math.PI * 2);
    ctx.fill();

    // Outer veil ring (keep subtle)
    ctx.strokeStyle = `hsla(${(hue + 10) % 360}, ${sat}%, ${light + 6}%, ${0.08 + focus * 0.14})`;
    ctx.lineWidth = Math.max(1, Math.round(1.6 * dpr));
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.38, 0, Math.PI * 2);
    ctx.stroke();

    // Core glass
    const core = ctx.createRadialGradient(cx - r * 0.22, cy - r * 0.28, r * 0.18, cx, cy, r);
    core.addColorStop(0, `hsla(${hue}, ${sat}%, ${light + 18}%, 0.72)`);
    core.addColorStop(0.62, `hsla(${(hue + 16) % 360}, ${sat}%, ${light + 2}%, ${0.16 + heat * 0.20})`);
    core.addColorStop(1, `hsla(${(hue + 34) % 360}, ${sat}%, ${light - 10}%, 0.10)`);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.fillStyle = `rgba(255,255,255,${0.12 + heat * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.20, cy - r * 0.30, r * 0.45, r * 0.30, -0.55, 0, Math.PI * 2);
    ctx.fill();

    // Micro particles (controlled)
    const pCount = Math.round(10 + flux * 14 + heat * 6);
    for (let i = 0; i < pCount; i++) {
      const ang = (ts * 0.00025 + i * 0.43) * (0.9 + flux * 0.8);
      const rr = r * (1.00 + 0.75 * Math.sin(ang * 2 + i));
      const px = cx + Math.cos(ang + i) * rr * (0.55 + 0.35 * Math.sin(i * 1.7));
      const py = cy + Math.sin(ang + i * 0.9) * rr * (0.55 + 0.35 * Math.cos(i * 1.3));
      const a = 0.10 + 0.18 * Math.sin(ts * 0.001 + i) * (0.55 + heat * 0.45);
      const sz = (0.9 + 1.6 * Math.abs(Math.sin(i * 1.2 + ts * 0.001))) * dpr;

      ctx.fillStyle = `hsla(${(hue + 16 + i * 6) % 360}, ${sat}%, ${light + 10}%, ${Math.max(0, a)})`;
      ctx.beginPath();
      ctx.arc(px, py, sz, 0, Math.PI * 2);
      ctx.fill();
    }

    rafId = requestAnimationFrame(draw);
  }

  // ---------- Modal open/close ----------
  function setOverlay(on) {
    open = !!on;
    if (open) {
      overlay.classList.add("on");
      titleEl.classList.add("auraHover");

      // Instant poll + rapid attach retries
      pollSpotify();
      startRapidRetry();

      startPolling(true);

      if (!rafId) rafId = requestAnimationFrame(draw);
    } else {
      overlay.classList.remove("on");
      titleEl.classList.remove("auraHover");

      stopRapidRetry();
      startPolling(false);
      // Keep RAF running (cheap), but you can stop it if you prefer.
    }
  }

  function toggle() { setOverlay(!open); }

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

  titleEl.addEventListener("click", (e) => { e.preventDefault(); toggle(); });
  titleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
  });

  // ---------- Boot ----------
  function boot() {
    setBars();

    // Prime poll in background
    pollSpotify();
    startPolling(false);

    setOverlay(false);

    // Gentle invite pulse
    let t = 0;
    const invite = setInterval(() => {
      t += 1;
      if (t > 6) { clearInterval(invite); titleEl.classList.remove("auraHover"); return; }
      titleEl.classList.toggle("auraHover", t % 2 === 1);
    }, 200);
    setTimeout(() => { titleEl.classList.remove("auraHover"); clearInterval(invite); }, 1200);

    window.addEventListener("resize", () => { if (open) resizeCanvas(); }, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
