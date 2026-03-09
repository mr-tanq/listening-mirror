/* spotify-ui.js (FULL FILE REPLACE)
   Listening Mirror — Spotify UI bridge
   Handles ONLY:
   - progress bar
   - current time / duration
   - play state
   - spotify glyph state

   DOES NOT control lyrics anymore
*/

(() => {

"use strict";

const $ = (id) => document.getElementById(id);

const progressBar = $("spotifyProgressBar");
const progressFill = $("spotifyProgressFill");

const timeCurrent = $("spotifyTimeCurrent");
const timeTotal = $("spotifyTimeTotal");

const spotifyGlyph = $("spotifyGlyph");

let state = {
  duration: 0,
  progress: 0,
  playing: false
};

function formatTime(ms){

  if(!ms) return "0:00";

  const s = Math.floor(ms/1000);
  const m = Math.floor(s/60);
  const sec = String(s%60).padStart(2,"0");

  return `${m}:${sec}`;
}

function updateProgressUI(){

  if(!progressFill) return;

  const p = state.duration
    ? state.progress/state.duration
    : 0;

  progressFill.style.width = `${p*100}%`;

  if(timeCurrent) timeCurrent.textContent = formatTime(state.progress);
  if(timeTotal) timeTotal.textContent = formatTime(state.duration);
}

function updateGlyph(){

  if(!spotifyGlyph) return;

  spotifyGlyph.classList.toggle("active", state.playing);
}

function tick(){

  if(!state.playing) return;

  state.progress += 900;

  if(state.progress > state.duration)
    state.progress = state.duration;

  updateProgressUI();
}

setInterval(tick,900);
function applySpotifyState(st){

  if(!st) return;

  state.playing = !!st.is_playing;
  state.progress = Number(st.progress_ms||0);
  state.duration = Number(st.duration_ms||0);

  updateProgressUI();
  updateGlyph();
}

function readState(){

  if(window.SpotifyPlayer
     && typeof window.SpotifyPlayer.getState==="function"){

    const st = window.SpotifyPlayer.getState();

    if(st){

      applySpotifyState({
        is_playing: st.is_playing,
        progress_ms: st.progress_ms,
        duration_ms: st.duration_ms
      });

      return;
    }
  }

  if(window.SpotifyPlayer
     && typeof window.SpotifyPlayer.subscribe==="function"){

    window.SpotifyPlayer.subscribe((st)=>{

      applySpotifyState({
        is_playing: st.is_playing,
        progress_ms: st.progress_ms,
        duration_ms: st.duration_ms
      });

    });
  }

}

function boot(){

  readState();

}

if(document.readyState==="loading")
  document.addEventListener("DOMContentLoaded",boot);
else
  boot();

})();