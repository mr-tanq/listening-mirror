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
    sky: "linear-gradient(180deg, #09111E 0%, #101827 48%, #13151A 100%)",
    skyGlow: "radial-gradient(circle, rgba(122,215,255,.28), rgba(122,215,255,.06) 45%, transparent 70%)",
    moon: "radial-gradient(circle at 35% 35%, rgba(255,255,255,.95), rgba(214,227,255,.72) 55%, rgba(159,187,228,.18) 75%, transparent 100%)",
    particle: "rgba(210,233,255,.82)",
    progress: 0,
    yoda: {
      x: 0.18,
      direction: 1,
      state: "walk",
      sprite: "./assets/yoda_walk_1.png",
      bob: 0
    }
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
        img: null,
        shadow: null,
        bleed: null,
        collar: null
      };

      this.currentState = structuredClone(DEFAULT_STATE);
      this.isMounted = false;
      this.particleTimer = null;
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
      this.yoda.img = this.mountEl.querySelector(".realmYoda__img");
      this.yoda.shadow = this.mountEl.querySelector(".realmYoda__shadow");
      this.yoda.bleed = this.mountEl.querySelector(".realmYoda__bleed");
      this.yoda.collar = this.mountEl.querySelector(".realmYoda__collar");

      this.applyState(this.currentState);
      this.isMounted = true;
    }

    unmount() {
      this._stopParticles();
      if (this.mountEl) this.mountEl.innerHTML = "";
      this.isMounted = false;
    }

    applyState(nextState = {}) {
      this.currentState = {
        ...this.currentState,
        ...nextState,
        yoda: {
          ...this.currentState.yoda,
          ...(nextState.yoda || {})
        }
      };

      if (!this.rootEl) return;

      this._applyText(this.currentState);
      this._applyArtwork(this.currentState);
      this._applyWorld(this.currentState);
      this._applyMetrics(this.currentState);
      this._applyYoda(this.currentState);
      this._applyYodaAura(this.currentState);
      this._startParticles(this.currentState.particle, this.currentState.flux);
    }
    _applyText(state) {
      if (this.textEls.biomeChip) this.textEls.biomeChip.textContent = state.biome || "Realm";
      if (this.textEls.moodLine) this.textEls.moodLine.textContent = `${state.mood || "Calm"} • ${state.motion || "Drift"}`;
      if (this.textEls.stateChip) this.textEls.stateChip.textContent = state.stateLabel || "Now Playing";
      if (this.textEls.track) this.textEls.track.textContent = state.track || "Unknown Track";
      if (this.textEls.artist) this.textEls.artist.textContent = state.artist || "Unknown Artist";
      if (this.textEls.album) this.textEls.album.textContent = state.album || "Album portal";
    }

    _applyArtwork(state) {
      const img = state.albumImage || "";
      const hasArt = !!img;

      if (this.layers.artBlur) {
        this.layers.artBlur.style.backgroundImage = hasArt ? `url("${img}")` : "none";
        this.layers.artBlur.style.opacity = hasArt ? String(0.14 + state.depth * 0.06) : "0";
      }

      if (this.layers.artMain) {
        this.layers.artMain.style.backgroundImage = hasArt ? `url("${img}")` : "none";
        this.layers.artMain.style.opacity = hasArt ? String(0.78 + state.focus * 0.14) : "0";
      }
    }

    _applyWorld(state) {
      const heat = clamp01(state.heat);
      const focus = clamp01(state.focus);
      const depth = clamp01(state.depth);
      const flux = clamp01(state.flux);

      if (this.worldEl) {
        this.worldEl.style.background = state.sky || DEFAULT_STATE.sky;
      }

      const hue = Math.round(210 - heat * 150);
      const sat = Math.round(54 + heat * 24);
      const light = Math.round(22 + focus * 8);

      if (this.layers.tint) {
        this.layers.tint.style.background = `
          linear-gradient(180deg,
            hsla(${hue}, ${sat}%, ${light + 6}%, .05),
            hsla(${hue}, ${sat}%, ${light - 2}%, .10)
          ),
          radial-gradient(900px 360px at 50% 20%,
            hsla(${hue}, ${sat}%, ${light + 12}%, .05),
            transparent 66%)
        `;
      }

      if (this.layers.vignette) {
        this.layers.vignette.style.opacity = String(0.64 + depth * 0.08);
      }

      if (this.layers.skyGlow) {
        this.layers.skyGlow.style.background = state.skyGlow || DEFAULT_STATE.skyGlow;
        this.layers.skyGlow.style.opacity = String(0.12 + heat * 0.16);
        this.layers.skyGlow.style.filter = `blur(${14 + depth * 10}px)`;
      }

      if (this.layers.moon) {
        this.layers.moon.style.background = state.moon || DEFAULT_STATE.moon;
        this.layers.moon.style.opacity = String(0.24 + focus * 0.18);
      }

      if (this.layers.groundLine) {
        this.layers.groundLine.style.opacity = String(0.22 + (1 - focus) * 0.08);
        this.layers.groundLine.style.transform = `translateX(${(flux - 0.5) * 4}px)`;
      }

      if (this.layers.fogBack) {
        this.layers.fogBack.style.opacity = String(0.06 + depth * 0.10 + (1 - focus) * 0.05);
        this.layers.fogBack.style.transform = `translateX(${(flux - 0.5) * -8}px)`;
      }

      if (this.layers.fogFront) {
        this.layers.fogFront.style.opacity = String(0.04 + depth * 0.08 + (1 - focus) * 0.03);
        this.layers.fogFront.style.transform = `translateX(${(flux - 0.5) * 10}px)`;
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
      const v = clamp01(value);
      if (fill) fill.style.width = `${Math.round(v * 100)}%`;
      if (num) num.textContent = v.toFixed(2);
    }

    _applyYoda(state) {
      const y = state.yoda || DEFAULT_STATE.yoda;
      if (!this.yoda.actor || !this.yoda.img) return;

      const xPct = clamp01(y.x) * 100;
      const bob = Number(y.bob || 0);
      const facing = Number(y.direction || 1) >= 0 ? 1 : -1;

      this.yoda.actor.style.left = `${xPct}%`;
      this.yoda.actor.style.bottom = `${14 + bob}px`;
      this.yoda.actor.style.transform = `translateX(-50%) scaleX(${facing})`;

      if (this.yoda.img.getAttribute("src") !== y.sprite) {
        this.yoda.img.setAttribute("src", y.sprite || "./assets/yoda_walk_1.png");
      }

      this.yoda.img.setAttribute("data-state", y.state || "walk");

      if (this.yoda.shadow) {
        this.yoda.shadow.style.left = `${xPct}%`;
        this.yoda.shadow.style.transform = `translateX(-50%) scaleX(${1.02 + Math.abs(Number(y.bob || 0)) * 0.02})`;
      }
    }
    _applyYodaAura(state) {
      const heat = clamp01(state.heat);
      const focus = clamp01(state.focus);
      const depth = clamp01(state.depth);
      const flux = clamp01(state.flux);

      const hue = Math.round(205 - heat * 150);
      const sat = Math.round(72 + heat * 18);
      const light = Math.round(62 + focus * 10);

      if (this.yoda.collar) {
        this.yoda.collar.style.background = `radial-gradient(circle, hsla(${hue}, ${sat}%, ${light}%, .96) 0%, hsla(${hue}, ${sat}%, ${light}%, .54) 36%, transparent 72%)`;
        this.yoda.collar.style.filter = `blur(${5 + depth * 3}px)`;
        this.yoda.collar.style.opacity = String(0.60 + heat * 0.26);
      }

      if (this.yoda.bleed) {
        this.yoda.bleed.style.background = `radial-gradient(circle at 50% 50%, hsla(${hue}, ${sat}%, ${light}%, .14) 0%, hsla(${hue}, ${sat}%, ${light}%, .05) 42%, transparent 76%)`;
        this.yoda.bleed.style.opacity = String(0.12 + heat * 0.10);
        this.yoda.bleed.style.filter = `blur(${6 + depth * 5}px)`;
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

      const every = Math.max(380, 1450 - clamp01(flux) * 700);

      for (let i = 0; i < 4; i += 1) {
        window.setTimeout(() => this._spawnParticle(color, 3200 + Math.random() * 1400), i * 220);
      }

      this.particleTimer = window.setInterval(() => {
        this._spawnParticle(color, 3200 + Math.random() * 1400);
      }, every);
    }

    _spawnParticle(color, duration) {
      if (!this.particlesEl) return;

      const el = document.createElement("span");
      el.className = "realmWorld__particle";

      const left = 8 + Math.random() * 84;
      const top = 14 + Math.random() * 64;
      const size = 2 + Math.random() * 2.2;

      el.style.left = `${left}%`;
      el.style.top = `${top}%`;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.background = color || DEFAULT_STATE.particle;
      el.style.boxShadow = `0 0 8px ${color || DEFAULT_STATE.particle}`;
      el.style.animationDuration = `${duration}ms`;

      this.particlesEl.appendChild(el);
      window.setTimeout(() => el.remove(), duration + 800);
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
              filter:blur(22px) saturate(.94) brightness(.56);
              transform:scale(1.08);
              z-index:1;
            }

            .realmWorld__artMain{
              background-position:center;
              background-size:cover;
              filter:saturate(.96) brightness(.84) contrast(.98);
              transform:scale(1.005);
              z-index:2;
            }

            .realmWorld__tint{ z-index:3; }

            .realmWorld__vignette{
              background:
                radial-gradient(90% 72% at 50% 40%, transparent 38%, rgba(0,0,0,.08) 66%, rgba(0,0,0,.20) 100%),
                linear-gradient(180deg, rgba(0,0,0,.03), transparent 22%, transparent 72%, rgba(0,0,0,.10));
              z-index:4;
            }

            .realmWorld__skyGlow{
              width:58%;
              height:56%;
              left:21%;
              top:6%;
              border-radius:50%;
              mix-blend-mode:screen;
              z-index:5;
              animation: realmSkyBreath 18s ease-in-out infinite alternate;
            }

            .realmWorld__moon{
              width:9%;
              aspect-ratio:1;
              right:12%;
              top:15%;
              border-radius:50%;
              box-shadow:0 0 12px rgba(255,255,255,.12);
              z-index:6;
            }

            .realmWorld__groundLine{
              left:8%;
              right:8%;
              bottom:24px;
              height:1px;
              background:linear-gradient(90deg, transparent, rgba(255,255,255,.14), rgba(255,255,255,.10), transparent);
              z-index:8;
            }

            .realmWorld__fogBack{
              background:
                radial-gradient(620px 150px at 34% 82%, rgba(230,236,250,.06), transparent 72%),
                radial-gradient(520px 140px at 72% 78%, rgba(230,236,250,.04), transparent 70%);
              mix-blend-mode:screen;
              z-index:7;
              animation: realmFogBackPan 20s ease-in-out infinite alternate;
            }

            .realmWorld__fogFront{
              background:
                radial-gradient(520px 130px at 48% 86%, rgba(230,236,250,.04), transparent 68%);
              mix-blend-mode:screen;
              z-index:11;
              animation: realmFogFrontPan 14s ease-in-out infinite alternate;
            }
            .realmWorld__particles{ z-index:10; }

            .realmWorld__particle{
              position:absolute;
              border-radius:50%;
              opacity:.62;
              animation: realmParticleFloat linear forwards;
            }

            .realmYoda{
              position:absolute;
              z-index:9;
              width:98px;
              height:98px;
              pointer-events:none;
              will-change:left,bottom,transform;
            }

            .realmYoda__shadow{
              position:absolute;
              z-index:8;
              bottom:22px;
              width:26px;
              height:6px;
              border-radius:50%;
              background:rgba(0,0,0,.34);
              filter:blur(2px);
              pointer-events:none;
            }

            .realmYoda__bleed{
              position:absolute;
              left:50%;
              bottom:10px;
              width:34px;
              height:14px;
              transform:translateX(-50%);
              border-radius:50%;
              opacity:.18;
              pointer-events:none;
            }

            .realmYoda__collar{
              position:absolute;
              left:58%;
              top:54%;
              width:14px;
              height:14px;
              transform:translate(-50%, -50%);
              border-radius:50%;
              mix-blend-mode:screen;
              opacity:.9;
              pointer-events:none;
            }

            .realmYoda__img{
              position:absolute;
              inset:0;
              width:100%;
              height:100%;
              object-fit:contain;
              display:block;
              image-rendering:auto;
              pointer-events:none;
              filter:drop-shadow(0 0 0 rgba(0,0,0,0));
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
              from{ transform:translateX(-8px) scale(.988); }
              to{ transform:translateX(8px) scale(1.015); }
            }
            @keyframes realmFogBackPan{
              from{ transform:translateX(-2.5%) translateY(0); }
              to{ transform:translateX(3%) translateY(-1%); }
            }
            @keyframes realmFogFrontPan{
              from{ transform:translateX(1.5%) translateY(0); }
              to{ transform:translateX(-2%) translateY(-1%); }
            }
            @keyframes realmParticleFloat{
              0%{ transform:translateY(0) scale(.78); opacity:0; }
              14%{ opacity:.68; }
              100%{ transform:translateY(-24px) scale(1.04); opacity:0; }
            }

            @media (max-width:420px){
              .realmYoda{ width:88px; height:88px; }
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

              <div class="realmYoda__shadow"></div>

              <div class="realmYoda">
                <img class="realmYoda__img" src="./assets/yoda_walk_1.png" alt="" />
                <div class="realmYoda__bleed"></div>
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
                <p class="realmAlbum" data-realm-text="album">Album portal</p>
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
                  <div class="realm-bar"><div class="realm-bar__fill" data-realm-fill="heat"></div></div>
                </div>
                <div class="realm-metric">
                  <div class="realm-metric__label">Focus</div>
                  <div class="realm-metric__value" data-realm-value="focus">0.72</div>
                  <div class="realm-bar"><div class="realm-bar__fill" data-realm-fill="focus"></div></div>
                </div>
                <div class="realm-metric">
                  <div class="realm-metric__label">Depth</div>
                  <div class="realm-metric__value" data-realm-value="depth">0.86</div>
                  <div class="realm-bar"><div class="realm-bar__fill" data-realm-fill="depth"></div></div>
                </div>
                <div class="realm-metric">
                  <div class="realm-metric__label">Flux</div>
                  <div class="realm-metric__value" data-realm-value="flux">0.41</div>
                  <div class="realm-bar"><div class="realm-bar__fill" data-realm-fill="flux"></div></div>
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
    defaults: structuredClone(DEFAULT_STATE)
  };
})();
