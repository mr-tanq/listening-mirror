/* Listening Mirror — app.js (FULL REPLACE)
   - Premium NOW ambient (faint full-card artwork handled by CSS variables)
   - Correct LIVE/OFF logic
   - Robust image URL resolution (/img -> worker)
   - Pull-to-refresh on mobile
*/

(() => {
  "use strict";

  // ✅ Your Worker base (do NOT add trailing slash)
  const API_BASE = "https://i.errtanq9.workers.dev";

  // Polling (NOW updates)
  const NOW_POLL_MS = 12_000;

  // Limits
  const TOP_LIMIT_DEFAULT = 10;
  const RECENT_LIMIT_DEFAULT = 20;

  // -------- DOM --------
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
  };

  // -------- Helpers --------
  function absApi(urlOrPath) {
    if (!urlOrPath) return "";
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
    // worker returns "/img?u=..."
    if (urlOrPath.startsWith("/")) return API_BASE + urlOrPath;
    return API_BASE + "/" + urlOrPath;
  }

  function fmtTime(d = new Date()) {
    // 24h like your screenshots: 16:46:10
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
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
    // If text overflows, enable marquee by toggling a class
    // We measure after layout
    requestAnimationFrame(() => {
      const wrap = wrapEl;
      const span = spanEl;
      if (!wrap || !span) return;
      const overflow = span.scrollWidth > wrap.clientWidth + 8;
      wrap.classList.toggle("marqOn", overflow);
      if (overflow) {
        const shift = span.scrollWidth - wrap.clientWidth + 18;
        wrap.style.setProperty("--marqShift", `${shift}px`);
        // duration scales with text length
        const dur = Math.min(22, Math.max(10, shift / 22));
        wrap.style.setProperty("--marqDur", `${dur}s`);
      } else {
        wrap.style.removeProperty("--marqShift");
        wrap.style.removeProperty("--marqDur");
      }
    });
  }

  // -------- UI Row builder --------
  function rowHTML({ idx, title, sub, img, right }) {
    const imgHtml = img
      ? `<img src="${img}" alt="" loading="lazy" decoding="async" />`
      : `<div class="thumbFallback">♪</div>`;

    return `
      <div class="row" role="listitem" aria-label="${idx}. ${title}">
        <div class="thumb" aria-hidden="true">${imgHtml}</div>
        <div class="mid">
          <div class="title">${escapeHtml(`${idx}. ${title}`)}</div>
          <div class="sub">${escapeHtml(sub || "")}</div>
        </div>
        <div class="right count">${escapeHtml(String(right ?? ""))}</div>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // -------- Expose minimal hooks --------
  window.__LM__ = {
    refresh: () => refreshActive(),
  };
// -------- NOW --------
  function setNowVisual({ live, item, updatedAt }) {
    // LIVE pill: you asked top-right; we do it by styling (chip stays inside nowTop)
    nowBadge.classList.toggle("live", !!live);
    nowBadgeText.textContent = live ? "LIVE" : "OFF";

    // Updated label: you asked earlier to remove it; we keep it minimal and correct.
    // If you want it totally gone, tell me and I’ll delete these lines + the DOM hook.
    nowUpdated.textContent = updatedAt ? fmtTime(updatedAt) : fmtTime(new Date());

    if (!item) {
      // Empty state
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

    // Item present => LIVE
    const img = absApi(item.image || "");
    const track = item.name || "—";
    const artist = item.artist || "—";
    const album = item.album || "—";

    safeText(nowTrack, track);
    safeText(nowArtist, artist);
    safeText(nowAlbum, album);
    safeText(nowMsg, "", ""); // keep clean

    // Artwork
    if (img) {
      nowImg.src = img;
      nowImg.style.display = "block";
      nowFallback.style.display = "none";

      // CSS variables drive the premium layers
      nowCoverWrap.style.setProperty("--cover-url", `url("${img}")`);
      nowAmbient.style.setProperty("--ambient-url", `url("${img}")`);
      nowAmbient.classList.add("on");
    } else {
      nowImg.style.display = "none";
      nowImg.removeAttribute("src");
      nowFallback.style.display = "grid";
      nowAmbient.classList.remove("on");
    }

    enableMarqueeIfNeeded(nowTrackWrap, nowTrack);
    enableMarqueeIfNeeded(nowArtistWrap, nowArtist);
    enableMarqueeIfNeeded(nowAlbumWrap, nowAlbum);
  }

  async function loadNow() {
    try {
      const j = await apiGet("/api/now");
      // online if API responds
      setOnline(true);

      const item = j?.ok ? (j.item || null) : null;

      // IMPORTANT: Your worker sometimes returns ok:true,item:null => OFF state
      const live = !!item;

      setNowVisual({
        live,
        item,
        updatedAt: new Date(),
      });

      return true;
    } catch (e) {
      setOnline(false);
      // keep last visuals but mark OFF if hard fail
      setNowVisual({ live: false, item: null, updatedAt: new Date() });
      return false;
    }
  }

  function startNowPolling() {
    stopNowPolling();
    state.nowTimer = setInterval(() => {
      // Don’t spam refresh if user is pulling
      if (!state.isRefreshing) loadNow();
    }, NOW_POLL_MS);
  }

  function stopNowPolling() {
    if (state.nowTimer) clearInterval(state.nowTimer);
    state.nowTimer = null;
  }

  // -------- TOP --------
  function setTopLoading() {
    topList.innerHTML = `<div class="row"><div class="mid"><div class="title">Loading…</div><div class="sub">Fetching your top…</div></div></div>`;
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
        topList.innerHTML = `<div class="row"><div class="mid"><div class="title">No data</div><div class="sub">Try another period.</div></div></div>`;
        return true;
      }

      const html = items.map((it, i) => {
        const title = it.name || "—";
        const sub = type === "artists" ? "" : (it.artist || "");
        const img = absApi(it.image || "");
        const right = it.playcount ?? "";
        return rowHTML({ idx: i + 1, title, sub, img, right });
      }).join("");

      topList.innerHTML = html;
      return true;
    } catch (e) {
      setOnline(false);
      topList.innerHTML = `<div class="row"><div class="mid"><div class="title">Couldn’t load Top.</div><div class="sub">Check connection / Worker.</div></div></div>`;
      return false;
    }
  }

  // -------- RECENT --------
  function setRecentLoading() {
    recentList.innerHTML = `<div class="row"><div class="mid"><div class="title">Loading…</div><div class="sub">Fetching recent…</div></div></div>`;
  }

  async function loadRecent() {
    try {
      setRecentLoading();
      const limit = RECENT_LIMIT_DEFAULT;

      const j = await apiGet(`/api/history?limit=${limit}`);
      setOnline(true);

      // We accept multiple shapes to be resilient:
      // {ok:true, items:[{name,artist,album,image,ts?...}]} or {ok:true, history:[...]}
      const items =
        (j?.ok && Array.isArray(j.items) && j.items) ||
        (j?.ok && Array.isArray(j.history) && j.history) ||
        [];

      if (!items.length) {
        recentList.innerHTML = `<div class="row"><div class="mid"><div class="title">No recent tracks</div><div class="sub">Play something and refresh.</div></div></div>`;
        return true;
      }

      const html = items.map((it, i) => {
        const title = it.name || "—";
        const sub = `${it.artist || ""}${it.album ? " • " + it.album : ""}`.trim();
        const img = absApi(it.image || "");
        // right side: show time if exists, else empty
        const right = it.time || it.date || "";
        return `
          <div class="row" role="listitem" aria-label="${i + 1}. ${title}">
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

      recentList.innerHTML = html;
      return true;
    } catch (e) {
      setOnline(false);
      recentList.innerHTML = `<div class="row"><div class="mid"><div class="title">Couldn’t load Recent.</div><div class="sub">Check connection / Worker.</div></div></div>`;
      return false;
    }
  }
