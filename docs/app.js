// PART 1/4 — app.js (FULL REPLACE)
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---- DOM (matches your index.html) ----
  const statusDot = $("statusDot");
  const statusLine = $("statusLine");

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
  const recentList = $("recentList");

  const tabBtns = Array.from(document.querySelectorAll(".tabBtn"));
  const panels = Array.from(document.querySelectorAll("[data-panel]"));

  const topTypeBtns = Array.from(document.querySelectorAll("[data-top-type]"));
  const topPeriodBtns = Array.from(document.querySelectorAll("[data-top-period]"));

  let topType = "tracks";
  let topPeriod = "today";

  // ---- helpers ----
  function upgradeToHttps(url) {
    if (!url) return "";
    const u = String(url).trim();
    if (!u) return "";
    if (u.startsWith("//")) return "https:" + u;
    if (u.startsWith("http://")) return u.replace("http://", "https://");
    return u;
  }

  function fmtTime(d = new Date()) {
    try {
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "--";
    }
  }

  function setOnline(isOnline) {
    if (isOnline) {
      statusDot?.classList.add("on");
      if (statusLine) statusLine.textContent = "Online";
    } else {
      statusDot?.classList.remove("on");
      if (statusLine) statusLine.textContent = "Offline";
    }
  }

  function setBadgeLive(isLive) {
    if (!nowBadge || !nowBadgeText) return;
    if (isLive) {
      nowBadge.classList.add("live");
      nowBadgeText.textContent = "LIVE";
    } else {
      nowBadge.classList.remove("live");
      nowBadgeText.textContent = "OFF";
    }
  }

  function setText(el, txt, fallback = "—") {
    if (!el) return;
    const t = (txt ?? "").toString().trim();
    el.textContent = t || fallback;
  }

  function enableMarqueeIfNeeded(wrapperEl, textEl) {
    if (!wrapperEl || !textEl) return;
    requestAnimationFrame(() => {
      const over = textEl.scrollWidth > wrapperEl.clientWidth + 6;
      wrapperEl.classList.toggle("marqOn", over);
      if (over) {
        const shift = Math.max(60, textEl.scrollWidth - wrapperEl.clientWidth + 40);
        wrapperEl.style.setProperty("--marqShift", `${shift}px`);
        const dur = Math.min(18, Math.max(8, shift / 40));
        wrapperEl.style.setProperty("--marqDur", `${dur}s`);
      }
    });
  }

  function applyArtworkNow(url) {
    const safe = upgradeToHttps(url);
    if (!nowImg || !nowFallback || !nowCoverWrap) return;

    if (!safe) {
      nowImg.style.display = "none";
      nowFallback.style.display = "grid";
      nowCoverWrap.style.setProperty("--cover-url", "none");
      if (nowAmbient) {
        nowAmbient.classList.remove("on");
        nowAmbient.style.setProperty("--ambient-url", "none");
      }
      return;
    }

    nowImg.style.display = "none";
    nowFallback.style.display = "grid";

    nowCoverWrap.style.setProperty("--cover-url", `url("${safe}")`);
    if (nowAmbient) {
      nowAmbient.style.setProperty("--ambient-url", `url("${safe}")`);
      nowAmbient.classList.add("on");
    }

    nowImg.onload = () => {
      nowImg.style.display = "block";
      nowFallback.style.display = "none";
    };
    nowImg.onerror = () => {
      nowImg.style.display = "none";
      nowFallback.style.display = "grid";
    };

    nowImg.src = safe;
  }

  // ---- API auto-detect: ORIGIN + PATHS ----
  const LS_KEY = "lm_api_lock_v2";

  function getGitHubUserFromHost() {
    const h = location.hostname || "";
    // mr-tanq.github.io -> mr-tanq
    if (h.endsWith(".github.io")) return h.split(".github.io")[0] || "";
    return "";
  }

  const GH_USER = getGitHubUserFromHost();

  // Optional override by URL: ?api=https://xxxx.workers.dev
  function getApiOverrideFromQuery() {
    try {
      const u = new URL(location.href);
      const api = u.searchParams.get("api");
      if (!api) return "";
      const origin = new URL(api).origin;
      return origin;
    } catch {
      return "";
    }
  }

  // Candidate API origins:
  // 1) same origin (in case you proxy on GH pages / or local dev)
  // 2) several common workers.dev patterns built from your username
  // 3) you can force it with ?api=...
  const overrideOrigin = getApiOverrideFromQuery();

  const originCandidates = [
    location.origin,
    ...(overrideOrigin ? [overrideOrigin] : []),
    ...(GH_USER ? [
      `https://listening-mirror.${GH_USER}.workers.dev`,
      `https://listeningmirror.${GH_USER}.workers.dev`,
      `https://listening-mirror-cloud.${GH_USER}.workers.dev`,
      `https://listening-mirror-api.${GH_USER}.workers.dev`,
      `https://${GH_USER}-listening-mirror.workers.dev`,
      `https://${GH_USER}-listeningmirror.workers.dev`,
      `https://${GH_USER}-lm.workers.dev`,
      `https://lm.${GH_USER}.workers.dev`,
    ] : []),
  ].filter(Boolean);

  // Paths per endpoint (we try all)
  const PATHS = {
    now: ["/now", "/api/now", "/lastfm/now", "/now-playing", "/nowplaying", "/np"],
    recent: ["/recent", "/api/recent", "/lastfm/recent", "/recenttracks", "/recent-tracks", "/recent/tracks"],
    top: ["/top", "/api/top", "/lastfm/top", "/toptracks", "/top-tracks", "/top/tracks"],
  };

  let API_LOCK = loadLock() || { origin: "", now: "", recent: "", top: "" };

  function loadLock() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      return obj;
    } catch {
      return null;
    }
  }

  function saveLock() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(API_LOCK));
    } catch {}
  }

  async function fetchJSON(fullUrl, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(fullUrl, {
        method: "GET",
        headers: { "Accept": "application/json" },
        cache: "no-store",
        mode: "cors",
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  function buildUrl(origin, path, params = {}) {
    const u = new URL(path, origin);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).length) u.searchParams.set(k, v);
    });
    return u.toString();
  }

  async function probe(kind, params = {}) {
    // If locked, use it
    if (API_LOCK.origin && API_LOCK[kind]) {
      return await fetchJSON(buildUrl(API_LOCK.origin, API_LOCK[kind], params));
    }

    let lastErr = null;

    // Try all origin candidates, and for each all path candidates
    for (const origin of originCandidates) {
      for (const path of (PATHS[kind] || [])) {
        try {
          const data = await fetchJSON(buildUrl(origin, path, params));
          API_LOCK.origin = origin;
          API_LOCK[kind] = path;
          saveLock();
          return data;
        } catch (e) {
          lastErr = e;
        }
      }
    }

    throw lastErr || new Error("No endpoint worked");
  }
