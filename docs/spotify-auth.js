const CLIENT_ID = "20fca973de8445509d31bf9ab4e13b0b";
const REDIRECT_URI = "https://mr-tanq.github.io/listening-mirror/";
const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing"
];

function loginSpotify(){
  const authUrl =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
      response_type: "token",
      client_id: CLIENT_ID,
      scope: SCOPES.join(" "),
      redirect_uri: REDIRECT_URI
    });

  window.location = authUrl;
}

function getTokenFromUrl(){
  const hash = window.location.hash;
  if(!hash) return null;

  const params = new URLSearchParams(hash.substring(1));
  const token = params.get("access_token");

  if(token){
    localStorage.setItem("spotify_token", token);
    window.location.hash = "";
  }
  return token;
}

function getSpotifyToken(){
  return null
    || localStorage.getItem("spotify_token")
    || getTokenFromUrl();
}