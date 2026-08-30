/**
 * Cloudflare Worker — Apex Worm static server + multiplayer WebSocket
 * JANGAN edit file ini secara manual untuk mengganti game.
 * File ini adalah TEMPLATE. Untuk update game:
 *   1. Edit index.html (dan/atau game-engine.js, durable-object.js)
 *   2. Jalankan: node build-worker.js
 *   3. Jalankan: wrangler deploy
 */

const HTML_PAGE = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>Apex Worm — Slither Battle</title>
<style>
  :root{
    --bg-1:#070a12;
    --bg-2:#0f1626;
    --accent:#39ff88;
    --accent-dark:#16c96a;
    --accent2:#00d4ff;
    --accent3:#ff3d81;
    --gold:#ffd23f;
    --panel:rgba(15,20,34,0.68);
    --panel-solid:#131b2e;
    --panel-border:rgba(255,255,255,0.09);
    --text:#eaf1ff;
    --text-dim:#8fa0bd;
    --danger:#ff4757;
  }
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;touch-action:none;}
  html,body{
    width:100%;height:100%;overflow:hidden;
    background:radial-gradient(ellipse at center, var(--bg-2) 0%, var(--bg-1) 100%);
    font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
    color:var(--text);
    position:fixed;inset:0;
  }
  #gameCanvas{position:absolute;inset:0;display:block;background:#070a12;}

  #vignette{
    position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.62) 100%);
    z-index:5;
  }
  #edgeFlash{
    position:absolute;inset:0;pointer-events:none;z-index:6;
    opacity:0;
    background:radial-gradient(ellipse at center, transparent 55%, rgba(255,140,60,0.5) 100%);
    transition:opacity .18s ease;
  }
  #edgeFlash.show{opacity:1;}

  #hud{
    position:absolute;top:0;left:0;right:0;
    display:flex;justify-content:space-between;align-items:flex-start;
    padding:14px 14px;pointer-events:none;z-index:10;
    gap:10px;
  }
  .hud-card{
    background:var(--panel);
    border:1px solid var(--panel-border);
    backdrop-filter:blur(14px);
    -webkit-backdrop-filter:blur(14px);
    border-radius:16px;
    box-shadow:0 6px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04);
  }

  #scoreCard{
    display:flex;align-items:center;gap:10px;
    padding:8px 16px 8px 8px;
    min-width:150px;
  }
  #ringWrap{position:relative;width:44px;height:44px;flex-shrink:0;}
  #ringWrap svg{width:44px;height:44px;transform:rotate(-90deg);}
  #ringWrap circle{fill:none;stroke-width:4;}
  #ringBg{stroke:rgba(255,255,255,0.08);}
  #ringFg{stroke:var(--accent);stroke-linecap:round;filter:drop-shadow(0 0 4px rgba(57,255,136,0.7));transition:stroke-dashoffset .25s ease;}
  #rankBadge{
    position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    font-size:12px;font-weight:800;color:var(--accent);
  }
  #scoreTextWrap{display:flex;flex-direction:column;gap:1px;}
  #scoreLabel{font-size:10px;color:var(--text-dim);letter-spacing:1.2px;text-transform:uppercase;font-weight:600;}
  #scoreValue{font-size:24px;font-weight:800;color:var(--text);letter-spacing:-0.5px;line-height:1.1;font-variant-numeric:tabular-nums;}
  #lengthValue{font-size:11px;color:var(--accent);font-weight:600;}

  #leaderboard{
    width:172px;padding:10px 12px;
    display:flex;flex-direction:column;gap:5px;
  }
  #leaderboard h3{
    font-size:10.5px;color:var(--text-dim);letter-spacing:1.2px;text-transform:uppercase;
    margin-bottom:2px;font-weight:700;display:flex;align-items:center;gap:5px;
  }
  .lb-row{display:flex;align-items:center;gap:7px;font-size:12.5px;padding:2px 0;border-radius:6px;transition:background .2s;}
  .lb-rank{width:14px;color:var(--text-dim);font-weight:800;font-size:11px;}
  .lb-row:nth-child(1) .lb-rank{color:var(--gold);}
  .lb-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;box-shadow:0 0 6px currentColor;}
  .lb-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);}
  .lb-score{color:var(--text-dim);font-variant-numeric:tabular-nums;font-size:11.5px;}
  .lb-row.me{background:rgba(57,255,136,0.1);}
  .lb-row.me .lb-name{color:var(--accent);font-weight:700;}

  #statusPills{
    position:absolute;top:78px;left:14px;z-index:10;
    display:flex;flex-direction:column;gap:6px;pointer-events:none;
  }
  .pill{
    display:flex;align-items:center;gap:6px;
    background:var(--panel);border:1px solid var(--panel-border);
    backdrop-filter:blur(10px);
    padding:6px 12px 6px 8px;border-radius:20px;
    font-size:11.5px;font-weight:700;color:var(--text-dim);
    opacity:0;transform:translateX(-12px);
    transition:opacity .2s ease, transform .2s ease;
  }
  .pill.show{opacity:1;transform:translateX(0);}
  .pill .dot{width:7px;height:7px;border-radius:50%;}
  #boostPill .dot{background:var(--accent2);box-shadow:0 0 8px var(--accent2);}
  #boostPill.show{color:var(--accent2);}

  #minimapWrap{
    position:absolute;bottom:18px;right:18px;z-index:10;
    width:112px;height:112px;border-radius:50%;
    background:var(--panel);border:2px solid var(--panel-border);
    box-shadow:0 6px 24px rgba(0,0,0,0.45), inset 0 0 20px rgba(0,0,0,0.3);
    overflow:hidden;pointer-events:none;
  }
  #minimapCanvas{width:100%;height:100%;}
  #minimapWrap::after{
    content:'';position:absolute;inset:0;border-radius:50%;
    box-shadow:inset 0 0 0 1px rgba(255,255,255,0.06);
    pointer-events:none;
  }

  #fpsCounter{
    position:absolute;top:14px;left:50%;transform:translateX(-50%);
    font-size:10.5px;color:var(--text-dim);z-index:10;pointer-events:none;
    background:var(--panel);padding:5px 11px;border-radius:10px;border:1px solid var(--panel-border);
    opacity:0.55;font-variant-numeric:tabular-nums;letter-spacing:0.5px;
  }

  #killFeed{
    position:absolute;top:14px;right:14px;margin-top:56px;
    z-index:9;display:flex;flex-direction:column;gap:6px;align-items:flex-end;
    pointer-events:none;
  }
  .kill-toast{
    background:var(--panel);border:1px solid var(--panel-border);backdrop-filter:blur(10px);
    padding:6px 12px;border-radius:10px;font-size:11.5px;color:var(--text-dim);
    animation:toastIn .25s ease, toastOut .4s ease 2.6s forwards;
    white-space:nowrap;
  }
  .kill-toast.join-toast{color:var(--accent);border-color:rgba(57,255,136,0.35);}
  @keyframes toastIn{from{opacity:0;transform:translateX(20px);}to{opacity:1;transform:translateX(0);}}
  @keyframes toastOut{to{opacity:0;transform:translateX(20px);}}

  #connStatus{
    position:absolute;top:14px;left:14px;z-index:30;
    display:flex;align-items:center;gap:7px;
    background:var(--panel);border:1px solid var(--panel-border);backdrop-filter:blur(10px);
    padding:6px 12px 6px 10px;border-radius:20px;font-size:11px;color:var(--text-dim);font-weight:600;
    transition:opacity .3s ease;
  }
  #connStatus .conn-dot{width:7px;height:7px;border-radius:50%;background:var(--danger);flex-shrink:0;}
  #connStatus.online .conn-dot{background:var(--accent);box-shadow:0 0 6px var(--accent);}
  #connStatus.hide{opacity:0;pointer-events:none;}

  #boostBtn{
    position:absolute;z-index:20;
    width:80px;height:80px;border-radius:50%;
    background:radial-gradient(circle at 35% 30%, #263355, #0f1626 72%);
    border:2px solid rgba(255,255,255,0.12);
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 8px 22px rgba(0,0,0,0.55), inset 0 1px 1px rgba(255,255,255,0.09);
    transition:transform .1s ease, box-shadow .15s ease, border-color .15s ease;
  }
  #boostBtn::after{
    content:'';position:absolute;inset:-2px;border-radius:50%;
    border:2px solid transparent;
    background:conic-gradient(var(--accent2) calc(var(--boost-pct,100) * 1%), transparent 0) border-box;
    -webkit-mask:linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0);
    -webkit-mask-composite:xor;mask-composite:exclude;
    opacity:0.9;
  }
  #boostBtn svg{width:34px;height:34px;fill:var(--accent2);filter:drop-shadow(0 0 6px rgba(0,212,255,0.6));z-index:1;}
  #boostBtn.active{
    transform:scale(0.9);
    box-shadow:0 0 26px rgba(0,212,255,0.75), inset 0 1px 1px rgba(255,255,255,0.15);
    border-color:var(--accent2);
  }
  #boostBtn.depleted{opacity:0.45;}

  #joystickZone{
    position:absolute;z-index:20;
    display:flex;align-items:center;justify-content:center;
  }
  #joystickBase{
    width:132px;height:132px;border-radius:50%;
    background:radial-gradient(circle at 40% 35%, rgba(255,255,255,0.07), rgba(7,10,18,0.4) 70%);
    border:2px solid rgba(255,255,255,0.14);
    position:relative;
    box-shadow:inset 0 2px 14px rgba(0,0,0,0.45), 0 6px 18px rgba(0,0,0,0.35);
  }
  #joystickBase::before{
    content:'';position:absolute;inset:14px;border-radius:50%;
    border:1px dashed rgba(255,255,255,0.08);
  }
  #joystickStick{
    width:56px;height:56px;border-radius:50%;
    background:radial-gradient(circle at 35% 30%, #5dffab, #16a367 78%);
    position:absolute;top:50%;left:50%;
    transform:translate(-50%,-50%);
    box-shadow:0 4px 14px rgba(0,0,0,0.5), 0 0 20px rgba(57,255,136,0.5), inset 0 2px 3px rgba(255,255,255,0.4);
    pointer-events:none;
    transition:box-shadow .15s;
  }
  #joystickZone.active #joystickStick{
    box-shadow:0 4px 14px rgba(0,0,0,0.5), 0 0 32px rgba(57,255,136,0.9), inset 0 2px 3px rgba(255,255,255,0.4);
  }

  body.portrait #joystickZone{
    left:50%;bottom:30px;transform:translateX(-50%);
    width:150px;height:150px;
  }
  body.portrait #boostBtn{ right:26px;bottom:170px; }

  body.landscape #joystickZone{
    left:28px;bottom:28px;
    width:150px;height:150px;
  }
  body.landscape #boostBtn{ right:28px;bottom:150px; }

  .overlay{
    position:absolute;inset:0;z-index:100;
    display:flex;align-items:center;justify-content:center;
    background:
      radial-gradient(ellipse at 30% 20%, rgba(57,255,136,0.06), transparent 45%),
      radial-gradient(ellipse at 70% 80%, rgba(0,212,255,0.06), transparent 45%),
      radial-gradient(ellipse at center, rgba(15,22,38,0.97) 0%, rgba(7,10,18,0.99) 100%);
    backdrop-filter:blur(6px);
    animation:overlayFade .3s ease;
  }
  @keyframes overlayFade{from{opacity:0;}to{opacity:1;}}
  .overlay.hidden{display:none;}

  .panel-box{
    width:min(92vw,400px);
    max-height:92vh;
    overflow-y:auto;
    background:linear-gradient(180deg, rgba(24,32,52,0.85), rgba(15,20,34,0.9));
    border:1px solid var(--panel-border);
    border-radius:24px;
    padding:34px 26px 28px;
    text-align:center;
    box-shadow:0 24px 70px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06);
    animation:popIn .4s cubic-bezier(.2,1.1,.4,1);
  }
  @keyframes popIn{from{transform:scale(0.88) translateY(16px);opacity:0;}to{transform:scale(1) translateY(0);opacity:1;}}

  .logo{
    font-size:42px;font-weight:900;letter-spacing:-1.5px;
    background:linear-gradient(135deg, var(--accent), var(--accent2));
    -webkit-background-clip:text;background-clip:text;color:transparent;
    margin-bottom:2px;
    filter:drop-shadow(0 4px 18px rgba(57,255,136,0.25));
  }
  .logo-icon{font-size:30px;display:inline-block;margin-right:2px;filter:drop-shadow(0 0 10px rgba(57,255,136,0.6));}
  .subtitle{color:var(--text-dim);font-size:13px;margin-bottom:2px;font-weight:500;}
  .menu-credit{color:var(--text-dim);font-size:11px;margin-bottom:24px;font-weight:500;opacity:0.65;letter-spacing:0.3px;}

  #footerCredit{
    position:absolute;bottom:6px;right:14px;z-index:9;
    font-size:10.5px;color:rgba(255,255,255,0.32);
    font-weight:600;letter-spacing:0.2px;
    pointer-events:none;
    text-shadow:0 1px 3px rgba(0,0,0,0.5);
  }

  #nameInput{
    width:100%;padding:15px 16px;border-radius:14px;
    background:rgba(255,255,255,0.05);border:1.5px solid var(--panel-border);
    color:var(--text);font-size:15px;text-align:center;outline:none;font-weight:600;
    margin-bottom:16px;transition:border-color .2s, background .2s;
  }
  #nameInput:focus{border-color:var(--accent);background:rgba(255,255,255,0.08);}

  .section-label{
    font-size:10.5px;color:var(--text-dim);letter-spacing:1.2px;text-transform:uppercase;
    font-weight:700;margin-bottom:10px;text-align:left;
  }
  .color-row{display:flex;justify-content:center;gap:9px;margin-bottom:22px;flex-wrap:wrap;}
  .color-dot{
    width:30px;height:30px;border-radius:50%;cursor:pointer;
    border:2px solid transparent;transition:transform .15s, border-color .15s, box-shadow .15s;
    position:relative;
  }
  .color-dot.selected{border-color:#fff;transform:scale(1.18);box-shadow:0 0 14px currentColor;}

  #playBtn{
    width:100%;padding:16px;border:none;border-radius:16px;
    background:linear-gradient(135deg, var(--accent), var(--accent-dark));
    color:#04180d;font-size:17px;font-weight:800;letter-spacing:0.3px;
    cursor:pointer;box-shadow:0 10px 26px rgba(57,255,136,0.35), inset 0 1px 0 rgba(255,255,255,0.3);
    transition:transform .12s ease, box-shadow .12s ease;
    display:flex;align-items:center;justify-content:center;gap:8px;
  }
  #playBtn:active{transform:scale(0.97);box-shadow:0 4px 14px rgba(57,255,136,0.3);}

  .hint-grid{
    margin-top:20px;display:flex;gap:10px;
  }
  .hint-item{
    flex:1;background:rgba(255,255,255,0.03);border:1px solid var(--panel-border);
    border-radius:12px;padding:10px 8px;font-size:10.5px;color:var(--text-dim);line-height:1.4;
  }
  .hint-item .hi-icon{font-size:18px;display:block;margin-bottom:4px;}

  #deathIconWrap{
    width:76px;height:76px;border-radius:50%;margin:0 auto 14px;
    background:radial-gradient(circle at 35% 30%, rgba(255,71,87,0.25), rgba(255,71,87,0.05));
    border:1.5px solid rgba(255,71,87,0.35);
    display:flex;align-items:center;justify-content:center;font-size:34px;
    box-shadow:0 0 30px rgba(255,71,87,0.25);
  }
  #deathTitle{font-size:24px;font-weight:800;color:var(--text);margin-bottom:4px;letter-spacing:-0.3px;}
  #deathCause{font-size:12.5px;color:var(--text-dim);margin-bottom:22px;}

  #deathStatsGrid{
    display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:22px;
  }
  .stat-box{
    background:rgba(255,255,255,0.04);border:1px solid var(--panel-border);
    border-radius:14px;padding:14px 10px;
  }
  .stat-box.wide{grid-column:1/-1;background:linear-gradient(135deg, rgba(57,255,136,0.1), rgba(0,212,255,0.06));border-color:rgba(57,255,136,0.2);}
  .stat-num{font-size:22px;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;}
  .stat-box.wide .stat-num{color:var(--accent);font-size:28px;}
  .stat-lbl{font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.8px;margin-top:2px;font-weight:600;}

  #newRecordBadge{
    display:none;
    background:linear-gradient(135deg, var(--gold), #ff9d3d);
    color:#3a2400;font-size:11.5px;font-weight:800;letter-spacing:0.5px;
    padding:6px 14px;border-radius:20px;margin-bottom:16px;
    box-shadow:0 6px 16px rgba(255,210,63,0.35);
  }
  #newRecordBadge.show{display:inline-block;}

  #respawnBtn{
    width:100%;padding:16px;border:none;border-radius:16px;
    background:linear-gradient(135deg, var(--accent), var(--accent-dark));
    color:#04180d;font-size:16px;font-weight:800;
    cursor:pointer;box-shadow:0 10px 26px rgba(57,255,136,0.3);
    transition:transform .12s ease;margin-bottom:10px;
  }
  #respawnBtn:active{transform:scale(0.97);}
  #menuBtn{
    width:100%;padding:13px;border:1.5px solid var(--panel-border);border-radius:16px;
    background:rgba(255,255,255,0.04);color:var(--text-dim);font-size:14px;font-weight:700;
    cursor:pointer;transition:background .15s, color .15s;
  }
  #menuBtn:active{background:rgba(255,255,255,0.08);}

  #loadingScreen{
    position:absolute;inset:0;z-index:200;
    background:var(--bg-1);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:18px;
  }
  .spinner{
    width:46px;height:46px;border-radius:50%;
    border:3px solid rgba(57,255,136,0.15);
    border-top-color:var(--accent);
    animation:spin 0.8s linear infinite;
  }
  @keyframes spin{to{transform:rotate(360deg);}}

  ::selection{background:transparent;}
  ::-webkit-scrollbar{width:0;height:0;}
