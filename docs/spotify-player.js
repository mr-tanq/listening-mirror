(function(){
  "use strict";

  const TEST_TRACK_URI = "spotify:track:0VjIjW4GlUZAMYd2vXMi3b"; // άλλαξέ το όποτε θες

  function $(sel){ return document.querySelector(sel); }
  function clampStr(s, n){ s = String(s || ""); return s.length > n ? s.slice(0,n-1)+"…" : s; }

  function getToken(){
    try{
      if(typeof getSpotifyToken === "function") return getSpotifyToken();
    }catch(e){}
    return localStorage.getItem("spotify_token");
  }

  async function spFetch(path, {method="GET", body=null} = {}){
    const token = getToken();
    if(!token) throw new Error("NO_TOKEN");

    const res = await fetch("https://api.spotify.com/v1" + path, {
      method,
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : null
    });

    if(res.status === 401) throw new Error("TOKEN_EXPIRED_OR_INVALID");
    if(res.status === 204) return null;

    const txt = await res.text();
    let json = null;
    try{ json = txt ? JSON.parse(txt) : null; }catch(e){}

    if(!res.ok){
      const msg = json?.error?.message || ("HTTP_" + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.payload = json;
      throw err;
    }
    return json;
  }

  async function getDevices(){
    const data = await spFetch("/me/player/devices");
    return data?.devices || [];
  }
async function ensureActiveDevice(){
    const devices = await getDevices();
    if(!devices.length) throw new Error("NO_DEVICES");

    // προτίμησε active device, αλλιώς πάρε το πρώτο διαθέσιμο
    const active = devices.find(d => d.is_active) || devices[0];

    // αν δεν είναι active, κάνε transfer playback εκεί
    if(!active.is_active){
      await spFetch("/me/player", {
        method: "PUT",
        body: { device_ids: [active.id], play: false }
      });
    }

    return active;
  }

  async function playUri(uri){
    await ensureActiveDevice();
    await spFetch("/me/player/play", {
      method: "PUT",
      body: { uris: [uri] }
    });
  }

  async function pause(){
    await spFetch("/me/player/pause", { method: "PUT" });
  }

  async function next(){
    await spFetch("/me/player/next", { method: "POST" });
  }

  async function prev(){
    await spFetch("/me/player/previous", { method: "POST" });
  }

  function setStatus(msg){
    let el = document.getElementById("statusLine");
    if(el) el.textContent = msg;
  }

  function pillMsg(el, msg){
    if(!el) return;
    el.textContent = msg;
  }
function mountPill(){
    const host = document.querySelector(".app") || document.body;

    const wrap = document.createElement("div");
    wrap.style.position = "sticky";
    wrap.style.top = "10px";
    wrap.style.zIndex = "9999";
    wrap.style.display = "flex";
    wrap.style.justifyContent = "flex-end";
    wrap.style.pointerEvents = "none";
    wrap.style.margin = "0 0 10px 0";

    const pill = document.createElement("div");
    pill.style.pointerEvents = "auto";
    pill.style.display = "inline-flex";
    pill.style.alignItems = "center";
    pill.style.gap = "8px";
    pill.style.padding = "8px 10px";
    pill.style.borderRadius = "999px";
    pill.style.background = "rgba(255,255,255,.06)";
    pill.style.outline = "1px solid rgba(255,255,255,.10)";
    pill.style.boxShadow = "0 16px 45px rgba(0,0,0,.35)";
    pill.style.backdropFilter = "blur(10px)";
    pill.style.webkitBackdropFilter = "blur(10px)";
    pill.style.fontSize = "12px";
    pill.style.color = "rgba(255,255,255,.86)";
    pill.style.userSelect = "none";

    const dot = document.createElement("span");
    dot.style.width = "7px";
    dot.style.height = "7px";
    dot.style.borderRadius = "999px";
    dot.style.background = "rgba(255,255,255,.18)";
    dot.style.outline = "1px solid rgba(255,255,255,.10)";

    const label = document.createElement("span");
    label.textContent = "Spotify: not linked";

    const btn = (txt) => {
      const b = document.createElement("button");
      b.textContent = txt;
      b.style.border = "0";
      b.style.cursor = "pointer";
      b.style.padding = "7px 10px";
      b.style.borderRadius = "999px";
      b.style.background = "rgba(255,255,255,.08)";
      b.style.color = "rgba(255,255,255,.92)";
      b.style.outline = "1px solid rgba(255,255,255,.10)";
      return b;
    };

    const bLogin = btn("Connect");
    const bPlay  = btn("Play");
    const bPause = btn("Pause");
    const bNext  = btn("Next");
    const bPrev  = btn("Prev");
    const bLogout = btn("Logout");

    pill.append(dot, label, bPrev, bPlay, bPause, bNext, bLogin, bLogout);
    wrap.appendChild(pill);

    // βάλε το αμέσως μετά τα tabs (αν υπάρχουν), αλλιώς πάνω-πάνω
    const tabs = document.querySelector(".tabs");
    if(tabs && tabs.parentNode){
      tabs.parentNode.insertBefore(wrap, tabs.nextSibling);
    }else{
      host.insertBefore(wrap, host.firstChild);
    }

    return { dot, label, bLogin, bPlay, bPause, bNext, bPrev, bLogout };
  }
function updatePill(ui){
    const token = getToken();
    if(token){
      ui.dot.style.background = "rgba(49,208,124,.75)";
      ui.dot.style.outlineColor = "rgba(49,208,124,.35)";
      ui.dot.style.boxShadow = "0 0 0 3px rgba(49,208,124,.10)";
      pillMsg(ui.label, "Spotify: linked");
      ui.bLogin.style.display = "none";
      ui.bLogout.style.display = "inline-flex";
    }else{
      ui.dot.style.background = "rgba(255,255,255,.18)";
      ui.dot.style.outlineColor = "rgba(255,255,255,.10)";
      ui.dot.style.boxShadow = "none";
      pillMsg(ui.label, "Spotify: not linked");
      ui.bLogin.style.display = "inline-flex";
      ui.bLogout.style.display = "none";
    }
  }

  async function safe(action, ui){
    try{
      await action();
      updatePill(ui);
    }catch(e){
      if(e.message === "NO_TOKEN"){
        pillMsg(ui.label, "Spotify: connect first");
        return;
      }
      if(e.message === "TOKEN_EXPIRED_OR_INVALID"){
        pillMsg(ui.label, "Spotify: token expired (reconnect)");
        logoutSpotify?.();
        updatePill(ui);
        return;
      }
      if(e.message === "NO_DEVICES"){
        pillMsg(ui.label, "Open Spotify once (need an active device)");
        return;
      }
      pillMsg(ui.label, "Error: " + clampStr(e.message, 40));
    }
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    // 1) αν γύρισες από Spotify redirect, θα αποθηκεύσει token εδώ
    getToken();

    const ui = mountPill();
    updatePill(ui);

    ui.bLogin.addEventListener("click", ()=> loginSpotify());
    ui.bLogout.addEventListener("click", ()=> { logoutSpotify?.(); updatePill(ui); });

    ui.bPlay.addEventListener("click", ()=> safe(()=> playUri(TEST_TRACK_URI), ui));
    ui.bPause.addEventListener("click", ()=> safe(()=> pause(), ui));
    ui.bNext.addEventListener("click", ()=> safe(()=> next(), ui));
    ui.bPrev.addEventListener("click", ()=> safe(()=> prev(), ui));

    // Προαιρετικό: δείξε στο status line ότι έχουμε control layer
    setStatus("Offline"); // δεν πειράζω το app.js σου
  });
})();