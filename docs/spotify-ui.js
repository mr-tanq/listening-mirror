/* spotify-ui.js (FULL REPLACE)
   Fixes:
   1) Dock moved further RIGHT of "Listening Mirror" header (premium spacing).
   2) Fix Top first-item bug playing "Agust D - Haegeum" (strict parsing + sanity checks + hard-block).
   3) Prevent orb/Session Covers (MIRROR/LISTENING) area from being treated as playable artwork/row.
*/

(function () {
  "use strict";

  const API_BASE = (window.LISTENING_MIRROR_API || "https://i.errtanq9.workers.dev").replace(/\/+$/, "");

  // ---------------- DOM helpers ----------------
  function el(tag, props = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k === "style") n.setAttribute("style", v);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v, { passive: false });
      else if (v === true) n.setAttribute(k, "");
      else if (v !== false && v != null) n.setAttribute(k, String(v));
    }
    for (const c of children) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function safeCall(path, ...args) {
    try {
      const parts = path.split(".");
      let cur = window;
      for (const p of parts) {
        if (!cur || !(p in cur)) return { ok: false, reason: `missing ${path}` };
        cur = cur[p];
      }
      if (typeof cur !== "function") return { ok: false, reason: `not a function ${path}` };
      return { ok: true, value: cur(...args) };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  }

  function getToken() {
    if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
      return window.SpotifyAuth.getAccessToken();
    }
    try {
      return (
        localStorage.getItem("spotify_access_token") ||
        localStorage.getItem("SPOTIFY_ACCESS_TOKEN") ||
        sessionStorage.getItem("spotify_access_token") ||
        null
      );
    } catch {
      return null;
    }
  }

  function pulse(node) {
    if (!node) return;
    node.classList.remove("spPulse");
    void node.offsetWidth;
    node.classList.add("spPulse");
    setTimeout(() => node.classList.remove("spPulse"), 220);
  }

  // ---------------- CSS ----------------
  function ensureCss() {
    if (document.getElementById("spotifyUiCss")) return;

    const css = `
#spDock{
  position: fixed;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 9px;
  pointer-events: auto;
}
#spDock.hidden{ display:none !important; }

#spDock::before{
  content:"";
  position:absolute;
  inset:-10px -12px -10px -12px;
  border-radius: 999px;
  background: rgba(10,12,14,.40);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  outline: 1px solid rgba(255,255,255,.09);
  box-shadow: 0 18px 60px rgba(0,0,0,.38);
  z-index:-1;
}

#spDock, #spDock *{ pointer-events: auto !important; -webkit-user-select:none; user-select:none; }

#spIndicator{
  width: 16px; height: 16px;
  display: grid; place-items: center;
  opacity: .35; filter: grayscale(1);
  cursor: pointer;
}
#spIndicator.linked{ opacity:.95; filter:none; }
#spIndicator svg{ width:16px; height:16px; display:block; }

/* buttons */
#spDock .spBtn{
  border: 0;
  width: 28px; height: 28px;
  border-radius: 999px;
  display: grid; place-items: center;
  background: rgba(255,255,255,.06);
  outline: 1px solid rgba(255,255,255,.10);
  box-shadow: 0 14px 45px rgba(0,0,0,.22);
  color: rgba(255,255,255,.92);
  padding: 0;
  transition: transform .12s ease, background .12s ease, outline-color .12s ease;
}
#spDock .spBtn:active{ transform: translateY(1px); background: rgba(255,255,255,.08); }
#spDock .spBtn:disabled{ opacity:.32; }
#spDock svg.icon{ width:14px; height:14px; display:block; }

#spDock .spPulse{
  outline-color: rgba(49,208,124,.55);
  box-shadow: 0 18px 70px rgba(0,0,0,.28);
}

/* Clickable artwork / fallback clickable row */
.spArtworkPlayable{
  cursor: pointer !important;
  outline: 1px solid rgba(49,208,124,.0);
  border-radius: 12px;
  transition: outline-color .12s ease, transform .12s ease;
}
.spArtworkPlayable:active{
  transform: translateY(1px);
  outline-color: rgba(49,208,124,.35);
}
.spRowPlayable{
  cursor: pointer !important;
  transition: transform .12s ease;
}
.spRowPlayable:active{
  transform: translateY(1px);
}
    `.trim();

    const style = document.createElement("style");
    style.id = "spotifyUiCss";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------------- Icons ----------------
  function iconSvg(name) {
    if (name === "prev") return `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M6 6h2v12H6V6zm3.5 6L18 6v12l-8.5-6z"/></svg>`;
    if (name === "play") return `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7L8 5z"/></svg>`;
    if (name === "pause") return `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/></svg>`;
    if (name === "next") return `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M16 6h2v12h-2V6zM6 18V6l8.5 6L6 18z"/></svg>`;
    return "";
  }

  function spotifyLogoSvg() {
    return `
      <svg viewBox="0 0 168 168" aria-hidden="true">
        <path fill="currentColor" d="M84 0C37.6 0 0 37.6 0 84s37.6 84 84 84 84-37.6 84-84S130.4 0 84 0zm38.6 121.3c-1.5 2.4-4.6 3.2-7 1.7-19.2-11.7-43.4-14.3-72-7.8-2.8.6-5.6-1.1-6.2-3.9-.6-2.8 1.1-5.6 3.9-6.2 31.5-7.2 58.5-4.2 80.3 9.1 2.4 1.5 3.2 4.6 1.7 7.1zm9.9-22c-1.9 3-5.8 4-8.8 2.1-22-13.5-55.6-17.4-81.8-9.5-3.4 1-7-0.9-8-4.3-1-3.4.9-7 4.3-8 30-9.1 67.3-4.7 92.8 11.1 3 1.9 4 5.9 2.1 8.6zm.8-23c-26.3-15.6-69.7-17.1-94.8-9.5-4 .1-7.4-2.6-8.5-6.4-1.1-3.8 1.2-7.8 5-8.9 29.1-8.8 77.5-7.1 108.1 11.1 3.5 2.1 4.7 6.7 2.6 10.2-2.1 3.5-6.7 4.7-10.2 2.6z"/>
      </svg>
    `;
  }
// ---------------- Spotify Web API (stable pause/play) ----------------
  async function spotifyApi(endpoint, method = "GET", body = null) {
    const token = getToken();
    if (!token) return { ok: false, status: 401 };
    try {
      const r = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        method,
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : null
      });
      return { ok: r.ok, status: r.status };
    } catch {
      return { ok: false, status: 0 };
    }
  }

  async function apiPause() { return (await spotifyApi("/me/player/pause", "PUT")).ok; }
  async function apiPlay()  { return (await spotifyApi("/me/player/play", "PUT")).ok; }

  async function playUri(uri) {
    let r = safeCall("SpotifyPlayer.playUri", uri);
    if (r.ok) return;
    r = safeCall("SpotifyPlayer.play", { uri });
    if (r.ok) return;
    r = safeCall("SpotifyPlayer.play", uri);
    if (r.ok) return;
    console.warn("[Spotify UI] Cannot play URI:", uri);
  }

  async function getPlaybackState() {
    let r = safeCall("SpotifyPlayer.getState");
    if (r.ok) return await Promise.resolve(r.value);

    r = safeCall("SpotifyPlayer.getPlaybackState");
    if (r.ok) return await Promise.resolve(r.value);

    const token = getToken();
    if (!token) return null;
    try {
      const rr = await fetch("https://api.spotify.com/v1/me/player", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!rr.ok) return null;
      const j = await rr.json();
      return { isPlaying: !!j?.is_playing, paused: typeof j?.is_playing === "boolean" ? !j.is_playing : undefined };
    } catch {
      return null;
    }
  }

  async function pauseSafe() {
    const ok = await apiPause();
    if (ok) return;
    const r = safeCall("SpotifyPlayer.pause");
    if (!r.ok) console.warn("[Spotify UI] Pause fallback failed:", r.reason);
  }

  async function resumeSafe() {
    const ok = await apiPlay();
    if (ok) return;
    let r = safeCall("SpotifyPlayer.play");
    if (r.ok) return;
    r = safeCall("SpotifyPlayer.resume");
    if (r.ok) return;
    console.warn("[Spotify UI] Resume failed.");
  }

  function doLoginOrLogout() {
    const token = getToken();
    if (!token) {
      const r = safeCall("SpotifyAuth.login");
      if (!r.ok) console.warn("[Spotify UI] SpotifyAuth.login missing:", r.reason);
      return;
    }
    let r = safeCall("SpotifyAuth.logout");
    if (r.ok) return;
    try {
      localStorage.removeItem("spotify_access_token");
      localStorage.removeItem("spotify_refresh_token");
      localStorage.removeItem("SPOTIFY_ACCESS_TOKEN");
      localStorage.removeItem("SPOTIFY_REFRESH_TOKEN");
      sessionStorage.removeItem("spotify_access_token");
      sessionStorage.removeItem("spotify_refresh_token");
    } catch {}
  }

  // ---------------- Dock ----------------
  function ensureDock() {
    ensureCss();

    let dock = document.getElementById("spDock");
    if (dock) return dock;

    const indicator = el("div", { id: "spIndicator", title: "Spotify (login/logout)" });
    indicator.innerHTML = spotifyLogoSvg();

    const btnPrev = el("button", { class: "spBtn", id: "spPrev", type: "button", "aria-label": "Previous" });
    const btnToggle = el("button", { class: "spBtn", id: "spToggle", type: "button", "aria-label": "Play/Pause" });
    const btnNext = el("button", { class: "spBtn", id: "spNext", type: "button", "aria-label": "Next" });

    btnPrev.innerHTML = iconSvg("prev");
    btnToggle.innerHTML = iconSvg("play");
    btnNext.innerHTML = iconSvg("next");

    dock = el("div", { id: "spDock" }, [indicator, btnPrev, btnToggle, btnNext]);
    document.body.appendChild(dock);

    bindDockHandlers();
    return dock;
  }

  function setDockHidden(hidden) {
    const dock = document.getElementById("spDock");
    if (!dock) return;
    dock.classList.toggle("hidden", !!hidden);
  }

  function setEnabled(enabled) {
    for (const id of ["spPrev", "spToggle", "spNext"]) {
      const b = document.getElementById(id);
      if (b) b.disabled = !enabled;
    }
  }

  function setIndicatorLinked(linked) {
    const ind = document.getElementById("spIndicator");
    if (!ind) return;
    ind.classList.toggle("linked", !!linked);
  }

  function setToggleIcon(isPlaying) {
    const t = document.getElementById("spToggle");
    if (!t) return;
    t.innerHTML = isPlaying ? iconSvg("pause") : iconSvg("play");
  }

  function inferIsPlaying(state) {
    if (!state) return null;
    if (state.isPlaying === true) return true;
    if (state.playing === true) return true;
    if (typeof state.paused === "boolean") return !state.paused;
    return null;
  }

  function bindDockHandlers() {
    const $ = (id) => document.getElementById(id);

    $("spIndicator")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      doLoginOrLogout();
    }, { passive: false });

    $("spToggle")?.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      pulse($("spToggle"));

      const st = await getPlaybackState();
      const isPlaying = inferIsPlaying(st);

      if (isPlaying === true) {
        setToggleIcon(false);
        await pauseSafe();
      } else {
        setToggleIcon(true);
        await resumeSafe();
      }
    }, { passive: false });

    $("spNext")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      pulse($("spNext"));
      const r = safeCall("SpotifyPlayer.next");
      if (!r.ok) console.warn("[Spotify UI] Next failed:", r.reason);
    }, { passive: false });

    $("spPrev")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      pulse($("spPrev"));
      const r = safeCall("SpotifyPlayer.prev");
      if (!r.ok) console.warn("[Spotify UI] Prev failed:", r.reason);
    }, { passive: false });
  }
