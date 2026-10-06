# Deploy MotionMind ke VPS — Docker Compose + nginx + motionmind.my.id

Panduan ini mengasumsikan: VPS sudah jalan **nginx + certbot** untuk `motionmind.my.id` (TLS aktif), dan nanti ingin menambah aplikasi lain di subdomain yang sama. **nginx host tidak dipindah ke Docker** — ia tetap gerbang utama (TLS + router domain) untuk semua app; tiap app Docker hanya menerima koneksi dari `127.0.0.1` (loopback), tidak pernah terekspos publik langsung.

## Arsitektur

```
Browser
  │  https://motionmind.my.id          (nginx host: TLS hasil certbot)
  ▼
nginx host ──proxy_pass 127.0.0.1:8010──▶  container `web`  (nginx: static client + proxy /api/v1)
                                             ▼
                                  container `server` (Bun: API + worker + scheduler, port internal)
                                             ▼
                                  container `db` (Postgres, port internal)
container `migrate` (one-shot tiap deploy): drizzle-kit push --force + seed → selesai dulu → baru server naik
```

- Static client + file PWA disajikan container `web`; `/api/v1/*` di-proxy ke `server` lewat network Docker.
- Worker & scheduler berjalan di dalam container `server` — jalankan **hanya 1 instance** (jangan `--scale`).
- File unggahan user (GPX/TCX/FIT) disimpan di volume `uploads` (`UPLOAD_DIR=/data/uploads`).

## 1. Install Docker di VPS (Ubuntu/Debian)

```bash
curl -fsSL https://get.docker.com | sh
docker compose version
```

Bila RAM VPS kecil (≤1 GB), build client bisa OOM — tambah swap:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

## 2. Siapkan repo & .env

```bash
git clone <repo-kamu> && cd motionmind_bhvr
cp .env.example .env
chmod 600 .env
```

Isi nilai yang ditandai `GANTI-*`:

```bash
openssl rand -hex 24   # → DB_PASSWORD
openssl rand -hex 32   # → APP_SECRET
```

Penjelasan kunci `.env`:

| Variabel | Isi |
|---|---|
| `DB_PASSWORD` | acak (hex) — dipakai compose untuk init Postgres + server |
| `APP_SECRET` | acak ≥32 hex — enkripsi token Strava/API key AI. **Setelah ada data, jangan diganti** (data terenkripsi jadi tak terbaca) |
| `ADMIN_PASSWORD` | password admin pertama (db:seed) — ganti dari admin bersifat setelah login pertama |
| `CLIENT_URL` | `https://motionmind.my.id` — dipakai CORS + redirect Strava |
| `VITE_SERVER_URL` | `https://motionmind.my.id` — dibake saat build client (build arg) |
| `STRAVA_CLIENT_ID/SECRET` | bisa dikosongkan dulu ala demo; diisi pada fase sinkronisasi Strava |

## 3. Start

```bash
docker compose up -d --build
docker compose ps
```

Status sehat yang diharapkan:

- `motionmind-db` → `Up (healthy)`
- `motionmind-migrate` → `Exited (0)` — push schema + seed, otomatis tiap deploy
- `motionmind-server` → `Up (healthy)`
- `motionmind-web` → `Up`, listen di `127.0.0.1:8010`

## 4. Blok nginx host

Sesuaikan `deploy/nginx/motionmind.my.id.conf` (pastikan 4 baris `ssl_*` cocok dengan path cert hasil certbot di VPS-mu — cek `sudo ls /etc/letsencrypt/live/`), lalu:

```bash
sudo cp deploy/nginx/motionmind.my.id.conf /etc/nginx/sites-available/motionmind.my.id.conf
sudo ln -sf /etc/nginx/sites-available/motionmind.my.id.conf /etc/nginx/sites-enabled/motionmind.my.id.conf
sudo nginx -t && sudo systemctl reload nginx
```

Catatan nginx versi < 1.25.1: kombinasi `listen 443 ssl;` + `http2 on;` tak dikenal → ubah menjadi `listen 443 ssl http2;`. Bila server block lama motionmind.my.id masih melayani web statis lain: **replace isi file tsb** dengan blok proxy di atas (cert tidak perlu diterbitkan ulang — path cert tetap dipakai).

## 5. Strava

