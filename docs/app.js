/* ===== app.js (FULL REPLACE) — Part 1/4 ===== */
(() => {
  "use strict";

  const DEFAULT_API = "https://i.errtanq9.workers.dev";
  const POLL_MS = 15000;

  const urlParams = new URLSearchParams(location.search);
  const API_BASE = (urlParams.get("api") || DEFAULT_API).replace(/\/+$/, "");

  const $ = (id) => document.getElementById(id);

  const statusDot = $("statusDot");
  const statusLine = $("statusLine");

  const tabs = Array.from(document.querySelectorAll(".tabBtn"));
  const panels = Array.from(document.querySelectorAll("[data-panel]"));

  const nowAmbient = $("nowAmbient");
  const nowBadge = $("nowBadge");
  const nowBadgeText = $("nowBadgeText");
  const nowUpdated = $("nowUpdated");
  const nowCoverWrap = $("nowCoverWrap");
  const nowImg = $("nowImg");
  const nowFallback = $("nowFallback");
  const nowTrackWrap = $("nowTrackWrap");
  const nowArtistWrap = $("nowArtistWrap");
  const nowAlbumWrap = $("nowAlbumWrap");
  const nowTrack = $("nowTrack");
  const nowArtist = $("nowArtist");
  const nowAlbum = $("nowAlbum");
  const nowMsg = $("nowMsg");

  const topList = $("topList");
  const topTypeBtns = Array.from(document.querySelectorAll('[data-top-type]'));
  const topPeriodBtns = Array.from(document.querySelectorAll('[data-top-period]'));

  const recentList = $("recentList");

  // A tiny debug line under status (re-uses nowMsg if offline)
  let lastTried = [];

  let currentTab = "now";
  let topType = "tracks";
  let topPeriod = "today";
  let pollTimer = null;

  // Discovered endpoints (once we find working ones)
  const ROUTES = {
    now: null,
    top: null,
    recent: null,
  };

  function setOnline(isOnline) {
    if (!statusDot || !statusLine) return;
    statusDot.classList.toggle("on", !!isOnline);
    statusLine.textContent = isOnline ? "Online" : "Offline";
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function formatTime(d = new Date()) {
    const h24 = d.getHours();
    const m = pad2(d.getMinutes());
    const s = pad2(d.getSeconds());
    const ampm = h24 >= 12 ? "PM" : "AM";
    const h12 = ((h24 + 11) % 12) + 1;
    return `${pad2(h12)}:${m}:${s} ${ampm}`;
  }

  function safeText(v, fallback = "—") {
    if (v === null || v === undefined) return fallback;
    const t = String(v).trim();
    return t.length ? t : fallback;
  }

  function normalizeImg(url) {
    if (!url) return "";
    const u = String(url).trim();
    if (!u) return "";
    if (u.startsWith("//")) return "https:" + u;
    if (u.startsWith("http://")) return u.replace("http://", "https://");
    return u;
  }

  function setCoverAndAmbient(imageUrl) {
    const img = normalizeImg(imageUrl);
    if (!img) {
      nowCoverWrap?.style?.setProperty("--cover-url", "none");
      nowAmbient?.style?.setProperty("--ambient-url", "none");
      nowAmbient?.classList?.remove("on");
      return;
    }
    nowCoverWrap?.style?.setProperty("--cover-url", `url("${img}")`);
    nowAmbient?.style?.setProperty("--ambient-url", `url("${img}")`);
    nowAmbient?.classList?.add("on");
  }

  function applyMarquee(wrapEl, spanEl) {
    if (!wrapEl || !spanEl) return;
    wrapEl.classList.remove("marqOn");
    wrapEl.style.removeProperty("--marqShift");
    wrapEl.style.removeProperty("--marqDur");

    requestAnimationFrame(() => {
      const wrapW = wrapEl.clientWidth;
      const textW = spanEl.scrollWidth;
      if (textW > wrapW + 4) {
        const shift = Math.ceil(textW - wrapW + 24);
        const dur = Math.max(8, Math.min(18, shift / 45));
        wrapEl.style.setProperty("--marqShift", `${shift}px`);
        wrapEl.style.setProperty("--marqDur", `${dur}s`);
        wrapEl.classList.add("marqOn");
      }
    });
  }

  async function fetchJSON(fullUrl) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(fullUrl, {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: ctrl.signal,
        cache: "no-store",
      });

      const text = await res.text().catch(() => "");
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

      if (!res.ok) {
        const msg = (json && (json.error || json.message)) ? `${json.error || json.message}` : `${text}`.slice(0, 140);
        throw new Error(`HTTP ${res.status} ${res.statusText}${msg ? ` — ${msg}` : ""}`);
      }
      return json ?? {};
    } finally {
      clearTimeout(t);
    }
  }

  function buildUrl(path, qsObj) {
    const u = new URL(API_BASE + path);
    if (qsObj && typeof qsObj === "object") {
      for (const [k, v] of Object.entries(qsObj)) {
        if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
      }
    }
    return u.toString();
  }
/* ===== app.js — Part 2/4 ===== */

  // ---------- Auto-discovery ----------
  async function discoverRoute(kind) {
    if (ROUTES[kind]) return ROUTES[kind];

    // Candidate paths. We try a few common conventions.
    const candidates = {
      now: [
        "/now", "/api/now", "/v1/now",
        "/now-playing", "/currently-playing", "/playing",
        "/lastfm/now", "/lm/now"
      ],
      recent: [
        "/recent", "/api/recent", "/v1/recent",
        "/recent-tracks", "/lastfm/recent", "/lm/recent"
      ],
      top: [
        "/top", "/api/top", "/v1/top",
        "/top-tracks", "/lastfm/top", "/lm/top"
      ],
    }[kind];

    lastTried = [];

    for (const p of candidates) {
      let testUrl = "";
      try {
        if (kind === "top") {
          testUrl = buildUrl(p, { type: "tracks", period: "today" });
        } else {
          testUrl = buildUrl(p);
        }
        lastTried.push(testUrl);

        const data = await fetchJSON(testUrl);

        // Treat {ok:false, error:"Not found"} as failure
        if (data && data.ok === false && String(data.error || "").toLowerCase().includes("not found")) {
          continue;
        }

        // Looks valid enough -> accept
        ROUTES[kind] = p;
        return p;
      } catch (e) {
        // keep trying
        continue;
      }
    }

    return null;
  }

  function renderTriedIntoNowMsg() {
    // show first 3 tried urls to avoid giant text
    const tried = lastTried.slice(0, 3).join(" | ");
    nowMsg.textContent = tried ? `Tried: ${tried}` : "Offline";
  }

  // ---------- Tabs ----------
  function showTab(tabName) {
    currentTab = tabName;

    tabs.forEach((b) => {
      const on = b.dataset.tab === tabName;
      b.setAttribute("aria-selected", on ? "true" : "false");
    });

    panels.forEach((p) => {
      const isTarget = p.getAttribute("data-panel") === tabName;
      p.classList.toggle("hidden", !isTarget);
    });

    if (tabName === "top") loadTop().catch(() => {});
    if (tabName === "recent") loadRecent().catch(() => {});
  }

  tabs.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

  function setTopType(next) {
    topType = next;
    topTypeBtns.forEach((b) => b.setAttribute("aria-selected", b.dataset.topType === next ? "true" : "false"));
    loadTop().catch(() => {});
  }
  function setTopPeriod(next) {
    topPeriod = next;
    topPeriodBtns.forEach((b) => b.setAttribute("aria-selected", b.dataset.topPeriod === next ? "true" : "false"));
    loadTop().catch(() => {});
  }

  topTypeBtns.forEach((b) => b.addEventListener("click", () => setTopType(b.dataset.topType)));
  topPeriodBtns.forEach((b) => b.addEventListener("click", () => setTopPeriod(b.dataset.topPeriod)));

  // ---------- List helpers ----------
  function clearEl(el) { if (el) el.innerHTML = ""; }

  function renderError(el, msg) {
    if (!el) return;
    el.innerHTML = `<div class="row" style="padding:16px 16px 18px 16px;">
      <div class="mid" style="grid-column:1 / -1;">
        <div class="title" style="opacity:.85;">${safeText(msg, "Couldn’t load.")}</div>
      </div>
    </div>`;
  }

  function makeRow({ idx, title, sub, img, rightText, rightClass }) {
    const row = document.createElement("div");
    row.className = "row";

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    const imageUrl = normalizeImg(img);

    if (imageUrl) {
      const im = document.createElement("img");
      im.alt = "";
      im.loading = "lazy";
      im.decoding = "async";
      im.referrerPolicy = "no-referrer";
      im.src = imageUrl;
      im.onerror = () => {
        im.remove();
        const fb = document.createElement("div");
        fb.className = "thumbFallback";
        fb.textContent = "♪";
        thumb.appendChild(fb);
      };
      thumb.appendChild(im);
    } else {
      const fb = document.createElement("div");
      fb.className = "thumbFallback";
      fb.textContent = "♪";
      thumb.appendChild(fb);
    }

    const mid = document.createElement("div");
    mid.className = "mid";

    const t = document.createElement("div");
    t.className = "title";
    t.textContent = `${idx}. ${safeText(title)}`;

    const s = document.createElement("div");
    s.className = "sub";
    s.textContent = safeText(sub);

    mid.appendChild(t);
    mid.appendChild(s);

    const right = document.createElement("div");
    right.className = "right" + (rightClass ? ` ${rightClass}` : "");
    right.textContent = rightText || "";

    row.appendChild(thumb);
    row.appendChild(mid);
    row.appendChild(right);

    return row;
  }
/* ===== app.js — Part 3/4 ===== */

  // ---------- NOW ----------
  function setNowBadge(live) {
    if (!nowBadge || !nowBadgeText) return;
    if (live) {
      nowBadge.classList.add("live");
      nowBadgeText.textContent = "LIVE";
    } else {
      nowBadge.classList.remove("live");
      nowBadgeText.textContent = "OFF";
    }
  }

  function setNowArtwork(imageUrl) {
    const img = normalizeImg(imageUrl);

    nowImg.style.display = "none";
    nowFallback.style.display = "grid";

    if (!img) {
      nowImg.removeAttribute("src");
      setCoverAndAmbient("");
      return;
    }

    setCoverAndAmbient(img);

    nowImg.onload = () => {
      nowFallback.style.display = "none";
      nowImg.style.display = "block";
    };
    nowImg.onerror = () => {
      nowImg.style.display = "none";
      nowFallback.style.display = "grid";
      setCoverAndAmbient("");
    };

    nowImg.referrerPolicy = "no-referrer";
    nowImg.src = img;
  }

  async function loadNow() {
    const p = await discoverRoute("now");
    if (!p) throw new Error("No NOW route found");

    const data = await fetchJSON(buildUrl(p));

    const live = !!(data.live ?? data.isPlaying ?? data.playing ?? data.nowPlaying);
    setNowBadge(live);

    const trackName = data.track ?? data.name ?? data.title ?? "—";
    const artistName =
      (typeof data.artist === "string" ? data.artist : (data.artist?.name ?? data.artist?.["#text"])) ??
      data.artistName ??
      "—";
    const albumName =
      (typeof data.album === "string" ? data.album : (data.album?.name ?? data.album?.["#text"])) ??
      data.albumName ??
      "—";

    const message = data.message ?? data.status ?? (live ? "Now playing" : "Offline");

    nowTrack.textContent = safeText(trackName);
    nowArtist.textContent = safeText(artistName);
    nowAlbum.textContent = safeText(albumName);
    nowMsg.textContent = safeText(message);

    const imageUrl =
      data.image ??
      data.imageUrl ??
      data.artwork ??
      data.cover ??
      (Array.isArray(data.images) ? data.images[0] : null) ??
      data.albumImage ??
      "";

    setNowArtwork(imageUrl);

    applyMarquee(nowTrackWrap, nowTrack);
    applyMarquee(nowArtistWrap, nowArtist);
    applyMarquee(nowAlbumWrap, nowAlbum);

    nowUpdated.textContent = formatTime(new Date());
    setOnline(true);
  }

  // ---------- TOP ----------
  async function loadTop() {
    clearEl(topList);

    const p = await discoverRoute("top");
    if (!p) {
      renderError(topList, "Couldn’t load Top.");
      return;
    }

    const data = await fetchJSON(buildUrl(p, { type: topType, period: topPeriod }));
    const items = Array.isArray(data) ? data : (data.items || data.top || data.list || []);

    if (!Array.isArray(items) || items.length === 0) {
      renderError(topList, "Couldn’t load Top.");
      return;
    }

    const frag = document.createDocumentFragment();

    items.slice(0, 50).forEach((it, i) => {
      const title = it.name ?? it.title ?? "—";

      const sub =
        topType === "artists"
          ? (it.extra ?? it.tagline ?? "")
          : (it.artist?.name ?? it.artist ?? it.artistName ?? "");

      const imageUrl =
        it.image ??
        it.imageUrl ??
        it.artwork ??
        it.cover ??
        (Array.isArray(it.images) ? it.images[0] : null) ??
        (Array.isArray(it.image) ? (it.image.at(-1)?.["#text"] || it.image.at(-1)) : "") ??
        "";

      const count = it.playcount ?? it.count ?? it.plays ?? it.scrobbles ?? "";
      const rightText = count !== "" ? String(count) : "";

      frag.appendChild(
        makeRow({
          idx: i + 1,
          title,
          sub: safeText(sub, topType === "artists" ? "" : "—"),
          img: imageUrl,
          rightText,
          rightClass: "count",
        })
      );
    });

    topList.appendChild(frag);
    setOnline(true);
  }
/* ===== app.js — Part 4/4 ===== */

  // ---------- RECENT ----------
  async function loadRecent() {
    clearEl(recentList);

    const p = await discoverRoute("recent");
    if (!p) {
      renderError(recentList, "Couldn’t load Recent.");
      return;
    }

    const data = await fetchJSON(buildUrl(p));
    const items = Array.isArray(data) ? data : (data.items || data.recent || data.list || []);

    if (!Array.isArray(items) || items.length === 0) {
      renderError(recentList, "Couldn’t load Recent.");
      return;
    }

    const frag = document.createDocumentFragment();

    items.slice(0, 50).forEach((it, i) => {
      const title = it.name ?? it.track ?? it.title ?? "—";
      const artist =
        (typeof it.artist === "string" ? it.artist : (it.artist?.name ?? it.artist?.["#text"])) ??
        it.artistName ??
        "—";

      const imageUrl =
        it.image ??
        it.imageUrl ??
        it.artwork ??
        it.cover ??
        it.albumImage ??
        (Array.isArray(it.images) ? it.images[0] : null) ??
        (Array.isArray(it.image) ? (it.image.at(-1)?.["#text"] || it.image.at(-1)) : "") ??
        "";

      const when = it.date?.uts
        ? new Date(Number(it.date.uts) * 1000)
        : (it.timestamp ? new Date(it.timestamp) : null);

      const rightText = when ? `${pad2(when.getHours())}:${pad2(when.getMinutes())}` : "";

      frag.appendChild(
        makeRow({
          idx: i + 1,
          title,
          sub: artist,
          img: imageUrl,
          rightText,
          rightClass: "",
        })
      );
    });

    recentList.appendChild(frag);
    setOnline(true);
  }

  // ---------- Polling / Boot ----------
  async function refreshAll() {
    try {
      await loadNow();
    } catch (e) {
      setOnline(false);
      nowUpdated.textContent = formatTime(new Date());
      setNowBadge(false);
      setNowArtwork("");
      renderTriedIntoNowMsg();
    }

    if (currentTab === "top") {
      try { await loadTop(); }
      catch { renderError(topList, "Couldn’t load Top."); }
    }
    if (currentTab === "recent") {
      try { await loadRecent(); }
      catch { renderError(recentList, "Couldn’t load Recent."); }
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => refreshAll().catch(() => {}), POLL_MS);
  }

  showTab("now");
  refreshAll().catch(() => {});
  startPolling();

})();