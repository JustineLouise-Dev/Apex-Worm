# 🐛 APEX WORM — Game Worm.io Style, MULTIPLAYER REALTIME

Game ular slither-style dengan HTML/CSS/JS murni di sisi tampilan, dan server
otoritatif (WebSocket) untuk mode **multiplayer sungguhan lewat internet** —
semua pemain yang terhubung melihat dan berinteraksi satu sama lain secara realtime.

Bisa dijalankan **lokal di Termux/LAN** maupun **online via Cloudflare Worker + Durable Objects**.

---

## ✨ Fitur

- Multiplayer realtime — banyak pemain dari internet main di dunia yang sama
- Notifikasi **"[Nama] bergabung ke game"** setiap ada pemain baru masuk
- Server otoritatif: physics, tabrakan, makanan, dan skor dihitung di server (anti-cheat dasar), client hanya mengirim arah & boost
- Tampilan modern: glow neon, kartu HUD glassmorphism, minimap bulat, leaderboard live
- Kontrol **joystick analog**:
  - **Mode Potrait** → joystick muncul di **tengah bawah** layar
  - **Mode Landscape** → joystick otomatis pindah ke **kiri bawah** layar
- Tombol **Boost** (⚡, percepat, memakan panjang tubuh) di kanan, diposisikan **di atas minimap** supaya tidak menutupinya
- Bot AI (dikendalikan server) yang bergerak mencari makanan dan menghindar musuh, mengisi dunia saat pemain sedikit
- Sistem makan food → tumbuh, tabrak ular lain → mati → jadi makanan
- Support mouse + keyboard (WASD/arrow) untuk testing di desktop
- Indikator status koneksi (Online / Menghubungkan / Terputus) dengan auto-reconnect
- Credit **"Created by Justine Louise"** di menu utama dan footer pojok kanan bawah

---

## 🗂️ Struktur File

```
apexworm/
├── index.html            # Client game (HTML+CSS+JS) — tampilan & input, TIDAK menyimpan aturan game
├── game-engine.js         # Logika game OTORITATIF (physics, AI bot, tabrakan) — dipakai server lokal & Cloudflare
├── durable-object.js      # Durable Object Cloudflare: room WebSocket + game loop online
├── mini-ws.js             # Implementasi WebSocket server minimal tanpa dependency (untuk Termux)
├── server.js              # Server lokal (Node murni): serve index.html + jalankan game loop via mini-ws
├── worker.js               # Hasil build siap deploy ke Cloudflare (auto-generated, jangan edit manual)
├── worker.template.js      # Template sumber untuk build-worker.js
├── build-worker.js         # Script build: index.html + game-engine.js + durable-object.js -> worker.js
├── wrangler.toml            # Konfigurasi Cloudflare Worker + binding Durable Object
├── package.json
└── README.md
```

**Penting:** karena sekarang ada server otoritatif, mengedit `index.html` saja tidak
cukup untuk mengubah aturan main (kecepatan, ukuran dunia, jumlah bot, dll) —
itu semua diatur di `game-engine.js` dan berlaku sama baik untuk server lokal
maupun Cloudflare.

---

## 📱 Menjalankan di Termux (Android) — mode LAN multiplayer

1. Install Termux dari F-Droid (bukan Play Store, karena Play Store versi sudah usang).
2. Install Node.js:
   ```bash
   pkg update && pkg upgrade
   pkg install nodejs
   ```
3. Pindahkan folder `apexworm` ini ke penyimpanan Termux, misalnya via:
   ```bash
   termux-setup-storage
   cp -r /sdcard/Download/apexworm ~/apexworm
   cd ~/apexworm
   ```
4. Jalankan server (tanpa dependency apapun — WebSocket ditulis manual di `mini-ws.js`):
   ```bash
   node server.js
   ```
5. Buka browser HP, akses:
   ```
   http://localhost:8787
   ```
6. **Untuk multiplayer**, perangkat lain di jaringan WiFi yang sama tinggal buka
   `http://<ip-hp-kamu>:8787` — semua yang connect akan main di dunia yang sama secara realtime,
   dan akan muncul notifikasi join di layar pemain lain.

Untuk ganti port:
```bash
PORT=3000 node server.js
```

---

## ☁️ Deploy ke Cloudflare Worker — mode ONLINE multiplayer (lewat internet)

### Persiapan
1. Pastikan sudah punya akun Cloudflare (gratis). **Durable Objects** butuh akun dengan
   Workers Paid plan (mulai $5/bulan) — ini persyaratan Cloudflare, bukan dari project ini.
2. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```
3. Login:
   ```bash
   wrangler login
   ```
   (akan membuka browser untuk autentikasi — jika di Termux tanpa GUI, wrangler akan memberi link untuk dibuka manual)

### Deploy
`worker.js` sudah berisi HTML + game engine + Durable Object yang di-embed langsung,
jadi tinggal:

```bash
cd apexworm
wrangler deploy
```

Setelah sukses, kamu akan mendapat URL seperti:
```
https://apex-worm-game.<subdomain-kamu>.workers.dev
```

Bagikan URL ini ke siapa pun — mereka semua akan bermain di room global yang sama,
realtime, lewat internet.

### Update game setelah edit `index.html` / `game-engine.js` / `durable-object.js`
Karena `worker.js` adalah hasil "build" dari ketiga file itu, **setiap kali kamu mengubahnya**,
generate ulang `worker.js` sebelum deploy:

```bash
node build-worker.js
wrangler deploy
```

Script `build-worker.js` otomatis membaca file-file terbaru dan menyuntikkannya
menjadi satu `worker.js`.

---

## 🎮 Cara Main

- **Potrait**: gunakan joystick di tengah-bawah untuk mengarahkan ular, tombol kilat (⚡) di kanan untuk boost.
- **Landscape**: joystick otomatis pindah ke kiri-bawah agar tidak menghalangi pandangan, boost tetap di kanan, di atas minimap.
- **Desktop**: gerakkan mouse untuk mengarahkan, klik/tahan mouse atau tekan Space untuk boost, atau gunakan WASD/panah.
- Makan bola-bola cahaya untuk tumbuh dan menaikkan skor.
- Jangan menabrak badan ular lain — kamu akan mati dan berubah jadi makanan untuk ular lain.
- Boost membuat ularmu lebih cepat tapi memakan sedikit panjang tubuh setiap saat digunakan.
- Setiap ada pemain baru yang bergabung, akan muncul notifikasi hijau di pojok layar.

---

## 🔧 Catatan Teknis (untuk pengembangan lanjutan)

- **Tick rate server**: 20Hz (`TICK_MS` di `game-engine.js`). Bisa dinaikkan untuk gerakan
  lebih halus, tapi menambah beban bandwidth & CPU server.
- **Model sinkronisasi**: server-authoritative snapshot broadcast — client mengirim hanya
  `{angle, boosting}`, server menghitung semua fisika dan mengirim balik posisi seluruh
  worm & food tiap tick. Ini pendekatan standar game io-style, sederhana dan stabil,
  meski ada sedikit latensi input dibanding client-side prediction penuh.
- **Reconnect**: client otomatis mencoba menyambung ulang dengan backoff jika koneksi putus.
- **Durable Object** dipakai sebagai satu "room global" (`idFromName("global-room")`).
  Untuk beberapa room terpisah (mis. per region atau per lobi), bisa dikembangkan lebih
  lanjut dengan membuat id Durable Object berbeda per room.

Selamat bermain! 🐛

*Created by Justine Louise*
