/* spotify-player.js
   Spotify Web API playback control using the token from SpotifyAuth.getToken()

   Exposes:
   - SpotifyPlayer.refreshState()
   - SpotifyPlayer.play()
   - SpotifyPlayer.pause()
   - SpotifyPlayer.next()
   - SpotifyPlayer.prev()
   - SpotifyPlayer.playUri(uri)   // play a track/album/playlist URI directly
   - SpotifyPlayer.ensureActiveDevice() // tries to find/activate a device
   - SpotifyPlayer.getDevices()

   Notes:
   - This controls playback on the user's active Spotify Connect device (phone, speaker, desktop etc).
   - If you have no active device, Spotify returns 404 / 403 depending on context.
*/

(() => {
  "use strict";

  const API = "https://api.spotify.com/v1";

  async function apiFetch(path, { method = "GET", body = null, query = null } = {}) {
    const token = window.SpotifyAuth?.getToken?.();
    if (!token) {
      const err = { status: 401, message: "No token provided" };
      throw err;
    }

    let url = API + path;
    if (query) {
      const qs = new URLSearchParams(query);
      url += `?${qs.toString()}`;
    }

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : null
    });

    // Spotify sometimes returns 204 No Content for success
    if (res.status === 204) return null;

    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text || null;
    }

    if (!res.ok) {
      // Normalize error
      const message =
        (data && data.error && (data.error.message || data.error.reason)) ||
        (typeof data === "string" ? data : res.statusText) ||
        "Spotify API error";

      throw { status: res.status, message, raw: data };
    }

    return data;
  }

  async function getDevices() {
    return apiFetch("/me/player/devices");
  }

  async function ensureActiveDevice() {
    // We try:
    // 1) If there is an active device, OK
    // 2) Else, pick the first available device and transfer playback
    //    (requires user-modify-playback-state)
    const devices = await getDevices();
    const list = devices?.devices || [];

    const active = list.find(d => d.is_active);
    if (active) return active;

    const candidate = list.find(d => d.is_restricted === false) || list[0];
    if (!candidate) {
      throw { status: 404, message: "No Spotify devices found. Open Spotify on a device first." };
    }

    // Transfer to candidate (doesn't necessarily auto-play; we can request play: true)
    await apiFetch("/me/player", {
      method: "PUT",
      body: { device_ids: [candidate.id], play: true }
    });

    return candidate;
  }

  async function refreshState() {
    // Returns current playback state
    // NOTE: if nothing is active, Spotify can return 204
    return apiFetch("/me/player");
  }

  async function play() {
    await ensureActiveDevice();
    return apiFetch("/me/player/play", { method: "PUT" });
  }

  async function pause() {
    return apiFetch("/me/player/pause", { method: "PUT" });
  }

  async function next() {
    await ensureActiveDevice();
    return apiFetch("/me/player/next", { method: "POST" });
  }

  async function prev() {
    await ensureActiveDevice();
    return apiFetch("/me/player/previous", { method: "POST" });
  }

  async function playUri(uri) {
    // uri examples:
    // - spotify:track:...
    // - spotify:album:...
    // - spotify:playlist:...
    if (!uri) throw { status: 400, message: "Missing uri" };
    await ensureActiveDevice();

    // For track URI you can also pass { uris: [uri] }
    // For context URI (album/playlist) pass { context_uri: uri }
    const isTrack = uri.startsWith("spotify:track:");
    const body = isTrack ? { uris: [uri] } : { context_uri: uri };

    return apiFetch("/me/player/play", { method: "PUT", body });
  }

  // Small helper: tells if linked
  function isLinked() {
    return !!window.SpotifyAuth?.getToken?.();
  }

  window.SpotifyPlayer = {
    isLinked,
    apiFetch,
    getDevices,
    ensureActiveDevice,
    refreshState,
    play,
    pause,
    next,
    prev,
    playUri
  };
})();