// ---------------- Header anchor (Listening Mirror) ----------------
  function findHeaderTitleNode() {
    const nodes = Array.from(document.querySelectorAll("h1,h2,div,span")).slice(0, 2500);
    for (const n of nodes) {
      const t = (n.textContent || "").trim();
      if (t === "Listening Mirror") {
        const r = n.getBoundingClientRect?.();
        if (r && r.width > 120 && r.height > 18 && r.bottom > 0 && r.top < window.innerHeight) return n;
      }
    }
    for (const n of nodes) {
      const t = (n.textContent || "").trim();
      if (t.includes("Listening Mirror")) {
        const r = n.getBoundingClientRect?.();
        if (r && r.width > 120 && r.height > 18 && r.bottom > 0 && r.top < window.innerHeight) return n;
      }
    }
    return null;
  }

  // (1) Dock further RIGHT: bigger gap + slight push even if there is room.
  function positionDock() {
    ensureDock();
    const dock = document.getElementById("spDock");

    const titleNode = findHeaderTitleNode();
    if (titleNode) {
      const r = titleNode.getBoundingClientRect();
      const dockW = dock.offsetWidth || 140;

      const pad = 18;          // base gap from title
      const extraRight = 26;   // requested: more to the RIGHT (premium spacing)

      let x = r.right + pad + extraRight;

      const maxLeft = window.innerWidth - dockW - 10;
      if (x > maxLeft) x = Math.max(10, maxLeft);

      const y = r.top + (r.height / 2) - (dock.offsetHeight ? dock.offsetHeight / 2 : 18);

      dock.style.left = `${Math.round(x)}px`;
      dock.style.top = `${Math.round(Math.max(6, y))}px`;
      dock.style.transform = "none";

      setDockHidden(false);
      return;
    }

    const dockW = dock.offsetWidth || 140;
    dock.style.left = `${Math.max(10, window.innerWidth - dockW - 10)}px`;
    dock.style.top = `10px`;
    dock.style.transform = "none";
    setDockHidden(false);
  }

  // ---------------- Tabs + Mode detection ----------------
  function getTopMode() {
    const nodes = Array.from(document.querySelectorAll("*")).slice(0, 2500);
    for (const n of nodes) {
      const t = (n.innerText || "").replace(/\s+/g, " ").trim();
      if (!t) continue;
      const lt = t.toLowerCase();
      if (!(lt.includes("track") && lt.includes("artist") && lt.includes("album"))) continue;

      const opts = Array.from(n.querySelectorAll("button, div, span, a")).filter(x => {
        const tx = (x.textContent || "").trim().toLowerCase();
        return tx === "track" || tx === "artist" || tx === "album";
      });

      for (const o of opts) {
        const tx = (o.textContent || "").trim().toLowerCase();
        const ariaSel = o.getAttribute("aria-selected");
        const ariaPress = o.getAttribute("aria-pressed");
        const cls = (o.className || "").toString().toLowerCase();

        if (ariaSel === "true" || ariaPress === "true" || cls.includes("active") || cls.includes("selected")) {
          return tx;
        }
      }

      let best = null, bestScore = -1;
      for (const o of opts) {
        const cs = window.getComputedStyle(o);
        const op = parseFloat(cs.opacity || "1");
        const bg = cs.backgroundColor || "rgba(0,0,0,0)";
        const hasBg = !bg.endsWith(", 0)") && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
        const score = (op * 10) + (hasBg ? 5 : 0);
        if (score > bestScore) { bestScore = score; best = o; }
      }
      const tx = (best?.textContent || "").trim().toLowerCase();
      if (tx === "track" || tx === "artist" || tx === "album") return tx;
    }
    return null;
  }

  // (3) Exclude "Session Covers / Mirror / Listening" area from being bound as playable.
  function isSessionCoversArea(node) {
    const root = node?.closest?.("section, article, div") || null;
    const txt = ((root?.innerText || node?.innerText || "")).toUpperCase();
    if (!txt) return false;
    if (txt.includes("SESSION COVERS")) return true;
    // the panel line that contains MIRROR and LISTENING pills
    if (txt.includes("MIRROR") && txt.includes("LISTENING")) return true;
    return false;
  }
