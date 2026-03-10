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
        artMain: null,
        tint: null,
        vignette: null,
        skyGlow: null,
        moon: null,
        groundLine: null,
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
      this.layers.artMain = this.mountEl.querySelector(".realmWorld__artMain");
      this.layers.tint = this.mountEl.querySelector(".realmWorld__tint");
      this.layers.vignette = this.mountEl.querySelector(".realmWorld__vignette");
      this.layers.skyGlow = this.mountEl.querySelector(".realmWorld__skyGlow");
      this.layers.moon = this.mountEl.querySelector(".realmWorld__moon");
      this.layers.groundLine = this.mountEl.querySelector(".realmWorld__groundLine");
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
      if (this.textEls.album) this.textEls.album.textContent = state.album || "Aura-synced artwork world";
    }

    _applyArtwork(state) {
      const img = state.albumImage || "";
      const hasArt = !!img;

      if (this.layers.artBlur) {
        this.layers.artBlur.style.backgroundImage = hasArt ? `url("${img}")` : "none";
        this.layers.artBlur.style.opacity = hasArt ? String(0.32 + state.depth * 0.12) : "0";
      }

      if (this.layers.artMain) {
        this.layers.artMain.style.backgroundImage = hasArt ? `url("${img}")` : "none";
        this.layers.artMain.style.opacity = hasArt ? String(0.34 + state.focus * 0.18) : "0";
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

      const hue = Math.round(210 - heat * 150);
      const sat = Math.round(56 + heat * 28);
      const light = Math.round(24 + focus * 8);

      if (this.layers.tint) {
        this.layers.tint.style.background = `
          linear-gradient(180deg, hsla(${hue}, ${sat}%, ${light + 4}%, .20), hsla(${hue}, ${sat}%, ${light - 2}%, .28)),
          radial-gradient(820px 360px at 50% 22%, hsla(${hue}, ${sat}%, ${light + 10}%, .14), transparent 66%)
        `;
      }

      if (this.layers.vignette) {
        this.layers.vignette.style.opacity = String(0.78 + depth * 0.10);
      }

      if (this.layers.skyGlow) {
        this.layers.skyGlow.style.background = state.skyGlow;
        this.layers.skyGlow.style.opacity = String(0.22 + heat * 0.24);
        this.layers.skyGlow.style.filter = `blur(${18 + depth * 16}px)`;
      }

      if (this.layers.moon) {
        this.layers.moon.style.background = state.moon;
        this.layers.moon.style.opacity = String(0.42 + focus * 0.24);
      }

      if (this.layers.groundLine) {
        this.layers.groundLine.style.opacity = String(0.22 + (1 - focus) * 0.10);
        this.layers.groundLine.style.transform = `translateX(${(flux - 0.5) * 4}px)`;
      }

      if (this.layers.fogBack) {
        this.layers.fogBack.style.opacity = String(0.10 + depth * 0.16 + (1 - focus) * 0.06);
        this.layers.fogBack.style.transform = `translateX(${(flux - 0.5) * -10}px)`;
      }

      if (this.layers.fogFront) {
        this.layers.fogFront.style.opacity = String(0.06 + depth * 0.12 + (1 - focus) * 0.04);
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
        this.yoda.collar.style.opacity = String(0.58 + heat * 0.28);
      }

      if (this.yoda.bleed) {
        this.yoda.bleed.style.background = `radial-gradient(circle at 50% 50%, hsla(${hue}, ${sat}%, ${light}%, .18) 0%, hsla(${hue}, ${sat}%, ${light}%, .06) 42%, transparent 76%)`;
        this.yoda.bleed.style.opacity = String(0.18 + heat * 0.14);
        this.yoda.bleed.style.filter = `blur(${8 + depth * 8}px)`;
      }

      if (this.yoda.shadow) {
        this.yoda.shadow.style.opacity = String(0.22 + (1 - focus) * 0.10);
        this.yoda.shadow.style.transform = `translateX(-50%) scaleX(${1.06 + flux * 0.14})`;
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

      const every = Math.max(320, 1300 - flux * 720);

      for (let i = 0; i < 5; i += 1) {
        window.setTimeout(() => this._spawnParticle(color, 3600 + Math.random() * 1600), i * 180);
      }

      this.particleTimer = window.setInterval(() => {
        this._spawnParticle(color, 3600 + Math.random() * 1600);
      }, every);
    }

    _spawnParticle(color, duration) {
      if (!this.particlesEl) return;

      const el = document.createElement("span");
      el.className = "realmWorld__particle";

      const left = 6 + Math.random() * 88;
      const top = 12 + Math.random() * 68;
      const size = 2 + Math.random() * 2.4;

      el.style.left = `${left}%`;
      el.style.top = `${top}%`;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.background = color;
      el.style.boxShadow = `0 0 10px ${color}`;
      el.style.animationDuration = `${duration}ms`;

      this.particlesEl.appendChild(el);
      window.setTimeout(() => el.remove(), duration + 800);
    }
_startWalker() {
      this._stopWalker();

      const tick = (now) => {
        if (!this.yoda.actor || !this.yoda.body || !this.yoda.collar) return;

        const t = (now - this.walkStart) / 1000;
        const flux = this.currentState?.flux ?? 0.5;
        const isPaused = String(this.currentState?.stateLabel || "").toLowerCase() === "paused";

        const pathSpeed = isPaused ? 0.0042 : 0.006 + flux * 0.0055;
        const cycle = (t * pathSpeed) % 2;
        const forward = cycle < 1;
        const p = forward ? cycle : (2 - cycle);

        const x = 14 + p * 72;

        const yTerrain =
          Math.sin((x / 100) * Math.PI * 1.8) * 4.8 +
          Math.sin((x / 100) * Math.PI * 4.4) * 1.8;

        const walkTempo = isPaused ? 1.7 : 4.8 + flux * 2.0;
        const step = Math.sin(t * walkTempo);
        const bob = isPaused ? Math.sin(t * 1.6) * 0.6 : step * (0.8 + flux * 0.6);

        this.yoda.actor.style.left = `${x}%`;
        this.yoda.actor.style.bottom = `${14 + yTerrain + bob}px`;
        this.yoda.actor.style.transform = `translateX(-50%) scaleX(${forward ? 1 : -1})`;

        const tilt = isPaused ? Math.sin(t * 1.4) * 0.4 : step * 0.9;
        this.yoda.body.style.transform = `translateY(${step * 0.55}px) rotate(${tilt}deg)`;

        const pulse = isPaused
          ? (0.96 + Math.sin(t * 1.7) * 0.03)
          : (0.96 + Math.sin(t * (2.2 + flux * 5.8)) * (0.04 + flux * 0.05));

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
            .realmWorld__artMain,
            .realmWorld__tint,
            .realmWorld__vignette,
            .realmWorld__skyGlow,
            .realmWorld__moon,
            .realmWorld__groundLine,
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
              filter:blur(30px) saturate(.92) brightness(.46);
              transform:scale(1.12);
              z-index:1;
            }

            .realmWorld__artMain{
              background-position:center;
              background-size:cover;
              filter:saturate(.92) brightness(.56) contrast(.94);
              transform:scale(1.01);
              z-index:2;
            }

            .realmWorld__tint{ z-index:3; }

            .realmWorld__vignette{
              background:
                radial-gradient(90% 72% at 50% 40%, transparent 36%, rgba(0,0,0,.10) 64%, rgba(0,0,0,.28) 100%),
                linear-gradient(180deg, rgba(0,0,0,.04), transparent 22%, transparent 72%, rgba(0,0,0,.16));
              z-index:4;
            }

            .realmWorld__skyGlow{
              width:62%;
              height:60%;
              left:19%;
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
              box-shadow:0 0 18px rgba(255,255,255,.16);
              z-index:6;
            }

            .realmWorld__groundLine{
              left:7%;
              right:7%;
              bottom:24px;
              height:1px;
              background:linear-gradient(90deg, transparent, rgba(255,255,255,.18), rgba(255,255,255,.12), transparent);
              z-index:8;
            }

            .realmWorld__fogBack{
              background:
                radial-gradient(620px 150px at 34% 82%, rgba(230,236,250,.08), transparent 72%),
                radial-gradient(520px 140px at 72% 78%, rgba(230,236,250,.05), transparent 70%);
              mix-blend-mode:screen;
              z-index:7;
              animation: realmFogBackPan 20s ease-in-out infinite alternate;
            }

            .realmWorld__fogFront{
              background:
                radial-gradient(520px 130px at 48% 86%, rgba(230,236,250,.05), transparent 68%);
              mix-blend-mode:screen;
              z-index:11;
              animation: realmFogFrontPan 14s ease-in-out infinite alternate;
            }

            .realmWorld__particles{ z-index:10; }

            .realmWorld__particle{
              position:absolute;
              border-radius:50%;
              opacity:.66;
              animation: realmParticleFloat linear forwards;
            }

            .realmYoda{
              position:absolute;
              z-index:9;
              width:40px;
              height:31px;
              pointer-events:none;
              will-change:left,bottom,transform;
            }

            .realmYoda__shadow{
              position:absolute;
              left:50%;
              bottom:-2px;
              width:26px;
              height:6px;
              transform:translateX(-50%);
              border-radius:50%;
              background:rgba(0,0,0,.40);
              filter:blur(2px);
            }

            .realmYoda__bleed{
              position:absolute;
              left:50%;
              bottom:-3px;
              width:34px;
              height:12px;
              transform:translateX(-50%);
              border-radius:50%;
              opacity:.22;
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
            }

            .realmYoda__collar{
              position:absolute;
              left:57%;
              top:49%;
              width:14px;
              height:14px;
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
            @keyframes realmFogBackPan{
              from{ transform:translateX(-3%) translateY(0); }
              to{ transform:translateX(4%) translateY(-1%); }
            }
            @keyframes realmFogFrontPan{
              from{ transform:translateX(2%) translateY(0); }
              to{ transform:translateX(-3%) translateY(-1%); }
            }
            @keyframes realmParticleFloat{
              0%{ transform:translateY(0) scale(.75); opacity:0; }
              14%{ opacity:.74; }
              100%{ transform:translateY(-30px) scale(1.06); opacity:0; }
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
              <div class="realmWorld__artMain"></div>
              <div class="realmWorld__tint"></div>
              <div class="realmWorld__vignette"></div>
              <div class="realmWorld__skyGlow"></div>
              <div class="realmWorld__moon"></div>
              <div class="realmWorld__fogBack"></div>
              <div class="realmWorld__groundLine"></div>

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
                <p class="realmAlbum" data-realm-text="album">Aura-synced artwork world</p>
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