- Dashboard Strava (https://dashboard.strava.com) → Settings → My API Application (app yang terdaftar) → **Authorization Callback Domain: motionmind.my.id**
- Server membentuk `redirect_uri = ${env.CLIENT_URL}/strava/callback` → `https://motionmind.my.id/strava/callback` — halaman ini disajikan container `web` (SPA fallback, jadi cukup satu domain akses publik).
- Koneksi Strava user yang terlink saat masih memakai callback localhost tetap berfungsi (token tidak terkait redirect_uri); authorize berikutnya otomatis memakai domain produksi.

## 6. Verifikasi

```bash
curl -sI https://motionmind.my.id | head -n 5          # HTTP 200, static SPA ter-saji
curl -s https://motionmind.my.id/api/v1/auth/me        # balikan JSON "Belum login" 401 — API hidup lewat proxy
docker compose logs --tail 50 server                   # cek log boot: worker + scheduler aktif
```

Lalu buka `https://motionmind.my.id` → login admin (username/password di `.env`).

## 7. Update aplikasi

```bash
git pull
docker compose up -d --build
```

`migrate` otomatis jalan lagi setiap deploy (idempotent — seed pakai `onConflictDoUpdate`, admin skip bila sudah ada). `drizzle-kit push --force` berarti perubahan yang merusak data akan auto-accept — bila kamu tahu deploy ini mengandung schema migration merugikan, hapus flag `--force` di `docker-compose.yml` (service `migrate`) lalu jalankan interaktif via `docker compose run migrate`.

## 8. Menambah aplikasi lain (subdomain)

Pola: 1 app Docker = 1 folder + file `docker-compose.yml` sendiri = publish **satu port ke loopback saja** = 1 server block nginx (lalu certbot).

Contoh app `harbor` di `harbor.motionmind.my.id`:

```bash
# 1. DNS: tambah A record di provider domain → harbor.motionmind.my.id → IP VPS

# 2. App Docker baru — PENTING: bind di loopback (127.0.0.1), BUKAN 0.0.0.0
mkdir -p /opt/apps/harbor && cd /opt/apps/harbor && cat > docker-compose.yml <<'EOF'
services:
  harbor:
    image: <image-app-baru>
    ports:
      - "127.0.0.1:8082:80"
    restart: unless-stopped
EOF
docker compose up -d

# 3. Blok nginx awal (masih HTTP, untuk verifikasi dulu)
sudo tee /etc/nginx/sites-available/harbor.motionmind.my.id >/dev/null <<'CONF'
server {
    listen 80;
    listen [::]:80;
    server_name harbor.motionmind.my.id;

    client_max_body_size 33m;
    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
CONF
sudo ln -sf /etc/nginx/sites-available/harbor.motionmind.my.id /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 4. Tambah SSL via certbot (otomatis edit block jadi 443 + redirect)
sudo certbot --nginx -d harbor.motionmind.my.id
```

Catatan:

- Jangan merombak server block `motionmind.my.id` saat menambah app lain — pisahkan per (sub)domain di file sendiri.
- Untuk app yang butuh websocket (mis. streaming): tambah di location:
  `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`
- Sertifikat antar host (root domain + beberapa subdomain) bisa satu file cert multi-SAN — cek isi `sudo certbot certificates`.
- Hindari tumpang-tindih `container_name` dengan MotionMind (yang sudah memakai prefix `motionmind-*`).

## 9. Backup & restore

`deploy/backup.sh` melakukan dump Postgres (gzip) + arsip volume `uploads`, retensi 14 hari, output di `/var/backups/motionmind` (dapat diacu ke folder lain via argumen pertama).

```bash
# uji sekali (manual)
sudo bash deploy/backup.sh

# otomatis harian → sudo crontab -e, tambah baris (sesuaikan path repo):
0 3 * * * bash /opt/apps/motionmind_bhvr/deploy/backup.sh >> /var/log/motionmind-backup.log 2>&1
```

Restore:

```bash
docker compose stop server     # hentikan traffic saat restore
gunzip -c /var/backups/motionmind/db-<timestamp>.sql.gz \
  | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker run --rm -i -v motionmind_uploads:/dst alpine sh -c 'tar xzf - -C /dst' \
  < /var/backups/motionmind/uploads-<timestamp>.tar.gz
docker compose start server
```

## 10. Troubleshooting

| Gejala | Cek / solusi |
|---|---|
| Server tidak naik setelah `up` | `docker compose logs migrate` — bila push schema gagal, server tak akan pernah naik (depends_on). Baca errornya, umumnya typo `.env` |
| `migrate` Exited(0) tapi tak ada tabel | cek `.env` → `DB_DATABASE` harus sama dengan `POSTGRES_DB` yang dipakai container db |
| `web` 502 saat buka domain | server container down: `docker compose logs server`, `docker compose restart server` |
| nginx [emerg] `http2 on` sintaks error | nginx lama (<1.25.1) → pakai `listen 443 ssl http2;` |
| Upload gagal (413 Request Entity Too Large) | naikkan `client_max_body_size` — ada di 2 tempat: template nginx host + `deploy/nginx/client.conf` |
| Server sehat tapi login tak persist | `CLIENT_URL` tidak sama persis dgn domain url akses (termasuk http vs https) |
| Certbot gagal (connection refused) | DNS belum mengarah ke VPS; tunggu propagate, cek `dig motionmind.my.id` |
| Reset semua data (dev) | `docker compose down -v` — HATI-HATI: menghapus volume db+uploads |
| Disk penuh oleh log | Log service sudah dibatasi di compose (`json-file`, max 10MB × 3 file) |
