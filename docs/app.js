/* Listening Mirror — app.js (STABLE BUILD) */

(() => {
"use strict";

/* ---------------- CONFIG ---------------- */

const API_BASE = "https://i.errtanq9.workers.dev";
const NOW_POLL_MS = 12000;

/* ---------------- DOM ---------------- */

const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];

const statusDot=$("#statusDot");
const statusLine=$("#statusLine");

const tabBtns=$$(".tabBtn");
const panels=$$(".panel");

/* NOW */
const nowAmbient=$("#nowAmbient");
const nowBadge=$("#nowBadge");
const nowBadgeText=$("#nowBadgeText");

const nowImg=$("#nowImg");
const nowFallback=$("#nowFallback");
const nowCoverWrap=$("#nowCoverWrap");

const nowTrack=$("#nowTrack");
const nowArtist=$("#nowArtist");
const nowAlbum=$("#nowAlbum");

const nowTrackWrap=$("#nowTrackWrap");
const nowArtistWrap=$("#nowArtistWrap");
const nowAlbumWrap=$("#nowAlbumWrap");

/* TOP */
const topList=$("#topList");
const topTypeBtns=$$("[data-top-type]");
const topPeriodBtns=$$("[data-top-period]");

/* RECENT */
const recentList=$("#recentList");

/* ------------- SAFE GUARDS (CRASH FIX) ------------- */
/* αυτά αποτρέπουν blank screen αν λείπει element */
function safe(el){
  if(!el) return {textContent:"",style:{},classList:{add(){},remove(){},toggle(){}}};
  return el;
}

/* ---------------- STATE ---------------- */

let activeTab="now";
let nowTimer=null;

/* ---------------- HELPERS ---------------- */

function absApi(url){
  if(!url) return "";
  if(url.startsWith("http")) return url;
  if(url.startsWith("/")) return API_BASE+url;
  return API_BASE+"/"+url;
}

function setOnline(v){
  statusDot.classList.toggle("on",v);
  statusLine.textContent=v?"Online":"Offline";
}

async function api(path){
  const r=await fetch(API_BASE+path,{cache:"no-store"});
  if(!r.ok) throw new Error("API");
  return r.json();
}

function text(el,val){
  if(!el) return;
  el.textContent=(val && val.trim())?val:"—";
}

/* marquee */
function marquee(wrap,span){
  requestAnimationFrame(()=>{
    if(!wrap||!span) return;
    const overflow=span.scrollWidth>wrap.clientWidth+6;
    wrap.classList.toggle("marqOn",overflow);
    if(!overflow) return;

    const shift=span.scrollWidth-wrap.clientWidth+20;
    wrap.style.setProperty("--marqShift",shift+"px");
    wrap.style.setProperty("--marqDur",Math.max(10,shift/22)+"s");
  });
}

/* ---------------- NOW ---------------- */

function clearNow(){
  nowAmbient.classList.remove("on");
  nowImg.style.display="none";
  nowFallback.style.display="grid";
  text(nowTrack,"—");
  text(nowArtist,"—");
  text(nowAlbum,"—");
  nowBadge.style.display="none";
}

function applyNow(item){

  if(!item){
    clearNow();
    return;
  }

  const img=absApi(item.image);

  /* LIVE badge */
  nowBadge.style.display="flex";
  nowBadgeText.textContent="LIVE";

  /* artwork */
  if(img){
    nowImg.src=img;
    nowImg.style.display="block";
    nowFallback.style.display="none";
    nowCoverWrap.style.setProperty("--cover-url",`url("${img}")`);
    nowAmbient.style.setProperty("--ambient-url",`url("${img}")`);
    nowAmbient.classList.add("on");
  }else{
    nowImg.style.display="none";
    nowFallback.style.display="grid";
  }

  text(nowTrack,item.name);
  text(nowArtist,item.artist);
  text(nowAlbum,item.album);

  marquee(nowTrackWrap,nowTrack);
  marquee(nowArtistWrap,nowArtist);
  marquee(nowAlbumWrap,nowAlbum);
}

async function loadNow(){
  try{
    const j=await api("/api/now");
    setOnline(true);
    applyNow(j?.item||null);
  }catch(e){
    setOnline(false);
    clearNow();
  }
}

function startNow(){
  clearInterval(nowTimer);
  nowTimer=setInterval(loadNow,NOW_POLL_MS);
}

/* ---------------- TOP ---------------- */

async function loadTop(){
  try{
    topList.innerHTML="Loading…";

    const j=await api("/api/top?type=tracks&period=today&limit=10");
    if(!j?.items?.length){
      topList.innerHTML="No data";
      return;
    }

    topList.innerHTML=j.items.map((it,i)=>`
      <div class="row">
        <div class="thumb">
          ${it.image?`<img src="${absApi(it.image)}">`:`<div class="thumbFallback">♪</div>`}
        </div>
        <div class="mid">
          <div class="title">${i+1}. ${it.name||"—"}</div>
          <div class="sub">${it.artist||""}</div>
        </div>
        <div class="right count">${it.playcount||""}</div>
      </div>
    `).join("");

  }catch(e){
    topList.innerHTML="Could not load";
  }
}

/* ---------------- RECENT ---------------- */

async function loadRecent(){
  try{
    recentList.innerHTML="Loading…";

    const j=await api("/api/history?limit=20");

    const items=j?.items||[];
    if(!items.length){
      recentList.innerHTML="No recent tracks";
      return;
    }

    recentList.innerHTML=items.map((it,i)=>`
      <div class="row">
        <div class="thumb">
          ${it.image?`<img src="${absApi(it.image)}">`:`<div class="thumbFallback">♪</div>`}
        </div>
        <div class="mid">
          <div class="title">${i+1}. ${it.name||"—"}</div>
          <div class="sub">${it.artist||""}${it.album?" • "+it.album:""}</div>
        </div>
        <div class="right">${it.time||""}</div>
      </div>
    `).join("");

  }catch(e){
    recentList.innerHTML="Could not load";
  }
}

/* ---------------- TABS ---------------- */

function showTab(name){
  activeTab=name;
  tabBtns.forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===name));
  panels.forEach(p=>p.classList.toggle("hidden",p.dataset.panel!==name));

  if(name==="now") loadNow();
  if(name==="top") loadTop();
  if(name==="recent") loadRecent();
}

tabBtns.forEach(b=>{
  b.onclick=()=>showTab(b.dataset.tab);
});

/* ---------------- BOOT ---------------- */

async function boot(){
  showTab("now");
  await loadNow();
  startNow();

  /* background preload */
  setTimeout(loadTop,1500);
  setTimeout(loadRecent,2000);
}

boot();

})();
