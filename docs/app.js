/* Listening Mirror UI
   Worker base is FIXED
   https://i.errtanq9.workers.dev
*/

(() => {
"use strict";

const WORKER_BASE = "https://i.errtanq9.workers.dev";

/* -------------------------------------------------- */
/* DOM helpers */
/* -------------------------------------------------- */

const el  = (s) => document.querySelector(s);
const els = (s) => Array.from(document.querySelectorAll(s));

const statusLine = el("#statusLine");
const statusDot  = el("#statusDot");
const btnRefresh = el("#btnRefresh");

const panels  = els(".panel");
const tabBtns = els(".tabBtn");

const nowUpdated = el("#nowUpdated");
const nowBadge   = el("#nowBadge");
const nowImg     = el("#nowImg");
const nowFallback= el("#nowFallback");
const nowTrack   = el("#nowTrack");
const nowArtist  = el("#nowArtist");
const nowAlbum   = el("#nowAlbum");
const nowMsg     = el("#nowMsg");
const workerHint = el("#workerHint");

const topMeta   = el("#topMeta");
const topBadge  = el("#topBadge");
const topList   = el("#topList");
const topTypeBtns   = els("[data-top-type]");
const topPeriodBtns = els("[data-top-period]");

const recentMeta = el("#recentMeta");
const recentList = el("#recentList");

let currentTab = "now";
let topType    = "tracks";
let topPeriod  = "today";
let topLimit   = 20;

/* -------------------------------------------------- */
/* Utilities */
/* -------------------------------------------------- */

function setSelected(btns, pred){
  btns.forEach(b=>b.setAttribute("aria-selected",pred(b)?"true":"false"));
}

function showTab(tab){
  currentTab = tab;

  setSelected(tabBtns, b=>b.dataset.tab===tab);

  panels.forEach(p=>{
    p.classList.toggle("hidden",p.dataset.panel!==tab);
  });

  if(tab==="now")    refreshNow();
  if(tab==="top")    refreshTop();
  if(tab==="recent") refreshRecent();
}

function fmtTime(){
  return new Date().toLocaleTimeString([],{
    hour:"2-digit",minute:"2-digit",second:"2-digit"
  });
}

function setStatus(ok){
  statusLine.textContent = ok ? "Online" : "Offline";
  statusDot.classList.toggle("ok",ok);
}

/* IMPORTANT:
Worker returns image paths like:
   /img?u=...

We MUST convert to full URL
*/
function resolveImageUrl(u){
  if(!u) return "";
  if(u.startsWith("http")) return u;
  if(u.startsWith("/")) return WORKER_BASE+u;
  return "";
}

async function fetchJson(path){
  const r = await fetch(WORKER_BASE+path,{cache:"no-store"});
  const txt = await r.text();
  try { return JSON.parse(txt); }
  catch { throw new Error("Bad JSON"); }
}

/* -------------------------------------------------- */
/* NOW PLAYING */
/* -------------------------------------------------- */

function clearNow(){
  nowBadge.textContent="OFF";
  nowBadge.classList.remove("live");
  nowTrack.textContent="—";
  nowArtist.textContent="—";
  nowAlbum.textContent="—";
  nowMsg.textContent="";
  setNowCover("");
}

function setNowCover(img){
  const url = resolveImageUrl(img);
  if(url){
    nowImg.src=url;
    nowImg.style.display="block";
    nowFallback.style.display="none";
  }else{
    nowImg.removeAttribute("src");
    nowImg.style.display="none";
    nowFallback.style.display="grid";
  }
}

async function refreshNow(){
  clearNow();
  nowUpdated.textContent=fmtTime();
  nowMsg.textContent="Loading…";

  try{
    const j = await fetchJson("/api/now");
    nowUpdated.textContent=fmtTime();

    if(!j?.item){
      nowMsg.textContent="Not playing now";
      return;
    }

    nowBadge.textContent="LIVE";
    nowBadge.classList.add("live");

    nowTrack.textContent=j.item.name||"—";
    nowArtist.textContent=j.item.artist||"—";
    nowAlbum.textContent=j.item.album||"—";

    setNowCover(j.item.image);
    nowMsg.textContent="Now playing";

  }catch(e){
    nowMsg.textContent="Error loading";
  }
}

/* -------------------------------------------------- */
/* ROW RENDER */
/* -------------------------------------------------- */

function rowItem(idx,title,sub,right,imgUrl){
  const row=document.createElement("div");
  row.className="row";

  const cover=document.createElement("div");
  cover.className="cover";

  const img=document.createElement("img");
  const fallback=document.createElement("div");
  fallback.className="coverFallback";
  fallback.textContent="♪";

  const url=resolveImageUrl(imgUrl);
  if(url){
    img.src=url;
    img.loading="lazy";
    img.onerror=()=>{img.remove();fallback.style.display="grid";}
    cover.appendChild(img);
    fallback.style.display="none";
  }

  cover.appendChild(fallback);

  const mid=document.createElement("div");
  mid.className="mid";

  const t=document.createElement("div");
  t.className="title";
  t.textContent=`${idx}. ${title}`;

  const s=document.createElement("div");
  s.className="sub";
  s.textContent=sub||"";

  mid.append(t,s);

  const r=document.createElement("div");
  r.className="right";
  r.textContent=right??"";

  row.append(cover,mid,r);
  return row;
}

/* -------------------------------------------------- */
/* TOP */
/* -------------------------------------------------- */

async function refreshTop(){
  topList.innerHTML="";
  topMeta.textContent="Loading…";

  try{
    const j=await fetchJson(`/api/top?type=${topType}&period=${topPeriod}&limit=${topLimit}`);
    const items=j?.items||[];

    topMeta.textContent=`${topType} • ${topPeriod}`;
    topBadge.textContent=items.length;

    items.forEach((it,i)=>{
      topList.appendChild(
        rowItem(i+1,it.name,it.artist,it.playcount,it.image)
      );
    });

  }catch{
    topMeta.textContent="Failed to load";
  }
}

/* -------------------------------------------------- */
/* RECENT */
/* -------------------------------------------------- */

async function refreshRecent(){
  recentList.innerHTML="";
  recentMeta.textContent="Loading…";

  try{
    const j=await fetchJson("/api/history?limit=10");
    const items=j?.items||[];

    recentMeta.textContent=`${items.length} items`;

    items.forEach((it,i)=>{
      recentList.appendChild(
        rowItem(i+1,it.name,it.artist,"",it.image)
      );
    });

  }catch{
    recentMeta.textContent="Failed to load";
  }
}

/* -------------------------------------------------- */
/* PING */
/* -------------------------------------------------- */

async function refreshPing(){
  try{
    const j=await fetchJson("/api/ping");
    setStatus(!!j?.ok);
  }catch{
    setStatus(false);
  }
}

/* -------------------------------------------------- */
/* INIT */
/* -------------------------------------------------- */

function init(){

  workerHint.textContent=WORKER_BASE;

  tabBtns.forEach(b=>{
    b.onclick=()=>showTab(b.dataset.tab);
  });

  topTypeBtns.forEach(b=>{
    b.onclick=()=>{
      topType=b.dataset.topType;
      setSelected(topTypeBtns,x=>x===b);
      refreshTop();
    };
  });

  topPeriodBtns.forEach(b=>{
    b.onclick=()=>{
      topPeriod=b.dataset.topPeriod;
      setSelected(topPeriodBtns,x=>x===b);
      refreshTop();
    };
  });

  btnRefresh.onclick=()=>{
    refreshPing();
    if(currentTab==="now") refreshNow();
    if(currentTab==="top") refreshTop();
    if(currentTab==="recent") refreshRecent();
  };

  setSelected(tabBtns,b=>b.dataset.tab==="now");

  refreshPing();
  showTab("now");

  setInterval(refreshPing,15000);
  setInterval(()=>{ if(currentTab==="now") refreshNow(); },15000);
}

init();
})();