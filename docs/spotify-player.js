/* spotify-player.js
   Uses Spotify Web API to control playback on user's active device.
   Exposes:
     - window.SpotifyPlayer.play(), pause(), next(), prev()
     - window.SpotifyPlayer.playUri(uri)
     - window.SpotifyPlayer.connect()  (just alias to login)
*/

(function(){
  "use strict";

  function token(){
    if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
      return window.SpotifyAuth.getAccessToken();
    }
    return null;
  }

  async function api(path, { method="GET", body=null } = {}) {
    const t = token();
    if (!t) {
      return { ok:false, status:401, json:{ error:{ status:401, message:"No token provided" } } };
    }

    const res = await fetch("https://api.spotify.com/v1" + path, {
      method,
      headers: {
        "Authorization": "Bearer " + t,
        ...(body ? { "Content-Type":"application/json" } : {})
      },
      body: body ? JSON.stringify(body) : null
    });

    const json = await res.json().catch(()=> ({}));
    return { ok: res.ok, status: res.status, json };
  }

  async function play() {
    // resume
    const r = await api("/me/player/play", { method:"PUT" });
    if (!r.ok) console.warn("[SpotifyPlayer.play] failed", r.status, r.json);
    return r;
  }

  async function pause() {
    const r = await api("/me/player/pause", { method:"PUT" });
    if (!r.ok) console.warn("[SpotifyPlayer.pause] failed", r.status, r.json);
    return r;
  }

  async function next() {
    const r = await api("/me/player/next", { method:"POST" });
    if (!r.ok) console.warn("[SpotifyPlayer.next] failed", r.status, r.json);
    return r;
  }

  async function prev() {
    const r = await api("/me/player/previous", { method:"POST" });
    if (!r.ok) console.warn("[SpotifyPlayer.prev] failed", r.status, r.json);
    return r;
  }

  async function playUri(uri) {
    const r = await api("/me/player/play", {
      method:"PUT",
      body: { uris: [uri] }
    });
    if (!r.ok) console.warn("[SpotifyPlayer.playUri] failed", r.status, r.json);
    return r;
  }

  function connect() {
    if (window.SpotifyAuth && typeof window.SpotifyAuth.login === "function") {
      return window.SpotifyAuth.login();
    }
    console.warn("[SpotifyPlayer.connect] SpotifyAuth.login missing");
  }

  window.SpotifyPlayer = { play, pause, next, prev, playUri, connect };
})();