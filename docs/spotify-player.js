/* spotify-player.js
   Spotify Web Playback SDK driver + Web API commands.
   Requires:
     - <script src="https://sdk.scdn.co/spotify-player.js"></script> in index.html
     - spotify-auth.js loaded before this
   Exposes:
     - window.SpotifyPlayer.connect()
     - window.SpotifyPlayer.play()
     - window.SpotifyPlayer.pause()
     - window.SpotifyPlayer.next()
     - window.SpotifyPlayer.prev()
     - window.SpotifyPlayer.playUri(uri)
     - window.SpotifyPlayer.getDeviceId()
*/

(function(){
  "use strict";

  const API = "https://api.spotify.com/v1";
  const DEVICE_NAME = "Listening Mirror";

  let player = null;
  let deviceId = null;
  let ready = false;

  function token(){
    if (!window.SpotifyAuth || typeof window.SpotifyAuth.getAccessToken !== "function") return null;
    return window.SpotifyAuth.getAccessToken();
  }

  async function apiFetch(path, opts = {}){
    const t = token();
    if (!t) throw new Error("No token (Spotify not linked)");

    const res = await fetch(API + path, {
      ...opts,
      headers: {
        "Authorization": "Bearer " + t,
        ...(opts.headers || {})
      }
    });

    if (res.status === 204) return null;
    const json = await res.json().catch(()=> ({}));
    if (!res.ok) {
      throw new Error(`Spotify API ${res.status}: ${JSON.stringify(json)}`);
    }
    return json;
  }

  async function transferPlaybackToWebDevice(){
    if (!deviceId) throw new Error("No deviceId yet");

    await apiFetch("/me/player", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_ids: [deviceId],
        play: false
      })
    });
  }
function ensureSdkLoaded(){
    return new Promise((resolve, reject) => {
      if (window.Spotify && window.Spotify.Player) return resolve();
      // Spotify SDK calls this when loaded
      window.onSpotifyWebPlaybackSDKReady = () => resolve();
      // safety timeout
      setTimeout(() => {
        if (window.Spotify && window.Spotify.Player) resolve();
        else reject(new Error("Spotify Web Playback SDK not loaded. Did you add https://sdk.scdn.co/spotify-player.js ?"));
      }, 6000);
    });
  }

  async function connect(){
    const t = token();
    if (!t) throw new Error("Not linked. Call SpotifyAuth.login() first.");

    await ensureSdkLoaded();

    if (player) {
      // already created
      const ok = await player.connect();
      return ok;
    }

    player = new window.Spotify.Player({
      name: DEVICE_NAME,
      getOAuthToken: cb => cb(token()),
      volume: 0.85
    });

    player.addListener("ready", async ({ device_id }) => {
      deviceId = device_id;
      ready = true;
      console.log("[SpotifyPlayer] ready deviceId:", deviceId);

      try {
        await transferPlaybackToWebDevice();
        console.log("[SpotifyPlayer] transferred playback to web device");
      } catch (e) {
        console.warn("[SpotifyPlayer] transfer playback failed:", e);
      }
    });

    player.addListener("not_ready", ({ device_id }) => {
      console.log("[SpotifyPlayer] not_ready:", device_id);
      if (deviceId === device_id) {
        deviceId = null;
        ready = false;
      }
    });

    player.addListener("initialization_error", ({ message }) => console.error("[SpotifyPlayer] init error", message));
    player.addListener("authentication_error", ({ message }) => console.error("[SpotifyPlayer] auth error", message));
    player.addListener("account_error", ({ message }) => console.error("[SpotifyPlayer] account error", message));
    player.addListener("playback_error", ({ message }) => console.error("[SpotifyPlayer] playback error", message));

    const ok = await player.connect();
    return ok;
  }

  async function play(){
    if (player) return player.resume();
    // fallback: try Web API play on active device
    return apiFetch("/me/player/play", { method:"PUT" });
  }

  async function pause(){
    if (player) return player.pause();
    return apiFetch("/me/player/pause", { method:"PUT" });
  }

  async function next(){
    if (player) return player.nextTrack();
    return apiFetch("/me/player/next", { method:"POST" });
  }

  async function prev(){
    if (player) return player.previousTrack();
    return apiFetch("/me/player/previous", { method:"POST" });
  }
async function playUri(uri){
    // uri can be: "spotify:track:...." or "spotify:album:..." etc.
    if (!uri) throw new Error("Missing uri");

    // ensure device exists and is active
    if (!ready || !deviceId) {
      await connect();
      // wait a moment for ready callback (mobile browsers can be slow)
      await new Promise(r => setTimeout(r, 500));
    }

    // Force transfer again (safe)
    try { await transferPlaybackToWebDevice(); } catch(e) {}

    // Play on our device
    await apiFetch(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [uri] })
    });

    // also resume the SDK player (helps some Android cases)
    if (player) {
      try { await player.resume(); } catch(e) {}
    }
  }

  function getDeviceId(){ return deviceId; }

  window.SpotifyPlayer = {
    connect,
    play,
    pause,
    next,
    prev,
    playUri,
    getDeviceId
  };
})();