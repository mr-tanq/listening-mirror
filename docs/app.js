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
  const btnRefresh = el("#btnRefresh");

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
  const workerHint = el("#workerHint");

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
  let topType = "tracks";    // tracks | artists | albums
  let topPeriod = "today";   // today | week | year
  let topLimit = 20;
  let online = false;

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

    // re-evaluate marquee when changing panels
    requestAnimationFrame(() => refreshAllMarquees());
  }

  function fmtTime(ts = Date.now()) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "--";
    }
  }

  function setStatus(text) {
    if (statusLine) statusLine.textContent = text;
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
// ---------------------------
  // Marquee (only when overflow)
  // ---------------------------
  function clearMarquee(node, plainText) {
    node.classList.remove("marquee", "fast", "slow");
    node.textContent = plainText ?? "";
  }

  function applyMarquee(node, text, speed = "slow") {
    // set plain text first (so we can measure)
    node.classList.remove("marquee", "fast", "slow");
    node.textContent = text;

    // measure overflow (needs layout)
    const overflow = node.scrollWidth > node.clientWidth + 2;
    if (!overflow) return;

    // build marquee DOM
    node.innerHTML = "";
    node.classList.add("marquee");
    if (speed === "fast") node.classList.add("fast");
    if (speed === "slow") node.classList.add("slow");

    const track = document.createElement("div");
    track.className = "marqueeTrack";

    const a = document.createElement("span");
    a.textContent = text;

    const b = document.createElement("span");
    b.textContent = text;

    track.appendChild(a);
    track.appendChild(b);
    node.appendChild(track);
  }

  function setSmartText(node, text, speed = "slow") {
    if (!node) return;
    const t = (text == null ? "" : String(text));
    // try marquee on next frame so the element has proper width
    requestAnimationFrame(() => applyMarquee(node, t, speed));
  }

  function refreshAllMarquees() {
    // Now Playing
    setSmartText(nowTrack, nowTrack?.dataset?.rawText || nowTrack?.textContent || "—", "fast");
    setSmartText(nowArtist, nowArtist?.dataset?.rawText || nowArtist?.textContent || "—", "slow");
    setSmartText(nowAlbum, nowAlbum?.dataset?.rawText || nowAlbum?.textContent || "—", "slow");

    // List rows (titles/subtitles)
    els("[data-marquee='title']").forEach((n) => setSmartText(n, n.dataset.rawText || n.textContent || "", "fast"));
    els("[data-marquee='sub']").forEach((n) => setSmartText(n, n.dataset.rawText || n.textContent || "", "slow"));
  }

  function clearNow() {
    nowBadge.textContent = "OFF";
    nowBadge.classList.remove("live");
    nowUpdated.textContent = "--";
    nowMsg.textContent = "";
    setNowCover("");

    // set placeholders + marquee
    nowTrack.dataset.rawText = "—";
    nowArtist.dataset.rawText = "—";
    nowAlbum.dataset.rawText = "—";
    setSmartText(nowTrack, "—", "fast");
    setSmartText(nowArtist, "—", "slow");
    setSmartText(nowAlbum, "—", "slow");
  }

  function setNowCover(imgUrl) {
    const u = resolveImageUrl(imgUrl);
    if (u) {
      nowImg.src = u;
      nowImg.style.display = "block";
      nowFallback.style.display = "none";
    } else {
      nowImg.removeAttribute("src");
      nowImg.style.display = "none";
      nowFallback.style.display = "grid";
    }
  }

  function rowItem({ idx, title, subtitle, right, imageUrl }) {
    const wrap = document.createElement("div");
    wrap.className = "row";

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

    const t = document.createElement("div");
    t.className = "title";
    t.dataset.marquee = "title";
    t.dataset.rawText = `${idx}. ${title}`;

    const s = document.createElement("div");
    s.className = "sub";
    s.dataset.marquee = "sub";
    s.dataset.rawText = subtitle || "";

    mid.appendChild(t);
    mid.appendChild(s);

    const r = document.createElement("div");
    r.className = "right";
    r.textContent = right != null ? String(right) : "";

    wrap.appendChild(cover);
    wrap.appendChild(mid);
    wrap.appendChild(r);

    // apply marquee after layout
    requestAnimationFrame(() => {
      applyMarquee(t, t.dataset.rawText || "", "fast");
      applyMarquee(s, s.dataset.rawText || "", "slow");
    });

    return wrap;
  }
// ---------------------------
  // Fetch + Render: /api/ping
  // ---------------------------
  async function refreshPing() {
    try {
      const j = await safeFetchJson("/api/ping");
      online = !!j?.ok;
      setStatus(online ? "Online" : "Offline");
    } catch {
      online = false;
      setStatus("Offline");
    }
  }

  // ---------------------------
  // Fetch + Render: /api/now
  // ---------------------------
  async function refreshNow() {
    clearNow();
    nowUpdated.textContent = fmtTime(Date.now());
    nowMsg.textContent = "Loading…";

    try {
      const j = await safeFetchJson("/api/now");
      nowUpdated.textContent = fmtTime(Date.now());

      const item = j?.item;
      if (!item) {
        nowMsg.textContent = "Not playing now";
        nowBadge.textContent = "OFF";
        nowBadge.classList.remove("live");
        setNowCover("");
        return;
      }

      nowBadge.textContent = "LIVE";
      nowBadge.classList.add("live");

      nowMsg.textContent = "Now playing";

      // store raw text for marquee refresh
      nowTrack.dataset.rawText = item.name || "—";
      nowArtist.dataset.rawText = item.artist || "—";
      nowAlbum.dataset.rawText = item.album || "—";

      setSmartText(nowTrack, nowTrack.dataset.rawText, "fast");
      setSmartText(nowArtist, nowArtist.dataset.rawText, "slow");
      setSmartText(nowAlbum, nowAlbum.dataset.rawText, "slow");

      setNowCover(item.image || "");
    } catch (e) {
      nowMsg.textContent = `Error: ${String(e.message || e)}`;
      nowBadge.textContent = "OFF";
      nowBadge.classList.remove("live");
      setNowCover("");
    }
  }

  // ---------------------------
  // Fetch + Render: /api/history
  // ---------------------------
  async function refreshRecent() {
    recentMeta.textContent = "Loading…";
    recentList.innerHTML = "";

    try {
      const j = await safeFetchJson("/api/history?limit=10");
      const items = j?.items || [];

      recentMeta.textContent = `${items.length} items`;

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

      if (!items.length) recentMeta.textContent = "No recent history returned.";

      requestAnimationFrame(() => refreshAllMarquees());
    } catch (e) {
      recentMeta.textContent = `Error: ${String(e.message || e)}`;
      recentList.innerHTML = "";
    }
  }

  // ---------------------------
  // Fetch + Render: /api/top
  // ---------------------------
  async function refreshTop() {
    topMeta.textContent = "Loading…";
    topList.innerHTML = "";

    const path = `/api/top?type=${encodeURIComponent(topType)}&period=${encodeURIComponent(topPeriod)}&limit=${encodeURIComponent(topLimit)}`;

    try {
      const j = await safeFetchJson(path);
      const items = j?.items || [];

      topMeta.textContent = `${topType} • ${topPeriod}`;
      topBadge.textContent = String(topLimit);

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

      if (!items.length) topMeta.textContent = "No top data returned.";

      requestAnimationFrame(() => refreshAllMarquees());
    } catch (e) {
      topMeta.textContent = `Error: ${String(e.message || e)}`;
      topList.innerHTML = "";
    }
  }
// ---------------------------
  // Wire UI
  // ---------------------------
  function init() {
    if (workerHint) workerHint.textContent = `Worker: ${WORKER_BASE}`;

    // tabs
    tabBtns.forEach((b) => {
      b.addEventListener("click", () => showTab(b.dataset.tab));
    });

    // top type
    topTypeBtns.forEach((b) => {
      b.addEventListener("click", () => {
        topType = String(b.dataset.topType || "tracks");
        setSelected(topTypeBtns, (x) => x === b);
        refreshTop();
      });
    });

    // top period
    topPeriodBtns.forEach((b) => {
      b.addEventListener("click", () => {
        topPeriod = String(b.dataset.topPeriod || "today");
        setSelected(topPeriodBtns, (x) => x === b);
        refreshTop();
      });
    });

    // refresh
    if (btnRefresh) {
      btnRefresh.addEventListener("click", async () => {
        await refreshPing();
        if (currentTab === "now") refreshNow();
        if (currentTab === "top") refreshTop();
        if (currentTab === "recent") refreshRecent();
      });
    }

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

    // re-evaluate marquee on resize/orientation change
    window.addEventListener("resize", () => {
      requestAnimationFrame(() => refreshAllMarquees());
    });
    window.addEventListener("orientationchange", () => {
      setTimeout(() => refreshAllMarquees(), 200);
    });
  }

  init();
})();