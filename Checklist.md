# Checklist.md — MotionMind

Status pengembangan per fase (sesuai urutan implementasi yang diminta). Update file ini setiap menyelesaikan/memulai item.

Legend: `[x]` selesai · `[~]` selesai dengan catatan/terbatas · `[ ]` belum

---

## Fase 0 — Fondasi ✅

- [x] Scaffold monorepo bhvr (client/server/shared + Turbo workspaces)
- [x] Drizzle ORM + koneksi PostgreSQL lokal (`cyclebundb`, sesuai kredensial user)
- [x] Skema DB lengkap (18 tabel): users, sessions, sports, activities, streams, metrics, targets, plans, plan_sessions, recommendations, ai_providers, jobs, dst + index
- [x] Auth username/password (argon2 via `Bun.password`, session cookie httpOnly, tabel `sessions`)
- [x] Role admin (`requireAdmin`) + seed admin awal (`db:seed`)
- [x] Sports registry 28 olahraga (cycling/run/swim/strength/yoga/hike/walk/row/hiit/elliptical/ski/kayak/surf/climbing/dll) + pemilihan saat onboarding
- [x] Reset password via token (dev: token dikembalikan di response — belum ada email)

## Fase 1 — Strava API & Upload File ✅

- [x] OAuth Strava: `/strava/connect` → authorize → callback (`/strava/callback`) → exchange → simpan token terenkripsi AES-GCM
- [x] Tombol **Sync Now**: backfill historis paginated (100/page), upsert aktivitas, dedupe
- [x] Fetch streams per aktivitas (time, latlng, altitude, hr, cadence, watts, velocity, distance) → tabel `activity_streams`
- [x] Token refresh otomatis (expires_at − 2 menit)
- [x] Rate-limit aware (delay antar halaman, error 429 jelas)
- [x] Push aktivitas baru ke Strava setelah selesai di aplikasi (POST `/api/v3/activities`, mapping sport → stravaType, auto `strava_push_activity` untuk aktivitas manual)
- [~] Dedupe aktivitas manual yang di-push vs sync Strava (berdasarkan start_date ±5 menit) — perlu dipertegas dengan eksternal_id di masa depan
- [x] **Multi-sport mapping lengkap**: ±45 tipe aktivitas Strava → sport registry (4 tipe sepeda, lari/trail/treadmill, swim, strength/HIIT/crossfit, yoga/pilates, hike/walk/snowshoe, row/kayak/canoe, sup/surf/kite/windsurf, skate/ski/snowboard, elliptical/stairs, climbing/golf/soccer, dll); fallback aman → `workout` (bukan ride/run); resolveSportId tervalidasi terhadap sports registry sebelum insert
- [x] **AI multi-sport**: prompt coach memproses semua olahraga aktif (strength=set×reps, run/swim=pace/HR, yoga=durasi), TSS lintas olahraga setara dalam beban mingguan; `volume.summary30d.bySport` (jam+TSS per olahraga) masuk konteks AI
- [x] Upload GPX/TCX/FIT (`/uploads` multipart) → parse → normalisasi → activity + streams + metrik
- [x] Parser rute GPX (rte/rtept + fallback trk) → distance/elevation/min-max/sample points + **profil elevasi** (d/e sampel ≤400 titik, tersimpan di `routeStats.profile`)
- [x] Deteksi format by extension + magic bytes; guess sport dari konten file
- [x] **Anti double-sync**: tombol Sync Now didebounce via `hasPendingJob` (queued **dan** running) — klik berulang tidak mengantre job duplikat; endpoint membalas `queued:false` bila sync sudah berjalan
- [x] **Dashboard auto-refresh setelah sync**: polling `/strava/status` tiap 6s sampai `lastSyncAt` berubah → invalidate dashboard/activities + invalidate ulang +15s/+45s (metrik stream tiba bertahap); dashboard juga refetch tiap 60s
- [x] **Hapus aktivitas dari UI** (tombol trash + konfirmasi; cascade streams & metrics; rencana terkait otomatis melepas link)
- [x] **Peta interaktif penuh**: klik garis rute/profil → pin titik (marker pin + info card di peta: km/elevasi/gradien/jenis segmen + tips + tag "Tanjakan kunci #n" bila dalam segmen kunci); hover peta ⇄ profil tersinkron dua arah (hover menang sementara, pin persist); mini-legend gradien di dalam peta + chip petunjuk interaksi
- [x] **Profil elevasi interaktif** (SVG custom): tooltip jarak/elevasi/gradien, strip warna gradien, highlight saat hover di peta; dipakai di Detail Aktivitas & modal Detail Rute Target
- [x] Stream null kini forward-fill (bukan 0) agar profil elevasi/gradien tidak rusak
- [ ] Legend gradien pada preview kecil (saat ini hanya di modal detail & halaman detail)
- [x] **Peta halus + garis kontras**: render via canvas (`preferCanvas`) + casing putih di bawah garis gradien; palet gradien lebih gelap (terbaca di peta OSM terang, jangan menyatu dengan vegetasi); hover peta di-skip saat drag + throttle 90ms (fix panning patah-patah); Fitter diperbaiki (useEffect + cleanup)
- [x] Zoom control peta dipindah ke pojok kanan-bawah (ZoomControl bottomright, `zoomControl:false`); hint chip interaksi dihapus sesuai feedback; halaman analisis: peta full-width tinggi 500px di atas, kartu profil/rute/history/estimasi/tanjakan/fokus tersusun grid di bawahnya
- [ ] Peta style alternatif (topo/outdoor tiles) + hillshade layer
- [ ] Re-parse rute lama yang dibuat sebelum fitur profil (unggah ulang GPX-nya)
- [ ] Webhook Strava (event subscription) untuk production — butuh URL publik
- [ ] Upload multi-file sekaligus + progress per file

