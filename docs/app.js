/* app.js (FULL FILE REPLACE) — PART 1/2
   Listening Mirror — Identity tabs + artwork click-play friendly rows
   ✅ Loads Recent / Top from Worker
   ✅ Identity internal tabs: Recent / Top
   ✅ Top controls live only inside Top panel
   ✅ Renders data-* contract for spotify-click-play.js
   ✅ Keeps placeholders for other views
*/

(() => {
  "use strict";

  const API_BASE = "https://i.errtanq9.workers.dev";

  const TOP_LIMIT_DEFAULT = 10;
  const RECENT_LIMIT_DEFAULT = 20;

  const $ = (id) => document.getElementById(id);

  const topList = $("topList");
  const recentList = $("recentList");
  const concertsList = $("concertsList");
  const concertMatchesList = $("concertMatchesList");
  const archiveList = $("archiveList");

  const state = {
    topType: "tracks",
    topPeriod: "today",
    identityTab: "recent",
    lastRecent: [],
    lastTop: []
  };

  function absApi(urlOrPath) {
    if (!urlOrPath) return "";
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
    if (urlOrPath.startsWith("/")) return API_BASE + urlOrPath;
    return API_BASE + "/" + urlOrPath;
  }

  async function apiGet(path) {
    const url = absApi(path);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeSpace(s) {
    return String(s ?? "").replace(/\s+/g, " ").trim();
  }

  function buildCacheKey(itemType, title, artist, album) {
    return [
      normalizeSpace(itemType).toLowerCase(),
      normalizeSpace(title).toLowerCase(),
      normalizeSpace(artist).toLowerCase(),
      normalizeSpace(album).toLowerCase()
    ].join("::");
  }

  function renderThumb(img) {
    const u = absApi(img || "");
    if (!u) return `<div class="thumbFallback">♪</div>`;
    return `<img src="${escapeHtml(u)}" alt="" loading="lazy" decoding="async" />`;
  }

  function rowHTML({
    idx,
    title,
    sub,
    img,
    right = "",
    itemType = "track",
    playMode = "direct",
    artist = "",
    album = "",
    uri = "",
    playable = true,
    extraUris = {}
  }) {
    const safeTitle = escapeHtml(title || "—");
    const safeSub = escapeHtml(sub || "");
    const safeRight = escapeHtml(String(right || ""));
    const safeArtist = escapeHtml(artist || "");
    const safeAlbum = escapeHtml(album || "");
    const safeUri = escapeHtml(uri || "");
    const safeType = escapeHtml(itemType || "track");
    const safePlayMode = escapeHtml(playMode || "direct");
    const safePlayable = playable ? "true" : "false";
    const cacheKey = escapeHtml(buildCacheKey(itemType, title, artist, album));

    const spotifyTrackUri = escapeHtml(extraUris.spotifyTrackUri || "");
    const spotifyArtistUri = escapeHtml(extraUris.spotifyArtistUri || "");
    const spotifyAlbumUri = escapeHtml(extraUris.spotifyAlbumUri || "");

    const artworkAria =
      itemType === "artist"
        ? `Play top song from ${title || "artist"}`
        : itemType === "album"
          ? `Play top song from ${title || "album"}`
          : `Play ${title || "track"}${artist ? ` by ${artist}` : ""}`;

    return `
      <div
        class="row mediaRow"
        role="listitem"
        aria-label="${idx}. ${safeTitle}"
        data-media-item="true"
        data-item-type="${safeType}"
        data-play-mode="${safePlayMode}"
        data-title="${safeTitle}"
        data-artist="${safeArtist}"
        data-album="${safeAlbum}"
        data-playable="${safePlayable}"
        data-cache-key="${cacheKey}"
        ${safeUri ? `data-spotify-uri="${safeUri}"` : ""}
        ${spotifyTrackUri ? `data-spotify-track-uri="${spotifyTrackUri}"` : ""}
        ${spotifyArtistUri ? `data-spotify-artist-uri="${spotifyArtistUri}"` : ""}
        ${spotifyAlbumUri ? `data-spotify-album-uri="${spotifyAlbumUri}"` : ""}
      >
        <button
          type="button"
          class="thumb thumbButton"
          data-play-artwork="true"
          aria-label="${escapeHtml(artworkAria)}"
        >
          ${renderThumb(img)}
          <span class="thumbOverlay" aria-hidden="true">
            <span class="thumbPlayIcon">▶</span>
          </span>
        </button>

        <div class="mid">
          <div class="title">${escapeHtml(`${idx}. ${title || "—"}`)}</div>
          <div class="sub">${safeSub}</div>
        </div>

        <div class="right${String(right).length ? " count" : ""}">${safeRight}</div>
      </div>
    `;
  }

  function cardMessageHTML(title, sub = "") {
    return `
      <div class="row" role="listitem">
        <div class="mid">
          <div class="title">${escapeHtml(title)}</div>
          <div class="sub">${escapeHtml(sub)}</div>
        </div>
      </div>
    `;
  }

  function setLoading(el, title, sub) {
    if (!el) return;
    el.innerHTML = cardMessageHTML(title, sub);
  }

  function setEmpty(el, title, sub) {
    if (!el) return;
    el.innerHTML = cardMessageHTML(title, sub);
  }

  function setError(el, title, sub) {
    if (!el) return;
    el.innerHTML = cardMessageHTML(title, sub);
  }

  function normalizeRecentPayload(j) {
    return (
      (j && j.ok && Array.isArray(j.items) && j.items) ||
      (j && j.ok && Array.isArray(j.history) && j.history) ||
      []
    );
  }

  function normalizeTopPayload(j) {
    return (
      (j && j.ok && Array.isArray(j.items) && j.items) ||
      []
    );
  }

  function ensureIdentityUi() {
    const identityView = $("viewIdentity");
    if (!identityView) return;

    const stack = identityView.querySelector(".stack");
    if (!stack) return;

    const cards = Array.from(stack.querySelectorAll(":scope > .card"));
    if (cards.length < 2) return;

    const recentCard = cards.find((el) => el.querySelector("#recentList"));
    const topCard = cards.find((el) => el.querySelector("#topList"));
    if (!recentCard || !topCard) return;

    if (!identityView.querySelector("#identityTabsBar")) {
      const tabsWrap = document.createElement("div");
      tabsWrap.className = "card";
      tabsWrap.id = "identityTabsBar";
      tabsWrap.style.marginBottom = "14px";
      tabsWrap.innerHTML = `
        <div class="lmIdentityTabs" role="tablist" aria-label="Identity sections">
          <button
            type="button"
            class="lmIdentityTabBtn"
            data-identity-tab="recent"
            role="tab"
            aria-selected="true"
          >
            Recent
          </button>
          <button
            type="button"
            class="lmIdentityTabBtn"
            data-identity-tab="top"
            role="tab"
            aria-selected="false"
          >
            Top
          </button>
        </div>
      `;
      stack.parentElement.insertBefore(tabsWrap, stack);
    }

    recentCard.dataset.identityPanel = "recent";
    topCard.dataset.identityPanel = "top";

    const styleId = "lmIdentityUiCss";
    if (!document.getElementById(styleId)) {
      const st = document.createElement("style");
      st.id = styleId;
      st.textContent = `
        .lmIdentityTabs{
          display:flex;
          gap:8px;
          flex-wrap:wrap;
        }
        .lmIdentityTabBtn{
          border:1px solid rgba(255,255,255,.12);
          background:rgba(255,255,255,.04);
          color:rgba(255,255,255,.88);
          border-radius:999px;
          padding:10px 14px;
          font:inherit;
          font-size:13px;
          cursor:pointer;
        }
        .lmIdentityTabBtn.is-active{
          background:rgba(255,255,255,.12);
          border-color:rgba(255,255,255,.22);
          color:#fff;
        }
        .thumbButton{
          position:relative;
          border:none;
          padding:0;
          cursor:pointer;
        }
        .thumbButton:focus-visible{
          outline:2px solid rgba(255,255,255,.34);
          outline-offset:2px;
        }
        .thumbOverlay{
          position:absolute;
          inset:0;
          display:grid;
          place-items:center;
          background:rgba(0,0,0,.30);
          opacity:0;
          transition:opacity .18s ease;
        }
        .thumbButton:active .thumbOverlay,
        .thumbButton:focus-visible .thumbOverlay{
          opacity:1;
        }
        .thumbPlayIcon{
          display:grid;
          place-items:center;
          width:24px;
          height:24px;
          border-radius:999px;
          background:rgba(255,255,255,.92);
          color:#111;
          font-size:11px;
          line-height:1;
          padding-left:2px;
          box-shadow:0 4px 12px rgba(0,0,0,.2);
        }
      `;
      document.head.appendChild(st);
    }

    syncIdentityTabUi();
  }
   /* app.js (FULL FILE REPLACE) — PART 2/2 */

  function syncIdentityTabUi() {
    const identityView = $("viewIdentity");
    if (!identityView) return;

    identityView.querySelectorAll(".lmIdentityTabBtn").forEach((btn) => {
      const active = btn.dataset.identityTab === state.identityTab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    identityView.querySelectorAll("[data-identity-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.identityPanel !== state.identityTab;
    });
  }

  async function loadRecent() {
    if (!recentList) return false;

    try {
      setLoading(recentList, "Loading…", "Fetching recent listening…");

      const limit = RECENT_LIMIT_DEFAULT;
      const j = await apiGet(`/api/history?limit=${limit}`);
      const items = normalizeRecentPayload(j);

      state.lastRecent = items.slice();

      if (!items.length) {
        setEmpty(recentList, "No recent tracks", "Play something and refresh.");
        return true;
      }

      const html = items.map((it, i) => {
        const idx = i + 1;
        const title = it.name || "—";
        const artist = it.artist || "";
        const album = it.album || "";
        const sub = `${artist}${album ? " • " + album : ""}`.trim();
        const img = it.image || "";
        const right = it.time || it.date || "";
        const uri = it.uri || it.spotify_uri || "";

        return rowHTML({
          idx,
          title,
          sub,
          img,
          right,
          itemType: "track",
          playMode: "direct",
          artist,
          album,
          uri,
          playable: true,
          extraUris: {
            spotifyTrackUri: uri
          }
        });
      }).join("");

      recentList.innerHTML = html;
      return true;
    } catch (e) {
      setError(recentList, "Couldn’t load Recent.", "Check connection / Worker.");
      return false;
    }
  }

  async function loadTop() {
    if (!topList) return false;

    try {
      setLoading(topList, "Loading…", "Fetching your top listening…");

      const type = state.topType;
      const period = state.topPeriod;
      const limit = TOP_LIMIT_DEFAULT;

      const j = await apiGet(`/api/top?type=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}&limit=${limit}`);
      const items = normalizeTopPayload(j);

      state.lastTop = items.slice();

      if (!items.length) {
        setEmpty(topList, "No data", "Try another period.");
        return true;
      }

      const html = items.map((it, i) => {
        const idx = i + 1;
        const title = it.name || "—";
        const artist = it.artist || "";
        const album = it.album || "";
        const img = it.image || "";
        const right = (it.playcount != null) ? it.playcount : "";
        const uri = it.uri || it.spotify_uri || "";

        const itemType =
          type === "artists" ? "artist" :
          type === "albums" ? "album" :
          "track";

        const playMode = itemType === "track" ? "direct" : "top-track";

        const sub =
          itemType === "artist"
            ? (it.genre || it.bio || "")
            : itemType === "album"
              ? (artist || "")
              : (artist || "");

        return rowHTML({
          idx,
          title,
          sub,
          img,
          right,
          itemType,
          playMode,
          artist: itemType === "artist" ? title : artist,
          album: itemType === "album" ? title : album,
          uri: itemType === "track" ? uri : "",
          playable: true,
          extraUris: {
            spotifyTrackUri: itemType === "track" ? uri : (it.spotify_track_uri || ""),
            spotifyArtistUri: itemType === "artist" ? (it.artist_uri || it.spotify_artist_uri || uri || "") : "",
            spotifyAlbumUri: itemType === "album" ? (it.album_uri || it.spotify_album_uri || uri || "") : ""
          }
        });
      }).join("");

      topList.innerHTML = html;
      return true;
    } catch (e) {
      setError(topList, "Couldn’t load Top.", "Check connection / Worker.");
      return false;
    }
  }

  function loadConcertPlaceholders() {
    if (concertsList && !concertsList.children.length) {
      concertsList.innerHTML = cardMessageHTML(
        "Concert feed not wired yet",
        "Your real concerts source can be connected next."
      );
    }

    if (concertMatchesList && !concertMatchesList.children.length) {
      concertMatchesList.innerHTML = cardMessageHTML(
        "No matches yet",
        "Matches will appear here when the concerts feed is connected."
      );
    }
  }

  function loadArchivePlaceholder() {
    if (archiveList && !archiveList.children.length) {
      archiveList.innerHTML = cardMessageHTML(
        "Archive ready",
        "Saved mirror states or history can render here later."
      );
    }
  }

  function bindTopPanelControls() {
    const topCard = topList?.closest(".card");
    if (!topCard) return;

    let controls = $("topControlsBar");
    if (controls) return;

    const titleNode = topCard.querySelector(".card__title");

    const wrap = document.createElement("div");
    wrap.id = "topControlsBar";
    wrap.style.marginBottom = "14px";
    wrap.innerHTML = `
      <div style="display:grid;gap:12px;">
        <div>
          <div style="font-size:12px;color:rgba(255,255,255,.62);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;">Top type</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="lmTopBtn" data-top-type="tracks">Tracks</button>
            <button type="button" class="lmTopBtn" data-top-type="artists">Artists</button>
          </div>
        </div>

        <div>
          <div style="font-size:12px;color:rgba(255,255,255,.62);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;">Period</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="lmPeriodBtn" data-top-period="today">Today</button>
            <button type="button" class="lmPeriodBtn" data-top-period="week">Week</button>
            <button type="button" class="lmPeriodBtn" data-top-period="month">Month</button>
            <button type="button" class="lmPeriodBtn" data-top-period="year">Year</button>
            <button type="button" class="lmPeriodBtn" data-top-period="overall">Overall</button>
          </div>
        </div>
      </div>
    `;

    if (titleNode && titleNode.nextSibling) {
      topCard.insertBefore(wrap, titleNode.nextSibling);
    } else {
      topCard.prepend(wrap);
    }

    const styleId = "lmTopControlsCss";
    if (!document.getElementById(styleId)) {
      const st = document.createElement("style");
      st.id = styleId;
      st.textContent = `
        .lmTopBtn,.lmPeriodBtn{
          border:1px solid rgba(255,255,255,.12);
          background:rgba(255,255,255,.04);
          color:rgba(255,255,255,.88);
          border-radius:999px;
          padding:8px 12px;
          font:inherit;
          font-size:13px;
          cursor:pointer;
        }
        .lmTopBtn.is-active,.lmPeriodBtn.is-active{
          background:rgba(255,255,255,.12);
          border-color:rgba(255,255,255,.22);
          color:#fff;
        }
      `;
      document.head.appendChild(st);
    }

    function syncButtons() {
      document.querySelectorAll(".lmTopBtn").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.topType === state.topType);
      });
      document.querySelectorAll(".lmPeriodBtn").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.topPeriod === state.topPeriod);
      });
    }

    wrap.addEventListener("click", async (e) => {
      const typeBtn = e.target.closest(".lmTopBtn");
      const periodBtn = e.target.closest(".lmPeriodBtn");

      if (typeBtn) {
        state.topType = typeBtn.dataset.topType || "tracks";
        syncButtons();
        await loadTop();
        return;
      }

      if (periodBtn) {
        state.topPeriod = periodBtn.dataset.topPeriod || "today";
        syncButtons();
        await loadTop();
      }
    });

    syncButtons();
  }

  function bindIdentityTabs() {
    const identityView = $("viewIdentity");
    if (!identityView) return;

    identityView.addEventListener("click", async (e) => {
      const btn = e.target.closest(".lmIdentityTabBtn");
      if (!btn) return;

      const nextTab = btn.dataset.identityTab || "recent";
      if (state.identityTab === nextTab) return;

      state.identityTab = nextTab;
      syncIdentityTabUi();

      if (nextTab === "recent" && (!recentList?.children.length || recentList.textContent.includes("No data"))) {
        await loadRecent();
      }

      if (nextTab === "top" && (!topList?.children.length || topList.textContent.includes("No data"))) {
        await loadTop();
      }
    });
  }

  function bindTabPrefetch() {
    const tabConcerts = $("tabConcerts");
    const tabIdentity = $("tabIdentity");
    const tabArchive = $("tabArchive");

    tabIdentity?.addEventListener("click", async () => {
      ensureIdentityUi();
      syncIdentityTabUi();

      if (!recentList?.children.length || recentList.textContent.includes("No data")) {
        await loadRecent();
      }
      if (!topList?.children.length || topList.textContent.includes("No data")) {
        await loadTop();
      }
    });

    tabConcerts?.addEventListener("click", () => {
      loadConcertPlaceholders();
    });

    tabArchive?.addEventListener("click", () => {
      loadArchivePlaceholder();
    });
  }

  async function boot() {
    ensureIdentityUi();
    bindIdentityTabs();
    bindTopPanelControls();
    bindTabPrefetch();

    loadConcertPlaceholders();
    loadArchivePlaceholder();

    await Promise.all([
      loadRecent(),
      loadTop()
    ]);

    syncIdentityTabUi();
  }

  window.__LM_APP__ = {
    getState() {
      return {
        topType: state.topType,
        topPeriod: state.topPeriod,
        identityTab: state.identityTab,
        lastRecent: Array.isArray(state.lastRecent) ? state.lastRecent.slice() : [],
        lastTop: Array.isArray(state.lastTop) ? state.lastTop.slice() : [],
      };
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
