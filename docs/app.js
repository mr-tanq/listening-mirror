/* Listening Mirror — app.js (FULL REPLACE)
   - Stable NOW + Top + Recent
   - Mirror card always visible
   - Adds Orb breathing when LISTENING
*/

(() => {
  "use strict";

  const API_BASE = "https://i.errtanq9.workers.dev";
  const NOW_POLL_MS = 12_000;

  const TOP_LIMIT_DEFAULT = 10;
  const RECENT_LIMIT_DEFAULT = 20;

  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $ = (sel, root = document) => root.querySelector(sel);

  const statusDot = $("#statusDot");
  const statusLine = $("#statusLine");

  const tabBtns = $$(".tabBtn");
  const panels = $$(".panel");

  // NOW
  const nowAmbient = $("#nowAmbient");
  const nowBadge = $("#nowBadge");
  const nowBadgeText = $("#nowBadgeText");

  const nowImg = $("#nowImg");
  const nowFallback = $("#nowFallback");
  const nowCoverWrap = $("#nowCoverWrap");

  const nowTrack = $("#nowTrack");
  const nowArtist = $("#nowArtist");
  const nowAlbum = $("#nowAlbum");
  const nowMsg = $("#nowMsg");

  const nowTrackWrap = $("#nowTrackWrap");
  const nowArtistWrap = $("#nowArtistWrap");
  const nowAlbumWrap = $("#nowAlbumWrap");

  // TOP
  const topList = $("#topList");
  const topTypeBtns = $$("[data-top-type]");
  const topPeriodBtns = $$("[data-top-period]");

  // RECENT
  const recentList = $("#recentList");

  // MIRROR
  const mirrorPill = $("#mirrorPill");
  const mirrorPillText = $("#mirrorPillText");
  const mirrorState = $("#mirrorState");
  const mirrorOrb = $("#mirrorOrb");

  const mEnergy = $("#mEnergy");
  const mMood = $("#mMood");
  const mReplay = $("#mReplay");
  const mEnergyNum = $("#mEnergyNum");
  const mMoodNum = $("#mMoodNum");
  const mReplayNum = $("#mReplayNum");
  const mDot = $("#mDot");
  const mCovers = $("#mCovers");

  const state = {
    activeTab: "now",
    topType: "tracks",
    topPeriod: "today",
    online: false,
    nowTimer: null,
    lastRecentForMirror: [],
  };

  function absApi(urlOrPath) {
    if (!urlOrPath) return "";
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
    if (urlOrPath.startsWith("/")) return API_BASE + urlOrPath;
    return API_BASE + "/" + urlOrPath;
  }

  function setOnline(on) {
    state.online = !!on;
    statusDot.classList.toggle("on", state.online);
    statusLine.textContent = state.online ? "Online" : "Offline";
  }

  async function apiGet(path) {
    const url = absApi(path);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function setSelected(btns, activeBtn) {
    btns.forEach(b => b.setAttribute("aria-selected", b === activeBtn ? "true" : "false"));
  }

  function showPanel(name) {
    state.activeTab = name;
    tabBtns.forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name ? "true" : "false"));
    panels.forEach(p => p.classList.toggle("hidden", p.dataset.panel !== name));
  }

  function safeText(el, v, fallback = "—") {
    el.textContent = (v && String(v).trim().length) ? String(v) : fallback;
  }

  function enableMarqueeIfNeeded(wrapEl, spanEl) {
    requestAnimationFrame(() => {
      const wrap = wrapEl;
      const span = spanEl;
      if (!wrap || !span) return;

      const overflow = span.scrollWidth > wrap.clientWidth + 8;
      wrap.classList.toggle("marqOn", overflow);

      if (overflow) {
        const shift = span.scrollWidth - wrap.clientWidth + 18;
        wrap.style.setProperty("--marqShift", `${shift}px`);
        const dur = Math.min(22, Math.max(10, shift / 22));
        wrap.style.setProperty("--marqDur", `${dur}s`);
      } else {
        wrap.style.removeProperty("--marqShift");
        wrap.style.removeProperty("--marqDur");
      }
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function rowHTML({ idx, title, sub, img, right, rightClass = "right" }) {
    const imgHtml = img
      ? `<img src="${img}" alt="" loading="lazy" decoding="async" />`
      : `<div class="thumbFallback">♪</div>`;

    return `
      <div class="row" role="listitem" aria-label="${idx}. ${escapeHtml(title)}">
        <div class="thumb" aria-hidden="true">${imgHtml}</div>
        <div class="mid">
          <div class="title">${escapeHtml(`${idx}. ${title}`)}</div>
          <div class="sub">${escapeHtml(sub || "")}</div>
        </div>
        <div class="${rightClass}">${escapeHtml(String(right ?? ""))}</div>
      </div>
    `;
  }

  // -------- MIRROR (visual-only) --------
  function clamp01(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return 0.5;
    return Math.max(0, Math.min(1, n));
  }

  function mirrorFromNowItem(item) {
    if (!item) {
      return { live: false, energy: 0.28, mood: 0.42, replay: 0.18, axis01: 0.42 };
    }
    const t = (item.name || "").length;
    const a = (item.artist || "").length;
    const al = (item.album || "").length;
    const seed = (t * 13 + a * 7 + al * 5) % 100;

    const energy = 0.45 + (seed / 100) * 0.35;
    const mood = 0.30 + ((100 - seed) / 100) * 0.45;
    const replay = 0.35 + ((seed % 37) / 37) * 0.45;
    const axis01 = 0.35 + ((seed % 61) / 61) * 0.45;

    return { live: true, energy, mood, replay, axis01 };
  }

  function updateMirrorCoversFromRecent() {
    return (state.lastRecentForMirror || [])
      .map(it => it?.image || "")
      .filter(Boolean);
  }

  function setMirror({ live, energy, mood, replay, axis01, covers }) {
    mirrorPill.classList.toggle("on", !!live);
    mirrorPillText.textContent = live ? "LISTENING" : "IDLE";
    mirrorState.textContent = live ? "LISTENING" : "IDLE";

    // ✅ Orb breathing
    mirrorOrb.classList.toggle("on", !!live);

    const e = clamp01(energy);
    const m = clamp01(mood);
    const r = clamp01(replay);

    mEnergy.style.width = `${Math.round(e * 100)}%`;
    mMood.style.width = `${Math.round(m * 100)}%`;
    mReplay.style.width = `${Math.round(r * 100)}%`;

    mEnergyNum.textContent = `${Math.round(e * 100)}`;
    mMoodNum.textContent = `${Math.round(m * 100)}`;
    mReplayNum.textContent = `${Math.round(r * 100)}`;

    const ax = clamp01(axis01);
    mDot.style.left = `${Math.round(ax * 100)}%`;

    const list = Array.isArray(covers) ? covers.slice(0, 6) : [];
    mCovers.innerHTML = list.map(url => {
      const u = absApi(url || "");
      if (!u) return `<div class="cvr" aria-hidden="true"></div>`;
      return `<div class="cvr" aria-hidden="true"><img src="${u}" alt="" loading="lazy" decoding="async" /></div>`;
    }).join("");
  }

  // -------- NOW --------
  function setNowVisual({ live, item }) {
    nowBadge.classList.toggle("live", !!live);
    nowBadgeText.textContent = live ? "LIVE" : "OFF";

    if (!item) {
      nowAmbient.classList.remove("on");
      nowCoverWrap.style.removeProperty("--cover-url");
      nowAmbient.style.removeProperty("--ambient-url");

      nowImg.style.display = "none";
      nowImg.removeAttribute("src");
      nowFallback.style.display = "grid";

      safeText(nowTrack, "—");
      safeText(nowArtist, "—");
      safeText(nowAlbum, "—");
      safeText(nowMsg, "Not playing now", "Not playing now");

      enableMarqueeIfNeeded(nowTrackWrap, nowTrack);
      enableMarqueeIfNeeded(nowArtistWrap, nowArtist);
      enableMarqueeIfNeeded(nowAlbumWrap, nowAlbum);
      return;
    }

    const img = absApi(item.image || "");
    safeText(nowTrack, item.name || "—");
    safeText(nowArtist, item.artist || "—");
    safeText(nowAlbum, item.album || "—");
    safeText(nowMsg, "", "");

    if (img) {
      nowImg.src = img;
      nowImg.style.display = "block";
      nowFallback.style.display = "none";

      nowCoverWrap.style.setProperty("--cover-url", `url("${img}")`);
      nowAmbient.style.setProperty("--ambient-url", `url("${img}")`);
      nowAmbient.classList.add("on");
    } else {
      nowImg.style.display = "none";
      nowImg.removeAttribute("src");
      nowFallback.style.display = "grid";
      nowAmbient.classList.remove("on");
      nowAmbient.style.removeProperty("--ambient-url");
    }

    enableMarqueeIfNeeded(nowTrackWrap, nowTrack);
    enableMarqueeIfNeeded(nowArtistWrap, nowArtist);
    enableMarqueeIfNeeded(nowAlbumWrap, nowAlbum);
  }

  async function loadNow() {
    try {
      const j = await apiGet("/api/now");
      setOnline(true);

      const item = (j && j.ok) ? (j.item || null) : null;
      const live = !!item;

      setNowVisual({ live, item });

      const base = mirrorFromNowItem(item);
      setMirror({ ...base, covers: updateMirrorCoversFromRecent() });

      return true;
    } catch (e) {
      setOnline(false);

      setNowVisual({ live: false, item: null });
      setMirror({
        live: false,
        energy: 0.22,
        mood: 0.38,
        replay: 0.12,
        axis01: 0.40,
        covers: updateMirrorCoversFromRecent(),
      });

      return false;
    }
  }

  function startNowPolling() {
    stopNowPolling();
    state.nowTimer = setInterval(() => {
      if (state.activeTab === "now") loadNow();
    }, NOW_POLL_MS);
  }

  function stopNowPolling() {
    if (state.nowTimer) clearInterval(state.nowTimer);
    state.nowTimer = null;
  }

  // -------- TOP --------
  function setTopLoading() {
    topList.innerHTML = `
      <div class="row">
        <div class="mid">
          <div class="title">Loading…</div>
          <div class="sub">Fetching your top…</div>
        </div>
      </div>
    `;
  }

  async function loadTop() {
    try {
      setTopLoading();
      const type = state.topType;
      const period = state.topPeriod;
      const limit = TOP_LIMIT_DEFAULT;

      const j = await apiGet(`/api/top?type=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}&limit=${limit}`);
      setOnline(true);

      const items = (j && j.ok && Array.isArray(j.items)) ? j.items : [];
      if (!items.length) {
        topList.innerHTML = `
          <div class="row">
            <div class="mid">
              <div class="title">No data</div>
              <div class="sub">Try another period.</div>
            </div>
          </div>
        `;
        return true;
      }

      const html = items.map((it, i) => {
        const idx = i + 1;
        const title = it.name || "—";
        const sub = (type === "artists") ? "" : (it.artist || "");
        const img = absApi(it.image || "");
        const right = (it.playcount != null) ? it.playcount : "";
        return rowHTML({ idx, title, sub, img, right, rightClass: "right count" });
      }).join("");

      topList.innerHTML = html;
      return true;
    } catch (e) {
      setOnline(false);
      topList.innerHTML = `
        <div class="row">
          <div class="mid">
            <div class="title">Couldn’t load Top.</div>
            <div class="sub">Check connection / Worker.</div>
          </div>
        </div>
      `;
      return false;
    }
  }

  // -------- RECENT --------
  function setRecentLoading() {
    recentList.innerHTML = `
      <div class="row">
        <div class="mid">
          <div class="title">Loading…</div>
          <div class="sub">Fetching recent…</div>
        </div>
      </div>
    `;
  }

  function normalizeRecent(j) {
    return (
      (j && j.ok && Array.isArray(j.items) && j.items) ||
      (j && j.ok && Array.isArray(j.history) && j.history) ||
      []
    );
  }

  async function loadRecent() {
    try {
      setRecentLoading();
      const limit = RECENT_LIMIT_DEFAULT;

      const j = await apiGet(`/api/history?limit=${limit}`);
      setOnline(true);

      const items = normalizeRecent(j);
      state.lastRecentForMirror = items.slice(0, 10);

      if (!items.length) {
        recentList.innerHTML = `
          <div class="row">
            <div class="mid">
              <div class="title">No recent tracks</div>
              <div class="sub">Play something and refresh.</div>
            </div>
          </div>
        `;
        return true;
      }

      const html = items.map((it, i) => {
        const idx = i + 1;
        const title = it.name || "—";
        const sub = `${it.artist || ""}${it.album ? " • " + it.album : ""}`.trim();
        const img = absApi(it.image || "");
        const right = it.time || it.date || "";
        return rowHTML({ idx, title, sub, img, right, rightClass: "right" });
      }).join("");

      recentList.innerHTML = html;

      // refresh mirror cover stack quickly
      const base = mirrorFromNowItem(null);
      setMirror({ ...base, covers: updateMirrorCoversFromRecent() });

      return true;
    } catch (e) {
      setOnline(false);
      recentList.innerHTML = `
        <div class="row">
          <div class="mid">
            <div class="title">Couldn’t load Recent.</div>
            <div class="sub">Check connection / Worker.</div>
          </div>
        </div>
      `;
      return false;
    }
  }

  // -------- Wiring --------
  function wireTabs() {
    tabBtns.forEach(btn => {
      btn.addEventListener("click", async () => {
        const name = btn.dataset.tab;
        showPanel(name);

        if (name === "now") await loadNow();
        if (name === "top") await loadTop();
        if (name === "recent") await loadRecent();
      });
    });
  }

  function wireTopControls() {
    topTypeBtns.forEach(btn => {
      btn.addEventListener("click", async () => {
        state.topType = btn.dataset.topType;
        setSelected(topTypeBtns, btn);
        await loadTop();
      });
    });

    topPeriodBtns.forEach(btn => {
      btn.addEventListener("click", async () => {
        state.topPeriod = btn.dataset.topPeriod;
        setSelected(topPeriodBtns, btn);
        await loadTop();
      });
    });
  }

  async function boot() {
    wireTabs();
    wireTopControls();

    showPanel("now");

    // fast + stable
    await loadRecent(); // mirror gets covers early
    await loadNow();    // now + mirror correct
    loadTop();          // background

    startNowPolling();
  }

  boot();
})();