## Fase 2 — Skema & Pipeline Pemrosesan Data ✅

- [x] Normalized Power (rolling 30s, mean⁴ ^¼), IF, TSS power
- [x] hrTSS zona Coggan (LTHR ≈ 88% maxHR default), time-in-zone HR (5 zona %maxHR) & power (7 zona %FTP)
- [x] Power curve best efforts (5s–3600s, rolling mean via prefix sum)
- [x] Moving time detection (velocity / delta distance / power fallback)
- [x] Elevasi gain: smoothing window 5 + threshold 1m
- [x] Pemilihan metode TSS otomatis: power → hr → volume (strength) → duration; pace tersimpan untuk run/swim
- [x] Fitness model: daily TSS → CTL (EWMA 42d), ATL (EWMA 7d), TSB — `/dashboard/stats`
- [x] Job queue DB-backed: claim `FOR UPDATE SKIP LOCKED`, retry 3x backoff 30s·2ⁿ, recovery stuck saat boot
- [ ] Konfigurasi zona manual per user (saat ini zona otomatis dari FTP/maxHR)
- [ ] Estimasi FTP otomatis dari power curve (best 20min × 0.95) + usulkan ke user
- [ ] Power curve agregat lintas aktivitas (90 hari rolling) — saat ini per aktivitas
- [ ] TSS berbasis pace (rFTP run/swim) — saat ini run/swim pakai hr/duration

## Fase 3 — AI Coach & Target ✅

