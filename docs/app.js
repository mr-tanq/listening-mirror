/* Listening Mirror UI — Worker base fixed */
(() => {
  "use strict";

  const WORKER_BASE = "https://i.errtanq9.workers.dev";

  const el = (s) => document.querySelector(s);
  const els = (s) => Array.from(document.querySelectorAll(s));

  const statusLine = el("#statusLine");
  const statusDot = el("#statusDot");
  const btnRefresh = el("#btnRefresh");

  const panels = els(".panel");
  const tabBtns = els(".tabBtn");

  // Now
  const nowUpdated = el("#nowUpdated");
  const nowBadge = el("#nowBadge");
  const nowImg = el("#nowImg");
  const nowFallback = el("#nowFallback");
  const nowTrack = el("#nowTrack");
  const nowArtist = el("#nowArtist");
  const nowAlbum = el("#nowAlbum");
  const nowMsg = el("#nowMsg");
  const workerHint = el("#workerHint");

  // Top
  const topMeta = el("#topMeta");
  const topBadge = el("#topBadge");
  const topList = el("#topList");
  const topTypeBtns = els("[data-top-type]");
  const topPeriodBtns = els("[data-top-period]");

  // Recent
  const recentMeta = el("#recentMeta");
  const recentList = el("#recentList");

  // Insight
  const insMeta = el("#insMeta");
  const insBadge = el("#insBadge");
  const insPeriodBtns = els("[data-ins-period]");
  const barEnergy = el("#barEnergy");
  const barValence = el("#barValence");
  const barFocus = el("#barFocus");
  const barNovelty = el("#barNovelty");
  const valEnergy = el("#valEnergy");
  const valValence = el("#valValence");
  const valFocus = el("#valFocus");
  const valNovelty = el("#valNovelty");
  const insBullets = el("#insBullets");

  let currentTab = "now";
  let topType = "tracks";
  let topPeriod = "today";
  let topLimit = 20;

  let insPeriod = "today";

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
    if (tab === "insight") refreshInsight();
  }

  function fmtTime(ts = Date.now()) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "--";
    }
  }

  function setStatus(ok) {
    if (statusLine) statusLine.textContent = ok ? "Online" : "Offline";
    if (statusDot) statusDot.classList.toggle("ok", !!ok);
  }

  function resolveImageUrl(u) {
    if (!u) return "";
    const s = String(u);
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    if (s.startsWith("/")) return WORKER_BASE + s;
    return "";
  }

  async function safeFetchJson(path) {
    const url = WORKER_BASE + path;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);

    try {
      const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      const text = await r.text();
      let j = null;
      try { j = JSON.parse(text); } catch { j = null; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (!j) throw new Error("Bad JSON");
      return j;
    } finally {
      clearTimeout(t);
    }
  }
// ---------------------------
  // Now Playing
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

      nowTrack.textContent = item.name || "—";
      nowArtist.textContent = item.artist || "—";
      nowAlbum.textContent = item.album || "—";
      nowMsg.textContent = "Now playing";

      setNowCover(item.image || "");
    } catch (e) {
      nowMsg.textContent = "Error loading now playing";
      nowBadge.textContent = "OFF";
      nowBadge.classList.remove("live");
      setNowCover("");
    }
  }

  // ---------------------------
  // Row item
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
    t.textContent = `${idx}. ${title}`;

    const s = document.createElement("div");
    s.className = "sub";
    s.textContent = subtitle || "";

    mid.appendChild(t);
    mid.appendChild(s);

    const r = document.createElement("div");
    r.className = "right";
    r.textContent = right != null ? String(right) : "";

    wrap.appendChild(cover);
    wrap.appendChild(mid);
    wrap.appendChild(r);

    return wrap;
  }