// PART 2/4 — app.js (FULL REPLACE)

  // ---- Last.fm normalization + artwork extraction ----
  function pickName(obj, keys = []) {
    for (const k of keys) {
      const v = obj?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (v && typeof v === "object") {
        if (typeof v.name === "string" && v.name.trim()) return v.name.trim();
        if (typeof v["#text"] === "string" && v["#text"].trim()) return v["#text"].trim();
      }
    }
    return "";
  }

  function pickCount(obj) {
    const c = obj?.playcount ?? obj?.count ?? obj?.plays ?? obj?.scrobbles ?? obj?.["playCount"];
    if (c === 0) return 0;
    if (c === undefined || c === null) return null;
    const n = Number(c);
    return Number.isFinite(n) ? n : c;
  }

  function bestFromImageArray(arr) {
    if (!Array.isArray(arr)) return "";
    for (let i = arr.length - 1; i >= 0; i--) {
      const it = arr[i];
      if (!it) continue;
      const u = it["#text"] || it.url || "";
      if (u && String(u).trim()) return u;
    }
    return "";
  }

  function pickArtwork(obj) {
    if (!obj) return "";

    const direct = [
      obj.image, obj.artwork, obj.cover, obj.albumArt, obj.art, obj.img, obj.thumbnail
    ].find(v => typeof v === "string" && v.trim());
    if (direct) return direct;

    const directObj = [obj.image, obj.artwork, obj.cover, obj.albumArt, obj.art, obj.img]
      .find(v => v && typeof v === "object" && (v["#text"] || v.url));
    if (directObj) return directObj["#text"] || directObj.url || "";

    const a1 = bestFromImageArray(obj.image);
    if (a1) return a1;

    const a2 = bestFromImageArray(obj?.album?.image);
    if (a2) return a2;

    const a3 = bestFromImageArray(obj?.track?.image);
    if (a3) return a3;

    const a4 = bestFromImageArray(obj?.track?.album?.image);
    if (a4) return a4;

    return "";
  }

  function unwrapLastFmList(data) {
    if (!data || typeof data !== "object") return [];
    if (Array.isArray(data)) return data;

    const recent = data?.recenttracks?.track;
    if (recent) return Array.isArray(recent) ? recent : [recent];

    const topTracks = data?.toptracks?.track;
    if (topTracks) return Array.isArray(topTracks) ? topTracks : [topTracks];

    const topAlbums = data?.topalbums?.album;
    if (topAlbums) return Array.isArray(topAlbums) ? topAlbums : [topAlbums];

    const topArtists = data?.topartists?.artist;
    if (topArtists) return Array.isArray(topArtists) ? topArtists : [topArtists];

    const items = data?.items || data?.list || data?.top || data?.recent;
    if (items) return Array.isArray(items) ? items : [items];

    return [];
  }

  // ---- list UI ----
  function setListLoading(container, label) {
    if (!container) return;
    container.innerHTML = "";
    const row = document.createElement("div");
    row.className = "row";
    row.style.opacity = "0.8";
    row.innerHTML = `
      <div class="thumb"><div class="thumbFallback">…</div></div>
      <div class="mid">
        <div class="title">${label}</div>
        <div class="sub"></div>
      </div>
      <div class="right"></div>
    `;
    container.appendChild(row);
  }

  function setListError(container, msg) {
    if (!container) return;
    container.innerHTML = "";
    const row = document.createElement("div");
    row.className = "row";
    row.style.opacity = "0.85";
    row.innerHTML = `
      <div class="mid" style="grid-column:1/-1">
        <div class="title">${msg}</div>
        <div class="sub"></div>
      </div>
    `;
    container.appendChild(row);
  }

  function makeRow({ index, title, sub, count, artUrl }) {
    const row = document.createElement("div");
    row.className = "row";

    const thumb = document.createElement("div");
    thumb.className = "thumb";

    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";

    const fb = document.createElement("div");
    fb.className = "thumbFallback";
    fb.textContent = "♪";

    thumb.appendChild(img);
    thumb.appendChild(fb);

    const mid = document.createElement("div");
    mid.className = "mid";

    const t = document.createElement("div");
    t.className = "title";
    t.textContent = `${index}. ${title || "—"}`;

    const s = document.createElement("div");
    s.className = "sub";
    s.textContent = sub || "—";

    mid.appendChild(t);
    mid.appendChild(s);

    const right = document.createElement("div");
    right.className = "right";
    if (count !== null && count !== undefined && count !== "") {
      right.classList.add("count");
      right.textContent = String(count);
    } else {
      right.textContent = "";
    }

    row.appendChild(thumb);
    row.appendChild(mid);
    row.appendChild(right);

    const safe = upgradeToHttps(artUrl);
    if (safe) {
      img.style.display = "none";
      fb.style.display = "grid";
      img.onload = () => { fb.style.display = "none"; img.style.display = "block"; };
      img.onerror = () => { img.style.display = "none"; fb.style.display = "grid"; };
      img.src = safe;
    } else {
      img.style.display = "none";
      fb.style.display = "grid";
    }

    return row;
  }