- [x] Registry provider AI di DB: **OpenRouter** & **Custom OpenAI-compatible** (baseURL + API key terenkripsi + model + temperature/maxTokens)
- [x] 1 provider aktif (`isActive`), toggle di admin, tombol **Test** (`/models` + fallback chat ping), log ke `ai_logs`
- [x] Context builder: profil, FTP/zona, CTL/ATL/TSB, daily TSS 28d, volume 6 minggu, sesi rencana (completed/missed/planned), target aktif, feedback 7 hari
- [x] Prompt system Indonesia (prinsip periodisasi, 80/20, tapering, recovery) → output JSON `PlanOutputSchema` (zod, retry 1x dengan feedback error)
- [x] Persistensi: arsip plan lama → plan baru version+1 → `plan_sessions` → recommendation baru (active, supersede lama)
- [x] Target: input manual (jarak/elevasi/durasi/tanggal) ATAU upload GPX rute (routeStats auto) — trigger regenerasi otomatis
- [x] **Analisis Rute & Persiapan — halaman penuh** `/targets/:id/analysis` (bukan modal): peta besar + profil elevasi + rute/data historis/estimasi event (basis power→historis→default), banner kelayakan %FTP, tanjakan kunci, distribusi gradien, fokus persiapan, catatan kelengkapan data; diakses via tombol "Analisis" / ikon expand di kartu target; modal global kini max-height + scroll (fix popup terpotong)
- [x] **Tanggal target tersedia untuk semua mode** (termasuk upload GPX) di wizard create
- [x] **Edit target** (Pencil di kartu): nama, sport, jenis, tanggal, jarak/elevasi/durasi, catatan, dan ganti file GPX rute → otomatis regenerasi; banner status menjalankan polling yang sama
- [x] **Copy-forward saat regenerasi**: sesi masa lalu (completed/missed/skipped, date < hari ini) disalin ke plan versi baru — kegiatan yang sudah dilakukan tidak pernah terhapus (uji live: v1 → v2 mempertahankan sesi completed kemarin)
- [x] Multi-sport dalam satu rencana (AI dibatasi hanya memakai sport id milik user)
- [x] **Tanya Coach (AI analyst)**: chat Q&A — AI membaca data atlet (fitness CTL/ATL/TSB, volume 30/90 hari per olahraga, 10 aktivitas terakhir, kepatuhan rencana 28 hari, power bests 5s/1m/5m/20m, feedback, target) lalu menjawab pertanyaan dalam Bahasa Indonesia; riwayat chat tersimpan (tabel `coach_messages`); quick-action chips; prompt anti-mengarang-angka
- [x] Dekripsi gagal (APP_SECRET pernah berubah) → pesan error jelas + panduan isi ulang (provider AI & koneksi Strava), peringatan APP_SECRET default saat boot
- [ ] Fallback `response_format: json_object` jika provider custom tidak mendukung (saat ini hanya retry teks)
- [ ] Pilih provider/model per keperluan (mis. model murah untuk chat, model kuat untuk plan)

> **Verifikasi live:** generate plan end-to-end SUKSES via provider custom (DeepSeek v4.1-flash) — plan 4 minggu dengan rationale berbasis data asli (TSB/ATL/CTL) ✓

- [x] **Umpan balik "Rencana AI" di halaman Target**: banner status (menyusun → selesai/gagal) dengan polling `/coach/status`; gagal generate kini terekam sebagai rekomendasi `expired` (badge "Gagal" di Pelatih AI) — tidak ada lagi klik yang "tidak muncul apa-apa"
- [x] **Perbaikan "Respons AI kosong"**: budget token naik otomatis utk plan (min 8192, retry ×2 s.d. 32768) — model reasoning (DeepSeek) tak lagi kehabisan token saat berpikir; timeout AI 180s; pesan error menyebut finish_reason + saran naikkan Max Tokens

## Fase 4 — Penyesuaian Dinamis ✅

- [x] `check_missed_sessions` (scheduler 60s): tandai sesi planned yang lewat → missed → enqueue `regenerate_plan` (debounce `hasPendingJob`)
- [x] Feedback kondisi (`/coach/feedback`): fatigue/sleep/soreness/availability/notes → regenerasi otomatis
- [x] Aktivitas baru → link otomatis ke sesi rencana (tanggal+sport, fallback ±1 hari) → regenerasi
- [x] Target create/update → regenerasi
- [x] Manual: tombol Regenerasi di halaman Rencana
- [x] Versi rencana: riwayat plan (archived) + riwayat rekomendasi (superseded) di halaman Pelatih AI
- [ ] Cooldown regenerasi per user (mis. min. 5 menit antar regen non-manual) — saat ini hanya debounce job pending
- [x] Penyesuaian inkremental via alasan sesi (bukan regenerasi buta):
- [x] **Alasan skip/missed** di halaman Rencana: modal alasan saat klik X — kode cepat (sakit, rapat, cuaca, travel, dll) atau teks bebas; pilih "Terlewatkan" (missed) atau "Dilewati" (skipped); keduanya memicu regen; alasan tersimpan (`plan_sessions.reason`), tampil di kartu sesi, tersalin ke plan versi baru, dan **dibaca AI**: prompt coach menerima `recentSessions.reason` dan wajib mengakuinya di rationale (terverifikasi live: AI menyebut "demam dua hari" & "rapat mendadak" lalu membuat minggu recovery)
- [ ] Deteksi overtraining otomatis (TSB < −30 beberapa hari) → saran recovery

