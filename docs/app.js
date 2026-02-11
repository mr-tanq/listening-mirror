// PART 1/4 — app.js (FULL REPLACE)
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---- DOM (matches your index.html exactly) ----
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

  const topTypeBtns = Array.from(document.querySelectorAll('[data-top-type]'));
  const topPeriodBtns = Array.from(document.querySelectorAll('[data-top-period]'));

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

  // ---- IMPORTANT: endpoint auto-detect (no backend changes needed) ----
  const LS_KEY = "lm_endpoints_v1";

  const CANDIDATES = {
    now: [
      "/now", "/api/now", "/lastfm/now", "/now-playing", "/nowplaying", "/np"
    ],
    recent: [
      "/recent", "/api/recent", "/lastfm/recent", "/recent-tracks", "/recenttracks", "/recent/tracks"
    ],
    top: [
      "/top", "/api/top", "/lastfm/top", "/top-tracks", "/toptracks", "/top/tracks"
    ]
  };

  function loadSavedEndpoints() {
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

  function saveEndpoints(obj) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch {}
  }

  let EP = loadSavedEndpoints() || { now: null, recent: null, top: null };

  async function fetchJSON(path, params = {}, timeoutMs = 8000) {
    const url = new URL(path, location.origin);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).length) url.searchParams.set(k, v);
    });

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { "Accept": "application/json" },
        cache: "no-store",
        signal: ctrl.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  async function fetchWithAutoDetect(kind, params = {}) {
    // If we already know the endpoint, use it.
    if (EP[kind]) return await fetchJSON(EP[kind], params);

    // Otherwise try candidates until one works, then lock it.
    const list = CANDIDATES[kind] || [];
    let lastErr = null;

    for (const p of list) {
      try {
        const data = await fetchJSON(p, params);
        EP[kind] = p;
        saveEndpoints(EP);
        return data;
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error("No endpoint worked");
  }
// PART 2/4 — app.js (FULL REPLACE)

  // ---- Last.fm shape normalization + artwork extraction ----
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
    // Last.fm: [{size:"small", "#text":"..."}, ...]
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

    // 1) direct strings
    const direct = [
      obj.image, obj.artwork, obj.cover, obj.albumArt, obj.art, obj.img, obj.thumbnail
    ].find(v => typeof v === "string" && v.trim());
    if (direct) return direct;

    // 2) direct object forms
    const directObj = [obj.image, obj.artwork, obj.cover, obj.albumArt, obj.art, obj.img]
      .find(v => v && typeof v === "object" && (v["#text"] || v.url));
    if (directObj) return directObj["#text"] || directObj.url || "";

    // 3) last.fm arrays
    const a1 = bestFromImageArray(obj.image);
    if (a1) return a1;

    // 4) nested album/track containers (last.fm likes these)
    const a2 = bestFromImageArray(obj?.album?.image);
    if (a2) return a2;

    const a3 = bestFromImageArray(obj?.track?.image);
    if (a3) return a3;

    // sometimes recenttracks: track has album with image
    const a4 = bestFromImageArray(obj?.track?.album?.image);
    if (a4) return a4;

    // sometimes: obj.album is a string but artwork elsewhere
    const a5 = bestFromImageArray(obj?.["@attr"]?.image);
    if (a5) return a5;

    return "";
  }

  function unwrapLastFmList(data) {
    // Handles:
    // recenttracks.track[]
    // toptracks.track[]
    // topalbums.album[]
    // topartists.artist[]
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

    // fallback common keys
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
    img.referrerPolicy = "no-referrer"; // helps with some CDNs

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
      const data = await fetchWithAutoDetect("now", {});

      // online + now-playing shape variants
      const online = !!(data?.online ?? data?.ok ?? data?.status === "ok");
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
    // For Last.fm:
    // toptracks.track: { name, artist:{name}, image:[...] , playcount }
    // topalbums.album: { name, artist:{name}, image:[...], playcount }
    // topartists.artist: { name, image:[...], playcount }
    if (topType === "artists") {
      const title = pickName(it, ["name"]) || "—";
      const sub = ""; // artist has no subline
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

    // tracks
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
      // send params (harmless if backend ignores)
      const data = await fetchWithAutoDetect("top", { type: topType, period: topPeriod, limit: 10 });

      const items = unwrapLastFmList(data);
      topList.innerHTML = "";

      const slice = items.slice(0, 10);
      if (!slice.length) {
        setListError(topList, "No Top data.");
        return;
      }

      slice.forEach((it, i) => {
        const { title, sub, count, artUrl } = mapTopRow(it);

        // 🔥 IMPORTANT FIX: if artwork is empty at this level, try nested common nodes
        const fallbackArt =
          artUrl ||
          pickArtwork(it?.track) ||
          pickArtwork(it?.album) ||
          pickArtwork(it?.image) ||
          "";

        topList.appendChild(makeRow({
          index: i + 1,
          title,
          sub,
          count,
          artUrl: fallbackArt
        }));
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
      const data = await fetchWithAutoDetect("recent", { limit: 10 });

      const items = unwrapLastFmList(data);
      recentList.innerHTML = "";

      const slice = items.slice(0, 10);
      if (!slice.length) {
        setListError(recentList, "No Recent data.");
        return;
      }

      slice.forEach((it, i) => {
        // recenttracks.track: { name, artist:{#text}, album:{#text}, image:[...] }
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

        recentList.appendChild(makeRow({
          index: i + 1,
          title,
          sub,
          count: null,
          artUrl
        }));
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
    setTimeout(() => loadTop().catch(() => {}), 700);
    setTimeout(() => loadRecent().catch(() => {}), 1000);

    nowTimer = setInterval(() => {
      loadNow().catch(() => {});
    }, 10000);
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