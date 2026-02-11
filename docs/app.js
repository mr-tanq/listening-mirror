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
  const btnRefresh = el("#btnRefresh");

  // Tabs
  const panels = els(".panel");
  const tabBtns = els(".segBtn");

  // Toast
  const toast = el("#toast");
  let toastTimer = null;

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
  // Toast
  // ---------------------------
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = String(msg || "");
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

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

    requestAnimationFrame(() => refreshAllMarquees());
  }

  function fmtTime(ts = Date.now()) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "--";
    }
  }

  function setStatus(text, isOn) {
    if (statusLine) statusLine.textContent = text;
    if (statusDot) {
      statusDot.classList.remove("on", "off");
      statusDot.classList.add(isOn ? "on" : "off");
    }
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
  // Marquee (only when overflow) + pause on touch
  // ---------------------------
  function applyMarquee(node, text, speed = "slow") {
    node.classList.remove("marquee", "fast", "slow", "pause");
    node.textContent = text;

    const overflow = node.scrollWidth > node.clientWidth + 2;
    if (!overflow) return;

    node.innerHTML = "";
    node.classList.add("marquee");
    node.classList.add(speed === "fast" ? "fast" : "slow");

    const track = document.createElement("div");
    track.className = "marqueeTrack";

    const a = document.createElement("span");
    a.textContent = text;

    const b = document.createElement("span");
    b.textContent = text;

    track.appendChild(a);
    track.appendChild(b);
    node.appendChild(track);

    // Pause while pressing (mobile-friendly)
    const pause = () => node.classList.add("pause");
    const resume = () => node.classList.remove("pause");

    node.addEventListener("pointerdown", pause, { passive: true });
    node.addEventListener("pointerup", resume, { passive: true });
    node.addEventListener("pointercancel", resume, { passive: true });
    node.addEventListener("pointerleave", resume, { passive: true });
  }

  function setSmartText(node, text, speed = "slow") {
    if (!node) return;
    const t = (text == null ? "" : String(text));
    requestAnimationFrame(() => applyMarquee(node, t, speed));
  }

  function refreshAllMarquees() {
    setSmartText(nowTrack, nowTrack?.dataset?.rawText || nowTrack?.textContent || "—", "fast");
    setSmartText(nowArtist, nowArtist?.dataset?.rawText || nowArtist?.textContent || "—", "slow");
    setSmartText(nowAlbum, nowAlbum?.dataset?.rawText || nowAlbum?.textContent || "—", "slow");

    els("[data-marquee='title']").forEach((n) => setSmartText(n, n.dataset.rawText || n.textContent || "", "fast"));
    els("[data-marquee='sub']").forEach((n) => setSmartText(n, n.dataset.rawText || n.textContent || "", "slow"));
  }

  // ---------------------------
  // Skeletons
  // ---------------------------
  function mountListSkeleton(container, rows = 8) {
    if (!container) return;
    container.innerHTML = "";
    for (let i = 0; i < rows; i++) {
      const r = document.createElement("div");
      r.className = "skRow";

      const c = document.createElement("div");
      c.className = "skCover skeleton";

      const mid = document.createElement("div");
      const l1 = document.createElement("div");
      l1.className = "skLine big skeleton";
      const l2 = document.createElement("div");
      l2.className = "skLine small skeleton";
      mid.appendChild(l1);
      mid.appendChild(l2);

      const right = document.createElement("div");
      right.className = "skRight skeleton";

      r.appendChild(c);
      r.appendChild(mid);
      r.appendChild(right);
      container.appendChild(r);
    }
  }

  // ---------------------------
  // Now helpers
  // ---------------------------
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

  function clearNow() {
    nowBadge.textContent = "OFF";
    nowBadge.classList.remove("live");
    nowUpdated.textContent = "--";
    nowMsg.textContent = "";
    setNowCover("");

    nowTrack.dataset.rawText = "—";
    nowArtist.dataset.rawText = "—";
    nowAlbum.dataset.rawText = "—";
    setSmartText(nowTrack, "—", "fast");
    setSmartText(nowArtist, "—", "slow");
    setSmartText(nowAlbum, "—", "slow");
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

    requestAnimationFrame(() => {
      applyMarquee(t, t.dataset.rawText || "", "fast");
      applyMarquee(s, s.dataset.rawText || "", "slow");
    });

    return wrap;
  }
// ---------------------------
  // /api/ping
  // ---------------------------
  async function refreshPing() {
    try {
      const j = await safeFetchJson("/api/ping");
      online = !!j?.ok;
      setStatus(online ? "Online" : "Offline", online);
    } catch {
      online = false;
      setStatus("Offline", false);
    }
  }

  // ---------------------------
  // /api/now
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
      showToast(`Now Playing: ${String(e.message || e)}`);
    }
  }

  // ---------------------------
  // /api/history
  // ---------------------------
  async function refreshRecent() {
    recentMeta.textContent = "Loading…";
    mountListSkeleton(recentList, 8);

    try {
      const j = await safeFetchJson("/api/history?limit=10");
      const items = j?.items || [];

      recentMeta.textContent = `${items.length} items`;
      recentList.innerHTML = "";

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
      showToast(`Recent: ${String(e.message || e)}`);
    }
  }

  // ---------------------------
  // /api/top
  // ---------------------------
  async function refreshTop() {
    topMeta.textContent = "Loading…";
    mountListSkeleton(topList, 10);

    const path = `/api/top?type=${encodeURIComponent(topType)}&period=${encodeURIComponent(topPeriod)}&limit=${encodeURIComponent(topLimit)}`;

    try {
      const j = await safeFetchJson(path);
      const items = j?.items || [];

      topMeta.textContent = `${topType} • ${topPeriod}`;
      topBadge.textContent = String(topLimit);

      topList.innerHTML = "";

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
      showToast(`Top: ${String(e.message || e)}`);
    }
  }
