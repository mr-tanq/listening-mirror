/* app.js (FULL FILE REPLACE)
   Listening Mirror — Identity tabs + Archive rich stats (Returning Artist Last.fm visual)
*/

(() => {
  "use strict";

  const API_BASE = "https://i.errtanq9.workers.dev";
  const ARCHIVE_API_BASE = "https://listening-mirror-archive.errtanq9.workers.dev";

  const TOP_LIMIT_DEFAULT = 10;
  const RECENT_LIMIT_DEFAULT = 20;
  const ARCHIVE_LIMIT_DEFAULT = 300;

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
    lastTop: [],
    lastArchive: [],
    archiveStats: null,
    archiveHeroImages: {
      returningArtist: ""
    }
  };

  const lastfmArtistImageCache = new Map();

  function absApi(urlOrPath) {
    if (!urlOrPath) return "";
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
    if (urlOrPath.startsWith("/")) return API_BASE + urlOrPath;
    return API_BASE + "/" + urlOrPath;
  }

  function absArchiveApi(urlOrPath) {
    if (!urlOrPath) return "";
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
    if (urlOrPath.startsWith("/")) return ARCHIVE_API_BASE + urlOrPath;
    return ARCHIVE_API_BASE + "/" + urlOrPath;
  }

  async function apiGet(path) {
    const url = absApi(path);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  async function archiveApiGet(path) {
    const url = absArchiveApi(path);
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

  function getLastfmApiKey() {
    const key = String(window.LASTFM_API_KEY || "").trim();
    return key || "";
  }

  function pickLastfmArtistImage(artistObj) {
    const images = Array.isArray(artistObj?.image) ? artistObj.image : [];
    const preferredSizes = ["mega", "extralarge", "large", "medium", "small"];

    for (const size of preferredSizes) {
      const found = images.find((img) => String(img?.size || "").toLowerCase() === size && String(img?.["#text"] || "").trim());
      if (found?.["#text"]) return String(found["#text"]).trim();
    }

    for (const img of images) {
      const url = String(img?.["#text"] || "").trim();
      if (url) return url;
    }

    return "";
  }

  async function fetchLastfmArtistImage(name) {
    const artistName = normalizeSpace(name || "");
    if (!artistName) return "";

    if (lastfmArtistImageCache.has(artistName)) {
      return lastfmArtistImageCache.get(artistName) || "";
    }

    const apiKey = getLastfmApiKey();
    if (!apiKey) {
      lastfmArtistImageCache.set(artistName, "");
      return "";
    }

    try {
      const url = new URL("https://ws.audioscrobbler.com/2.0/");
      url.searchParams.set("method", "artist.getinfo");
      url.searchParams.set("artist", artistName);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("format", "json");
      url.searchParams.set("autocorrect", "1");

      const r = await fetch(url.toString(), { cache: "force-cache" });
      if (!r.ok) {
        lastfmArtistImageCache.set(artistName, "");
        return "";
      }

      const j = await r.json();
      const imageUrl = pickLastfmArtistImage(j?.artist);

      lastfmArtistImageCache.set(artistName, imageUrl || "");
      return imageUrl || "";
    } catch {
      lastfmArtistImageCache.set(artistName, "");
      return "";
    }
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

        .archiveCanvas{
          display:grid;
          gap:18px;
        }

        .archiveIntro{
          margin:0;
        }
        .archiveIntroTitle{
          font-size:20px;
          line-height:1.15;
          font-weight:600;
          color:rgba(255,255,255,.97);
          margin-bottom:8px;
          text-shadow:0 0 18px rgba(255,255,255,.04);
        }
        .archiveIntroSub{
          font-size:13px;
          line-height:1.6;
          color:rgba(255,255,255,.56);
          max-width:62ch;
        }

        .archiveSection{
          display:grid;
          gap:12px;
        }
        .archiveSectionTitle{
          font-size:12px;
          line-height:1.2;
          letter-spacing:.14em;
          text-transform:uppercase;
          color:rgba(255,255,255,.50);
          margin:0;
        }

        .archiveStatsGrid{
          display:grid;
          grid-template-columns:repeat(2, minmax(0,1fr));
          gap:10px;
        }
        .archiveStatCard{
          border-radius:16px;
          background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.022));
          outline:1px solid rgba(255,255,255,.07);
          padding:13px 12px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.025),
            0 8px 20px rgba(0,0,0,.10);
        }
        .archiveStatValue{
          font-size:22px;
          line-height:1;
          font-weight:600;
          color:rgba(255,255,255,.96);
        }
        .archiveStatLabel{
          margin-top:6px;
          font-size:11px;
          line-height:1.25;
          letter-spacing:.08em;
          text-transform:uppercase;
          color:rgba(255,255,255,.46);
        }

        .archiveDnaGrid{
          display:grid;
          grid-template-columns:repeat(2, minmax(0,1fr));
          gap:10px;
        }
        .archiveDnaCard{
          position:relative;
          overflow:hidden;
          border-radius:18px;
          background:
            radial-gradient(circle at 18% 16%, rgba(255,255,255,.055), transparent 40%),
            linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.022));
          outline:1px solid rgba(255,255,255,.08);
          padding:16px 13px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.03),
            0 12px 26px rgba(0,0,0,.12);
        }
        .archiveDnaCardVisual{
          background:linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,.015));
        }
        .archiveDnaBackdrop{
          position:absolute;
          inset:0;
          background-size:cover;
          background-position:center center;
          transform:scale(1.06);
          filter:blur(2px);
          opacity:.34;
          pointer-events:none;
        }
        .archiveDnaBackdrop::after{
          content:"";
          position:absolute;
          inset:0;
          background:
            linear-gradient(180deg, rgba(6,7,10,.18) 0%, rgba(6,7,10,.52) 34%, rgba(6,7,10,.82) 100%),
            radial-gradient(circle at 18% 15%, rgba(255,255,255,.08), transparent 42%);
        }
        .archiveDnaInner{
          position:relative;
          z-index:1;
        }
        .archiveDnaPrimary{
          font-size:18px;
          line-height:1.2;
          font-weight:600;
          color:rgba(255,255,255,.97);
          text-wrap:balance;
          text-shadow:0 0 18px rgba(255,255,255,.04);
        }
        .archiveDnaSecondary{
          margin-top:8px;
          font-size:12px;
          line-height:1.4;
          color:rgba(255,255,255,.62);
        }
        .archiveDnaLabel{
          margin-top:10px;
          font-size:10px;
          line-height:1.2;
          letter-spacing:.12em;
          text-transform:uppercase;
          color:rgba(255,255,255,.40);
        }

        .archiveMilestoneGrid{
          display:grid;
          gap:10px;
        }
        .archiveMilestoneCard{
          border-radius:18px;
          background:
            radial-gradient(circle at 16% 20%, rgba(255,255,255,.04), transparent 38%),
            linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.022));
          outline:1px solid rgba(255,255,255,.08);
          padding:15px 14px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.03),
            0 12px 26px rgba(0,0,0,.12);
        }
        .archiveMilestoneLabel{
          font-size:10px;
          line-height:1.2;
          letter-spacing:.14em;
          text-transform:uppercase;
          color:rgba(255,255,255,.44);
          margin-bottom:10px;
        }
        .archiveMilestoneTitle{
          font-size:15px;
          line-height:1.35;
          font-weight:600;
          color:rgba(255,255,255,.97);
          text-wrap:balance;
        }
        .archiveMilestoneMeta{
          margin-top:8px;
          font-size:12px;
          line-height:1.45;
          color:rgba(255,255,255,.62);
        }
        .archiveMilestoneVenue{
          margin-top:3px;
          font-size:12px;
          line-height:1.45;
          color:rgba(255,255,255,.40);
        }

        .archiveRankGrid{
          display:grid;
          gap:10px;
        }
        .archiveRankCard{
          border-radius:15px;
          background:linear-gradient(180deg, rgba(255,255,255,.034), rgba(255,255,255,.02));
          outline:1px solid rgba(255,255,255,.07);
          padding:11px 11px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.02),
            0 8px 18px rgba(0,0,0,.09);
        }
        .archiveRankTitle{
          font-size:12px;
          line-height:1.2;
          letter-spacing:.10em;
          text-transform:uppercase;
          color:rgba(255,255,255,.54);
          margin-bottom:9px;
        }
        .archiveRankList{
          display:grid;
          gap:7px;
        }
        .archiveRankRow{
          display:grid;
          grid-template-columns:auto minmax(0,1fr) auto;
          gap:10px;
          align-items:center;
        }
        .archiveRankIndex{
          font-size:12px;
          line-height:1;
          color:rgba(255,255,255,.40);
          min-width:14px;
        }
        .archiveRankName{
          font-size:13px;
          line-height:1.35;
          color:rgba(255,255,255,.90);
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .archiveRankCount{
          font-size:12px;
          line-height:1;
          color:rgba(255,255,255,.56);
          white-space:nowrap;
        }

        .archiveTimeline{
          display:grid;
          gap:10px;
          margin-top:2px;
        }

        .archiveRow{
          grid-template-columns:minmax(0,1fr) auto;
          align-items:center;
        }
        .archiveTitle{
          color:rgba(255,255,255,.96);
        }
        .archiveSupport{
          font-size:12px;
          line-height:1.35;
          color:rgba(255,255,255,.68);
          font-style:italic;
          margin-top:4px;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .archiveMeta{
          margin-top:8px;
          color:rgba(255,255,255,.52);
        }
        .archiveVenue{
          margin-top:2px;
          color:rgba(255,255,255,.38);
        }
        .archiveRight{
          display:flex;
          align-items:center;
          justify-content:flex-end;
          min-width:74px;
        }
        .archiveBadge{
          border:1px solid rgba(255,255,255,.12);
          background:rgba(255,255,255,.06);
          color:rgba(255,255,255,.78);
          border-radius:999px;
          padding:6px 10px;
          font-size:11px;
          letter-spacing:.04em;
        }

        @media (min-width: 420px){
          .archiveRankGrid{
            grid-template-columns:repeat(3, minmax(0,1fr));
          }
        }
      `;
      document.head.appendChild(st);
    }

    syncIdentityTabUi();
  }

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

  async function enrichArchiveHeroImages(stats) {
    state.archiveHeroImages.returningArtist = "";

    const returningArtistName = normalizeSpace(stats?.highlights?.most_seen_artist?.name || "");
    if (!returningArtistName) return;

    const imageUrl = await fetchLastfmArtistImage(returningArtistName);
    state.archiveHeroImages.returningArtist = imageUrl || "";
  }

  async function loadArchiveStats() {
    if (!archiveList) return false;

    try {
      const j = await archiveApiGet("/stats");
      state.archiveStats = j || null;
      await enrichArchiveHeroImages(state.archiveStats);
      return true;
    } catch (e) {
      state.archiveStats = null;
      state.archiveHeroImages.returningArtist = "";
      return false;
    }
  }

  async function loadArchiveList() {
    if (!archiveList) return false;

    try {
      setLoading(archiveList, "Loading…", "Fetching archive concerts…");

      await loadArchiveStats();

      const j = await archiveApiGet(`/concerts?limit=${ARCHIVE_LIMIT_DEFAULT}`);
      const items = Array.isArray(j?.items) ? j.items : [];

      state.lastArchive = items.slice();

      if (!items.length) {
        setEmpty(archiveList, "No archive concerts yet", "Your live history will appear here.");
        return true;
      }

      const statsHtml = renderArchiveStatsPanel(state.archiveStats);
      const rowsHtml = items.map(renderArchiveRow).join("");

      archiveList.innerHTML = `
        <div class="archiveCanvas">
          ${statsHtml}
          <section class="archiveSection">
            <h3 class="archiveSectionTitle">Archive Timeline</h3>
            <div class="archiveTimeline">
              ${rowsHtml}
            </div>
          </section>
        </div>
      `;
      return true;
    } catch (e) {
      setError(archiveList, "Couldn’t load Archive.", "Check archive worker / database.");
      return false;
    }
  }

  function renderArchiveStatsPanel(stats) {
    const overview = stats?.overview || {};
    const highlights = stats?.highlights || {};
    const topVenues = Array.isArray(stats?.top_venues) ? stats.top_venues : [];
    const topCities = Array.isArray(stats?.top_cities) ? stats.top_cities : [];
    const mostSeenArtists = Array.isArray(stats?.most_seen_artists) ? stats.most_seen_artists : [];

    return `
      <section class="archiveIntro">
        <div class="archiveIntroTitle">Archive</div>
        <div class="archiveIntroSub">Your live memory vault — concerts, patterns, and milestones across the years.</div>
      </section>

      <section class="archiveSection">
        <h3 class="archiveSectionTitle">Overview</h3>
        ${renderArchiveOverviewCards(overview)}
      </section>

      <section class="archiveSection">
        <h3 class="archiveSectionTitle">Signature</h3>
        ${renderArchiveDnaCards(highlights)}
      </section>

      <section class="archiveSection">
        <h3 class="archiveSectionTitle">Milestones</h3>
        ${renderArchiveMilestones(highlights)}
      </section>

      <section class="archiveSection">
        <h3 class="archiveSectionTitle">Patterns</h3>
        ${renderArchiveRankings(mostSeenArtists, topVenues, topCities)}
      </section>
    `;
  }

  function renderArchiveOverviewCards(overview) {
    const cards = [
      { value: Number(overview.total_concerts || 0), label: "Concerts" },
      { value: Number(overview.total_festivals || 0), label: "Festivals" },
      { value: Number(overview.venues_visited || 0), label: "Venues" },
      { value: Number(overview.locations_visited || 0), label: "Cities" }
    ];

    return `
      <div class="archiveStatsGrid" role="group" aria-label="Archive overview">
        ${cards.map((card) => `
          <div class="archiveStatCard">
            <div class="archiveStatValue">${escapeHtml(String(card.value))}</div>
            <div class="archiveStatLabel">${escapeHtml(card.label)}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderArchiveDnaCard({ primary, secondary, label, imageUrl = "" }) {
    const hasImage = !!normalizeSpace(imageUrl);
    return `
      <div class="archiveDnaCard${hasImage ? " archiveDnaCardVisual" : ""}">
        ${hasImage ? `<div class="archiveDnaBackdrop" style="background-image:url('${escapeHtml(imageUrl)}');"></div>` : ""}
        <div class="archiveDnaInner">
          <div class="archiveDnaPrimary">${escapeHtml(primary || "—")}</div>
          <div class="archiveDnaSecondary">${escapeHtml(secondary || "no data yet")}</div>
          <div class="archiveDnaLabel">${escapeHtml(label || "")}</div>
        </div>
      </div>
    `;
  }

  function renderArchiveDnaCards(highlights) {
    const mostSeenArtist = highlights?.most_seen_artist || null;
    const topVenue = highlights?.top_venue || null;
    const topCity = highlights?.top_city || null;
    const mostActiveYear = highlights?.most_active_year || null;

    const cards = [
      {
        primary: mostSeenArtist?.name || "—",
        secondary: mostSeenArtist ? `returned to ${mostSeenArtist.total} times` : "no data yet",
        label: "Returning Artist",
        imageUrl: state.archiveHeroImages.returningArtist || ""
      },
      {
        primary: topVenue?.name || "—",
        secondary: topVenue ? `${topVenue.total} visits` : "no data yet",
        label: "Recurring Room",
        imageUrl: ""
      },
      {
        primary: topCity?.name || "—",
        secondary: topCity ? `${topCity.total} concerts across the years` : "no data yet",
        label: "Live Root",
        imageUrl: ""
      },
      {
        primary: mostActiveYear?.year || "—",
        secondary: mostActiveYear ? `${mostActiveYear.total} concerts` : "no data yet",
        label: "Peak Year",
        imageUrl: ""
      }
    ];

    return `
      <div class="archiveDnaGrid" role="group" aria-label="Archive signature">
        ${cards.map((card) => renderArchiveDnaCard(card)).join("")}
      </div>
    `;
  }

  function renderArchiveMilestones(highlights) {
    const firstConcert = highlights?.first_concert || null;
    const latestConcert = highlights?.latest_concert || null;

    const cards = [
      { label: "First Concert", item: firstConcert },
      { label: "Latest Concert", item: latestConcert }
    ];

    return `
      <div class="archiveMilestoneGrid" role="group" aria-label="Archive milestones">
        ${cards.map((card) => {
          const item = card.item || {};
          const title = item.title || "—";
          const date = formatArchiveDate(item.date || "");
          const city = item.city || "";
          const venue = item.venue || "";
          const meta = [date, city].filter(Boolean).join(" · ");

          return `
            <div class="archiveMilestoneCard">
              <div class="archiveMilestoneLabel">${escapeHtml(card.label)}</div>
              <div class="archiveMilestoneTitle">${escapeHtml(title)}</div>
              <div class="archiveMilestoneMeta">${escapeHtml(meta)}</div>
              <div class="archiveMilestoneVenue">${escapeHtml(venue)}</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderArchiveRankings(mostSeenArtists, topVenues, topCities) {
    return `
      <div class="archiveRankGrid" role="group" aria-label="Archive patterns">
        ${renderRankCard(
          "Most Seen Artists",
          (mostSeenArtists || []).slice(0, 5).map((item) => ({
            name: item?.name || "—",
            count: item?.total || 0
          }))
        )}
        ${renderRankCard(
          "Recurring Rooms",
          (topVenues || []).slice(0, 5).map((item) => ({
            name: item?.venue_family || "—",
            count: item?.visits || 0
          }))
        )}
        ${renderRankCard(
          "Top Cities",
          (topCities || []).slice(0, 5).map((item) => ({
            name: item?.city || "—",
            count: item?.total || 0
          }))
        )}
      </div>
    `;
  }

  function renderRankCard(title, items) {
    return `
      <div class="archiveRankCard">
        <div class="archiveRankTitle">${escapeHtml(title)}</div>
        <div class="archiveRankList">
          ${(items || []).map((item, idx) => `
            <div class="archiveRankRow">
              <div class="archiveRankIndex">${idx + 1}.</div>
              <div class="archiveRankName">${escapeHtml(item.name || "—")}</div>
              <div class="archiveRankCount">${escapeHtml(String(item.count || 0))}</div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderArchiveRow(it) {
    const title = escapeHtml(it?.title || it?.main_artist || "—");
    const supports = normalizeArchiveSupports(it?.supports || "");
    const dateText = escapeHtml(formatArchiveDate(it?.date || ""));
    const cityText = escapeHtml(it?.city || "");
    const venueText = escapeHtml(it?.venue || "");
    const festival = Number(it?.festival || 0) === 1;

    const metaLine = [dateText, cityText].filter(Boolean).join(" · ");
    const supportLine = supports
      ? `<div class="archiveSupport">with ${escapeHtml(supports)}</div>`
      : festival
        ? `<div class="archiveSupport">festival</div>`
        : "";

    const badge = festival
      ? `<div class="archiveBadge">Festival</div>`
      : "";

    return `
      <div class="row archiveRow" role="listitem" aria-label="${title}">
        <div class="mid">
          <div class="title archiveTitle">${title}</div>
          ${supportLine}
          <div class="sub archiveMeta">${metaLine}</div>
          <div class="sub archiveVenue">${venueText}</div>
        </div>
        <div class="right archiveRight">${badge}</div>
      </div>
    `;
  }

  function normalizeArchiveSupports(s) {
    return String(s || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .join(", ");
  }

  function formatArchiveDate(value) {
    const s = String(value || "").trim();
    if (!s) return "";

    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return s;

    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);

    const dt = new Date(Date.UTC(y, mo, d));
    return dt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    });
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

    tabArchive?.addEventListener("click", async () => {
      await loadArchiveList();
    });
  }

  async function boot() {
    ensureIdentityUi();
    bindIdentityTabs();
    bindTopPanelControls();
    bindTabPrefetch();

    loadConcertPlaceholders();

    await Promise.all([
      loadRecent(),
      loadTop(),
      loadArchiveList()
    ]);

    syncIdentityTabUi();

    const archiveCard = archiveList?.closest(".card");
    if (archiveCard) {
      const titleEl = archiveCard.querySelector(".card__title");
      const allSubs = Array.from(archiveCard.querySelectorAll(".card__sub, .card__desc, p"));
      if (titleEl && normalizeSpace(titleEl.textContent).toLowerCase() === "archive") {
        allSubs.forEach((el) => {
          const t = normalizeSpace(el.textContent).toLowerCase();
          if (
            t.includes("saved sessions") ||
            t.includes("archived mirror states") ||
            t === "archive list"
          ) {
            el.style.display = "none";
          }
        });
      }
    }
  }

  window.__LM_APP__ = {
    getState() {
      return {
        topType: state.topType,
        topPeriod: state.topPeriod,
        identityTab: state.identityTab,
        lastRecent: Array.isArray(state.lastRecent) ? state.lastRecent.slice() : [],
        lastTop: Array.isArray(state.lastTop) ? state.lastTop.slice() : [],
        lastArchive: Array.isArray(state.lastArchive) ? state.lastArchive.slice() : [],
        archiveStats: state.archiveStats ? { ...state.archiveStats } : null,
        archiveHeroImages: { ...state.archiveHeroImages }
      };
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
