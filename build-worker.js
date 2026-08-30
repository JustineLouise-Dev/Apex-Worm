/**
 * Build script: menyuntikkan index.html + game-engine.js + durable-object.js
 * ke dalam worker.js siap deploy.
 *
 * Jalankan ini SETIAP KALI kamu mengubah index.html / game-engine.js / durable-object.js,
 * sebelum `wrangler deploy`.
 *
 * Cara pakai:
 *   node build-worker.js
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'index.html');
const templatePath = path.join(__dirname, 'worker.template.js');
const enginePath = path.join(__dirname, 'game-engine.js');
const doPath = path.join(__dirname, 'durable-object.js');
const outPath = path.join(__dirname, 'worker.js');

for (const p of [htmlPath, templatePath, enginePath, doPath]) {
  if (!fs.existsSync(p)) {
    console.error('❌ File tidak ditemukan: ' + p);
    process.exit(1);
  }
}

const html = fs.readFileSync(htmlPath, 'utf8');
const escapedHtml = html
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${');

// game-engine.js ditulis sebagai CommonJS (dipakai juga oleh server.js Node).
// Untuk Worker (ESM) kita strip baris module.exports di akhir dan pakai isinya langsung
// sebagai top-level const/class declarations (sudah tanpa import Node apapun).
let engineSrc = fs.readFileSync(enginePath, 'utf8');
engineSrc = engineSrc.replace(/module\.exports\s*=\s*\{[\s\S]*?\};?\s*$/m, '').trim();

let doSrc = fs.readFileSync(doPath, 'utf8');
// Buang baris "export class" -> "class" karena kita gabungkan manual lalu export ulang di bawah template.
doSrc = doSrc.replace(/export class ApexWormRoom/, 'class ApexWormRoom');

let template = fs.readFileSync(templatePath, 'utf8');

let output = template
  .replace('__INDEX_HTML__', escapedHtml)
  .replace('__GAME_ENGINE__', engineSrc)
  .replace('__DURABLE_OBJECT__', doSrc + '\n\nexport { ApexWormRoom };');

fs.writeFileSync(outPath, output, 'utf8');
console.log('✅ worker.js berhasil dibuat ulang (' + html.length + ' bytes HTML embedded)');