// ---------------------------
  // Wire UI
  // ---------------------------
  function init() {
    if (workerHint) workerHint.textContent = `Worker: ${WORKER_BASE}`;

    // Tabs
    tabBtns.forEach((b) => {
      b.addEventListener("click", () => showTab(b.dataset.tab));
    });

    // Top type
    topTypeBtns.forEach((b) => {
      b.addEventListener("click", () => {
        topType = String(b.dataset.topType || "tracks");
        setSelected(topTypeBtns, (x) => x === b);
        showToast(`Top: ${topType}`);
        refreshTop();
      });
    });

    // Top period
    topPeriodBtns.forEach((b) => {
      b.addEventListener("click", () => {
        topPeriod = String(b.dataset.topPeriod || "today");
        setSelected(topPeriodBtns, (x) => x === b);
        showToast(`Period: ${topPeriod}`);
        refreshTop();
      });
    });

    // Refresh
    if (btnRefresh) {
      btnRefresh.addEventListener("click", async () => {
        showToast("Refreshing…");
        await refreshPing();
        if (currentTab === "now") refreshNow();
        if (currentTab === "top") refreshTop();
        if (currentTab === "recent") refreshRecent();
      });
    }

    // Initial selected states
    setSelected(tabBtns, (b) => b.dataset.tab === "now");
    setSelected(topTypeBtns, (b) => (b.dataset.topType || "") === "tracks");
    setSelected(topPeriodBtns, (b) => (b.dataset.topPeriod || "") === "today");

    // Boot
    refreshPing();
    showTab("now");

    // Auto refresh
    setInterval(refreshPing, 15000);
    setInterval(() => {
      if (currentTab === "now") refreshNow();
    }, 15000);

    // Re-evaluate marquee on resize/orientation change
    window.addEventListener("resize", () => requestAnimationFrame(() => refreshAllMarquees()));
    window.addEventListener("orientationchange", () => setTimeout(() => refreshAllMarquees(), 200));
  }

  init();
})();