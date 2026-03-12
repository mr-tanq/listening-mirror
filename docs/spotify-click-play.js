/* spotify-click-play.js (FULL FILE REPLACE)
   Artwork-only click-to-play for Identity lists
   Frontend-only resolver version (no Cloudflare worker)
   ✅ Only artwork click triggers playback
   ✅ Recent / Top Tracks => direct track play
   ✅ Top Artists => resolves artist top track
   ✅ Top Albums => resolves album first track
   ✅ URI caching on row dataset
   ✅ Active / busy / error visuals
*/

(function () {
  "use strict";

  const BUSY_CLASS = "is-play-busy";
  const ERROR_CLASS = "is-play-error";
  const ACTIVE_CLASS = "is-play-active";

  function injectStyles() {
    const id = "spotifyClickPlayCssV3";
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

  function normalizeText(s) {
    return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function normalizeLoose(s) {
    return normalizeText(s)
      .replace(/[()[\]{}]/g, " ")
      .replace(/\b(remaster(ed)?|radio edit|mono|stereo|live|version|deluxe|explicit)\b/g, " ")
      .replace(/[^a-z0-9\u00C0-\u024F\s&'+.-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getSpotifyToken() {
    if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
      return window.SpotifyAuth.getAccessToken();
    }
    if (window.SpotifyPlayer && typeof window.SpotifyPlayer.getAccessToken === "function") {
      return window.SpotifyPlayer.getAccessToken();
    }
    return null;
  }

  async function spotifyApi(path, params) {
    const token = getSpotifyToken();
    if (!token) throw new Error("Missing Spotify access token.");

    const url = new URL("https://api.spotify.com/v1" + path);
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params)) {
        if (v != null && v !== "") {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error?.message || `Spotify API ${res.status}`);
    }
    return json;
  }

  function findMediaRow(target) {
    return target?.closest?.('[data-media-item="true"]') || null;
  }

  function findArtworkButton(target) {
    return target?.closest?.('[data-play-artwork="true"]') || null;
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

  function scoreTrackCandidate(candidate, wantedArtist, wantedTrack) {
    const candTrack = normalizeLoose(candidate?.name || "");
    const candArtists = Array.isArray(candidate?.artists)
      ? candidate.artists.map((a) => normalizeLoose(a?.name || "")).join(" | ")
      : normalizeLoose(candidate?.artist || "");

    const artistNeedle = normalizeLoose(wantedArtist);
    const trackNeedle = normalizeLoose(wantedTrack);

    let score = 0;

    if (candTrack === trackNeedle) score += 120;
    else if (candTrack.includes(trackNeedle) || trackNeedle.includes(candTrack)) score += 70;

    if (candArtists.includes(artistNeedle)) score += 90;

    if (candidate?.popularity != null) {
      score += Math.min(40, Number(candidate.popularity) / 2);
    }

    if (candidate?.is_playable === false) score -= 200;

    return score;
  }

  function chooseBestTrack(items, artist, track) {
    if (!Array.isArray(items) || !items.length) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const item of items) {
      const score = scoreTrackCandidate(item, artist, track);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }

    return best;
  }

  async function searchTrack(artist, track) {
    const q = `track:${track} artist:${artist}`;
    const data = await spotifyApi("/search", {
      q,
      type: "track",
      limit: "8"
    });

    const items = data?.tracks?.items || [];
    return chooseBestTrack(items, artist, track);
  }

  async function searchArtistByName(artistName) {
    const data = await spotifyApi("/search", {
      q: artistName,
      type: "artist",
      limit: "5"
    });

    const items = data?.artists?.items || [];
    if (!items.length) return null;

    const wanted = normalizeLoose(artistName);

    let best = null;
    let bestScore = -Infinity;

    for (const item of items) {
      const name = normalizeLoose(item?.name || "");
      let score = 0;

      if (name === wanted) score += 100;
      else if (name.includes(wanted) || wanted.includes(name)) score += 60;

      if (item?.popularity != null) {
        score += Math.min(40, Number(item.popularity) / 2);
      }

      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }

    return best;
  }

  async function searchAlbum(artistName, albumName) {
    const q = `album:${albumName} artist:${artistName}`;
    const data = await spotifyApi("/search", {
      q,
      type: "album",
      limit: "8"
    });

    const items = data?.albums?.items || [];
    if (!items.length) return null;

    const wantedAlbum = normalizeLoose(albumName);
    const wantedArtist = normalizeLoose(artistName);

    let best = null;
    let bestScore = -Infinity;

    for (const item of items) {
      const album = normalizeLoose(item?.name || "");
      const artists = Array.isArray(item?.artists)
        ? item.artists.map((a) => normalizeLoose(a?.name || "")).join(" | ")
        : "";

      let score = 0;
      if (album === wantedAlbum) score += 110;
      else if (album.includes(wantedAlbum) || wantedAlbum.includes(album)) score += 70;

      if (artists.includes(wantedArtist)) score += 90;

      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }

    return best;
  }

  function getSpotifyIdFromUri(uri, expectedType = "") {
    const text = String(uri || "").trim();
    const m = text.match(/^spotify:(artist|album|track):([A-Za-z0-9]+)$/);
    if (!m) return "";
    if (expectedType && m[1] !== expectedType) return "";
    return m[2] || "";
  }

  async function getArtistTopTrack(data) {
    let artistId = getSpotifyIdFromUri(data.spotifyArtistUri, "artist");

    if (!artistId) {
      const artist = await searchArtistByName(data.artist || data.title);
      if (!artist?.id) return null;
      artistId = artist.id;
    }

    const result = await spotifyApi(`/artists/${artistId}/top-tracks`);
    const tracks = Array.isArray(result?.tracks) ? result.tracks : [];
    if (!tracks.length) return null;

    const playable = tracks.find((t) => t?.uri && t?.is_playable !== false);
    return playable || tracks[0] || null;
  }

  async function getAlbumFirstTrack(data) {
    let albumId = getSpotifyIdFromUri(data.spotifyAlbumUri, "album");

    if (!albumId) {
      const album = await searchAlbum(data.artist, data.album || data.title);
      if (!album?.id) return null;
      albumId = album.id;
    }

    const result = await spotifyApi(`/albums/${albumId}/tracks`, {
      limit: "50"
    });

    const tracks = Array.isArray(result?.items) ? result.items : [];
    if (!tracks.length) return null;

    const firstPlayable = tracks.find((t) => t?.uri);
    return firstPlayable || tracks[0] || null;
  }

  async function resolveTrackUri(data) {
    const direct = pickPlayableUri(data);
    if (direct) return direct;

    if (data.itemType === "track") {
      const best = await searchTrack(data.artist, data.title);
      if (best?.uri) return best.uri;
      throw new Error(`No match for track: ${data.artist} - ${data.title}`);
    }

    if (data.itemType === "artist") {
      const topTrack = await getArtistTopTrack(data);
      if (topTrack?.uri) return topTrack.uri;
      throw new Error(`No top song match for artist: ${data.artist || data.title}`);
    }

    if (data.itemType === "album") {
      const albumTrack = await getAlbumFirstTrack(data);
      if (albumTrack?.uri) return albumTrack.uri;
      throw new Error(`No playable track found for album: ${data.artist} - ${data.album || data.title}`);
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

    let state = null;
    if (typeof p.getState === "function") {
      try {
        state = p.getState();
      } catch {}
    }

    if (state) {
      return {
        uri: state.uri || "",
        title: normalizeText(state.track_name || state.name || ""),
        artist: normalizeText(state.artist_name || state.artist || "")
      };
    }

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
