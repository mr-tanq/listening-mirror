/* app.js (FULL FILE REPLACE) — PART 1/3
   Listening Mirror — Identity tabs + Concerts + Archive rich stats
   Concerts includes:
   - Upcoming concerts from eConcerts D1
   - Recommended/matched concerts from taste engine
   - score badges
   - source / venue / city / date rendering
*/

(() => {
  "use strict";

  const API_BASE = "https://i.errtanq9.workers.dev";
  const ARCHIVE_API_BASE = "https://listening-mirror-archive.errtanq9.workers.dev";
  const ECONCERTS_API_BASE = "https://econcerts.errtanq9.workers.dev";

  const TOP_LIMIT_DEFAULT = 10;
  const RECENT_LIMIT_DEFAULT = 20;
  const ARCHIVE_LIMIT_DEFAULT = 300;
  const CONCERTS_LIMIT_DEFAULT = 300;
  const CONCERT_MATCHES_LIMIT_DEFAULT = 300;

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

    lastConcerts: [],
    lastConcertMatches: [],
    concertBuckets: null,
    concertsLoaded: false,
    concertMatchesLoaded: false,

    lastArchive: [],
    archiveStats: null,
    archiveHeroImages: {
      returningArtist: ""
    },
    archiveFilterMode: "all",
    archiveFilterValue: "",
    archiveYearOlderOpen: false,
    archiveSelectedEventKey: "",
    archiveSelectedImageUrl: "",
    archiveNoteEditorOpen: false,
    archiveNoteDraft: "",
    archiveNoteSaving: false,
    archiveSetlistLoading: false,
    archiveSetlistSearching: false,
    archiveSetlistData: null,
    archiveSetlistError: "",
    archiveSetlistResolvedForKey: ""
  };

  const lastfmArtistImageCache = new Map();
  let archiveRowImageObserver = null;
  let archiveShellCleaned = false;

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

  function absEconcertsApi(urlOrPath) {
    if (!urlOrPath) return "";
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
    if (urlOrPath.startsWith("/")) return ECONCERTS_API_BASE + urlOrPath;
    return ECONCERTS_API_BASE + "/" + urlOrPath;
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
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    return data;
  }

  async function archiveApiPost(path, body) {
    const url = absArchiveApi(path);
    const r = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {})
    });

    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.ok) {
      throw new Error(data?.error || `HTTP ${r.status}`);
    }
    return data;
  }

  async function econcertsApiGet(path) {
    const url = absEconcertsApi(path);
    const r = await fetch(url, { cache: "no-store" });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    return data;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(s) {
    return escapeHtml(s);
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

  function isBadLastfmImageUrl(url) {
    const u = String(url || "").trim().toLowerCase();
    if (!u) return true;

    return (
      u.includes("2a96cbd8b46e442fc41c2b86b821562f") ||
      u.includes("/noimage/") ||
      u.includes("noimage") ||
      u.includes("placeholder") ||
      u.endsWith("/i/u/34s/avatar170s/")
    );
  }

  function pickBestLastfmImage(images) {
    const arr = Array.isArray(images) ? images : [];
    const preferredSizes = ["mega", "extralarge", "large", "medium", "small"];

    for (const size of preferredSizes) {
      const found = arr.find((img) => {
        const imgSize = String(img?.size || "").toLowerCase();
        const imgUrl = String(img?.["#text"] || "").trim();
        return imgSize === size && imgUrl && !isBadLastfmImageUrl(imgUrl);
      });
      if (found?.["#text"]) return String(found["#text"]).trim();
    }

    for (const img of arr) {
      const imgUrl = String(img?.["#text"] || "").trim();
      if (imgUrl && !isBadLastfmImageUrl(imgUrl)) return imgUrl;
    }

    return "";
  }

  async function fetchLastfmJson(params) {
    const apiKey = getLastfmApiKey();
    if (!apiKey) return null;

    try {
      const url = new URL("https://ws.audioscrobbler.com/2.0/");
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v != null && v !== "") url.searchParams.set(k, String(v));
      });
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("format", "json");
      url.searchParams.set("autocorrect", "1");

      const r = await fetch(url.toString(), { cache: "force-cache" });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  function extractImageFromTopAlbumsPayload(j) {
    const albums = Array.isArray(j?.topalbums?.album) ? j.topalbums.album : [];
    for (const album of albums) {
      const url = pickBestLastfmImage(album?.image);
      if (url) return url;
    }
    return "";
  }

  function extractImageFromTopTracksPayload(j) {
    const tracks = Array.isArray(j?.toptracks?.track) ? j.toptracks.track : [];
    for (const track of tracks) {
      const fromTrack = pickBestLastfmImage(track?.image);
      if (fromTrack) return fromTrack;

      const fromAlbum = pickBestLastfmImage(track?.album?.image);
      if (fromAlbum) return fromAlbum;
    }
    return "";
  }

  function extractImageFromArtistInfoPayload(j) {
    return pickBestLastfmImage(j?.artist?.image);
  }

  async function fetchLastfmArtworkImage(name) {
    const artistName = normalizeSpace(name || "");
    if (!artistName) return "";

    if (lastfmArtistImageCache.has(artistName)) {
      return lastfmArtistImageCache.get(artistName) || "";
    }

    let imageUrl = "";

    const topAlbums = await fetchLastfmJson({
      method: "artist.getTopAlbums",
      artist: artistName,
      limit: "10"
    });
    imageUrl = extractImageFromTopAlbumsPayload(topAlbums);

    if (!imageUrl) {
      const topTracks = await fetchLastfmJson({
        method: "artist.getTopTracks",
        artist: artistName,
        limit: "10"
      });
      imageUrl = extractImageFromTopTracksPayload(topTracks);
    }

    if (!imageUrl) {
      const artistInfo = await fetchLastfmJson({
        method: "artist.getInfo",
        artist: artistName
      });
      imageUrl = extractImageFromArtistInfoPayload(artistInfo);
    }

    const safeImageUrl = isBadLastfmImageUrl(imageUrl) ? "" : imageUrl;
    lastfmArtistImageCache.set(artistName, safeImageUrl || "");
    return safeImageUrl || "";
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
        .lmIdentityTabs{display:flex;gap:8px;flex-wrap:wrap}
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

        .thumbButton{position:relative;border:none;padding:0;cursor:pointer}
        .thumbButton:focus-visible{outline:2px solid rgba(255,255,255,.34);outline-offset:2px}
        .thumbOverlay{
          position:absolute;inset:0;display:grid;place-items:center;
          background:rgba(0,0,0,.30);opacity:0;transition:opacity .18s ease;
        }
        .thumbButton:active .thumbOverlay,.thumbButton:focus-visible .thumbOverlay{opacity:1}
        .thumbPlayIcon{
          display:grid;place-items:center;width:24px;height:24px;border-radius:999px;
          background:rgba(255,255,255,.92);color:#111;font-size:11px;line-height:1;
          padding-left:2px;box-shadow:0 4px 12px rgba(0,0,0,.2);
        }

        .lmConcertCard{
          border-radius:18px;
          background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));
          outline:1px solid rgba(255,255,255,.08);
          padding:13px 13px;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.02),0 8px 18px rgba(0,0,0,.10);
        }
        .lmConcertCard + .lmConcertCard{margin-top:10px}
        .lmConcertTop{
          display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
        }
        .lmConcertTitle{
          font-size:15px;line-height:1.35;font-weight:600;color:rgba(255,255,255,.96);
          text-wrap:balance;
        }
        .lmConcertMeta{
          margin-top:8px;
          font-size:12px;line-height:1.5;color:rgba(255,255,255,.62);
        }
        .lmConcertVenue{
          margin-top:3px;
          font-size:12px;line-height:1.45;color:rgba(255,255,255,.44);
        }
        .lmConcertFooter{
          margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;
        }
        .lmConcertPill{
          display:inline-flex;align-items:center;gap:6px;
          padding:7px 10px;border-radius:999px;
          background:rgba(255,255,255,.05);
          border:1px solid rgba(255,255,255,.08);
          color:rgba(255,255,255,.82);
          font-size:11px;line-height:1.2;letter-spacing:.04em;
        }
        .lmConcertScore{
          min-width:52px;text-align:center;
          border-radius:999px;padding:7px 10px;
          background:rgba(255,255,255,.10);
          border:1px solid rgba(255,255,255,.12);
          color:#fff;font-size:12px;font-weight:600;
        }
        .lmConcertReason{
          margin-top:10px;font-size:12px;line-height:1.5;color:rgba(255,255,255,.58);
        }
        .lmConcertLink{
          color:rgba(255,255,255,.92);
          text-decoration:none;
          border-bottom:1px solid rgba(255,255,255,.16);
        }
        .lmConcertLink:hover{
          color:#fff;border-bottom-color:rgba(255,255,255,.42);
        }
        .lmConcertSectionHead{
          display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;
        }
        .lmConcertSectionTitle{
          font-size:12px;line-height:1.2;letter-spacing:.14em;text-transform:uppercase;
          color:rgba(255,255,255,.50);
        }
        .lmConcertMiniStat{
          font-size:11px;line-height:1.2;color:rgba(255,255,255,.44);
          letter-spacing:.05em;text-transform:uppercase;
        }

        .archiveCanvas{display:grid;gap:18px}
        .archiveIntro{margin:0}
        .archiveIntroTitle{
          font-size:20px;line-height:1.15;font-weight:600;color:rgba(255,255,255,.97);
          margin-bottom:8px;text-shadow:0 0 18px rgba(255,255,255,.04);
        }
        .archiveIntroSub{
          font-size:13px;line-height:1.6;color:rgba(255,255,255,.56);max-width:62ch;
        }

        .archiveSection{display:grid;gap:12px}
        .archiveSectionTitle{
          font-size:12px;line-height:1.2;letter-spacing:.14em;text-transform:uppercase;
          color:rgba(255,255,255,.50);margin:0;
        }

        .archiveStatsGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .archiveStatCard{
          border-radius:16px;background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.022));
          outline:1px solid rgba(255,255,255,.07);padding:13px 12px;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.025),0 8px 20px rgba(0,0,0,.10);
        }
        .archiveStatValue{font-size:22px;line-height:1;font-weight:600;color:rgba(255,255,255,.96)}
        .archiveStatLabel{
          margin-top:6px;font-size:11px;line-height:1.25;letter-spacing:.08em;
          text-transform:uppercase;color:rgba(255,255,255,.46);
        }

        .archiveDnaGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .archiveDnaCard{
          position:relative;overflow:hidden;border-radius:18px;
          background:radial-gradient(circle at 18% 16%, rgba(255,255,255,.055), transparent 40%),linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.022));
          outline:1px solid rgba(255,255,255,.08);padding:16px 13px;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 12px 26px rgba(0,0,0,.12);
        }
        .archiveDnaCardVisual{background:linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,.015))}
        .archiveDnaBackdrop{
          position:absolute;inset:0;background-size:cover;background-position:center center;
          transform:scale(1.03);filter:blur(0px);opacity:.52;pointer-events:none;
        }
        .archiveDnaBackdrop::after{
          content:"";position:absolute;inset:0;
          background:linear-gradient(180deg, rgba(6,7,10,.18) 0%, rgba(6,7,10,.52) 34%, rgba(6,7,10,.82) 100%),radial-gradient(circle at 18% 15%, rgba(255,255,255,.08), transparent 42%);
        }
        .archiveDnaInner{position:relative;z-index:1}
        .archiveDnaPrimary{
          font-size:18px;line-height:1.2;font-weight:600;color:rgba(255,255,255,.97);
          text-wrap:balance;text-shadow:0 0 18px rgba(255,255,255,.04);
        }
        .archiveDnaSecondary{margin-top:8px;font-size:12px;line-height:1.4;color:rgba(255,255,255,.62)}
        .archiveDnaLabel{
          margin-top:10px;font-size:10px;line-height:1.2;letter-spacing:.12em;
          text-transform:uppercase;color:rgba(255,255,255,.40);
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
          extraUris: { spotifyTrackUri: uri }
        });
      }).join("");

      recentList.innerHTML = html;
      return true;
    } catch {
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
    } catch {
      setError(topList, "Couldn’t load Top.", "Check connection / Worker.");
      return false;
    }
  }

  function formatConcertDate(dateLocal, timeLocal) {
    const date = String(dateLocal || "").trim();
    if (!date) return "";

    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) {
      return [date, timeLocal].filter(Boolean).join(" • ");
    }

    const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    const formattedDate = dt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    });

    return [formattedDate, normalizeSpace(timeLocal || "")]
      .filter(Boolean)
      .join(" • ");
  }

  function concertScoreEmoji(score) {
    const s = Number(score || 0);
    if (s >= 85) return "🔥";
    if (s >= 70) return "✨";
    if (s >= 55) return "👍";
    if (s >= 40) return "👀";
    return "·";
  }

  function concertVisibilityLabel(visibility) {
    switch (String(visibility || "").toLowerCase()) {
      case "top": return "Top";
      case "strong": return "Strong";
      case "recommended": return "Recommended";
      case "older-taste": return "Older Taste";
      case "borderline": return "Borderline";
      default: return "Upcoming";
    }
  }

  function renderConcertCard(event, { showScore = false, showReason = false } = {}) {
    const title = normalizeSpace(event?.title || event?.artists_main || "—");
    const dateText = formatConcertDate(event?.date_local, event?.time_local);
    const city = normalizeSpace(event?.city || "");
    const venue = normalizeSpace(event?.venue_name || "");
    const source = normalizeSpace(event?.source || "");
    const url = normalizeSpace(event?.url || "");
    const visibility = normalizeSpace(event?.visibility || "");
    const score = Number(event?.finalScore || 0);
    const reasonText = Array.isArray(event?.reasons) ? event.reasons.slice(0, 2).join(" • ") : "";

    return `
      <div class="lmConcertCard">
        <div class="lmConcertTop">
          <div class="mid">
            <div class="lmConcertTitle">
              ${
                url
                  ? `<a class="lmConcertLink" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`
                  : escapeHtml(title)
              }
            </div>
            <div class="lmConcertMeta">${escapeHtml([dateText, city].filter(Boolean).join(" • "))}</div>
            <div class="lmConcertVenue">${escapeHtml(venue)}</div>
          </div>
          ${
            showScore
              ? `<div class="lmConcertScore">${escapeHtml(`${concertScoreEmoji(score)} ${Math.round(score)}`)}</div>`
              : ``
          }
        </div>

        <div class="lmConcertFooter">
          ${visibility ? `<div class="lmConcertPill">${escapeHtml(concertVisibilityLabel(visibility))}</div>` : ``}
          ${source ? `<div class="lmConcertPill">${escapeHtml(source)}</div>` : ``}
          ${event?.matchedArtist ? `<div class="lmConcertPill">${escapeHtml(`match: ${event.matchedArtist}`)}</div>` : ``}
        </div>

        ${showReason && reasonText ? `<div class="lmConcertReason">${escapeHtml(reasonText)}</div>` : ``}
      </div>
    `;
  }

  function renderConcertSection(el, title, statText, html) {
    if (!el) return;
    el.innerHTML = `
      <div class="lmConcertSectionHead">
        <div class="lmConcertSectionTitle">${escapeHtml(title)}</div>
        <div class="lmConcertMiniStat">${escapeHtml(statText || "")}</div>
      </div>
      <div>${html}</div>
    `;
  }

  async function loadConcerts() {
    if (!concertsList || !concertMatchesList) return false;

    try {
      setLoading(concertsList, "Loading…", "Fetching upcoming concerts from your venues…");
      setLoading(concertMatchesList, "Loading…", "Scoring concerts against your taste…");

      const [upcoming, recommended] = await Promise.all([
        econcertsApiGet(`/concerts/db-latest?limit=${CONCERTS_LIMIT_DEFAULT}`),
        econcertsApiGet(`/concerts/recommended?bucketed=1&limit=${CONCERT_MATCHES_LIMIT_DEFAULT}`)
      ]);

      const upcomingEvents = Array.isArray(upcoming?.events) ? upcoming.events : [];
      const recommendedEvents = Array.isArray(recommended?.events) ? recommended.events : [];
      const buckets = recommended?.buckets || null;

      state.lastConcerts = upcomingEvents.slice();
      state.lastConcertMatches = recommendedEvents.slice();
      state.concertBuckets = buckets;
      state.concertsLoaded = true;
      state.concertMatchesLoaded = true;

      if (!upcomingEvents.length) {
        setEmpty(concertsList, "No upcoming concerts", "D1 is empty right now.");
      } else {
        const upcomingHtml = upcomingEvents
          .slice(0, 60)
          .map((event) => renderConcertCard(event, { showScore: false, showReason: false }))
          .join("");

        renderConcertSection(
          concertsList,
          "Upcoming",
          `${upcomingEvents.length} events`,
          upcomingHtml
        );
      }

      const visibleMatches = recommendedEvents.filter((event) => String(event?.visibility || "").toLowerCase() !== "hidden");

      if (!visibleMatches.length) {
        setEmpty(concertMatchesList, "No matches yet", "Nothing strong enough has matched your taste so far.");
      } else {
        const matchHtml = visibleMatches
          .slice(0, 40)
          .map((event) => renderConcertCard(event, { showScore: true, showReason: true }))
          .join("");

        const bucketStats = [];
        if (buckets?.top?.length) bucketStats.push(`${buckets.top.length} top`);
        if (buckets?.strong?.length) bucketStats.push(`${buckets.strong.length} strong`);
        if (buckets?.recommended?.length) bucketStats.push(`${buckets.recommended.length} recommended`);

        renderConcertSection(
          concertMatchesList,
          "Your Matches",
          bucketStats.join(" • ") || `${visibleMatches.length} matches`,
          matchHtml
        );
      }

      return true;
    } catch (err) {
      setError(
        concertsList,
        "Couldn’t load upcoming concerts.",
        String(err?.message || "Check eConcerts worker.")
      );
      setError(
        concertMatchesList,
        "Couldn’t load concert matches.",
        String(err?.message || "Check eConcerts recommender.")
      );
      return false;
    }
  }

  async function enrichArchiveHeroImages(stats) {
    state.archiveHeroImages.returningArtist = "";
    const returningArtistName = normalizeSpace(stats?.highlights?.most_seen_artist?.name || "");
    if (!returningArtistName) return;
    const imageUrl = await fetchLastfmArtworkImage(returningArtistName);
    state.archiveHeroImages.returningArtist = imageUrl || "";
  }

  async function enrichArchiveMilestoneImages(highlights) {
    if (!highlights || typeof highlights !== "object") return;

    const firstItem = highlights.first_concert || null;
    const latestItem = highlights.latest_concert || null;

    if (firstItem && !firstItem.__imageUrl) {
      const firstLookup = chooseArchiveRowLookupName(firstItem);
      firstItem.__imageUrl = firstLookup ? await fetchLastfmArtworkImage(firstLookup) : "";
    }

    if (latestItem && !latestItem.__imageUrl) {
      const latestLookup = chooseArchiveRowLookupName(latestItem);
      latestItem.__imageUrl = latestLookup ? await fetchLastfmArtworkImage(latestLookup) : "";
    }
  }

  async function loadArchiveStats() {
    if (!archiveList) return false;

    try {
      const j = await archiveApiGet("/stats");
      state.archiveStats = j || null;

      await Promise.all([
        enrichArchiveHeroImages(state.archiveStats),
        enrichArchiveMilestoneImages(state.archiveStats?.highlights || {})
      ]);

      return true;
    } catch {
      state.archiveStats = null;
      state.archiveHeroImages.returningArtist = "";
      return false;
    }
  }

  function getArchiveYearOptions(items) {
    const years = new Set();
    (items || []).forEach((it) => {
      const date = String(it?.date || "").trim();
      const m = /^(\d{4})-/.exec(date);
      if (m) years.add(m[1]);
    });

    const sorted = Array.from(years).sort((a, b) => Number(b) - Number(a));
    return {
      recent: sorted.slice(0, 6),
      older: sorted.slice(6)
    };
  }

  function getArchiveArtistOptions(stats) {
    const items = Array.isArray(stats?.most_seen_artists) ? stats.most_seen_artists : [];
    return items.slice(0, 10).map((x) => normalizeSpace(x?.name || "")).filter(Boolean);
  }

  function getArchiveCityOptions(stats) {
    const items = Array.isArray(stats?.top_cities) ? stats.top_cities : [];
    return items.slice(0, 10).map((x) => normalizeSpace(x?.city || "")).filter(Boolean);
  }

  function getArchiveVenueOptions(stats) {
    const items = Array.isArray(stats?.top_venues) ? stats.top_venues : [];
    return items.slice(0, 10).map((x) => normalizeSpace(x?.venue_family || "")).filter(Boolean);
  }

  function getArchiveFilterOptions(mode, items, stats) {
    switch (mode) {
      case "year": {
        const yearGroups = getArchiveYearOptions(items);
        return [
          ...yearGroups.recent,
          ...(yearGroups.older.length ? ["__OLDER_TOGGLE__"] : []),
          ...(state.archiveYearOlderOpen ? yearGroups.older : [])
        ];
      }
      case "artist":
        return getArchiveArtistOptions(stats);
      case "city":
        return getArchiveCityOptions(stats);
      case "venue":
        return getArchiveVenueOptions(stats);
      default:
        return [];
    }
  }

  function matchesArchiveFilter(it) {
    const mode = state.archiveFilterMode;
    const value = normalizeSpace(state.archiveFilterValue || "");

    if (mode === "all" || !value) return true;
    if (mode === "year") return String(it?.date || "").trim().startsWith(`${value}-`);

    if (mode === "artist") {
      const selected = normalizeSpace(value);
      const mainArtist = normalizeSpace(it?.main_artist || "");
      const title = normalizeSpace(it?.title || "");

      const supports = String(it?.supports || "")
        .split(",")
        .map((x) => normalizeSpace(x))
        .filter(Boolean);

      return (
        mainArtist === selected ||
        title === selected ||
        supports.includes(selected)
      );
    }

    if (mode === "city") return normalizeSpace(it?.city || "") === value;

    if (mode === "venue") {
      const venueFamily = normalizeSpace(it?.venue_family || "");
      const venue = normalizeSpace(it?.venue || "");
      return venueFamily === value || venue === value;
    }

    return false;
  }

  function getFilteredArchiveItems() {
    return (state.lastArchive || []).filter(matchesArchiveFilter);
  }

  function findArchiveItemByEventKey(eventKey) {
    const key = normalizeSpace(eventKey || "");
    if (!key) return null;
    return (state.lastArchive || []).find((it) => normalizeSpace(it?.event_key || "") === key) || null;
  }

  function resetArchiveSetlistState() {
    state.archiveSetlistLoading = false;
    state.archiveSetlistSearching = false;
    state.archiveSetlistData = null;
    state.archiveSetlistError = "";
    state.archiveSetlistResolvedForKey = "";
  }

  async function ensureArchiveModalImage(item) {
    if (!item) return;

    const lookupName = chooseArchiveRowLookupName(item);
    if (!lookupName) {
      state.archiveSelectedImageUrl = "";
      return;
    }

    const imageUrl = await fetchLastfmArtworkImage(lookupName);
    if (normalizeSpace(state.archiveSelectedEventKey) === normalizeSpace(item?.event_key || "")) {
      state.archiveSelectedImageUrl = imageUrl || "";
      renderArchiveView();
    }
  }

  async function loadArchiveSetlistForSelectedEvent() {
    const eventKey = normalizeSpace(state.archiveSelectedEventKey || "");
    if (!eventKey) return;

    state.archiveSetlistLoading = false;
    state.archiveSetlistSearching = false;
    state.archiveSetlistData = null;
    state.archiveSetlistError = "";
    state.archiveSetlistResolvedForKey = eventKey;

    let showedSearching = false;
    const timer = setTimeout(() => {
      if (normalizeSpace(state.archiveSelectedEventKey || "") !== eventKey) return;
      showedSearching = true;
      state.archiveSetlistSearching = true;
      renderArchiveView();
    }, 320);

    try {
      const saved = await archiveApiGet(`/concert-setlist?event_key=${encodeURIComponent(eventKey)}`);

      if (normalizeSpace(state.archiveSelectedEventKey || "") !== eventKey) {
        clearTimeout(timer);
        return;
      }

      if (saved?.item) {
        clearTimeout(timer);
        state.archiveSetlistSearching = false;
        state.archiveSetlistData = saved.item;
        state.archiveSetlistError = "";
        renderArchiveView();
        return;
      }

      try {
        const fetched = await archiveApiPost("/concert-setlist-fetch", { event_key: eventKey });

        if (normalizeSpace(state.archiveSelectedEventKey || "") !== eventKey) {
          clearTimeout(timer);
          return;
        }

        clearTimeout(timer);
        state.archiveSetlistSearching = false;
        state.archiveSetlistData = fetched?.item || null;
        state.archiveSetlistError = fetched?.item ? "" : "No setlist found";

        if (showedSearching) renderArchiveView();
        else requestAnimationFrame(() => renderArchiveView());
      } catch (err) {
        if (normalizeSpace(state.archiveSelectedEventKey || "") !== eventKey) {
          clearTimeout(timer);
          return;
        }

        clearTimeout(timer);
        state.archiveSetlistSearching = false;
        state.archiveSetlistData = null;
        state.archiveSetlistError = /No matching setlist found/i.test(String(err?.message || ""))
          ? "No setlist found"
          : "Could not load setlist";
        renderArchiveView();
      }
    } catch {
      if (normalizeSpace(state.archiveSelectedEventKey || "") !== eventKey) {
        clearTimeout(timer);
        return;
      }

      clearTimeout(timer);
      state.archiveSetlistSearching = false;
      state.archiveSetlistData = null;
      state.archiveSetlistError = "Could not load setlist";
      renderArchiveView();
    }
  }

  function openArchiveDetail(eventKey) {
    const item = findArchiveItemByEventKey(eventKey);
    if (!item) return;

    state.archiveSelectedEventKey = normalizeSpace(item.event_key || "");
    state.archiveSelectedImageUrl = "";
    state.archiveNoteEditorOpen = false;
    state.archiveNoteDraft = "";
    state.archiveNoteSaving = false;
    resetArchiveSetlistState();

    renderArchiveView();
    ensureArchiveModalImage(item);
    loadArchiveSetlistForSelectedEvent();
  }

  function closeArchiveDetail() {
    state.archiveSelectedEventKey = "";
    state.archiveSelectedImageUrl = "";
    state.archiveNoteEditorOpen = false;
    state.archiveNoteDraft = "";
    state.archiveNoteSaving = false;
    resetArchiveSetlistState();
    renderArchiveView();
  }

  function openArchiveNoteEditor() {
    const item = findArchiveItemByEventKey(state.archiveSelectedEventKey);
    if (!item) return;

    state.archiveNoteDraft = String(item?.notes || "");
    state.archiveNoteEditorOpen = true;
    state.archiveNoteSaving = false;
    renderArchiveView();

    requestAnimationFrame(() => {
      const textarea = document.querySelector(".archiveNoteTextarea");
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    });
  }

  function closeArchiveNoteEditor() {
    state.archiveNoteEditorOpen = false;
    state.archiveNoteDraft = "";
    state.archiveNoteSaving = false;
    renderArchiveView();
  }

  async function saveArchiveNote() {
    const item = findArchiveItemByEventKey(state.archiveSelectedEventKey);
    if (!item || state.archiveNoteSaving) return;

    try {
      state.archiveNoteSaving = true;
      renderArchiveView();

      const data = await archiveApiPost("/concert-note", {
        event_key: item.event_key,
        notes: state.archiveNoteDraft
      });

      if (data?.item) {
        const idx = state.lastArchive.findIndex((x) => normalizeSpace(x?.event_key || "") === normalizeSpace(item.event_key));
        if (idx >= 0) state.lastArchive[idx] = data.item;

        if (state.archiveStats?.highlights?.first_concert?.event_key === data.item.event_key) {
          state.archiveStats.highlights.first_concert.notes = data.item.notes || "";
        }
        if (state.archiveStats?.highlights?.latest_concert?.event_key === data.item.event_key) {
          state.archiveStats.highlights.latest_concert.notes = data.item.notes || "";
        }
      }

      state.archiveNoteSaving = false;
      state.archiveNoteEditorOpen = false;
      state.archiveNoteDraft = "";
      renderArchiveView();
    } catch (err) {
      state.archiveNoteSaving = false;
      renderArchiveView();
      alert(`Could not save note.\n\n${String(err.message || err)}`);
    }
         }
   function renderArchiveExplore(items, stats) {
    const mode = state.archiveFilterMode || "all";
    const options = getArchiveFilterOptions(mode, items, stats);

    return `
      <section class="archiveSection">
        <h3 class="archiveSectionTitle">Explore Archive</h3>
        <div class="archiveExplore">
          <div class="archiveFilterModes" role="tablist" aria-label="Archive navigation">
            ${renderArchiveModeBtn("all", "All")}
            ${renderArchiveModeBtn("year", "Year")}
            ${renderArchiveModeBtn("artist", "Artist")}
            ${renderArchiveModeBtn("city", "City")}
            ${renderArchiveModeBtn("venue", "Venue")}
          </div>
          ${mode !== "all" && options.length ? `
            <div class="archiveFilterValues" role="list" aria-label="${escapeHtml(mode)} options">
              ${options.map((value) => renderArchiveValueBtn(value)).join("")}
            </div>
          ` : ""}
        </div>
      </section>
    `;
  }

  function renderArchiveModeBtn(mode, label) {
    const active = state.archiveFilterMode === mode;
    return `
      <button
        type="button"
        class="archiveFilterBtn${active ? " is-active" : ""}"
        data-archive-filter-mode="${escapeAttr(mode)}"
      >
        ${escapeHtml(label)}
      </button>
    `;
  }

  function renderArchiveValueBtn(value) {
    const isOlderToggle = value === "__OLDER_TOGGLE__";
    const active = isOlderToggle
      ? state.archiveYearOlderOpen
      : normalizeSpace(state.archiveFilterValue || "") === normalizeSpace(value || "");

    const label = isOlderToggle ? "Older" : value;

    return `
      <button
        type="button"
        class="archiveFilterChip${active ? " is-active" : ""}"
        data-archive-filter-value="${escapeAttr(value)}"
      >
        ${escapeHtml(label)}
      </button>
    `;
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
        ${hasImage ? `<div class="archiveDnaBackdrop" style="background-image:url('${escapeAttr(imageUrl)}');"></div>` : ""}
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
        primary: topCity?.city || "—",
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

  function renderArchiveMilestoneCard({ label, item }) {
    const eventKey = normalizeSpace(item?.event_key || "");
    const title = item?.title || "—";
    const date = formatArchiveDate(item?.date || "");
    const city = item?.city || "";
    const venue = item?.venue || "";
    const meta = [date, city].filter(Boolean).join(" · ");
    const imageUrl = normalizeSpace(item?.__imageUrl || "");
    const hasImage = !!imageUrl;

    return `
      <div class="archiveMilestoneCard${hasImage ? " archiveMilestoneCardVisual" : ""}">
        ${hasImage ? `<div class="archiveMilestoneBackdrop" style="background-image:url('${escapeAttr(imageUrl)}');"></div>` : ""}
        <button
          type="button"
          class="archiveMilestoneCardButton"
          data-archive-event-key="${escapeAttr(eventKey)}"
          aria-label="${escapeAttr(title)}"
        >
          <div class="archiveMilestoneInner">
            <div class="archiveMilestoneLabel">${escapeHtml(label)}</div>
            <div class="archiveMilestoneTitle">${escapeHtml(title)}</div>
            <div class="archiveMilestoneMeta">${escapeHtml(meta)}</div>
            <div class="archiveMilestoneVenue">${escapeHtml(venue)}</div>
            <div class="archiveMilestoneHint">Open concert</div>
          </div>
        </button>
      </div>
    `;
  }

  function renderArchiveMilestones(highlights) {
    const firstConcert = highlights?.first_concert || null;
    const latestConcert = highlights?.latest_concert || null;

    const cards = [
      { label: "First Concert", item: firstConcert || {} },
      { label: "Latest Concert", item: latestConcert || {} }
    ];

    return `
      <div class="archiveMilestoneGrid" role="group" aria-label="Archive milestones">
        ${cards.map((card) => renderArchiveMilestoneCard(card)).join("")}
      </div>
    `;
  }

  function renderArchiveRankings(mostSeenArtists, topVenues, topCities) {
    return `
      <div class="archiveRankGrid" role="group" aria-label="Archive patterns">
        ${renderRankCard("Most Seen Artists", (mostSeenArtists || []).slice(0, 5).map((item) => ({
          name: item?.name || "—",
          count: item?.total || 0
        })))}
        ${renderRankCard("Recurring Rooms", (topVenues || []).slice(0, 5).map((item) => ({
          name: item?.venue_family || "—",
          count: item?.visits || 0
        })))}
        ${renderRankCard("Top Cities", (topCities || []).slice(0, 5).map((item) => ({
          name: item?.city || "—",
          count: item?.total || 0
        })))}
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

  function chooseArchiveRowLookupName(it) {
    const mainArtist = normalizeSpace(it?.main_artist || "");
    const title = normalizeSpace(it?.title || "");
    if (mainArtist && !/festival/i.test(mainArtist)) return mainArtist;
    if (title) return title;
    return "";
  }

  function renderArchiveRow(it) {
    const title = escapeHtml(it?.title || it?.main_artist || "—");
    const supports = normalizeArchiveSupports(it?.supports || "");
    const dateText = escapeHtml(formatArchiveDate(it?.date || ""));
    const cityText = escapeHtml(it?.city || "");
    const venueText = escapeHtml(it?.venue || "");
    const festival = Number(it?.festival || 0) === 1;
    const lookupName = chooseArchiveRowLookupName(it);
    const eventKey = normalizeSpace(it?.event_key || "");
    const isSelected = normalizeSpace(state.archiveSelectedEventKey) === eventKey;

    const metaLine = [dateText, cityText].filter(Boolean).join(" · ");
    const supportLine = supports
      ? `<div class="archiveSupport">with ${escapeHtml(supports)}</div>`
      : festival
        ? `<div class="archiveSupport">festival</div>`
        : "";

    const badge = festival ? `<div class="archiveBadge">Festival</div>` : "";

    return `
      <div
        class="row archiveRow archiveRowButton${isSelected ? " is-active" : ""}"
        role="button"
        tabindex="0"
        aria-label="${title}"
        data-archive-image-row="true"
        data-archive-lookup-name="${escapeAttr(lookupName)}"
        data-archive-event-key="${escapeAttr(eventKey)}"
      >
        <div class="archiveRowInner">
          <div class="mid">
            <div class="title archiveTitle">${title}</div>
            ${supportLine}
            <div class="sub archiveMeta">${metaLine}</div>
            <div class="sub archiveVenue">${venueText}</div>
          </div>
          <div class="right archiveRight">${badge}</div>
        </div>
      </div>
    `;
  }

  function renderArchiveTimeline(items) {
    if (!items.length) {
      return cardMessageHTML("No concerts match this selection", "Try another path through the archive.");
    }
    return items.map(renderArchiveRow).join("");
  }

  function renderArchiveDetailModal() {
    return "";
  }

  function renderArchiveView() {
    if (!archiveList) return;

    const filteredItems = getFilteredArchiveItems();
    const statsHtml = renderArchiveStatsPanel(state.archiveStats);
    const exploreHtml = renderArchiveExplore(state.lastArchive, state.archiveStats);
    const rowsHtml = renderArchiveTimeline(filteredItems);
    const modalHtml = renderArchiveDetailModal();

    archiveList.innerHTML = `
      <div class="archiveCanvas">
        ${statsHtml}
        ${exploreHtml}
        <section class="archiveSection">
          <h3 class="archiveSectionTitle">Archive Timeline</h3>
          <div class="archiveTimeline">
            ${rowsHtml}
          </div>
        </section>
      </div>
      ${modalHtml}
    `;

    setupArchiveRowImageEnhancement();
    cleanupArchiveShell();
    document.body.style.overflow = state.archiveSelectedEventKey ? "hidden" : "";
  }

  function normalizeArchiveSupports(s) {
    return String(s || "").split(",").map((x) => x.trim()).filter(Boolean).join(", ");
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

  async function enhanceArchiveRowWithImage(el) {
    if (!el || el.dataset.archiveImageDone === "true") return;

    el.dataset.archiveImageDone = "true";
    const lookupName = normalizeSpace(el.dataset.archiveLookupName || "");
    if (!lookupName) return;

    const imageUrl = await fetchLastfmArtworkImage(lookupName);
    if (!imageUrl) return;

    el.classList.add("archiveRowVisual");
    el.insertAdjacentHTML("afterbegin", `<div class="archiveRowBackdrop" style="background-image:url('${escapeAttr(imageUrl)}');"></div>`);
  }

  function setupArchiveRowImageEnhancement() {
    if (archiveRowImageObserver) {
      archiveRowImageObserver.disconnect();
      archiveRowImageObserver = null;
    }

    const rows = Array.from(document.querySelectorAll('[data-archive-image-row="true"]'));
    if (!rows.length) return;

    if (!("IntersectionObserver" in window)) {
      rows.slice(0, 12).forEach((row) => enhanceArchiveRowWithImage(row));
      return;
    }

    archiveRowImageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        enhanceArchiveRowWithImage(entry.target);
      });
    }, {
      root: null,
      rootMargin: "220px 0px",
      threshold: 0.01
    });

    rows.forEach((row) => archiveRowImageObserver.observe(row));
  }

  function cleanupArchiveShell() {
    if (!archiveList) return;

    const styleId = "lmArchiveShellCleanupCss";
    if (!document.getElementById(styleId)) {
      const st = document.createElement("style");
      st.id = styleId;
      st.textContent = `.lmArchiveShellHidden{display:none !important;}`;
      document.head.appendChild(st);
    }

    const archiveView = $("viewArchive") || archiveList.closest("[data-view='archive']") || archiveList.closest(".view");
    if (!archiveView) return;

    const archiveCard = archiveList.closest(".card");
    if (archiveCard) {
      const cardTitle = archiveCard.querySelector(".card__title");
      if (cardTitle && normalizeSpace(cardTitle.textContent).toLowerCase() === "archive list") {
        cardTitle.classList.add("lmArchiveShellHidden");
      }
    }

    archiveShellCleaned = true;
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

    if (titleNode && titleNode.nextSibling) topCard.insertBefore(wrap, titleNode.nextSibling);
    else topCard.prepend(wrap);

    const styleId = "lmTopControlsCss";
    if (!document.getElementById(styleId)) {
      const st = document.createElement("style");
      st.id = styleId;
      st.textContent = `
        .lmTopBtn,.lmPeriodBtn{
          border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);
          color:rgba(255,255,255,.88);border-radius:999px;padding:8px 12px;
          font:inherit;font-size:13px;cursor:pointer;
        }
        .lmTopBtn.is-active,.lmPeriodBtn.is-active{
          background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.22);color:#fff;
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

  function bindArchiveInteractions() {
    if (!archiveList) return;

    archiveList.addEventListener("input", (e) => {
      const textarea = e.target.closest("[data-archive-note-textarea]");
      if (textarea) state.archiveNoteDraft = textarea.value;
    });

    archiveList.addEventListener("click", (e) => {
      const modeBtn = e.target.closest("[data-archive-filter-mode]");
      if (modeBtn) {
        const nextMode = normalizeSpace(modeBtn.dataset.archiveFilterMode || "all").toLowerCase();

        if (nextMode === "all") {
          state.archiveFilterMode = "all";
          state.archiveFilterValue = "";
          state.archiveYearOlderOpen = false;
          renderArchiveView();
          return;
        }

        state.archiveFilterMode = nextMode;
        if (nextMode !== "year") state.archiveYearOlderOpen = false;

        const nextOptions = getArchiveFilterOptions(nextMode, state.lastArchive, state.archiveStats).filter((x) => x !== "__OLDER_TOGGLE__");
        const currentValue = normalizeSpace(state.archiveFilterValue || "");

        if (!nextOptions.includes(currentValue)) {
          state.archiveFilterValue = nextOptions[0] || "";
        }

        renderArchiveView();
        return;
      }

      const valueBtn = e.target.closest("[data-archive-filter-value]");
      if (valueBtn) {
        const nextValue = normalizeSpace(valueBtn.dataset.archiveFilterValue || "");

        if (state.archiveFilterMode === "year" && nextValue === "__OLDER_TOGGLE__") {
          state.archiveYearOlderOpen = !state.archiveYearOlderOpen;
          renderArchiveView();
          return;
        }

        state.archiveFilterValue = nextValue;

        if (state.archiveFilterMode === "year") {
          const { older } = getArchiveYearOptions(state.lastArchive);
          if (older.includes(nextValue)) state.archiveYearOlderOpen = true;
        }

        renderArchiveView();
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

      if (!recentList?.children.length || recentList.textContent.includes("No data")) await loadRecent();
      if (!topList?.children.length || topList.textContent.includes("No data")) await loadTop();
    });

    tabConcerts?.addEventListener("click", async () => {
      if (!state.concertsLoaded || !state.concertMatchesLoaded) {
        await loadConcerts();
      }
    });

    tabArchive?.addEventListener("click", async () => {
      await loadArchiveList();
    });
  }

  async function loadArchiveList() {
    if (!archiveList) return false;

    try {
      setLoading(archiveList, "Loading…", "Fetching archive concerts…");

      await loadArchiveStats();

      const j = await archiveApiGet(`/concerts?limit=${ARCHIVE_LIMIT_DEFAULT}`);
      const items = Array.isArray(j?.items) ? j.items : [];
      state.lastArchive = items.slice();

      const availableOptions = getArchiveFilterOptions(
        state.archiveFilterMode,
        state.lastArchive,
        state.archiveStats
      ).filter((x) => x !== "__OLDER_TOGGLE__");

      if (state.archiveFilterMode !== "all" && !availableOptions.includes(state.archiveFilterValue)) {
        state.archiveFilterValue = availableOptions[0] || "";
      }

      renderArchiveView();
      return true;
    } catch {
      setError(archiveList, "Couldn’t load Archive.", "Check archive worker / database.");
      return false;
    }
  }

  async function boot() {
    ensureIdentityUi();
    bindIdentityTabs();
    bindArchiveInteractions();
    bindTopPanelControls();
    bindTabPrefetch();

    await Promise.all([
      loadRecent(),
      loadTop(),
      loadConcerts(),
      loadArchiveList()
    ]);

    syncIdentityTabUi();
    cleanupArchiveShell();
  }

  window.__LM_APP__ = {
    getState() {
      return {
        topType: state.topType,
        topPeriod: state.topPeriod,
        identityTab: state.identityTab,
        lastRecent: Array.isArray(state.lastRecent) ? state.lastRecent.slice() : [],
        lastTop: Array.isArray(state.lastTop) ? state.lastTop.slice() : [],
        lastConcerts: Array.isArray(state.lastConcerts) ? state.lastConcerts.slice() : [],
        lastConcertMatches: Array.isArray(state.lastConcertMatches) ? state.lastConcertMatches.slice() : [],
        concertBuckets: state.concertBuckets ? { ...state.concertBuckets } : null,
        concertsLoaded: state.concertsLoaded,
        concertMatchesLoaded: state.concertMatchesLoaded,
        lastArchive: Array.isArray(state.lastArchive) ? state.lastArchive.slice() : [],
        archiveStats: state.archiveStats ? { ...state.archiveStats } : null
      };
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
