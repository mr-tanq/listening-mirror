/* aura-tab.js (FULL FILE REPLACE)
   Listening Mirror — Aura Popup (title portal)
   ✅ Makes wordmark title lowercase: "listening mirror"
   ✅ Premium "sacred" styling (tracking + subtle halo)
   ✅ Tap title opens Aura popup (modal card)
   ✅ Uses Spotify /me/player + /audio-features to drive aura
   ✅ Big orb + 4 signals: heat, focus, depth, flux
   ✅ Robust: if Spotify unavailable => graceful fallback + still looks alive
*/

(() => {
  "use strict";

  const SPOTIFY_API = "https://api.spotify.com/v1";

  // Polling
  const OPEN_POLL_MS = 12_000;
  const CLOSED_POLL_MS = 45_000;

  // Perf caps
  const MAX_DPR = 2.25;
  const FPS_CAP = 60;

  // Helpers
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a,b,t) => a + (b-a)*t;
  const $ = (sel, root=document) => root.querySelector(sel);

  function getToken(){
    if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
      return window.SpotifyAuth.getAccessToken();
    }
    if (window.SpotifyPlayer && typeof window.SpotifyPlayer.getAccessToken === "function") {
      return window.SpotifyPlayer.getAccessToken();
    }
    return null;
  }

  async function spotifyGet(path){
    const token = getToken();
    if(!token) throw new Error("No Spotify token");
    const res = await fetch(`${SPOTIFY_API}${path}`, {
      headers: { "Authorization": "Bearer " + token }
    });
    if(res.status === 204) return null;
    const json = await res.json().catch(()=>null);
    if(!res.ok) throw new Error(`Spotify HTTP ${res.status}`);
    return json;
  }

  async function getPlayer(){
    return await spotifyGet("/me/player");
  }

  async function getAudioFeatures(trackId){
    return await spotifyGet(`/audio-features/${encodeURIComponent(trackId)}`);
  }

  // ---------- Find title ----------
  const titleEl = $(".wordmark .title");
  const brandEl = $(".brand");
  if(!titleEl || !brandEl) return;

  // Force lowercase label (your chosen option 1)
  titleEl.textContent = "listening mirror";

  // Make it the portal button (but subtle)
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

    .auraBody{
      padding: 16px;
    }

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

  // ---------- State (0..1) ----------
  let open = false;
  let rafId = 0;
  let lastFrame = 0;
  let lastTrackId = "";
  let pollTimer = 0;

  // Signals
  let heat = 0.55;   // energy
  let focus = 0.55;  // instrumentalness + low speechiness-ish (we don't have speechiness in audio-features)
  let depth = 0.55;  // low valence + acousticness blend
  let flux = 0.50;   // danceability + tempo blend

  // Color driver
  let hue = 210;     // will shift per track
  let sat = 88;
  let light = 62;

  function setOverlay(on){
    open = !!on;
    if(open){
      overlay.classList.add("on");
      titleEl.classList.add("auraHover");
      startPolling(true);
      if(!rafId) rafId = requestAnimationFrame(draw);
    }else{
      overlay.classList.remove("on");
      titleEl.classList.remove("auraHover");
      startPolling(false);
    }
  }

  function toggle(){
    setOverlay(!open);
  }

  // Close handlers
  closeBtn?.addEventListener("click", () => setOverlay(false), { passive:true });

  // Click outside card closes
  overlay.addEventListener("pointerdown", (e) => {
    if(!open) return;
    if(card && card.contains(e.target)) return;
    setOverlay(false);
  }, { passive:true });

  // ESC closes
  document.addEventListener("keydown", (e) => {
    if(!open) return;
    if(e.key === "Escape") setOverlay(false);
  });

  // Title handlers
  titleEl.addEventListener("click", (e) => {
    e.preventDefault();
    toggle();
  });

  titleEl.addEventListener("keydown", (e) => {
    if(e.key === "Enter" || e.key === " "){
      e.preventDefault();
      toggle();
    }
  });

  // ---------- UI update ----------
  function setBars(){
    const H = clamp01(heat);
    const F = clamp01(focus);
    const D = clamp01(depth);
    const X = clamp01(flux);

    if(heatBar) heatBar.style.width = `${Math.round(H*100)}%`;
    if(focusBar) focusBar.style.width = `${Math.round(F*100)}%`;
    if(depthBar) depthBar.style.width = `${Math.round(D*100)}%`;
    if(fluxBar) fluxBar.style.width = `${Math.round(X*100)}%`;

    if(heatNum) heatNum.textContent = `${Math.round(H*100)}`;
    if(focusNum) focusNum.textContent = `${Math.round(F*100)}`;
    if(depthNum) depthNum.textContent = `${Math.round(D*100)}`;
    if(fluxNum) fluxNum.textContent = `${Math.round(X*100)}`;

    if(auraLine){
      // Minimal, premium wording
      const line =
        (H > .72 && X > .62) ? "Kinetic. Bright edges." :
        (D > .72 && H < .52) ? "Deep. Slow gravity." :
        (F > .72) ? "Focused. Clean center." :
        (X > .70) ? "Restless. Moving surface." :
        "Steady. Balanced field.";
      auraLine.textContent = line;
    }
  }

  function setHintText(txt){
    if(!hint) return;
    hint.textContent = txt || "—";
  }

  // ---------- Spotify-driven aura ----------
  function normalizePercent01(n, fallback){
    const v = Number(n);
    if(!Number.isFinite(v)) return fallback;
    if(v > 1.001) return clamp01(v/100);
    return clamp01(v);
  }

  async function pollSpotify(){
    try{
      const st = await getPlayer();
      if(!st || !st.item){
        setHintText("No active playback.");
        // gentle drift
        driftFallback();
        setBars();
        return;
      }

      const track = st.item?.name || "—";
      const artist = st.item?.artists?.[0]?.name || "—";
      const id = st.item?.id || "";

      // Update hint always (feels alive even if features fail)
      setHintText(`${artist} — ${track}`);

      if(!id){
        driftFallback();
        setBars();
        return;
      }

      // Only refetch audio-features when track changes
      if(id === lastTrackId){
        // small time-based breathing even when same track
        breatheFromTempo(null);
        setBars();
        return;
      }
      lastTrackId = id;

      const af = await getAudioFeatures(id);
      if(!af){
        driftFallback();
        setBars();
        return;
      }

      // Audio-features (0..1): energy, valence, danceability, acousticness, instrumentalness
      const e = normalizePercent01(af.energy, heat);
      const v = normalizePercent01(af.valence, 0.5);
      const da = normalizePercent01(af.danceability, flux);
      const ac = normalizePercent01(af.acousticness, 0.45);
      const ins = normalizePercent01(af.instrumentalness, focus);
      const tempo = Number(af.tempo || 0);

      // Map to our “mystical” signals (still grounded in Spotify data)
      // Heat: mostly energy, slightly tempo
      const heatT = clamp01(e*0.82 + clamp01((tempo-70)/120)*0.18);

      // Focus: instrumentalness + lower danceability (less “party”) gives more “focus”
      const focusT = clamp01(ins*0.70 + (1-da)*0.30);

      // Depth: low valence + some acousticness gives “depth/weight”
      const depthT = clamp01((1-v)*0.70 + ac*0.30);

      // Flux: danceability + tempo (movement)
      const fluxT = clamp01(da*0.68 + clamp01((tempo-60)/140)*0.32);

      // Smooth transitions (premium feel)
      heat = lerp(heat, heatT, 0.32);
      focus = lerp(focus, focusT, 0.32);
      depth = lerp(depth, depthT, 0.32);
      flux = lerp(flux, fluxT, 0.32);

      // Color: hue depends on valence + depth.
      // - Higher valence => warmer
      // - Higher depth => shift to violet/indigo
      const warm = v;         // 0..1
      const deep = depthT;    // 0..1

      const targetHue =
        lerp(205, 32, warm) + lerp(0, 55, deep); // blue -> warm, then pull into violet when deep
      hue = (targetHue % 360 + 360) % 360;

      sat = lerp(72, 96, clamp01(heatT*0.65 + fluxT*0.35));
      light = lerp(56, 70, clamp01(0.55 + heatT*0.25 - depthT*0.18));

      // Also “breathe” based on tempo
      breatheFromTempo(tempo);

      setBars();
    }catch{
      // Spotify not ready / token missing / CORS etc.
      setHintText("Aura waiting for Spotify…");
      driftFallback();
      setBars();
    }
  }

  function driftFallback(){
    const d = () => (Math.random() - 0.5) * 0.04;
    heat = clamp01(heat + d());
    focus = clamp01(focus + d());
    depth = clamp01(depth + d());
    flux = clamp01(flux + d());

    // slow hue drift
    hue = (hue + (Math.random()-0.5)*6 + 360) % 360;
    sat = clamp01(sat/100 + d())*100;
    light = clamp01(light/100 + d())*100;
  }

  function breatheFromTempo(tempo){
    // tempo influences internal “pulse speed” used in draw()
    // we store as a derived factor (cheap)
    // If tempo missing, keep stable.
    if(!Number.isFinite(tempo) || tempo <= 0) return;
    // no-op here; draw() uses current signals anyway
  }

  function startPolling(isOpen){
    if(pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollSpotify, isOpen ? OPEN_POLL_MS : CLOSED_POLL_MS);
  }

  // ---------- Orb draw (big, premium, not neon-cheap) ----------
  function resizeCanvas(){
    if(!c || !ctx) return;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const css = 240; // matches style width/height
    const px = Math.round(css * dpr);
    if(c.width !== px || c.height !== px){
      c.width = px;
      c.height = px;
    }
    ctx.setTransform(1,0,0,1,0,0);
  }

  function draw(ts){
    if(!ctx || !c){
      rafId = 0;
      return;
    }

    // FPS cap
    if(FPS_CAP > 0){
      const minFrame = 1000 / FPS_CAP;
      if(ts - lastFrame < minFrame){
        rafId = requestAnimationFrame(draw);
        return;
      }
      lastFrame = ts;
    }

    resizeCanvas();

    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const W = c.width, H = c.height;
    const cx = W/2, cy = H/2;

    ctx.clearRect(0,0,W,H);

    // Convert css-space feel into px-space
    const baseR = (Math.min(W,H) * 0.26);
    const pulse = 0.5 + 0.5*Math.sin(ts*0.0022 + flux*2.3);
    const r = baseR * (0.92 + pulse*0.08 + heat*0.06);

    // Background aura field
    const field = ctx.createRadialGradient(cx, cy, r*0.2, cx, cy, r*2.6);
    field.addColorStop(0, `hsla(${hue}, ${sat}%, ${light+10}%, ${0.20 + heat*0.20})`);
    field.addColorStop(0.55, `hsla(${(hue+28)%360}, ${sat}%, ${light}%, ${0.10 + depth*0.16})`);
    field.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = field;
    ctx.beginPath();
    ctx.arc(cx, cy, r*2.6, 0, Math.PI*2);
    ctx.fill();

    // Outer veil ring
    ctx.strokeStyle = `hsla(${(hue+12)%360}, ${sat}%, ${light+6}%, ${0.10 + focus*0.14})`;
    ctx.lineWidth = Math.max(1, Math.round(1.6*dpr));
    ctx.beginPath();
    ctx.arc(cx, cy, r*1.38, 0, Math.PI*2);
    ctx.stroke();

    // Core glass
    const core = ctx.createRadialGradient(cx - r*0.22, cy - r*0.28, r*0.18, cx, cy, r);
    core.addColorStop(0, `hsla(${hue}, ${sat}%, ${light+18}%, 0.72)`);
    core.addColorStop(0.62, `hsla(${(hue+18)%360}, ${sat}%, ${light+2}%, ${0.18 + heat*0.20})`);
    core.addColorStop(1, `hsla(${(hue+40)%360}, ${sat}%, ${light-10}%, 0.10)`);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.fill();

    // Specular highlight (premium glass)
    ctx.fillStyle = `rgba(255,255,255,${0.12 + heat*0.08})`;
    ctx.beginPath();
    ctx.ellipse(cx - r*0.20, cy - r*0.30, r*0.45, r*0.30, -0.55, 0, Math.PI*2);
    ctx.fill();

    // Micro particles (controlled, not noisy)
    const pCount = Math.round(10 + flux*14 + heat*6);
    for(let i=0;i<pCount;i++){
      const ang = (ts*0.00025 + i*0.43) * (0.9 + flux*0.8);
      const rr = r*(1.00 + 0.75*Math.sin(ang*2 + i));
      const px = cx + Math.cos(ang + i)*rr*(0.55 + 0.35*Math.sin(i*1.7));
      const py = cy + Math.sin(ang + i*0.9)*rr*(0.55 + 0.35*Math.cos(i*1.3));
      const a = 0.10 + 0.18*Math.sin(ts*0.001 + i) * (0.55 + heat*0.45);
      const sz = (0.9 + 1.6*Math.abs(Math.sin(i*1.2 + ts*0.001))) * dpr;

      ctx.fillStyle = `hsla(${(hue + 18 + i*7)%360}, ${sat}%, ${light+10}%, ${Math.max(0, a)})`;
      ctx.beginPath();
      ctx.arc(px, py, sz, 0, Math.PI*2);
      ctx.fill();
    }

    // If modal closed, keep rendering slower? (we just keep running; cheap)
    rafId = requestAnimationFrame(draw);
  }

  // ---------- Boot ----------
  function boot(){
    setBars();
    pollSpotify();
    startPolling(false);

    // Keep it CLOSED by default
    setOverlay(false);

    // Gentle “invite” pulse once (1.2s) to hint it opens (not spammy)
    let t = 0;
    const invite = setInterval(() => {
      t += 1;
      if(t > 6){ clearInterval(invite); titleEl.classList.remove("auraHover"); return; }
      titleEl.classList.toggle("auraHover", t % 2 === 1);
    }, 200);
    setTimeout(() => { titleEl.classList.remove("auraHover"); clearInterval(invite); }, 1200);

    // If user scrolls / rotates, keep canvas crisp
    window.addEventListener("resize", () => { if(open) resizeCanvas(); }, { passive:true });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot, { once:true });
  }else{
    boot();
  }
})();
