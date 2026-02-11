/* Listening Mirror UI
   - Dynamic artwork tint (with safe fallback)
*/
(() => {
  "use strict";

  const WORKER_BASE = "https://i.errtanq9.workers.dev"; // no trailing slash

  const el = (sel) => document.querySelector(sel);
  const els = (sel) => Array.from(document.querySelectorAll(sel));

  // Header
  const statusLine = el("#statusLine");
  const statusDot = el("#statusDot");
  const toast = el("#toast");
  const bgTint = el("#bgTint");

  // Tabs
  const panels = els(".panel");
  const tabBtns = els(".tabBtn");

  // Now Playing UI
  const nowUpdated = el("#nowUpdated");
  const nowBadge = el("#nowBadge");
  const nowImg = el("#nowImg");
  const nowFallback = el("#nowFallback");
  const nowTrack = el("#nowTrack");
  const nowArtist = el("#nowArtist");
  const nowAlbum = el("#nowAlbum");
  const nowMsg = el("#nowMsg");

  const nowTrackWrap = el("#nowTrackWrap");
  const nowArtistWrap = el("#nowArtistWrap");
  const nowAlbumWrap = el("#nowAlbumWrap");

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
  const topLimit = 10;
  let online = false;

  // Tint state (avoid reprocessing same artwork)
  let lastTintKey = "";
  let tintCooldownUntil = 0;

  // ---------------------------
  // Helpers
  // ---------------------------
  function vibrate(ms = 10) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch {}
  }

  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 1800);
  }

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

    vibrate(8);

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

  function setStatus(isOnline) {
    online = !!isOnline;

    if (statusLine) statusLine.textContent = online ? "Online" : "Offline • retrying";
    if (statusDot) {
      statusDot.classList.toggle("ok", online);
      statusDot.classList.toggle("bad", !online);
    }
    if (!online) showToast("Offline. Retrying…");
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

  function openSpotifySearch(query) {
    if (!query) return;
    const q = encodeURIComponent(query);
    const url = `https://open.spotify.com/search/${q}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }
// ---------------------------
  // Dynamic Tint (artwork -> CSS vars)
  // ---------------------------
  function setTintRGB(r, g, b) {
    const root = document.documentElement;
    root.style.setProperty("--tint-r", String(r));
    root.style.setProperty("--tint-g", String(g));
    root.style.setProperty("--tint-b", String(b));
  }

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  // Deterministic fallback color from text (no "random", always same for same key)
  function hashTintFromString(str) {
    const s = String(str || "");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    // spread into RGB but keep "premium" range (not neon)
    const r = 50 + (h & 0xff) * 0.55;
    const g = 60 + ((h >> 8) & 0xff) * 0.50;
    const b = 70 + ((h >> 16) & 0xff) * 0.60;
    return {
      r: Math.max(40, Math.min(220, Math.round(r))),
      g: Math.max(40, Math.min(220, Math.round(g))),
      b: Math.max(40, Math.min(220, Math.round(b))),
    };
  }

  // Try to sample pixels (requires CORS). If blocked -> return null
  async function sampleAverageColorFromImage(url) {
    const u = resolveImageUrl(url);
    if (!u) return null;

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // will work only if server allows it
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";

      img.onload = () => {
        try {
          const w = 32, h = 32;
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (!ctx) return resolve(null);

          ctx.drawImage(img, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;

          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3] / 255;
            if (a < 0.15) continue;

            const rr = data[i], gg = data[i + 1], bb = data[i + 2];
            // ignore near-black pixels to avoid muddy tint
            const lum = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
            if (lum < 18) continue;

            r += rr; g += gg; b += bb;
            n++;
          }
          if (n < 20) return resolve(null);

          r = Math.round(r / n);
          g = Math.round(g / n);
          b = Math.round(b / n);

          // "premium" shaping: slightly darker + less harsh
          r = Math.round(r * 0.88);
          g = Math.round(g * 0.88);
          b = Math.round(b * 0.88);

          resolve({ r, g, b });
        } catch {
          // likely canvas is tainted by CORS
          resolve(null);
        }
      };

      img.onerror = () => resolve(null);

      // cache-bust lightly so you get updated images if needed
      img.src = u;
    });
  }

  async function updateTint({ imageUrl, keyString }) {
    const now = Date.now();
    if (now < tintCooldownUntil) return;

    const key = `${keyString || ""}::${imageUrl || ""}`;
    if (key && key === lastTintKey) return;
    lastTintKey = key;

    // avoid spamming if user flips tabs fast
    tintCooldownUntil = now + 500;

    let rgb = await sampleAverageColorFromImage(imageUrl);
    if (!rgb) {
      rgb = hashTintFromString(keyString || imageUrl || "Listening Mirror");
    }
    setTintRGB(rgb.r, rgb.g, rgb.b);
  }

  // ---------------------------
  // Marquee
  // ---------------------------
  function applyMarquee(wrapperEl) {
    if (!wrapperEl) return;
    const inner = wrapperEl.querySelector(".marqueeInner");
    if (!inner) return;

    wrapperEl.classList.remove("marqueeOn");
    wrapperEl.style.removeProperty("--marquee-shift");

    requestAnimationFrame(() => {
      const wrapW = wrapperEl.clientWidth;
      const innerW = inner.scrollWidth;
      if (!wrapW || innerW <= wrapW + 2) return;

      const shift = Math.max(0, innerW - wrapW + 18);
      wrapperEl.style.setProperty("--marquee-shift", `${shift}px`);
      wrapperEl.classList.add("marqueeOn");
    });
  }

  function applyMarqueeAll() {
    els(".titleMarquee").forEach(applyMarquee);
    els(".subMarquee").forEach(applyMarquee);
  }
// ---------------------------
  // Skeleton builders
  // ---------------------------
  function skeletonRow() {
    const wrap = document.createElement("div");
    wrap.className = "row";

    const cover = document.createElement("div");
    cover.className = "cover skeleton";

    const mid = document.createElement("div");
    mid.className = "mid";

    const t = document.createElement("div");
    t.className = "title skeleton";
    t.style.height = "18px";
    t.style.borderRadius = "10px";
    t.style.width = "86%";

    const s = document.createElement("div");
    s.className = "sub skeleton";
    s.style.height = "14px";
    s.style.borderRadius = "10px";
    s.style.width = "64%";
    s.style.marginTop = "10px";

    mid.appendChild(t);
    mid.appendChild(s);

    const r = document.createElement("div");
    r.className = "right skeleton";
    r.style.height = "18px";
    r.style.borderRadius = "10px";
    r.style.width = "38px";

    wrap.appendChild(cover);
    wrap.appendChild(mid);
    wrap.appendChild(r);

    return wrap;
  }

  function skeletonNow() {
    if (nowImg) nowImg.style.display = "none";
    if (nowFallback) {
      nowFallback.style.display = "grid";
      nowFallback.classList.add("skeleton");
      nowFallback.textContent = "";
    }

    [nowTrack, nowArtist, nowAlbum].forEach((x) => {
      if (!x) return;
      x.classList.add("skeleton");
      x.textContent = "";
      x.style.height = x === nowTrack ? "24px" : "16px";
      x.style.borderRadius = "12px";
      x.style.display = "block";
      x.style.width = x === nowTrack ? "88%" : "62%";
      x.style.marginTop = x === nowTrack ? "0" : "10px";
    });

    if (nowMsg) {
      nowMsg.classList.add("skeleton");
      nowMsg.textContent = "";
      nowMsg.style.height = "14px";
      nowMsg.style.borderRadius = "10px";
      nowMsg.style.width = "48%";
      nowMsg.style.marginTop = "12px";
    }
  }

  function clearNowSkeleton() {
    if (nowFallback) {
      nowFallback.classList.remove("skeleton");
      nowFallback.textContent = "♪";
    }
    [nowTrack, nowArtist, nowAlbum, nowMsg].forEach((x) => {
      if (!x) return;
      x.classList.remove("skeleton");
      x.removeAttribute("style");
    });
  }

  function setNowCover(imgUrl) {
    const u = resolveImageUrl(imgUrl);
    if (u) {
      nowImg.src = u;
      nowImg.style.display = "block";
      if (nowFallback) nowFallback.style.display = "none";
    } else {
      nowImg.removeAttribute("src");
      nowImg.style.display = "none";
      if (nowFallback) nowFallback.style.display = "grid";
    }
  }

  function rowItem({ idx, title, subtitle, right, imageUrl, spotifyQuery, tintKey }) {
    const wrap = document.createElement("div");
    wrap.className = "row";
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "button");
    wrap.setAttribute("aria-label", `${title}${subtitle ? " — " + subtitle : ""}`);

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

    const tWrap = document.createElement("div");
    tWrap.className = "titleMarquee";
    const t = document.createElement("div");
    t.className = "title marqueeInner";
    t.textContent = `${idx}. ${title}`;
    tWrap.appendChild(t);

    const sWrap = document.createElement("div");
    sWrap.className = "subMarquee";
    const s = document.createElement("div");
    s.className = "sub marqueeInner";
    s.textContent = subtitle || "";
    sWrap.appendChild(s);

    mid.appendChild(tWrap);
    mid.appendChild(sWrap);

    const r = document.createElement("div");
    r.className = "right";
    r.textContent = right != null ? String(right) : "";

    wrap.appendChild(cover);
    wrap.appendChild(mid);
    wrap.appendChild(r);

    const q = spotifyQuery || `${title} ${subtitle || ""}`.trim();

    // Tap → Spotify
    wrap.addEventListener("click", () => {
      vibrate(12);
      openSpotifySearch(q);
    });
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        vibrate(12);
        openSpotifySearch(q);
      }
    });

    // Premium: on hover/tap focus, tint follows this item artwork
    // (on mobile it triggers when you tap)
    const tintStr = tintKey || q;
    wrap.addEventListener("pointerenter", () => updateTint({ imageUrl, keyString: tintStr }));
    wrap.addEventListener("focus", () => updateTint({ imageUrl, keyString: tintStr }));

    requestAnimationFrame(() => {
      applyMarquee(tWrap);
      applyMarquee(sWrap);
    });

    return wrap;
  }
// ---------------------------
  // Fetch + Render
  // ---------------------------
  async function refreshPing() {
    try {
      const j = await safeFetchJson("/api/ping");
      setStatus(!!j?.ok);
    } catch {
      setStatus(false);
    }
  }

  async function refreshNow() {
    nowUpdated.textContent = fmtTime(Date.now());
    nowBadge.textContent = "…";
    nowBadge.classList.add("badgeLive");
    skeletonNow();

    try {
      const j = await safeFetchJson("/api/now");
      setStatus(true);

      clearNowSkeleton();
      nowUpdated.textContent = fmtTime(Date.now());

      const item = j?.item;
      if (!item) {
        nowMsg.textContent = "Not playing now";
        nowBadge.textContent = "OFF";
        nowBadge.classList.remove("badgeLive");
        setNowCover("");
        // neutral tint fallback
        updateTint({ imageUrl: "", keyString: "Listening Mirror" });
        applyMarquee(nowTrackWrap);
        applyMarquee(nowArtistWrap);
        applyMarquee(nowAlbumWrap);
        return;
      }

      nowBadge.textContent = "LIVE";
      nowBadge.classList.add("badgeLive");

      nowTrack.textContent = item.name || "—";
      nowArtist.textContent = item.artist || "—";
      nowAlbum.textContent = item.album || "—";
      nowMsg.textContent = "Now playing";

      setNowCover(item.image || "");

      // Update tint from current artwork (or fallback)
      updateTint({
        imageUrl: item.image || "",
        keyString: `${item.name || ""} ${item.artist || ""}`.trim()
      });

      applyMarquee(nowTrackWrap);
      applyMarquee(nowArtistWrap);
      applyMarquee(nowAlbumWrap);

      // Tap Now card → Spotify search
      const q = `${item.name || ""} ${item.artist || ""}`.trim();
      const card = nowTrackWrap?.closest(".card");
      if (card && !card.dataset.spotifyBound) {
        card.dataset.spotifyBound = "1";
        card.addEventListener("click", () => {
          if (currentTab !== "now") return;
          vibrate(12);
          openSpotifySearch(q);
        });
      }
    } catch (e) {
      setStatus(false);
      clearNowSkeleton();
      nowMsg.textContent = `Error: ${String(e.message || e)}`;
      nowBadge.textContent = "OFF";
      nowBadge.classList.remove("badgeLive");
      setNowCover("");
      updateTint({ imageUrl: "", keyString: "Listening Mirror" });
    }
  }

  async function refreshRecent() {
    recentMeta.textContent = "";
    recentList.innerHTML = "";
    for (let i = 0; i < 6; i++) recentList.appendChild(skeletonRow());

    try {
      const j = await safeFetchJson("/api/history?limit=10");
      setStatus(true);

      const items = j?.items || [];
      recentList.innerHTML = "";

      items.forEach((it, i) => {
        recentList.appendChild(
          rowItem({
            idx: i + 1,
            title: it.name || "—",
            subtitle: it.artist || "",
            right: "",
            imageUrl: it.image || "",
            spotifyQuery: `${it.name || ""} ${it.artist || ""}`.trim(),
            tintKey: `${it.name || ""} ${it.artist || ""}`.trim()
          })
        );
      });

      recentMeta.textContent = items.length ? "" : "No recent history returned.";
      // tint from first visible item (nice default)
      if (items[0]) {
        updateTint({
          imageUrl: items[0].image || "",
          keyString: `${items[0].name || ""} ${items[0].artist || ""}`.trim()
        });
      }
      applyMarqueeAll();
    } catch (e) {
      setStatus(false);
      recentMeta.textContent = `Error: ${String(e.message || e)}`;
      recentList.innerHTML = "";
      updateTint({ imageUrl: "", keyString: "Listening Mirror" });
    }
  }

  async function refreshTop() {
    topMeta.textContent = "";
    topList.innerHTML = "";
    topBadge.textContent = String(topLimit);
    for (let i = 0; i < 6; i++) topList.appendChild(skeletonRow());

    const path = `/api/top?type=${encodeURIComponent(topType)}&period=${encodeURIComponent(topPeriod)}&limit=${encodeURIComponent(topLimit)}`;

    try {
      const j = await safeFetchJson(path);
      setStatus(true);

      const items = j?.items || [];
      topList.innerHTML = "";
      topMeta.textContent = `${topType} • ${topPeriod}`;

      items.forEach((it, i) => {
        if (topType === "artists") {
          topList.appendChild(
            rowItem({
              idx: i + 1,
              title: it.name || "—",
              subtitle: "",
              right: it.playcount ?? "",
              imageUrl: it.image || "",
              spotifyQuery: `${it.name || ""}`.trim(),
              tintKey: `${it.name || ""}`.trim()
            })
          );
        } else if (topType === "albums") {
          topList.appendChild(
            rowItem({
              idx: i + 1,
              title: it.name || "—",
              subtitle: it.artist || "",
              right: it.playcount ?? "",
              imageUrl: it.image || "",
              spotifyQuery: `${it.name || ""} ${it.artist || ""}`.trim(),
              tintKey: `${it.name || ""} ${it.artist || ""}`.trim()
            })
          );
        } else {
          topList.appendChild(
            rowItem({
              idx: i + 1,
              title: it.name || "—",
              subtitle: it.artist || "",
              right: it.playcount ?? "",
              imageUrl: it.image || "",
              spotifyQuery: `${it.name || ""} ${it.artist || ""}`.trim(),
              tintKey: `${it.name || ""} ${it.artist || ""}`.trim()
            })
          );
        }
      });

      if (!items.length) topMeta.textContent = "No top data returned.";

      // tint from first item (default)
      if (items[0]) {
        const key = topType === "artists"
          ? `${items[0].name || ""}`.trim()
          : `${items[0].name || ""} ${items[0].artist || ""}`.trim();
        updateTint({ imageUrl: items[0].image || "", keyString: key });
      } else {
        updateTint({ imageUrl: "", keyString: "Listening Mirror" });
      }

      applyMarqueeAll();
    } catch (e) {
      setStatus(false);
      topMeta.textContent = `Error: ${String(e.message || e)}`;
      topList.innerHTML = "";
      updateTint({ imageUrl: "", keyString: "Listening Mirror" });
    }
  }

  // ---------------------------
  // Wire UI
  // ---------------------------
  function init() {
    tabBtns.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

    topTypeBtns.forEach((b) => {
      b.addEventListener("click", () => {
        topType = String(b.dataset.topType || "tracks");
        setSelected(topTypeBtns, (x) => x === b);
        vibrate(8);
        refreshTop();
      });
    });

    topPeriodBtns.forEach((b) => {
      b.addEventListener("click", () => {
        topPeriod = String(b.dataset.topPeriod || "today");
        setSelected(topPeriodBtns, (x) => x === b);
        vibrate(8);
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

    window.addEventListener("resize", () => {
      applyMarqueeAll();
      applyMarquee(nowTrackWrap);
      applyMarquee(nowArtistWrap);
      applyMarquee(nowAlbumWrap);
    }, { passive: true });

    window.addEventListener("touchmove", () => {}, { passive: true });

    // initial neutral tint
    updateTint({ imageUrl: "", keyString: "Listening Mirror" });
  }

  init();
})();