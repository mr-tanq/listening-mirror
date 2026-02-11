/* PART 1/4 — app.js (FULL REPLACE) */
(() => {
  "use strict";

  // ====== CONFIG ======
  const WORKER_BASE = "https://i.errtanq9.workers.dev";
  const TOP_LIMIT = 10;
  const RECENT_LIMIT = 10;
  const NOW_POLL_MS = 12000;

  // Endpoint probing (για να μην “σπάει” αν το path είναι /api/xxx ή /xxx)
  const EP = {
    now: ["/api/now", "/now", "/api/now-playing", "/now-playing", "/api/np", "/np"],
    top: ["/api/top", "/top", "/api/stats/top", "/stats/top"],
    recent: ["/api/recent", "/recent", "/api/recent-tracks", "/recent-tracks", "/api/scrobbles", "/scrobbles"],
  };

  // ====== DOM ======
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const statusDot = $("#statusDot");
  const statusLine = $("#statusLine");

  const panels = $$("[data-panel]");
  const tabBtns = $$("[data-tab]");

  const nowAmbient = $("#nowAmbient");
  const nowBadge = $("#nowBadge");
  const nowBadgeText = $("#nowBadgeText");
  const nowUpdated = $("#nowUpdated");

  const nowImg = $("#nowImg");
  const nowFallback = $("#nowFallback");
  const nowCoverWrap = $("#nowCoverWrap");

  const nowTrack = $("#nowTrack");
  const nowArtist = $("#nowArtist");
  const nowAlbum = $("#nowAlbum");
  const nowMsg = $("#nowMsg");

  const nowTrackWrap = $("#nowTrackWrap");
  const nowArtistWrap = $("#nowArtistWrap");
  const nowAlbumWrap = $("#nowAlbumWrap");

  const topList = $("#topList");
  const recentList = $("#recentList");

  const topTypeBtns = $$("[data-top-type]");
  const topPeriodBtns = $$("[data-top-period]");

  // ====== STATE ======
  const state = {
    tab: "now",
    topType: "tracks",
    topPeriod: "today",
    nowTimer: null,
    online: false,
  };

  // ====== HELPERS ======
  function setOnline(isOnline) {
    state.online = !!isOnline;
    statusLine.textContent = isOnline ? "Online" : "Offline";
    statusDot.classList.toggle("on", isOnline);
  }

  function baseUrl(path) {
    return WORKER_BASE.replace(/\/+$/, "") + path;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async function fetchJsonProbe(paths) {
    let lastErr = null;
    for (const p of paths) {
      try {
        return await fetchJson(baseUrl(p));
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("All endpoints failed");
  }

  function safeText(v) {
    if (v === null || v === undefined) return "";
    return String(v);
  }

  function ensureHttps(url) {
    const u = safeText(url).trim();
    if (!u) return "";
    if (u.startsWith("//")) return "https:" + u;
    if (u.startsWith("http://")) return "https://" + u.slice("http://".length);
    return u;
  }

  function fmtTime(d = new Date()) {
    try {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "--";
    }
  }

  // ====== IMAGE PICKER (This is the KEY for artwork) ======
  // Υποστηρίζει:
  // - Last.fm: image: [{ "#text": "...", size:"extralarge" }, ...]
  // - { image: { url:"..." } } / { image: "..." }
  // - { images: [{url:"..."}] }
  // - { album: { image:[...] } }
  // - { track: { image:[...] } }
  function pickImage(obj) {
    if (!obj) return "";

    // direct string
    if (typeof obj === "string") return obj;

    // image: "..."
    if (typeof obj.image === "string") return obj.image;

    // image: { url: "..." }
    if (obj.image && typeof obj.image.url === "string") return obj.image.url;

    // images: [{url:"..."}]
    if (Array.isArray(obj.images)) {
      for (let i = obj.images.length - 1; i >= 0; i--) {
        const cand = obj.images[i];
        const u = cand?.url || cand?.src || cand?.href;
        if (typeof u === "string" && u.trim()) return u;
      }
    }

    // Last.fm array image
    if (Array.isArray(obj.image)) {
      for (let i = obj.image.length - 1; i >= 0; i--) {
        const cand = obj.image[i];
        const u = cand && (cand["#text"] || cand.url);
        if (typeof u === "string" && u.trim()) return u;
      }
    }

    // image sizes object
    if (obj.image && typeof obj.image === "object" && !Array.isArray(obj.image)) {
      const pref = ["extralarge", "mega", "large", "medium", "small", "original"];
      for (const k of pref) {
        const u = obj.image[k];
        if (typeof u === "string" && u.trim()) return u;
      }
      for (const k of Object.keys(obj.image)) {
        const u = obj.image[k];
        if (typeof u === "string" && u.trim()) return u;
      }
    }

    return "";
  }

  function bestArtworkFromNowCandidate(n) {
    // try multiple nested spots
    return (
      pickImage(n) ||
      pickImage(n?.album) ||
      pickImage(n?.track) ||
      pickImage(n?.artist) ||
      pickImage(n?.image) ||
      ""
    );
  }

  // ====== MARQUEE (uses your CSS classes) ======
  function applyMarquee(wrapEl) {
    if (!wrapEl) return;
    const inner = wrapEl.querySelector(".marq");
    if (!inner) return;

    // reset animation
    wrapEl.classList.remove("marqOn");
    wrapEl.style.removeProperty("--marqDur");
    wrapEl.style.removeProperty("--marqShift");

    // needs?
    const wrapW = wrapEl.clientWidth;
    const textW = inner.scrollWidth;
    if (textW <= wrapW + 2) return;

    // shift and duration proportional
    const shift = Math.max(60, Math.round(textW - wrapW + 40));
    const dur = Math.min(18, Math.max(9, shift / 18));

    wrapEl.style.setProperty("--marqShift", `${shift}px`);
    wrapEl.style.setProperty("--marqDur", `${dur}s`);
    wrapEl.classList.add("marqOn");
  }
/* PART 2/4 — app.js (FULL REPLACE CONT.) */

  // ====== UI: Tabs ======
  function setTab(tab) {
    state.tab = tab;

    tabBtns.forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab ? "true" : "false"));
    panels.forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== tab));

    // NOW only polling when we’re in NOW (optional but nice)
    if (tab === "now") {
      startNowPolling();
      loadNow().catch(() => {});
    } else {
      stopNowPolling();
      // keep online/offline indicator based on last successful call
    }

    if (tab === "top") loadTop().catch(() => {});
    if (tab === "recent") loadRecent().catch(() => {});
  }

  function bindTabs() {
    tabBtns.forEach((btn) => {
      btn.addEventListener(
        "click",
        () => {
          setTab(btn.dataset.tab);
        },
        { passive: true }
      );
    });
  }

  // ====== UI: Top controls ======
  function bindTopControls() {
    topTypeBtns.forEach((btn) => {
      btn.addEventListener(
        "click",
        () => {
          state.topType = btn.dataset.topType;
          topTypeBtns.forEach((b) => b.setAttribute("aria-selected", b === btn ? "true" : "false"));
          loadTop().catch(() => {});
        },
        { passive: true }
      );
    });

    topPeriodBtns.forEach((btn) => {
      btn.addEventListener(
        "click",
        () => {
          state.topPeriod = btn.dataset.topPeriod;
          topPeriodBtns.forEach((b) => b.setAttribute("aria-selected", b === btn ? "true" : "false"));
          loadTop().catch(() => {});
        },
        { passive: true }
      );
    });
  }

  // ====== RENDERERS ======
  function clearEl(el) {
    if (el) el.innerHTML = "";
  }

  function makeRow({ index, title, sub, imgUrl, rightText, rightIsCount }) {
    const row = document.createElement("div");
    row.className = "row";

    // thumb
    const thumb = document.createElement("div");
    thumb.className = "thumb";

    const finalUrl = ensureHttps(imgUrl);

    if (finalUrl) {
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.src = finalUrl;
      img.onerror = () => {
        thumb.innerHTML = "";
        const fb = document.createElement("div");
        fb.className = "thumbFallback";
        fb.textContent = "♪";
        thumb.appendChild(fb);
      };
      thumb.appendChild(img);
    } else {
      const fb = document.createElement("div");
      fb.className = "thumbFallback";
      fb.textContent = "♪";
      thumb.appendChild(fb);
    }

    // mid
    const mid = document.createElement("div");
    mid.className = "mid";
    const t = document.createElement("div");
    t.className = "title";
    t.textContent = `${index}. ${title}`;
    const s = document.createElement("div");
    s.className = "sub";
    s.textContent = sub || "";
    mid.appendChild(t);
    mid.appendChild(s);

    // right
    const right = document.createElement("div");
    right.className = "right" + (rightIsCount ? " count" : "");
    right.textContent = rightText || "";

    row.appendChild(thumb);
    row.appendChild(mid);
    row.appendChild(right);

    return row;
  }

  // ====== NORMALIZERS ======
  function normalizeNow(data) {
    // Accept many possible shapes (worker-normalized OR raw-ish)
    // common possibilities:
    // { now: {...} } or { track: {...} } or { item: {...} } or raw track object
    const n = data?.now || data?.track || data?.item || data?.data || data || {};

    const title = safeText(n?.name || n?.title || n?.track || n?.song || "—");
    const artist = safeText(n?.artist?.name || n?.artist || n?.creator || "—");
    const album = safeText(n?.album?.name || n?.album || n?.release || "");

    const img =
      bestArtworkFromNowCandidate(n) ||
      bestArtworkFromNowCandidate(data?.track) ||
      bestArtworkFromNowCandidate(data?.now) ||
      pickImage(data?.album) ||
      "";

    // playing flag (support Last.fm "@attr" nowplaying)
    const np =
      n?.nowplaying === true ||
      n?.isPlaying === true ||
      n?.playing === true ||
      n?.["@attr"]?.nowplaying === "true" ||
      data?.["@attr"]?.nowplaying === "true" ||
      false;

    return { title, artist, album, img, nowPlaying: !!np };
  }

  function normalizeTopItems(data) {
    const arr = data?.items || data?.top || data?.list || data?.data || data || [];
    if (!Array.isArray(arr)) return [];

    return arr.map((it) => {
      const title = safeText(it?.name || it?.title || "—");

      const artist = safeText(it?.artist?.name || it?.artist || "");
      const album = safeText(it?.album?.name || it?.album || "");

      const img =
        pickImage(it) ||
        pickImage(it?.album) ||
        pickImage(it?.artist) ||
        "";

      const count = it?.plays ?? it?.playcount ?? it?.count ?? it?.scrobbles ?? it?.listeners;

      return { title, artist, album, img, count };
    });
  }

  function normalizeRecentItems(data) {
    const arr = data?.items || data?.recent || data?.list || data?.data || data || [];
    if (!Array.isArray(arr)) return [];

    return arr.map((it) => {
      const title = safeText(it?.name || it?.title || "—");
      const artist = safeText(it?.artist?.name || it?.artist || "");
      const album = safeText(it?.album?.name || it?.album || "");

      const img =
        pickImage(it) ||
        pickImage(it?.album) ||
        "";

      return { title, artist, album, img };
    });
  }
/* PART 3/4 — app.js (FULL REPLACE CONT.) */

  // ====== LOADERS ======
  async function loadNow() {
    try {
      const data = await fetchJsonProbe(EP.now);
      const now = normalizeNow(data);

      nowTrack.textContent = now.title || "—";
      nowArtist.textContent = now.artist || "—";
      nowAlbum.textContent = now.album || "—";

      nowUpdated.textContent = fmtTime(new Date());
      nowMsg.textContent = now.nowPlaying ? "Now playing" : "Last seen";

      // badge
      nowBadge.classList.toggle("live", now.nowPlaying);
      nowBadgeText.textContent = now.nowPlaying ? "LIVE" : "OFF";

      // artwork
      const url = ensureHttps(now.img);

      // reset
      nowImg.style.display = "none";
      nowFallback.style.display = "grid";
      nowImg.removeAttribute("src");

      // ambient off by default
      nowAmbient.classList.remove("on");
      document.documentElement.style.removeProperty("--ambient-url");
      nowCoverWrap.style.removeProperty("--cover-url");

      if (url) {
        nowImg.referrerPolicy = "no-referrer";

        nowImg.onload = () => {
          nowFallback.style.display = "none";
          nowImg.style.display = "block";

          // set CSS vars (matches your working HTML)
          document.documentElement.style.setProperty("--ambient-url", `url("${url.replace(/"/g, "%22")}")`);
          nowCoverWrap.style.setProperty("--cover-url", `url("${url.replace(/"/g, "%22")}")`);
          nowAmbient.classList.add("on");

          // marquee
          requestAnimationFrame(() => {
            applyMarquee(nowTrackWrap);
            applyMarquee(nowArtistWrap);
            applyMarquee(nowAlbumWrap);
          });
        };

        nowImg.onerror = () => {
          nowImg.style.display = "none";
          nowFallback.style.display = "grid";
          nowAmbient.classList.remove("on");
          document.documentElement.style.removeProperty("--ambient-url");
          nowCoverWrap.style.removeProperty("--cover-url");

          requestAnimationFrame(() => {
            applyMarquee(nowTrackWrap);
            applyMarquee(nowArtistWrap);
            applyMarquee(nowAlbumWrap);
          });
        };

        nowImg.src = url;
      } else {
        requestAnimationFrame(() => {
          applyMarquee(nowTrackWrap);
          applyMarquee(nowArtistWrap);
          applyMarquee(nowAlbumWrap);
        });
      }

      setOnline(true);
    } catch (e) {
      // don’t trash UI, just show offline
      setOnline(false);
    }
  }

  async function loadTop() {
    clearEl(topList);

    const type = state.topType;
    const period = state.topPeriod;

    // build query string but keep probing base paths
    const qs = `?type=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}&limit=${TOP_LIMIT}`;

    try {
      const data = await fetchJsonProbe(EP.top.map((p) => p + qs));
      const items = normalizeTopItems(data).slice(0, TOP_LIMIT);

      // Render
      items.forEach((it, idx) => {
        // For artists: show nothing or album-like. For albums: show artist. For tracks: show artist.
        let sub = "";
        if (type === "artists") {
          sub = ""; // clean
        } else if (type === "albums") {
          sub = it.artist || "";
        } else {
          sub = it.artist || "";
        }

        const rightText = it.count !== undefined && it.count !== null ? String(it.count) : "";
        const row = makeRow({
          index: idx + 1,
          title: it.title,
          sub,
          imgUrl: it.img,
          rightText,
          rightIsCount: true,
        });

        topList.appendChild(row);
      });

      setOnline(true);
    } catch (e) {
      setOnline(false);
      const fail = document.createElement("div");
      fail.style.padding = "16px";
      fail.style.color = "rgba(255,255,255,.55)";
      fail.textContent = "Couldn’t load Top.";
      topList.appendChild(fail);
    }
  }

  async function loadRecent() {
    clearEl(recentList);

    const qs = `?limit=${RECENT_LIMIT}`;

    try {
      const data = await fetchJsonProbe(EP.recent.map((p) => p + qs));
      const items = normalizeRecentItems(data).slice(0, RECENT_LIMIT);

      items.forEach((it, idx) => {
        const row = makeRow({
          index: idx + 1,
          title: it.title,
          sub: it.artist || "",
          imgUrl: it.img,
          rightText: "",
          rightIsCount: false,
        });
        recentList.appendChild(row);
      });

      setOnline(true);
    } catch (e) {
      setOnline(false);
      const fail = document.createElement("div");
      fail.style.padding = "16px";
      fail.style.color = "rgba(255,255,255,.55)";
      fail.textContent = "Couldn’t load Recent.";
      recentList.appendChild(fail);
    }
  }
/* PART 4/4 — app.js (FULL REPLACE CONT.) */

  // ====== POLLING ======
  function startNowPolling() {
    stopNowPolling();
    state.nowTimer = setInterval(() => {
      loadNow().catch(() => {});
    }, NOW_POLL_MS);
  }

  function stopNowPolling() {
    if (state.nowTimer) {
      clearInterval(state.nowTimer);
      state.nowTimer = null;
    }
  }

  // ====== INIT ======
  function initDefaults() {
    // default selections (match your HTML initial aria-selected)
    const selectedType = topTypeBtns.find((b) => b.getAttribute("aria-selected") === "true");
    const selectedPeriod = topPeriodBtns.find((b) => b.getAttribute("aria-selected") === "true");

    state.topType = selectedType?.dataset.topType || "tracks";
    state.topPeriod = selectedPeriod?.dataset.topPeriod || "today";

    // default tab is "now"
    setTab("now");

    // initial loads
    loadNow().catch(() => {});
  }

  function init() {
    bindTabs();
    bindTopControls();
    initDefaults();
  }

  // run
  init();
})();