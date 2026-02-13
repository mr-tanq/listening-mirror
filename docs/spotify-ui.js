/* spotify-ui.js (FULL REPLACE) — PART 1/4
   Changes in this version (based on your "1"):
   - The LEFT glyph next to "Listening Mirror" becomes ⏯️ (Play/Pause toggle)
   - Prev/Next (⏪ ⏩) are hidden (only if we can safely detect them)
   - Spotify icon stays for login/logout (we do NOT break it)
   - Mirror header/orb/title area cannot trigger playback ("Mirror bug") EXCEPT:
       ✅ the ⏯️ glyph
       ✅ the Spotify login/logout control
   - Click-to-play on rows stays
   - Fix: rows with NO artwork now play (we ignore "♪" placeholder lines so artist/track parsing works)
*/

(function () {
  "use strict";

  const API_BASE = String(window.LISTENING_MIRROR_API || "https://i.errtanq9.workers.dev").replace(/\/+$/, "");

  // ---------------- helpers ----------------
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

  function ensureCss() {
    if (document.getElementById("spotifyUiCss")) return;

    const css = `
/* row clickability */
.spArtworkPlayable{ cursor: pointer !important; border-radius: 12px; }
.spRowPlayable{ cursor: pointer !important; }

/* marker for "original spotify header controls" (login/logout lives here) */
[data-sp-controls='1'], [data-sp-controls='1'] *{
  pointer-events: auto !important;
}

/* the new ⏯️ glyph (left of Listening Mirror) */
[data-lm-glyph='1']{
  position: relative !important;
  cursor: pointer !important;
}
[data-lm-glyph='1'] .lmGlyphIcon{
  position:absolute;
  inset:0;
  display:grid;
  place-items:center;
  font-size: 16px;
  line-height: 1;
  pointer-events:none;
  opacity: .92;
  transform: translateY(-.5px);
}
    `.trim();

    const st = document.createElement("style");
    st.id = "spotifyUiCss";
    st.textContent = css;
    document.head.appendChild(st);
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

  // ---------------- Spotify Web API (fallback) ----------------
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

  async function apiPlayUri(uri) {
    if (!uri || typeof uri !== "string") return false;
    const m = uri.match(/^spotify:track:([A-Za-z0-9]{22})$/);
    if (!m) return false;
    return !!(await spotifyApi("/me/player/play", "PUT", { uris: [uri] })).ok;
  }

  async function playUri(uri) {
    let r = safeCall("SpotifyPlayer.playUri", uri);
    if (r.ok) return true;
    r = safeCall("SpotifyPlayer.play", { uri });
    if (r.ok) return true;
    r = safeCall("SpotifyPlayer.play", uri);
    if (r.ok) return true;

    const ok = await apiPlayUri(uri);
    if (ok) return true;

    console.warn("[Spotify UI] Cannot play URI:", uri);
    return false;
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

  function inferIsPlaying(state) {
    if (!state) return null;
    if (state.isPlaying === true) return true;
    if (state.playing === true) return true;
    if (typeof state.paused === "boolean") return !state.paused;
    return null;
  }

  async function pauseSafe() {
    const ok = await apiPause();
    if (ok) return true;
    const r = safeCall("SpotifyPlayer.pause");
    return !!r.ok;
  }

  async function resumeSafe() {
    const ok = await apiPlay();
    if (ok) return true;
    let r = safeCall("SpotifyPlayer.play");
    if (r.ok) return true;
    r = safeCall("SpotifyPlayer.resume");
    return !!r.ok;
  }
/* spotify-ui.js (FULL REPLACE) — PART 2/4 */

  // ---------------- Header detection ----------------
  function findHeaderTitleNode() {
    const nodes = Array.from(document.querySelectorAll("h1,h2,div,span")).slice(0, 3500);
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

  function findGlyphLeftOfTitle(titleNode) {
    if (!titleNode) return null;

    const container =
      titleNode.closest("header") ||
      titleNode.closest("section") ||
      titleNode.closest("article") ||
      titleNode.closest("div") ||
      titleNode.parentElement;

    if (!container) return null;

    const titleRect = titleNode.getBoundingClientRect();
    const candidates = Array.from(container.querySelectorAll("div,span,button,a")).slice(0, 200);

    let best = null;
    let bestScore = Infinity;

    for (const n of candidates) {
      if (n === titleNode) continue;
      if (n.closest && n.closest("[data-sp-controls='1']")) continue;

      const r = n.getBoundingClientRect?.();
      if (!r) continue;

      const small = r.width >= 12 && r.width <= 60 && r.height >= 12 && r.height <= 60;
      if (!small) continue;

      // must be left-ish of title
      const leftish = r.right <= titleRect.left + 18;
      if (!leftish) continue;

      const midY = (r.top + r.bottom) / 2;
      const titleMidY = (titleRect.top + titleRect.bottom) / 2;
      const closeY = Math.abs(midY - titleMidY) < 30;

      const cs = window.getComputedStyle(n);
      const br = parseFloat(cs.borderRadius || "0");
      const roundish = br > 10 || cs.borderRadius === "999px";

      if (!closeY || !roundish) continue;

      const dx = Math.abs(titleRect.left - r.right);
      const dy = Math.abs(titleMidY - midY);
      const score = dx + dy * 2;

      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }

    return best;
  }

  // IMPORTANT: detect the ORIGINAL Spotify header controls cluster so we can:
  // - allow login/logout click
  // - hide prev/next safely
  function markOriginalHeaderControls(headerEl) {
    if (!headerEl) return null;

    const buttons = Array.from(headerEl.querySelectorAll("button, a, div, span"))
      .filter(n => {
        const r = n.getBoundingClientRect?.();
        if (!r) return false;
        if (r.width < 22 || r.width > 64) return false;
        if (r.height < 22 || r.height > 64) return false;
        const cs = window.getComputedStyle(n);
        const br = parseFloat(cs.borderRadius || "0");
        return br > 12 || cs.borderRadius === "999px";
      });

    for (const b of buttons) {
      const p = b.closest("div, nav, header, section");
      if (!p) continue;

      const inside = Array.from(p.querySelectorAll("button, a, div, span"))
        .filter(x => {
          const r = x.getBoundingClientRect?.();
          if (!r) return false;
          if (r.width < 22 || r.width > 64) return false;
          if (r.height < 22 || r.height > 64) return false;
          const cs = window.getComputedStyle(x);
          const br = parseFloat(cs.borderRadius || "0");
          return br > 12 || cs.borderRadius === "999px";
        });

      if (inside.length >= 3) {
        p.setAttribute("data-sp-controls", "1");
        return p;
      }
    }
    return null;
  }

  function likelySpotifyIconNode(node) {
    if (!node) return false;
    const t = (node.getAttribute?.("title") || node.getAttribute?.("aria-label") || "").toLowerCase();
    if (t.includes("spotify")) return true;

    const html = (node.innerHTML || "").toLowerCase();
    // spotify logo SVG often has viewBox 0 0 168 168 or "spotify" in class/id
    if (html.includes("0 0 168 168")) return true;
    if (html.includes("spotify")) return true;

    return false;
  }

  function hidePrevNextButKeepSpotify(controlsEl) {
    if (!controlsEl) return;

    // Find round-ish items inside the controls
    const items = Array.from(controlsEl.querySelectorAll("button,a,div,span")).filter(n => {
      const r = n.getBoundingClientRect?.();
      if (!r) return false;
      if (r.width < 22 || r.width > 64) return false;
      if (r.height < 22 || r.height > 64) return false;
      const cs = window.getComputedStyle(n);
      const br = parseFloat(cs.borderRadius || "0");
      return br > 12 || cs.borderRadius === "999px";
    });

    // Choose the spotify node to keep (best effort). If we can't identify it, DO NOTHING (safety).
    let keep = null;
    for (const it of items) {
      if (likelySpotifyIconNode(it)) { keep = it; break; }
      const parentBtn = it.closest?.("button,a");
      if (parentBtn && likelySpotifyIconNode(parentBtn)) { keep = parentBtn; break; }
    }
    if (!keep) return; // safety: never hide if we are not sure

    // Hide everything else (prev/next/play buttons)
    for (const it of items) {
      const root = it.closest?.("button,a") || it;
      if (root === keep) continue;
      // don't hide ancestors of keep
      if (root.contains && root.contains(keep)) continue;
      // hide
      root.style.display = "none";
    }

    // Make sure spotify icon still toggles login/logout
    if (keep.dataset && keep.dataset.spLoginBound === "1") return;
    if (keep.dataset) keep.dataset.spLoginBound = "1";
    keep.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      doLoginOrLogout();
    }, { passive: false });
  }

  // ---------------- ⏯️ glyph binding ----------------
  function installGlyphPlayPause(glyphEl) {
    if (!glyphEl) return;
    if (glyphEl.dataset && glyphEl.dataset.lmGlyphBound === "1") return;

    glyphEl.setAttribute("data-lm-glyph", "1");
    if (glyphEl.dataset) glyphEl.dataset.lmGlyphBound = "1";

    // overlay icon (do not remove existing DOM)
    if (!glyphEl.querySelector(".lmGlyphIcon")) {
      glyphEl.style.position = "relative";
      const s = document.createElement("span");
      s.className = "lmGlyphIcon";
      s.textContent = "⏯️";
      glyphEl.appendChild(s);
    }

    glyphEl.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!getToken()) { doLoginOrLogout(); return; }

      const st = await getPlaybackState();
      const isPlaying = inferIsPlaying(st);

      if (isPlaying === true) {
        await pauseSafe();
      } else {
        await resumeSafe();
      }
    }, { passive: false });
  }
