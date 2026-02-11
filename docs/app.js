/* Listening Mirror UI (hardcoded Worker base)
   - No Settings (worker base is fixed)
   - Worker: https://i.errtanq9.workers.dev
*/
(() => {
  "use strict";

  const WORKER_BASE = "https://i.errtanq9.workers.dev"; // no trailing slash

  const el = (sel) => document.querySelector(sel);
  const els = (sel) => Array.from(document.querySelectorAll(sel));

  // Header
  const statusLine = el("#statusLine");
  const statusDot = el("#statusDot");
  const toast = el("#toast");

  // Tabs
  const panels = els(".panel");
  const tabBtns = els(".tabBtn");

  // Now Playing UI
  const nowUpdated = el("#nowUpdated");
  const nowBadge = el("#nowBadge");
  const nowImg = el("#nowImg");
  const nowFallback = el("#nowFallback");
  const nowTrack = el("#nowTrack");
  const nowArtist = el("#nowArtist");
  const nowAlbum = el("#nowAlbum");
  const nowMsg = el("#nowMsg");

  const nowTrackWrap = el("#nowTrackWrap");
  const nowArtistWrap = el("#nowArtistWrap");
  const nowAlbumWrap = el("#nowAlbumWrap");

  // Top UI
  const topMeta = el("#topMeta");
  const topBadge = el("#topBadge");
  const topList = el("#topList");
  const topTypeBtns = els("[data-top-type]");
  const topPeriodBtns = els("[data-top-period]");

  // Recent UI
  const recentMeta = el("#recentMeta");
  const recentList = el("#recentList");

  let currentTab = "now";
  let topType = "tracks";   // tracks | artists | albums
  let topPeriod = "today";  // today | week | year
  const topLimit = 10;      // forced to 10
  let online = false;

  // ---------------------------
  // Helpers
  // ---------------------------
  function vibrate(ms = 10) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch {}
  }

  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 1800);
  }

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

    // light haptic
    vibrate(8);

    if (tab === "now") refreshNow();
    if (tab === "top") refreshTop();
    if (tab === "recent") refreshRecent();
  }

  function fmtTime(ts = Date.now()) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "--";
    }
  }

  function setStatus(isOnline) {
    online = !!isOnline;

    if (statusLine) statusLine.textContent = online ? "Online" : "Offline • retrying";
    if (statusDot) {
      statusDot.classList.toggle("ok", online);
      statusDot.classList.toggle("bad", !online);
    }
    if (!online) showToast("Offline. Retrying…");
  }

  // IMPORTANT: Worker returns images like "/img?u=..."
  // We must turn that into "https://i.errtanq9.workers.dev/img?u=..."
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

      // If worker returns HTML (404 page etc.), show clean error
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

  // Spotify search (open on tap)
  function openSpotifySearch(query) {
    if (!query) return;
    const q = encodeURIComponent(query);
    const url = `https://open.spotify.com/search/${q}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }
// ---------------------------
  // Marquee: activate only when overflow happens
  // ---------------------------
  function applyMarquee(wrapperEl) {
    if (!wrapperEl) return;

    const inner = wrapperEl.querySelector(".marqueeInner");
    if (!inner) return;

    // reset
    wrapperEl.classList.remove("marqueeOn");
    wrapperEl.style.removeProperty("--marquee-shift");

    // measure after layout
    requestAnimationFrame(() => {
      const wrapW = wrapperEl.clientWidth;
      const innerW = inner.scrollWidth;

      // If no overflow, do nothing
      if (!wrapW || innerW <= wrapW + 2) return;

      // amount to travel (keep some slack)
      const shift = Math.max(0, innerW - wrapW + 18);
      wrapperEl.style.setProperty("--marquee-shift", `${shift}px`);
      wrapperEl.classList.add("marqueeOn");
    });
  }

  function applyMarqueeAll() {
    // rows
    els(".titleMarquee").forEach(applyMarquee);
    els(".subMarquee").forEach(applyMarquee);
  }

  // ---------------------------
  // Skeleton builders
  // ---------------------------
  function skeletonRow() {
    const wrap = document.createElement("div");
    wrap.className = "row";

    const cover = document.createElement("div");
    cover.className = "cover skeleton";

    const mid = document.createElement("div");
    mid.className = "mid";

    const t = document.createElement("div");
    t.className = "title skeleton";
    t.style.height = "18px";
    t.style.borderRadius = "10px";
    t.style.width = "86%";

    const s = document.createElement("div");
    s.className = "sub skeleton";
    s.style.height = "14px";
    s.style.borderRadius = "10px";
    s.style.width = "64%";
    s.style.marginTop = "10px";

    mid.appendChild(t);
    mid.appendChild(s);

    const r = document.createElement("div");
    r.className = "right skeleton";
    r.style.height = "18px";
    r.style.borderRadius = "10px";
    r.style.width = "38px";

    wrap.appendChild(cover);
    wrap.appendChild(mid);
    wrap.appendChild(r);

    return wrap;
  }

  function skeletonNow() {
    // Cover
    if (nowImg) nowImg.style.display = "none";
    if (nowFallback) {
      nowFallback.style.display = "grid";
      nowFallback.classList.add("skeleton");
      nowFallback.textContent = "";
    }

    // Text
    [nowTrack, nowArtist, nowAlbum].forEach((x) => {
      if (!x) return;
      x.classList.add("skeleton");
      x.textContent = "";
      x.style.height = x === nowTrack ? "24px" : "16px";
      x.style.borderRadius = "12px";
      x.style.display = "block";
      x.style.width = x === nowTrack ? "88%" : "62%";
      x.style.marginTop = x === nowTrack ? "0" : "10px";
    });

    if (nowMsg) {
      nowMsg.classList.add("skeleton");
      nowMsg.textContent = "";
      nowMsg.style.height = "14px";
      nowMsg.style.borderRadius = "10px";
      nowMsg.style.width = "48%";
      nowMsg.style.marginTop = "12px";
    }
  }

  function clearNowSkeleton() {
    if (nowFallback) {
      nowFallback.classList.remove("skeleton");
      nowFallback.textContent = "♪";
    }
    [nowTrack, nowArtist, nowAlbum, nowMsg].forEach((x) => {
      if (!x) return;
      x.classList.remove("skeleton");
      x.removeAttribute("style");
    });
  }

  function clearNow() {
    nowBadge.textContent = "OFF";
    nowBadge.classList.remove("badgeLive");
    nowUpdated.textContent = "--";
    nowTrack.textContent = "—";
    nowArtist.textContent = "—";
    nowAlbum.textContent = "—";
    nowMsg.textContent = "";
    setNowCover("");
  }

  function setNowCover(imgUrl) {
    const u = resolveImageUrl(imgUrl);
    if (u) {
      nowImg.src = u;
      nowImg.style.display = "block";
      if (nowFallback) nowFallback.style.display = "none";
    } else {
      nowImg.removeAttribute("src");
      nowImg.style.display = "none";
      if (nowFallback) nowFallback.style.display = "grid";
    }
  }

  function rowItem({ idx, title, subtitle, right, imageUrl, spotifyQuery }) {
    const wrap = document.createElement("div");
    wrap.className = "row";
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "button");
    wrap.setAttribute("aria-label", `${title}${subtitle ? " — " + subtitle : ""}`);

    const cover = document.createElement("div");
    cover.className = "cover";

    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";

    const icon = document.createElement("div");
    icon.className = "coverFallback";
    icon.textContent = "♪";

    const u = resolveImageUrl(imageUrl);
    if (u) {
      img.src = u;
      cover.appendChild(img);
      cover.appendChild(icon);
      img.addEventListener("error", () => {
        img.removeAttribute("src");
        img.style.display = "none";
        icon.style.display = "grid";
      });
      icon.style.display = "none";
    } else {
      icon.style.display = "grid";
    }
    cover.appendChild(icon);

    const mid = document.createElement("div");
    mid.className = "mid";

    // Title marquee wrapper
    const tWrap = document.createElement("div");
    tWrap.className = "titleMarquee";
    const t = document.createElement("div");
    t.className = "title marqueeInner";
    t.textContent = `${idx}. ${title}`;
    tWrap.appendChild(t);

    // Subtitle marquee wrapper
    const sWrap = document.createElement("div");
    sWrap.className = "subMarquee";
    const s = document.createElement("div");
    s.className = "sub marqueeInner";
    s.textContent = subtitle || "";
    sWrap.appendChild(s);

    mid.appendChild(tWrap);
    mid.appendChild(sWrap);

    const r = document.createElement("div");
    r.className = "right";
    r.textContent = right != null ? String(right) : "";

    wrap.appendChild(cover);
    wrap.appendChild(mid);
    wrap.appendChild(r);

    // Tap → Spotify search
    const q = spotifyQuery || `${title} ${subtitle || ""}`.trim();
    wrap.addEventListener("click", () => {
      vibrate(12);
      openSpotifySearch(q);
    });
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        vibrate(12);
        openSpotifySearch(q);
      }
    });

    // Apply marquee (after mount)
    requestAnimationFrame(() => {
      applyMarquee(tWrap);
      applyMarquee(sWrap);
    });

    return wrap;
  }
// ---------------------------
  // Fetch + Render: /api/ping
  // ---------------------------
  async function refreshPing() {
    try {
      const j = await safeFetchJson("/api/ping");
      setStatus(!!j?.ok);
    } catch {
      setStatus(false);
    }
  }

  // ---------------------------
  // Fetch + Render: /api/now
  // ---------------------------
  async function refreshNow() {
    clearNow();
    nowUpdated.textContent = fmtTime(Date.now());
    nowBadge.textContent = "…";
    nowBadge.classList.add("badgeLive"); // subtle live look while loading

    skeletonNow();

    try {
      const j = await safeFetchJson("/api/now");
      setStatus(true);

      clearNowSkeleton();
      nowUpdated.textContent = fmtTime(Date.now());

      const item = j?.item;
      if (!item) {
        nowMsg.textContent = "Not playing now";
        nowBadge.textContent = "OFF";
        nowBadge.classList.remove("badgeLive");
        setNowCover("");
        applyMarquee(nowTrackWrap);
        applyMarquee(nowArtistWrap);
        applyMarquee(nowAlbumWrap);
        return;
      }

      nowBadge.textContent = "LIVE";
      nowBadge.classList.add("badgeLive");

      nowTrack.textContent = item.name || "—";
      nowArtist.textContent = item.artist || "—";
      nowAlbum.textContent = item.album || "—";
      nowMsg.textContent = "Now playing";

      setNowCover(item.image || "");

      // Marquee for Now Playing lines
      applyMarquee(nowTrackWrap);
      applyMarquee(nowArtistWrap);
      applyMarquee(nowAlbumWrap);

      // Tap Now Playing → Spotify search
      const q = `${item.name || ""} ${item.artist || ""}`.trim();
      const card = nowTrackWrap?.closest(".card");
      if (card && !card.dataset.spotifyBound) {
        card.dataset.spotifyBound = "1";
        card.addEventListener("click", (e) => {
          // avoid clicks from tab area etc. (only inside now panel card)
          if (currentTab !== "now") return;
          // allow clicking anywhere in the Now card
          vibrate(12);
          openSpotifySearch(q);
        });
      }
    } catch (e) {
      setStatus(false);
      clearNowSkeleton();
      nowMsg.textContent = `Error: ${String(e.message || e)}`;
      nowBadge.textContent = "OFF";
      nowBadge.classList.remove("badgeLive");
      setNowCover("");
    }
  }

  // ---------------------------
  // Fetch + Render: /api/history
  // ---------------------------
  async function refreshRecent() {
    recentMeta.textContent = "";
    recentList.innerHTML = "";

    // Skeleton
    for (let i = 0; i < 6; i++) recentList.appendChild(skeletonRow());

    try {
      const j = await safeFetchJson("/api/history?limit=10");
      setStatus(true);

      const items = j?.items || [];
      recentList.innerHTML = "";

      items.forEach((it, i) => {
        recentList.appendChild(
          rowItem({
            idx: i + 1,
            title: it.name || "—",
            subtitle: it.artist || "",
            right: "",
            imageUrl: it.image || "",
            spotifyQuery: `${it.name || ""} ${it.artist || ""}`.trim()
          })
        );
      });

      // No "10 items" text (kept empty)
      recentMeta.textContent = items.length ? "" : "No recent history returned.";
      applyMarqueeAll();
    } catch (e) {
      setStatus(false);
      recentMeta.textContent = `Error: ${String(e.message || e)}`;
      recentList.innerHTML = "";
    }
  }

  // ---------------------------
  // Fetch + Render: /api/top
  // ---------------------------
  async function refreshTop() {
    topMeta.textContent = "";
    topList.innerHTML = "";
    topBadge.textContent = String(topLimit);

    // Skeleton
    for (let i = 0; i < 6; i++) topList.appendChild(skeletonRow());

    const path = `/api/top?type=${encodeURIComponent(topType)}&period=${encodeURIComponent(topPeriod)}&limit=${encodeURIComponent(topLimit)}`;

    try {
      const j = await safeFetchJson(path);
      setStatus(true);

      const items = j?.items || [];
      topList.innerHTML = "";

      topMeta.textContent = `${topType} • ${topPeriod}`;

      items.forEach((it, i) => {
        if (topType === "artists") {
          topList.appendChild(
            rowItem({
              idx: i + 1,
              title: it.name || "—",
              subtitle: "",
              right: it.playcount ?? "",
              imageUrl: it.image || "",
              spotifyQuery: `${it.name || ""}`.trim()
            })
          );
        } else if (topType === "albums") {
          topList.appendChild(
            rowItem({
              idx: i + 1,
              title: it.name || "—",
              subtitle: it.artist || "",
              right: it.playcount ?? "",
              imageUrl: it.image || "",
              spotifyQuery: `${it.name || ""} ${it.artist || ""}`.trim()
            })
          );
        } else {
          // tracks
          topList.appendChild(
            rowItem({
              idx: i + 1,
              title: it.name || "—",
              subtitle: it.artist || "",
              right: it.playcount ?? "",
              imageUrl: it.image || "",
              spotifyQuery: `${it.name || ""} ${it.artist || ""}`.trim()
            })
          );
        }
      });

      if (!items.length) topMeta.textContent = "No top data returned.";
      applyMarqueeAll();
    } catch (e) {
      setStatus(false);
      topMeta.textContent = `Error: ${String(e.message || e)}`;
      topList.innerHTML = "";
    }
  }
// ---------------------------
  // Wire UI
  // ---------------------------
  function init() {
    // tabs
    tabBtns.forEach((b) => {
      b.addEventListener("click", () => showTab(b.dataset.tab));
    });

    // top type
    topTypeBtns.forEach((b) => {
      b.addEventListener("click", () => {
        topType = String(b.dataset.topType || "tracks");
        setSelected(topTypeBtns, (x) => x === b);
        vibrate(8);
        refreshTop();
      });
    });

    // top period
    topPeriodBtns.forEach((b) => {
      b.addEventListener("click", () => {
        topPeriod = String(b.dataset.topPeriod || "today");
        setSelected(topPeriodBtns, (x) => x === b);
        vibrate(8);
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

    // Re-evaluate marquee on resize/orientation
    window.addEventListener("resize", () => {
      applyMarqueeAll();
      applyMarquee(nowTrackWrap);
      applyMarquee(nowArtistWrap);
      applyMarquee(nowAlbumWrap);
    }, { passive: true });

    // Prevent the browser "pull to refresh" bounce from feeling like a UI feature
    window.addEventListener("touchmove", () => {}, { passive: true });
  }

  init();
})();