/* spotify-auth.js
   Spotify OAuth (Authorization Code with PKCE) for SPA (GitHub Pages).
   Exposes:
     - window.SpotifyAuth.login()
     - window.SpotifyAuth.logout()
     - window.SpotifyAuth.getAccessToken()
*/

(function(){
  "use strict";

  const CLIENT_ID = "20fca973de8445509d31bf9ab4e13b0b";

  // ✅ MUST MATCH Spotify dashboard Redirect URI EXACTLY
  // Example valid for your GitHub Pages:
  const REDIRECT_URI = "https://mr-tanq.github.io/listening-mirror/";

  const SCOPES = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing"
  ];

  const LS = {
    token: "lm_spotify_access_token",
    expiresAt: "lm_spotify_expires_at",
    verifier: "lm_spotify_pkce_verifier",
    state: "lm_spotify_oauth_state"
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

  function setToken(accessToken, expiresInSec){
    const expiresAt = nowMs() + (Math.max(10, Number(expiresInSec) || 3600) * 1000) - 15000;
    localStorage.setItem(LS.token, accessToken);
    localStorage.setItem(LS.expiresAt, String(expiresAt));
  }

  function clearToken(){
    localStorage.removeItem(LS.token);
    localStorage.removeItem(LS.expiresAt);
    localStorage.removeItem(LS.verifier);
    localStorage.removeItem(LS.state);
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
    if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${JSON.stringify(json)}`);

    setToken(json.access_token, json.expires_in);
    localStorage.removeItem(LS.verifier);
    localStorage.removeItem(LS.state);
    return json.access_token;
  }

  async function handleRedirectIfPresent(){
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const err  = url.searchParams.get("error");
    const state = url.searchParams.get("state");

    if (err) {
      console.warn("[SpotifyAuth] OAuth error:", err);
      url.searchParams.delete("error");
      window.history.replaceState({}, document.title, url.toString());
      return;
    }
    if (!code) return;

    const expectedState = localStorage.getItem(LS.state);
    if (expectedState && state && expectedState !== state) {
      console.error("[SpotifyAuth] State mismatch. Aborting.");
      url.searchParams.delete("code");
      url.searchParams.delete("state");
      window.history.replaceState({}, document.title, url.toString());
      return;
    }

    try {
      await exchangeCodeForToken(code);
    } catch(e){
      console.error("[SpotifyAuth] exchange failed:", e);
    }

    url.searchParams.delete("code");
    url.searchParams.delete("state");
    window.history.replaceState({}, document.title, url.toString());
  }

  async function login(){
    if (!CLIENT_ID) {
      alert("spotify-auth.js: Missing CLIENT_ID");
      return;
    }

    const verifier = randomString(64);
    localStorage.setItem(LS.verifier, verifier);

    const challenge = base64url(await sha256(verifier));
    const state = randomString(18);
    localStorage.setItem(LS.state, state);

    const params = new URLSearchParams();
    params.set("client_id", CLIENT_ID);
    params.set("response_type", "code");
    params.set("redirect_uri", REDIRECT_URI);
    params.set("state", state);
    params.set("code_challenge_method", "S256");
    params.set("code_challenge", challenge);
    params.set("scope", SCOPES.join(" "));

    window.location.assign("https://accounts.spotify.com/authorize?" + params.toString());
  }

  function logout(){
    clearToken();
  }

  function getAccessToken(){
    return getStoredToken();
  }

  handleRedirectIfPresent();

  window.SpotifyAuth = { login, logout, getAccessToken };
})();