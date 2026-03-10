(() => {
  "use strict";

  const DEFAULT_STATE = {
    biome: "Moonlit Ruins",
    mood: "Melancholic",
    motion: "Drift",
    track: "The Listening Realm",
    artist: "Prototype Track • Realm Portal v1",
    album: "",
    albumImage: "",
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
    particle: "rgba(210,233,255,.82)"
  };

  function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  class RealmView {
    constructor(mountEl) {
      this.mountEl = mountEl;
      this.rootEl = null;
      this.heroEl = null;
      this.worldEl = null;
      this.particlesEl = null;

      this.textEls = {
        biomeChip: null,
        moodLine: null,
        stateChip: null,
        track: null,
        artist: null,
        album: null
      };

      this.metricFills = { heat: null, focus: null, depth: null, flux: null };
      this.metricValues = { heat: null, focus: null, depth: null, flux: null };

      this.layers = {
        artBlur: null,
        artSharp: null,
        tint: null,
        skyGlow: null,
        moon: null,
        far: null,
        mid: null,
        ground: null,
        fogBack: null,
        fogFront: null
      };

      this.yoda = {
        actor: null,
        shadow: null,
        bleed: null,
        body: null,
        collar: null
      };

      this.currentState = { ...DEFAULT_STATE };
      this.isMounted = false;
      this.particleTimer = null;
      this.walkFrame = 0;
      this.walkStart = performance.now();
    }

    mount() {
      if (!this.mountEl || this.isMounted) return;

      this.mountEl.innerHTML = this._template();
      this.rootEl = this.mountEl.querySelector(".realmHeroView");
      this.heroEl = this.mountEl.querySelector(".realmHero");
      this.worldEl = this.mountEl.querySelector(".realmWorld");
      this.particlesEl = this.mountEl.querySelector(".realmWorld__particles");

      this.textEls.biomeChip = this.mountEl.querySelector('[data-realm-text="biome"]');
      this.textEls.moodLine = this.mountEl.querySelector('[data-realm-text="moodLine"]');
      this.textEls.stateChip = this.mountEl.querySelector('[data-realm-text="state"]');
      this.textEls.track = this.mountEl.querySelector('[data-realm-text="track"]');
      this.textEls.artist = this.mountEl.querySelector('[data-realm-text="artist"]');
      this.textEls.album = this.mountEl.querySelector('[data-realm-text="album"]');

      this.metricFills.heat = this.mountEl.querySelector('[data-realm-fill="heat"]');
      this.metricFills.focus = this.mountEl.querySelector('[data-realm-fill="focus"]');
      this.metricFills.depth = this.mountEl.querySelector('[data-realm-fill="depth"]');
      this.metricFills.flux = this.mountEl.querySelector('[data-realm-fill="flux"]');

      this.metricValues.heat = this.mountEl.querySelector('[data-realm-value="heat"]');
      this.metricValues.focus = this.mountEl.querySelector('[data-realm-value="focus"]');
      this.metricValues.depth = this.mountEl.querySelector('[data-realm-value="depth"]');
      this.metricValues.flux = this.mountEl.querySelector('[data-realm-value="flux"]');

      this.layers.artBlur = this.mountEl.querySelector(".realmWorld__artBlur");
      this.layers.artSharp = this.mountEl.querySelector(".realmWorld__artSharp");
      this.layers.tint = this.mountEl.querySelector(".realmWorld__tint");
      this.layers.skyGlow = this.mountEl.querySelector(".realmWorld__skyGlow");
      this.layers.moon = this.mountEl.querySelector(".realmWorld__moon");
      this.layers.far = this.mountEl.querySelector(".realmWorld__far");
      this.layers.mid = this.mountEl.querySelector(".realmWorld__mid");
      this.layers.ground = this.mountEl.querySelector(".realmWorld__ground");
      this.layers.fogBack = this.mountEl.querySelector(".realmWorld__fogBack");
      this.layers.fogFront = this.mountEl.querySelector(".realmWorld__fogFront");

      this.yoda.actor = this.mountEl.querySelector(".realmYoda");
      this.yoda.shadow = this.mountEl.querySelector(".realmYoda__shadow");
      this.yoda.bleed = this.mountEl.querySelector(".realmYoda__bleed");
      this.yoda.body = this.mountEl.querySelector(".realmYoda__body");
      this.yoda.collar = this.mountEl.querySelector(".realmYoda__collar");

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
      if (!this.rootEl) return;

      this._applyText(merged);
      this._applyArtwork(merged);
      this._applyWorld(merged);
      this._applyMetrics(merged);
      this._applyYodaAura(merged);
      this._startParticles(merged.particle, merged.flux);
    }
_applyText(state) {
      if (this.textEls.biomeChip) this.textEls.biomeChip.textContent = state.biome;
      if (this.textEls.moodLine) this.textEls.moodLine.textContent = `${state.mood} • ${state.motion}`;
      if (this.textEls.stateChip) this.textEls.stateChip.textContent = state.stateLabel;
      if (this.textEls.track) this.textEls.track.textContent = state.track;
      if (this.textEls.artist) this.textEls.artist.textContent = state.artist;
      if (this.textEls.album) {
        this.textEls.album.textContent = state.album ? state.album : "Aura-synced world";
      }
    }

    _applyArtwork(state) {
      const img = state.albumImage || "";
      if (this.layers.artBlur) {
        this.layers.artBlur.style.backgroundImage = img ? `url("${img}")` : "none";
        this.layers.artBlur.style.opacity = img ? String(0.28 + state.depth * 0.18) : "0";
      }
      if (this.layers.artSharp) {
        this.layers.artSharp.style.backgroundImage = img ? `url("${img}")` : "none";
        this.layers.artSharp.style.opacity = img ? String(0.08 + state.focus * 0.18) : "0";
      }
    }

    _applyWorld(state) {
      const heat = state.heat;
      const focus = state.focus;
      const depth = state.depth;
      const flux = state.flux;

      if (this.worldEl) {
        this.worldEl.style.background = state.sky;
      }

      if (this.layers.tint) {
        const hue = Math.round(212 - heat * 150);
        const sat = Math.round(60 + heat * 30);
        const light = Math.round(42 + focus * 10);
        this.layers.tint.style.background = `
          radial-gradient(900px 460px at 50% 35%, hsla(${hue}, ${sat}%, ${light}%, .18), transparent 70%),
          radial-gradient(700px 360px at 75% 68%, hsla(${hue}, ${sat}%, ${light + 8}%, .10), transparent 72%),
          linear-gradient(180deg, rgba(0,0,0,.02), rgba(0,0,0,.18))
        `;
      }

      if (this.layers.skyGlow) {
        this.layers.skyGlow.style.background = state.skyGlow;
        this.layers.skyGlow.style.opacity = String(0.36 + heat * 0.42);
        this.layers.skyGlow.style.filter = `blur(${22 + depth * 18}px)`;
      }

      if (this.layers.moon) {
        this.layers.moon.style.background = state.moon;
        this.layers.moon.style.opacity = String(0.55 + focus * 0.34);
      }

      if (this.layers.far) {
        this.layers.far.style.background = state.far;
        this.layers.far.style.opacity = String(0.72 + depth * 0.20);
        this.layers.far.style.transform = `translateX(${(flux - 0.5) * 6}px)`;
      }

      if (this.layers.mid) {
        this.layers.mid.style.background = state.mid;
        this.layers.mid.style.opacity = String(0.80 + focus * 0.14);
        this.layers.mid.style.transform = `translateX(${(flux - 0.5) * 10}px)`;
      }

      if (this.layers.ground) {
        this.layers.ground.style.background = state.ground;
      }

      if (this.layers.fogBack) {
        this.layers.fogBack.style.opacity = String(0.16 + depth * 0.22 + (1 - focus) * 0.12);
        this.layers.fogBack.style.transform = `translateX(${(flux - 0.5) * -12}px)`;
      }

      if (this.layers.fogFront) {
        this.layers.fogFront.style.opacity = String(0.10 + depth * 0.18 + (1 - focus) * 0.08);
        this.layers.fogFront.style.transform = `translateX(${(flux - 0.5) * 18}px)`;
      }
    }

    _applyMetrics(state) {
      this._setMetric("heat", state.heat);
      this._setMetric("focus", state.focus);
      this._setMetric("depth", state.depth);
      this._setMetric("flux", state.flux);
    }

    _setMetric(name, value) {
      const fill = this.metricFills[name];
      const num = this.metricValues[name];
      if (fill) fill.style.width = `${Math.round(clamp01(value) * 100)}%`;
      if (num) num.textContent = value.toFixed(2);
    }

    _applyYodaAura(state) {
      const heat = state.heat;
      const focus = state.focus;
      const depth = state.depth;
      const flux = state.flux;

      const hue = Math.round(205 - heat * 150);
      const sat = Math.round(70 + heat * 20);
      const light = Math.round(60 + focus * 10);

      if (this.yoda.collar) {
        this.yoda.collar.style.background = `radial-gradient(circle, hsla(${hue}, ${sat}%, ${light}%, .96) 0%, hsla(${hue}, ${sat}%, ${light}%, .56) 36%, transparent 72%)`;
        this.yoda.collar.style.filter = `blur(${5 + depth * 5}px)`;
        this.yoda.collar.style.opacity = String(0.55 + heat * 0.35);
      }

      if (this.yoda.bleed) {
        this.yoda.bleed.style.background = `radial-gradient(circle at 50% 50%, hsla(${hue}, ${sat}%, ${light}%, .28) 0%, hsla(${hue}, ${sat}%, ${light}%, .10) 44%, transparent 78%)`;
        this.yoda.bleed.style.opacity = String(0.28 + heat * 0.24);
        this.yoda.bleed.style.filter = `blur(${10 + depth * 10}px)`;
      }

      if (this.yoda.shadow) {
        this.yoda.shadow.style.opacity = String(0.20 + (1 - focus) * 0.18);
        this.yoda.shadow.style.transform = `translateX(-50%) scaleX(${1.05 + flux * 0.20})`;
      }
    }

    _stopParticles() {
      if (this.particleTimer) {
        clearInterval(this.particleTimer);
        this.particleTimer = null;
      }
      if (this.particlesEl) this.particlesEl.innerHTML = "";
    }

    _startParticles(color, flux) {
      this._stopParticles();
      if (!this.particlesEl) return;

      const every = Math.max(260, 1100 - flux * 760);

      for (let i = 0; i < 8; i += 1) {
        window.setTimeout(() => this._spawnParticle(color, 4600 + Math.random() * 2000), i * 120);
      }

      this.particleTimer = window.setInterval(() => {
        this._spawnParticle(color, 4600 + Math.random() * 2000);
      }, every);
    }

    _spawnParticle(color, duration) {
      if (!this.particlesEl) return;

      const el = document.createElement("span");
      el.className = "realmWorld__particle";

      const left = 4 + Math.random() * 92;
      const top = 10 + Math.random() * 72;
      const size = 2 + Math.random() * 3.2;

      el.style.left = `${left}%`;
      el.style.top = `${top}%`;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.background = color;
      el.style.boxShadow = `0 0 12px ${color}`;
      el.style.animationDuration = `${duration}ms`;

      this.particlesEl.appendChild(el);
      window.setTimeout(() => el.remove(), duration + 1200);
    }
_startWalker() {
      this._stopWalker();

      const tick = (now) => {
        if (!this.yoda.actor || !this.yoda.body || !this.yoda.collar) return;

        const t = (now - this.walkStart) / 1000;
        const flux = this.currentState?.flux ?? 0.5;
        const isPaused = String(this.currentState?.stateLabel || "").toLowerCase() === "paused";

        const pathSpeed = isPaused ? 0.0045 : 0.008 + flux * 0.008;
        const cycle = (t * pathSpeed) % 2;
        const forward = cycle < 1;
        const p = forward ? cycle : (2 - cycle); // 0..1..0

        const x = 12 + p * 76;

        const yTerrain =
          Math.sin((x / 100) * Math.PI * 2.0) * 8 +
          Math.sin((x / 100) * Math.PI * 5.1) * 3.4 +
          Math.cos((x / 100) * Math.PI * 1.35) * 2.2;

        const walkTempo = isPaused ? 1.8 : 5.8 + flux * 2.8;
        const step = Math.sin(t * walkTempo);
        const bob = isPaused ? Math.sin(t * 1.8) * 1.0 : step * (1.2 + flux * 1.0);

        this.yoda.actor.style.left = `${x}%`;
        this.yoda.actor.style.bottom = `${18 + yTerrain + bob}px`;
        this.yoda.actor.style.transform = `translateX(-50%) scaleX(${forward ? 1 : -1})`;

        const tilt = isPaused ? Math.sin(t * 1.6) * 0.8 : step * 1.4;
        this.yoda.body.style.transform = `translateY(${step * 0.8}px) rotate(${tilt}deg)`;

        const pulse = isPaused
          ? (0.96 + Math.sin(t * 1.8) * 0.04)
          : (0.96 + Math.sin(t * (2.6 + flux * 7.2)) * (0.06 + flux * 0.08));

        this.yoda.collar.style.transform = `translate(-50%, -50%) scale(${pulse})`;

        this._walkerRaf = requestAnimationFrame(tick);
      };

      this._walkerRaf = requestAnimationFrame(tick);
    }

    _stopWalker() {
      if (this._walkerRaf) {
        cancelAnimationFrame(this._walkerRaf);
        this._walkerRaf = 0;
      }
    }

    _template() {
      return `
        <div class="realmHeroView">
          <style>
            .realmHeroView{ display:grid; gap:14px; }
            .realmHero{
              border-radius:26px;
              overflow:hidden;
              outline:1px solid rgba(255,255,255,.08);
              background:rgba(255,255,255,.03);
              box-shadow:
                inset 0 1px 0 rgba(255,255,255,.04),
                0 18px 40px rgba(0,0,0,.18);
            }
            .realmHero__top{
              padding:12px 14px 0;
              display:flex;
              align-items:center;
              justify-content:space-between;
              gap:10px;
              position:relative;
              z-index:3;
            }
            .realmWorld{
              position:relative;
              width:100%;
              aspect-ratio:16/9.6;
              overflow:hidden;
              border-radius:0 0 26px 26px;
              isolation:isolate;
            }

            .realmWorld__artBlur,
            .realmWorld__artSharp,
            .realmWorld__tint,
            .realmWorld__skyGlow,
            .realmWorld__moon,
            .realmWorld__far,
            .realmWorld__mid,
            .realmWorld__ground,
            .realmWorld__fogBack,
            .realmWorld__fogFront,
            .realmWorld__particles{
              position:absolute;
              inset:0;
              pointer-events:none;
            }

            .realmWorld__artBlur{
              background-position:center;
              background-size:cover;
              filter:blur(36px) saturate(1.12) brightness(.62);
              transform:scale(1.16);
              z-index:1;
            }
            .realmWorld__artSharp{
              background-position:center;
              background-size:cover;
              filter:blur(2px) saturate(1.04) brightness(.56);
              transform:scale(1.04);
              z-index:2;
              mix-blend-mode:soft-light;
            }
            .realmWorld__tint{ z-index:3; }
            .realmWorld__skyGlow{
              width:64%;
              height:62%;
              left:18%;
              top:4%;
              border-radius:50%;
              mix-blend-mode:screen;
              z-index:4;
              animation: realmSkyBreath 18s ease-in-out infinite alternate;
            }
            .realmWorld__moon{
              width:11%;
              aspect-ratio:1;
              right:12%;
              top:15%;
              border-radius:50%;
              box-shadow:0 0 28px rgba(255,255,255,.22);
              z-index:6;
            }
            .realmWorld__far{
              left:-3%;
              right:-3%;
              top:43%;
              bottom:23%;
              clip-path:polygon(0% 100%, 0% 66%, 10% 60%, 18% 70%, 30% 48%, 44% 68%, 56% 54%, 68% 72%, 82% 46%, 100% 62%, 100% 100%);
              z-index:7;
              animation: realmFarPan 38s ease-in-out infinite alternate;
            }
            .realmWorld__mid{
              left:-4%;
              right:-4%;
              top:56%;
              bottom:14%;
              clip-path:polygon(0% 100%, 0% 72%, 9% 63%, 18% 72%, 28% 56%, 40% 76%, 51% 51%, 61% 68%, 72% 55%, 82% 73%, 92% 61%, 100% 70%, 100% 100%);
              z-index:8;
              animation: realmMidPan 28s ease-in-out infinite alternate;
            }
            .realmWorld__ground{
              left:-3%;
              right:-3%;
              bottom:-1%;
              height:24%;
              clip-path:polygon(0% 100%, 0% 45%, 9% 50%, 18% 42%, 29% 52%, 39% 40%, 51% 50%, 60% 38%, 70% 49%, 80% 41%, 90% 53%, 100% 44%, 100% 100%);
              z-index:9;
              animation: realmGroundPan 18s ease-in-out infinite alternate;
            }
            .realmWorld__fogBack{
              background:
                radial-gradient(600px 160px at 35% 82%, rgba(225,235,255,.11), transparent 72%),
                radial-gradient(520px 150px at 70% 78%, rgba(225,235,255,.08), transparent 72%);
              mix-blend-mode:screen;
              z-index:10;
              animation: realmFogBackPan 20s ease-in-out infinite alternate;
            }
            .realmWorld__fogFront{
              background:
                radial-gradient(520px 140px at 48% 86%, rgba(225,235,255,.08), transparent 68%);
              mix-blend-mode:screen;
              z-index:13;
              animation: realmFogFrontPan 14s ease-in-out infinite alternate;
            }

            .realmWorld__particles{ z-index:12; }
            .realmWorld__particle{
              position:absolute;
              border-radius:50%;
              opacity:.72;
              animation: realmParticleFloat linear forwards;
            }

            .realmYoda{
              position:absolute;
              z-index:11;
              width:38px;
              height:30px;
              pointer-events:none;
              will-change:left,bottom,transform;
            }
            .realmYoda__shadow{
              position:absolute;
              left:50%;
              bottom:-3px;
              width:28px;
              height:7px;
              transform:translateX(-50%);
              border-radius:50%;
              background:rgba(0,0,0,.44);
              filter:blur(2px);
            }
            .realmYoda__bleed{
              position:absolute;
              left:50%;
              bottom:-4px;
              width:44px;
              height:16px;
              transform:translateX(-50%);
              border-radius:50%;
              opacity:.32;
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
              background:#090a0d;
              clip-path:polygon(7% 66%, 10% 42%, 20% 26%, 27% 6%, 37% 26%, 54% 14%, 63% 5%, 70% 22%, 84% 35%, 94% 56%, 87% 74%, 78% 76%, 73% 95%, 61% 95%, 59% 77%, 42% 77%, 38% 95%, 25% 95%, 22% 76%, 12% 74%);
              filter:drop-shadow(0 1px 0 rgba(255,255,255,.02));
            }
            .realmYoda__collar{
              position:absolute;
              left:57%;
              top:49%;
              width:16px;
              height:16px;
              transform:translate(-50%, -50%);
              border-radius:50%;
              mix-blend-mode:screen;
              opacity:.9;
            }

            .realmMeta{
              display:grid;
              gap:12px;
            }
            .realmAlbum{
              font-size:12px;
              line-height:1.35;
              color:rgba(255,255,255,.52);
              margin:2px 0 0;
            }

            @keyframes realmSkyBreath{
              from{ transform:translateX(-8px) scale(.98); }
              to{ transform:translateX(10px) scale(1.03); }
            }
            @keyframes realmFarPan{
              from{ transform:translateX(-1.2%); }
              to{ transform:translateX(1.4%); }
            }
            @keyframes realmMidPan{
              from{ transform:translateX(-2.4%); }
              to{ transform:translateX(2.8%); }
            }
            @keyframes realmGroundPan{
              from{ transform:translateX(-1.6%); }
              to{ transform:translateX(1.6%); }
            }
            @keyframes realmFogBackPan{
              from{ transform:translateX(-3%) translateY(0); }
              to{ transform:translateX(4%) translateY(-1%); }
            }
            @keyframes realmFogFrontPan{
              from{ transform:translateX(2%) translateY(0); }
              to{ transform:translateX(-3%) translateY(-1%); }
            }
            @keyframes realmParticleFloat{
              0%{ transform:translateY(0) scale(.7); opacity:0; }
              12%{ opacity:.82; }
              100%{ transform:translateY(-40px) scale(1.12); opacity:0; }
            }

            @media (max-width:420px){
              .realmYoda{ width:34px; height:27px; }
            }
          </style>

          <section class="realmHero">
            <div class="realmHero__top">
              <div class="realm-badge">
                <span class="realm-badge__dot" aria-hidden="true"></span>
                <span class="realm-badge__text" data-realm-text="moodLine">Melancholic • Drift</span>
              </div>
              <div class="realm-chip" data-realm-text="biome">Moonlit Ruins</div>
            </div>

            <div class="realmWorld">
              <div class="realmWorld__artBlur"></div>
              <div class="realmWorld__artSharp"></div>
              <div class="realmWorld__tint"></div>
              <div class="realmWorld__skyGlow"></div>
              <div class="realmWorld__moon"></div>
              <div class="realmWorld__far"></div>
              <div class="realmWorld__mid"></div>
              <div class="realmWorld__ground"></div>
              <div class="realmWorld__fogBack"></div>

              <div class="realmYoda">
                <div class="realmYoda__bleed"></div>
                <div class="realmYoda__shadow"></div>
                <div class="realmYoda__body"></div>
                <div class="realmYoda__collar"></div>
              </div>

              <div class="realmWorld__particles"></div>
              <div class="realmWorld__fogFront"></div>
            </div>
          </section>

          <section class="realm-card">
            <div class="realmMeta">
              <div>
                <p class="realm-track" data-realm-text="track">The Listening Realm</p>
                <p class="realm-artist" data-realm-text="artist">Prototype Track • Realm Portal v1</p>
                <p class="realmAlbum" data-realm-text="album">Aura-synced world</p>
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
            </div>
          </section>
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