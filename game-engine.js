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

module.exports = { GameRoom, WORLD_SIZE, FOOD_COUNT, BOT_COUNT, TICK_MS, PALETTE, safeName, randomBotName };
