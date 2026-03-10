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
        artTexture: null,
        tint: null,
        vignette: null,
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
      this.walkStart = performance.now();
      this._walkerRaf = 0;
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
      this.layers.artTexture = this.mountEl.querySelector(".realmWorld__artTexture");
      this.layers.tint = this.mountEl.querySelector(".realmWorld__tint");
      this.layers.vignette = this.mountEl.querySelector(".realmWorld__vignette");
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
        this.textEls.album.textContent = state.album || "Aura-synced world";
      }
    }

    _applyArtwork(state) {
      const img = state.albumImage || "";
      const hasArt = !!img;

      if (this.layers.artBlur) {
        this.layers.artBlur.style.backgroundImage = hasArt ? `url("${img}")` : "none";
        this.layers.artBlur.style.opacity = hasArt ? String(0.14 + state.depth * 0.10) : "0";
      }

      if (this.layers.artTexture) {
        this.layers.artTexture.style.backgroundImage = hasArt ? `url("${img}")` : "none";
        this.layers.artTexture.style.opacity = hasArt ? String(0.04 + state.focus * 0.08) : "0";
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

      const hue = Math.round(210 - heat * 145);
      const sat = Math.round(52 + heat * 28);
      const light = Math.round(26 + focus * 8);

      if (this.layers.tint) {
        this.layers.tint.style.background = `
          radial-gradient(900px 420px at 52% 32%, hsla(${hue}, ${sat}%, ${light + 10}%, .15), transparent 68%),
          radial-gradient(700px 300px at 78% 70%, hsla(${hue}, ${sat}%, ${light + 4}%, .08), transparent 70%),
          linear-gradient(180deg, rgba(0,0,0,.02), rgba(0,0,0,.16))
        `;
      }

      if (this.layers.vignette) {
        this.layers.vignette.style.opacity = String(0.70 + depth * 0.12);
      }

      if (this.layers.skyGlow) {
        this.layers.skyGlow.style.background = state.skyGlow;
        this.layers.skyGlow.style.opacity = String(0.28 + heat * 0.30);
        this.layers.skyGlow.style.filter = `blur(${20 + depth * 18}px)`;
      }

      if (this.layers.moon) {
        this.layers.moon.style.background = state.moon;
        this.layers.moon.style.opacity = String(0.46 + focus * 0.26);
      }

      if (this.layers.far) {
        this.layers.far.style.background = state.far;
        this.layers.far.style.opacity = String(0.84 + depth * 0.10);
        this.layers.far.style.transform = `translateX(${(flux - 0.5) * 5}px)`;
      }

      if (this.layers.mid) {
        this.layers.mid.style.background = state.mid;
        this.layers.mid.style.opacity = String(0.88 + focus * 0.08);
        this.layers.mid.style.transform = `translateX(${(flux - 0.5) * 8}px)`;
      }

      if (this.layers.ground) {
        this.layers.ground.style.background = state.ground;
      }

      if (this.layers.fogBack) {
        this.layers.fogBack.style.opacity = String(0.10 + depth * 0.18 + (1 - focus) * 0.08);
        this.layers.fogBack.style.transform = `translateX(${(flux - 0.5) * -10}px)`;
      }

      if (this.layers.fogFront) {
        this.layers.fogFront.style.opacity = String(0.06 + depth * 0.14 + (1 - focus) * 0.06);
        this.layers.fogFront.style.transform = `translateX(${(flux - 0.5) * 14}px)`;
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
      const sat = Math.round(72 + heat * 18);
      const light = Math.round(62 + focus * 10);

      if (this.yoda.collar) {
        this.yoda.collar.style.background = `radial-gradient(circle, hsla(${hue}, ${sat}%, ${light}%, .96) 0%, hsla(${hue}, ${sat}%, ${light}%, .54) 36%, transparent 72%)`;
        this.yoda.collar.style.filter = `blur(${5 + depth * 4}px)`;
        this.yoda.collar.style.opacity = String(0.58 + heat * 0.30);
      }

      if (this.yoda.bleed) {
        this.yoda.bleed.style.background = `radial-gradient(circle at 50% 50%, hsla(${hue}, ${sat}%, ${light}%, .22) 0%, hsla(${hue}, ${sat}%, ${light}%, .08) 42%, transparent 76%)`;
        this.yoda.bleed.style.opacity = String(0.22 + heat * 0.18);
        this.yoda.bleed.style.filter = `blur(${8 + depth * 8}px)`;
      }

      if (this.yoda.shadow) {
        this.yoda.shadow.style.opacity = String(0.24 + (1 - focus) * 0.12);
        this.yoda.shadow.style.transform = `translateX(-50%) scaleX(${1.08 + flux * 0.16})`;
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

      const every = Math.max(280, 1180 - flux * 760);

      for (let i = 0; i < 6; i += 1) {
        window.setTimeout(() => this._spawnParticle(color, 4200 + Math.random() * 1800), i * 150);
      }

      this.particleTimer = window.setInterval(() => {
        this._spawnParticle(color, 4200 + Math.random() * 1800);
      }, every);
    }

    _spawnParticle(color, duration) {
      if (!this.particlesEl) return;

      const el = document.createElement("span");
      el.className = "realmWorld__particle";

      const left = 5 + Math.random() * 90;
      const top = 12 + Math.random() * 68;
      const size = 2 + Math.random() * 2.8;

      el.style.left = `${left}%`;
      el.style.top = `${top}%`;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.background = color;
      el.style.boxShadow = `0 0 10px ${color}`;
      el.style.animationDuration = `${duration}ms`;

      this.particlesEl.appendChild(el);
      window.setTimeout(() => el.remove(), duration + 1000);
    }
_startWalker() {
      this._stopWalker();

      const tick = (now) => {
        if (!this.yoda.actor || !this.yoda.body || !this.yoda.collar) return;

        const t = (now - this.walkStart) / 1000;
        const flux = this.currentState?.flux ?? 0.5;
        const isPaused = String(this.currentState?.stateLabel || "").toLowerCase() === "paused";

        const pathSpeed = isPaused ? 0.0045 : 0.007 + flux * 0.006;
        const cycle = (t * pathSpeed) % 2;
        const forward = cycle < 1;
        const p = forward ? cycle : (2 - cycle);

        const x = 13 + p * 74;

        const yTerrain =
          Math.sin((x / 100) * Math.PI * 2.0) * 7 +
          Math.sin((x / 100) * Math.PI * 4.9) * 2.8 +
          Math.cos((x / 100) * Math.PI * 1.2) * 1.8;

        const walkTempo = isPaused ? 1.8 : 5.2 + flux * 2.4;
        const step = Math.sin(t * walkTempo);
        const bob = isPaused ? Math.sin(t * 1.7) * 0.8 : step * (1.0 + flux * 0.8);

        this.yoda.actor.style.left = `${x}%`;
        this.yoda.actor.style.bottom = `${16 + yTerrain + bob}px`;
        this.yoda.actor.style.transform = `translateX(-50%) scaleX(${forward ? 1 : -1})`;

        const tilt = isPaused ? Math.sin(t * 1.5) * 0.5 : step * 1.1;
        this.yoda.body.style.transform = `translateY(${step * 0.7}px) rotate(${tilt}deg)`;

        const pulse = isPaused
          ? (0.96 + Math.sin(t * 1.7) * 0.04)
          : (0.96 + Math.sin(t * (2.4 + flux * 6.8)) * (0.05 + flux * 0.06));

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
              outline:1px solid rgba(255,255,255,.07);
              background:rgba(255,255,255,.02);
              box-shadow:
                inset 0 1px 0 rgba(255,255,255,.03),
                0 18px 40px rgba(0,0,0,.16);
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
              aspect-ratio:16/9.8;
              overflow:hidden;
              border-radius:0 0 26px 26px;
              isolation:isolate;
            }

            .realmWorld__artBlur,
            .realmWorld__artTexture,
            .realmWorld__tint,
            .realmWorld__vignette,
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
              filter:blur(42px) saturate(0.88) brightness(.42);
              transform:scale(1.18);
              z-index:1;
            }

            .realmWorld__artTexture{
              background-position:center;
              background-size:cover;
              filter:blur(5px) grayscale(.18) saturate(.72) brightness(.34);
              transform:scale(1.07);
              mix-blend-mode:soft-light;
              z-index:2;
            }

            .realmWorld__tint{ z-index:3; }

            .realmWorld__vignette{
              background:
                radial-gradient(90% 72% at 50% 40%, transparent 32%, rgba(0,0,0,.12) 64%, rgba(0,0,0,.34) 100%),
                linear-gradient(180deg, rgba(0,0,0,.05), transparent 22%, transparent 70%, rgba(0,0,0,.18));
              z-index:4;
            }

            .realmWorld__skyGlow{
              width:64%;
              height:62%;
              left:18%;
              top:5%;
              border-radius:50%;
              mix-blend-mode:screen;
              z-index:5;
              animation: realmSkyBreath 18s ease-in-out infinite alternate;
            }

            .realmWorld__moon{
              width:10%;
              aspect-ratio:1;
              right:12%;
              top:15%;
              border-radius:50%;
              box-shadow:0 0 22px rgba(255,255,255,.18);
              z-index:7;
            }

            .realmWorld__far{
              left:-3%;
              right:-3%;
              top:45%;
              bottom:24%;
              clip-path:polygon(0% 100%, 0% 68%, 11% 61%, 20% 70%, 31% 50%, 44% 69%, 56% 56%, 67% 72%, 82% 47%, 100% 63%, 100% 100%);
              z-index:8;
              animation: realmFarPan 38s ease-in-out infinite alternate;
            }

            .realmWorld__mid{
              left:-4%;
              right:-4%;
              top:58%;
              bottom:14%;
              clip-path:polygon(0% 100%, 0% 74%, 9% 66%, 18% 74%, 29% 59%, 40% 78%, 51% 54%, 61% 69%, 72% 57%, 83% 75%, 93% 63%, 100% 71%, 100% 100%);
              z-index:9;
              animation: realmMidPan 28s ease-in-out infinite alternate;
            }

            .realmWorld__ground{
              left:-3%;
              right:-3%;
              bottom:-1%;
              height:22%;
              clip-path:polygon(0% 100%, 0% 46%, 9% 51%, 18% 43%, 30% 53%, 40% 41%, 52% 51%, 61% 39%, 71% 50%, 81% 42%, 91% 54%, 100% 45%, 100% 100%);
              z-index:10;
              animation: realmGroundPan 18s ease-in-out infinite alternate;
            }

            .realmWorld__fogBack{
              background:
                radial-gradient(620px 150px at 34% 82%, rgba(230,236,250,.08), transparent 72%),
                radial-gradient(520px 140px at 72% 78%, rgba(230,236,250,.06), transparent 70%);
              mix-blend-mode:screen;
              z-index:11;
              animation: realmFogBackPan 20s ease-in-out infinite alternate;
            }

            .realmWorld__fogFront{
              background:
                radial-gradient(520px 130px at 48% 86%, rgba(230,236,250,.06), transparent 68%);
              mix-blend-mode:screen;
              z-index:14;
              animation: realmFogFrontPan 14s ease-in-out infinite alternate;
            }

            .realmWorld__particles{ z-index:13; }

            .realmWorld__particle{
              position:absolute;
              border-radius:50%;
              opacity:.68;
              animation: realmParticleFloat linear forwards;
            }

            .realmYoda{
              position:absolute;
              z-index:12;
              width:40px;
              height:31px;
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
              background:rgba(0,0,0,.42);
              filter:blur(2px);
            }

            .realmYoda__bleed{
              position:absolute;
              left:50%;
              bottom:-4px;
              width:40px;
              height:14px;
              transform:translateX(-50%);
              border-radius:50%;
              opacity:.26;
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
              clip-path:polygon(8% 67%, 11% 44%, 21% 28%, 28% 7%, 38% 27%, 54% 16%, 63% 7%, 70% 22%, 84% 36%, 94% 57%, 87% 74%, 79% 77%, 73% 95%, 61% 95%, 59% 77%, 42% 77%, 38% 95%, 25% 95%, 22% 77%, 12% 74%);
              filter:drop-shadow(0 1px 0 rgba(255,255,255,.015));
            }

            .realmYoda__collar{
              position:absolute;
              left:57%;
              top:49%;
              width:15px;
              height:15px;
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
              color:rgba(255,255,255,.50);
              margin:2px 0 0;
            }

            @keyframes realmSkyBreath{
              from{ transform:translateX(-8px) scale(.985); }
              to{ transform:translateX(10px) scale(1.02); }
            }
            @keyframes realmFarPan{
              from{ transform:translateX(-1.0%); }
              to{ transform:translateX(1.2%); }
            }
            @keyframes realmMidPan{
              from{ transform:translateX(-2.0%); }
              to{ transform:translateX(2.3%); }
            }
            @keyframes realmGroundPan{
              from{ transform:translateX(-1.2%); }
              to{ transform:translateX(1.2%); }
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
              14%{ opacity:.78; }
              100%{ transform:translateY(-36px) scale(1.08); opacity:0; }
            }

            @media (max-width:420px){
              .realmYoda{ width:36px; height:28px; }
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
              <div class="realmWorld__artTexture"></div>
              <div class="realmWorld__tint"></div>
              <div class="realmWorld__vignette"></div>
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