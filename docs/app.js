/* Listening Mirror UI (hardcoded Worker base)
   - No Settings
   - Worker: https://i.errtanq9.workers.dev
*/
(() => {
  "use strict";

  // ✅ Hardcoded Worker base URL (με https)
  const WORKER_BASE = "https://i.errtanq9.workers.dev";

  const el = (sel) => document.querySelector(sel);
  const els = (sel) => Array.from(document.querySelectorAll(sel));

  const statusLine = el("#statusLine");
  const workerHint = el("#workerHint");
  const btnRefresh = el("#btnRefresh");

  const panels = els(".panel");
  const tabBtns = els(".tabBtn");

  // Now UI
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

  let currentTab = "now";
  let topType = "tracks";
  let topPeriod = "today";

  workerHint.textContent = WORKER_BASE;

  function setSelected(btns, predicate) {
    btns.forEach(b => b.setAttribute("aria-selected", predicate(b) ? "true" : "false"));
  }

  function showTab(tab) {
    currentTab = tab;

    setSelected(tabBtns, b => b.dataset.tab === tab);
    panels.forEach(p => {
      const isThis = p.dataset.panel === tab;
      p.classList.toggle("hidden", !isThis);
    });

    // Fetch on tab switch
    if (tab === "now") refreshNow();
    if (tab === "top") refreshTop();
    if (tab === "recent") refreshRecent();
  }

  async function safeFetchJson(path) {
    const url = WORKER_BASE + path;

    // 12s timeout για κινητό
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);

    try {
      const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      const text = await r.text();

      if (!r.ok) {
        // αν μας γύρισε HTML (π.χ. 404 page), δείχνουμε καθαρό error
        const looksHtml = text.trim().startsWith("<!DOCTYPE") || ct.includes("text/html");
        const msg = looksHtml ? `HTTP ${r.status} (HTML)` : `HTTP ${r.status}`;
        throw new Error(msg);
      }

      // must be JSON
      let j = null;
      try { j = JSON.parse(text); } catch { j = null; }
      if (!j) throw new Error("Bad JSON");
      return j;
    } finally {
      clearTimeout(t);
    }
  }

  function fmtTime(ts = Date.now()) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "—";
    }
  }

  function setStatus(msg) {
    statusLine.textContent = msg;
  }
