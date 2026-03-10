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
    if (typeof root.getElementById === "function") {
      return root.getElementById(id);
    }
    if (typeof root.querySelector === "function") {
      return root.querySelector(`#${CSS.escape(id)}`);
    }
    return null;
  }

  class RealmView {
    constructor(mountEl) {
      this.mountEl = mountEl;
      this.rootEl = null;
      this.portalEl = null;
      this.worldEl = null;
      this.particlesEl = null;

      this.metricFills = {
        heat: null,
        focus: null,
        depth: null,
        flux: null
      };

      this.metricValues = {
        heat: null,
        focus: null,
        depth: null,
        flux: null
      };

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
        ground: null,
        tower: null
      };

      this.currentState = { ...DEFAULT_STATE };
      this.particleTimer = null;
      this.isMounted = false;
    }

    mount() {
      if (!this.mountEl || this.isMounted) return;

      this.mountEl.innerHTML = this._template();
      this.rootEl = this.mountEl.querySelector(".realm-view");
      this.portalEl = this.mountEl.querySelector(".realm-portal");
      this.worldEl = this.mountEl.querySelector(".realm-world");
      this.particlesEl = this.mountEl.querySelector(".realm-particles");

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

      this.layerEls.skyGlow = this.mountEl.querySelector(".realm-skyGlow");
      this.layerEls.moon = this.mountEl.querySelector(".realm-moon");
      this.layerEls.far = this.mountEl.querySelector(".realm-far .realm-layer");
      this.layerEls.mid = this.mountEl.querySelector(".realm-mid .realm-layer");
      this.layerEls.ground = this.mountEl.querySelector(".realm-ground");
      this.layerEls.tower = this.mountEl.querySelector(".realm-tower");

      this._bindButtons();
      this.applyState(this.currentState);
      this.isMounted = true;
    }

    unmount() {
      this._stopParticles();
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
      this._startParticles(merged.particle, merged.flux);
      this._applyBirds(merged.birds);
    }
    peakPulse() {
      if (!this.worldEl || !this.currentState) return;

      this.worldEl.animate(
        [
          { transform: "scale(1)", filter: "brightness(1)" },
          { transform: "scale(1.02)", filter: "brightness(1.16)" },
          { transform: "scale(1)", filter: "brightness(1)" }
        ],
        {
          duration: 700,
          easing: "cubic-bezier(.2,.9,.2,1)"
        }
      );

      for (let i = 0; i < 8; i += 1) {
        window.setTimeout(() => {
          this._spawnParticle(this.currentState.particle, 4200 + Math.random() * 1800);
        }, i * 50);
      }
    }

    _bindButtons() {
      const cycleBtn = findById("realmCycleBtn", this.mountEl);
      const pulseBtn = findById("realmPulseBtn", this.mountEl);

      if (cycleBtn) {
        cycleBtn.addEventListener("click", () => {
          if (window.RealmEngine && typeof window.RealmEngine.nextDemoState === "function") {
            const next = window.RealmEngine.nextDemoState();
            this.applyState(next);
          }
        });
      }

      if (pulseBtn) {
        pulseBtn.addEventListener("click", () => {
          this.peakPulse();
        });
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
      if (this.rootEl) {
        this.rootEl.style.setProperty("--realm-glow", state.portalGlow);
        this.rootEl.style.setProperty("--realm-glow-2", state.portalGlow2);
        this.rootEl.style.setProperty("--realm-edge", state.portalEdge);
      }

      if (this.worldEl) {
        this.worldEl.style.background = state.sky;
      }

      if (this.layerEls.skyGlow) {
        this.layerEls.skyGlow.style.background = state.skyGlow;
      }

      if (this.layerEls.moon) {
        this.layerEls.moon.style.background = state.moon;
      }

      if (this.layerEls.far) {
        this.layerEls.far.style.background = state.far;
      }

      if (this.layerEls.mid) {
        this.layerEls.mid.style.background = state.mid;
      }

      if (this.layerEls.ground) {
        this.layerEls.ground.style.background = state.ground;
      }

      if (this.layerEls.tower) {
        this.layerEls.tower.style.opacity = String(
          typeof state.towerOpacity === "number" ? state.towerOpacity : 0.92
        );
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

    _applyBirds(showBirds) {
      const birdEls = this.mountEl.querySelectorAll(".realm-bird");
      birdEls.forEach((birdEl) => {
        birdEl.style.display = showBirds ? "" : "none";
      });
    }

    _stopParticles() {
      if (this.particleTimer) {
        window.clearInterval(this.particleTimer);
        this.particleTimer = null;
      }
      if (this.particlesEl) {
        this.particlesEl.innerHTML = "";
      }
    }

    _startParticles(color, flux) {
      this._stopParticles();
      if (!this.particlesEl) return;

      const baseMs = Math.max(220, 900 - clamp01(flux) * 650);

      for (let i = 0; i < 9; i += 1) {
        window.setTimeout(() => {
          this._spawnParticle(color, 7500 + Math.random() * 2500);
        }, i * 140);
      }

      this.particleTimer = window.setInterval(() => {
        this._spawnParticle(color, 7200 + Math.random() * 3000);
      }, baseMs);
    }

    _spawnParticle(color, duration = 9000) {
      if (!this.particlesEl) return;

      const p = document.createElement("span");
      p.className = "realm-particle";

      const left = 8 + Math.random() * 82;
      const bottom = 58 + Math.random() * 40;
      const size = 3 + Math.random() * 4.5;

      p.style.left = `${left}%`;
      p.style.bottom = `${bottom}px`;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.background = color;
      p.style.boxShadow = `0 0 10px ${color}`;
      p.style.animationDuration = `${duration * (0.75 + Math.random() * 0.6)}ms`;
      p.style.animationDelay = `${Math.random() * 300}ms`;

      this.particlesEl.appendChild(p);

      window.setTimeout(() => {
        p.remove();
      }, duration + 1800);
    }
    _template() {
      return `
        <div class="realm-view">
          <div class="realm-stack">
            <section class="realm-card realm-card--portal">
              <div class="realm-status">
                <div class="realm-badge">
                  <span class="realm-badge__dot" aria-hidden="true"></span>
                  <span class="realm-badge__text" data-realm-text="moodLine">Melancholic • Drift • Animated</span>
                </div>

                <div class="realm-chip" data-realm-text="biome">Moonlit Ruins</div>
              </div>

              <div class="realm-portal-shell">
                <div class="realm-portal">
                  <div class="realm-world">
                    <div class="realm-skyGlow"></div>
                    <div class="realm-stars"></div>
                    <div class="realm-moon"></div>
                    <div class="realm-clouds"></div>

                    <div class="realm-far">
                      <div class="realm-layer"></div>
                    </div>

                    <div class="realm-mid">
                      <div class="realm-layer"></div>
                      <div class="realm-tower"></div>
                    </div>

                    <div class="realm-fore">
                      <div class="realm-ground"></div>
                      <div class="realm-tree realm-tree--1"></div>
                      <div class="realm-tree realm-tree--2"></div>
                      <div class="realm-tree realm-tree--3"></div>
                    </div>

                    <div class="realm-fog"></div>
                    <div class="realm-particles"></div>

                    <div class="realm-bird" style="left:8%; top:36%; animation-delay:-3s"></div>
                    <div class="realm-bird" style="left:16%; top:32%; animation-delay:-8s"></div>
                  </div>
                </div>
              </div>

              <div class="realm-meta" style="margin-top:16px;">
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
                    <div class="realm-bar">
                      <div class="realm-bar__fill" data-realm-fill="heat" style="--realm-bar-color: var(--realm-heat)"></div>
                    </div>
                  </div>

                  <div class="realm-metric">
                    <div class="realm-metric__label">Focus</div>
                    <div class="realm-metric__value" data-realm-value="focus">0.72</div>
                    <div class="realm-bar">
                      <div class="realm-bar__fill" data-realm-fill="focus" style="--realm-bar-color: var(--realm-focus)"></div>
                    </div>
                  </div>

                  <div class="realm-metric">
                    <div class="realm-metric__label">Depth</div>
                    <div class="realm-metric__value" data-realm-value="depth">0.86</div>
                    <div class="realm-bar">
                      <div class="realm-bar__fill" data-realm-fill="depth" style="--realm-bar-color: var(--realm-depth)"></div>
                    </div>
                  </div>

                  <div class="realm-metric">
                    <div class="realm-metric__label">Flux</div>
                    <div class="realm-metric__value" data-realm-value="flux">0.41</div>
                    <div class="realm-bar">
                      <div class="realm-bar__fill" data-realm-fill="flux" style="--realm-bar-color: var(--realm-flux)"></div>
                    </div>
                  </div>
                </div>

                <div class="realm-actions">
                  <button id="realmCycleBtn" class="realm-btn" type="button">Cycle Realm</button>
                  <button id="realmPulseBtn" class="realm-btn" type="button">Peak Pulse</button>
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
