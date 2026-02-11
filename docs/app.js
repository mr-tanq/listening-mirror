/* Listening Mirror UI (hardcoded Worker base)
   - No Settings
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
  const nowBadgeText = el("#nowBadgeText");
  const nowImg = el("#nowImg");
  const nowFallback = el("#nowFallback");
  const nowTrack = el("#nowTrack");
  const nowArtist = el("#nowArtist");
  const nowAlbum = el("#nowAlbum");
  const nowMsg = el("#nowMsg");
  const nowCoverWrap = el("#nowCoverWrap");
  const nowAmbient = el("#nowAmbient");

  const nowTrackWrap = el("#nowTrackWrap");
  const nowArtistWrap = el("#nowArtistWrap");
  const nowAlbumWrap = el("#nowAlbumWrap");

  // Top UI
  const topList = el("#topList");
  const topTypeBtns = els("[data-top-type]");
  const topPeriodBtns = els("[data-top-period]");

  // Recent UI
  const recentList = el("#recentList");

  let currentTab = "now";
  let topType = "tracks";   // tracks | artists | albums
  let topPeriod = "today";  // today | week | year
  let topLimit = 10;

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
    panels.forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== tab));

    // ambient only on NOW
    if (nowAmbient) nowAmbient.classList.toggle("on", tab === "now");

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

  function setStatus(text) {
    if (statusLine) statusLine.textContent = text;
    if (statusDot) statusDot.classList.toggle("on", text === "Online");
  }

  // Worker returns images like "/img?u=..."
  // Convert to "https://i.errtanq9.workers.dev/img?u=..."
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

  function clearNow() {
    if (nowBadgeText) nowBadgeText.textContent = "OFF";
    if (nowBadge) nowBadge.classList.remove("live");
    if (nowUpdated) nowUpdated.textContent = "--";

    if (nowTrack) nowTrack.textContent = "—";
    if (nowArtist) nowArtist.textContent = "—";
    if (nowAlbum) nowAlbum.textContent = "—";
    if (nowMsg) nowMsg.textContent = "—";

    setNowCover("");
    refreshMarqueeAll();
  }

  function setNowCover(imgUrl) {
    const u = resolveImageUrl(imgUrl);

    // cover aura + ambient background (NOW only)
    if (nowCoverWrap) {
      nowCoverWrap.style.setProperty("--cover-url", u ? `url("${u}")` : "none");
    }
    if (nowAmbient) {
      nowAmbient.style.setProperty("--ambient-url", u ? `url("${u}")` : "none");
    }

    if (u) {
      nowImg.src = u;
      nowImg.style.display = "block";
      nowFallback.style.display = "none";

      nowImg.onload = () => refreshMarqueeAll();
      nowImg.onerror = () => {
        nowImg.removeAttribute("src");
        nowImg.style.display = "none";
        nowFallback.style.display = "grid";
        refreshMarqueeAll();
      };
    } else {
      nowImg.removeAttribute("src");
      nowImg.style.display = "none";
      nowFallback.style.display = "grid";
    }
  }

  // NO-OP click unless item has a *real* Spotify URL/ID.
  // (Right now worker doesn’t provide it, so clicks do nothing.)
  function maybeOpenSpotify(item) {
    const url = item?.spotify_url || item?.spotifyUrl || item?.spotify || item?.url || "";
    const id = item?.spotify_id || item?.spotifyId || "";

    if (typeof url === "string" && url.includes("open.spotify.com/")) {
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    }
    if (typeof id === "string" && id.trim()) {
      // If someday backend gives raw IDs, we could build a link.
      // But we still require it to be unambiguous.
      // For now: NO-OP.
      return false;
    }
    return false;
  }
function makeThumb(imageUrl) {
    const wrap = document.createElement("div");
    wrap.className = "thumb";

    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";

    const fallback = document.createElement("div");
    fallback.className = "thumbFallback";
    fallback.textContent = "♪";

    const u = resolveImageUrl(imageUrl);
    if (u) {
      img.src = u;
      wrap.appendChild(img);
      wrap.appendChild(fallback);
      fallback.style.display = "none";

      img.addEventListener("error", () => {
        img.removeAttribute("src");
        fallback.style.display = "grid";
      });
    } else {
      wrap.appendChild(fallback);
      fallback.style.display = "grid";
    }

    return wrap;
  }

  function rowItem({ idx, title, subtitle, right, imageUrl, rightIsCount = false, itemForClick = null }) {
    const wrap = document.createElement("div");
    wrap.className = "row";

    const thumb = makeThumb(imageUrl);

    const mid = document.createElement("div");
    mid.className = "mid";

    // Title (marquee-ready)
    const tWrap = document.createElement("div");
    tWrap.className = "title marqWrap";

    const t = document.createElement("span");
    t.className = "marq";
    t.textContent = `${idx}. ${title}`;

    tWrap.appendChild(t);

    // Subtitle (marquee-ready)
    const sWrap = document.createElement("div");
    sWrap.className = "sub marqWrap";

    const s = document.createElement("span");
    s.className = "marq";
    s.textContent = subtitle || "";

    sWrap.appendChild(s);

    mid.appendChild(tWrap);
    mid.appendChild(sWrap);

    const r = document.createElement("div");
    r.className = "right" + (rightIsCount ? " count" : "");
    r.textContent = right != null ? String(right) : "";

    wrap.appendChild(thumb);
    wrap.appendChild(mid);
    wrap.appendChild(r);

    // Click behavior: ONLY if item has real Spotify URL (otherwise do nothing)
    if (itemForClick) {
      wrap.style.cursor = "default";
      wrap.addEventListener("click", () => {
        maybeOpenSpotify(itemForClick); // may do nothing
      });
    }

    // marquee detection after attach
    queueMicrotask(() => refreshMarqueeForWrap(tWrap));
    queueMicrotask(() => refreshMarqueeForWrap(sWrap));

    return wrap;
  }

  // ---------------------------
  // Marquee (only when overflow)
  // ---------------------------
  function refreshMarqueeForWrap(wrapEl) {
    if (!wrapEl) return;
    const span = wrapEl.querySelector(".marq");
    if (!span) return;

    // reset
    wrapEl.classList.remove("marqOn");
    wrapEl.style.removeProperty("--marqShift");
    wrapEl.style.removeProperty("--marqDur");

    // Must measure after layout
    const maxW = wrapEl.clientWidth;
    const textW = span.scrollWidth;

    if (textW > maxW + 6) {
      const shift = Math.min(textW - maxW + 24, 900);
      const dur = Math.max(8, Math.min(18, shift / 45)); // responsive speed

      wrapEl.classList.add("marqOn");
      wrapEl.style.setProperty("--marqShift", `${shift}px`);
      wrapEl.style.setProperty("--marqDur", `${dur}s`);
    }
  }

  function refreshMarqueeAll() {
    refreshMarqueeForWrap(nowTrackWrap);
    refreshMarqueeForWrap(nowArtistWrap);
    refreshMarqueeForWrap(nowAlbumWrap);

    els(".marqWrap").forEach((w) => refreshMarqueeForWrap(w));
  }

  // refresh marquee on resize (premium polish)
  let resizeT = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(refreshMarqueeAll, 140);
  });

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
    if (nowUpdated) nowUpdated.textContent = fmtTime(Date.now());
    if (nowMsg) nowMsg.textContent = "Loading…";

    try {
      const j = await safeFetchJson("/api/now");
      if (nowUpdated) nowUpdated.textContent = fmtTime(Date.now());

      const item = j?.item;
      if (!item) {
        if (nowMsg) nowMsg.textContent = "Not playing now";
        if (nowBadgeText) nowBadgeText.textContent = "OFF";
        if (nowBadge) nowBadge.classList.remove("live");
        setNowCover("");
        refreshMarqueeAll();
        return;
      }

      if (nowBadgeText) nowBadgeText.textContent = "LIVE";
      if (nowBadge) nowBadge.classList.add("live");

      if (nowTrack) nowTrack.textContent = item.name || "—";
      if (nowArtist) nowArtist.textContent = item.artist || "—";
      if (nowAlbum) nowAlbum.textContent = item.album || "—";
      if (nowMsg) nowMsg.textContent = "Now";

      setNowCover(item.image || "");
      refreshMarqueeAll();
    } catch (e) {
      if (nowMsg) nowMsg.textContent = `Error: ${String(e.message || e)}`;
      if (nowBadgeText) nowBadgeText.textContent = "OFF";
      if (nowBadge) nowBadge.classList.remove("live");
      setNowCover("");
      refreshMarqueeAll();
    }
  }

  // ---------------------------
  // Fetch + Render: /api/history
  // ---------------------------
  async function refreshRecent() {
    recentList.innerHTML = "";

    // lightweight skeleton
    for (let i = 0; i < 6; i++) {
      recentList.appendChild(
        rowItem({ idx: i + 1, title: "…", subtitle: "…", right: "", imageUrl: "" })
      );
    }

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
            imageUrl: it.image || "",
            itemForClick: it
          })
        );
      });

      if (!items.length) {
        recentList.innerHTML = "";
        recentList.appendChild(
          rowItem({ idx: 1, title: "No recent history", subtitle: "", right: "", imageUrl: "" })
        );
      }

      refreshMarqueeAll();
    } catch (e) {
      recentList.innerHTML = "";
      recentList.appendChild(
        rowItem({ idx: 1, title: "Error", subtitle: String(e.message || e), right: "", imageUrl: "" })
      );
      refreshMarqueeAll();
    }
  }
// ---------------------------
  // Fetch + Render: /api/top
  // ---------------------------
  async function refreshTop() {
    topList.innerHTML = "";

    // lightweight skeleton
    for (let i = 0; i < 8; i++) {
      topList.appendChild(
        rowItem({ idx: i + 1, title: "…", subtitle: "…", right: "—", imageUrl: "" })
      );
    }

    const path = `/api/top?type=${encodeURIComponent(topType)}&period=${encodeURIComponent(topPeriod)}&limit=${encodeURIComponent(topLimit)}`;

    try {
      const j = await safeFetchJson(path);
      const items = j?.items || [];

      topList.innerHTML = "";

      items.forEach((it, i) => {
        if (topType === "artists") {
          topList.appendChild(
            rowItem({
              idx: i + 1,
              title: it.name || "—",
              subtitle: "",
              right: it.playcount ?? "",
              rightIsCount: true,
              imageUrl: it.image || "",
              itemForClick: it
            })
          );
        } else if (topType === "albums") {
          topList.appendChild(
            rowItem({
              idx: i + 1,
              title: it.name || "—",
              subtitle: it.artist || "",
              right: it.playcount ?? "",
              rightIsCount: true,
              imageUrl: it.image || "",
              itemForClick: it
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
              rightIsCount: true,
              imageUrl: it.image || "",
              itemForClick: it
            })
          );
        }
      });

      if (!items.length) {
        topList.innerHTML = "";
        topList.appendChild(
          rowItem({ idx: 1, title: "No top data", subtitle: "", right: "", imageUrl: "" })
        );
      }

      refreshMarqueeAll();
    } catch (e) {
      topList.innerHTML = "";
      topList.appendChild(
        rowItem({ idx: 1, title: "Error", subtitle: String(e.message || e), right: "", imageUrl: "" })
      );
      refreshMarqueeAll();
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

    // auto refresh ping + now (lightweight, premium feel)
    setInterval(refreshPing, 15000);
    setInterval(() => {
      if (currentTab === "now") refreshNow();
    }, 15000);
  }

  init();
})();