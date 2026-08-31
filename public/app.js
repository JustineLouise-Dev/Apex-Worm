(function(){
"use strict";

/* =========================================================
   APEX WORM — multiplayer slither-like game (networked client)
   Server otoritatif menjalankan physics, AI bot, collision, food.
   Client ini hanya mengirim input & merender state dari server.
   ========================================================= */

let WORLD_SIZE = 5000;
const START_LENGTH = 20;

const PALETTE = [
  "#39ff88","#00d4ff","#ff3d81","#ffd23f","#a45cff",
  "#ff6b3d","#3dffea","#ff3d3d","#8bff3d","#3d7bff"
];

let bestScore = 0;
try{ bestScore = parseInt(localStorage.getItem('apexworm_best')||'0',10) || 0; }catch(e){ bestScore = 0; }

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimapCanvas');
const mctx = minimapCanvas.getContext('2d');

let DPR = Math.min(window.devicePixelRatio || 1, 2);
let W = 0, H = 0;

function resize(){
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W+'px';
  canvas.style.height = H+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);

  const isPortrait = H >= W;
  document.body.classList.toggle('portrait', isPortrait);
  document.body.classList.toggle('landscape', !isPortrait);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', ()=>setTimeout(resize,50));
resize();

function rand(a,b){ return a + Math.random()*(b-a); }
function dist2(x1,y1,x2,y2){ const dx=x1-x2, dy=y1-y2; return dx*dx+dy*dy; }
// Sama seperti nama bot di server: dirakit dari beberapa pola berbeda
// (bukan cuma Sifat+Hewan) supaya terasa lebih seperti nama pemain asli.
function randomName(){
  const titles=["Sang","Raja","Ratu","Master","Legenda","Fajar","Senja"];
  const names1=["Raka","Bayu","Dewa","Arka","Kirana","Zaki","Nara","Ardan","Vino","Elang","Rangga","Satria"];
  const adjs=["Kilat","Bara","Petir","Badai","Senja","Gaib","Abadi","Liar","Merah","Emas"];
  const nouns=["Naga","Cobra","Mamba","Python","Anaconda","Basilisk","Serpent","Wyrm"];
  const pattern = Math.floor(Math.random()*4);
  if(pattern===0) return titles[Math.floor(Math.random()*titles.length)]+" "+names1[Math.floor(Math.random()*names1.length)];
  if(pattern===1) return names1[Math.floor(Math.random()*names1.length)]+nouns[Math.floor(Math.random()*nouns.length)];
  if(pattern===2) return adjs[Math.floor(Math.random()*adjs.length)]+nouns[Math.floor(Math.random()*nouns.length)];
  return names1[Math.floor(Math.random()*names1.length)]+String(Math.floor(10+Math.random()*89));
}
function escapeHtml(s){
  return s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* =========================================================
   NETWORK LAYER
   ========================================================= */
let ws = null;
let myId = null;
let connected = false;
let wsRetryDelay = 1000;
let joinedNames = new Set(); // track names we've already announced, to avoid dupes on reconnect

let food = [];
let worms = [];       // latest snapshot from server: array of worm objects {id,name,color,segs,...}
let wormsById = new Map();
let particles = [];
let player = null;    // reference into wormsById for our own worm, refreshed each snapshot
let camera = {x: WORLD_SIZE/2, y: WORLD_SIZE/2, zoom: 1};
let gameRunning = false;
let frameCount = 0;
let currentRank = 1;
let pendingName = randomName();
let pendingColor = PALETTE[0];
let lastDeathInfo = null;

const connStatusEl = document.getElementById('connStatus');
const connStatusText = document.getElementById('connStatusText');

function wsUrl(){
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return proto + '//' + location.host + '/ws';
}

function setConnStatus(online, text){
  connStatusEl.classList.toggle('online', online);
  connStatusText.textContent = text;
}

function connectWS(){
  setConnStatus(false, 'Menghubungkan...');
  try{
    ws = new WebSocket(wsUrl());
  }catch(e){
    scheduleReconnect();
    return;
  }

  ws.addEventListener('open', ()=>{
    connected = true;
    wsRetryDelay = 1000;
    setConnStatus(true, 'Online');
    setTimeout(()=>{ connStatusEl.classList.add('hide'); }, 1800);
    if(gameRunning || pendingJoinAfterOpen){
      sendHello();
      pendingJoinAfterOpen = false;
    }
    startPingLoop();
  });

  ws.addEventListener('message', (ev)=>{
    let msg;
    try{ msg = JSON.parse(ev.data); }catch(e){ return; }
    handleServerMessage(msg);
  });

  ws.addEventListener('close', ()=>{
    connected = false;
    setConnStatus(false, 'Terputus — menyambung ulang...');
    connStatusEl.classList.remove('hide');
    stopPingLoop();
    updatePingDisplay(null);
    scheduleReconnect();
  });

  ws.addEventListener('error', ()=>{
    try{ ws.close(); }catch(e){}
  });
}

function scheduleReconnect(){
  setTimeout(()=>{
    wsRetryDelay = Math.min(8000, wsRetryDelay*1.5);
    connectWS();
  }, wsRetryDelay);
}

let pendingJoinAfterOpen = false;

function sendHello(){
  if(!ws || ws.readyState !== 1) { pendingJoinAfterOpen = true; return; }
  ws.send(JSON.stringify({type:'hello', name: pendingName, color: pendingColor}));
}

function sendRespawn(){
  if(!ws || ws.readyState !== 1) { pendingJoinAfterOpen = true; return; }
  ws.send(JSON.stringify({type:'respawn', name: pendingName, color: pendingColor}));
}

function sendInput(angle, boosting){
  if(!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({type:'input', angle, boosting}));
}

/* =========================================================
   PING / LATENCY MEASUREMENT
   Small ping/pong pair sent every 2s (negligible bandwidth: a few bytes),
   used purely to measure round-trip time and show it in the HUD, and to
   drive the interpolation buffer delay below so playback stays smooth
   even when the network is a bit jittery.
   ========================================================= */
let pingIntervalHandle = null;
let pingSmoothed = null; // exponentially smoothed RTT in ms, null until first sample

function startPingLoop(){
  stopPingLoop();
  sendPing();
  pingIntervalHandle = setInterval(sendPing, 2000);
}
function stopPingLoop(){
  if(pingIntervalHandle){ clearInterval(pingIntervalHandle); pingIntervalHandle = null; }
}
function sendPing(){
  if(!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({type:'ping', t: performance.now()}));
}
function handlePong(sentAt){
  const rtt = performance.now() - sentAt;
  pingSmoothed = pingSmoothed === null ? rtt : pingSmoothed + (rtt - pingSmoothed) * 0.25;
  updatePingDisplay(pingSmoothed);
}
function updatePingDisplay(ms){
  if(ms === null || ms === undefined){
    pingStatEl.textContent = '-- ms';
    pingStatEl.classList.remove('warn','bad');
    return;
  }
  const rounded = Math.round(ms);
  pingStatEl.textContent = rounded + ' ms';
  pingStatEl.classList.toggle('warn', rounded >= 120 && rounded < 250);
  pingStatEl.classList.toggle('bad', rounded >= 250);
}

function handleServerMessage(msg){
  if(msg.type === 'welcome'){
    myId = msg.id;
    if(msg.worldSize) WORLD_SIZE = msg.worldSize;
  } else if(msg.type === 'pong'){
    handlePong(msg.t);
  } else if(msg.type === 'state'){
    applySnapshot(msg);
  }
}

let foodById = new Map(); // persistent food state, kept in sync via add/remove deltas (bandwidth optimization)

// Interpolation buffer: the server only broadcasts at 20Hz, but we render at
// up to 60fps, and network jitter means snapshots don't arrive at perfectly
// even intervals. We keep a short history of recent snapshots and always
// render slightly in the past (a fixed "interpolation delay"), interpolating
// between the two buffered snapshots that straddle the render time. This is
// the standard technique used by io-style games and fast-paced multiplayer
// titles generally: rendering a little behind real time means we almost
// always have two real snapshots to blend between, instead of having to
// guess (extrapolate) when a packet is a few ms late — which is what was
// causing visible stutter before.
let snapshotHistory = []; // [{recvTime, worms: Map}, ...] oldest..newest, capped
const SNAPSHOT_HISTORY_MAX = 8;
let snapshotIntervalEst = 50; // running estimate of ms between snapshots (~1000/TICK_HZ)
let snapshotJitterEst = 0;    // running estimate of how much the gap between snapshots varies
let lastSnapshotRecvTime = 0;
const INTERP_DELAY_MIN = 30;  // ms of deliberate render lag, floor — kept small so play feels real-time
const INTERP_DELAY_MAX = 220; // ms of deliberate render lag, ceiling (caps out on bad/jittery connections)

function currentInterpDelay(){
  // The delay only needs to cover actual network jitter, not the full tick
  // interval — on a clean connection consecutive snapshots arrive close to
  // exactly on schedule, so a small fixed floor plus a jitter-proportional
  // term keeps rendering close to real time. On a rougher connection,
  // jitter (and ping) push the delay up automatically so we still avoid
  // extrapolating past a stale snapshot.
  const jitterPart = snapshotJitterEst * 2.5;
  const pingPart = pingSmoothed ? pingSmoothed * 0.35 : 0;
  return Math.max(INTERP_DELAY_MIN, Math.min(INTERP_DELAY_MAX, jitterPart + pingPart));
}

function unpackSegs(flat){
  // server sends body points as a flat [x,y,x,y,...] array to save bandwidth;
  // expand back to {x,y} objects so the existing drawing code needs no changes
  const out = [];
  if(!flat) return out;
  for(let i=0;i<flat.length;i+=2) out.push({x:flat[i], y:flat[i+1]});
  return out;
}

function applySnapshot(snap){
  if(snap.full){
    foodById = new Map((snap.food||[]).map(f=>[f[0], {x:f[1], y:f[2], r:f[3], color:f[4]}]));
  } else {
    if(snap.foodAdd) for(const f of snap.foodAdd) foodById.set(f[0], {x:f[1], y:f[2], r:f[3], color:f[4]});
    if(snap.foodDel) for(const id of snap.foodDel) foodById.delete(id);
  }
  food = Array.from(foodById.values());

  const rawWorms = (snap.worms||[]).map(w => ({...w, segs: unpackSegs(w.segs)}));
  const rawById = new Map(rawWorms.map(w=>[w.id, w]));

  const now = performance.now();
  if(lastSnapshotRecvTime){
    const gap = now - lastSnapshotRecvTime;
    if(gap > 0 && gap < 500){
      snapshotIntervalEst += (gap - snapshotIntervalEst) * 0.15;
      // Track how much each gap deviates from the expected interval — this
      // is the actual signal we want to size the render delay against,
      // rather than the raw interval itself (which is ~constant at 50ms
      // regardless of how jittery the network is).
      const deviation = Math.abs(gap - snapshotIntervalEst);
      snapshotJitterEst += (deviation - snapshotJitterEst) * 0.2;
    }
  }
  lastSnapshotRecvTime = now;

  snapshotHistory.push({ recvTime: now, worms: rawById });
  if(snapshotHistory.length > SNAPSHOT_HISTORY_MAX) snapshotHistory.shift();

  // worms/wormsById/player are refreshed here for logic that needs
  // authoritative (non-interpolated) data — HUD numbers, alive checks, etc.
  // Rendering uses the interpolated copy built in interpolateWorms().
  worms = rawWorms;
  wormsById = rawById;
  player = myId ? (wormsById.get(myId) || null) : null;

  if(player){
    if(!gameRunning && player.alive){
      // we joined / respawned successfully
      gameRunning = true;
      startScreen.classList.add('hidden');
      deathScreen.classList.add('hidden');
    }
    if(gameRunning && !player.alive){
      lastDeathInfo = { cause: player.deathCause || 'Ditabrak ular lain', length: player.len || 0 };
      gameRunning = false;
      setTimeout(showDeathScreen, 200);
    }
  }

  if(snap.events && snap.events.length){
    for(const ev of snap.events){
      if(ev.type === 'join'){
        addJoinToast(ev.name);
      } else if(ev.type === 'kill'){
        addKillToast(`${escapeHtml(ev.name)} ${ev.isBot ? '' : ''}mati — ${escapeHtml(ev.cause||'')}`);
      } else if(ev.type === 'leave'){
        // silent, keep feed clean
      }
    }
  }
}

function lerp(a,b,t){ return a + (b-a)*t; }
function lerpAngleShort(a,b,t){
  let d = b - a;
  while(d > Math.PI) d -= Math.PI*2;
  while(d < -Math.PI) d += Math.PI*2;
  return a + d*t;
}

function blendWormMaps(prevById, nextById, t){
  const out = [];
  for(const [id, nw] of nextById){
    const pw = prevById.get(id);
    if(!pw || !pw.alive || !nw.alive || pw.segs.length !== nw.segs.length){
      out.push(nw);
      continue;
    }
    const segs = new Array(nw.segs.length);
    for(let i=0;i<nw.segs.length;i++){
      segs[i] = { x: lerp(pw.segs[i].x, nw.segs[i].x, t), y: lerp(pw.segs[i].y, nw.segs[i].y, t) };
    }
    out.push({ ...nw, segs, angle: lerpAngleShort(pw.angle, nw.angle, t) });
  }
  return out;
}

// Given the two most recent snapshots, projects every worm's position
// forward (or to any blend factor t, where t=1 is exactly the latest
// snapshot and t>1 extrapolates beyond it) based on the velocity implied by
// those two snapshots. Shared by extrapolateOwnWorm() and by
// interpolateWorms()'s low-delay fallback below. Capped by the caller so a
// late/missing snapshot just pauses briefly instead of overshooting.
function extrapolateWormMap(prevById, nextById, t){
  const out = [];
  for(const [id, nw] of nextById){
    const pw = prevById.get(id);
    if(!pw || !pw.alive || !nw.alive || pw.segs.length !== nw.segs.length){
      out.push(nw);
      continue;
    }
    const segs = new Array(nw.segs.length);
    for(let i=0;i<nw.segs.length;i++){
      const vx = nw.segs[i].x - pw.segs[i].x;
      const vy = nw.segs[i].y - pw.segs[i].y;
      segs[i] = { x: nw.segs[i].x + vx * (t - 1), y: nw.segs[i].y + vy * (t - 1) };
    }
    out.push({ ...nw, segs, angle: lerpAngleShort(pw.angle, nw.angle, t) });
  }
  return out;
}

// Produces a smoothly blended array of worms for rendering. We pick a
// render timestamp slightly in the past (currentInterpDelay(), sized to
// actual measured jitter) and find the two buffered snapshots that
// straddle it, blending real data between them — this keeps play close to
// real time on a clean connection while still smoothing out jitter. If the
// render time is newer than our latest snapshot (common when the delay is
// small and the connection is fast), we extrapolate forward a short,
// capped amount instead of freezing on the last snapshot.
function interpolateWorms(){
  const n = snapshotHistory.length;
  if(n === 0) return [];
  if(n === 1) return Array.from(snapshotHistory[0].worms.values());

  const renderTime = performance.now() - currentInterpDelay();
  const latest = snapshotHistory[n-1];

  if(renderTime >= latest.recvTime){
    const prev = snapshotHistory[n-2];
    const dt = latest.recvTime - prev.recvTime;
    if(dt <= 0) return Array.from(latest.worms.values());
    // extrapolate at most one server-tick-worth forward to avoid runaway
    // overshoot if a snapshot is late or drops
    const exT = 1 + Math.max(0, Math.min((renderTime - latest.recvTime) / dt, 1));
    return extrapolateWormMap(prev.worms, latest.worms, exT);
  }

  // find the newest pair [a,b] with a.recvTime <= renderTime <= b.recvTime
  let a = snapshotHistory[0], b = snapshotHistory[0];
  for(let i=0;i<n-1;i++){
    if(snapshotHistory[i].recvTime <= renderTime && snapshotHistory[i+1].recvTime >= renderTime){
      a = snapshotHistory[i]; b = snapshotHistory[i+1];
      break;
    }
    a = snapshotHistory[i]; b = snapshotHistory[i+1];
  }
  if(renderTime <= snapshotHistory[0].recvTime){
    a = b = snapshotHistory[0];
  }

  if(a === b) return Array.from(a.worms.values());
  const span = b.recvTime - a.recvTime;
  const t = span > 0 ? Math.max(0, Math.min(1, (renderTime - a.recvTime) / span)) : 1;
  return blendWormMaps(a.worms, b.worms, t);
}

// Our own worm can't use the delayed buffer above (that would make steering
// feel laggy/behind the camera). Instead we extrapolate slightly *forward*
// from the two latest real snapshots: estimate the head's velocity from how
// far it moved between them, then project a little further along that
// velocity for the time elapsed since the last snapshot arrived. This keeps
// our own worm's motion smooth at 60fps between the server's 20Hz updates,
// without ever looking delayed. Capped short so a missed/late packet just
// pauses briefly instead of overshooting.
function extrapolateOwnWorm(){
  if(!myId) return null;
  const n = snapshotHistory.length;
  if(n === 0) return null;
  const latest = snapshotHistory[n-1];
  const nw = latest.worms.get(myId);
  if(!nw || !nw.alive) return nw || null;
  if(n < 2) return nw;

  const prev = snapshotHistory[n-2];
  const pw = prev.worms.get(myId);
  if(!pw || !pw.alive || pw.segs.length !== nw.segs.length) return nw;

  const dt = latest.recvTime - prev.recvTime;
  if(dt <= 0) return nw;

  const sinceLatest = performance.now() - latest.recvTime;
  // extrapolate at most one server-tick-worth forward to avoid runaway
  // overshoot if a snapshot is late or drops
  const exT = Math.max(0, Math.min(sinceLatest / dt, 1));

  const segs = new Array(nw.segs.length);
  for(let i=0;i<nw.segs.length;i++){
    const vx = nw.segs[i].x - pw.segs[i].x;
    const vy = nw.segs[i].y - pw.segs[i].y;
    segs[i] = { x: nw.segs[i].x + vx * exT, y: nw.segs[i].y + vy * exT };
  }
  const angle = lerpAngleShort(pw.angle, nw.angle, 1 + exT);
  return { ...nw, segs, angle };
}

const killFeedEl = document.getElementById('killFeed');
function addKillToast(text){
  const el = document.createElement('div');
  el.className = 'kill-toast';
  el.textContent = text;
  killFeedEl.appendChild(el);
  setTimeout(()=>{ el.remove(); }, 3200);
  while(killFeedEl.children.length > 5){ killFeedEl.removeChild(killFeedEl.firstChild); }
}
function addJoinToast(name){
  const el = document.createElement('div');
  el.className = 'kill-toast join-toast';
  el.textContent = `🟢 ${name} bergabung ke game`;
  killFeedEl.appendChild(el);
  setTimeout(()=>{ el.remove(); }, 3200);
  while(killFeedEl.children.length > 5){ killFeedEl.removeChild(killFeedEl.firstChild); }
}

/* =========================================================
   INPUT: joystick, boost, keyboard, mouse
   ========================================================= */
const joystickZone = document.getElementById('joystickZone');
const joystickBase = document.getElementById('joystickBase');
const joystickStick = document.getElementById('joystickStick');
const boostBtn = document.getElementById('boostBtn');
const boostPill = document.getElementById('boostPill');

let joyActive = false;
let joyVector = {x:0, y:0};
let joyPointerId = null;

function joyBaseRect(){ return joystickBase.getBoundingClientRect(); }

function handleJoyStart(id, clientX, clientY){
  joyActive = true;
  joyPointerId = id;
  joystickZone.classList.add('active');
  updateJoy(clientX, clientY);
}
function updateJoy(clientX, clientY){
  const rect = joyBaseRect();
  const cx = rect.left + rect.width/2;
  const cy = rect.top + rect.height/2;
  let dx = clientX - cx;
  let dy = clientY - cy;
  const maxR = rect.width/2 - 12;
  const d = Math.hypot(dx,dy);
  if(d > maxR){ dx = dx/d*maxR; dy = dy/d*maxR; }
  joystickStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  const norm = maxR>0 ? maxR : 1;
  joyVector.x = dx/norm;
  joyVector.y = dy/norm;
}
function handleJoyEnd(){
  joyActive = false;
  joyPointerId = null;
  joystickZone.classList.remove('active');
  joyVector.x = 0; joyVector.y = 0;
  joystickStick.style.transform = 'translate(-50%,-50%)';
}
joystickZone.addEventListener('pointerdown', (e)=>{
  joystickZone.setPointerCapture(e.pointerId);
  handleJoyStart(e.pointerId, e.clientX, e.clientY);
});
joystickZone.addEventListener('pointermove', (e)=>{
  if(joyActive && e.pointerId === joyPointerId) updateJoy(e.clientX, e.clientY);
});
joystickZone.addEventListener('pointerup', handleJoyEnd);
joystickZone.addEventListener('pointercancel', handleJoyEnd);

let boosting = false;
boostBtn.addEventListener('pointerdown', (e)=>{
  boostBtn.setPointerCapture(e.pointerId);
  boosting = true;
  boostBtn.classList.add('active');
});
function stopBoost(){
  boosting = false;
  boostBtn.classList.remove('active');
}
boostBtn.addEventListener('pointerup', stopBoost);
boostBtn.addEventListener('pointercancel', stopBoost);
boostBtn.addEventListener('pointerleave', stopBoost);

let mouseAngleActive = false;
let keys = {};
window.addEventListener('keydown', (e)=>{
  keys[e.key.toLowerCase()] = true;
  if(e.key === ' ') boosting = true;
});
window.addEventListener('keyup', (e)=>{
  keys[e.key.toLowerCase()] = false;
  if(e.key === ' ') boosting = false;
});
canvas.addEventListener('mousemove', (e)=>{
  mouseAngleActive = true;
  mouseTarget.x = e.clientX;
  mouseTarget.y = e.clientY;
});
canvas.addEventListener('mousedown', ()=>{ boosting = true; });
window.addEventListener('mouseup', ()=>{ boosting = false; });

let mouseTarget = {x:0,y:0};

let edgeFlashT = 0;
const edgeFlashEl = document.getElementById('edgeFlash');

/* =========================================================
   RENDERING
   ========================================================= */
function worldToScreen(x,y){
  return {
    x: (x - camera.x)*camera.zoom + W/2,
    y: (y - camera.y)*camera.zoom + H/2
  };
}

function drawGrid(){
  ctx.save();
  const gridSize = 60*camera.zoom;
  const offX = (-camera.x*camera.zoom) % gridSize;
  const offY = (-camera.y*camera.zoom) % gridSize;
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for(let x = offX; x < W; x += gridSize){ ctx.moveTo(x,0); ctx.lineTo(x,H); }
  for(let y = offY; y < H; y += gridSize){ ctx.moveTo(0,y); ctx.lineTo(W,y); }
  ctx.stroke();

  const bigGrid = gridSize*5;
  const boX = (-camera.x*camera.zoom) % bigGrid;
  const boY = (-camera.y*camera.zoom) % bigGrid;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath();
  for(let x = boX; x < W; x += bigGrid){ ctx.moveTo(x,0); ctx.lineTo(x,H); }
  for(let y = boY; y < H; y += bigGrid){ ctx.moveTo(0,y); ctx.lineTo(W,y); }
  ctx.stroke();
  ctx.restore();
}

function drawWorldBorder(){
  const tl = worldToScreen(0,0);
  const br = worldToScreen(WORLD_SIZE, WORLD_SIZE);
  ctx.save();
  const pulse = 0.5 + Math.sin(frameCount*0.05)*0.15;
  ctx.strokeStyle = `rgba(255,140,60,${0.35+pulse*0.3})`;
  ctx.lineWidth = 10;
  ctx.shadowColor = 'rgba(255,140,60,0.5)';
  ctx.shadowBlur = 26;
  ctx.strokeRect(tl.x, tl.y, br.x-tl.x, br.y-tl.y);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,200,120,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(tl.x, tl.y, br.x-tl.x, br.y-tl.y);
  ctx.restore();
}

function drawFood(){
  const viewMargin = 60;
  for(let i=0;i<food.length;i++){
    const f = food[i];
    const s = worldToScreen(f.x,f.y);
    if(s.x < -viewMargin || s.x > W+viewMargin || s.y < -viewMargin || s.y > H+viewMargin) continue;
    const pulseR = f.r*camera.zoom;
    ctx.beginPath();
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 9;
    ctx.arc(s.x, s.y, pulseR, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.shadowBlur = 0;
    ctx.arc(s.x - pulseR*0.3, s.y - pulseR*0.3, pulseR*0.28, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawWorm(w){
  if(!w.alive) return;
  const segs = w.segs;
  if(!segs || !segs.length) return;
  const r = w.radius*camera.zoom;
  const flicker = w.invuln ? (Math.sin(frameCount*0.4) > 0 ? 0.4 : 1) : 1;

  ctx.save();
  ctx.globalAlpha = flicker;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.strokeStyle = w.color;
  ctx.globalAlpha = 0.25*flicker;
  ctx.lineWidth = r*2.4;
  ctx.shadowColor = w.color;
  ctx.shadowBlur = w.boosting ? 24 : 11;
  traceWormPath(segs);
  ctx.stroke();
  ctx.globalAlpha = 1*flicker;

  for(let i=segs.length-1;i>=0;i-=2){
    const s = worldToScreen(segs[i].x, segs[i].y);
    if(s.x < -30 || s.x>W+30 || s.y<-30 || s.y>H+30) continue;
    const t = i/segs.length;
    ctx.beginPath();
    ctx.fillStyle = shadeColor(w.color, -t*35);
    ctx.arc(s.x, s.y, r*(1-t*0.25), 0, Math.PI*2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;

  const head = worldToScreen(segs[0].x, segs[0].y);
  ctx.beginPath();
  ctx.fillStyle = w.color;
  ctx.arc(head.x, head.y, r*1.15, 0, Math.PI*2);
  ctx.fill();

  const eyeOff = r*0.55;
  const perp = w.angle + Math.PI/2;
  for(const s of [-1,1]){
    const ex = head.x + Math.cos(w.angle)*r*0.5 + Math.cos(perp)*eyeOff*s;
    const ey = head.y + Math.sin(w.angle)*r*0.5 + Math.sin(perp)*eyeOff*s;
    ctx.beginPath();
    ctx.fillStyle = '#0a0e17';
    ctx.arc(ex, ey, r*0.28, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = '#fff';
    ctx.arc(ex + Math.cos(w.angle)*r*0.08, ey + Math.sin(w.angle)*r*0.08, r*0.12, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.restore();

  if(r > 3){
    ctx.save();
    ctx.font = `700 ${Math.max(11,12*camera.zoom)}px Segoe UI, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = w.id === myId ? 'rgba(57,255,136,0.95)' : 'rgba(255,255,255,0.85)';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(w.name, head.x, head.y - r*1.8 - 6);
    ctx.restore();
  }
}

function traceWormPath(segs){
  const first = worldToScreen(segs[0].x, segs[0].y);
  ctx.moveTo(first.x, first.y);
  for(let i=1;i<segs.length;i++){
    const s = worldToScreen(segs[i].x, segs[i].y);
    ctx.lineTo(s.x, s.y);
  }
}

function shadeColor(hex, percent){
  const num = parseInt(hex.slice(1),16);
  let r = (num>>16) + percent;
  let g = ((num>>8)&0xff) + percent;
  let b = (num&0xff) + percent;
  r = Math.max(0,Math.min(255,r));
  g = Math.max(0,Math.min(255,g));
  b = Math.max(0,Math.min(255,b));
  return `rgb(${r},${g},${b})`;
}

function drawParticles(){
  for(let i=particles.length-1;i>=0;i--){
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.94; p.vy *= 0.94;
    p.life--;
    if(p.life<=0){ particles.splice(i,1); continue; }
    const s = worldToScreen(p.x,p.y);
    ctx.beginPath();
    ctx.globalAlpha = Math.max(0,p.life/20);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 6;
    ctx.arc(s.x,s.y,(p.size||3)*camera.zoom,0,Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}

function drawMinimap(){
  mctx.clearRect(0,0,112,112);
  mctx.fillStyle = 'rgba(10,14,23,0.4)';
  mctx.beginPath();
  mctx.arc(56,56,56,0,Math.PI*2);
  mctx.fill();
  mctx.strokeStyle = 'rgba(255,140,60,0.5)';
  mctx.lineWidth = 3;
  mctx.beginPath();
  mctx.arc(56,56,53,0,Math.PI*2);
  mctx.stroke();

  const scale = 102/WORLD_SIZE;
  for(let i=0;i<worms.length;i++){
    const w = worms[i];
    if(!w.alive || !w.segs || !w.segs.length) continue;
    const isMe = w.id === myId;
    const h = w.segs[0];
    mctx.beginPath();
    mctx.fillStyle = isMe ? '#39ff88' : 'rgba(255,255,255,0.4)';
    if(isMe){ mctx.shadowColor = '#39ff88'; mctx.shadowBlur = 8; }
    mctx.arc(5+h.x*scale, 5+h.y*scale, isMe?3.5:1.5, 0, Math.PI*2);
    mctx.fill();
    mctx.shadowBlur = 0;
  }
}

function updateCamera(ownWorm){
  // Camera tracks the extrapolated (smoothed, non-delayed) own-worm head so
  // steering stays responsive and the camera never drifts apart from the
  // drawn body.
  const p = ownWorm || player;
  if(!p || !p.alive || !p.segs || !p.segs.length) return;
  const head = p.segs[0];
  camera.x += (head.x - camera.x)*0.18;
  camera.y += (head.y - camera.y)*0.18;
  const targetZoom = Math.max(0.55, 1 - (player&&player.len||0)/2200);
  camera.zoom += (targetZoom - camera.zoom)*0.06;
}

/* =========================================================
   HUD
   ========================================================= */
const scoreValue = document.getElementById('scoreValue');
const lengthValue = document.getElementById('lengthValue');
const lbList = document.getElementById('lbList');
const ringFg = document.getElementById('ringFg');
const rankBadge = document.getElementById('rankBadge');
const RING_CIRC = 113;

function updateHUD(){
  if(player){
    const sc = Math.floor(player.score - START_LENGTH >= 0 ? (player.score-START_LENGTH)*10 : 0);
    scoreValue.textContent = sc;
    lengthValue.textContent = 'Panjang: ' + (player.len || 0);

    const milestone = 500;
    const progress = (sc % milestone) / milestone;
    ringFg.setAttribute('stroke-dashoffset', String(RING_CIRC - progress*RING_CIRC));
  }

  boostPill.classList.toggle('show', !!(player && player.boosting));

  if(player && player.len != null){
    const pct = player.len > 12 ? 100 : Math.max(0, (player.len-START_LENGTH)/(12-START_LENGTH)*100);
    boostBtn.style.setProperty('--boost-pct', String(pct));
    boostBtn.classList.toggle('depleted', player.len<=12);
  }

  if(frameCount % 15 === 0){
    const sorted = worms.filter(w=>w.alive).sort((a,b)=>(b.len||0)-(a.len||0)).slice(0,10);
    lbList.innerHTML = sorted.map((w,i)=>`
      <div class="lb-row ${w.id===myId?'me':''}">
        <span class="lb-rank">${i+1}</span>
        <span class="lb-dot" style="color:${w.color};background:${w.color};"></span>
        <span class="lb-name">${escapeHtml(w.name)}</span>
        <span class="lb-score">${w.len||0}</span>
      </div>
    `).join('');

    if(player){
      const allSorted = worms.filter(w=>w.alive).sort((a,b)=>(b.len||0)-(a.len||0));
      const idx = allSorted.findIndex(w=>w.id===myId);
      currentRank = idx>=0 ? idx+1 : allSorted.length+1;
      rankBadge.textContent = '#'+currentRank;
    }
  }

  if(edgeFlashT > 0){
    edgeFlashT -= 1/60;
    edgeFlashEl.classList.add('show');
    edgeFlashEl.style.opacity = Math.min(1, edgeFlashT/0.25)*0.7;
  } else {
    edgeFlashEl.classList.remove('show');
  }
}

/* =========================================================
   MAIN LOOP
   ========================================================= */
let lastTime = performance.now();
let fpsSmooth = 60;
const fpsCounter = document.getElementById('fpsCounter');
const fpsValueEl = document.getElementById('fpsValue');
const pingStatEl = document.getElementById('pingStat');

function gameLoop(now){
  requestAnimationFrame(gameLoop);
  const dt = Math.min(0.05, (now-lastTime)/1000);
  lastTime = now;
  fpsSmooth += ((1/dt) - fpsSmooth)*0.05;
  if(frameCount%20===0) fpsValueEl.textContent = Math.round(fpsSmooth)+' FPS';

  frameCount++;

  if(gameRunning && player && player.alive){
    let dx=0, dy=0;
    if(joyActive && (Math.abs(joyVector.x)>0.05 || Math.abs(joyVector.y)>0.05)){
      dx = joyVector.x; dy = joyVector.y;
    } else if(keys['w']||keys['a']||keys['s']||keys['d']||keys['arrowup']||keys['arrowdown']||keys['arrowleft']||keys['arrowright']){
      if(keys['w']||keys['arrowup']) dy -= 1;
      if(keys['s']||keys['arrowdown']) dy += 1;
      if(keys['a']||keys['arrowleft']) dx -= 1;
      if(keys['d']||keys['arrowright']) dx += 1;
    } else if(mouseAngleActive){
      dx = mouseTarget.x - W/2;
      dy = mouseTarget.y - H/2;
    }
    if(dx*dx+dy*dy > 0.001){
      const angle = Math.atan2(dy,dx);
      sendInput(angle, boosting && (player.len||0)>12);
    } else {
      sendInput(player.angle, boosting && (player.len||0)>12);
    }
  }

  const interpolated = interpolateWorms();
  // Our own worm can't use the delayed buffer above (that would make
  // steering feel laggy/behind the camera). Instead it's extrapolated
  // forward from the two latest real snapshots so it stays smooth at 60fps
  // without ever looking delayed — see extrapolateOwnWorm().
  const ownWorm = extrapolateOwnWorm();
  const renderList = interpolated.filter(w => w.id !== myId);
  if(ownWorm) renderList.push(ownWorm);
  updateCamera(ownWorm);

  ctx.clearRect(0,0,W,H);
  drawGrid();
  drawWorldBorder();
  drawFood();
  for(let i=0;i<renderList.length;i++) drawWorm(renderList[i]);
  drawParticles();
  drawMinimap();
  updateHUD();
}

/* =========================================================
   MENU / START / DEATH FLOW
   ========================================================= */
const startScreen = document.getElementById('startScreen');
const deathScreen = document.getElementById('deathScreen');
const nameInput = document.getElementById('nameInput');
const colorRow = document.getElementById('colorRow');
const playBtn = document.getElementById('playBtn');
const respawnBtn = document.getElementById('respawnBtn');
const menuBtn = document.getElementById('menuBtn');
const deathCauseEl = document.getElementById('deathCause');
const statLength = document.getElementById('statLength');
const statRank = document.getElementById('statRank');
const statScore = document.getElementById('statScore');
const newRecordBadge = document.getElementById('newRecordBadge');

let selectedColor = PALETTE[0];

PALETTE.forEach((c,i)=>{
  const dot = document.createElement('div');
  dot.className = 'color-dot' + (i===0?' selected':'');
  dot.style.background = c;
  dot.style.color = c;
  dot.addEventListener('click', ()=>{
    document.querySelectorAll('.color-dot').forEach(d=>d.classList.remove('selected'));
    dot.classList.add('selected');
    selectedColor = c;
  });
  colorRow.appendChild(dot);
});

nameInput.value = randomName();

function startGame(){
  const name = (nameInput.value || randomName()).trim().slice(0,14) || randomName();
  pendingName = name;
  pendingColor = selectedColor;
  killFeedEl.innerHTML = '';
  startScreen.classList.add('hidden');
  deathScreen.classList.add('hidden');
  if(connected){
    sendHello();
  } else {
    pendingJoinAfterOpen = true;
    connectWS();
  }
}

function showDeathScreen(){
  const info = lastDeathInfo || { cause:'Ditabrak ular lain', length:0 };
  const finalScore = Math.floor(Math.max(0,(info.length-START_LENGTH))*10);
  const isRecord = finalScore > bestScore;
  if(isRecord){
    bestScore = finalScore;
    try{ localStorage.setItem('apexworm_best', String(bestScore)); }catch(e){}
  }
  newRecordBadge.classList.toggle('show', isRecord);
  deathCauseEl.textContent = info.cause;
  statLength.textContent = info.length;
  statRank.textContent = '#'+currentRank;
  statScore.textContent = finalScore;
  deathScreen.classList.remove('hidden');
}

playBtn.addEventListener('click', ()=>{
  startGame();
});
respawnBtn.addEventListener('click', ()=>{
  const name = (nameInput.value || randomName()).trim().slice(0,14) || randomName();
  pendingName = name;
  pendingColor = selectedColor;
  deathScreen.classList.add('hidden');
  if(connected){
    sendRespawn();
  } else {
    pendingJoinAfterOpen = true;
    connectWS();
  }
});
menuBtn.addEventListener('click', ()=>{
  deathScreen.classList.add('hidden');
  startScreen.classList.remove('hidden');
  nameInput.value = randomName();
});

document.addEventListener('touchmove', (e)=>{ e.preventDefault(); }, {passive:false});
document.addEventListener('gesturestart', (e)=>{ e.preventDefault(); });

window.addEventListener('load', ()=>{
  setTimeout(()=>{
    document.getElementById('loadingScreen').style.display='none';
  }, 400);
});

resize();
connectWS();
requestAnimationFrame(gameLoop);

})();