</style>
</head>
<body class="portrait">

<div id="loadingScreen">
  <div class="spinner"></div>
  <div style="color:var(--text-dim);font-size:13px;letter-spacing:1px;">MEMUAT APEX WORM...</div>
</div>

<canvas id="gameCanvas"></canvas>
<div id="vignette"></div>
<div id="edgeFlash"></div>

<div id="hud">
  <div id="scoreCard" class="hud-card">
    <div id="ringWrap">
      <svg viewBox="0 0 44 44">
        <circle id="ringBg" cx="22" cy="22" r="18"></circle>
        <circle id="ringFg" cx="22" cy="22" r="18" stroke-dasharray="113" stroke-dashoffset="113"></circle>
      </svg>
      <div id="rankBadge">#1</div>
    </div>
    <div id="scoreTextWrap">
      <span id="scoreLabel">SKOR</span>
      <span id="scoreValue">0</span>
      <span id="lengthValue">Panjang: 0</span>
    </div>
  </div>
  <div id="leaderboard" class="hud-card">
    <h3>🏆 Peringkat</h3>
    <div id="lbList"></div>
  </div>
</div>

<div id="statusPills">
  <div id="boostPill" class="pill"><span class="dot"></span>BOOST</div>
</div>

<div id="killFeed"></div>

