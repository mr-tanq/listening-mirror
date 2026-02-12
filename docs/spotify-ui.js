/* spotify-ui.js
   - Injects Spotify control bar (Connect / Prev / Play / Pause / Next)
   - Click-to-play on items in #recentList and #topList
   Requirements:
   - spotify-auth.js and spotify-player.js loaded BEFORE this
   - app.js renders lists into #recentList and #topList (any structure)
*/

(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  function ensureBar() {
    // Insert under the tabs
    const tabs = $(".tabs");
    if (!tabs) return;

    if ($("#spotifyBar")) return;

    const bar = document.createElement("div");
    bar.id = "spotifyBar";
    bar.style.display = "flex";
    bar.style.flexWrap = "wrap";
    bar.style.alignItems = "center";
    bar.style.gap = "10px";
    bar.style.margin = "6px 0 14px 0";

    // Left status
    const status = document.createElement("div");
    status.id = "spotifyStatus";
    status.style.color = "rgba(255,255,255,.70)";
    status.style.fontSize = "13px";
    status.style.minWidth = "120px";
    status.textContent = "Spotify: not linked";

    // Buttons container
    const btnWrap = document.createElement("div");
    btnWrap.style.display = "flex";
    btnWrap.style.gap = "10px";
    btnWrap.style.flexWrap = "wrap";

    const mkBtn = (id, label) => {
      const b = document.createElement("button");
      b.id = id;
      b.textContent = label;
      b.style.border = "0";
      b.style.cursor = "pointer";
      b.style.padding = "10px 14px";
      b.style.borderRadius = "999px";
      b.style.background = "rgba(255,255,255,.06)";
      b.style.outline = "1px solid rgba(255,255,255,.10)";
      b.style.color = "rgba(255,255,255,.90)";
      b.style.fontSize = "13px";
      b.style.letterSpacing = ".2px";
      return b;
    };

    btnWrap.appendChild(mkBtn("spPrev", "Prev"));
    btnWrap.appendChild(mkBtn("spPlay", "Play"));
    btnWrap.appendChild(mkBtn("spPause", "Pause"));
    btnWrap.appendChild(mkBtn("spNext", "Next"));
    btnWrap.appendChild(mkBtn("spConnect", "Connect"));

    bar.appendChild(status);
    bar.appendChild(btnWrap);

    tabs.insertAdjacentElement("afterend", bar);
  }

  function setStatus(text) {
    const el = $("#spotifyStatus");
    if (el) el.textContent = text;
  }

  function toast(msg) {
    let t = $("#spToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "spToast";
      t.style.position = "fixed";
      t.style.left = "50%";
      t.style.bottom = "18px";
      t.style.transform = "translateX(-50%)";
      t.style.padding = "10px 12px";
      t.style.borderRadius = "14px";
      t.style.background = "rgba(20,22,26,.92)";
      t.style.outline = "1px solid rgba(255,255,255,.10)";
      t.style.color = "rgba(255,255,255,.92)";
      t.style.fontSize = "13px";
      t.style.boxShadow = "0 22px 70px rgba(0,0,0,.62)";
      t.style.zIndex = "99999";
      t.style.maxWidth = "min(520px, calc(100vw - 40px))";
      t.style.textAlign = "center";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(window.__spToastTimer);
    window.__spToastTimer = setTimeout(() => {
      t.style.opacity = "0";
    }, 2200);
  }

  function openLogin() {
    if (!window.SpotifyAuth) {
      toast("SpotifyAuth missing (script not loaded).");
      return;
    }
    window.SpotifyAuth.login();
  }

  function isLinked() {
    return !!window.SpotifyAuth?.getToken?.();
  }

  async function safe(fn) {
    try {
      await fn();
    } catch (e) {
      // Useful Spotify errors:
      // 401 -> token missing/expired
      // 403 -> scope missing
      // 404 -> no active device
      const msg = e?.message || "Spotify error";
      if (e?.status === 401) {
        toast("Spotify: χρειάζεται σύνδεση (token). Πάτα Connect.");
        setStatus("Spotify: not linked");
        return;
      }
      if (e?.status === 403) {
        toast("Spotify: λείπει permission (scope). Θέλει re-login.");
        return;
      }
      if (e?.status === 404) {
        toast("Spotify: άνοιξε Spotify σε μια συσκευή (active device) και ξαναδοκίμασε.");
        return;
      }
      toast(`Spotify: ${msg}`);
      console.error("[spotify-ui]", e);
    }
  }

  // Converts open.spotify.com/... to spotify:... uri
  function toSpotifyUri(urlOrUri) {
    if (!urlOrUri) return null;
    const s = String(urlOrUri);

    // Already a URI
    if (s.startsWith("spotify:")) return s;

    // open.spotify.com
    // examples:
    // https://open.spotify.com/track/{id}?si=...
    // https://open.spotify.com/album/{id}
    // https://open.spotify.com/playlist/{id}
    try {
      const u = new URL(s);
      if (!u.hostname.includes("spotify.com")) return null;

      const parts = u.pathname.split("/").filter(Boolean); // [type, id]
      if (parts.length < 2) return null;
      const type = parts[0]; // track/album/playlist/artist
      const id = parts[1];
      return `spotify:${type}:${id}`;
    } catch {
      return null;
    }
  }

  // Extract a playable URI from a clicked element
  function extractUriFromClick(target) {
    // Best case: app.js already sets data-uri
    const row = target.closest("[data-uri], [data-href], a[href*='open.spotify.com'], a[href^='spotify:']");
    if (!row) return null;

    const direct =
      row.getAttribute?.("data-uri") ||
      row.getAttribute?.("data-href") ||
      row.getAttribute?.("href") ||
      null;

    return toSpotifyUri(direct);
  }

  function wireButtons() {
    const connect = $("#spConnect");
    const play = $("#spPlay");
    const pause = $("#spPause");
    const next = $("#spNext");
    const prev = $("#spPrev");

    if (connect) {
      connect.onclick = () => {
        openLogin();
      };
    }

    if (play) {
      play.onclick = () =>
        safe(async () => {
          if (!isLinked()) return openLogin();
          setStatus("Spotify: linked");
          await window.SpotifyPlayer.ensureActiveDevice();
          await window.SpotifyPlayer.play();
          toast("Play");
        });
    }

    if (pause) {
      pause.onclick = () =>
        safe(async () => {
          if (!isLinked()) return openLogin();
          setStatus("Spotify: linked");
          await window.SpotifyPlayer.pause();
          toast("Pause");
        });
    }

    if (next) {
      next.onclick = () =>
        safe(async () => {
          if (!isLinked()) return openLogin();
          setStatus("Spotify: linked");
          await window.SpotifyPlayer.next();
          toast("Next");
        });
    }

    if (prev) {
      prev.onclick = () =>
        safe(async () => {
          if (!isLinked()) return openLogin();
          setStatus("Spotify: linked");
          await window.SpotifyPlayer.prev();
          toast("Prev");
        });
    }
  }

  function wireClickToPlay() {
    const recentList = $("#recentList");
    const topList = $("#topList");

    const handler = (e) => {
      const uri = extractUriFromClick(e.target);
      if (!uri) return;

      // Don’t hijack if user long-presses links etc; but simple click should work.
      e.preventDefault();
      e.stopPropagation();

      safe(async () => {
        if (!isLinked()) return openLogin();
        setStatus("Spotify: linked");
        await window.SpotifyPlayer.playUri(uri);
        toast("Playing from list…");
      });
    };

    if (recentList && !recentList.__spBound) {
      recentList.addEventListener("click", handler);
      recentList.__spBound = true;
    }

    if (topList && !topList.__spBound) {
      topList.addEventListener("click", handler);
      topList.__spBound = true;
    }
  }

  function boot() {
    ensureBar();

    if (isLinked()) setStatus("Spotify: linked");
    else setStatus("Spotify: not linked");

    wireButtons();
    wireClickToPlay();

    // Re-wire lists occasionally because app.js may re-render
    setInterval(() => {
      wireClickToPlay();
      if (isLinked()) setStatus("Spotify: linked");
    }, 1200);
  }

  // Wait a bit so app.js can render first
  window.addEventListener("load", () => setTimeout(boot, 120));
})();