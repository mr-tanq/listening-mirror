/* spotify-player.js
   Spotify playback control via Web API.
   Requires:
     - window.SpotifyAuth.getAccessToken()
     - window.SPOTIFY_RESOLVER_BASE (your Cloudflare Worker base URL)
   Exposes:
     - window.SpotifyPlayer.connect()
     - window.SpotifyPlayer.play()
     - window.SpotifyPlayer.pause()
     - window.SpotifyPlayer.next()
     - window.SpotifyPlayer.prev()
     - window.SpotifyPlayer.playUri(uri)
     - window.SpotifyPlayer.playByMeta({artist, track, album})
*/

(function(){
  "use strict";

  const API = "https://api.spotify.com/v1";

  function getToken(){
    if (!window.SpotifyAuth || typeof window.SpotifyAuth.getAccessToken !== "function") return null;
    return window.SpotifyAuth.getAccessToken();
  }

  async function apiFetch(path, opts = {}){
    const t = gets;
    function T(){ return getToken(); }
    const token = T();
    if (!token) throw new Error("No Spotify token (not linked).");

    const res = await fetch(API + path, {
      ...opts,
      headers: {
        "Authorization": "Bearer " + token,
        ...(opts.headers || {})
      }
    });

    // Some endpoints return 204
    if (res.status === 204) return { ok: true, status: 204, json: null };

    const json = await res.json().catch(()=> null);
    if (!res.ok) {
      const msg = json?.error?.message || ("HTTP " + res.status);
      throw new Error(msg);
    }
    return { ok: true, status: res.status, json };
  }

  async function getPlaybackState(){
    return apiFetch("/me/player", { method: "GET" });
  }

  async function getDevices(){
    return apiFetch("/me/player/devices", { method: "GET" });
  }

  async function pickActiveDeviceId(){
    const d = await getDevices();
    const devices = d.json?.devices || [];
    // prefer active
    const active = devices.find(x => x.is_active);
    if (active) return active.id;

    // otherwise: pick first non-restricted
    const first = devices.find(x => !x.is_restricted) || devices[0];
    return first ? first.id : null;
  }

  async function connect(){
    // “Connect” here just verifies token + finds device
    const token = getToken();
    if (!token) throw new Error("Not linked. Press Connect again after login.");

    const deviceId = await pickActiveDeviceId();
    if (!deviceId) {
      // This usually means Spotify app not open on any device.
      // User action required at least once.
      console.warn("[SpotifyPlayer] No devices found. Open Spotify app once and start any song, then retry.");
      return { ok:false, reason:"no_device" };
    }
    return { ok:true, deviceId };
  }

  async function play(){
    const c = await connect();
    if (!c.ok) return c;
    await apiFetch(`/me/player/play?device_id=${encodeURIComponent(c.deviceId)}`, { method: "PUT" });
    return { ok:true };
  }

  async function pause(){
    const c = await connect();
    if (!c.ok) return c;
    await apiFetch(`/me/player/pause?device_id=${encodeURIComponent(c.deviceId)}`, { method: "PUT" });
    return { ok:true };
  }

  async function next(){
    const c = await connect();
    if (!c.ok) return c;
    await apiFetch(`/me/player/next?device_id=${encodeURIComponent(c.deviceId)}`, { method: "POST" });
    return { ok:true };
  }

  async function prev(){
    const c = await connect();
    if (!c.ok) return c;
    await apiFetch(`/me/player/previous?device_id=${encodeURIComponent(c.deviceId)}`, { method: "POST" });
    return { ok:true };
  }

  async function playUri(uri){
    if (!uri) throw new Error("Missing uri");
    const c = await connect();
    if (!c.ok) return c;

    const body = JSON.stringify({ uris: [uri] });
    await apiFetch(`/me/player/play?device_id=${encodeURIComponent(c.deviceId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body
    });
    return { ok:true };
  }

  async function resolveUriViaWorker(meta){
    const base = (window.SPOTIFY_RESOLVER_BASE || "").replace(/\/+$/,"");
    if (!base || base.includes("YOUR-WORKER-URL")) {
      throw new Error("Missing window.SPOTIFY_RESOLVER_BASE in index.html");
    }

    const artist = (meta?.artist || "").trim();
    const track  = (meta?.track  || "").trim();
    const album  = (meta?.album  || "").trim();

    if (!artist || !track) throw new Error("resolve: need artist + track");

    const u = new URL(base + "/resolve");
    u.searchParams.set("artist", artist);
    u.searchParams.set("track", track);
    if (album) u.searchParams.set("album", album);

    const res = await fetch(u.toString(), { method: "GET" });
    const json = await res.json().catch(()=> ({}));
    if (!res.ok || !json?.ok) {
      const msg = json?.error || ("resolve failed " + res.status);
      throw new Error(msg);
    }
    if (!json.uri) throw new Error("resolve: no uri");
    return json;
  }

  async function playByMeta(meta){
    const r = await resolveUriViaWorker(meta);
    return playUri(r.uri);
  }

  // Optional: allow other code to call this on row click
  window.SpotifyPlayer = {
    connect,
    play,
    pause,
    next,
    prev,
    playUri,
    playByMeta,
    getPlaybackState
  };
})();