<div id="connStatus"><span class="conn-dot"></span><span id="connStatusText">Menghubungkan...</span></div>

<div id="fpsCounter">60 FPS</div>

<div id="minimapWrap">
  <canvas id="minimapCanvas" width="112" height="112"></canvas>
</div>

<div id="joystickZone">
  <div id="joystickBase">
    <div id="joystickStick"></div>
  </div>
</div>

<div id="boostBtn" style="--boost-pct:100">
  <svg viewBox="0 0 24 24"><path d="M13 2L3 14h7v8l10-12h-7z"/></svg>
</div>

<div id="startScreen" class="overlay">
  <div class="panel-box">
    <div class="logo"><span class="logo-icon">🐍</span>APEX WORM</div>
    <div class="subtitle">Makan, tumbuh, kuasai arena — melawan pemain asli!</div>
    <div class="menu-credit">Created by Justine Louise</div>
    <input id="nameInput" type="text" placeholder="Masukkan nama kamu" maxlength="14">
    <div class="section-label">Pilih Warna</div>
    <div class="color-row" id="colorRow"></div>
    <button id="playBtn">▶ MAIN SEKARANG</button>
    <div class="hint-grid">
      <div class="hint-item"><span class="hi-icon">🕹️</span>Joystick untuk arahkan ular</div>
      <div class="hint-item"><span class="hi-icon">⚡</span>Tombol boost untuk lari cepat</div>
      <div class="hint-item"><span class="hi-icon">🌀</span>Badan sendiri &amp; tembok aman dilewati</div>
    </div>
  </div>
