/* Listening Mirror — app.js (FULL REPLACE)
   Fixes:
   - No missing DOM references (no nowUpdated / nowMsg)
   - NOW works with your worker: item != null => playing
   - LIVE badge shows only when playing (no OFF label)
   - Faster loads (no background prefetch, fetch timeouts)
   - Recent endpoint resilient (/api/history then /api/recent)
   - Pull-to-refresh (mobile)
*/

(() => {
  "use strict";

  // ✅ Your Worker base (no trailing slash)
  const API_BASE = "https://i.errtanq9.workers.dev";

  // Polling
  const NOW_POLL_MS = 12_000;

  // Limits
  const TOP_LIMIT_DEFAULT = 10;
  const RECENT_LIMIT_DEFAULT = 20;

  // Fetch timeout
  const FETCH_TIMEOUT_MS = 7000;

  // -------- DOM helpers --------
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $ = (sel, root = document) => root.querySelector(sel);

  function must(el, name) {
    // hard fail early if core DOM missing
    if (!el) throw new Error(`Missing DOM node: ${name}`);
    return el;
  }

  // Header status
  const statusDot = must($("#statusDot"), "#statusDot");
  const statusLine = must($("#statusLine"), "#statusLine");

  // Tabs
  const tabBtns = $$(".tabBtn");
  const panels = $$(".panel");

  // NOW
  const nowCard = must($("#nowCard"), "#nowCard");
  const nowAmbient = must($("#nowAmbient"), "#nowAmbient");
  const nowBadge = must($("#nowBadge"), "#nowBadge");
  const nowBadgeText = must($("#nowBadgeText"), "#nowBadgeText");
  const nowImg = must($("#nowImg"), "#nowImg");
  const nowFallback = must($("#nowFallback"), "#nowFallback");
  const nowCoverWrap = must($("#nowCoverWrap"), "#nowCoverWrap");

  const nowTrack = must($("#nowTrack"), "#nowTrack");
  const nowArtist = must($("#nowArtist"), "#nowArtist");
  const nowAlbum = must($("#nowAlbum"), "#nowAlbum");

  const nowTrackWrap = must($("#nowTrackWrap"), "#nowTrackWrap");
  const nowArtistWrap = must($("#nowArtistWrap"), "#nowArtistWrap");
  const nowAlbumWrap = must($("#nowAlbumWrap"), "#nowAlbumWrap");

  // TOP
  const topList = must($("#topList"), "#topList");
  const topTypeBtns = $$("[data-top-type]");
  const topPeriodBtns = $$("[data-top-period]");

  // RECENT
  const recentList = must($("#recentList"), "#recentList");

  // Pull-to-refresh UI (injected)
  const ptr = document.createElement("div");
  ptr.className = "ptr";
  ptr.innerHTML = `
    <div class="ptrPill">
      <span class="ptrDot"></span>
      <span class="ptrText">Pull to refresh</span>
      <span class="ptrSpin" aria-hidden="true"></span>
    </div>
  `;
  document.body.appendChild(ptr);
  const ptrText = $(".ptrText", ptr);

  // -------- State --------
  const state = {
    activeTab: "now",
    topType: "tracks",
    topPeriod: "today",
    online: false,
    nowTimer: null,
    isRefreshing: false,
    nowReqId: 0, // avoid out-of-order renders
  };

  // -------- Helpers --------
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

  function safeText(el, v, fallback = "—") {
    el.textContent = (v && String(v).trim().length) ? String(v) : fallback;
  }

  function setSelected(btns, activeBtn) {
    btns.forEach(b => b.setAttribute("aria-selected", b === activeBtn ? "true" : "false"));
  }

  function showPanel(name) {
    state.activeTab = name;
    tabBtns.forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name ? "true" : "false"));
    panels.forEach(p => p.classList.toggle("hidden", p.dataset.panel !== name));
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

  async function apiGet(path) {
    const url = absApi(path);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

    try {
      const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  // -------- Pull-to-refresh helpers --------
  function isAtTop() {
    const sc = document.scrollingElement || document.documentElement;
    return (sc.scrollTop || 0) <= 0;
  }

  function ptrShow(msg, loading = false) {
    ptr.classList.add("on");
    ptr.classList.toggle("loading", !!loading);
    if (ptrText) ptrText.textContent = msg;
  }

  function ptrHide() {
    ptr.classList.remove("on");
    ptr.classList.remove("loading");
    if (ptrText) ptrText.textContent = "Pull to refresh";
  }

  // -------- Row builder --------
  function rowHTML({ idx, title, sub, img, right }) {
    const imgHtml = img
      ? `<img src="${img}" alt="" loading="lazy" decoding="async" />`
      : `<div class="thumbFallback">♪</div>`;

    return `
      <div class="row" role="listitem" aria-label="${escapeHtml(`${idx}. ${title}`)}">
        <div class="thumb" aria-hidden="true">${imgHtml}</div>
        <div class="mid">
          <div class="title">${escapeHtml(`${idx}. ${title}`)}</div>
          <div class="sub">${escapeHtml(sub || "")}</div>
        </div>
        <div class="right count">${escapeHtml(String(right ?? ""))}</div>
      </div>
    `;
  }

  // Expose minimal hook
  window.__LM__ = { refresh: () => refreshActive() };
// -------- NOW --------
  function clearNowToIdle() {
    nowCard.classList.add("idle");

    // Hide LIVE badge when not playing
    nowBadge.style.display = "none";
    nowBadgeText.textContent = "LIVE";

    // Clear ambient + cover vars
    nowAmbient.classList.remove("on");
    nowAmbient.style.removeProperty("--ambient-url");
    nowCoverWrap.style.removeProperty("--cover-url");

    // Hide image, show fallback
    nowImg.style.display = "none";
    nowImg.removeAttribute("src");
    nowFallback.style.display = "none"; // premium idle wants orb, not the ♪
  }

  function renderNowPlaying(item) {
    nowCard.classList.remove("idle");

    // Show LIVE badge top-right
    nowBadge.style.display = "inline-flex";
    nowBadgeText.textContent = "LIVE";

    const track = item?.name || "—";
    const artist = item?.artist || "—";
    const album = item?.album || "—";
    safeText(nowTrack, track);
    safeText(nowArtist, artist);
    safeText(nowAlbum, album);

    const img = absApi(item?.image || "");

    if (img) {
      nowImg.src = img;
      nowImg.style.display = "block";
      nowFallback.style.display = "none";

      // Premium layers via CSS vars
      nowCoverWrap.style.setProperty("--cover-url", `url("${img}")`);
      nowAmbient.style.setProperty("--ambient-url", `url("${img}")`);
      nowAmbient.classList.add("on");
    } else {
      nowImg.style.display = "none";
      nowImg.removeAttribute("src");
      nowFallback.style.display = "grid";
      nowAmbient.classList.remove("on");
      nowAmbient.style.removeProperty("--ambient-url");
      nowCoverWrap.style.removeProperty("--cover-url");
    }

    enableMarqueeIfNeeded(nowTrackWrap, nowTrack);
    enableMarqueeIfNeeded(nowArtistWrap, nowArtist);
    enableMarqueeIfNeeded(nowAlbumWrap, nowAlbum);
  }

  async function loadNow() {
    const reqId = ++state.nowReqId;

    try {
      const j = await apiGet("/api/now");
      if (reqId !== state.nowReqId) return true; // newer request already fired

      setOnline(true);

      // Your worker contract:
      // ok:true, item: {..} => playing
      // ok:true, item:null => not playing
      const item = (j && j.ok) ? (j.item || null) : null;

      if (!item) {
        clearNowToIdle();
        // keep text subtle
        safeText(nowTrack, "—");
        safeText(nowArtist, "—");
        safeText(nowAlbum, "—");
        return true;
      }

      renderNowPlaying(item);
      return true;
    } catch (e) {
      if (reqId !== state.nowReqId) return false;
      setOnline(false);
      clearNowToIdle();
      safeText(nowTrack, "—");
      safeText(nowArtist, "—");
      safeText(nowAlbum, "—");
      return false;
    }
  }

  function startNowPolling() {
    stopNowPolling();
    state.nowTimer = setInterval(() => {
      if (!state.isRefreshing && state.activeTab === "now") loadNow();
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

      const items = (j?.ok && Array.isArray(j.items)) ? j.items : [];
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

      topList.innerHTML = items.map((it, i) => {
        const title = it.name || "—";
        const sub = (type === "artists") ? "" : (it.artist || "");
        const img = absApi(it.image || "");
        const right = it.playcount ?? "";
        return rowHTML({ idx: i + 1, title, sub, img, right });
      }).join("");

      return true;
    } catch (e) {
      setOnline(false);
      topList.innerHTML = `
        <div class="row">
          <div class="mid">
            <div class="title">Couldn’t load Top.</div>
            <div class="sub">Check Worker / connection.</div>
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
    // Accept multiple shapes:
    // {ok:true, items:[...]}  OR  {ok:true, history:[...]} OR {ok:true, recent:[...]}
    if (!j || !j.ok) return [];
    if (Array.isArray(j.items)) return j.items;
    if (Array.isArray(j.history)) return j.history;
    if (Array.isArray(j.recent)) return j.recent;
    return [];
  }

  async function loadRecent() {
    try {
      setRecentLoading();

      const limit = RECENT_LIMIT_DEFAULT;

      // Try endpoints in order (resilient)
      let j;
      try {
        j = await apiGet(`/api/history?limit=${limit}`);
      } catch {
        j = await apiGet(`/api/recent?limit=${limit}`);
      }

      setOnline(true);

      const items = normalizeRecent(j);
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

      recentList.innerHTML = items.map((it, i) => {
        const title = it.name || "—";
        const sub = `${it.artist || ""}${it.album ? " • " + it.album : ""}`.trim();
        const img = absApi(it.image || "");
        const right = it.time || it.date || ""; // optional
        return `
          <div class="row" role="listitem" aria-label="${escapeHtml(`${i + 1}. ${title}`)}">
            <div class="thumb" aria-hidden="true">
              ${img ? `<img src="${img}" alt="" loading="lazy" decoding="async" />` : `<div class="thumbFallback">♪</div>`}
            </div>
            <div class="mid">
              <div class="title">${escapeHtml(`${i + 1}. ${title}`)}</div>
              <div class="sub">${escapeHtml(sub)}</div>
            </div>
            <div class="right">${escapeHtml(String(right))}</div>
          </div>
        `;
      }).join("");

      return true;
    } catch (e) {
      setOnline(false);
      recentList.innerHTML = `
        <div class="row">
          <div class="mid">
            <div class="title">Couldn’t load Recent.</div>
            <div class="sub">Check Worker / connection.</div>
          </div>
        </div>
      `;
      return false;
    }
  }

  // -------- Pull to refresh (mobile) --------
  let touchStartY = 0;
  let pullY = 0;
  let pulling = false;
  const PULL_MAX = 110;
  const PULL_TRIGGER = 72;

  async function refreshActive() {
    state.isRefreshing = true;
    ptrShow("Refreshing…", true);

    try {
      if (state.activeTab === "now") await loadNow();
      else if (state.activeTab === "top") await loadTop();
      else if (state.activeTab === "recent") await loadRecent();
    } finally {
      setTimeout(() => {
        state.isRefreshing = false;
        ptrHide();
      }, 220);
    }
  }

  function onTouchStart(e) {
    if (state.isRefreshing) return;
    if (!isAtTop()) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    touchStartY = t.clientY;
    pullY = 0;
    pulling = true;
  }

  function onTouchMove(e) {
    if (!pulling || state.isRefreshing) return;
    if (!isAtTop()) return;

    const t = e.touches && e.touches[0];
    if (!t) return;
    const dy = t.clientY - touchStartY;
    if (dy <= 0) return;

    pullY = Math.min(PULL_MAX, dy);

    if (pullY < PULL_TRIGGER) {
      ptrShow(pullY > PULL_TRIGGER * 0.75 ? "Release to refresh" : "Pull to refresh", false);
    } else {
      ptrShow("Release to refresh", false);
    }
  }

  function onTouchEnd() {
    if (!pulling || state.isRefreshing) {
      pulling = false;
      return;
    }
    pulling = false;

    if (pullY >= PULL_TRIGGER) refreshActive();
    else ptrHide();
  }

  // -------- Events / Wiring --------
  function wireTabs() {
    tabBtns.forEach(btn => {
      btn.addEventListener("click", async () => {
        const name = btn.dataset.tab;
        showPanel(name);

        // Load only what you open (fast + no weird background races)
        if (name === "now") await loadNow();
        else if (name === "top") await loadTop();
        else if (name === "recent") await loadRecent();
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

  function wirePullToRefresh() {
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });
  }

  // -------- Boot --------
  async function boot() {
    wireTabs();
    wireTopControls();
    wirePullToRefresh();

    showPanel("now");
    clearNowToIdle();

    await loadNow(); // only NOW at start (fast)
    startNowPolling();
  }

  boot();
})();