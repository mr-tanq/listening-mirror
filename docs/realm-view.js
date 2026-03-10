(() => {
  "use strict";

  const DEFAULT_STATE = {
    biome: "Moonlit Ruins",
    mood: "Melancholic",
    motion: "Drift",
    track: "The Listening Realm",
    artist: "Prototype Track • Realm Portal v1",
    stateLabel: "Now Playing",
    heat: 0.64,
    focus: 0.72,
    depth: 0.86,
    flux: 0.41,
    portalGlow: "rgba(122,215,255,.30)",
    portalGlow2: "rgba(184,140,255,.18)",
    portalEdge: "rgba(255,255,255,.18)",
    sky: "linear-gradient(180deg, #09111E 0%, #101827 48%, #13151A 100%)",
    skyGlow: "radial-gradient(circle, rgba(122,215,255,.28), rgba(122,215,255,.06) 45%, transparent 70%)",
    moon: "radial-gradient(circle at 35% 35%, rgba(255,255,255,.95), rgba(214,227,255,.72) 55%, rgba(159,187,228,.18) 75%, transparent 100%)",
    far: "linear-gradient(180deg, rgba(39,60,88,.18), rgba(15,26,39,.94))",
    mid: "linear-gradient(180deg, rgba(22,34,49,.12), rgba(9,13,20,.98))",
    ground: "linear-gradient(180deg, rgba(8,11,16,.30), rgba(4,6,9,1))",
    particle: "rgba(210,233,255,.82)",
    towerOpacity: 0.92,
    birds: true
  };

  function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function findById(id, root = document) {
    if (!root) return null;
    if (typeof root.getElementById === "function") return root.getElementById(id);
    if (typeof root.querySelector === "function") return root.querySelector(`#${CSS.escape(id)}`);
    return null;
  }

  class RealmView {
    constructor(mountEl) {
      this.mountEl = mountEl;
      this.rootEl = null;
      this.worldEl = null;
      this.particlesEl = null;

      this.metricFills = { heat: null, focus: null, depth: null, flux: null };
      this.metricValues = { heat: null, focus: null, depth: null, flux: null };

      this.textEls = {
        biomeChip: null,
        moodLine: null,
        stateChip: null,
        track: null,
        artist: null
      };

      this.layerEls = {
        skyGlow: null,
        moon: null,
        far: null,
        mid: null,
        ground: null
      };

      this.yoda = {
        actor: null,
        body: null,
        glow: null,
        bleed: null,
        shadow: null
      };

      this.currentState = { ...DEFAULT_STATE };
      this.particleTimer = null;
      this.animFrame = 0;
      this.walkPhase = 0;
      this.t0 = performance.now();
      this.pathW = 100;
      this.isMounted = false;
    }

    mount() {
      if (!this.mountEl || this.isMounted) return;

      this.mountEl.innerHTML = this._template();

      this.rootEl = this.mountEl.querySelector(".realm-view");
      this.worldEl = this.mountEl.querySelector(".realmCinema");
      this.particlesEl = this.mountEl.querySelector(".realmCinema__particles");

      this.metricFills.heat = this.mountEl.querySelector('[data-realm-fill="heat"]');
      this.metricFills.focus = this.mountEl.querySelector('[data-realm-fill="focus"]');
      this.metricFills.depth = this.mountEl.querySelector('[data-realm-fill="depth"]');
      this.metricFills.flux = this.mountEl.querySelector('[data-realm-fill="flux"]');

      this.metricValues.heat = this.mountEl.querySelector('[data-realm-value="heat"]');
      this.metricValues.focus = this.mountEl.querySelector('[data-realm-value="focus"]');
      this.metricValues.depth = this.mountEl.querySelector('[data-realm-value="depth"]');
      this.metricValues.flux = this.mountEl.querySelector('[data-realm-value="flux"]');

      this.textEls.biomeChip = this.mountEl.querySelector('[data-realm-text="biome"]');
      this.textEls.moodLine = this.mountEl.querySelector('[data-realm-text="moodLine"]');
      this.textEls.stateChip = this.mountEl.querySelector('[data-realm-text="state"]');
      this.textEls.track = this.mountEl.querySelector('[data-realm-text="track"]');
      this.textEls.artist = this.mountEl.querySelector('[data-realm-text="artist"]');

      this.layerEls.skyGlow = this.mountEl.querySelector(".realmCinema__skyGlow");
      this.layerEls.moon = this.mountEl.querySelector(".realmCinema__moon");
      this.layerEls.far = this.mountEl.querySelector(".realmCinema__far");
      this.layerEls.mid = this.mountEl.querySelector(".realmCinema__mid");
      this.layerEls.ground = this.mountEl.querySelector(".realmCinema__ground");

      this.yoda.actor = this.mountEl.querySelector(".realmYoda");
      this.yoda.body = this.mountEl.querySelector(".realmYoda__body");
      this.yoda.glow = this.mountEl.querySelector(".realmYoda__collar");
      this.yoda.bleed = this.mountEl.querySelector(".realmYoda__bleed");
      this.yoda.shadow = this.mountEl.querySelector(".realmYoda__shadow");

      this._bindButtons();
      this.applyState(this.currentState);
      this._startWalker();
      this.isMounted = true;
    }

    unmount() {
      this._stopParticles();
      this._stopWalker();
      if (this.mountEl) this.mountEl.innerHTML = "";
      this.isMounted = false;
    }

    applyState(nextState = {}) {
      const merged = {
        ...DEFAULT_STATE,
        ...nextState,
        heat: clamp01(nextState.heat ?? this.currentState.heat ?? DEFAULT_STATE.heat),
        focus: clamp01(nextState.focus ?? this.currentState.focus ?? DEFAULT_STATE.focus),
        depth: clamp01(nextState.depth ?? this.currentState.depth ?? DEFAULT_STATE.depth),
        flux: clamp01(nextState.flux ?? this.currentState.flux ?? DEFAULT_STATE.flux)
      };

      this.currentState = merged;
      if (!this.mountEl || !this.rootEl) return;

      this._applyText(merged);
      this._applyLayers(merged);
      this._applyMetrics(merged);
      this._applyYodaAura(merged);
      this._startParticles(merged.particle, merged.flux);
    }
peakPulse() {
      if (!this.worldEl || !this.currentState) return;

      this.worldEl.animate(
        [
          { transform: "scale(1)", filter: "brightness(1)" },
          { transform: "scale(1.01)", filter: "brightness(1.12)" },
          { transform: "scale(1)", filter: "brightness(1)" }
        ],
        { duration: 650, easing: "cubic-bezier(.2,.9,.2,1)" }
      );

      if (this.yoda.glow) {
        this.yoda.glow.animate(
          [
            { transform: "translate(-50%, -50%) scale(1)", opacity: 0.9 },
            { transform: "translate(-50%, -50%) scale(1.28)", opacity: 1 },
            { transform: "translate(-50%, -50%) scale(1)", opacity: 0.9 }
          ],
          { duration: 650, easing: "ease-out" }
        );
      }

      for (let i = 0; i < 8; i += 1) {
        window.setTimeout(() => {
          this._spawnParticle(this.currentState.particle, 3200 + Math.random() * 1200);
        }, i * 45);
      }
    }

    _bindButtons() {
      const pulseBtn = findById("realmPulseBtn", this.mountEl);
      const cycleBtn = findById("realmCycleBtn", this.mountEl);

      if (pulseBtn) {
        pulseBtn.addEventListener("click", () => this.peakPulse());
      }

      if (cycleBtn) {
        cycleBtn.style.display = "none";
        cycleBtn.disabled = true;
      }
    }

    _applyText(state) {
      if (this.textEls.biomeChip) this.textEls.biomeChip.textContent = state.biome;
      if (this.textEls.moodLine) this.textEls.moodLine.textContent = `${state.mood} • ${state.motion} • Animated`;
      if (this.textEls.stateChip) this.textEls.stateChip.textContent = state.stateLabel;
      if (this.textEls.track) this.textEls.track.textContent = state.track;
      if (this.textEls.artist) this.textEls.artist.textContent = state.artist;
    }

    _applyLayers(state) {
      const focus = state.focus;
      const depth = state.depth;
      const heat = state.heat;
      const flux = state.flux;

      if (this.rootEl) {
        this.rootEl.style.setProperty("--realm-glow", state.portalGlow);
        this.rootEl.style.setProperty("--realm-glow-2", state.portalGlow2);
        this.rootEl.style.setProperty("--realm-edge", state.portalEdge);
        this.rootEl.style.setProperty("--realm-focus", String(focus));
        this.rootEl.style.setProperty("--realm-depth", String(depth));
        this.rootEl.style.setProperty("--realm-heat", String(heat));
        this.rootEl.style.setProperty("--realm-flux", String(flux));
      }

      if (this.worldEl) {
        this.worldEl.style.background = state.sky;
      }
      if (this.layerEls.skyGlow) {
        this.layerEls.skyGlow.style.background = state.skyGlow;
        this.layerEls.skyGlow.style.opacity = String(0.35 + heat * 0.45);
        this.layerEls.skyGlow.style.filter = `blur(${18 + depth * 18}px)`;
      }
      if (this.layerEls.moon) {
        this.layerEls.moon.style.background = state.moon;
        this.layerEls.moon.style.opacity = String(0.55 + focus * 0.35);
      }
      if (this.layerEls.far) {
        this.layerEls.far.style.background = state.far;
        this.layerEls.far.style.opacity = String(0.75 + depth * 0.18);
      }
      if (this.layerEls.mid) {
        this.layerEls.mid.style.background = state.mid;
        this.layerEls.mid.style.opacity = String(0.82 + focus * 0.12);
      }
      if (this.layerEls.ground) {
        this.layerEls.ground.style.background = state.ground;
      }
    }

    _applyMetrics(state) {
      this._setMetric("heat", state.heat);
      this._setMetric("focus", state.focus);
      this._setMetric("depth", state.depth);
      this._setMetric("flux", state.flux);
    }

    _setMetric(name, value) {
      const fillEl = this.metricFills[name];
      const valueEl = this.metricValues[name];
      if (fillEl) fillEl.style.width = `${Math.round(clamp01(value) * 100)}%`;
      if (valueEl) valueEl.textContent = value.toFixed(2);
    }

    _applyYodaAura(state) {
      const heat = state.heat;
      const depth = state.depth;
      const flux = state.flux;
      const focus = state.focus;

      const hue = Math.round(205 - (heat * 155));
      const sat = Math.round(72 + heat * 20);
      const light = Math.round(62 + focus * 12);

      if (this.yoda.glow) {
        this.yoda.glow.style.background = `radial-gradient(circle, hsla(${hue}, ${sat}%, ${light}%, .95) 0%, hsla(${hue}, ${sat}%, ${light}%, .46) 38%, transparent 72%)`;
        this.yoda.glow.style.opacity = String(0.48 + heat * 0.35);
        this.yoda.glow.style.filter = `blur(${6 + depth * 6}px)`;
      }

      if (this.yoda.bleed) {
        this.yoda.bleed.style.background = `radial-gradient(circle at 50% 50%, hsla(${hue}, ${sat}%, ${light}%, .26) 0%, hsla(${hue}, ${sat}%, ${light}%, .10) 44%, transparent 78%)`;
        this.yoda.bleed.style.opacity = String(0.35 + heat * 0.25);
        this.yoda.bleed.style.filter = `blur(${10 + depth * 10}px)`;
      }

      if (this.yoda.shadow) {
        this.yoda.shadow.style.opacity = String(0.22 + (1 - focus) * 0.18);
      }

      if (this.yoda.actor) {
        this.yoda.actor.style.setProperty("--yoda-flux", String(flux));
      }
    }

    _stopParticles() {
      if (this.particleTimer) {
        clearInterval(this.particleTimer);
        this.particleTimer = null;
      }
      if (this.particlesEl) {
        this.particlesEl.innerHTML = "";
      }
    }

    _startParticles(color, flux) {
      this._stopParticles();
      if (!this.particlesEl) return;

      const baseMs = Math.max(260, 1200 - clamp01(flux) * 850);

      for (let i = 0; i < 8; i += 1) {
        window.setTimeout(() => {
          this._spawnParticle(color, 5200 + Math.random() * 2200);
        }, i * 120);
      }

      this.particleTimer = window.setInterval(() => {
        this._spawnParticle(color, 5200 + Math.random() * 2200);
      }, baseMs);
    }

    _spawnParticle(color, duration = 5000) {
      if (!this.particlesEl) return;

      const p = document.createElement("span");
      p.className = "realmCinema__particle";
      const left = 4 + Math.random() * 92;
      const top = 12 + Math.random() * 70;
      const size = 2 + Math.random() * 3.6;

      p.style.left = `${left}%`;
      p.style.top = `${top}%`;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.background = color;
      p.style.boxShadow = `0 0 10px ${color}`;
      p.style.animationDuration = `${duration * (0.8 + Math.random() * 0.5)}ms`;

      this.particlesEl.appendChild(p);
      window.setTimeout(() => p.remove(), duration + 1200);
    }
_startWalker() {
      this._stopWalker();

      const tick = (now) => {
        if (!this.yoda.actor) return;
        const t = (now - this.t0) / 1000;
        const flux = this.currentState?.flux ?? 0.5;
        const isPaused = String(this.currentState?.stateLabel || "").toLowerCase() === "paused";

        const speed = isPaused ? 0.006 : 0.012 + flux * 0.010;
        let phase = (t * speed) % 2;
        let forward = phase < 1;
        let p = forward ? phase : (2 - phase); // 0..1..0

        const xPct = 10 + p * 80;
        const yBump =
          Math.sin((xPct / 100) * Math.PI * 2.2) * 7 +
          Math.sin((xPct / 100) * Math.PI * 5.3) * 3;

        const walkAmp = isPaused ? 0 : (2 + flux * 2.5);
        const bob = Math.sin(t * (isPaused ? 1.8 : 6.2)) * walkAmp;

        this.walkPhase = t;
        this.yoda.actor.style.left = `${xPct}%`;
        this.yoda.actor.style.bottom = `${22 + yBump + bob}px`;
        this.yoda.actor.style.transform = `translateX(-50%) scaleX(${forward ? 1 : -1})`;

        if (this.yoda.body) {
          const step = isPaused ? 0 : Math.sin(t * 8.2);
          this.yoda.body.style.transform = `translateY(${step * 0.7}px) rotate(${step * 0.8}deg)`;
        }

        if (this.yoda.glow) {
          const pulse = isPaused ? (0.94 + Math.sin(t * 1.8) * 0.05) : (0.96 + Math.sin(t * (2.8 + flux * 7)) * (0.07 + flux * 0.08));
          this.yoda.glow.style.transform = `translate(-50%, -50%) scale(${pulse})`;
        }

        this.animFrame = requestAnimationFrame(tick);
      };

      this.animFrame = requestAnimationFrame(tick);
    }

    _stopWalker() {
      if (this.animFrame) {
        cancelAnimationFrame(this.animFrame);
        this.animFrame = 0;
      }
    }

    _template() {
      return `
        <div class="realm-view">
          <style>
            .realmCineCard{
              border-radius:24px;
              background:rgba(255,255,255,.035);
              outline:1px solid rgba(255,255,255,.08);
              box-shadow:inset 0 1px 0 rgba(255,255,255,.03), 0 18px 36px rgba(0,0,0,.12);
              overflow:hidden;
            }
            .realmCineTop{
              padding:12px 14px 0;
            }
            .realmCineStatus{
              display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px;
            }
            .realmCinema{
              position:relative;
              width:100%;
              aspect-ratio:16/10;
              overflow:hidden;
              border-radius:18px;
              border:1px solid rgba(255,255,255,.08);
              box-shadow:inset 0 0 0 1px rgba(255,255,255,.03), inset 0 -40px 60px rgba(0,0,0,.24);
              isolation:isolate;
            }
            .realmCinema::before{
              content:"";
              position:absolute; inset:0;
              background:
                radial-gradient(500px 220px at 50% 18%, rgba(255,255,255,.04), transparent 70%),
                linear-gradient(180deg, rgba(255,255,255,.02), transparent 28%, transparent 70%, rgba(0,0,0,.12));
              z-index:1; pointer-events:none;
            }
            .realmCinema__skyGlow,
            .realmCinema__stars,
            .realmCinema__fog,
            .realmCinema__particles,
            .realmCinema__far,
            .realmCinema__mid,
            .realmCinema__ground,
            .realmCinema__moon{
              position:absolute;
              inset:0;
              pointer-events:none;
            }
            .realmCinema__skyGlow{
              width:62%;
              height:62%;
              left:18%;
              top:4%;
              border-radius:50%;
              mix-blend-mode:screen;
              animation: realmSkyDrift 18s ease-in-out infinite alternate;
              z-index:2;
            }
            .realmCinema__stars{
              background-image:
                radial-gradient(circle at 12% 24%, rgba(255,255,255,.92) 0 1px, transparent 1.8px),
                radial-gradient(circle at 28% 18%, rgba(255,255,255,.68) 0 1px, transparent 1.8px),
                radial-gradient(circle at 63% 12%, rgba(255,255,255,.84) 0 1px, transparent 1.8px),
                radial-gradient(circle at 82% 20%, rgba(255,255,255,.55) 0 1px, transparent 1.8px),
                radial-gradient(circle at 74% 28%, rgba(255,255,255,.44) 0 1px, transparent 1.8px);
              opacity:.72;
              animation: realmStarTwinkle 6s linear infinite;
              z-index:2;
            }
            .realmCinema__moon{
              width:12%;
              aspect-ratio:1;
              right:13%;
              top:14%;
              border-radius:50%;
              box-shadow:0 0 26px rgba(214,227,255,.26);
              opacity:.92;
              z-index:3;
            }
            .realmCinema__far{
              left:-4%;
              right:-4%;
              top:38%;
              bottom:24%;
              clip-path:polygon(0% 100%, 0% 66%, 10% 57%, 18% 68%, 30% 42%, 44% 66%, 58% 50%, 70% 70%, 82% 44%, 100% 62%, 100% 100%);
              z-index:4;
              animation: realmFarPan 34s ease-in-out infinite alternate;
            }
            .realmCinema__mid{
              left:-5%;
              right:-5%;
              top:50%;
              bottom:14%;
              clip-path:polygon(0% 100%, 0% 72%, 8% 62%, 16% 70%, 25% 56%, 37% 74%, 47% 50%, 56% 66%, 66% 54%, 75% 74%, 86% 60%, 100% 70%, 100% 100%);
              z-index:5;
              animation: realmMidPan 24s ease-in-out infinite alternate;
            }
            .realmCinema__ground{
              left:-4%;
              right:-4%;
              bottom:-1%;
              height:26%;
              clip-path:polygon(0% 100%, 0% 38%, 10% 44%, 18% 36%, 29% 46%, 38% 34%, 49% 44%, 58% 30%, 68% 42%, 78% 34%, 88% 46%, 100% 36%, 100% 100%);
              z-index:8;
              animation: realmGroundPan 16s ease-in-out infinite alternate;
            }
            .realmCinema__fog{
              background:
                radial-gradient(500px 130px at 40% 78%, rgba(220,235,255,.12), transparent 72%),
                radial-gradient(420px 120px at 72% 76%, rgba(220,235,255,.08), transparent 74%);
              mix-blend-mode:screen;
              opacity:.32;
              z-index:9;
              animation: realmFogDriftWide 20s ease-in-out infinite alternate;
            }
            .realmCinema__particles{
              z-index:10;
            }
            .realmCinema__particle{
              position:absolute;
              border-radius:50%;
              opacity:.72;
              animation: realmParticleDrift linear forwards;
            }

            .realmYoda{
              position:absolute;
              z-index:12;
              width:34px;
              height:28px;
              pointer-events:none;
              will-change:left,bottom,transform;
            }
            .realmYoda__shadow{
              position:absolute;
              left:50%;
              bottom:-3px;
              width:26px;
              height:7px;
              transform:translateX(-50%);
              border-radius:50%;
              background:rgba(0,0,0,.48);
              filter:blur(2px);
            }
            .realmYoda__bleed{
              position:absolute;
              left:50%;
              bottom:-5px;
              width:42px;
              height:16px;
              transform:translateX(-50%);
              border-radius:50%;
              opacity:.4;
            }
            .realmYoda__body{
              position:absolute;
              inset:0;
              transform-origin:50% 100%;
            }
            .realmYoda__body::before{
              content:"";
              position:absolute;
              inset:0;
              background:#0b0c10;
              clip-path:polygon(7% 64%, 11% 41%, 21% 27%, 28% 8%, 38% 26%, 55% 15%, 63% 7%, 70% 24%, 84% 35%, 93% 55%, 86% 72%, 78% 74%, 73% 94%, 61% 94%, 59% 76%, 42% 76%, 38% 94%, 24% 94%, 22% 74%, 12% 72%);
              filter:drop-shadow(0 1px 0 rgba(255,255,255,.02));
            }
            .realmYoda__collar{
              position:absolute;
              left:58%;
              top:48%;
              width:16px;
              height:16px;
              transform:translate(-50%, -50%);
              border-radius:50%;
              opacity:.92;
              mix-blend-mode:screen;
            }

            .realmMetaWrap{
              padding:14px;
              display:grid;
              gap:12px;
            }
            .realmActionsRow{
              display:flex;
              justify-content:flex-end;
            }

            @keyframes realmSkyDrift{
              from{ transform:translateX(-10px) scale(.98); }
              to{ transform:translateX(12px) scale(1.03); }
            }
            @keyframes realmStarTwinkle{
              0%,100%{ opacity:.56; }
              50%{ opacity:.9; }
            }
            @keyframes realmFarPan{
              from{ transform:translateX(-1.2%); }
              to{ transform:translateX(1.6%); }
            }
            @keyframes realmMidPan{
              from{ transform:translateX(-2.6%); }
              to{ transform:translateX(2.8%); }
            }
            @keyframes realmGroundPan{
              from{ transform:translateX(-1.8%); }
              to{ transform:translateX(1.8%); }
            }
            @keyframes realmFogDriftWide{
              from{ transform:translateX(-3%) translateY(0); opacity:.24; }
              to{ transform:translateX(4%) translateY(-1%); opacity:.38; }
            }
            @keyframes realmParticleDrift{
              0%{ transform:translateY(0) scale(.7); opacity:0; }
              10%{ opacity:.78; }
              100%{ transform:translateY(-36px) scale(1.08); opacity:0; }
            }

            @media (max-width:420px){
              .realmYoda{ width:30px; height:25px; }
            }
          </style>

          <div class="realm-stack">
            <section class="realmCineCard">
              <div class="realmCineTop">
                <div class="realmCineStatus realm-status">
                  <div class="realm-badge">
                    <span class="realm-badge__dot" aria-hidden="true"></span>
                    <span class="realm-badge__text" data-realm-text="moodLine">Melancholic • Drift • Animated</span>
                  </div>
                  <div class="realm-chip" data-realm-text="biome">Moonlit Ruins</div>
                </div>

                <div class="realmCinema">
                  <div class="realmCinema__skyGlow"></div>
                  <div class="realmCinema__stars"></div>
                  <div class="realmCinema__moon"></div>
                  <div class="realmCinema__far"></div>
                  <div class="realmCinema__mid"></div>
                  <div class="realmCinema__ground"></div>
                  <div class="realmCinema__fog"></div>
                  <div class="realmCinema__particles"></div>

                  <div class="realmYoda">
                    <div class="realmYoda__bleed"></div>
                    <div class="realmYoda__shadow"></div>
                    <div class="realmYoda__body"></div>
                    <div class="realmYoda__collar"></div>
                  </div>
                </div>
              </div>

              <div class="realmMetaWrap">
                <div>
                  <p class="realm-track" data-realm-text="track">The Listening Realm</p>
                  <p class="realm-artist" data-realm-text="artist">Prototype Track • Realm Portal v1</p>
                </div>

                <div class="realm-status">
                  <div class="realm-badge">
                    <span class="realm-badge__dot" aria-hidden="true"></span>
                    <span class="realm-badge__text" data-realm-text="state">Now Playing</span>
                  </div>
                </div>

                <div class="realm-metrics">
                  <div class="realm-metric">
                    <div class="realm-metric__label">Heat</div>
                    <div class="realm-metric__value" data-realm-value="heat">0.64</div>
                    <div class="realm-bar"><div class="realm-bar__fill" data-realm-fill="heat" style="--realm-bar-color: var(--realm-heat)"></div></div>
                  </div>
                  <div class="realm-metric">
                    <div class="realm-metric__label">Focus</div>
                    <div class="realm-metric__value" data-realm-value="focus">0.72</div>
                    <div class="realm-bar"><div class="realm-bar__fill" data-realm-fill="focus" style="--realm-bar-color: var(--realm-focus)"></div></div>
                  </div>
                  <div class="realm-metric">
                    <div class="realm-metric__label">Depth</div>
                    <div class="realm-metric__value" data-realm-value="depth">0.86</div>
                    <div class="realm-bar"><div class="realm-bar__fill" data-realm-fill="depth" style="--realm-bar-color: var(--realm-depth)"></div></div>
                  </div>
                  <div class="realm-metric">
                    <div class="realm-metric__label">Flux</div>
                    <div class="realm-metric__value" data-realm-value="flux">0.41</div>
                    <div class="realm-bar"><div class="realm-bar__fill" data-realm-fill="flux" style="--realm-bar-color: var(--realm-flux)"></div></div>
                  </div>
                </div>

                <div class="realmActionsRow">
                  <button id="realmPulseBtn" class="realm-btn" type="button">Peak Pulse</button>
                  <button id="realmCycleBtn" class="realm-btn" type="button" style="display:none">Cycle Realm</button>
                </div>
              </div>
            </section>
          </div>
        </div>
      `;
    }
  }
window.RealmView = {
    create(mountEl) {
      const view = new RealmView(mountEl);
      view.mount();
      return view;
    },
    defaults: { ...DEFAULT_STATE }
  };
})();