// ---------------- Resolve + play from lists ----------------
  function extractSpotifyUriFromNode(node) {
    const ds = node?.dataset || {};
    const cand = ds.spotifyUri || ds.uri || ds.spotifyTrackUri || ds.spotifyId || null;

    if (cand) {
      if (cand.startsWith("spotify:")) return cand;
      if (/^[A-Za-z0-9]{22}$/.test(cand)) return `spotify:track:${cand}`;
    }

    const a =
      node?.querySelector?.("a[href*='open.spotify.com/track/'], a[href^='spotify:track:']") ||
      node?.closest?.("a[href*='open.spotify.com/track/'], a[href^='spotify:track:']");
    const href = a?.getAttribute?.("href") || "";
    if (href.includes("open.spotify.com/track/")) {
      const m = href.match(/track\/([A-Za-z0-9]{22})/);
      if (m?.[1]) return `spotify:track:${m[1]}`;
    }
    if (href.startsWith("spotify:")) return href;

    return null;
  }

  function normalizeArtistLine(line) {
    const s = (line || "").trim();
    if (!s) return "";
    const parts = s.split("•").map(x => x.trim()).filter(Boolean);
    return parts.length ? parts[0] : s;
  }

  function cleanLine(s) {
    let x = (s || "").replace(/\s+/g, " ").trim();
    if (!x) return "";
    x = x.replace(/^LIVE$/i, "").trim();
    x = x.replace(/^\d+\.\s+/, "").trim();
    x = x.replace(/\b\d{1,2}\s+[A-Za-z]{3}\s+\d{4}(,\s*\d{2}:\d{2})?\b/gi, "").trim();
    x = x.replace(/\b\d{2}:\d{2}\b/g, "").trim();
    // remove pure counts like "3" or "12"
    if (/^\d+$/.test(x)) return "";
    return x;
  }

  // Better: pick first two meaningful lines as track/artist, ignoring junk.
  function guessArtistTrackFromRow(row) {
    const ds = row?.dataset || {};
    const a1 = (ds.artist || ds.lastfmArtist || "").trim();
    const t1 = (ds.track || ds.name || ds.lastfmTrack || "").trim();
    if (a1 && t1) return { artist: a1, track: t1 };

    const lines = (row?.innerText || "")
      .split("\n")
      .map(cleanLine)
      .filter(Boolean);

    // Filter out obvious UI words
    const filtered = lines.filter(l => {
      const u = l.toUpperCase();
      if (u === "ONLINE") return false;
      if (u === "NOW" || u === "RECENT" || u === "TOP") return false;
      if (u === "TRACK" || u === "ARTIST" || u === "ALBUM") return false;
      if (u === "TODAY" || u === "WEEK" || u === "YEAR") return false;
      if (u.includes("SESSION COVERS")) return false;
      return true;
    });

    const track = cleanLine(filtered[0] || "");
    const artist = normalizeArtistLine(cleanLine(filtered[1] || ""));
    return { track, artist };
  }

  function looksLikeArtistOnlyRow(row) {
    const text = (row?.innerText || "").split("\n").map(cleanLine).filter(Boolean);
    if (!text.length) return true;
    if (text.length === 1) return true;
    const l1 = (text[1] || "").trim();
    const l1IsCount = !!l1 && /^[\d,.\s]+$/.test(l1);
    return l1IsCount;
  }

  // Strict sanity: track+artist must exist, and must appear in row text.
  function canResolve(row, artist, track) {
    const a = (artist || "").trim();
    const t = (track || "").trim();
    if (!a || !t) return false;
    if (a.length < 2 || t.length < 2) return false;

    // Hard block the known wrong fallback
    if (a.toLowerCase() === "agust d" && t.toLowerCase() === "haegeum") return false;

    const rowTxt = ((row?.innerText || "")).toLowerCase();
    const aOk = rowTxt.includes(a.toLowerCase());
    const tOk = rowTxt.includes(t.toLowerCase());
    // If parsing went wrong (common for 1st item), refuse to resolve to avoid backend default.
    if (!aOk || !tOk) return false;

    return true;
  }

  async function resolveUriForRow(row) {
    const u0 = extractSpotifyUriFromNode(row);
    if (u0) return u0;

    const { artist, track } = guessArtistTrackFromRow(row);

    if (!canResolve(row, artist, track)) return "";

    const q = `${artist} ${track}`.trim();

    try {
      const r = await fetch(`${API_BASE}/resolve?q=${encodeURIComponent(q)}`, { method: "GET" });
      if (!r.ok) return "";
      const j = await r.json();
      const id = j?.best?.id;
      if (id && /^[A-Za-z0-9]{22}$/.test(id)) return `spotify:track:${id}`;
    } catch {}

    return "";
  }

  function rectIsSquareish(r) {
    if (!r) return false;
    const w = r.width, h = r.height;
    if (w < 28 || h < 28) return false;
    if (w > 160 || h > 160) return false;
    const ratio = w / h;
    return ratio > 0.72 && ratio < 1.38;
  }

  function getArtworkClickable(row) {
    // DO NOT bind anything inside session covers/orb area
    if (isSessionCoversArea(row)) return null;

    const img = row.querySelector?.("img");
    if (img) return img;

    const bgCandidates = Array.from(row.querySelectorAll?.("div, span, a") || []);
    for (const n of bgCandidates) {
      if (isSessionCoversArea(n)) continue;
      const st = window.getComputedStyle(n);
      const bg = st?.backgroundImage || "";
      if (bg && bg !== "none" && bg.includes("url(")) return n;
    }

    const kids = Array.from(row.querySelectorAll?.("div, span") || []);
    for (const n of kids) {
      if (isSessionCoversArea(n)) continue;
      const r = n.getBoundingClientRect?.();
      if (!rectIsSquareish(r)) continue;
      return n;
    }
    return null;
  }

  function guessRows() {
    const li = Array.from(document.querySelectorAll("li"));
    if (li.length) return li;
    return Array.from(document.querySelectorAll("div, article, section"))
      .filter((n) => (n.textContent || "").trim().length > 6);
  }

  function allowedToBindRow(topMode, row) {
    if (isSessionCoversArea(row)) return false;            // (3) orb/session covers excluded
    if (topMode === "artist") return false;
    if (looksLikeArtistOnlyRow(row)) return false;
    return true;
  }

  function attachPlayBindings() {
    if (!getToken()) return;

    const topMode = getTopMode();
    const rows = guessRows();

    for (const row of rows) {
      if (!allowedToBindRow(topMode, row)) continue;

      const art = getArtworkClickable(row);

      if (art && art.dataset.spBound !== "1") {
        art.dataset.spBound = "1";
        art.classList.add("spArtworkPlayable");

        art.addEventListener("click", async (e) => {
          if (e.target && e.target.closest && e.target.closest("#spDock")) return;
          e.preventDefault(); e.stopPropagation();
          pulse(art);

          const uri = await resolveUriForRow(row);
          if (uri) return playUri(uri);
        }, { passive: false });
      }

      if (!art && row.dataset.spRowBound !== "1") {
        row.dataset.spRowBound = "1";
        row.classList.add("spRowPlayable");

        row.addEventListener("click", async (e) => {
          if (e.target && e.target.closest && e.target.closest("#spDock")) return;
          const tag = (e.target?.tagName || "").toLowerCase();
          if (tag === "button" || tag === "a" || tag === "input") return;

          e.preventDefault(); e.stopPropagation();
          pulse(row);

          const uri = await resolveUriForRow(row);
          if (uri) return playUri(uri);
        }, { passive: false });
      }
    }
  }

  // ---------------- State loop ----------------
  async function observeLoop() {
    let lastLinked = null;
    let lastPlaying = null;

    async function tick() {
      ensureDock();
      positionDock();

      const linked = !!getToken();
      if (linked !== lastLinked) {
        setIndicatorLinked(linked);
        setEnabled(linked);
        lastLinked = linked;
      }

      if (!linked) {
        setToggleIcon(false);
      } else {
        const st = await getPlaybackState();
        const isPlaying = inferIsPlaying(st);
        if (typeof isPlaying === "boolean" && isPlaying !== lastPlaying) {
          setToggleIcon(isPlaying);
          lastPlaying = isPlaying;
        }
        attachPlayBindings();
      }

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  function boot() {
    ensureDock();

    const mo = new MutationObserver(() => {
      ensureDock();
      positionDock();
      attachPlayBindings();
    });
    mo.observe(document.documentElement, { subtree: true, childList: true });

    observeLoop();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();