## Fase 5 — UI (Bahasa Indonesia, tema dark "performance cockpit") ✅

- [x] Design system `ui.tsx` (Button/Card/Stat/Badge/Modal/Field/EmptyState) + token `@theme`
- [x] Layout sidebar + logo + nav conditional admin
- [x] Auth (login/register), Onboarding 2 langkah (pilih sport + profil FTP/HR/jam)
- [x] Dashboard: instrumen CTL/ATL/TSB/TSS, kurva kebugaran 90d, volume mingguan stacked, kartu AI, aktivitas terakhir, tombol Sync Strava
- [x] Aktivitas: tabel + filter sport + pagination + modal upload (activity/route)
- [x] Detail aktivitas: peta Leaflet, grafik stream (power/hr/elevasi/kecepatan/kadens), zona bars, power curve, push-to-Strava
- [x] Target: kartu dengan preview peta rute, countdown H−, tombol "Rencana AI"
- [x] Rencana: progres, grouping mingguan, tandai selesai/terlewat, lapor kondisi, regenerasi
- [x] **Ikon & warna olahraga per sesi rencana** (tile ikon berwarna per kategori: cycling=volt, run/swim=aqua, strength=amber, flexibility=ungu; API mengirim sportIcon+sportCategory)
- [x] **Klik sesi rencana → modal detail penuh**: deskripsi lengkap (markdown), durasi/jarak/TSS/intensitas, status, alasan jika ada + aksi (Tandai Selesai / Terlewat); tidak terpotong lagi
- [x] Pelatih AI: feed rekomendasi (trigger, provider/model, status)
- [x] Pengaturan: sport aktif, profil performa, Strava (connect/sync/disconnect)
- [x] Admin: provider AI CRUD + test + activate, users (jadikan admin), antrean job live
- [ ] Global toast/error banner (error API saat ini tampil lokal per komponen)
- [x] **Render markdown di UI AI**: jawaban Tanya Coach + rationale rencana kini benar-benar terformat (bold, italic, bullet, heading, tabel, `code`, link) via react-markdown + GFM; teaser dashboard di-strip markdown
- [ ] Responsive mobile (sidebar fixed w-60 belum collapse di layar kecil)
- [ ] Loading skeleton seragam (sebagian masih teks "Memuat…")
- [ ] Halaman riwayat plan lama + diff antar versi

## Kebersihan & Kualitas

- [x] `bun run type-check` 0 error (server + client + shared)
- [x] `bun run build` client sukses
- [x] E2E manual: register → onboarding → target → job; upload GPX → parse → metrik → dashboard
- [ ] Code-splitting client (bundle 1MB — recharts/leaflet di-chunk manual)
- [ ] Unit test: metrics (NP/TSS/zona), parser GPX/TCX/FIT, fitness EWMA
- [ ] E2E test otomatis (auth → upload → plan)
- [ ] CI (type-check + build)
- [ ] Helmet/rate-limit di Hono untuk production
- [ ] File cleanup cron (file unggahan lama di `server/uploads/`)

## Konfigurasi yang Dibutuhkan User (deployment/dev)

- [ ] Isi `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` di `server/.env` (callback: `http://localhost:5173/strava/callback`)
- [ ] Tambahkan provider AI di menu Admin (API key OpenRouter, atau endpoint custom) + aktifkan
- [ ] Ganti `APP_SECRET` dengan nilai acak ≥32 karakter (enkripsi token/API key)
