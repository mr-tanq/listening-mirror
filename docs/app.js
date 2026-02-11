/* Listening Mirror — app.js (FULL REPLACE)
   - LIVE badge replaces Updated
   - Full-page ambient artwork (body background)
   - FIX: right column always present + stable alignment
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

  const state = {
    activeTab: "now",
    topType: "tracks",
    topPeriod: "today",
    online: false,
    nowTimer: null,
  };

  function absApi(urlOrPath) {
    if (!urlOrPath) return "";
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
    if (urlOrPath.startsWith("/")) return API_BASE + urlOrPath; // /img?u=...
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
    if (!el) return;
    el.textContent = (v && String(v).trim().length) ? String(v) : fallback;
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

  // ✅ Full-page ambient controls
  function setPageAmbient(imageUrl) {
    if (imageUrl) {
      document.documentElement.style.setProperty("--page-ambient-url", `url("${imageUrl}")`);
      document.body.classList.add("pageOn");
    } else {
      document.documentElement.style.setProperty("--page-ambient-url", "none");
      document.body.classList.remove("pageOn");
    }
  }

  // ✅ Row builder (forces right column)
  function rowHTML({ idx, title, sub, img, right, rightClass = "" }) {
    const imgHtml = img
      ? `<img src="${img}" alt="" loading="lazy" decoding="async" />`
      : `<div class="thumbFallback">♪</div>`;

    const rTxt = (right === null || right === undefined) ? "" : String(right);

    return `
      <div class="row" role="listitem" aria-label="${idx}. ${title}">
        <div class="thumb" aria-hidden="true">${imgHtml}</div>
        <div class="mid">
          <div class="title">${escapeHtml(`${idx}. ${title}`)}</div>
          <div class="sub">${escapeHtml(sub || "")}</div>
        </div>
        <div class="right ${escapeHtml(rightClass)}">${escapeHtml(rTxt)}</div>
      </div>
    `;
  }

  // -------- NOW --------
  function setNowVisual({ live, item }) {
    if (nowBadge) nowBadge.classList.toggle("live", !!live);
    if (nowBadgeText) nowBadgeText.textContent = live ? "LIVE" : "OFF";

    if (!item) {
      setPageAmbient("");

      if (nowCoverWrap) nowCoverWrap.style.removeProperty("--cover-url");

      if (nowImg) {
        nowImg.style.display = "none";
        nowImg.removeAttribute("src");
      }
      if (nowFallback) nowFallback.style.display = "grid";

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
    const track = item.name || "—";
    const artist = item.artist || "—";
    const album = item.album || "—";

    safeText(nowTrack, track);
    safeText(nowArtist, artist);
    safeText(nowAlbum, album);
    safeText(nowMsg, "", "");

    if (img) {
      if (nowImg) {
        nowImg.src = img;
        nowImg.style.display = "block";
      }
      if (nowFallback) nowFallback.style.display = "none";
      if (nowCoverWrap) nowCoverWrap.style.setProperty("--cover-url", `url("${img}")`);
      setPageAmbient(img);
    } else {
      setPageAmbient("");
      if (nowImg) {
        nowImg.style.display = "none";
        nowImg.removeAttribute("src");
      }
      if (nowFallback) nowFallback.style.display = "grid";
      if (nowCoverWrap) nowCoverWrap.style.removeProperty("--cover-url");
    }

    enableMarqueeIfNeeded(nowTrackWrap, nowTrack);
    enableMarqueeIfNeeded(nowArtistWrap, nowArtist);
    enableMarqueeIfNeeded(nowAlbumWrap, nowAlbum);
  }

  async function loadNow() {
    try {
      const j = await apiGet("/api/now");
      setOnline(true);

      const item = j?.ok ? (j.item || null) : null;
      const live = !!item;

      setNowVisual({ live, item });
      return true;
    } catch (e) {
      setOnline(false);
      setNowVisual({ live: false, item: null });
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
    topList.innerHTML = `<div class="row"><div class="mid"><div class="title">Loading…</div><div class="sub">Fetching your top…</div></div><div class="right"></div></div>`;
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
        topList.innerHTML = `<div class="row"><div class="mid"><div class="title">No data</div><div class="sub">Try another period.</div></div><div class="right"></div></div>`;
        return true;
      }

      topList.innerHTML = items.map((it, i) => {
        const title = it.name || "—";
        const sub = type === "artists" ? "" : (it.artist || "");
        const img = absApi(it.image || "");
        const right = it.playcount ?? "";
        return rowHTML({ idx: i + 1, title, sub, img, right, rightClass: "count" });
      }).join("");

      return true;
    } catch (e) {
      setOnline(false);
      topList.innerHTML = `<div class="row"><div class="mid"><div class="title">Couldn’t load Top.</div><div class="sub">Check connection / Worker.</div></div><div class="right"></div></div>`;
      return false;
    }
  }

  // -------- RECENT --------
  function setRecentLoading() {
    recentList.innerHTML = `<div class="row"><div class="mid"><div class="title">Loading…</div><div class="sub">Fetching recent…</div></div><div class="right"></div></div>`;
  }

  async function loadRecent() {
    try {
      setRecentLoading();
      const limit = RECENT_LIMIT_DEFAULT;

      const j = await apiGet(`/api/history?limit=${limit}`);
      setOnline(true);

      const items =
        (j?.ok && Array.isArray(j.items) && j.items) ||
        (j?.ok && Array.isArray(j.history) && j.history) ||
        [];

      if (!items.length) {
        recentList.innerHTML = `<div class="row"><div class="mid"><div class="title">No recent tracks</div><div class="sub">Play something and refresh.</div></div><div class="right"></div></div>`;
        return true;
      }

      recentList.innerHTML = items.map((it, i) => {
        const title = it.name || "—";
        const sub = `${it.artist || ""}${it.album ? " • " + it.album : ""}`.trim();
        const img = absApi(it.image || "");
        const right = it.time || it.date || ""; // keep like before (optional)
        return rowHTML({ idx: i + 1, title, sub, img, right, rightClass: "" });
      }).join("");

      return true;
    } catch (e) {
      setOnline(false);
      recentList.innerHTML = `<div class="row"><div class="mid"><div class="title">Couldn’t load Recent.</div><div class="sub">Check connection / Worker.</div></div><div class="right"></div></div>`;
      return false;
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

  async function boot() {
    wireTabs();
    wireTopControls();

    showPanel("now");

    await loadNow();
    loadTop();
    loadRecent();

    startNowPolling();
  }

  boot();
})();