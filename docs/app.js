/* app.js (FULL) - Listening Mirror UI
   Worker base is fixed: https://i.errtanq9.workers.dev
   - No Settings, no Refresh button, no pull-to-refresh logic
   - Keeps artwork working (worker returns "/img?u=..." -> we prefix WORKER_BASE)
*/

(() => {
  "use strict";

  const WORKER_BASE = "https://i.errtanq9.workers.dev";

  const el = (sel) => document.querySelector(sel);
  const els = (sel) => Array.from(document.querySelectorAll(sel));

  // Header
  const statusLine = el("#statusLine");
  const statusDot = el("#statusDot");

  // Tabs
  const panels = els(".panel");
  const tabBtns = els(".tabBtn");

  // Now UI
  const nowUpdated = el("#nowUpdated");
  const nowBadge = el("#nowBadge");
  const nowBadgeText = el("#nowBadgeText");
  const nowAmbient = el("#nowAmbient");
  const nowCoverWrap = el("#nowCoverWrap");
  const nowImg = el("#nowImg");
  const nowFallback = el("#nowFallback");
  const nowTrackWrap = el("#nowTrackWrap");
  const nowArtistWrap = el("#nowArtistWrap");
  const nowAlbumWrap = el("#nowAlbumWrap");
  const nowTrack = el("#nowTrack");
  const nowArtist = el("#nowArtist");
  const nowAlbum = el("#nowAlbum");
  const nowMsg = el("#nowMsg");

  // Top UI
  const topList = el("#topList");
  const topTypeBtns = els("[data-top-type]");
  const topPeriodBtns = els("[data-top-period]");

  // Recent UI
  const recentList = el("#recentList");

  let currentTab = "now";
  let topType = "tracks";   // tracks | artists | albums
  let topPeriod = "today";  // today | week | year
  const topLimit = 10;

  // ---------------------------
  // URL helpers (THIS fixes your Not found)
  // ---------------------------
  function baseNoSlash() {
    return WORKER_BASE.replace(/\/+$/, "");
  }
  function joinApi(path) {
    const p = String(path || "");
    const clean = p.startsWith("/") ? p : ("/" + p);
    return baseNoSlash() + clean;
  }

  // Worker returns images like "/img?u=..."
  function resolveImageUrl(u) {
    if (!u) return "";
    const s = String(u).trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    if (s.startsWith("/")) return baseNoSlash() + s;
    // if ever returns "img?u=..." without slash
    if (s.startsWith("img?")) return baseNoSlash() + "/" + s;
    return s;
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
    if (statusDot) statusDot.classList.toggle("on", !!online);
  }

  async function safeFetchJson(path) {
    const url = joinApi(path);

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
  // Marquee logic (moves text only if it overflows)
  // Works for elements that have:
  // - wrapper div (overflow hidden)
  // - inner span with class "marq"
  // ---------------------------
  function applyMarquee(wrapEl, marqEl) {
    if (!wrapEl || !marqEl) return;

    // reset
    wrapEl.classList.remove("marqOn");
    wrapEl.style.removeProperty("--marqShift");
    wrapEl.style.removeProperty("--marqDur");

    // Need next frame so layout is accurate
    requestAnimationFrame(() => {
      const wrapW = wrapEl.clientWidth || 0;
      const textW = marqEl.scrollWidth || 0;

      if (textW > wrapW + 6) {
        const shift = textW - wrapW + 18; // extra breathing room
        const dur = Math.min(18, Math.max(8, shift / 35)); // 8s..18s
        wrapEl.style.setProperty("--marqShift", `${shift}px`);
        wrapEl.style.setProperty("--marqDur", `${dur}s`);
        wrapEl.classList.add("marqOn");
      }
    });
  }

  // ---------------------------
  // Row builder (keeps artwork working + marquee + premium counts)
  // ---------------------------
  function rowItem({ idx, title, subtitle, right, imageUrl }) {
    const wrap = document.createElement("div");
    wrap.className = "row";

    // Thumb
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
        try { img.removeAttribute("src"); } catch {}
        icon.style.display = "grid";
      });
    } else {
      thumb.appendChild(icon);
      icon.style.display = "grid";
    }

    // Middle (title + subtitle) with marquee
    const mid = document.createElement("div");
    mid.className = "mid";

    // Title wrap
    const tWrap = document.createElement("div");
    tWrap.className = "tWrap";

    const tSpan = document.createElement("span");
    tSpan.className = "marq";
    tSpan.textContent = `${idx}. ${title}`;

    tWrap.appendChild(tSpan);

    // Subtitle wrap
    const sWrap = document.createElement("div");
    sWrap.className = "sWrap";
    sWrap.style.marginTop = "6px";

    const sSpan = document.createElement("span");
    sSpan.className = "marq";
    sSpan.textContent = subtitle || "";

    sWrap.appendChild(sSpan);

    mid.appendChild(tWrap);
    mid.appendChild(sWrap);

    // Right count
    const r = document.createElement("div");
    r.className = "right";
    if (right !== "" && right != null) {
      r.textContent = String(right);
      r.classList.add("count");
    } else {
      r.textContent = "";
    }

    wrap.appendChild(thumb);
    wrap.appendChild(mid);
    wrap.appendChild(r);

    // Apply marquee after inserted in DOM (we’ll call it again after render)
    wrap._marq = { tWrap, tSpan, sWrap, sSpan };

    return wrap;
  }

  // ---------------------------
  // Tabs
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

  // ---------------------------
  // /api/ping
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
  // NOW
  // ---------------------------
  function clearNow() {
    nowBadge.classList.remove("live");
    nowBadgeText.textContent = "OFF";
    nowUpdated.textContent = "--";
    nowTrack.textContent = "—";
    nowArtist.textContent = "—";
    nowAlbum.textContent = "—";
    nowMsg.textContent = "—";
    setNowCover("");
    setAmbient("");
  }

  function setAmbient(imgUrl) {
    if (!nowAmbient) return;
    const u = resolveImageUrl(imgUrl);
    if (!u) {
      nowAmbient.classList.remove("on");
      nowAmbient.style.removeProperty("--ambient-url");
      return;
    }
    nowAmbient.style.setProperty("--ambient-url", `url("${u}")`);
    nowAmbient.classList.add("on");
  }

  function setNowCover(imgUrl) {
    const u = resolveImageUrl(imgUrl);
    if (u) {
      nowImg.src = u;
      nowImg.style.display = "block";
      nowFallback.style.display = "none";
      if (nowCoverWrap) nowCoverWrap.style.setProperty("--cover-url", `url("${u}")`);
    } else {
      try { nowImg.removeAttribute("src"); } catch {}
      nowImg.style.display = "none";
      nowFallback.style.display = "grid";
      if (nowCoverWrap) nowCoverWrap.style.removeProperty("--cover-url");
    }
  }

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
        nowBadgeText.textContent = "OFF";
        nowBadge.classList.remove("live");
        setNowCover("");
        setAmbient("");
        return;
      }

      nowBadgeText.textContent = "LIVE";
      nowBadge.classList.add("live");

      nowTrack.textContent = item.name || "—";
      nowArtist.textContent = item.artist || "—";
      nowAlbum.textContent = item.album || "—";
      nowMsg.textContent = "";

      setNowCover(item.image || "");
      setAmbient(item.image || "");

      // Marquee (only if needed)
      applyMarquee(nowTrackWrap, nowTrack);
      applyMarquee(nowArtistWrap, nowArtist);
      applyMarquee(nowAlbumWrap, nowAlbum);
    } catch (e) {
      nowMsg.textContent = `Error: ${String(e?.message || e)}`;
      nowBadgeText.textContent = "OFF";
      nowBadge.classList.remove("live");
      setNowCover("");
      setAmbient("");
    }
  }

  // ---------------------------
  // RECENT
  // ---------------------------
  async function refreshRecent() {
    recentList.innerHTML = "";

    try {
      const j = await safeFetchJson("/api/history?limit=10");
      const items = j?.items || [];

      items.forEach((it, i) => {
        const row = rowItem({
          idx: i + 1,
          title: it.name || "—",
          subtitle: it.artist || "",
          right: "",
          imageUrl: it.image || ""
        });
        recentList.appendChild(row);
      });

      // Apply marquee after DOM insertion
      requestAnimationFrame(() => {
        const rows = Array.from(recentList.querySelectorAll(".row"));
        rows.forEach((r) => {
          const m = r._marq;
          if (m) {
            applyMarquee(m.tWrap, m.tSpan);
            applyMarquee(m.sWrap, m.sSpan);
          }
        });
      });
    } catch (e) {
      recentList.innerHTML = "";
      const row = rowItem({ idx: 1, title: "Error", subtitle: String(e?.message || e), right: "", imageUrl: "" });
      recentList.appendChild(row);
    }
  }

  // ---------------------------
  // TOP
  // ---------------------------
  async function refreshTop() {
    topList.innerHTML = "";

    const path =
      `/api/top?type=${encodeURIComponent(topType)}&period=${encodeURIComponent(topPeriod)}&limit=${encodeURIComponent(topLimit)}`;

    try {
      const j = await safeFetchJson(path);
      const items = j?.items || [];

      items.forEach((it, i) => {
        if (topType === "artists") {
          const row = rowItem({
            idx: i + 1,
            title: it.name || "—",
            subtitle: "",
            right: it.playcount ?? "",
            imageUrl: it.image || ""
          });
          topList.appendChild(row);
        } else if (topType === "albums") {
          const row = rowItem({
            idx: i + 1,
            title: it.name || "—",
            subtitle: it.artist || "",
            right: it.playcount ?? "",
            imageUrl: it.image || ""
          });
          topList.appendChild(row);
        } else {
          const row = rowItem({
            idx: i + 1,
            title: it.name || "—",
            subtitle: it.artist || "",
            right: it.playcount ?? "",
            imageUrl: it.image || ""
          });
          topList.appendChild(row);
        }
      });

      // Apply marquee after DOM insertion
      requestAnimationFrame(() => {
        const rows = Array.from(topList.querySelectorAll(".row"));
        rows.forEach((r) => {
          const m = r._marq;
          if (m) {
            applyMarquee(m.tWrap, m.tSpan);
            applyMarquee(m.sWrap, m.sSpan);
          }
        });
      });
    } catch (e) {
      topList.innerHTML = "";
      const row = rowItem({ idx: 1, title: "Error", subtitle: String(e?.message || e), right: "", imageUrl: "" });
      topList.appendChild(row);
    }
  }

  // ---------------------------
  // Init
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

    refreshPing();
    showTab("now");

    // auto refresh ping + now
    setInterval(refreshPing, 15000);
    setInterval(() => {
      if (currentTab === "now") refreshNow();
    }, 15000);
  }

  init();
})();