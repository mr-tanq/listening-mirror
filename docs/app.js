/* ===== app.js (FULL REPLACE) — Part 1/4 ===== */
(() => {
  "use strict";

  // ---------- Config ----------
  const DEFAULT_API = "https://i.errtanq9.workers.dev";
  const POLL_MS = 15000;

  // Allow ?api=https://xxxx.workers.dev
  const urlParams = new URLSearchParams(location.search);
  const API_BASE = (urlParams.get("api") || DEFAULT_API).replace(/\/+$/, "");

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  const statusDot = $("statusDot");
  const statusLine = $("statusLine");

  const tabs = Array.from(document.querySelectorAll(".tabBtn"));
  const panels = Array.from(document.querySelectorAll("[data-panel]"));

  // NOW
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

  // TOP
  const topList = $("topList");
  const topTypeBtns = Array.from(document.querySelectorAll('[data-top-type]'));
  const topPeriodBtns = Array.from(document.querySelectorAll('[data-top-period]'));

  // RECENT
  const recentList = $("recentList");

  // ---------- State ----------
  let currentTab = "now";
  let topType = "tracks";
  let topPeriod = "today";
  let pollTimer = null;

  // ---------- Helpers ----------
  function setOnline(isOnline) {
    if (!statusDot || !statusLine) return;
    statusDot.classList.toggle("on", !!isOnline);
    statusLine.textContent = isOnline ? "Online" : "Offline";
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function formatTime(d = new Date()) {
    // simple local time like 02:22:58 PM
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
    // Accept absolute urls. If worker returns //... or http, normalize:
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
    // reset
    wrapEl.classList.remove("marqOn");
    wrapEl.style.removeProperty("--marqShift");
    wrapEl.style.removeProperty("--marqDur");

    // measure overflow
    requestAnimationFrame(() => {
      const wrapW = wrapEl.clientWidth;
      const textW = spanEl.scrollWidth;
      if (textW > wrapW + 4) {
        const shift = Math.ceil(textW - wrapW + 24);
        // speed: ~45px/sec, clamp 8..18 sec
        const dur = Math.max(8, Math.min(18, shift / 45));
        wrapEl.style.setProperty("--marqShift", `${shift}px`);
        wrapEl.style.setProperty("--marqDur", `${dur}s`);
        wrapEl.classList.add("marqOn");
      }
    });
  }

  async function fetchJSON(path, qsObj) {
    const u = new URL(API_BASE + path);
    if (qsObj && typeof qsObj === "object") {
      Object.entries(qsObj).forEach(([k, v]) => {
        if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
      });
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);

    try {
      const res = await fetch(u.toString(), {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}${txt ? ` — ${txt.slice(0,120)}` : ""}`);
      }
      const data = await res.json();
      return data;
    } finally {
      clearTimeout(t);
    }
  }
/* ===== app.js — Part 2/4 ===== */

  // ---------- UI: Tabs ----------
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

    // when switching to top/recent, load once immediately
    if (tabName === "top") loadTop().catch(() => {});
    if (tabName === "recent") loadRecent().catch(() => {});
  }

  tabs.forEach((b) => {
    b.addEventListener("click", () => showTab(b.dataset.tab));
  });

  // ---------- UI: Top Segments ----------
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

  // ---------- Renderers ----------
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

    // thumb
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
        // fallback icon
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

    // mid
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

    // right
    const right = document.createElement("div");
    right.className = "right" + (rightClass ? ` ${rightClass}` : "");
    right.textContent = rightText || "";

    row.appendChild(thumb);
    row.appendChild(mid);
    row.appendChild(right);
    return row;
  }

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

    // reset UI
    nowImg.style.display = "none";
    nowFallback.style.display = "grid";

    if (!img) {
      nowImg.removeAttribute("src");
      setCoverAndAmbient("");
      return;
    }

    setCoverAndAmbient(img);

    // Load image safely: show only on load success (keeps artwork logic intact)
    nowImg.onload = () => {
      nowFallback.style.display = "none";
      nowImg.style.display = "block";
    };
    nowImg.onerror = () => {
      nowImg.style.display = "none";
      nowFallback.style.display = "grid";
      // keep ambient but not required; if the image fails, remove ambient too
      setCoverAndAmbient("");
    };

    nowImg.referrerPolicy = "no-referrer";
    nowImg.src = img;
  }

  async function loadNow() {
    // Worker is expected to provide a "now" endpoint.
    // We accept flexible shapes:
    // { live: true/false, track, artist, album, image, message }
    // or { isPlaying, name, artist, album, imageUrl, status }
    const data = await fetchJSON("/now");

    // Determine "live"
    const live = !!(data.live ?? data.isPlaying ?? data.playing ?? data.nowPlaying);
    setNowBadge(live);

    // fields
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

    // artwork
    const imageUrl =
      data.image ??
      data.imageUrl ??
      data.artwork ??
      data.cover ??
      (Array.isArray(data.images) ? data.images[0] : null) ??
      data.albumImage ??
      "";

    setNowArtwork(imageUrl);

    // Marquee if needed
    applyMarquee(nowTrackWrap, nowTrack);
    applyMarquee(nowArtistWrap, nowArtist);
    applyMarquee(nowAlbumWrap, nowAlbum);

    nowUpdated.textContent = formatTime(new Date());
    setOnline(true);
  }
/* ===== app.js — Part 3/4 ===== */

  // ---------- TOP ----------
  async function loadTop() {
    clearEl(topList);

    // Worker expected: /top?type=tracks|artists|albums&period=today|week|year
    const data = await fetchJSON("/top", { type: topType, period: topPeriod });

    // Accept flexible shapes:
    // { items:[...] } OR [...] OR { top:[...] }
    const items = Array.isArray(data) ? data : (data.items || data.top || data.list || []);
    if (!Array.isArray(items) || items.length === 0) {
      renderError(topList, "Couldn’t load Top.");
      setOnline(true);
      return;
    }

    const frag = document.createDocumentFragment();

    items.slice(0, 50).forEach((it, i) => {
      // track: { name, artist, image, playcount }
      // artist: { name, image, playcount }
      // album: { name, artist, image, playcount }
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
      const row = makeRow({
        idx: i + 1,
        title,
        sub: safeText(sub, topType === "artists" ? "" : "—"),
        img: imageUrl,
        rightText,
        rightClass: "count",
      });
      frag.appendChild(row);
    });

    topList.appendChild(frag);
    setOnline(true);
  }

  // ---------- RECENT ----------
  async function loadRecent() {
    clearEl(recentList);

    // Worker expected: /recent
    const data = await fetchJSON("/recent");

    // Accept flexible shapes:
    // { items:[...] } OR [...]
    const items = Array.isArray(data) ? data : (data.items || data.recent || data.list || []);
    if (!Array.isArray(items) || items.length === 0) {
      renderError(recentList, "Couldn’t load Recent.");
      setOnline(true);
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

      // time text (optional)
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
      // only now failing => show offline, but keep UI stable
      setOnline(false);
      nowUpdated.textContent = formatTime(new Date());
      nowMsg.textContent = "Offline";
      setNowBadge(false);
      setNowArtwork("");
    }

    // Load top/recent only if user is on those tabs
    if (currentTab === "top") {
      try { await loadTop(); }
      catch { renderError(topList, "Couldn’t load Top."); setOnline(false); }
    }
    if (currentTab === "recent") {
      try { await loadRecent(); }
      catch { renderError(recentList, "Couldn’t load Recent."); setOnline(false); }
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      refreshAll().catch(() => {});
    }, POLL_MS);
  }

  // boot
  showTab("now");
  refreshAll().catch(() => {});
  startPolling();

})();
/* ===== app.js — Part 4/4 ===== */
/*
Notes:
- Default API is https://i.errtanq9.workers.dev
- You can override by visiting:
  https://mr-tanq.github.io/listening-mirror/?api=https://i.errtanq9.workers.dev

If you STILL see Offline:
1) Open these URLs directly in browser:
   https://i.errtanq9.workers.dev/now
   https://i.errtanq9.workers.dev/top?type=tracks&period=today
   https://i.errtanq9.workers.dev/recent
2) If any of them returns an error or no CORS, the frontend cannot load.

But as requested: this file does NOT alter artwork rendering logic.
*/