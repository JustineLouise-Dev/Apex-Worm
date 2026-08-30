/**
 * mini-ws.js
 * Implementasi WebSocket server minimal, TANPA dependency eksternal (pure Node),
 * supaya server.js tetap bisa jalan di Termux hanya dengan `node server.js`
 * tanpa perlu `npm install`.
 *
 * Mendukung: handshake RFC6455, text frame masked (client->server) & unmasked (server->client),
 * fragmentasi sederhana tidak didukung (tidak dibutuhkan untuk payload kecil kita), ping/pong, close.
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
}

function encodeFrame(payload, opcode = 1) {
  const data = Buffer.from(payload);
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, data]);
}

class MiniWSConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.alive = true;
    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => { this.alive = false; this.emit('close'); });
    socket.on('error', () => { this.alive = false; this.emit('close'); });
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const frame = this._tryParseFrame();
      if (!frame) break;
    }
  }

  _tryParseFrame() {
    const buf = this.buffer;
    if (buf.length < 2) return null;
    const byte0 = buf[0];
    const byte1 = buf[1];
    const opcode = byte0 & 0x0f;
    const masked = !!(byte1 & 0x80);
    let len = byte1 & 0x7f;
    let offset = 2;

    if (len === 126) {
      if (buf.length < 4) return null;
      len = buf.readUInt16BE(2);
      offset = 4;
    } else if (len === 127) {
      if (buf.length < 10) return null;
      len = Number(buf.readBigUInt64BE(2));
      offset = 10;
    }

    let maskKey = null;
    if (masked) {
      if (buf.length < offset + 4) return null;
      maskKey = buf.slice(offset, offset + 4);
      offset += 4;
    }

    if (buf.length < offset + len) return null;

    let payload = buf.slice(offset, offset + len);
    if (masked && maskKey) {
      const unmasked = Buffer.alloc(len);
      for (let i = 0; i < len; i++) unmasked[i] = payload[i] ^ maskKey[i % 4];
      payload = unmasked;
    }

    this.buffer = buf.slice(offset + len);

    if (opcode === 0x8) { // close
      this.close();
      return true;
    } else if (opcode === 0x9) { // ping
      this._sendRaw(encodeFrame(payload, 0xA)); // pong
      return true;
    } else if (opcode === 0x1) { // text
      this.emit('message', payload.toString('utf8'));
      return true;
    }
    return true;
  }

  _sendRaw(buf) {
    if (this.alive && this.socket.writable) {
      try { this.socket.write(buf); } catch (e) { /* ignore */ }
    }
  }

  send(str) {
    this._sendRaw(encodeFrame(str, 1));
  }

  close() {
    if (!this.alive) return;
    this.alive = false;
    try { this._sendRaw(encodeFrame('', 0x8)); this.socket.end(); } catch (e) { /* ignore */ }
    this.emit('close');
  }
}

/**
 * Upgrade sebuah HTTP request menjadi koneksi WebSocket.
 * Return null kalau request bukan WS handshake yang valid.
 */
function upgrade(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  if (!key) return null;
  const accept = acceptKey(key);
  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '', ''
  ].join('\r\n');
  socket.write(responseHeaders);
  return new MiniWSConnection(socket);
}

module.exports = { upgrade };
