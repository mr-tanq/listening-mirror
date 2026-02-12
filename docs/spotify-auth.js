/* spotify-auth.js
   Frontend-only Spotify OAuth (Implicit Grant) + localStorage token saved by callback.html
   Requirements:
   - Spotify Dashboard Redirect URI:
     https://mr-tanq.github.io/listening-mirror/callback.html
   - callback.html saves:
     localStorage.spotify_token
     localStorage.spotify_token_exp
*/

(() => {
  "use strict";

  // ✅ EDIT THIS: your Spotify App Client ID
  const CLIENT_ID = "PASTE_YOUR_CLIENT_ID_HERE";

  // ✅ Must match Spotify Dashboard redirect EXACTLY
  const REDIRECT_URI = "https://mr-tanq.github.io/listening-mirror/callback.html";

  // Scopes for controlling playback + reading what plays
  // (add/remove as needed, but these are the core ones)
  const SCOPES = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing"
  ];

  const LS_TOKEN = "spotify_token";
  const LS_EXP = "spotify_token_exp";

  function nowMs() {
    return Date.now();
  }

  function getStoredToken() {
    const t = localStorage.getItem(LS_TOKEN);
    const exp = Number(localStorage.getItem(LS_EXP) || "0");
    if (!t) return null;
    if (!exp || nowMs() > exp - 10_000) return null; // 10s safety
    return t;
  }

  function clearToken() {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EXP);
  }

  function buildAuthUrl() {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "token",
      redirect_uri: REDIRECT_URI,
      scope: SCOPES.join(" "),
      show_dialog: "false"
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  function requireClientId() {
    if (!CLIENT_ID || CLIENT_ID.includes("PASTE_YOUR_CLIENT_ID_HERE")) {
      console.error("[spotify-auth] Missing CLIENT_ID. Set it in spotify-auth.js");
      return false;
    }
    return true;
  }

  function login() {
    if (!requireClientId()) return;
    window.location.href = buildAuthUrl();
  }

  function isLinked() {
    return !!getStoredToken();
  }

  // Public API (attached to window for app.js to use)
  window.SpotifyAuth = {
    CLIENT_ID,
    REDIRECT_URI,
    SCOPES,
    login,
    logout: clearToken,
    isLinked,
    getToken: getStoredToken
  };
})();