function setCover(imgUrl) {
    if (imgUrl) {
      nowImg.src = imgUrl;
      nowImg.style.display = "block";
      nowFallback.style.display = "none";
    } else {
      nowImg.removeAttribute("src");
      nowImg.style.display = "none";
      nowFallback.style.display = "grid";
    }
  }

  function listRow({ title, sub, right, image }) {
    const row = document.createElement("div");
    row.className = "rowItem";

    const cover = document.createElement("div");
    cover.className = "cover";
    cover.style.width = "56px";
    cover.style.height = "56px";
    cover.style.borderRadius = "16px";

    const img = document.createElement("img");
    img.alt = "";
    img.style.display = "none";

    const fallback = document.createElement("div");
    fallback.className = "coverFallback";
    fallback.textContent = "♪";

    if (image) {
      img.src = image;
      img.style.display = "block";
      fallback.style.display = "none";
      cover.appendChild(img);
      cover.appendChild(fallback);
    } else {
      cover.appendChild(img);
      cover.appendChild(fallback);
    }

    const main = document.createElement("div");
    main.className = "rowMain";

    const top = document.createElement("div");
    top.className = "rowTop";

    const t = document.createElement("div");
    t.className = "rowTitle";
    t.textContent = title || "—";

    const r = document.createElement("div");
    r.className = "rowRight";
    r.textContent = right || "";

    top.appendChild(t);
    top.appendChild(r);

    const s = document.createElement("div");
    s.className = "rowSub";
    s.textContent = sub || "";

    main.appendChild(top);
    if (sub) main.appendChild(s);

    row.appendChild(cover);
    row.appendChild(main);
    return row;
  }

  async function refreshPing() {
    try {
      const j = await safeFetchJson("/api/ping");
      if (j?.ok) setStatus("Online");
      else setStatus("Offline");
    } catch {
      setStatus("Offline");
    }
  }

  async function refreshNow() {
    nowUpdated.textContent = `Updated: ${fmtTime()}`;
    nowBadge.textContent = "…";
    nowMsg.textContent = "Loading…";

    try {
      const j = await safeFetchJson("/api/now");
      const item = j?.item || null;

      if (!item) {
        nowBadge.textContent = "OFF";
        nowTrack.textContent = "—";
        nowArtist.textContent = "—";
        nowAlbum.textContent = "—";
        nowMsg.textContent = "Not playing now";
        setCover("");
        return;
      }

      nowBadge.textContent = "LIVE";
      nowTrack.textContent = item.name || "—";
      nowArtist.textContent = item.artist || "—";
      nowAlbum.textContent = item.album || "—";
      nowMsg.textContent = "Now playing";
      setCover(item.image || "");
    } catch (e) {
      nowBadge.textContent = "ERR";
      nowMsg.textContent = `Error: ${String(e?.message || e)}`;
      setCover("");
    }
  }

  async function refreshTop() {
    topMeta.textContent = `${topType} • ${topPeriod}`;
    topBadge.textContent = "…";
    topList.innerHTML = "";

    try {
      const q = `?type=${encodeURIComponent(topType)}&period=${encodeURIComponent(topPeriod)}&limit=20`;
      const j = await safeFetchJson("/api/top" + q);
      const items = Array.isArray(j?.items) ? j.items : [];

      topBadge.textContent = items.length ? `${items.length}` : "0";

      if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "rowItem";
        empty.textContent = "No top data returned.";
        topList.appendChild(empty);
        return;
      }

      items.forEach((it, idx) => {
        if (topType === "artists") {
          topList.appendChild(listRow({
            title: `${idx + 1}. ${it?.name || "—"}`,
            sub: "",
            right: it?.playcount ? `${it.playcount}` : "",
            image: it?.image || ""
          }));
          return;
        }

        // tracks / albums
        const title = `${idx + 1}. ${it?.name || "—"}`;
        const sub = it?.artist ? it.artist : "";
        topList.appendChild(listRow({
          title,
          sub,
          right: it?.playcount ? `${it.playcount}` : "",
          image: it?.image || ""
        }));
      });
    } catch (e) {
      topBadge.textContent = "ERR";
      const err = document.createElement("div");
      err.className = "danger";
      err.textContent = `Error: ${String(e?.message || e)}`;
      topList.appendChild(err);
    }
  }
async function refreshRecent() {
    recentMeta.textContent = "Loading…";
    recentList.innerHTML = "";

    try {
      const j = await safeFetchJson("/api/history?limit=10");
      const items = Array.isArray(j?.items) ? j.items : [];

      recentMeta.textContent = items.length ? `${items.length} items` : "0 items";

      if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "rowItem";
        empty.textContent = "No recent history returned.";
        recentList.appendChild(empty);
        return;
      }

      items.forEach((it, idx) => {
        recentList.appendChild(listRow({
          title: `${idx + 1}. ${it?.name || "—"}`,
          sub: it?.artist || "",
          right: "",
          image: it?.image || ""
        }));
      });
    } catch (e) {
      recentMeta.textContent = "Error";
      const err = document.createElement("div");
      err.className = "danger";
      err.textContent = `Error: ${String(e?.message || e)}`;
      recentList.appendChild(err);
    }
  }

  // Events
  tabBtns.forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));

  topTypeBtns.forEach(b => b.addEventListener("click", () => {
    topType = b.dataset.topType;
    setSelected(topTypeBtns, x => x.dataset.topType === topType);
    refreshTop();
  }));

  topPeriodBtns.forEach(b => b.addEventListener("click", () => {
    topPeriod = b.dataset.topPeriod;
    setSelected(topPeriodBtns, x => x.dataset.topPeriod === topPeriod);
    refreshTop();
  }));

  btnRefresh.addEventListener("click", () => {
    refreshPing();
    if (currentTab === "now") refreshNow();
    if (currentTab === "top") refreshTop();
    if (currentTab === "recent") refreshRecent();
  });

  // Boot
  refreshPing();
  showTab("now");

  // Optional SW register (αν υπάρχει)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();