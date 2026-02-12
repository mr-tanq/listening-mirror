// spotify-auth.js
// No secrets here. Client ID only.

const CLIENT_ID = "ΒΑΛΕ_ΕΔΩ_ΤΟ_CLIENT_ID_ΣΟΥ";

const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing"
];

function getRedirectUri(){
  // Always redirect back to the exact page the user is on (GitHub Pages path included)
  // Remove hash and query, keep trailing slash if present
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  return url.toString();
}

function loginSpotify(){
  const redirectUri = getRedirectUri();
const authUrl =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
      response_type: "token",
      client_id: CLIENT_ID,
      scope: SCOPES.join(" "),
      redirect_uri: redirectUri,
      show_dialog: "false"
    });

  window.location.assign(authUrl);
}

function getTokenFromUrl(){
  const hash = window.location.hash;
  if(!hash) return null;

  const params = new URLSearchParams(hash.substring(1));
  const token = params.get("access_token");
  const expiresIn = params.get("expires_in"); // seconds
if(token){
    const now = Date.now();
    const ttlMs = (parseInt(expiresIn || "3600", 10) * 1000);

    localStorage.setItem("spotify_token", token);
    localStorage.setItem("spotify_token_exp", String(now + ttlMs));

    // clean URL
    window.location.hash = "";
    return token;
  }
  return null;
}

function tokenExpired(){
  const exp = parseInt(localStorage.getItem("spotify_token_exp") || "0", 10);
  return !exp || Date.now() > exp;
}
function getSpotifyToken(){
  // 1) if token is in URL hash right now, capture it
  const fromHash = getTokenFromUrl();
  if(fromHash) return fromHash;

  // 2) otherwise use stored token if not expired
  const token = localStorage.getItem("spotify_token");
  if(!token) return null;
  if(tokenExpired()) return null;

  return token;
}

function logoutSpotify(){
  localStorage.removeItem("spotify_token");
  localStorage.removeItem("spotify_token_exp");
}