</div>

<div id="deathScreen" class="overlay hidden">
  <div class="panel-box">
    <div id="deathIconWrap">💀</div>
    <div id="newRecordBadge">🏅 REKOR BARU!</div>
    <div id="deathTitle">Permainan Berakhir</div>
    <div id="deathCause">Ditabrak oleh ular lain</div>
    <div id="deathStatsGrid">
      <div class="stat-box"><div class="stat-num" id="statLength">0</div><div class="stat-lbl">Panjang</div></div>
      <div class="stat-box"><div class="stat-num" id="statRank">-</div><div class="stat-lbl">Peringkat</div></div>
      <div class="stat-box wide"><div class="stat-num" id="statScore">0</div><div class="stat-lbl">Skor Akhir</div></div>
    </div>
    <button id="respawnBtn">🔄 MAIN LAGI</button>
    <button id="menuBtn">Kembali ke Menu</button>
  </div>
</div>

<div id="footerCredit">Created by Justine Louise</div>

<script>
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
function randomName(){
  const adjs=["Cepat","Ganas","Licin","Lapar","Kejam","Gesit","Buas","Nakal","Sakti","Hebat"];
  const nouns=["Naga","Ular","Cobra","Viper","Mamba","Python","Boa","Raja","Petir","Badai"];
  return adjs[Math.floor(Math.random()*adjs.length)]+nouns[Math.floor(Math.random()*nouns.length)];
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

function handleServerMessage(msg){
  if(msg.type === 'welcome'){
    myId = msg.id;
    if(msg.worldSize) WORLD_SIZE = msg.worldSize;
  } else if(msg.type === 'state'){
    applySnapshot(msg);
  }
}

function applySnapshot(snap){
  food = snap.food || [];
  worms = snap.worms || [];
  wormsById = new Map(worms.map(w=>[w.id, w]));
  player = myId ? (wormsById.get(myId) || null) : null;

  if(player){
    if(!gameRunning && player.alive){
      // we joined / respawned successfully
      gameRunning = true;
      startScreen.classList.add('hidden');
      deathScreen.classList.add('hidden');
    }
    if(gameRunning && !player.alive){
      lastDeathInfo = { cause: player.deathCause || 'Ditabrak ular lain', length: player.segs ? player.segs.length : 0 };
      gameRunning = false;
      setTimeout(showDeathScreen, 200);
    }
  }

  if(snap.events && snap.events.length){
    for(const ev of snap.events){
      if(ev.type === 'join'){
        addJoinToast(ev.name);
      } else if(ev.type === 'kill'){
        addKillToast(\`\${escapeHtml(ev.name)} \${ev.isBot ? '' : ''}mati — \${escapeHtml(ev.cause||'')}\`);
      } else if(ev.type === 'leave'){
        // silent, keep feed clean
      }
    }
  }
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
  el.textContent = \`🟢 \${name} bergabung ke game\`;
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
  joystickStick.style.transform = \`translate(calc(-50% + \${dx}px), calc(-50% + \${dy}px))\`;
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
  ctx.strokeStyle = \`rgba(255,140,60,\${0.35+pulse*0.3})\`;
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
    ctx.font = \`700 \${Math.max(11,12*camera.zoom)}px Segoe UI, sans-serif\`;
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
  return \`rgb(\${r},\${g},\${b})\`;
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

function updateCamera(){
  if(!player || !player.alive || !player.segs || !player.segs.length) return;
  const head = player.segs[0];
  camera.x += (head.x - camera.x)*0.18;
  camera.y += (head.y - camera.y)*0.18;
  const targetZoom = Math.max(0.55, 1 - player.segs.length/2200);
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
    lengthValue.textContent = 'Panjang: ' + (player.segs ? player.segs.length : 0);

    const milestone = 500;
    const progress = (sc % milestone) / milestone;
    ringFg.setAttribute('stroke-dashoffset', String(RING_CIRC - progress*RING_CIRC));
  }

  boostPill.classList.toggle('show', !!(player && player.boosting));

  if(player && player.segs){
    const pct = player.segs.length > 12 ? 100 : Math.max(0, (player.segs.length-START_LENGTH)/(12-START_LENGTH)*100);
    boostBtn.style.setProperty('--boost-pct', String(pct));
    boostBtn.classList.toggle('depleted', player.segs.length<=12);
  }

  if(frameCount % 15 === 0){
    const sorted = worms.filter(w=>w.alive).sort((a,b)=>(b.segs?b.segs.length:0)-(a.segs?a.segs.length:0)).slice(0,10);
    lbList.innerHTML = sorted.map((w,i)=>\`
      <div class="lb-row \${w.id===myId?'me':''}">
        <span class="lb-rank">\${i+1}</span>
        <span class="lb-dot" style="color:\${w.color};background:\${w.color};"></span>
        <span class="lb-name">\${escapeHtml(w.name)}</span>
        <span class="lb-score">\${w.segs?w.segs.length:0}</span>
      </div>
    \`).join('');

    if(player){
      const allSorted = worms.filter(w=>w.alive).sort((a,b)=>(b.segs?b.segs.length:0)-(a.segs?a.segs.length:0));
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

function gameLoop(now){
  requestAnimationFrame(gameLoop);
  const dt = Math.min(0.05, (now-lastTime)/1000);
  lastTime = now;
  fpsSmooth += ((1/dt) - fpsSmooth)*0.05;
  if(frameCount%20===0) fpsCounter.textContent = Math.round(fpsSmooth)+' FPS';

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
      sendInput(angle, boosting && player.segs.length>12);
    } else {
      sendInput(player.angle, boosting && player.segs.length>12);
    }
  }

  updateCamera();

  ctx.clearRect(0,0,W,H);
  drawGrid();
  drawWorldBorder();
  drawFood();
  for(let i=0;i<worms.length;i++) drawWorm(worms[i]);
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
</script>
</body>
</html>
`;

/**
 * game-engine.js
 * Logika game otoritatif (server-side) untuk Apex Worm.
 * Dipakai bersama oleh:
 *   - worker.js (Cloudflare Durable Object) untuk deploy online
 *   - server.js (Node biasa) untuk main lokal di Termux/LAN
 *
 * Format module: CommonJS (untuk server.js) sekaligus bisa di-embed
 * langsung sebagai teks ke dalam Durable Object (lihat build-worker.js).
 */

const WORLD_SIZE = 5000;
const FOOD_COUNT = 900;
const BOT_COUNT = 14;
const BASE_SPEED = 2.6;
const BOOST_SPEED = 5.0;
const TURN_RATE = 0.16;
const START_LENGTH = 20;
const FOOD_RADIUS_MIN = 4;
const FOOD_RADIUS_MAX = 8;
const WALL_MARGIN = 14;
const TICK_HZ = 20;
const TICK_MS = 1000 / TICK_HZ;

const PALETTE = [
  "#39ff88", "#00d4ff", "#ff3d81", "#ffd23f", "#a45cff",
  "#ff6b3d", "#3dffea", "#ff3d3d", "#8bff3d", "#3d7bff"
];

const BOT_ADJ = ["Cepat", "Ganas", "Licin", "Lapar", "Kejam", "Gesit", "Buas", "Nakal", "Sakti", "Hebat"];
const BOT_NOUN = ["Naga", "Ular", "Cobra", "Viper", "Mamba", "Python", "Boa", "Raja", "Petir", "Badai"];

function rand(a, b) { return a + Math.random() * (b - a); }
function dist2(x1, y1, x2, y2) { const dx = x1 - x2, dy = y1 - y2; return dx * dx + dy * dy; }
function clampAngleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function lerpAngle(a, b, t) { const d = clampAngleDiff(a, b); return a + d * t; }
function randomBotName() {
  return BOT_ADJ[Math.floor(Math.random() * BOT_ADJ.length)] + BOT_NOUN[Math.floor(Math.random() * BOT_NOUN.length)];
}
function safeName(name) {
  const cleaned = String(name || '').replace(/[<>]/g, '').trim().slice(0, 14);
  return cleaned || randomBotName();
}

class GameRoom {
  constructor() {
    this.food = [];
    this.worms = new Map(); // id -> worm
    this.nextId = 1;
    this.events = []; // {type:'join'|'kill'|'leave', ...} to flush each tick
    this.spawnFood(FOOD_COUNT);
    for (let i = 0; i < BOT_COUNT; i++) this.spawnBot();
  }

  spawnFood(n) {
    for (let i = 0; i < n; i++) {
      this.food.push({
        x: rand(0, WORLD_SIZE), y: rand(0, WORLD_SIZE),
        r: rand(FOOD_RADIUS_MIN, FOOD_RADIUS_MAX),
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)]
      });
    }
  }

  makeWorm(name, color, isBot, socketId) {
    const x = rand(WORLD_SIZE * 0.2, WORLD_SIZE * 0.8);
    const y = rand(WORLD_SIZE * 0.2, WORLD_SIZE * 0.8);
    const angle = rand(0, Math.PI * 2);
    const segs = [];
    for (let i = 0; i < START_LENGTH; i++) {
      segs.push({ x: x - Math.cos(angle) * i * 6, y: y - Math.sin(angle) * i * 6 });
    }
    const id = String(this.nextId++);
    const worm = {
      id, name: safeName(name), color: color || PALETTE[Math.floor(Math.random() * PALETTE.length)],
      isBot, socketId: socketId || null,
      segs, angle, targetAngle: angle, boosting: false,
      alive: true, score: START_LENGTH, radius: 7,
      boostCooldown: 0, aiTimer: 0, aiTarget: { x, y }, invulnT: 0.6
    };
    this.worms.set(id, worm);
    return worm;
  }

  spawnBot() {
    return this.makeWorm(randomBotName(), PALETTE[Math.floor(Math.random() * PALETTE.length)], true);
  }

  addPlayer(socketId, name, color) {
    const worm = this.makeWorm(name, color, false, socketId);
    this.events.push({ type: 'join', name: worm.name, id: worm.id });
    return worm;
  }

  removePlayer(socketId) {
    for (const [id, w] of this.worms) {
      if (w.socketId === socketId) {
        this.worms.delete(id);
        if (w.alive) this.events.push({ type: 'leave', name: w.name });
        return;
      }
    }
  }

  setInput(socketId, targetAngle, boosting) {
    for (const w of this.worms.values()) {
      if (w.socketId === socketId && w.alive) {
        if (typeof targetAngle === 'number' && !Number.isNaN(targetAngle)) w.targetAngle = targetAngle;
        w.boosting = !!boosting;
        return;
      }
    }
  }

  growWorm(w, amount) {
    w.score += amount;
    const need = Math.max(0, Math.floor(w.score) - w.segs.length);
    for (let i = 0; i < need; i++) {
      const tail = w.segs[w.segs.length - 1];
      w.segs.push({ x: tail.x, y: tail.y });
    }
    w.radius = 7 + Math.min(14, w.segs.length / 40);
  }

  killWorm(w, cause) {
    w.alive = false;
    w.deathCause = cause || 'Ditabrak ular lain';
    for (let i = 0; i < w.segs.length; i += 2) {
      this.food.push({
        x: w.segs[i].x + rand(-8, 8), y: w.segs[i].y + rand(-8, 8),
        r: rand(6, 10), color: w.color
      });
    }
    this.events.push({ type: 'kill', name: w.name, cause: w.deathCause, isBot: w.isBot });
  }

  updateAI(w, dt) {
    w.aiTimer -= dt;
    if (w.aiTimer <= 0) {
      w.aiTimer = rand(1.5, 3.5);
      const center = WORLD_SIZE / 2;
      const bias = 0.3;
      w.aiTarget.x = rand(0, WORLD_SIZE) * (1 - bias) + center * bias;
      w.aiTarget.y = rand(0, WORLD_SIZE) * (1 - bias) + center * bias;
    }
    const head = w.segs[0];
    let bestFood = null, bestD = 220 * 220;
    for (let i = 0; i < this.food.length; i += 3) {
      const f = this.food[i];
      const d = dist2(head.x, head.y, f.x, f.y);
      if (d < bestD) { bestD = d; bestFood = f; }
    }
    let avoidX = 0, avoidY = 0, avoiding = false;
    for (const other of this.worms.values()) {
      if (other === w || !other.alive) continue;
      const oh = other.segs[0];
      if (dist2(head.x, head.y, oh.x, oh.y) < 140 * 140 && other.segs.length > w.segs.length) {
        avoidX += head.x - oh.x; avoidY += head.y - oh.y; avoiding = true;
      }
      for (let s = 0; s < other.segs.length; s += 4) {
        const seg = other.segs[s];
        if (dist2(head.x, head.y, seg.x, seg.y) < 60 * 60) {
          avoidX += head.x - seg.x; avoidY += head.y - seg.y; avoiding = true;
        }
      }
    }
    let targetX, targetY;
    if (avoiding) { targetX = head.x + avoidX; targetY = head.y + avoidY; }
    else if (bestFood) { targetX = bestFood.x; targetY = bestFood.y; }
    else { targetX = w.aiTarget.x; targetY = w.aiTarget.y; }

    const margin = 160;
    if (head.x < margin || head.x > WORLD_SIZE - margin) targetX = WORLD_SIZE / 2;
    if (head.y < margin || head.y > WORLD_SIZE - margin) targetY = WORLD_SIZE / 2;

    w.targetAngle = Math.atan2(targetY - head.y, targetX - head.x);
    w.boosting = avoiding && Math.random() < 0.02;
  }

  updateWorm(w, dt) {
    if (!w.alive) return;
    if (w.invulnT > 0) w.invulnT -= dt;
    w.angle = lerpAngle(w.angle, w.targetAngle, TURN_RATE);
    const speed = (w.boosting && w.segs.length > 12) ? BOOST_SPEED : BASE_SPEED;

    if (w.boosting && w.segs.length > 12) {
      w.boostCooldown += dt;
      if (w.boostCooldown > 0.08) {
        w.boostCooldown = 0;
        w.score = Math.max(START_LENGTH, w.score - 1);
        w.segs.pop();
        const tail = w.segs[w.segs.length - 1];
        this.food.push({ x: tail.x + rand(-4, 4), y: tail.y + rand(-4, 4), r: rand(2, 4), color: w.color });
      }
    } else { w.boostCooldown = 0; }

    const head = w.segs[0];
    let nx = head.x + Math.cos(w.angle) * speed;
    let ny = head.y + Math.sin(w.angle) * speed;
    let bounced = false;
    if (nx < WALL_MARGIN) { nx = WALL_MARGIN; bounced = true; }
    if (nx > WORLD_SIZE - WALL_MARGIN) { nx = WORLD_SIZE - WALL_MARGIN; bounced = true; }
    if (ny < WALL_MARGIN) { ny = WALL_MARGIN; bounced = true; }
    if (ny > WORLD_SIZE - WALL_MARGIN) { ny = WORLD_SIZE - WALL_MARGIN; bounced = true; }
    if (bounced) {
      const center = WORLD_SIZE / 2;
      const toCenter = Math.atan2(center - ny, center - nx);
      w.angle = lerpAngle(w.angle, toCenter, 0.25);
      w.targetAngle = w.angle;
    }
    w.segs.unshift({ x: nx, y: ny });
    const targetLen = Math.max(START_LENGTH, Math.floor(w.score));
    while (w.segs.length > targetLen) w.segs.pop();
  }

  checkFoodCollision(w) {
    const head = w.segs[0];
    const eatR = w.radius + 4;
    for (let i = this.food.length - 1; i >= 0; i--) {
      const f = this.food[i];
      const rr = eatR + f.r;
      if (dist2(head.x, head.y, f.x, f.y) < rr * rr) {
        this.growWorm(w, f.r * 0.5);
        this.food.splice(i, 1);
      }
    }
  }

  checkWormCollisions() {
    const list = Array.from(this.worms.values());
    for (const w of list) {
      if (!w.alive || w.invulnT > 0) continue;
      const head = w.segs[0];
      for (const other of list) {
        if (other === w || !other.alive) continue;
        for (let s = 0; s < other.segs.length; s += 2) {
          const seg = other.segs[s];
          const rr = w.radius * 0.8 + other.radius * 0.8;
          if (dist2(head.x, head.y, seg.x, seg.y) < rr * rr) {
            this.killWorm(w, `Ditabrak oleh ${other.name}`);
            break;
          }
        }
        if (!w.alive) break;
      }
    }
  }

  respawnDeadBots() {
    for (const [id, w] of this.worms) {
      if (!w.alive && w.isBot) this.worms.delete(id);
    }
    while (this.countBots() < BOT_COUNT) this.spawnBot();
  }

  countBots() {
    let n = 0;
    for (const w of this.worms.values()) if (w.isBot) n++;
    return n;
  }

  removeDeadPlayers() {
    // dead human players stay visible briefly on client via death event; server can drop them
    for (const [id, w] of this.worms) {
      if (!w.alive && !w.isBot) this.worms.delete(id);
    }
  }

  tick(dt) {
    for (const w of this.worms.values()) {
      if (w.isBot && w.alive) this.updateAI(w, dt);
    }
    for (const w of this.worms.values()) this.updateWorm(w, dt);
    for (const w of this.worms.values()) if (w.alive) this.checkFoodCollision(w);
    this.checkWormCollisions();
    if (this.food.length < FOOD_COUNT) this.spawnFood(Math.min(6, FOOD_COUNT - this.food.length));
    this.respawnDeadBots();
    this.removeDeadPlayers();
  }

  snapshot() {
    const worms = [];
    for (const w of this.worms.values()) {
      worms.push({
        id: w.id, name: w.name, color: w.color, isBot: w.isBot,
        segs: w.segs, angle: w.angle, radius: w.radius,
        boosting: w.boosting, alive: w.alive, score: w.score,
        invuln: w.invulnT > 0
      });
    }
    const flushedEvents = this.events;
    this.events = [];
    return { t: Date.now(), food: this.food, worms, events: flushedEvents, worldSize: WORLD_SIZE };
  }
}

/**
 * durable-object.js
 * Durable Object Cloudflare yang menjalankan game loop otoritatif Apex Worm
 * dan mengelola semua koneksi WebSocket pemain dalam satu room.
 *
 * File ini digabungkan otomatis ke dalam worker.js oleh build-worker.js.
 * JANGAN import Node built-ins di sini — harus kompatibel Workers runtime.
 */

class ApexWormRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.room = new GameRoom();
    this.sockets = new Map(); // ws -> { socketId }
    this.nextSocketId = 1;
    this.tickHandle = null;
  }

  ensureLoop() {
    if (this.tickHandle) return;
    this.tickHandle = setInterval(() => {
      if (this.sockets.size === 0) {
        clearInterval(this.tickHandle);
        this.tickHandle = null;
        return;
      }
      this.room.tick(TICK_MS / 1000);
      const snap = this.room.snapshot();
      const str = JSON.stringify({ type: 'state', ...snap });
      for (const ws of this.sockets.keys()) {
        try { ws.send(str); } catch (e) { /* socket may be closing */ }
      }
    }, TICK_MS);
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const socketId = String(this.nextSocketId++);
    this.sockets.set(server, { socketId, worm: null });
    this.ensureLoop();

    server.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      const entry = this.sockets.get(server);
      if (!entry) return;

      if (msg.type === 'hello') {
        const worm = this.room.addPlayer(socketId, safeName(msg.name), msg.color);
        entry.worm = worm;
        server.send(JSON.stringify({ type: 'welcome', id: worm.id, worldSize: WORLD_SIZE }));
      } else if (msg.type === 'input' && entry.worm) {
        this.room.setInput(socketId, msg.angle, msg.boosting);
      } else if (msg.type === 'respawn') {
        if (entry.worm) this.room.removePlayer(socketId);
        const worm = this.room.addPlayer(socketId, safeName(msg.name), msg.color);
        entry.worm = worm;
        server.send(JSON.stringify({ type: 'welcome', id: worm.id, worldSize: WORLD_SIZE }));
      }
    });

    const cleanup = () => {
      const entry = this.sockets.get(server);
      if (entry) this.room.removePlayer(socketId);
      this.sockets.delete(server);
    };
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }
}


export { ApexWormRoom };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const id = env.APEX_WORM_ROOM.idFromName("global-room");
      const stub = env.APEX_WORM_ROOM.get(id);
      return stub.fetch(request);
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(HTML_PAGE, {
        headers: {
          "content-type": "text/html; charset=UTF-8",
          "cache-control": "public, max-age=300",
        },
      });
    }

    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  },
};
