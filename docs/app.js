/* Listening Mirror - app.js (UI only)
   Robust parsing for /api/now incl. {ok:true, item:null}
   When not playing: shows Last played (from /api/history?limit=1)
*/

(() => {
  const API_BASE = "https://i.errtanq9.workers.dev";

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const statusDot = $("#statusDot");
  const statusLine = $("#statusLine");

  const tabBtns = $$(".tabBtn");
  const panels = $$("[data-panel]");

  // Now
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

  // Top
  const topList = $("#topList");
  const topTypeBtns = $$("[data-top-type]");
  const topPeriodBtns = $$("[data-top-period]");
  let topType = "tracks";
  let topPeriod = "today";
  const TOP_LIMIT = 10;

  // Recent
  const recentList = $("#recentList");
  const RECENT_LIMIT = 10;

  // ---------- Utils ----------
  const pad2 = (n) => String(n).padStart(2, "0");
  function fmtTime(d = new Date()) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }

  function normalizeImg(u) {
    if (!u) return "";
    if (u.startsWith("http")) return u;
    if (u.startsWith("/img")) return API_BASE + u;
    return u;
  }

  async function fetchJSON(path, { timeoutMs = 12000 } = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(API_BASE + path, { signal: controller.signal, cache: "no-store" });
      const txt = await res.text();
      let json = null;
      try { json = JSON.parse(txt); } catch { json = null; }
      if (!res.ok) {
        const msg = json?.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return json ?? {};
    } finally {
      clearTimeout(id);
    }
  }

  function setOnline(ok) {
    if (ok) {
      statusDot.classList.add("on");
      statusLine.textContent = "Online";
    } else {
      statusDot.classList.remove("on");
      statusLine.textContent = "Offline";
    }
  }

  function setSelected(btns, isSelectedFn) {
    btns.forEach((b) => b.setAttribute("aria-selected", isSelectedFn(b) ? "true" : "false"));
  }

  function showPanel(name) {
    panels.forEach((p) => p.classList.toggle("hidden", p.getAttribute("data-panel") !== name));
    setSelected(tabBtns, (b) => b.dataset.tab === name);
  }

  // Marquee helper
  function setupMarquee(wrapEl, textEl) {
    if (!wrapEl || !textEl) return;
    wrapEl.classList.remove("marqOn");
    requestAnimationFrame(() => {
      const wrapW = wrapEl.clientWidth;
      const textW = textEl.scrollWidth;
      if (textW > wrapW + 8) {
        const shift = Math.min(textW - wrapW + 24, 420);
        const dur = Math.max(9, Math.min(18, shift / 28));
        wrapEl.style.setProperty("--marqShift", `${shift}px`);
        wrapEl.style.setProperty("--marqDur", `${dur}s`);
        wrapEl.classList.add("marqOn");
      }
    });
  }

  // ---------- Robust NOW parsing ----------
  function pick(obj, keys) {
    for (const k of keys) {
      const v = obj?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return "";
  }

  function toBool(v) {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") return ["true","1","yes","y","playing","nowplaying"].includes(v.toLowerCase());
    return false;
  }

  function parseNowPayload(j) {
    // Special case: your worker returns { ok:true, item:null } when not playing
    if (j?.ok === true && j?.item === null) {
      return { playing: false, track: "—", artist: "—", album: "—", image: "", message: "Not playing now" };
    }

    const core =
      j?.now ||
      j?.item ||
      j?.data ||
      j?.result ||
      j;

    const playing =
      toBool(pick(core, ["playing", "isPlaying", "nowplaying", "nowPlaying", "live"])) ||
      toBool(pick(j, ["playing", "isPlaying", "nowplaying", "nowPlaying", "live"]));

    const track =
      pick(core, ["track", "name", "title"]) ||
      pick(core?.track, ["name", "#text"]) ||
      "—";

    const artist =
      pick(core, ["artist"]) ||
      pick(core?.artist, ["name", "#text"]) ||
      pick(core, ["artistName"]) ||
      "—";

    const album =
      pick(core, ["album"]) ||
      pick(core?.album, ["name", "#text"]) ||
      pick(core, ["albumName"]) ||
      "—";

    const image =
      pick(core, ["image", "cover", "coverUrl", "art", "artwork", "albumArt", "img"]) ||
      "";

    const message =
      pick(core, ["message", "status", "note"]) ||
      "";

    return { playing, track, artist, album, image, message };
  }
// ---------- Skeleton UI ----------
  function renderSkeleton(listEl, rows = 8) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < rows; i++) {
      const row = document.createElement("div");
      row.className = "row skeleton";

      const thumb = document.createElement("div");
      thumb.className = "thumb";
      const tf = document.createElement("div");
      tf.className = "thumbFallback";
      tf.textContent = "";
      thumb.appendChild(tf);

      const mid = document.createElement("div");
      mid.className = "mid";
      const l1 = document.createElement("div");
      l1.className = "skLine skW1";
      const l2 = document.createElement("div");
      l2.className = "skLine skW2";
      mid.appendChild(l1);
      mid.appendChild(l2);

      const right = document.createElement("div");
      right.className = "right";
      const rc = document.createElement("div");
      rc.className = "skCount";
      right.appendChild(rc);

      row.appendChild(thumb);
      row.appendChild(mid);
      row.appendChild(right);
      frag.appendChild(row);
    }
    listEl.innerHTML = "";
    listEl.appendChild(frag);
  }

  // ---------- Render rows ----------
  function makeRow({ idx, title, subtitle, image, rightText = "" }) {
    const row = document.createElement("div");
    row.className = "row";

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    if (image) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = "";
      img.src = image;
      thumb.appendChild(img);
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

    if (typeof idx === "number") {
      const s = document.createElement("span");
      s.className = "idx";
      s.textContent = `${idx}.`;
      t.appendChild(s);
    }

    const titleSpan = document.createElement("span");
    titleSpan.textContent = title || "—";
    t.appendChild(titleSpan);

    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = subtitle || "";

    mid.appendChild(t);
    mid.appendChild(sub);

    const right = document.createElement("div");
    right.className = "right count";
    right.textContent = rightText || "";

    row.appendChild(thumb);
    row.appendChild(mid);
    row.appendChild(right);

    return row;
  }

  function showError(listEl, msg) {
    listEl.innerHTML = "";
    const row = document.createElement("div");
    row.className = "row";
    row.style.padding = "18px 16px";
    row.style.color = "rgba(255,255,255,.70)";
    row.textContent = msg;
    listEl.appendChild(row);
  }

  // ---------- Now helpers ----------
  function applyNowArtwork(img) {
    if (img) {
      nowImg.src = img;
      nowImg.style.display = "block";
      nowFallback.style.display = "none";
      nowCoverWrap.style.setProperty("--cover-url", `url("${img}")`);

      nowAmbient.style.setProperty("--ambient-url", `url("${img}")`);
      nowAmbient.classList.add("on");
    } else {
      nowImg.removeAttribute("src");
      nowImg.style.display = "none";
      nowFallback.style.display = "grid";
      nowCoverWrap.style.setProperty("--cover-url", "none");

      nowAmbient.classList.remove("on");
      nowAmbient.style.setProperty("--ambient-url", "none");
    }
  }

  async function getLastPlayedFallback() {
    try {
      const h = await fetchJSON(`/api/history?limit=1`, { timeoutMs: 9000 });
      const it = Array.isArray(h?.items) && h.items.length ? h.items[0] : null;
      if (!it) return null;
      return {
        track: it?.name || it?.track || "—",
        artist: it?.artist || "—",
        album: it?.album || "—",
        image: normalizeImg(it?.image || "")
      };
    } catch {
      return null;
    }
  }

  // ---------- Now ----------
  async function loadNow() {
    try {
      const j = await fetchJSON("/api/now");
      setOnline(true);

      const parsed = parseNowPayload(j);
      const playing = !!parsed.playing;

      // If not playing, upgrade UI by showing Last played
      if (!playing) {
        const last = await getLastPlayedFallback();

        nowBadge.classList.remove("live");
        nowBadgeText.textContent = "OFF";

        if (last) {
          nowTrack.textContent = last.track || "—";
          nowArtist.textContent = last.artist || "—";
          nowAlbum.textContent = last.album || "—";
          nowMsg.textContent = "Last played";
          applyNowArtwork(last.image || "");
        } else {
          nowTrack.textContent = "—";
          nowArtist.textContent = "—";
          nowAlbum.textContent = "—";
          nowMsg.textContent = parsed.message || "Not playing now";
          applyNowArtwork("");
        }

        nowUpdated.textContent = fmtTime(new Date());
        setupMarquee(nowTrackWrap, nowTrack);
        setupMarquee(nowArtistWrap, nowArtist);
        setupMarquee(nowAlbumWrap, nowAlbum);
        return;
      }

      // Playing (LIVE)
      const track = parsed.track || "—";
      const artist = parsed.artist || "—";
      const album = parsed.album || "—";
      const img = normalizeImg(parsed.image || "");

      nowBadge.classList.add("live");
      nowBadgeText.textContent = "LIVE";

      nowTrack.textContent = track;
      nowArtist.textContent = artist;
      nowAlbum.textContent = album;
      nowMsg.textContent = parsed.message || "";

      applyNowArtwork(img);

      nowUpdated.textContent = fmtTime(new Date());

      setupMarquee(nowTrackWrap, nowTrack);
      setupMarquee(nowArtistWrap, nowArtist);
      setupMarquee(nowAlbumWrap, nowAlbum);

    } catch (e) {
      setOnline(false);

      nowBadge.classList.remove("live");
      nowBadgeText.textContent = "OFF";
      nowTrack.textContent = "—";
      nowArtist.textContent = "—";
      nowAlbum.textContent = "—";
      nowMsg.textContent = "Offline";
      nowUpdated.textContent = fmtTime(new Date());

      applyNowArtwork("");
    }
  }
