/* Listening Mirror — app.js (FULL REPLACE) — FAST + CORRECT
   Fixes:
   - NOW: timeout + 1 retry before OFF
   - Boot: loads ONLY active tab (no heavy parallel fetch)
   - RECENT: reverse so newest first
   - Matches your index.html (no nowUpdated / no nowMsg)
*/

(() => {
  "use strict";

  const API_BASE = "https://i.errtanq9.workers.dev"; // no trailing slash
  const NOW_POLL_MS = 12_000;

  const TOP_LIMIT_DEFAULT = 10;
  const RECENT_LIMIT_DEFAULT = 20;

  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $ = (sel, root = document) => root.querySelector(sel);

  // Header
  const statusDot = $("#statusDot");
  const statusLine = $("#statusLine");

  // Tabs / panels
  const tabBtns = $$(".tabBtn");
  const panels = $$(".panel");

  // NOW
  const nowCard = $("#nowCard");
  const nowAmbient = $("#nowAmbient");
  const nowBadge = $("#nowBadge");
  const nowBadgeText = $("#nowBadgeText");
  const nowImg = $("#nowImg");
  const nowFallback = $("#nowFallback");
  const nowCoverWrap = $("#nowCoverWrap");

  const nowTrack = $("#nowTrack");
  const nowArtist = $("#nowArtist");
  const nowAlbum = $("#nowAlbum");

  const nowTrackWrap = $("#nowTrackWrap");
  const nowArtistWrap = $("#nowArtistWrap");
  const nowAlbumWrap = $("#nowAlbumWrap");

  // TOP
  const topList = $("#topList");
  const topTypeBtns = $$("[data-top-type]");
  const topPeriodBtns = $$("[data-top-period]");

  // RECENT
  const recentList = $("#recentList");

  // Pull-to-refresh (exists in index)
  const ptr = $("#ptr");
  const ptrText = $("#ptrText");

  const state = {
    activeTab: "now",
    topType: "tracks",
    topPeriod: "today",
    online: false,
    nowTimer: null,
    isRefreshing: false,
  };

  function absApi(urlOrPath) {
    if (!urlOrPath) return "";
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
    if (urlOrPath.startsWith("/")) return API_BASE + urlOrPath;
    return API_BASE + "/" + urlOrPath;
  }

  function setOnline(on) {
    state.online = !!on;
    if (statusDot) statusDot.classList.toggle("on", state.online);
    if (statusLine) statusLine.textContent = state.online ? "Online" : "Offline";
  }

  async function apiGet(path, { timeoutMs = 8000 } = {}) {
    const url = absApi(path);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return j;
    } finally {
      clearTimeout(t);
    }
  }

  function showPanel(name) {
    state.activeTab = name;
    tabBtns.forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name ? "true" : "false"));
    panels.forEach(p => p.classList.toggle("hidden", p.dataset.panel !== name));
  }

  function safeText(el, v, fallback = "—") {
    if (!el) return;
    const s = (v && String(v).trim().length) ? String(v) : fallback;
    el.textContent = s;
  }

  function enableMarqueeIfNeeded(wrapEl, spanEl) {
    requestAnimationFrame(() => {
      if (!wrapEl || !spanEl) return;
      const overflow = spanEl.scrollWidth > wrapEl.clientWidth + 8;
      wrapEl.classList.toggle("marqOn", overflow);

      if (overflow) {
        const shift = spanEl.scrollWidth - wrapEl.clientWidth + 18;
        wrapEl.style.setProperty("--marqShift", `${shift}px`);
        const dur = Math.min(22, Math.max(10, shift / 22));
        wrapEl.style.setProperty("--marqDur", `${dur}s`);
      } else {
        wrapEl.style.removeProperty("--marqShift");
        wrapEl.style.removeProperty("--marqDur");
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
// -------- NOW --------
  function setNowVisual(item) {
    const live = !!item;

    if (nowCard) nowCard.classList.toggle("idle", !live);

    if (nowBadge) {
      nowBadge.style.display = live ? "inline-flex" : "none";
      nowBadge.classList.toggle("live", live);
    }
    if (nowBadgeText) nowBadgeText.textContent = "LIVE";

    if (!live) {
      if (nowAmbient) nowAmbient.classList.remove("on");
      if (nowCoverWrap) nowCoverWrap.style.removeProperty("--cover-url");
      if (nowAmbient) nowAmbient.style.removeProperty("--ambient-url");

      if (nowImg) {
        nowImg.style.display = "none";
        nowImg.removeAttribute("src");
      }
      if (nowFallback) nowFallback.style.display = "none"; // premium idle orb handles it

      safeText(nowTrack, "—");
      safeText(nowArtist, "—");
      safeText(nowAlbum, "—");

      enableMarqueeIfNeeded(nowTrackWrap, nowTrack);
      enableMarqueeIfNeeded(nowArtistWrap, nowArtist);
      enableMarqueeIfNeeded(nowAlbumWrap, nowAlbum);
      return;
    }

    const img = absApi(item.image || "");
    safeText(nowTrack, item.name || "—");
    safeText(nowArtist, item.artist || "—");
    safeText(nowAlbum, item.album || "—");

    if (img) {
      if (nowImg) {
        nowImg.src = img;
        nowImg.style.display = "block";
      }
      if (nowFallback) nowFallback.style.display = "none";

      if (nowCoverWrap) nowCoverWrap.style.setProperty("--cover-url", `url("${img}")`);
      if (nowAmbient) {
        nowAmbient.style.setProperty("--ambient-url", `url("${img}")`);
        nowAmbient.classList.add("on");
      }
    } else {
      if (nowImg) {
        nowImg.style.display = "none";
        nowImg.removeAttribute("src");
      }
      if (nowAmbient) nowAmbient.classList.remove("on");
    }

    enableMarqueeIfNeeded(nowTrackWrap, nowTrack);
    enableMarqueeIfNeeded(nowArtistWrap, nowArtist);
    enableMarqueeIfNeeded(nowAlbumWrap, nowAlbum);
  }

  async function loadNow() {
    try {
      const j = await apiGet("/api/now", { timeoutMs: 8000 });
      setOnline(true);
      const item = j?.ok ? (j.item || null) : null;
      setNowVisual(item);
      return true;
    } catch (e) {
      // retry ONCE (fast) before OFF
      try {
        const j2 = await apiGet("/api/now", { timeoutMs: 9000 });
        setOnline(true);
        const item2 = j2?.ok ? (j2.item || null) : null;
        setNowVisual(item2);
        return true;
      } catch {
        setOnline(false);
        setNowVisual(null);
        return false;
      }
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

  function setTopLoading() {
    if (!topList) return;
    topList.innerHTML =
      `<div class="row"><div class="mid"><div class="title">Loading…</div><div class="sub">Fetching your top…</div></div></div>`;
  }

  async function loadTop() {
    try {
      setTopLoading();
      const type = state.topType;
      const period = state.topPeriod;
      const limit = TOP_LIMIT_DEFAULT;

      const j = await apiGet(`/api/top?type=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}&limit=${limit}`, { timeoutMs: 10_000 });
      setOnline(true);

      const items = (j?.ok && Array.isArray(j.items)) ? j.items : [];
      if (!items.length) {
        topList.innerHTML =
          `<div class="row"><div class="mid"><div class="title">No data</div><div class="sub">Try another period.</div></div></div>`;
        return true;
      }

      topList.innerHTML = items.map((it, i) => {
        const title = it.name || "—";
        const sub = type === "artists" ? "" : (it.artist || "");
        const img = absApi(it.image || "");
        const right = it.playcount ?? "";
        return rowHTML({ idx: i + 1, title, sub, img, right });
      }).join("");

      return true;
    } catch (e) {
      setOnline(false);
      if (topList) {
        topList.innerHTML =
          `<div class="row"><div class="mid"><div class="title">Couldn’t load Top.</div><div class="sub">Check connection / Worker.</div></div></div>`;
      }
      return false;
    }
  }
// -------- RECENT --------
  function setRecentLoading() {
    if (!recentList) return;
    recentList.innerHTML =
      `<div class="row"><div class="mid"><div class="title">Loading…</div><div class="sub">Fetching recent…</div></div></div>`;
  }

  function normalizeRecentItems(j) {
    const items =
      (j?.ok && Array.isArray(j.items) && j.items) ||
      (j?.ok && Array.isArray(j.history) && j.history) ||
      [];

    // If the API returns oldest->newest, we want newest first.
    // Safe approach: reverse always (history endpoint is "recent", reversing makes UI correct)
    return items.slice().reverse();
  }

  async function loadRecent() {
    try {
      setRecentLoading();
      const limit = RECENT_LIMIT_DEFAULT;

      const j = await apiGet(`/api/history?limit=${limit}`, { timeoutMs: 12_000 });
      setOnline(true);

      const items = normalizeRecentItems(j);

      if (!items.length) {
        recentList.innerHTML =
          `<div class="row"><div class="mid"><div class="title">No recent tracks</div><div class="sub">Play something and refresh.</div></div></div>`;
        return true;
      }

      recentList.innerHTML = items.map((it, i) => {
        const title = it.name || "—";
        const sub = `${it.artist || ""}${it.album ? " • " + it.album : ""}`.trim();
        const img = absApi(it.image || "");
        const right = it.time || it.date || "";

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
      if (recentList) {
        recentList.innerHTML =
          `<div class="row"><div class="mid"><div class="title">Couldn’t load Recent.</div><div class="sub">Check connection / Worker.</div></div></div>`;
      }
      return false;
    }
  }
// -------- Pull to refresh --------
  let touchStartY = 0;
  let pullY = 0;
  let pulling = false;
  const PULL_MAX = 110;
  const PULL_TRIGGER = 72;

  function isAtTop() {
    const sc = document.scrollingElement || document.documentElement;
    return (sc.scrollTop || 0) <= 0;
  }

  function ptrShow(msg, loading = false) {
    if (!ptr) return;
    ptr.classList.add("on");
    ptr.classList.toggle("loading", !!loading);
    if (ptrText) ptrText.textContent = msg;
  }

  function ptrHide() {
    if (!ptr) return;
    ptr.classList.remove("on");
    ptr.classList.remove("loading");
    if (ptrText) ptrText.textContent = "Pull to refresh";
  }

  async function refreshActive() {
    state.isRefreshing = true;
    ptrShow("Refreshing…", true);

    try {
      if (state.activeTab === "now") await loadNow();
      if (state.activeTab === "top") await loadTop();
      if (state.activeTab === "recent") await loadRecent();
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
    ptrShow(pullY >= PULL_TRIGGER ? "Release to refresh" : "Pull to refresh", false);
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

  // -------- Wiring --------
  function wireTabs() {
    tabBtns.forEach(btn => {
      btn.addEventListener("click", async () => {
        const name = btn.dataset.tab;
        showPanel(name);

        // Load ONLY the active tab (fast)
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
        topTypeBtns.forEach(b => b.setAttribute("aria-selected", b === btn ? "true" : "false"));
        await loadTop();
      });
    });

    topPeriodBtns.forEach(btn => {
      btn.addEventListener("click", async () => {
        state.topPeriod = btn.dataset.topPeriod;
        topPeriodBtns.forEach(b => b.setAttribute("aria-selected", b === btn ? "true" : "false"));
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

  async function boot() {
    wireTabs();
    wireTopControls();
    wirePullToRefresh();

    showPanel("now");
    await loadNow();
    startNowPolling();
  }

  boot();
})();