// ---------------------------
  // Top
  // ---------------------------
  async function refreshTop() {
    topMeta.textContent = "Loading…";
    topList.innerHTML = "";

    const path = `/api/top?type=${encodeURIComponent(topType)}&period=${encodeURIComponent(topPeriod)}&limit=${encodeURIComponent(topLimit)}`;

    try {
      const j = await safeFetchJson(path);
      const items = j?.items || [];

      topMeta.textContent = `${topType} • ${topPeriod}`;
      topBadge.textContent = String(items.length);

      items.forEach((it, i) => {
        topList.appendChild(
          rowItem({
            idx: i + 1,
            title: it.name || "—",
            subtitle: it.artist || "",
            right: it.playcount ?? "",
            imageUrl: it.image || ""
          })
        );
      });

      if (!items.length) topMeta.textContent = "No top data returned.";
    } catch (e) {
      topMeta.textContent = "Error loading top";
      topList.innerHTML = "";
    }
  }

  // ---------------------------
  // Recent
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
    } catch (e) {
      recentMeta.textContent = "Error loading recent";
      recentList.innerHTML = "";
    }
  }

  // ---------------------------
  // Insight (UI-only)
  // ---------------------------
  function clamp01(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function setBar(fillEl, value01) {
    const v = clamp01(value01);
    fillEl.style.width = `${Math.round(v * 100)}%`;
    // no hardcoded colors; keep default (browser will use inherited background)
    // We'll set background inline to keep it visible without picking a brand color
    fillEl.style.background = "rgba(255,255,255,.22)";
  }

  function setBullets(listEl, bullets) {
    listEl.innerHTML = "";
    (bullets || []).slice(0, 6).forEach((b) => {
      const li = document.createElement("li");
      li.textContent = String(b);
      listEl.appendChild(li);
    });
  }

  async function refreshInsight() {
    insMeta.textContent = "Loading…";
    insBadge.textContent = insPeriod;

    setBar(barEnergy, 0);
    setBar(barValence, 0);
    setBar(barFocus, 0);
    setBar(barNovelty, 0);
    valEnergy.textContent = "—";
    valValence.textContent = "—";
    valFocus.textContent = "—";
    valNovelty.textContent = "—";
    setBullets(insBullets, []);

    try {
      const j = await safeFetchJson(`/api/insight?period=${encodeURIComponent(insPeriod)}&limit=50`);
      if (!j?.ok) throw new Error(j?.error || "Insight error");

      const s = j?.summary || {};

      setBar(barEnergy, s.energy);
      setBar(barValence, s.valence);
      setBar(barFocus, s.focus);
      setBar(barNovelty, s.novelty);

      valEnergy.textContent = `Energy: ${Math.round(clamp01(s.energy) * 100)}%`;
      valValence.textContent = `Valence: ${Math.round(clamp01(s.valence) * 100)}%`;
      valFocus.textContent = `Focus: ${Math.round(clamp01(s.focus) * 100)}%`;
      valNovelty.textContent = `Novelty: ${Math.round(clamp01(s.novelty) * 100)}%`;

      setBullets(insBullets, j?.bullets || []);
      insMeta.textContent = `${j?.window || insPeriod} • ${j?.count || 0} plays`;
    } catch (e) {
      insMeta.textContent = "Insight not available (AI not configured yet)";
      setBullets(insBullets, ["Connect AI provider in the Worker to enable insight."]);
    }
  }
// ---------------------------
  // Ping
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
  // Wire UI
  // ---------------------------
  function init() {
    if (workerHint) workerHint.textContent = WORKER_BASE;

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

    insPeriodBtns.forEach((b) => {
      b.addEventListener("click", () => {
        insPeriod = String(b.dataset.insPeriod || "today");
        setSelected(insPeriodBtns, (x) => x === b);
        refreshInsight();
      });
    });

    if (btnRefresh) {
      btnRefresh.addEventListener("click", async () => {
        await refreshPing();
        if (currentTab === "now") refreshNow();
        if (currentTab === "top") refreshTop();
        if (currentTab === "recent") refreshRecent();
        if (currentTab === "insight") refreshInsight();
      });
    }

    setSelected(tabBtns, (b) => b.dataset.tab === "now");
    setSelected(topTypeBtns, (b) => (b.dataset.topType || "") === "tracks");
    setSelected(topPeriodBtns, (b) => (b.dataset.topPeriod || "") === "today");
    setSelected(insPeriodBtns, (b) => (b.dataset.insPeriod || "") === "today");

    refreshPing();
    showTab("now");

    setInterval(refreshPing, 15000);
    setInterval(() => { if (currentTab === "now") refreshNow(); }, 15000);
  }

  init();
})();