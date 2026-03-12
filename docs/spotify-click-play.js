/* spotify-click-play.js (FULL FILE REPLACE) — PART 1/2
   Artwork-only click-to-play for Identity lists
   ✅ Only artwork click triggers playback
   ✅ Recent / Top Tracks => direct track play
   ✅ Top Artists => tries to resolve top song
   ✅ Future-ready for album items => tries to resolve top song
   ✅ Best-effort resolver strategy + URI caching
*/

(function () {
  "use strict";

  const RESOLVER_BASE = (window.SPOTIFY_RESOLVER_BASE || "").replace(/\/+$/, "");
  const BUSY_CLASS = "is-play-busy";
  const ERROR_CLASS = "is-play-error";
  const ACTIVE_CLASS = "is-play-active";

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function injectStyles() {
    const id = "spotifyClickPlayCssV2";
    if (document.getElementById(id)) return;

    const st = document.createElement("style");
    st.id = id;
    st.textContent = `
      .thumbButton{
        position:relative;
        overflow:hidden;
      }
      .thumbButton .thumbOverlay{
        opacity:0;
        transition:opacity .18s ease, background .18s ease;
      }
      .thumbButton:hover .thumbOverlay,
      .thumbButton:focus-visible .thumbOverlay{
        opacity:1;
      }
      .mediaRow.${BUSY_CLASS} .thumbOverlay{
        opacity:1 !important;
        background:rgba(0,0,0,.46);
      }
      .mediaRow.${BUSY_CLASS} .thumbPlayIcon{
        animation:lmThumbPulse 1s ease-in-out infinite;
      }
      .mediaRow.${ACTIVE_CLASS} .thumb{
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.04),
          0 0 0 1px rgba(255,255,255,.14),
          0 0 18px rgba(120,190,255,.18),
          0 6px 18px rgba(0,0,0,.12);
      }
      .mediaRow.${ACTIVE_CLASS} .thumbOverlay{
        opacity:1;
        background:rgba(0,0,0,.22);
      }
      .mediaRow.${ACTIVE_CLASS} .thumbPlayIcon{
        background:rgba(122,215,255,.95);
      }
      .mediaRow.${ERROR_CLASS} .thumb{
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.04),
          0 0 0 1px rgba(255,120,120,.18),
          0 0 16px rgba(255,90,90,.10),
          0 6px 18px rgba(0,0,0,.12);
      }
      @keyframes lmThumbPulse{
        0%,100%{ transform:scale(1); }
        50%{ transform:scale(1.08); }
      }
    `;
    document.head.appendChild(st);
  }

  function findMediaRow(target) {
    return target?.closest?.('[data-media-item="true"]') || null;
  }

  function findArtworkButton(target) {
    return target?.closest?.('[data-play-artwork="true"]') || null;
  }

  function normalizeText(s) {
    return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function rowData(row) {
    const d = row?.dataset || {};
    return {
      itemType: d.itemType || "track",
      playMode: d.playMode || "direct",
      title: d.title || "",
      artist: d.artist || "",
      album: d.album || "",
      playable: d.playable !== "false",
      spotifyUri: d.spotifyUri || "",
      spotifyTrackUri: d.spotifyTrackUri || "",
      spotifyArtistUri: d.spotifyArtistUri || "",
      spotifyAlbumUri: d.spotifyAlbumUri || "",
      cacheKey: d.cacheKey || ""
    };
  }

  function setRowBusy(row, busy) {
    if (!row) return;
    row.classList.toggle(BUSY_CLASS, !!busy);
    const btn = row.querySelector('[data-play-artwork="true"]');
    if (btn) btn.disabled = !!busy;
  }

  function setRowError(row, on) {
    if (!row) return;
    row.classList.toggle(ERROR_CLASS, !!on);
    if (on) {
      window.setTimeout(() => row.classList.remove(ERROR_CLASS), 1500);
    }
  }

  function clearActiveRows() {
    document.querySelectorAll(`.mediaRow.${ACTIVE_CLASS}`).forEach((row) => {
      row.classList.remove(ACTIVE_CLASS);
    });
  }

  function setRowActive(row) {
    clearActiveRows();
    if (row) row.classList.add(ACTIVE_CLASS);
  }

  function pickPlayableUri(data) {
    if (data.spotifyTrackUri) return data.spotifyTrackUri;
    if (data.itemType === "track" && data.spotifyUri) return data.spotifyUri;
    return "";
  }

  async function ensureSpotifyReady() {
    if (!window.SpotifyPlayer || typeof window.SpotifyPlayer.playUri !== "function") {
      throw new Error("SpotifyPlayer not available.");
    }

    if (typeof window.SpotifyPlayer.connect === "function") {
      await window.SpotifyPlayer.connect();
    }
  }

  async function fetchJson(url) {
    const res = await fetch(url, { method: "GET" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Resolver ${res.status}: ${JSON.stringify(json)}`);
    }
    return json;
  }

  async function tryResolver(path, params) {
    if (!RESOLVER_BASE) return null;

    const u = new URL(RESOLVER_BASE + path);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value != null && value !== "") u.searchParams.set(key, String(value));
    });

    const json = await fetchJson(u.toString()).catch(() => null);
    if (!json) return null;

    return (
      json.uri ||
      json.track_uri ||
      json.spotify_uri ||
      (json.item && (json.item.uri || json.item.track_uri)) ||
      null
    );
  }

  async function resolveTrackUri(data) {
    if (!RESOLVER_BASE) {
      throw new Error("Missing RESOLVER_BASE (window.SPOTIFY_RESOLVER_BASE).");
    }

    const direct = pickPlayableUri(data);
    if (direct) return direct;

    if (data.itemType === "track") {
      const uri =
        await tryResolver("/resolve", {
          artist: data.artist,
          track: data.title
        }) ||
        await tryResolver("/resolve-track", {
          artist: data.artist,
          track: data.title
        });

      if (uri) return uri;
      throw new Error(`No match for track: ${data.artist} - ${data.title}`);
    }

    if (data.itemType === "artist") {
      const uri =
        await tryResolver("/resolve-top-track", {
          type: "artist",
          artist: data.artist || data.title,
          artist_uri: data.spotifyArtistUri
        }) ||
        await tryResolver("/resolve", {
          mode: "artist-top-track",
          type: "artist",
          artist: data.artist || data.title,
          artist_uri: data.spotifyArtistUri
        });

      if (uri) return uri;
      throw new Error(`No top song match for artist: ${data.artist || data.title}`);
    }
     /* spotify-click-play.js (FULL FILE REPLACE) — PART 2/2 */

    if (data.itemType === "album") {
      const uri =
        await tryResolver("/resolve-top-track", {
          type: "album",
          artist: data.artist,
          album: data.album || data.title,
          album_uri: data.spotifyAlbumUri
        }) ||
        await tryResolver("/resolve", {
          mode: "album-top-track",
          type: "album",
          artist: data.artist,
          album: data.album || data.title,
          album_uri: data.spotifyAlbumUri
        });

      if (uri) return uri;
      throw new Error(`No top song match for album: ${data.artist} - ${data.album || data.title}`);
    }

    throw new Error(`Unsupported item type: ${data.itemType}`);
  }

  function cacheResolvedUri(row, data, uri) {
    if (!row || !uri) return;

    row.dataset.spotifyTrackUri = uri;

    if (data.itemType === "track") {
      row.dataset.spotifyUri = uri;
    }
  }

  async function handleArtworkClick(e) {
    const artworkBtn = findArtworkButton(e.target);
    if (!artworkBtn) return;

    const row = findMediaRow(artworkBtn);
    if (!row) return;

    e.preventDefault();
    e.stopPropagation();

    const data = rowData(row);
    if (!data.playable) return;

    try {
      setRowError(row, false);
      setRowBusy(row, true);

      await ensureSpotifyReady();

      const uri = await resolveTrackUri(data);
      cacheResolvedUri(row, data, uri);

      await window.SpotifyPlayer.playUri(uri);
      setRowActive(row);
    } catch (err) {
      console.error("[ClickPlay] play failed:", err);
      setRowError(row, true);
    } finally {
      setRowBusy(row, false);
    }
  }

  function bindDelegatedClick() {
    document.addEventListener("click", handleArtworkClick, { passive: false });
  }

  function currentTrackSnapshot() {
    const p = window.SpotifyPlayer;
    if (!p) return null;

    const track =
      (typeof p.getCurrentTrack === "function" && p.getCurrentTrack()) ||
      p.currentTrack ||
      p.state?.track ||
      p._currentTrack ||
      null;

    if (!track) return null;

    return {
      uri: track.uri || track.spotify_uri || "",
      title: normalizeText(track.name || track.title || ""),
      artist: normalizeText(
        Array.isArray(track.artists)
          ? (track.artists[0]?.name || "")
          : (track.artist || "")
      )
    };
  }

  function syncActiveFromCurrentTrack() {
    const snap = currentTrackSnapshot();
    if (!snap) return;

    let matched = null;

    document.querySelectorAll('[data-media-item="true"]').forEach((row) => {
      const data = rowData(row);

      const rowUri = data.spotifyTrackUri || data.spotifyUri || "";
      const rowTitle = normalizeText(data.title);
      const rowArtist = normalizeText(data.artist);

      const uriMatch = snap.uri && rowUri && snap.uri === rowUri;
      const textMatch =
        data.itemType === "track" &&
        snap.title &&
        snap.artist &&
        rowTitle === snap.title &&
        rowArtist === snap.artist;

      if (uriMatch || textMatch) {
        matched = row;
      }
    });

    clearActiveRows();
    if (matched) matched.classList.add(ACTIVE_CLASS);
  }

  function boot() {
    injectStyles();
    bindDelegatedClick();

    window.setInterval(syncActiveFromCurrentTrack, 2500);
    window.setTimeout(syncActiveFromCurrentTrack, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
