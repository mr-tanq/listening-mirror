/* orb-engine.js (FULL FILE REPLACE)
   Listening Mirror — Neural Orb Engine
*/

(() => {

"use strict";

const TAU = Math.PI * 2;

function clamp01(v){
 return Math.max(0,Math.min(1,v));
}

class OrbEngine{

constructor(canvas){

this.canvas = canvas;
this.ctx = canvas.getContext("2d");

this.heat = 0.5;
this.flux = 0.5;
this.focus = 0.5;
this.depth = 0.5;

this.layers = {};
this.wrap = canvas.closest(".orb-wrap");

this.injectLayers();

this.lastFrame = 0;
this.running = false;

this.boundFrame = this.frame.bind(this);

}

injectLayers(){

const make = (cls,src)=>{

let img = this.wrap.querySelector("."+cls);

if(!img){

img = document.createElement("img");
img.className = "lmOrbLayer "+cls;
img.src = src;
img.decoding = "async";

this.wrap.appendChild(img);

}

return img;

};

this.layers = {

core: make("orbCore","./orb-assets/orb-core.png"),
threads: make("orbThreads","./orb-assets/orb-threads.png"),
particles: make("orbParticles","./orb-assets/orb-particles.png"),
halo: make("orbHalo","./orb-assets/orb-halo.png")

};

}

setSignals({heat,flux,focus,depth}){

if(Number.isFinite(heat)) this.heat = clamp01(heat);
if(Number.isFinite(flux)) this.flux = clamp01(flux);
if(Number.isFinite(focus)) this.focus = clamp01(focus);
if(Number.isFinite(depth)) this.depth = clamp01(depth);

}

start(){

if(this.running) return;

this.running = true;
requestAnimationFrame(this.boundFrame);

}

stop(){

this.running = false;

}
   resize(){

const rect = this.canvas.getBoundingClientRect();

const dpr = Math.min(window.devicePixelRatio || 1,2);

this.canvas.width = rect.width * dpr;
this.canvas.height = rect.height * dpr;

}

drawCore(time){

const ctx = this.ctx;

const w = this.canvas.width;
const h = this.canvas.height;

const cx = w/2;
const cy = h/2;

const radius = Math.min(w,h)*0.28;

ctx.clearRect(0,0,w,h);

const grad = ctx.createRadialGradient(
cx,cy,0,
cx,cy,radius
);

grad.addColorStop(0,"rgba(255,255,255,0.9)");
grad.addColorStop(0.3,"rgba(255,160,80,0.5)");
grad.addColorStop(0.7,"rgba(80,200,255,0.3)");
grad.addColorStop(1,"rgba(0,0,0,0)");

ctx.fillStyle = grad;

ctx.beginPath();
ctx.arc(cx,cy,radius,0,TAU);
ctx.fill();

}
   updateLayers(t){

const heat = this.heat;
const flux = this.flux;
const focus = this.focus;
const depth = this.depth;

const core = this.layers.core;
const threads = this.layers.threads;
const particles = this.layers.particles;
const halo = this.layers.halo;

const pulse = Math.sin(t*0.002)*0.04;

core.style.transform =
`scale(${1+focus*0.08+pulse}) rotate(${Math.sin(t*0.0008)*2}deg)`;

core.style.opacity =
0.45 + heat*0.4;

threads.style.transform =
`scale(${1.02+flux*0.05}) rotate(${t*0.02})`;

threads.style.opacity =
0.2 + flux*0.5;

particles.style.transform =
`scale(${1.05+depth*0.08}) rotate(${-t*0.01})`;

particles.style.opacity =
0.15 + depth*0.3;

halo.style.transform =
`scale(${1.1+depth*0.1}) rotate(${t*0.005})`;

halo.style.opacity =
0.1 + depth*0.25;

   }
   frame(time){

if(!this.running) return;

if(time-this.lastFrame>16){

this.lastFrame = time;

this.resize();

this.drawCore(time);

this.updateLayers(time);

}

requestAnimationFrame(this.boundFrame);

}

}

function mount(canvas){

const engine = new OrbEngine(canvas);

engine.start();

return engine;

}

window.LMOrbEngine = { mount };

})();
