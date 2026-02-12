// spotify-player.js (FULL FILE) — PART 1/4
/* Spotify player using Web Playback SDK + Web API control
   Exposes:
     - window.SpotifyPlayer.connect()
     - window.SpotifyPlayer.playUri(uri)
     - window.SpotifyPlayer.play() / pause() / next() / prev()
     - window.SpotifyPlayer.getDeviceId()
*/

(function () {
  "use strict";

  const DEVICE_NAME = "Listening Mirror";
  let player = null;
  let deviceId = null;
  let lastToken = null;
  let ready = false;

  function getToken() {
    if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
      return window.SpotifyAuth.getAccessToken();
    }
    return null;
  }

  async function api(path, method = "GET", body) {
    const token = getToken();
    if (!token) throw new Error("No token (SpotifyAuth.getAccessToken returned null).");

    const res = await fetch("https://api.spotify.com/v1" + path, {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });

    // 204 has no body
    if (res.status === 204) return { ok: true };

    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Spotify API ${res.status}: ${JSON.stringify(j)}`);
    return j;
  }

  function ensureSdk() {
    return new Promise((resolve, reject) => {
      if (window.Spotify && window.Spotify.Player) return resolve();

      // SDK loads via global callback
      window.onSpotifyWebPlaybackSDKReady = () => resolve();

      // If SDK script missing, inject it
      const existing = document.querySelector("script[data-spotify-sdk]");
      if (existing) return;

      const s = document.createElement("script");
      s.src = "https://sdk.scdn.co/spotify-player.js";
      s.async = true;
      s.defer = true;
      s.setAttribute("data-spotify-sdk", "1");
      s.onload = () => { /* wait for callback */ };
      s.onerror = () => reject(new Error("Failed to load Spotify Web Playback SDK."));
      document.head.appendChild(s);
    });
  }

  function setOrbOn(on) {
    const orb = document.getElementById("mirrorOrb");
    if (!orb) return;
    orb.classList.toggle("on", !!on);
  }

  // spotify-player.js (FULL FILE) — PART 2/4
  async function connect() {
    const token = getToken();
    if (!token) {
      // No token yet: kick auth
      if (window.SpotifyAuth && typeof window.SpotifyAuth.login === "function") {
        window.SpotifyAuth.login();
        return;
      }
      throw new Error("No token and no SpotifyAuth.login available.");
    }

    await ensureSdk();

    // Recreate player if token changed (Spotify SDK needs fresh token callback)
    if (player && lastToken !== token) {
      try { await player.disconnect(); } catch (_) {}
      player = null;
      deviceId = null;
      ready = false;
    }
    lastToken = token;

    if (!player) {
      player = new window.Spotify.Player({
        name: DEVICE_NAME,
        volume: 0.8,
        getOAuthToken: cb => cb(getToken() || "")
      });

      player.addListener("ready", ({ device_id }) => {
        deviceId = device_id;
        ready = true;
        console.log("[SpotifyPlayer] Ready device_id:", deviceId);
        setOrbOn(true);
      });

      player.addListener("not_ready", ({ device_id }) => {
        console.log("[SpotifyPlayer] Device offline:", device_id);
        if (deviceId === device_id) {
          ready = false;
          setOrbOn(false);
        }
      });

      player.addListener("initialization_error", ({ message }) => console.error("[SpotifyPlayer] init error", message));
      player.addListener("authentication_error", ({ message }) => console.error("[SpotifyPlayer] auth error", message));
      player.addListener("account_error", ({ message }) => console.error("[SpotifyPlayer] account error", message));
      player.addListener("playback_error", ({ message }) => console.error("[SpotifyPlayer] playback error", message));

      const ok = await player.connect();
      if (!ok) throw new Error("Spotify player.connect() returned false.");
    }

    // Ensure transfer playback to this device (so Web API play works)
    if (deviceId) {
      try {
        await api("/me/player", "PUT", { device_ids: [deviceId], play: false });
      } catch (e) {
        console.warn("[SpotifyPlayer] transfer playback failed:", e);
      }
    }

    return true;
  }

  async function playUri(uri) {
    if (!uri) throw new Error("playUri: missing uri");
    await connect(); // ensures token + device exists

    if (!deviceId) throw new Error("No deviceId yet. Try again after connect.");

    // Start playback on our device
    await api(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, "PUT", {
      uris: [uri]
    });
  }

  async function play() {
    await connect();
    if (!deviceId) throw new Error("No deviceId yet.");
    await api(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, "PUT");
  }

  async function pause() {
    await connect();
    if (!deviceId) throw new Error("No deviceId yet.");
    await api(`/me/player/pause?device_id=${encodeURIComponent(deviceId)}`, "PUT");
  }

  // spotify-player.js (FULL FILE) — PART 3/4
  async function next() {
    await connect();
    await api(`/me/player/next?device_id=${encodeURIComponent(deviceId)}`, "POST");
  }

  async function prev() {
    await connect();
    await api(`/me/player/previous?device_id=${encodeURIComponent(deviceId)}`, "POST");
  }

  function getDeviceId() {
    return deviceId;
  }

  // Optional: expose a “linked” indicator
  function isLinked() {
    return !!getToken();
  }

  window.SpotifyPlayer = {
    connect,
    playUri,
    play,
    pause,
    next,
    prev,
    getDeviceId,
    isLinked
  };
})();