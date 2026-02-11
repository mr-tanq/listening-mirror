// PART 1/4 : app.js (FULL REPLACE)
(() => {
  "use strict";

  // ---------- API BASE (flexible, no backend changes) ----------
  const qs = new URLSearchParams(location.search);
  const apiFromQuery = (qs.get("api") || "").trim();
  const apiFromWindow = (window.API_BASE || window.__API_BASE__ || "").toString().trim();

  const RAW_BASE = apiFromQuery || apiFromWindow || "";
  const API_BASE = upgradeToHttps(RAW_BASE).replace(/\/+$/, "");

  // Endpoints (generic). Adjust ONLY if your backend uses different paths.
  const EP = {
    now:  "/now",
    recent: "/recent",
    top:  "/top"
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

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
  const nowMsg = $("nowMsg"); // (hidden in CSS in your current index)

  const topList = $("topList");
  const recentList = $("recentList");

  // Tabs
  const tabBtns = Array.from(document.querySelectorAll(".tabBtn"));
  const panels = Array.from(document.querySelectorAll("[data-panel]"));

  // Top controls
  const topTypeBtns = Array.from(document.querySelectorAll('[data-top-type]'));
  const topPeriodBtns = Array.from(document.querySelectorAll('[data-top-period]'));

  let topType = "tracks";
  let topPeriod = "today";

  // ---------- Helpers ----------
  function upgradeToHttps(url) {
    if (!url) return "";
    const u = url.toString().trim();
    if (u.startsWith("//")) return "https:" + u;
    if (u.startsWith("http://")) return u.replace("http://", "https://");
    return u;
  }

  function joinUrl(base, path) {
    if (!base) return path; // same-origin
    if (!path) return base;
    return base + (path.startsWith("/") ? path : ("/" + path));
  }

  function fmtTime(d = new Date()) {
    try {
      // Keep it simple: 02:37:00 PM style like your UI
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
    // If content overflows, add class "marqOn"
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

  // Robust artwork setter (NOW + lists)
  function applyArtwork({ imgEl, fallbackEl, wrapEl, url, alsoAmbientEl }) {
    const safe = upgradeToHttps(url || "");
    if (!imgEl || !fallbackEl || !wrapEl) return;

    if (!safe) {
      imgEl.style.display = "none";
      fallbackEl.style.display = "grid";
      wrapEl.style.setProperty("--cover-url", "none");
      if (alsoAmbientEl) {
        alsoAmbientEl.classList.remove("on");
        alsoAmbientEl.style.setProperty("--ambient-url", "none");
      }
      return;
    }

    // show loading state (fallback visible until load)
    imgEl.style.display = "none";
    fallbackEl.style.display = "grid";

    // Set CSS blur backgrounds
    wrapEl.style.setProperty("--cover-url", `url("${safe}")`);
    if (alsoAmbientEl) {
      alsoAmbientEl.style.setProperty("--ambient-url", `url("${safe}")`);
      alsoAmbientEl.classList.add("on");
    }

    // Ensure image loads; only then show it
    imgEl.onload = () => {
      imgEl.style.display = "block";
      fallbackEl.style.display = "none";
    };
    imgEl.onerror = () => {
      imgEl.style.display = "none";
      fallbackEl.style.display = "grid";
    };

    // IMPORTANT: set src last
    imgEl.src = safe;
  }

  async function fetchJSON(path, params = {}) {
    const url = new URL(joinUrl(API_BASE, path), location.origin);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && `${v}`.length) url.searchParams.set(k, v);
    });

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { "Accept": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}${txt ? ` — ${txt.slice(0, 120)}` : ""}`);
    }
    return res.json();
  }
// PART 2/4 : app.js (FULL REPLACE)
  // ---------- Data shape normalizer ----------
  // Accepts multiple possible backend shapes without breaking
  function pickArtwork(item) {
    if (!item) return "";
    // Common candidates:
    // item.image, item.artwork, item.cover, item.albumArt, item.art, item.album?.image, item.images?.[0]
    const candidates = [
      item.image,
      item.artwork,
      item.cover,
      item.albumArt,
      item.art,
      item?.album?.image,
      item?.album?.artwork,
      item?.album?.cover,
      item?.images?.[0],
      item?.images?.[1],
    ];
    // Sometimes last.fm gives array of objects: [{size:"small", "#text":"..."}]
    for (const c of candidates) {
      if (!c) continue;
      if (typeof c === "string") return c;
      if (Array.isArray(c)) {
        const best = c.slice().reverse().find(x => x && (x["#text"] || x.url));
        if (best) return best["#text"] || best.url || "";
      }
      if (typeof c === "object") {
        if (c["#text"]) return c["#text"];
        if (c.url) return c.url;
      }
    }
    return "";
  }

  function pickName(item, keys = []) {
    for (const k of keys) {
      const v = item?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (v && typeof v === "object" && typeof v.name === "string" && v.name.trim()) return v.name.trim();
    }
    return "";
  }

  function pickCount(item) {
    const c = item?.playcount ?? item?.count ?? item?.plays ?? item?.scrobbles ?? item?.value;
    if (c === 0) return 0;
    if (!c) return null;
    const n = Number(c);
    return Number.isFinite(n) ? n : c;
  }

  // ---------- UI builders ----------
  function makeRow({ index, title, sub, count, artUrl }) {
    const row = document.createElement("div");
    row.className = "row";

    const thumb = document.createElement("div");
    thumb.className = "thumb";

    // IMPORTANT: always create img (so artwork CAN show)
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer"; // avoids some CDNs blocking

    const fb = document.createElement("div");
    fb.className = "thumbFallback";
    fb.textContent = "♪";

    thumb.appendChild(img);
    thumb.appendChild(fb);

    // middle
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
      right.textContent = `${count}`;
    } else {
      right.textContent = "";
    }

    row.appendChild(thumb);
    row.appendChild(mid);
    row.appendChild(right);

    // apply art
    const safe = pickArtwork({ image: artUrl });
    if (safe) {
      img.onload = () => { fb.style.display = "none"; img.style.display = "block"; };
      img.onerror = () => { img.style.display = "none"; fb.style.display = "grid"; };
      img.style.display = "none";
      fb.style.display = "grid";
      img.src = upgradeToHttps(safe);
    } else {
      img.style.display = "none";
      fb.style.display = "grid";
    }

    return row;
  }

  function setListLoading(container, label = "Loading…") {
    if (!container) return;
    container.innerHTML = "";
    const row = document.createElement("div");
    row.className = "row";
    row.style.opacity = "0.8";
    row.innerHTML = `
      <div class="thumb"><div class="thumbFallback">…</div></div>
      <div class="mid">
        <div class="title">${label}</div>
        <div class="sub"> </div>
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
        <div class="sub"> </div>
      </div>
    `;
    container.appendChild(row);
  }

  // ---------- Tabs ----------
  function selectTab(name) {
    tabBtns.forEach(btn => {
      const on = btn.dataset.tab === name;
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    panels.forEach(p => {
      const on = p.dataset.panel === name;
      p.classList.toggle("hidden", !on);
    });

    // Lazy load lists when tab selected
    if (name === "top") loadTop().catch(() => {});
    if (name === "recent") loadRecent().catch(() => {});
  }

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => selectTab(btn.dataset.tab));
  });

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
// PART 3/4 : app.js (FULL REPLACE)
  // ---------- Loaders ----------
  async function loadNow() {
    try {
      const data = await fetchJSON(EP.now);

      // Online status
      const online = !!(data?.online ?? data?.status === "ok" ?? data?.ok);
      setOnline(online);

      // Now-playing object can be:
      // data.now, data.track, data.nowPlaying, data.item
      const np = data?.now || data?.track || data?.nowPlaying || data?.item || data;

      // Live flag can be:
      // data.isPlaying, np.isPlaying, data.playing
      const isLive = !!(data?.isPlaying ?? np?.isPlaying ?? data?.playing ?? np?.playing);
      setBadgeLive(isLive);

      // Updated time
      if (nowUpdated) nowUpdated.textContent = fmtTime(new Date());

      // Text
      const trackName = pickName(np, ["name", "track", "title"]);
      const artistName = pickName(np, ["artist", "artistName"]);
      const albumName = pickName(np, ["album", "albumName"]);

      setText(nowTrack, trackName);
      setText(nowArtist, artistName);
      setText(nowAlbum, albumName);

      enableMarqueeIfNeeded(nowTrackWrap, nowTrack);
      enableMarqueeIfNeeded(nowArtistWrap, nowArtist);
      enableMarqueeIfNeeded(nowAlbumWrap, nowAlbum);

      // Artwork
      const art = pickArtwork(np);
      applyArtwork({
        imgEl: nowImg,
        fallbackEl: nowFallback,
        wrapEl: nowCoverWrap,
        url: art,
        alsoAmbientEl: nowAmbient
      });

      // Optional message (kept but your CSS hides it)
      if (nowMsg) {
        if (!online) nowMsg.textContent = "Offline";
        else if (!isLive) nowMsg.textContent = "Not playing";
        else nowMsg.textContent = "Now playing";
      }
    } catch (err) {
      setOnline(false);
      setBadgeLive(false);
      if (nowUpdated) nowUpdated.textContent = fmtTime(new Date());

      // Keep previous text; only show fallbacks if totally empty
      if (nowTrack && nowTrack.textContent === "—") nowTrack.textContent = "—";
      if (nowArtist && nowArtist.textContent === "—") nowArtist.textContent = "—";
      if (nowAlbum && nowAlbum.textContent === "—") nowAlbum.textContent = "—";

      applyArtwork({
        imgEl: nowImg,
        fallbackEl: nowFallback,
        wrapEl: nowCoverWrap,
        url: "",
        alsoAmbientEl: nowAmbient
      });
    }
  }

  async function loadTop() {
    if (!topList) return;
    setListLoading(topList, "Loading Top…");

    try {
      const data = await fetchJSON(EP.top, {
        type: topType,
        period: topPeriod,
        limit: 10
      });

      // items array can be: data.items, data.top, data.list, data
      const items =
        data?.items ||
        data?.top ||
        data?.list ||
        (Array.isArray(data) ? data : []) ||
        [];

      topList.innerHTML = "";

      items.slice(0, 10).forEach((it, i) => {
        const title =
          pickName(it, ["name", "track", "title", "album"]) ||
          pickName(it?.track, ["name", "title"]) ||
          "—";

        // For tracks: artist usually sits in it.artist.name or it.artist
        const sub =
          pickName(it, ["artist", "artistName"]) ||
          pickName(it?.artist, ["name"]) ||
          pickName(it?.track, ["artist"]) ||
          "—";

        const count = pickCount(it);

        const artUrl = pickArtwork(it);

        topList.appendChild(makeRow({
          index: i + 1,
          title,
          sub,
          count,
          artUrl
        }));
      });

      if (!items.length) setListError(topList, "No Top data.");
    } catch (err) {
      setListError(topList, "Couldn’t load Top.");
    }
  }

  async function loadRecent() {
    if (!recentList) return;
    setListLoading(recentList, "Loading Recent…");

    try {
      const data = await fetchJSON(EP.recent, { limit: 10 });

      const items =
        data?.items ||
        data?.recent ||
        data?.list ||
        (Array.isArray(data) ? data : []) ||
        [];

      recentList.innerHTML = "";

      items.slice(0, 10).forEach((it, i) => {
        const title =
          pickName(it, ["name", "track", "title"]) ||
          pickName(it?.track, ["name", "title"]) ||
          "—";

        const sub =
          pickName(it, ["artist", "artistName"]) ||
          pickName(it?.artist, ["name"]) ||
          pickName(it?.track, ["artist"]) ||
          "—";

        const artUrl = pickArtwork(it);

        recentList.appendChild(makeRow({
          index: i + 1,
          title,
          sub,
          count: null,
          artUrl
        }));
      });

      if (!items.length) setListError(recentList, "No Recent data.");
    } catch (err) {
      setListError(recentList, "Couldn’t load Recent.");
    }
  }
// PART 4/4 : app.js (FULL REPLACE)
  // ---------- Polling ----------
  let nowTimer = null;

  function start() {
    // Default selected tab is "Now"
    selectTab("now");

    // Initial loads
    loadNow().catch(() => {});
    // Preload top/recent lightly after first paint (optional)
    setTimeout(() => loadTop().catch(() => {}), 600);
    setTimeout(() => loadRecent().catch(() => {}), 900);

    // Poll now every 10s (safe)
    nowTimer = setInterval(() => {
      loadNow().catch(() => {});
    }, 10000);
  }

  // If page is hidden, stop heavy work
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