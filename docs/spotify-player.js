/* spotify-player.js (FULL REPLACE)
   Spotify Web API controller for playback (phone as device).
   Exposes window.SpotifyPlayer with:
     - play(), pause(), next(), prev()
     - playUri(uri)  // (optional for later)
*/

(function(){
  "use strict";

  const API = "https://api.spotify.com/v1";

  function getToken(){
    if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
      return window.SpotifyAuth.getAccessToken();
    }
    return null;
  }

  function emitStatus(text){
    try {
      window.dispatchEvent(new CustomEvent("spotify:status", { detail: { text } }));
    } catch {}
  }

  async function apiFetch(path, { method="GET", qs=null, body=null } = {}) {
    const token = getToken();
    if (!token) {
      emitStatus("Spotify: not linked");
      throw new Error("No token provided");
    }

    const url = new URL(API + path);
    if (qs && typeof qs === "object") {
      for (const [k,v] of Object.entries(qs)) {
        if (v != null && v !== "") url.searchParams.set(k, String(v));
      }
    }

    const headers = { "Authorization": "Bearer " + token };
    let payload = undefined;

    if (body != null) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    const res = await fetch(url.toString(), { method, headers, body: payload });

    // 204 = No Content is common for playback endpoints
    if (res.status === 204) return { ok: true, status: 204, json: null };

    let json = null;
    try { json = await res.json(); } catch { json = null; }

    if (!res.ok) {
      // Helpful statuses
      if (res.status === 401) emitStatus("Spotify: token expired (tap glyph)");
      if (res.status === 403) emitStatus("Spotify: forbidden (check scopes)");
      if (res.status === 404) emitStatus("Spotify: no active device (open Spotify on phone)");
      throw new Error(json?.error?.message || `Spotify HTTP ${res.status}`);
    }

    return { ok: true, status: res.status, json };
  }

  async function getDevices(){
    const r = await apiFetch("/me/player/devices");
    const devices = r.json?.devices || [];
    return devices;
  }

  async function pickDeviceId(){
    const devices = await getDevices();
    if (!devices.length) return null;

    // Prefer active device (usually your phone if Spotify is open)
    const active = devices.find(d => d && d.is_active);
    if (active?.id) return active.id;

    // Else: take first device
    const first = devices.find(d => d && d.id);
    return first?.id || null;
  }

  async function ensurePlaybackDevice(){
    const deviceId = await pickDeviceId();
    if (!deviceId) {
      emitStatus("Spotify: open Spotify on phone");
      throw new Error("No Spotify device available");
    }

    // Transfer playback to that device (does not auto-play)
    await apiFetch("/me/player", {
      method: "PUT",
      body: { device_ids: [deviceId], play: false }
    });

    return deviceId;
  }

  async function play() {
    emitStatus("Spotify: play…");
    const deviceId = await ensurePlaybackDevice();
    await apiFetch("/me/player/play", { method: "PUT", qs: { device_id: deviceId } });
    emitStatus("Spotify: playing");
  }

  async function pause() {
    emitStatus("Spotify: pause…");
    const deviceId = await ensurePlaybackDevice();
    await apiFetch("/me/player/pause", { method: "PUT", qs: { device_id: deviceId } });
    emitStatus("Spotify: paused");
  }

  async function next() {
    emitStatus("Spotify: next…");
    const deviceId = await ensurePlaybackDevice();
    await apiFetch("/me/player/next", { method: "POST", qs: { device_id: deviceId } });
    emitStatus("Spotify: ok");
  }

  async function prev() {
    emitStatus("Spotify: prev…");
    const deviceId = await ensurePlaybackDevice();
    await apiFetch("/me/player/previous", { method: "POST", qs: { device_id: deviceId } });
    emitStatus("Spotify: ok");
  }

  // Optional (for later when we wire click-to-play from Top/Recent)
  async function playUri(uri) {
    if (!uri) throw new Error("Missing uri");
    emitStatus("Spotify: play track…");
    const deviceId = await ensurePlaybackDevice();
    await apiFetch("/me/player/play", {
      method: "PUT",
      qs: { device_id: deviceId },
      body: { uris: [uri] }
    });
    emitStatus("Spotify: playing");
  }

  window.SpotifyPlayer = {
    play,
    pause,
    next,
    prev,
    playUri,
    getAccessToken: getToken
  };
})();