/* spotify-ui.js (FULL REPLACE) — PART 3/4
   Header blocker + list click-to-play (with NO-artwork fix)
*/

  let LM_HEADER_EL = null;
  let LM_GLYPH_EL = null;
  let LM_CONTROLS_EL = null;

  let blockerInstalled = false;
  function installWindowCaptureBlocker() {
    if (blockerInstalled) return;
    blockerInstalled = true;

    const inHeader = (target) => {
      if (!target || !LM_HEADER_EL) return false;
      return LM_HEADER_EL.contains(target);
    };

    const inAllowedControls = (target) => {
      if (!target) return false;
      // allow spotify login/logout cluster
      if (target.closest && target.closest("[data-sp-controls='1']")) return true;
      // allow the ⏯️ glyph
      if (target.closest && target.closest("[data-lm-glyph='1']")) return true;
      return false;
    };

    const killDownOrClick = (e) => {
      if (!inHeader(e.target)) return;

      // allow only whitelist clicks
      if (inAllowedControls(e.target)) return;

      // rest of header: block any playback triggers
      try { e.preventDefault(); } catch {}
      try { e.stopImmediatePropagation(); } catch {}
      try { e.stopPropagation(); } catch {}
    };

    window.addEventListener("pointerdown", killDownOrClick, { capture: true, passive: false });
    window.addEventListener("mousedown",   killDownOrClick, { capture: true, passive: false });
    window.addEventListener("touchstart",  killDownOrClick, { capture: true, passive: false });
    window.addEventListener("click",       killDownOrClick, { capture: true, passive: false });
  }

  function refreshHeaderRefs() {
    const titleNode = findHeaderTitleNode();
    if (!titleNode) {
      LM_HEADER_EL = null;
      LM_GLYPH_EL = null;
      LM_CONTROLS_EL = null;
      return;
    }

    LM_HEADER_EL =
      titleNode.closest("header") ||
      titleNode.closest("section") ||
      titleNode.closest("article") ||
      titleNode.closest("div") ||
      titleNode.parentElement ||
      null;

    // glyph: left of title => ⏯️
    LM_GLYPH_EL = findGlyphLeftOfTitle(titleNode);
    if (LM_GLYPH_EL) installGlyphPlayPause(LM_GLYPH_EL);

    // controls: keep spotify login/logout, hide prev/next/play
    LM_CONTROLS_EL = markOriginalHeaderControls(LM_HEADER_EL);
    if (LM_CONTROLS_EL) hidePrevNextButKeepSpotify(LM_CONTROLS_EL);
  }

  // ---------------- List click-to-play ----------------
  function isSessionCoversArea(node) {
    const root = node?.closest?.("section, article, div") || null;
    const txt = ((root?.innerText || node?.innerText || "")).toUpperCase();
    if (!txt) return false;
    if (txt.includes("SESSION COVERS")) return true;
    if (txt.includes("MIRROR") && txt.includes("LISTENING")) return true;
    return false;
  }

  function isExplicitNoPlay(node) {
    return !!(node?.closest?.("[data-sp-no-play='1']"));
  }

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

  function isOnlyMusicNote(s) {
    const t = (s || "").trim();
    if (!t) return false;
    // common placeholder glyphs for "no artwork"
    return /^[♪♫🎵🎶]+$/.test(t);
  }

  function cleanLine(s) {
    let x = (s || "").replace(/\s+/g, " ").trim();
    if (!x) return "";
    if (isOnlyMusicNote(x)) return "";

    // strip any lingering note chars
    x = x.replace(/[♪♫🎵🎶]/g, "").trim();

    x = x.replace(/^LIVE$/i, "").trim();
    x = x.replace(/^\d+\.\s+/, "").trim();
    x = x.replace(/\b\d{1,2}\s+[A-Za-z]{3}\s+\d{4}(,\s*\d{2}:\d{2})?\b/gi, "").trim();
    x = x.replace(/\b\d{2}:\d{2}\b/g, "").trim();
    if (/^\d+$/.test(x)) return "";
    if (isOnlyMusicNote(x)) return "";
    return x;
  }

  function guessArtistTrackFromRow(row) {
    const ds = row?.dataset || {};
    const a1 = (ds.artist || ds.lastfmArtist || "").trim();
    const t1 = (ds.track || ds.name || ds.lastfmTrack || "").trim();
    if (a1 && t1) return { artist: a1, track: t1 };

    const lines = (row?.innerText || "")
      .split("\n")
      .map(cleanLine)
      .filter(Boolean)
      .filter(l => !isOnlyMusicNote(l));

    const filtered = lines.filter(l => {
      const u = l.toUpperCase();
      if (u === "ONLINE") return false;
      if (u === "NOW" || u === "RECENT" || u === "TOP") return false;
      if (u === "TRACK" || u === "ARTIST" || u === "ALBUM") return false;
      if (u === "TODAY" || u === "WEEK" || u === "YEAR") return false;
      if (u.includes("SESSION COVERS")) return false;
      return true;
    });

    // pick first meaningful track line (skip notes/placeholders)
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

  function isTopTabActive() {
    const tabs = Array.from(document.querySelectorAll("button,div,span,a")).slice(0, 2000);
    for (const n of tabs) {
      const tx = (n.textContent || "").trim().toLowerCase();
      if (tx !== "top") continue;
      const ariaSel = n.getAttribute("aria-selected");
      const ariaPress = n.getAttribute("aria-pressed");
      const cls = (n.className || "").toString().toLowerCase();
      if (ariaSel === "true" || ariaPress === "true" || cls.includes("active") || cls.includes("selected")) return true;
    }
    return false;
  }

  function isLikelyFirstRowInTop(row) {
    if (!isTopTabActive()) return false;
    const r = row.getBoundingClientRect?.();
    if (!r) return false;
    return r.top >= 0 && r.top < 320;
  }

  function strictOk(row, artist, track) {
    const a = (artist || "").trim();
    const t = (track || "").trim();
    if (!a || !t) return false;
    if (a.length < 2 || t.length < 2) return false;
    const rowTxt = ((row?.innerText || "")).toLowerCase();
    if (!rowTxt.includes(a.toLowerCase())) return false;
    if (!rowTxt.includes(t.toLowerCase())) return false;
    return true;
  }

  function relaxedOk(artist, track) {
    const a = (artist || "").trim();
    const t = (track || "").trim();
    if (!a || !t) return false;
    if (a.length < 2 || t.length < 2) return false;
    if (t.endsWith("…") || a.endsWith("…")) return false;
    return true;
  }

  async function resolveUriForRow(row) {
    const u0 = extractSpotifyUriFromNode(row);
    if (u0) return u0;

    const { artist, track } = guessArtistTrackFromRow(row);
    const strict = isLikelyFirstRowInTop(row);
    const ok = strict ? strictOk(row, artist, track) : relaxedOk(artist, track);
    if (!ok) return "";

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
/* spotify-ui.js (FULL REPLACE) — PART 4/4 */

  function rectIsSquareish(r) {
    if (!r) return false;
    const w = r.width, h = r.height;
    if (w < 24 || h < 24) return false;
    if (w > 170 || h > 170) return false;
    const ratio = w / h;
    return ratio > 0.72 && ratio < 1.38;
  }

  function getArtworkClickable(row) {
    if (isSessionCoversArea(row) || isExplicitNoPlay(row)) return null;

    const img = row.querySelector?.("img");
    if (img && !isExplicitNoPlay(img)) return img;

    // fallback: square-ish element (includes placeholders)
    const kids = Array.from(row.querySelectorAll?.("div, span, a") || []);
    for (const n of kids) {
      if (isSessionCoversArea(n) || isExplicitNoPlay(n)) continue;
      const rr = n.getBoundingClientRect?.();
      if (!rectIsSquareish(rr)) continue;
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
    if (isSessionCoversArea(row)) return false;
    if (isExplicitNoPlay(row)) return false;
    if (topMode === "artist") return false;
    if (looksLikeArtistOnlyRow(row)) return false;
    return true;
  }

  function getTopMode() {
    const nodes = Array.from(document.querySelectorAll("*")).slice(0, 3500);
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
        if (ariaSel === "true" || ariaPress === "true" || cls.includes("active") || cls.includes("selected")) return tx;
      }
    }
    return null;
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
          // don't interfere with header controls/glyph
          if (e.target && e.target.closest && (e.target.closest("[data-sp-controls='1']") || e.target.closest("[data-lm-glyph='1']"))) return;
          if (isExplicitNoPlay(e.target) || isSessionCoversArea(e.target)) return;

          e.preventDefault(); e.stopPropagation();
          const uri = await resolveUriForRow(row);
          if (uri) await playUri(uri);
        }, { passive: false });
      }

      if (row.dataset.spRowBound !== "1") {
        row.dataset.spRowBound = "1";
        row.classList.add("spRowPlayable");

        row.addEventListener("click", async (e) => {
          // don't interfere with header controls/glyph
          if (e.target && e.target.closest && (e.target.closest("[data-sp-controls='1']") || e.target.closest("[data-lm-glyph='1']"))) return;
          if (isExplicitNoPlay(e.target) || isSessionCoversArea(e.target)) return;

          const tag = (e.target?.tagName || "").toLowerCase();
          if (tag === "button" || tag === "a" || tag === "input") return;

          e.preventDefault(); e.stopPropagation();
          const uri = await resolveUriForRow(row);
          if (uri) await playUri(uri);
        }, { passive: false });
      }
    }
  }

  // ---------------- loops ----------------
  let bindTimer = null;

  function startLoops() {
    if (bindTimer) clearInterval(bindTimer);
    bindTimer = setInterval(() => {
      try {
        refreshHeaderRefs();
        attachPlayBindings();
      } catch {}
    }, 900);

    try {
      refreshHeaderRefs();
      attachPlayBindings();
    } catch {}
  }

  function boot() {
    ensureCss();
    refreshHeaderRefs();
    installWindowCaptureBlocker();

    const mo = new MutationObserver(() => {
      ensureCss();
      refreshHeaderRefs();
      try { attachPlayBindings(); } catch {}
    });
    mo.observe(document.documentElement, { subtree: true, childList: true });

    startLoops();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

})();