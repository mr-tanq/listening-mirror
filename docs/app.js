/* Listening Mirror UI (premium, no pull-to-refresh)
   Worker: https://i.errtanq9.workers.dev
*/
(() => {
  "use strict";

  const WORKER_BASE = "https://i.errtanq9.workers.dev"; // no trailing slash

  const el = (sel) => document.querySelector(sel);
  const els = (sel) => Array.from(document.querySelectorAll(sel));

  // Header/status
  const statusLine = el("#statusLine");
  const statusDot = el("#statusDot");

  // Tabs
  const panels = els(".panel");
  const tabBtns = els(".tabBtn");

  // Now UI
  const nowCard = el("#nowCard");
  const nowUpdated = el("#nowUpdated");
  const nowBadge = el("#nowBadge");
  const nowImg = el("#nowImg");
  const nowFallback = el("#nowFallback");
  const nowTrack = el("#nowTrack");
  const nowArtist = el("#nowArtist");
  const nowAlbum = el("#nowAlbum");
  const nowMsg = el("#nowMsg");

  // Top UI
  const topMeta = el("#topMeta");
  const topBadge = el("#topBadge");
  const topList = el("#topList");
  const topTypeBtns = els("[data-top-type]");
  const topPeriodBtns = els("[data-top-period]");

  // Recent UI
  const recentMeta = el("#recentMeta");
  const recentList = el("#recentList");

  // Marquee elements
  const marqBlocks = els("[data-marq]");

  let currentTab = "now";
  let topType = "tracks";   // tracks | artists | albums
  let topPeriod = "today";  // today | week | year

  // ✅ default TOP limit now 10
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

  function fmtTime(ts = Date.now()) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "--";
    }
  }

  function setStatus(online) {
    if (statusLine) statusLine.textContent = online ? "Online" : "Offline";
    if (statusDot) {
      statusDot.classList.remove("online", "offline");
      statusDot.classList.add(online ? "online" : "offline");
    }
  }

  // Worker returns images like "/img?u=..."
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
  // Marquee logic (only if overflow)
  // ---------------------------
  function setupMarquee(block) {
    const inner = block.querySelector(".inner");
    if (!inner) return;

    const span = inner.querySelector("span");
    const dup = inner.querySelector(".dup");
    if (!span || !dup) return;

    block.classList.remove("animate");
    block.style.removeProperty("--shift");

    const text = (span.textContent || "").trim();
    if (!text) {
      dup.textContent = "";
      return;
    }

    dup.textContent = text;

    const blockW = block.clientWidth;
    const textW = span.scrollWidth;

    if (textW > blockW + 6) {
      const gap = 28;
      const shift = textW + gap;
      block.style.setProperty("--shift", `${shift}px`);
      const seconds = Math.max(7, Math.min(18, shift / 70));
      block.style.setProperty("--duration", `${seconds}s`);
      block.classList.add("animate");
    } else {
      dup.textContent = "";
    }
  }

  function refreshAllMarquees() {
    marqBlocks.forEach(setupMarquee);
  }

  function makeRowMarquee(node) {
    const blocks = node.querySelectorAll("[data-row-marq]");
    blocks.forEach((b) => {
      const inner = b.querySelector(".inner");
      if (!inner) return;

      const span = inner.querySelector("span");
      const dup = inner.querySelector(".dup");
      if (!span || !dup) return;

      b.classList.remove("animate");
      b.style.removeProperty("--shift");

      const text = (span.textContent || "").trim();
      if (!text) {
        dup.textContent = "";
        return;
      }

      dup.textContent = text;

      const bW = b.clientWidth;
      const tW = span.scrollWidth;

      if (tW > bW + 6) {
        const gap = 24;
        const shift = tW + gap;
        b.style.setProperty("--shift", `${shift}px`);
        const seconds = Math.max(8, Math.min(18, shift / 70));
        b.style.setProperty("--duration", `${seconds}s`);
        b.classList.add("animate");
      } else {
        dup.textContent = "";
      }
    });
  }

  // ---------------------------
  // Now UI
  // ---------------------------
  function clearNow() {
    nowBadge.textContent = "OFF";
    nowBadge.classList.remove("live");
    nowUpdated.textContent = "--";
    nowTrack.textContent = "—";
    nowArtist.textContent = "—";
    nowAlbum.textContent = "—";
    nowMsg.textContent = "";
    setNowCover("");

    if (nowCard) nowCard.classList.remove("liveSheen");
    refreshAllMarquees();
  }

  function setNowCover(imgUrl) {
    const u = resolveImageUrl(imgUrl);
    if (u) {
      nowImg.src = u;
      nowImg.style.display = "block";
      nowFallback.style.display = "none";
      nowImg.onerror = () => {
        nowImg.removeAttribute("src");
        nowImg.style.display = "none";
        nowFallback.style.display = "grid";
      };
    } else {
      nowImg.removeAttribute("src");
      nowImg.style.display = "none";
      nowFallback.style.display = "grid";
    }
  }

  // ---------------------------
  // Row builder (Top/Recent)
  // ---------------------------
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
        icon.style.display = "grid";
      });
      icon.style.display = "none";
    } else {
      icon.style.display = "grid";
    }
    cover.appendChild(icon);

    const mid = document.createElement("div");
    mid.className = "mid";

    const tWrap = document.createElement("div");
    tWrap.className = "marq rowTitle";
    tWrap.setAttribute("data-row-marq", "1");
    tWrap.style.setProperty("--maskFade", "16px");
    tWrap.style.setProperty("--duration", "10s");

    const tInner = document.createElement("div");
    tInner.className = "inner";
    const tSpan = document.createElement("span");
    tSpan.textContent = `${idx}. ${title}`;
    const tDup = document.createElement("span");
    tDup.className = "dup";
    tDup.setAttribute("aria-hidden", "true");
    tInner.appendChild(tSpan);
    tInner.appendChild(tDup);
    tWrap.appendChild(tInner);

    const sWrap = document.createElement("div");
    sWrap.className = "marq rowSub";
    sWrap.setAttribute("data-row-marq", "1");
    sWrap.style.setProperty("--maskFade", "14px");
    sWrap.style.setProperty("--duration", "12s");

    const sInner = document.createElement("div");
    sInner.className = "inner";
    const sSpan = document.createElement("span");
    sSpan.textContent = subtitle || "";
    const sDup = document.createElement("span");
    sDup.className = "dup";
    sDup.setAttribute("aria-hidden", "true");
    sInner.appendChild(sSpan);
    sInner.appendChild(sDup);
    sWrap.appendChild(sInner);

    mid.appendChild(tWrap);
    mid.appendChild(sWrap);

    const r = document.createElement("div");
    r.className = "right";
    r.textContent = right != null ? String(right) : "";

    wrap.appendChild(cover);
    wrap.appendChild(mid);
    wrap.appendChild(r);

    queueMicrotask(() => makeRowMarquee(wrap));
    return wrap;
  }

  function addSkeletonRows(container, count = 6) {
    container.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const row = document.createElement("div");
      row.className = "row";

      const c = document.createElement("div");
      c.className = "cover skeleton";
      c.style.borderRadius = "16px";

      const mid = document.createElement("div");
      mid.className = "mid";

      const a = document.createElement("div");
      a.className = "skeleton";
      a.style.height = "14px";
      a.style.borderRadius = "10px";
      a.style.width = `${65 + (i % 3) * 10}%`;

      const b = document.createElement("div");
      b.className = "skeleton";
      b.style.height = "12px";
      b.style.borderRadius = "10px";
      b.style.width = `${45 + (i % 4) * 10}%`;

      mid.appendChild(a);
      mid.appendChild(b);

      const right = document.createElement("div");
      right.className = "right skeleton";
      right.style.height = "14px";
      right.style.width = "36px";
      right.style.borderRadius = "10px";

      row.appendChild(c);
      row.appendChild(mid);
      row.appendChild(right);

      container.appendChild(row);
    }
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
        if (nowCard) nowCard.classList.remove("liveSheen");
        refreshAllMarquees();
        return;
      }

      nowBadge.textContent = "LIVE";
      nowBadge.classList.add("live");
      if (nowCard) nowCard.classList.add("liveSheen");

      nowTrack.textContent = item.name || "—";
      nowArtist.textContent = item.artist || "—";
      nowAlbum.textContent = item.album || "—";
      nowMsg.textContent = "Now playing";

      setNowCover(item.image || "");
      refreshAllMarquees();
    } catch (e) {
      nowMsg.textContent = `Error: ${String(e.message || e)}`;
      nowBadge.textContent = "OFF";
      nowBadge.classList.remove("live");
      if (nowCard) nowCard.classList.remove("liveSheen");
      setNowCover("");
      refreshAllMarquees();
    }
  }

  // ---------------------------
  // Fetch + Render: /api/history
  // ---------------------------
  async function refreshRecent() {
    // ✅ remove "10 items" completely (leave meta empty)
    if (recentMeta) recentMeta.textContent = "";
    addSkeletonRows(recentList, 7);

    try {
      const j = await safeFetchJson("/api/history?limit=10");
      const items = j?.items || [];

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

      // no "No recent..." text either (keep it clean)
      if (!items.length) {
        recentList.innerHTML = "";
      }
    } catch (e) {
      recentList.innerHTML = "";
    }
  }

  // ---------------------------
  // Fetch + Render: /api/top
  // ---------------------------
  async function refreshTop() {
    topMeta.textContent = "Loading…";
    addSkeletonRows(topList, 8);
    topBadge.textContent = String(topLimit);

    const path = `/api/top?type=${encodeURIComponent(topType)}&period=${encodeURIComponent(topPeriod)}&limit=${encodeURIComponent(topLimit)}`;

    try {
      const j = await safeFetchJson(path);
      const items = j?.items || [];

      topList.innerHTML = "";
      topMeta.textContent = `${topType} • ${topPeriod}`;

      items.forEach((it, i) => {
        if (topType === "artists") {
          topList.appendChild(rowItem({
            idx: i + 1,
            title: it.name || "—",
            subtitle: "",
            right: it.playcount ?? "",
            imageUrl: it.image || ""
          }));
        } else if (topType === "albums") {
          topList.appendChild(rowItem({
            idx: i + 1,
            title: it.name || "—",
            subtitle: it.artist || "",
            right: it.playcount ?? "",
            imageUrl: it.image || ""
          }));
        } else {
          topList.appendChild(rowItem({
            idx: i + 1,
            title: it.name || "—",
            subtitle: it.artist || "",
            right: it.playcount ?? "",
            imageUrl: it.image || ""
          }));
        }
      });

      if (!items.length) {
        topList.innerHTML = "";
      }
    } catch (e) {
      topMeta.textContent = "";
      topList.innerHTML = "";
    }
  }

  // ---------------------------
  // Init
  // ---------------------------
  function init() {
    tabBtns.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

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

    setSelected(tabBtns, (b) => b.dataset.tab === "now");
    setSelected(topTypeBtns, (b) => (b.dataset.topType || "") === "tracks");
    setSelected(topPeriodBtns, (b) => (b.dataset.topPeriod || "") === "today");

    refreshPing();
    showTab("now");
    refreshAllMarquees();

    window.addEventListener("resize", refreshAllMarquees);

    // auto refresh ping + now
    setInterval(refreshPing, 15000);
    setInterval(() => {
      if (currentTab === "now") refreshNow();
    }, 15000);
  }

  init();
})();