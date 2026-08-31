/**
 * Server lokal untuk Termux / Node.js — Apex Worm
 * Menyajikan file statis (index.html) DAN menjalankan game multiplayer
 * otoritatif via WebSocket (tanpa dependency eksternal, pure Node).
 *
 * Cara jalankan di Termux:
 *   pkg install nodejs
 *   cd apexworm
 *   node server.js
 *   lalu buka http://localhost:8787 di browser HP
 *
 * Perangkat lain di WiFi yang sama bisa join lewat http://<ip-hp-kamu>:8787
 * Ganti port dengan: PORT=3000 node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const miniWS = require('./mini-ws.js');
const { GameRoom, TICK_MS, safeName } = require('./game-engine.js');

const PORT = process.env.PORT || 8787;
const ROOT = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const room = new GameRoom();
const clients = new Map(); // socketId -> MiniWSConnection
let nextSocketId = 1;

function broadcast(obj) {
  const str = JSON.stringify(obj);
  for (const conn of clients.values()) {
    if (conn.alive) conn.send(str);
  }
}

// Game loop tick
setInterval(() => {
  room.tick(TICK_MS / 1000);
  const snap = room.snapshot();
  broadcast({ type: 'state', ...snap });
}, TICK_MS);

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/health') { res.writeHead(200); res.end('OK'); return; }

  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404 Not Found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

server.on('upgrade', (req, socket, head) => {
  if (req.url.split('?')[0] !== '/ws') { socket.destroy(); return; }
  const conn = miniWS.upgrade(req, socket, head);
  if (!conn) { socket.destroy(); return; }

  const socketId = String(nextSocketId++);
  clients.set(socketId, conn);
  let worm = null;

  conn.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    if (msg.type === 'hello') {
      worm = room.addPlayer(socketId, safeName(msg.name), msg.color);
      conn.send(JSON.stringify({ type: 'welcome', id: worm.id, worldSize: 5000 }));
      conn.send(JSON.stringify({ type: 'state', ...room.snapshotFull() }));
    } else if (msg.type === 'input' && worm) {
      room.setInput(socketId, msg.angle, msg.boosting);
    } else if (msg.type === 'respawn') {
      if (worm) room.removePlayer(socketId);
      worm = room.addPlayer(socketId, safeName(msg.name), msg.color);
      conn.send(JSON.stringify({ type: 'welcome', id: worm.id, worldSize: 5000 }));
      conn.send(JSON.stringify({ type: 'state', ...room.snapshotFull() }));
    } else if (msg.type === 'ping') {
      // Echo the client's own timestamp back immediately so it can compute
      // round-trip time locally, without needing clock sync with the server.
      conn.send(JSON.stringify({ type: 'pong', t: msg.t }));
    }
  });

  conn.on('close', () => {
    clients.delete(socketId);
    if (worm) room.removePlayer(socketId);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('  🐛 APEX WORM server berjalan!');
  console.log('  Lokal:    http://localhost:' + PORT);
  console.log('  Jaringan: http://<ip-hp-kamu>:' + PORT);
  console.log('  (Tekan Ctrl+C untuk berhenti)');
  console.log('========================================');
});
