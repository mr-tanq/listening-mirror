/* spotify-auth.js
   Spotify OAuth (Authorization Code with PKCE) for SPA (GitHub Pages).
   Exposes:
     - window.SpotifyAuth.login()
     - window.SpotifyAuth.logout()
     - window.SpotifyAuth.getAccessToken()
*/

(function(){
  "use strict";

  // ✅ SET THESE
  const CLIENT_ID = "PASTE_YOUR_CLIENT_ID_HERE";
  // If you use a dedicated callback path, keep it here.
  // Must match EXACTLY what you have in Spotify dashboard.
  const REDIRECT_URI = "https://mr-tanq.github.io/listening-mirror/";

  const SCOPES = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing"
  ];

  const LS = {
    token: "lm_spotify_access_token",
    refresh: "lm_spotify_refresh_token",
    expiresAt: "lm_spotify_expires_at",
    verifier: "lm_spotify_pkce_verifier"
  };

  function nowMs(){ return Date.now(); }

  function base64url(bytes) {
    return btoa(String.fromCharCode.apply(null, Array.from(bytes)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function sha256(str){
    const enc = new TextEncoder().encode(str);
    const digest = await crypto.subtle.digest("SHA-256", enc);
    return new Uint8Array(digest);
  }

  function randomString(len=64){
    const a = new Uint8Array(len);
    crypto.getRandomValues(a);
    return base64url(a);
  }

  function setToken(accessToken, expiresInSec, refreshToken){
    const expiresAt = nowMs() + (Math.max(10, Number(expiresInSec) || 3600) * 1000) - 15000; // 15s safety
    localStorage.setItem(LS.token, accessToken);
    localStorage.setItem(LS.expiresAt, String(expiresAt));
    if (refreshToken) localStorage.setItem(LS.refresh, refreshToken);
  }

  function clearToken(){
    localStorage.removeItem(LS.token);
    localStorage.removeItem(LS.refresh);
    localStorage.removeItem(LS.expiresAt);
    localStorage.removeItem(LS.verifier);
  }

  function getStoredToken(){
    const t = localStorage.getItem(LS.token);
    const exp = Number(localStorage.getItem(LS.expiresAt) || "0");
    if (!t || !exp) return null;
    if (nowMs() >= exp) return null;
    return t;
  }

  async function exchangeCodeForToken(code){
    const verifier = localStorage.getItem(LS.verifier);
    if (!verifier) throw new Error("Missing PKCE verifier");

    const body = new URLSearchParams();
    body.set("client_id", CLIENT_ID);
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("redirect_uri", REDIRECT_URI);
    body.set("code_verifier", verifier);

    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    const json = await res.json().catch(()=> ({}));
    if (!res.ok) {
      throw new Error(`Token exchange failed: ${res.status} ${JSON.stringify(json)}`);
    }

    setToken(json.access_token, json.expires_in, json.refresh_token);
    localStorage.removeItem(LS.verifier);
    return json.access_token;
  }

  async function handleRedirectIfPresent(){
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const err  = url.searchParams.get("error");
    if (err) {
      console.warn("[SpotifyAuth] OAuth error:", err);
      // clean URL
      url.searchParams.delete("error");
      window.history.replaceState({}, document.title, url.toString());
      return;
    }
    if (!code) return;

    try {
      await exchangeCodeForToken(code);
    } catch(e){
      console.error("[SpotifyAuth] exchange failed:", e);
    }

    // clean URL
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    window.history.replaceState({}, document.title, url.toString());
  }

  async function login(){
    if (!CLIENT_ID || CLIENT_ID.includes("PASTE_")) {
      alert("spotify-auth.js: Βάλε το CLIENT_ID σου μέσα στο αρχείο.");
      return;
    }

    const verifier = randomString(64);
    localStorage.setItem(LS.verifier, verifier);

    const challenge = base64url(await sha256(verifier));
    const state = randomString(16);

    const params = new URLSearchParams();
    params.set("client_id", CLIENT_ID);
    params.set("response_type", "code");
    params.set("redirect_uri", REDIRECT_URI);
    params.set("state", state);
    params.set("code_challenge_method", "S256");
    params.set("code_challenge", challenge);
    params.set("scope", SCOPES.join(" "));

    const authUrl = "https://accounts.spotify.com/authorize?" + params.toString();
    window.location.assign(authUrl);
  }

  function logout(){
    clearToken();
  }

  function getAccessToken(){
    return getStoredToken();
  }

  // Run redirect handler on load
  handleRedirectIfPresent();

  window.SpotifyAuth = {
    login,
    logout,
    getAccessToken
  };
})();