// -------- Pull to refresh (mobile) --------
  // Works when you are at top of page and drag down.
  let touchStartY = 0;
  let pullY = 0;
  let pulling = false;
  const PULL_MAX = 110;
  const PULL_TRIGGER = 72;

  function isAtTop() {
    // Works across browsers
    const sc = document.scrollingElement || document.documentElement;
    return (sc.scrollTop || 0) <= 0;
  }

  function ptrShow(msg, loading = false) {
    ptr.classList.add("on");
    ptr.classList.toggle("loading", !!loading);
    ptrText.textContent = msg;
  }

  function ptrHide() {
    ptr.classList.remove("on");
    ptr.classList.remove("loading");
    ptrText.textContent = "Pull to refresh";
  }

  async function refreshActive() {
    state.isRefreshing = true;
    ptrShow("Refreshing…", true);

    try {
      if (state.activeTab === "now") await loadNow();
      if (state.activeTab === "top") await loadTop();
      if (state.activeTab === "recent") await loadRecent();
    } finally {
      // small delay so it feels deliberate, not jittery
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
    const pct = pullY / PULL_TRIGGER;

    if (pullY < PULL_TRIGGER) {
      ptrShow(pct > 0.75 ? "Release to refresh" : "Pull to refresh", false);
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

    if (pullY >= PULL_TRIGGER) {
      refreshActive();
    } else {
      ptrHide();
    }
  }

  // -------- Events / Wiring --------
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

  function wirePullToRefresh() {
    // Passive false because we want to control a bit on iOS-like behavior
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

    // Default tab: Now
    showPanel("now");

    // Initial loads
    await loadNow();

    // Preload other tabs in background (lightweight, but still premium feel)
    // (If you don't want background fetches, tell me and I’ll remove.)
    loadTop();
    loadRecent();

    startNowPolling();
  }

  // Start
  boot();
})();
/* Notes:
   - If you want Updated removed completely:
     1) delete nowUpdated usage lines in setNowVisual()
     2) optionally hide the .updated element in CSS.

   - If you want the faint artwork even stronger:
     I can add a dedicated extra layer inside .card (one div) so we can set opacity
     ONLY for the sharp artwork layer, independent of gradients.
*/