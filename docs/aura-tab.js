/* aura-tab.js (FULL FILE REPLACE) — PART 1/3
   Listening Mirror — Aura controller + external orb engine + live aura events
   ✅ Uses window.LMOrbEngine
   ✅ Shared main orb only
   ✅ Title portal
   ✅ Spotify button in header
   ✅ Aura modal = details only
   ✅ Emits window event: "lm:aura"
*/

(() => {
  "use strict";

  const SPOTIFY_API = "https://api.spotify.com/v1";
  const OPEN_POLL_MS = 8000;
  const CLOSED_POLL_MS = 60000;
  const BURST_STEPS = [0, 350, 900, 1800, 3200, 5200];

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
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

  function normalize01(n, fallback) {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    if (v > 1.001) return clamp01(v / 100);
    return clamp01(v);
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
  style.id = "auraTabStylesExternalEngineLiveAura";
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
    }
    .auraOverlay.on{ display:flex; }
    .auraOverlay.on .auraCard{ transform:translateY(0) scale(1); opacity:1; }
  `;
  document.head.appendChild(style);
   style.textContent += `
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
          <span>Aura</span>
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

  const c = $("#lmOrbCanvas");
  const orbEngine = (window.LMOrbEngine && c)
    ? window.LMOrbEngine.mount(c, { seed: "listening-mirror" })
    : null;

  let open = false;
  let pollTimer = 0;
  let burstTimeouts = [];

  let heat = 0.55;
  let focus = 0.55;
  let depth = 0.55;
  let flux = 0.50;
  let hasSpotifyPlayback = false;

  function emitAura() {
    try {
      window.dispatchEvent(new CustomEvent("lm:aura", {
        detail: {
          heat: Math.round(clamp01(heat) * 100),
          flux: Math.round(clamp01(flux) * 100),
          focus: Math.round(clamp01(focus) * 100),
          depth: Math.round(clamp01(depth) * 100)
        }
      }));
    } catch {}
  }

  function setHintText(txt) {
    if (hint) hint.textContent = txt || "—";
    if (subHint) {
      subHint.textContent = hasSpotifyPlayback
        ? "Live from Spotify playback"
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

    emitAura();
  }
   function deriveVibeFromMetadata(meta) {
    const words = `${meta.track || ""} ${meta.artist || ""} ${meta.album || ""}`.toLowerCase();

    let H = 0.42;
    let F = 0.48;
    let D = 0.52;
    let X = 0.46;

    if (/(doom|slow|ashes|dark|night|shadow|funeral|void|grave)/.test(words)) {
      D += 0.24; H -= 0.04; X -= 0.02;
    }
    if (/(sun|gold|light|love|fire|heart|soul|summer|warm)/.test(words)) {
      H += 0.20;
    }
    if (/(run|burn|dance|electric|speed|wild|riot|move|fast|drive)/.test(words)) {
      H += 0.12; X += 0.24;
    }
    if (/(instrumental|interlude|theme|reprise|solo|suite|nocturne)/.test(words)) {
      F += 0.22; X -= 0.08;
    }

    const durMin = Number(meta.durationMs || 0) / 60000;
    if (durMin >= 7.5) { D += 0.16; F += 0.10; X -= 0.08; }
    else if (durMin > 0 && durMin <= 3.2) { X += 0.14; H += 0.08; }

    return {
      heat: clamp01(H),
      focus: clamp01(F),
      depth: clamp01(D),
      flux: clamp01(X)
    };
  }

  async function syncAura() {
    let trackId = "";
    let artUrl = "";
    let meta = { track: "", artist: "", album: "", durationMs: 0 };

    try {
      const player = await getPlayer();

      if (!player || player.__no_content || !player.item) {
        hasSpotifyPlayback = false;
        const vibe = deriveVibeFromMetadata(meta);

        heat = vibe.heat;
        focus = vibe.focus;
        depth = vibe.depth;
        flux = vibe.flux;

        setHintText("No active Spotify playback");
        setBars();

        if (orbEngine) {
          orbEngine.setSignals({ heat, focus, depth, flux });
          orbEngine.setBeat({ tempo: 96, energy: heat });
          orbEngine.setSeed("idle-field");
        }
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

      let vibe = null;
      let tempo = 110;
      let energy = 0.55;

      try {
        if (trackId) {
          const feats = await getAudioFeatures(trackId);
          if (feats) {
            energy = normalize01(feats.energy, 0.55);
            const dance = normalize01(feats.danceability, 0.50);
            const instr = normalize01(feats.instrumentalness, 0.18);
            const acoustic = normalize01(feats.acousticness, 0.30);
            tempo = Number(feats.tempo || 110);

            vibe = {
              heat: clamp01(0.28 + energy * 0.42 + dance * 0.18),
              focus: clamp01(0.22 + instr * 0.26 + (1 - dance) * 0.12),
              depth: clamp01(0.28 + acoustic * 0.14 + instr * 0.18 + (1 - energy) * 0.06),
              flux: clamp01(0.22 + dance * 0.24 + energy * 0.22)
            };
          }
        }
      } catch {
        vibe = null;
      }

      if (!vibe) {
        vibe = deriveVibeFromMetadata(meta);
        tempo = 104 + Math.round(vibe.flux * 36);
        energy = vibe.heat;
      }

      heat = vibe.heat;
      focus = vibe.focus;
      depth = vibe.depth;
      flux = vibe.flux;

      setHintText([meta.artist || "Unknown artist", meta.track || "Unknown track"].filter(Boolean).join(" — "));
      setBars();

      if (orbEngine) {
        orbEngine.setSignals({ heat, focus, depth, flux });
        orbEngine.setBeat({ tempo, energy });
        orbEngine.setSeed(`${trackId}__${meta.artist}__${meta.track}`);
        if (artUrl) safeCall(() => orbEngine.setArtwork(artUrl));
      }
    } catch {
      hasSpotifyPlayback = false;
      const vibe = deriveVibeFromMetadata(meta);

      heat = vibe.heat;
      focus = vibe.focus;
      depth = vibe.depth;
      flux = vibe.flux;

      setHintText("Spotify unavailable");
      setBars();

      if (orbEngine) {
        orbEngine.setSignals({ heat, focus, depth, flux });
        orbEngine.setBeat({ tempo: 104 + Math.round(vibe.flux * 36), energy: vibe.heat });
        orbEngine.setSeed("fallback-field");
      }
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

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) closeAura();
  });

  titleEl.addEventListener("click", openAura);
  titleEl.addEventListener("mouseenter", () => titleEl.classList.add("auraHover"));
  titleEl.addEventListener("mouseleave", () => titleEl.classList.remove("auraHover"));
  titleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAura();
    }
  });

  setBars();
  restartPolling();
  scheduleBurstSync();
  safeCall(() => syncAura());
})();