// PART 3/4 — app.js (FULL REPLACE)

  // ---- tabs ----
  function selectTab(name) {
    tabBtns.forEach(btn => {
      const on = btn.dataset.tab === name;
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    panels.forEach(p => p.classList.toggle("hidden", p.dataset.panel !== name));

    if (name === "top") loadTop().catch(() => {});
    if (name === "recent") loadRecent().catch(() => {});
  }

  tabBtns.forEach(btn => btn.addEventListener("click", () => selectTab(btn.dataset.tab)));

  topTypeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      topType = btn.dataset.topType;
      topTypeBtns.forEach(b => b.setAttribute("aria-selected", b === btn ? "true" : "false"));
      loadTop().catch(() => {});
    });
  });

  topPeriodBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      topPeriod = btn.dataset.topPeriod;
      topPeriodBtns.forEach(b => b.setAttribute("aria-selected", b === btn ? "true" : "false"));
      loadTop().catch(() => {});
    });
  });

  // ---- loaders ----
  async function loadNow() {
    try {
      const data = await probe("now", {});

      // detect online
      const online = !!(data?.online ?? data?.ok ?? data?.status === "ok" ?? true);
      setOnline(online);

      const np = data?.now || data?.track || data?.nowPlaying || data?.item || data;

      const isLive = !!(
        data?.isPlaying ??
        np?.isPlaying ??
        data?.playing ??
        np?.playing ??
        (np?.["@attr"]?.nowplaying === "true")
      );
      setBadgeLive(isLive);

      if (nowUpdated) nowUpdated.textContent = fmtTime(new Date());

      const trackName = pickName(np, ["name", "track", "title"]);
      const artistName =
        pickName(np, ["artist", "artistName"]) ||
        pickName(np?.artist, ["name", "#text"]);

      const albumName =
        pickName(np, ["album", "albumName"]) ||
        pickName(np?.album, ["name", "#text"]);

      setText(nowTrack, trackName);
      setText(nowArtist, artistName);
      setText(nowAlbum, albumName);

      enableMarqueeIfNeeded(nowTrackWrap, nowTrack);
      enableMarqueeIfNeeded(nowArtistWrap, nowArtist);
      enableMarqueeIfNeeded(nowAlbumWrap, nowAlbum);

      const art = pickArtwork(np);
      applyArtworkNow(art);

      if (nowMsg) {
        if (!online) nowMsg.textContent = "Offline";
        else if (!isLive) nowMsg.textContent = "Not playing";
        else nowMsg.textContent = "Now playing";
      }
    } catch {
      setOnline(false);
      setBadgeLive(false);
      if (nowUpdated) nowUpdated.textContent = fmtTime(new Date());
      applyArtworkNow("");
      if (nowMsg) nowMsg.textContent = "Offline";
    }
  }

  function mapTopRow(it) {
    if (topType === "artists") {
      const title = pickName(it, ["name"]) || "—";
      const sub = "";
      const count = pickCount(it);
      const artUrl = pickArtwork(it);
      return { title, sub, count, artUrl };
    }

    if (topType === "albums") {
      const title = pickName(it, ["name"]) || "—";
      const sub =
        pickName(it, ["artist"]) ||
        pickName(it?.artist, ["name", "#text"]) ||
        "—";
      const count = pickCount(it);
      const artUrl = pickArtwork(it);
      return { title, sub, count, artUrl };
    }

    const title = pickName(it, ["name"]) || pickName(it, ["track", "title"]) || "—";
    const sub =
      pickName(it, ["artist"]) ||
      pickName(it?.artist, ["name", "#text"]) ||
      pickName(it?.["@attr"], ["artist"]) ||
      "—";
    const count = pickCount(it);
    const artUrl = pickArtwork(it);
    return { title, sub, count, artUrl };
  }

  async function loadTop() {
    if (!topList) return;
    setListLoading(topList, "Loading Top…");

    try {
      // backend may accept these params or ignore them — safe
      const data = await probe("top", { type: topType, period: topPeriod, limit: 10 });

      const items = unwrapLastFmList(data);
      topList.innerHTML = "";

      const slice = items.slice(0, 10);
      if (!slice.length) {
        setListError(topList, "No Top data.");
        return;
      }

      slice.forEach((it, i) => {
        const { title, sub, count, artUrl } = mapTopRow(it);
        const fallbackArt =
          artUrl ||
          pickArtwork(it?.track) ||
          pickArtwork(it?.album) ||
          pickArtwork(it?.track?.album) ||
          "";
        topList.appendChild(makeRow({ index: i + 1, title, sub, count, artUrl: fallbackArt }));
      });
    } catch {
      setListError(topList, "Couldn’t load Top.");
    }
  }
