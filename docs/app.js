/* Listening Mirror UI (Premium idle Now) — Worker hardcoded: https://i.errtanq9.workers.dev */
(() => {
  "use strict";

  const WORKER_BASE = "https://i.errtanq9.workers.dev"; // no trailing slash

  const el = (sel) => document.querySelector(sel);
  const els = (sel) => Array.from(document.querySelectorAll(sel));

  // Header
  const statusLine = el("#statusLine");
  const statusDot = el("#statusDot");

  // Tabs
  const panels = els(".panel");
  const tabBtns = els(".tabBtn");

  // Now
  const nowCard = el("#nowCard");
  const nowBadge = el("#nowBadge");
  const nowBadgeText = el("#nowBadgeText");
  const nowAmbient = el("#nowAmbient");
  const nowCoverWrap = el("#nowCoverWrap");
  const nowImg = el("#nowImg");
  const nowFallback = el("#nowFallback");

  const nowText = el("#nowText");
  const nowTrackWrap = el("#nowTrackWrap");
  const nowArtistWrap = el("#nowArtistWrap");
  const nowAlbumWrap = el("#nowAlbumWrap");
  const nowTrack = el("#nowTrack");
  const nowArtist = el("#nowArtist");
  const nowAlbum = el("#nowAlbum");

  // Top
  const topList = el("#topList");
  const topTypeBtns = els("[data-top-type]");
  const topPeriodBtns = els("[data-top-period]");

  // Recent
  const recentList = el("#recentList");

  let currentTab = "now";
  let topType = "tracks";   // tracks | artists | albums
  let topPeriod = "today";  // today | week | year
  let topLimit = 10;

  // ---------------------------
  // Helpers
  // ---------------------------
  function setSelected(btns, predicate) {
    btns.forEach((b) => b.setAttribute("aria-selected", predicate(b) ? "true" : "false"));
  }

  function showTab(tab) {
    currentTab = tab;
    setSelected(tabBtns, (b) => b.dataset.tab === tab);

    panels.forEach((p) => {
      const isThis = p.dataset.panel === tab;
      p.classList.toggle("hidden", !isThis);
    });

    if (tab === "now") refreshNow();
    if (tab === "top") refreshTop();
    if (tab === "recent") refreshRecent();
  }

  // Worker returns images as "/img?u=..."
  function resolveImageUrl(u) {
    if (!u) return "";
    const s = String(u);
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    if (s.startsWith("/")) return WORKER_BASE + s;
    return s;
  }

  async function safeFetchJson(path) {
    const url = WORKER_BASE + path;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);

    try {
      const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      const text = await r.text();

      if (!r.ok || ct.includes("text/html") || text.trim().startsWith("<!DOCTYPE")) {
        const msg = !r.ok ? `HTTP ${r.status}` : "HTML returned";
        throw new Error(msg);
      }

      let j = null;
      try { j = JSON.parse(text); } catch { j = null; }
      if (!j) throw new Error("Bad JSON");
      return j;
    } finally {
      clearTimeout(t);
    }
  }

  function setOnline(on) {
    if (statusLine) statusLine.textContent = on ? "Online" : "Offline";
    if (statusDot) statusDot.classList.toggle("on", !!on);
  }
// ---------------------------
  // Marquee logic (per element)
  // ---------------------------
  function applyMarquee(wrapEl, textEl) {
    if (!wrapEl || !textEl) return;

    // reset
    wrapEl.classList.remove("marqOn");
    wrapEl.style.removeProperty("--marqShift");
    wrapEl.style.removeProperty("--marqDur");

    const text = (textEl.textContent || "").trim();
    if (!text) return;

    // Need layout after text applied
    requestAnimationFrame(() => {
      const wrapW = wrapEl.clientWidth;
      const textW = textEl.scrollWidth;

      if (textW <= wrapW + 6) return; // fits

      const shift = Math.max(40, textW - wrapW + 26);
      const dur = Math.min(16, Math.max(7, shift / 18)); // premium pace

      wrapEl.style.setProperty("--marqShift", `${shift}px`);
      wrapEl.style.setProperty("--marqDur", `${dur}s`);
      wrapEl.classList.add("marqOn");
    });
  }

  // ---------------------------
  // Now UI states
  // ---------------------------
  function setIdleState(isIdle) {
    if (!nowCard) return;
    nowCard.classList.toggle("idle", !!isIdle);

    // LIVE chip
    if (nowBadge) nowBadge.style.display = isIdle ? "none" : "inline-flex";

    // Text visibility (Option B: hide all text when idle)
    if (nowText) nowText.style.opacity = isIdle ? "0" : "1";
    if (nowText) nowText.style.pointerEvents = isIdle ? "none" : "auto";
  }

  function setNowCover(imgUrl) {
    const u = resolveImageUrl(imgUrl);
    if (u) {
      nowImg.src = u;
      nowImg.style.display = "block";
      if (nowFallback) nowFallback.style.display = "none";

      // premium ambient
      if (nowCoverWrap) nowCoverWrap.style.setProperty("--cover-url", `url("${u}")`);
      if (nowAmbient) {
        nowAmbient.style.setProperty("--ambient-url", `url("${u}")`);
        nowAmbient.classList.add("on");
      }
    } else {
      // no cover
      nowImg.removeAttribute("src");
      nowImg.style.display = "none";
      if (nowFallback) nowFallback.style.display = "none";
      if (nowCoverWrap) nowCoverWrap.style.removeProperty("--cover-url");
      if (nowAmbient) nowAmbient.classList.remove("on");
    }
  }

  async function refreshNow() {
    // Always ask worker. If item:null => premium idle.
    try {
      const j = await safeFetchJson("/api/now");
      const item = j?.item;

      if (!item) {
        // Option B: abstract idle (no text, no last played)
        setIdleState(true);
        setNowCover(""); // also disables ambient
        // ensure marquee reset
        nowTrack.textContent = "";
        nowArtist.textContent = "";
        nowAlbum.textContent = "";
        applyMarquee(nowTrackWrap, nowTrack);
        applyMarquee(nowArtistWrap, nowArtist);
        applyMarquee(nowAlbumWrap, nowAlbum);
        return;
      }

      setIdleState(false);
      if (nowBadgeText) nowBadgeText.textContent = "LIVE";

      nowTrack.textContent = item.name || "";
      nowArtist.textContent = item.artist || "";
      nowAlbum.textContent = item.album || "";

      setNowCover(item.image || "");

      applyMarquee(nowTrackWrap, nowTrack);
      applyMarquee(nowArtistWrap, nowArtist);
      applyMarquee(nowAlbumWrap, nowAlbum);
    } catch {
      // On error: do NOT show messages. Just go idle.
      setIdleState(true);
      setNowCover("");
      nowTrack.textContent = "";
      nowArtist.textContent = "";
      nowAlbum.textContent = "";
    }
  }

  // ---------------------------
  // Row builder (Top/Recent)
  // ---------------------------
  function rowItem({ idx, title, subtitle, right, imageUrl }) {
    const wrap = document.createElement("div");
    wrap.className = "row";

    const thumb = document.createElement("div");
    thumb.className = "thumb";

    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";

    const icon = document.createElement("div");
    icon.className = "thumbFallback";
    icon.textContent = "♪";

    const u = resolveImageUrl(imageUrl);
    if (u) {
      img.src = u;
      thumb.appendChild(img);
      thumb.appendChild(icon);
      icon.style.display = "none";
      img.addEventListener("error", () => {
        img.removeAttribute("src");
        icon.style.display = "grid";
      });
    } else {
      thumb.appendChild(icon);
    }

    const mid = document.createElement("div");
    mid.className = "mid";

    const t = document.createElement("div");
    t.className = "title";
    t.textContent = `${idx}. ${title}`;

    const s = document.createElement("div");
    s.className = "sub";
    s.textContent = subtitle || "";

    mid.appendChild(t);
    mid.appendChild(s);

    const r = document.createElement("div");
    r.className = "right";
    if (right != null && right !== "") {
      r.classList.add("count");
      r.textContent = String(right);
    } else {
      r.textContent = "";
    }

    wrap.appendChild(thumb);
    wrap.appendChild(mid);
    wrap.appendChild(r);

    // Marquee for list rows — apply to title/sub if overflow
    const titleWrap = document.createElement("div");
    titleWrap.className = "marqWrap";
    titleWrap.style.paddingLeft = "0";
    titleWrap.style.webkitMaskImage = "linear-gradient(90deg, #000 0%, #000 86%, transparent 100%)";
    titleWrap.style.maskImage = "linear-gradient(90deg, #000 0%, #000 86%, transparent 100%)";

    const titleSpan = document.createElement("span");
    titleSpan.className = "marq";
    titleSpan.textContent = t.textContent;

    titleWrap.appendChild(titleSpan);
    mid.replaceChild(titleWrap, t);

    const subWrap = document.createElement("div");
    subWrap.className = "marqWrap";
    subWrap.style.marginTop = "6px";
    subWrap.style.paddingLeft = "0";
    subWrap.style.webkitMaskImage = "linear-gradient(90deg, #000 0%, #000 86%, transparent 100%)";
    subWrap.style.maskImage = "linear-gradient(90deg, #000 0%, #000 86%, transparent 100%)";

    const subSpan = document.createElement("span");
    subSpan.className = "marq";
    subSpan.textContent = s.textContent;

    subWrap.appendChild(subSpan);
    mid.replaceChild(subWrap, s);

    // run marquee if needed after layout
    requestAnimationFrame(() => {
      applyMarquee(titleWrap, titleSpan);
      applyMarquee(subWrap, subSpan);
    });

    return wrap;
  }
// ---------------------------
  // Ping / Top / Recent
  // ---------------------------
  async function refreshPing() {
    try {
      const j = await safeFetchJson("/api/ping");
      setOnline(!!j?.ok);
    } catch {
      setOnline(false);
    }
  }

  async function refreshTop() {
    topList.innerHTML = "";

    const path = `/api/top?type=${encodeURIComponent(topType)}&period=${encodeURIComponent(topPeriod)}&limit=${encodeURIComponent(topLimit)}`;

    try {
      const j = await safeFetchJson(path);
      const items = j?.items || [];

      items.forEach((it, i) => {
        if (topType === "artists") {
          topList.appendChild(
            rowItem({
              idx: i + 1,
              title: it.name || "—",
              subtitle: "",
              right: it.playcount ?? "",
              imageUrl: it.image || ""
            })
          );
        } else if (topType === "albums") {
          topList.appendChild(
            rowItem({
              idx: i + 1,
              title: it.name || "—",
              subtitle: it.artist || "",
              right: it.playcount ?? "",
              imageUrl: it.image || ""
            })
          );
        } else {
          topList.appendChild(
            rowItem({
              idx: i + 1,
              title: it.name || "—",
              subtitle: it.artist || "",
              right: it.playcount ?? "",
              imageUrl: it.image || ""
            })
          );
        }
      });
    } catch {
      // silent fail — keep premium UI clean
      topList.innerHTML = "";
    }
  }

  async function refreshRecent() {
    recentList.innerHTML = "";
    try {
      const j = await safeFetchJson("/api/history?limit=10");
      const items = j?.items || [];

      items.forEach((it, i) => {
        recentList.appendChild(
          rowItem({
            idx: i + 1,
            title: it.name || "—",
            subtitle: it.artist || "",
            right: "",
            imageUrl: it.image || ""
          })
        );
      });
    } catch {
      // silent fail
      recentList.innerHTML = "";
    }
  }

  // ---------------------------
  // Init / Wire UI
  // ---------------------------
  function init() {
    tabBtns.forEach((b) => {
      b.addEventListener("click", () => showTab(b.dataset.tab));
    });

    topTypeBtns.forEach((b) => {
      b.addEventListener("click", () => {
        topType = String(b.dataset.topType || "tracks");
        setSelected(topTypeBtns, (x) => x === b);
        refreshTop();
      });
    });

    topPeriodBtns.forEach((b) => {
      b.addEventListener("click", () => {
        topPeriod = String(b.dataset.topPeriod || "today");
        setSelected(topPeriodBtns, (x) => x === b);
        refreshTop();
      });
    });

    // initial selected states
    setSelected(tabBtns, (b) => b.dataset.tab === "now");
    setSelected(topTypeBtns, (b) => (b.dataset.topType || "") === "tracks");
    setSelected(topPeriodBtns, (b) => (b.dataset.topPeriod || "") === "today");

    // boot
    refreshPing();
    showTab("now");

    // auto refresh ping + now (lightweight)
    setInterval(refreshPing, 15000);
    setInterval(() => {
      if (currentTab === "now") refreshNow();
    }, 15000);
  }

  init();
})();