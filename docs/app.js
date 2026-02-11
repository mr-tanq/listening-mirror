/* Listening Mirror — app.js (FULL REPLACE, compatible with your “old good” index)
   ✅ Works with your exact IDs/classes
   ✅ Fixes NOW live/off logic (ok:true,item:null => OFF)
   ✅ Fixes slow loads (no background prefetch, no caching, timeout, abort)
   ✅ Fixes “wrong recent” by supporting optional ?user= / ?u= in the URL
   ✅ Robust image resolving (/img?u=... => Worker absolute)
   ✅ Pull-to-refresh (mobile) without editing index
*/

(() => {
  "use strict";

  // Worker base (NO trailing slash)
  const API_BASE = "https://i.errtanq9.workers.dev";

  // Poll NOW
  const NOW_POLL_MS = 12_000;

  // Limits
  const TOP_LIMIT = 10;
  const RECENT_LIMIT = 25;

  // Request timeout
  const REQ_TIMEOUT_MS = 8_000;

  // -------- DOM helpers --------
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $ = (sel, root = document) => root.querySelector(sel);

  // Status
  const statusDot = $("#statusDot");
  const statusLine = $("#statusLine");

  // Tabs/panels
  const tabBtns = $$(".tabBtn");
  const panels = $$(".panel");

  // NOW elements (must exist in your index)
  const nowAmbient = $("#nowAmbient");
  const nowBadge = $("#nowBadge");
  const nowBadgeText = $("#nowBadgeText");
  const nowUpdated = $("#nowUpdated");
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

  // -------- URL params (fixes “wrong user” cases) --------
  const qs = new URLSearchParams(location.search);
  const USER = (qs.get("user") || qs.get("u") || "").trim(); // optional
  // cache buster (you already use ?v=777 sometimes)
  const V = (qs.get("v") || "").trim();

  // -------- State --------
  const state = {
    activeTab: "now",
    topType: "tracks",
    topPeriod: "today",
    online: false,
    nowTimer: null,
    isRefreshing: false,
  };

  // -------- Small utilities --------
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

  function fmtTime(d = new Date()) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function safeText(el, v, fallback = "—") {
    if (!el) return;
    const s = (v == null ? "" : String(v)).trim();
    el.textContent = s.length ? s : fallback;
  }

  function setSelected(btns, activeBtn) {
    btns.forEach(b => b.setAttribute("aria-selected", b === activeBtn ? "true" : "false"));
  }

  function showPanel(name) {
    state.activeTab = name;
    tabBtns.forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name ? "true" : "false"));
    panels.forEach(p => p.classList.toggle("hidden", p.dataset.panel !== name));
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function enableMarqueeIfNeeded(wrapEl, spanEl) {
    requestAnimationFrame(() => {
      if (!wrapEl || !spanEl) return;
      const overflow = spanEl.scrollWidth > wrapEl.clientWidth + 8;
      wrapEl.classList.toggle("marqOn", overflow);
      if (overflow) {
        const shift = Math.max(18, spanEl.scrollWidth - wrapEl.clientWidth + 18);
        wrapEl.style.setProperty("--marqShift", `${shift}px`);
        const dur = Math.min(22, Math.max(10, shift / 22));
        wrapEl.style.setProperty("--marqDur", `${dur}s`);
      } else {
        wrapEl.style.removeProperty("--marqShift");
        wrapEl.style.removeProperty("--marqDur");
      }
    });
  }

  // -------- Networking (fast + no-cache + timeout) --------
  async function apiGet(path, params = {}) {
    const p = new URLSearchParams();

    // include optional user if present (fixes “wrong recent” when backend supports it)
    if (USER) p.set("user", USER);

    // include optional version cache-buster
    if (V) p.set("v", V);

    // custom params
    Object.entries(params).forEach(([k, v]) => {
      if (v == null) return;
      p.set(k, String(v));
    });

    const url = absApi(path) + (p.toString() ? `?${p.toString()}` : "");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);

    try {
      const r = await fetch(url, {
        cache: "no-store",
        signal: ctrl.signal,
        headers: { "accept": "application/json" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  // -------- NOW rendering --------
  function setBadgeLive(isLive) {
    if (!nowBadge || !nowBadgeText) return;
    nowBadge.classList.toggle("live", !!isLive);
    nowBadgeText.textContent = isLive ? "LIVE" : "OFF";
  }

  function clearNowVisual(msg = "Not playing now") {
    setBadgeLive(false);

    if (nowUpdated) nowUpdated.textContent = fmtTime(new Date());

    if (nowAmbient) {
      nowAmbient.classList.remove("on");
      nowAmbient.style.removeProperty("--ambient-url");
    }
    if (nowCoverWrap) nowCoverWrap.style.removeProperty("--cover-url");

    if (nowImg) {
      nowImg.style.display = "none";
      nowImg.removeAttribute("src");
    }
    if (nowFallback) nowFallback.style.display = "grid";

    safeText(nowTrack, "—");
    safeText(nowArtist, "—");
    safeText(nowAlbum, "—");
    safeText(nowMsg, msg, msg);

    enableMarqueeIfNeeded(nowTrackWrap, nowTrack);
    enableMarqueeIfNeeded(nowArtistWrap, nowArtist);
    enableMarqueeIfNeeded(nowAlbumWrap, nowAlbum);
  }

  function applyNowItem(item) {
    // item shape expected:
    // { name, artist, album, image } (image may be "/img?u=..." or absolute)
    setBadgeLive(true);

    if (nowUpdated) nowUpdated.textContent = fmtTime(new Date());

    const track = item?.name || "—";
    const artist = item?.artist || "—";
    const album = item?.album || "—";
    const imgUrl = absApi(item?.image || "");

    safeText(nowTrack, track);
    safeText(nowArtist, artist);
    safeText(nowAlbum, album);
    safeText(nowMsg, "", ""); // keep clean if playing

    // Image handling: show only when loaded
    if (imgUrl) {
      if (nowFallback) nowFallback.style.display = "none";

      if (nowImg) {
        nowImg.onload = () => {
          nowImg.style.display = "block";
        };
        nowImg.onerror = () => {
          // fallback if broken image
          nowImg.style.display = "none";
          nowImg.removeAttribute("src");
          if (nowFallback) nowFallback.style.display = "grid";
          if (nowAmbient) nowAmbient.classList.remove("on");
        };
        nowImg.src = imgUrl;
      }

      // Ambient + cover glow via CSS vars
      if (nowCoverWrap) nowCoverWrap.style.setProperty("--cover-url", `url("${imgUrl}")`);
      if (nowAmbient) {
        nowAmbient.style.setProperty("--ambient-url", `url("${imgUrl}")`);
        nowAmbient.classList.add("on");
      }
    } else {
      if (nowImg) {
        nowImg.style.display = "none";
        nowImg.removeAttribute("src");
      }
      if (nowFallback) nowFallback.style.display = "grid";
      if (nowAmbient) nowAmbient.classList.remove("on");
    }

    enableMarqueeIfNeeded(nowTrackWrap, nowTrack);
    enableMarqueeIfNeeded(nowArtistWrap, nowArtist);
    enableMarqueeIfNeeded(nowAlbumWrap, nowAlbum);
  }

  async function loadNow() {
    try {
      const j = await apiGet("/api/now");
      setOnline(true);

      const item = j && j.ok ? (j.item || null) : null;

      // Worker may return ok:true,item:null => OFF
      if (!item) {
        clearNowVisual("Not playing now");
        return true;
      }

      applyNowItem(item);
      return true;
    } catch (e) {
      setOnline(false);
      clearNowVisual("Offline / can’t reach Worker");
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

  // -------- TOP rendering --------
  function setTopLoading() {
    if (!topList) return;
    topList.innerHTML = `
      <div class="row">
        <div class="mid">
          <div class="title">Loading…</div>
          <div class="sub">Fetching top…</div>
        </div>
      </div>
    `;
  }

  async function loadTop() {
    if (!topList) return false;

    try {
      setTopLoading();

      const j = await apiGet("/api/top", {
        type: state.topType,
        period: state.topPeriod,
        limit: TOP_LIMIT,
      });

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
        const title = it?.name || "—";
        const sub = state.topType === "artists" ? "" : (it?.artist || "");
        const img = absApi(it?.image || "");
        const right = (it?.playcount ?? "");
        return `
          <div class="row" role="listitem" aria-label="${i + 1}. ${escapeHtml(title)}">
            <div class="thumb" aria-hidden="true">
              ${img ? `<img src="${img}" alt="" loading="lazy" decoding="async" />` : `<div class="thumbFallback">♪</div>`}
            </div>
            <div class="mid">
              <div class="title">${escapeHtml(`${i + 1}. ${title}`)}</div>
              <div class="sub">${escapeHtml(sub)}</div>
            </div>
            <div class="right count">${escapeHtml(String(right))}</div>
          </div>
        `;
      }).join("");

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

  // -------- RECENT rendering (robust shapes + endpoint fallback) --------
  function setRecentLoading() {
    if (!recentList) return;
    recentList.innerHTML = `
      <div class="row">
        <div class="mid">
          <div class="title">Loading…</div>
          <div class="sub">Fetching recent…</div>
        </div>
      </div>
    `;
  }

  function normalizeRecentResponse(j) {
    if (!j || !j.ok) return [];
    if (Array.isArray(j.items)) return j.items;
    if (Array.isArray(j.history)) return j.history;
    if (Array.isArray(j.recent)) return j.recent;
    return [];
  }

  async function loadRecent() {
    if (!recentList) return false;

    setRecentLoading();

    try {
      // Primary endpoint
      let j = await apiGet("/api/history", { limit: RECENT_LIMIT });

      let items = normalizeRecentResponse(j);

      // Fallback endpoint if history shape is empty
      if (!items.length) {
        try {
          j = await apiGet("/api/recent", { limit: RECENT_LIMIT });
          items = normalizeRecentResponse(j);
        } catch (_) {}
      }

      setOnline(true);

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

      // Render
      recentList.innerHTML = items.map((it, i) => {
        const title = it?.name || "—";
        const artist = it?.artist || "";
        const album = it?.album || "";
        const sub = `${artist}${album ? " • " + album : ""}`.trim();

        const img = absApi(it?.image || "");

        // right side: try common time fields (optional)
        const right = it?.time || it?.date || it?.ts || "";

        return `
          <div class="row" role="listitem" aria-label="${i + 1}. ${escapeHtml(title)}">
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
            <div class="sub">Check connection / Worker.</div>
          </div>
        </div>
      `;
      return false;
    }
  }

  // -------- Pull-to-refresh (no index edits; injects tiny UI) --------
  const ptr = document.createElement("div");
  ptr.style.cssText = `
    position:fixed; left:50%; top:calc(env(safe-area-inset-top) + 10px);
    transform:translate(-50%,-24px);
    opacity:0; pointer-events:none; z-index:9999;
    transition:transform .18s ease, opacity .18s ease;
  `;
  ptr.innerHTML = `
    <div style="
      display:inline-flex; align-items:center; gap:10px;
      padding:8px 12px; border-radius:999px;
      background:rgba(255,255,255,.05);
      outline:1px solid rgba(255,255,255,.09);
      backdrop-filter:blur(12px);
      color:rgba(255,255,255,.82);
      font-size:12px; letter-spacing:.2px;
      box-shadow:0 18px 55px rgba(0,0,0,.45);
    ">
      <span style="width:6px;height:6px;border-radius:999px;background:rgba(255,255,255,.22)"></span>
      <span id="__ptrText">Pull to refresh</span>
      <span id="__ptrSpin" aria-hidden="true" style="
        width:14px;height:14px;border-radius:999px;
        border:2px solid rgba(255,255,255,.22);
        border-top-color:rgba(255,255,255,.72);
        display:none;
        animation:__ptrSpin 0.9s linear infinite;
      "></span>
    </div>
  `;
  document.body.appendChild(ptr);

  const style = document.createElement("style");
  style.textContent = `@keyframes __ptrSpin{to{transform:rotate(360deg)}}`;
  document.head.appendChild(style);

  const ptrText = $("#__ptrText");
  const ptrSpin = $("#__ptrSpin");

  function ptrShow(msg, loading = false) {
    ptr.style.opacity = "1";
    ptr.style.transform = "translate(-50%,0px)";
    if (ptrText) ptrText.textContent = msg;
    if (ptrSpin) ptrSpin.style.display = loading ? "inline-block" : "none";
  }

  function ptrHide() {
    ptr.style.opacity = "0";
    ptr.style.transform = "translate(-50%,-24px)";
    if (ptrText) ptrText.textContent = "Pull to refresh";
    if (ptrSpin) ptrSpin.style.display = "none";
  }

  function isAtTop() {
    const sc = document.scrollingElement || document.documentElement;
    return (sc.scrollTop || 0) <= 0;
  }

  let touchStartY = 0;
  let pullY = 0;
  let pulling = false;
  const PULL_TRIGGER = 72;
  const PULL_MAX = 110;

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
    if (pullY < PULL_TRIGGER) ptrShow("Pull to refresh", false);
    else ptrShow("Release to refresh", false);
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

        // Load only when opened (fast)
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

    // Default tab: now
    showPanel("now");

    // Initial NOW load (fast)
    await loadNow();

    // Start polling only for NOW
    startNowPolling();
  }

  boot();
})();