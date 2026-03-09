/* spotify-player.js (FULL FILE REPLACE) — PART 1/3
   Listening Mirror — Spotify playback + live state bridge
   Exposes window.SpotifyPlayer with:
     - play()
     - pause()
     - togglePlay()
     - next()
     - prev()
     - seek(ms)
     - playUri(uri)
     - refresh()
     - getState()
     - subscribe(fn)
     - getAccessToken()
*/

(function () {
  "use strict";

  const API = "https://api.spotify.com/v1";
  const POLL_MS_ACTIVE = 1500;
  const POLL_MS_IDLE = 4000;

  const listeners = new Set();

  let lastState = {
    is_ready: false,
    is_linked: false,
    is_playing: false,
    progress_ms: 0,
    duration_ms: 0,
    device_id: null,
    device_name: "",
    track_id: "",
    track_name: "",
    artist_name: "",
    album_name: "",
    album_image: "",
    uri: "",
    shuffle_state: false,
    repeat_state: "off",
    raw: null
  };

  let pollTimer = 0;

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function emitStatus(text) {
    try {
      window.dispatchEvent(new CustomEvent("spotify:status", {
        detail: { text: String(text || "") }
      }));
    } catch {}
  }

  function emitState(state) {
    const snapshot = clone(state);
    try {
      window.dispatchEvent(new CustomEvent("spotify:state", {
        detail: snapshot
      }));
    } catch {}

    listeners.forEach((fn) => {
      try { fn(snapshot); } catch {}
    });
  }

  function setState(next) {
    lastState = {
      ...lastState,
      ...next
    };
    emitState(lastState);
  }

  function getToken() {
    if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
      return window.SpotifyAuth.getAccessToken();
    }
    return null;
  }

  function formatSpotifyState(playerJson) {
    const item = playerJson?.item || null;
    const artists = Array.isArray(item?.artists) ? item.artists.map(a => a?.name).filter(Boolean) : [];
    const image = item?.album?.images?.[0]?.url || "";

    return {
      is_ready: true,
      is_linked: !!getToken(),
      is_playing: !!playerJson?.is_playing,
      progress_ms: Number(playerJson?.progress_ms || 0),
      duration_ms: Number(item?.duration_ms || 0),
      device_id: playerJson?.device?.id || null,
      device_name: playerJson?.device?.name || "",
      track_id: item?.id || "",
      track_name: item?.name || "",
      artist_name: artists.join(", "),
      album_name: item?.album?.name || "",
      album_image: image,
      uri: item?.uri || "",
      shuffle_state: !!playerJson?.shuffle_state,
      repeat_state: playerJson?.repeat_state || "off",
      raw: playerJson || null
    };
  }

  async function apiFetch(path, { method = "GET", qs = null, body = null } = {}) {
    const token = getToken();
    if (!token) {
      setState({
        is_ready: false,
        is_linked: false
      });
      emitStatus("Spotify: not linked");
      throw new Error("No token provided");
    }

    const url = new URL(API + path);
    if (qs && typeof qs === "object") {
      for (const [k, v] of Object.entries(qs)) {
        if (v != null && v !== "") url.searchParams.set(k, String(v));
      }
    }

    const headers = { Authorization: "Bearer " + token };
    let payload = undefined;

    if (body != null) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: payload
    });

    if (res.status === 204) return { ok: true, status: 204, json: null };

    let json = null;
    try { json = await res.json(); } catch { json = null; }

    if (!res.ok) {
      if (res.status === 401) {
        setState({ is_ready: false, is_linked: false });
        emitStatus("Spotify: token expired");
      }
      if (res.status === 403) emitStatus("Spotify: forbidden");
      if (res.status === 404) emitStatus("Spotify: no active device");
      throw new Error(json?.error?.message || `Spotify HTTP ${res.status}`);
    }

    return { ok: true, status: res.status, json };
  }

  async function getDevices() {
    const r = await apiFetch("/me/player/devices");
    return r.json?.devices || [];
  }

  async function pickDeviceId() {
    const devices = await getDevices();
    if (!devices.length) return null;

    const active = devices.find(d => d && d.is_active);
    if (active?.id) return active.id;

    const first = devices.find(d => d && d.id);
    return first?.id || null;
  }

  async function ensurePlaybackDevice() {
    const deviceId = await pickDeviceId();
    if (!deviceId) {
      setState({
        is_ready: false,
        device_id: null,
        device_name: ""
      });
      emitStatus("Spotify: open Spotify on phone");
      throw new Error("No Spotify device available");
    }

    await apiFetch("/me/player", {
      method: "PUT",
      body: { device_ids: [deviceId], play: false }
    });

    return deviceId;
  }
   async function refresh() {
    const token = getToken();
    if (!token) {
      setState({
        is_ready: false,
        is_linked: false,
        is_playing: false,
        progress_ms: 0,
        duration_ms: 0,
        device_id: null,
        device_name: "",
        track_id: "",
        track_name: "",
        artist_name: "",
        album_name: "",
        album_image: "",
        uri: "",
        raw: null
      });
      return clone(lastState);
    }

    try {
      const r = await apiFetch("/me/player");
      if (r.status === 204 || !r.json) {
        setState({
          is_ready: true,
          is_linked: true,
          is_playing: false,
          progress_ms: 0,
          duration_ms: 0,
          track_id: "",
          track_name: "",
          artist_name: "",
          album_name: "",
          album_image: "",
          uri: "",
          raw: null
        });
        return clone(lastState);
      }

      setState(formatSpotifyState(r.json));
      return clone(lastState);
    } catch (err) {
      emitStatus(`Spotify: ${String(err.message || err)}`);
      return clone(lastState);
    }
  }

  function startPolling() {
    stopPolling();

    const tick = async () => {
      await refresh();
      const interval = lastState.is_playing ? POLL_MS_ACTIVE : POLL_MS_IDLE;
      pollTimer = window.setTimeout(tick, interval);
    };

    tick();
  }

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = 0;
    }
  }

  async function play() {
    emitStatus("Spotify: play…");
    const deviceId = await ensurePlaybackDevice();
    await apiFetch("/me/player/play", {
      method: "PUT",
      qs: { device_id: deviceId }
    });
    await refresh();
    emitStatus("Spotify: playing");
    return true;
  }

  async function pause() {
    emitStatus("Spotify: pause…");
    const deviceId = await ensurePlaybackDevice();
    await apiFetch("/me/player/pause", {
      method: "PUT",
      qs: { device_id: deviceId }
    });
    await refresh();
    emitStatus("Spotify: paused");
    return true;
  }

  async function togglePlay() {
    const state = await refresh();
    if (state.is_playing) return pause();
    return play();
  }

  async function next() {
    emitStatus("Spotify: next…");
    const deviceId = await ensurePlaybackDevice();
    await apiFetch("/me/player/next", {
      method: "POST",
      qs: { device_id: deviceId }
    });
    await refresh();
    emitStatus("Spotify: ok");
    return true;
  }

  async function prev() {
    emitStatus("Spotify: previous…");
    const deviceId = await ensurePlaybackDevice();
    await apiFetch("/me/player/previous", {
      method: "POST",
      qs: { device_id: deviceId }
    });
    await refresh();
    emitStatus("Spotify: ok");
    return true;
  }

  async function seek(ms) {
    const target = Math.max(0, Number(ms || 0) | 0);
    const deviceId = await ensurePlaybackDevice();
    await apiFetch("/me/player/seek", {
      method: "PUT",
      qs: {
        position_ms: target,
        device_id: deviceId
      }
    });
    setState({ progress_ms: target });
    emitStatus("Spotify: seek");
    return true;
  }

  async function playUri(uri) {
    if (!uri) throw new Error("Missing uri");

    emitStatus("Spotify: play track…");
    const deviceId = await ensurePlaybackDevice();

    await apiFetch("/me/player/play", {
      method: "PUT",
      qs: { device_id: deviceId },
      body: { uris: [uri] }
    });

    await refresh();
    emitStatus("Spotify: playing");
    return true;
  }

  function getState() {
    return clone(lastState);
  }

  function subscribe(fn) {
    if (typeof fn !== "function") {
      return () => {};
    }

    listeners.add(fn);

    try { fn(clone(lastState)); } catch {}

    return () => {
      listeners.delete(fn);
    };
  }
   function connect() {
    startPolling();
    return Promise.resolve(true);
  }

  function disconnect() {
    stopPolling();
    return Promise.resolve(true);
  }

  window.SpotifyPlayer = {
    play,
    pause,
    togglePlay,
    next,
    prev,
    seek,
    playUri,
    refresh,
    getState,
    subscribe,
    connect,
    disconnect,
    getAccessToken: getToken
  };

  window.addEventListener("focus", () => {
    safeCall(() => refresh());
  });

  window.addEventListener("spotify:auth-changed", () => {
    safeCall(() => refresh());
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      safeCall(() => refresh());
    }
  });

  startPolling();
})();