// PART 4/4 — app.js (FULL REPLACE)

  async function loadRecent() {
    if (!recentList) return;
    setListLoading(recentList, "Loading Recent…");

    try {
      const data = await probe("recent", { limit: 10 });

      const items = unwrapLastFmList(data);
      recentList.innerHTML = "";

      const slice = items.slice(0, 10);
      if (!slice.length) {
        setListError(recentList, "No Recent data.");
        return;
      }

      slice.forEach((it, i) => {
        const title =
          pickName(it, ["name"]) ||
          pickName(it?.track, ["name", "title"]) ||
          "—";

        const sub =
          pickName(it, ["artist"]) ||
          pickName(it?.artist, ["name", "#text"]) ||
          pickName(it?.track?.artist, ["name", "#text"]) ||
          "—";

        const artUrl =
          pickArtwork(it) ||
          pickArtwork(it?.track) ||
          pickArtwork(it?.album) ||
          pickArtwork(it?.track?.album) ||
          "";

        recentList.appendChild(makeRow({ index: i + 1, title, sub, count: null, artUrl }));
      });
    } catch {
      setListError(recentList, "Couldn’t load Recent.");
    }
  }

  // ---- polling ----
  let nowTimer = null;

  function start() {
    selectTab("now");

    loadNow().catch(() => {});
    setTimeout(() => loadTop().catch(() => {}), 600);
    setTimeout(() => loadRecent().catch(() => {}), 900);

    nowTimer = setInterval(() => loadNow().catch(() => {}), 10000);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (nowTimer) clearInterval(nowTimer);
      nowTimer = null;
    } else {
      if (!nowTimer) {
        loadNow().catch(() => {});
        nowTimer = setInterval(() => loadNow().catch(() => {}), 10000);
      }
    }
  });

  start();
})();