// ---------- Top ----------
  async function loadTop() {
    renderSkeleton(topList, 9);
    try {
      const j = await fetchJSON(`/api/top?type=${encodeURIComponent(topType)}&period=${encodeURIComponent(topPeriod)}&limit=${TOP_LIMIT}`);
      setOnline(true);

      const items = Array.isArray(j?.items) ? j.items : [];
      topList.innerHTML = "";

      if (!items.length) {
        showError(topList, "No data.");
        return;
      }

      const frag = document.createDocumentFragment();
      items.forEach((it, i) => {
        const title = it?.name || "—";
        const subtitle =
          topType === "artists"
            ? (it?.name || "")
            : (it?.artist || "");

        const img = normalizeImg(it?.image || "");
        const rightText = String(it?.playcount ?? "");

        const finalTitle = topType === "artists" ? (it?.name || "—") : title;
        const finalSub = topType === "artists" ? "" : subtitle;

        frag.appendChild(makeRow({
          idx: i + 1,
          title: finalTitle,
          subtitle: finalSub,
          image: img,
          rightText
        }));
      });

      topList.appendChild(frag);
    } catch (e) {
      setOnline(false);
      showError(topList, "Couldn't load Top.");
    }
  }

  // ---------- Recent ----------
  async function loadRecent() {
    renderSkeleton(recentList, 9);
    try {
      const j = await fetchJSON(`/api/history?limit=${RECENT_LIMIT}`);
      setOnline(true);

      const items = Array.isArray(j?.items) ? j.items : [];
      recentList.innerHTML = "";

      if (!items.length) {
        showError(recentList, "No recent history.");
        return;
      }

      const frag = document.createDocumentFragment();
      items.forEach((it, i) => {
        const title = it?.name || it?.track || "—";
        const subtitle = it?.artist || "—";
        const img = normalizeImg(it?.image || "");
        frag.appendChild(makeRow({
          idx: i + 1,
          title,
          subtitle,
          image: img,
          rightText: ""
        }));
      });

      recentList.appendChild(frag);
    } catch (e) {
      setOnline(false);
      showError(recentList, "Couldn't load Recent.");
    }
  }

  // ---------- Events ----------
  function wireTabs() {
    tabBtns.forEach((b) => {
      b.addEventListener("click", () => {
        const tab = b.dataset.tab;
        showPanel(tab);
        if (tab === "top") loadTop();
        if (tab === "recent") loadRecent();
      });
    });
  }

  function wireTopControls() {
    topTypeBtns.forEach((b) => {
      b.addEventListener("click", () => {
        topType = b.dataset.topType;
        setSelected(topTypeBtns, (x) => x.dataset.topType === topType);
        loadTop();
      });
    });

    topPeriodBtns.forEach((b) => {
      b.addEventListener("click", () => {
        topPeriod = b.dataset.topPeriod;
        setSelected(topPeriodBtns, (x) => x.dataset.topPeriod === topPeriod);
        loadTop();
      });
    });
  }
// ---------- Boot ----------
  async function boot() {
    wireTabs();
    wireTopControls();

    showPanel("now");

    setSelected(topTypeBtns, (x) => x.dataset.topType === topType);
    setSelected(topPeriodBtns, (x) => x.dataset.topPeriod === topPeriod);

    try {
      await fetchJSON("/api/ping", { timeoutMs: 6000 });
      setOnline(true);
    } catch {
      setOnline(false);
    }

    await loadNow();
    setInterval(loadNow, 15000);
  }

  boot();
})();