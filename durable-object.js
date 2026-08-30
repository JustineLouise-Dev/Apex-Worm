/**
 * durable-object.js
 * Durable Object Cloudflare yang menjalankan game loop otoritatif Apex Worm
 * dan mengelola semua koneksi WebSocket pemain dalam satu room.
 *
 * File ini digabungkan otomatis ke dalam worker.js oleh build-worker.js.
 * JANGAN import Node built-ins di sini — harus kompatibel Workers runtime.
 */

export class ApexWormRoom {
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
