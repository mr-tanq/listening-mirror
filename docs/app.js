(() => {
  "use strict";

  const WORKER_BASE = "https://i.errtanq9.workers.dev";

  const el = (sel) => document.querySelector(sel);
  const els = (sel) => Array.from(document.querySelectorAll(sel));

  const statusLine = el("#statusLine");
  const statusDot = el("#statusDot");

  const panels = els(".panel");
  const tabBtns = els(".tabBtn");

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

  const topList = el("#topList");
  const topTypeBtns = els("[data-top-type]");
  const topPeriodBtns = els("[data-top-period]");

  const recentList = el("#recentList");

  let currentTab = "now";
  let topType = "tracks";
  let topPeriod = "today";
  const topLimit = 10;

  function setSelected(btns, predicate) {
    btns.forEach((b) => b.setAttribute("aria-selected", predicate(b) ? "true" : "false"));
  }

  function showTab(tab) {
    currentTab = tab;
    setSelected(tabBtns, (b) => b.dataset.tab === tab);
    panels.forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== tab));

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
      const text = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

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

    if (nowCoverWrap) nowCoverWrap.style.setProperty("--cover-url", u ? `url("${u}")` : "none");
    if (nowAmbient) nowAmbient.style.setProperty("--ambient-url", u ? `url("${u}")` : "none");

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

  function setLive(isLive) {
    if (!nowBadge || !nowBadgeText) return;
    if (isLive) {
      nowBadgeText.textContent = "LIVE";
      nowBadge.classList.add("live");
    } else {
      nowBadgeText.textContent = "OFF";
      nowBadge.classList.remove("live");
    }
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

  function rowItem({ idx, title, subtitle, right, imageUrl, rightIsCount = false }) {
    const wrap = document.createElement("div");
    wrap.className = "row";

    const thumb = makeThumb(imageUrl);

    const mid = document.createElement("div");
    mid.className = "mid";

    const tWrap = document.createElement("div");
    tWrap.className = "title marqWrap";
    const t = document.createElement("span");
    t.className = "marq";
    t.textContent = `${idx}. ${title}`;
    tWrap.appendChild(t);

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

    queueMicrotask(() => refreshMarqueeForWrap(tWrap));
    queueMicrotask(() => refreshMarqueeForWrap(sWrap));

    return wrap;
  }

  // marquee only if overflow
  function refreshMarqueeForWrap(wrapEl) {
    if (!wrapEl) return;
    const span = wrapEl.querySelector(".marq");
    if (!span) return;

    wrapEl.classList.remove("marqOn");
    wrapEl.style.removeProperty("--marqShift");
    wrapEl.style.removeProperty("--marqDur");

    const maxW = wrapEl.clientWidth;
    const textW = span.scrollWidth;

    if (textW > maxW + 6) {
      const shift = Math.min(textW - maxW + 24, 900);
      const dur = Math.max(8, Math.min(18, shift / 45));
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

  let resizeT = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(refreshMarqueeAll, 140);
  });

  async function refreshPing() {
    try {
      const j = await safeFetchJson("/api/ping");
      setStatus(j?.ok ? "Online" : "Offline");
    } catch {
      setStatus("Offline");
    }
  }

  async function refreshNow() {
    if (nowUpdated) nowUpdated.textContent = fmtTime(Date.now());
    if (nowMsg) nowMsg.textContent = "Loading…";
    setLive(false);

    try {
      const j = await safeFetchJson("/api/now");
      if (nowUpdated) nowUpdated.textContent = fmtTime(Date.now());

      const item = j?.item || j?.now || j?.track || null;

      if (!item) {
        if (nowTrack) nowTrack.textContent = "—";
        if (nowArtist) nowArtist.textContent = "—";
        if (nowAlbum) nowAlbum.textContent = "—";
        if (nowMsg) nowMsg.textContent = "Not playing now";
        setNowCover("");
        setLive(false);
        refreshMarqueeAll();
        return;
      }

      setLive(true);

      if (nowTrack) nowTrack.textContent = item.name || item.track || "—";
      if (nowArtist) nowArtist.textContent = item.artist || "—";
      if (nowAlbum) nowAlbum.textContent = item.album || "—";
      if (nowMsg) nowMsg.textContent = "Now playing";

      setNowCover(item.image || item.cover || "");
      refreshMarqueeAll();
    } catch (e) {
      if (nowMsg) nowMsg.textContent = `Error: ${String(e.message || e)}`;
      setNowCover("");
      setLive(false);
      refreshMarqueeAll();
    }
  }
function normalizeItems(j) {
    // Accept multiple shapes from worker
    if (Array.isArray(j)) return j;
    if (Array.isArray(j?.items)) return j.items;
    if (Array.isArray(j?.data)) return j.data;
    if (Array.isArray(j?.top)) return j.top;
    if (Array.isArray(j?.recent)) return j.recent;
    if (Array.isArray(j?.history)) return j.history;
    return [];
  }

  async function refreshRecent() {
    recentList.innerHTML = "";
    recentList.appendChild(rowItem({ idx: 1, title: "Loading…", subtitle: "", right: "", imageUrl: "" }));

    try {
      // keep your known endpoint
      const j = await safeFetchJson("/api/history?limit=10");
      const items = normalizeItems(j);

      recentList.innerHTML = "";
      if (!items.length) {
        recentList.appendChild(rowItem({ idx: 1, title: "No recent history", subtitle: "", right: "", imageUrl: "" }));
        return;
      }

      items.forEach((it, i) => {
        recentList.appendChild(
          rowItem({
            idx: i + 1,
            title: it.name || it.track || "—",
            subtitle: it.artist || "",
            right: "",
            imageUrl: it.image || it.cover || ""
          })
        );
      });

      refreshMarqueeAll();
    } catch (e) {
      recentList.innerHTML = "";
      recentList.appendChild(rowItem({ idx: 1, title: "Error", subtitle: String(e.message || e), right: "", imageUrl: "" }));
      refreshMarqueeAll();
    }
  }

  async function refreshTop() {
    topList.innerHTML = "";
    topList.appendChild(rowItem({ idx: 1, title: "Loading…", subtitle: "", right: "", imageUrl: "" }));

    const path = `/api/top?type=${encodeURIComponent(topType)}&period=${encodeURIComponent(topPeriod)}&limit=${encodeURIComponent(topLimit)}`;

    try {
      const j = await safeFetchJson(path);
      const items = normalizeItems(j);

      topList.innerHTML = "";
      if (!items.length) {
        topList.appendChild(rowItem({ idx: 1, title: "No top data", subtitle: "", right: "", imageUrl: "" }));
        return;
      }

      items.forEach((it, i) => {
        const title =
          topType === "artists" ? (it.name || it.artist || "—") :
          (it.name || it.track || "—");

        const subtitle =
          topType === "albums" ? (it.artist || "") :
          topType === "tracks" ? (it.artist || "") : "";

        const count = it.playcount ?? it.count ?? it.plays ?? "";

        topList.appendChild(
          rowItem({
            idx: i + 1,
            title,
            subtitle,
            right: count,
            rightIsCount: true,
            imageUrl: it.image || it.cover || ""
          })
        );
      });

      refreshMarqueeAll();
    } catch (e) {
      topList.innerHTML = "";
      topList.appendChild(rowItem({ idx: 1, title: "Error", subtitle: String(e.message || e), right: "", imageUrl: "" }));
      refreshMarqueeAll();
    }
  }

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

    setInterval(refreshPing, 15000);
    setInterval(() => { if (currentTab === "now") refreshNow(); }, 15000);
  }

  init();
})();