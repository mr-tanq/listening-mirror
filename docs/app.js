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

  // Top UI
  const topMeta = el("#topMeta");
  const topBadge = el("#topBadge");
  const topList = el("#topList");
  const topEmpty = el("#topEmpty");
  const topTypeBtns = els("[data-top-type]");
  const topPeriodBtns = els("[data-top-period]");

  // Recent UI
  const recentMeta = el("#recentMeta");
  const recentList = el("#recentList");
  const recentEmpty = el("#recentEmpty");

  let currentTab = "now";
  let topType = "tracks";   // tracks | artists | albums
  let topPeriod = "today";  // today | week | year
  const topLimit = 10;

  let online = false;

  // D1 (session-based): track last time we saw LIVE
  let lastLiveSeenAt = 0;

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

  function fmtAgo(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m <= 0) return `${r}s ago`;
    return `${m}m ${r}s ago`;
  }

  function setStatus(ok) {
    if (statusLine) statusLine.textContent = ok ? "Online" : "Offline";
    if (statusDot) statusDot.classList.toggle("on", !!ok);
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
    nowTrack.textContent = "—";
    nowArtist.textContent = "—";
    nowAlbum.textContent = "—";
    nowMsg.textContent = "";
    setNowCover("");
  }

  // D2: human captions
  function periodCaption(p) {
    if (p === "today") return "last 24h";
    if (p === "week") return "last 7 days";
    if (p === "year") return "last 12 months";
    return p;
  }

  // Marquee helper: animate only if overflow
  function applyMarquee(containerEl) {
    if (!containerEl) return;
    const inner = containerEl.querySelector(".inner");
    if (!inner) return;

    // reset
    containerEl.dataset.animate = "false";
    inner.style.removeProperty("--dx");
    inner.style.animation = "none";

    // needs two copies for seamless scroll
    const text = inner.querySelector(".text");
    const clone = inner.querySelector(".clone");

    if (!text || !clone) return;

    // sync clone
    clone.textContent = text.textContent;

    // measure
    const wContainer = containerEl.clientWidth;
    const wText = text.scrollWidth;

    if (wText <= wContainer) {
      containerEl.dataset.animate = "false";
      return;
    }

    // distance to scroll = text width + gap
    const gap = 18;
    const dx = wText + gap;

    inner.style.setProperty("--dx", dx + "px");
    containerEl.dataset.animate = "true";

    // duration scales with width (smooth premium pace)
    const dur = Math.min(22, Math.max(9, dx / 55)); // 9s–22s
    inner.style.animation = `scrollX ${dur}s linear infinite`;
  }

  // B2: press micro-animation (JS adds class, safer than :active on mobile)
  function wirePressFX(rowEl) {
    let down = false;

    const onDown = () => {
      down = true;
      rowEl.classList.add("is-press");
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      rowEl.classList.remove("is-press");
    };

    rowEl.addEventListener("pointerdown", onDown, { passive: true });
    rowEl.addEventListener("pointerup", onUp, { passive: true });
    rowEl.addEventListener("pointercancel", onUp, { passive: true });
    rowEl.addEventListener("pointerleave", onUp, { passive: true });
  }

  function pad2(n) {
    const x = Number(n) || 0;
    return x < 10 ? `0${x}` : String(x);
  }

  function rowItem({ idx, title, subtitle, right, imageUrl, rightAccent = false }) {
    const wrap = document.createElement("div");
    wrap.className = "row";
    wirePressFX(wrap);

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

    const idxEl = document.createElement("div");
    idxEl.className = "idx";
    idxEl.textContent = pad2(idx);

    const textCol = document.createElement("div");
    textCol.className = "textCol";

    // Title marquee
    const t = document.createElement("div");
    t.className = "title marquee";
    t.innerHTML = `
      <span class="inner">
        <span class="text">${escapeHtml(title || "—")}</span>
        <span class="clone" aria-hidden="true"></span>
      </span>
    `;

    // Subtitle marquee (artist/album)
    const s = document.createElement("div");
    s.className = "sub marquee";
    s.innerHTML = `
      <span class="inner">
        <span class="text">${escapeHtml(subtitle || "")}</span>
        <span class="clone" aria-hidden="true"></span>
      </span>
    `;

    textCol.appendChild(t);
    textCol.appendChild(s);

    mid.appendChild(idxEl);
    mid.appendChild(textCol);

    const r = document.createElement("div");
    r.className = "right" + (rightAccent ? " accent" : "");
    r.textContent = right != null ? String(right) : "";

    wrap.appendChild(cover);
    wrap.appendChild(mid);
    wrap.appendChild(r);

    // apply marquees after in DOM (next tick)
    queueMicrotask(() => {
      applyMarquee(t);
      if (subtitle) applyMarquee(s);
    });

    return wrap;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------------------------
  // Fetch + Render: /api/ping
  // ---------------------------
  async function refreshPing() {
    try {
      const j = await safeFetchJson("/api/ping");
      online = !!j?.ok;
      setStatus(online);
    } catch {
      online = false;
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
        nowBadge.textContent = "OFF";
        nowBadge.classList.remove("live");
        setNowCover("");

        // D1 (session-based)
        if (lastLiveSeenAt) {
          nowMsg.textContent = `Last seen playing: ${fmtAgo(Date.now() - lastLiveSeenAt)}`;
        } else {
          nowMsg.textContent = "Not playing now";
        }
        return;
      }

      nowBadge.textContent = "LIVE";
      nowBadge.classList.add("live");

      lastLiveSeenAt = Date.now();

      nowTrack.textContent = item.name || "—";
      nowArtist.textContent = item.artist || "—";
      nowAlbum.textContent = item.album || "—";
      nowMsg.textContent = "Now playing";

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
    recentEmpty.style.display = "none";

    try {
      const j = await safeFetchJson("/api/history?limit=10");
      const items = j?.items || [];

      // remove “10 items” vibe → keep minimal caption
      recentMeta.textContent = items.length ? "Last played" : "—";

      items.forEach((it, i) => {
        recentList.appendChild(
          rowItem({
            idx: i + 1,
            title: it.name || "—",
            subtitle: it.artist || "",
            right: "",
            imageUrl: it.image || "",
            rightAccent: false
          })
        );
      });

      if (!items.length) {
        recentMeta.textContent = "—";
        recentEmpty.style.display = "block";
        recentEmpty.textContent = "No recent history yet. Start listening and it will appear here.";
      }
    } catch (e) {
      recentMeta.textContent = "—";
      recentList.innerHTML = "";
      recentEmpty.style.display = "block";
      recentEmpty.textContent = `Couldn’t load recent right now (${String(e.message || e)}).`;
    }
  }

  // ---------------------------
  // Fetch + Render: /api/top
  // ---------------------------
  async function refreshTop() {
    topMeta.textContent = "Loading…";
    topList.innerHTML = "";
    topEmpty.style.display = "none";

    const path = `/api/top?type=${encodeURIComponent(topType)}&period=${encodeURIComponent(topPeriod)}&limit=${encodeURIComponent(topLimit)}`;

    try {
      const j = await safeFetchJson(path);
      const items = j?.items || [];

      // D2 caption
      topMeta.textContent = `${topType} • ${periodCaption(topPeriod)}`;

      topBadge.textContent = String(topLimit);

      items.forEach((it, i) => {
        if (topType === "artists") {
          topList.appendChild(
            rowItem({
              idx: i + 1,
              title: it.name || "—",
              subtitle: "",
              right: it.playcount ?? "",
              imageUrl: it.image || "",
              rightAccent: true // different color for numbers
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
              rightAccent: true
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
              rightAccent: true
            })
          );
        }
      });

      if (!items.length) {
        topMeta.textContent = `${topType} • ${periodCaption(topPeriod)}`;
        topEmpty.style.display = "block";
        topEmpty.textContent = "No top data yet for this period.";
      }
    } catch (e) {
      topList.innerHTML = "";
      topEmpty.style.display = "block";
      topEmpty.textContent = `Couldn’t load top right now (${String(e.message || e)}).`;
      topMeta.textContent = "—";
    }
  }

  // ---------------------------
  // Wire UI
  // ---------------------------
  function init() {
    // tabs
    tabBtns.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

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