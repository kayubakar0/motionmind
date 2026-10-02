# AGENTS.md — MotionMind

Panduan untuk AI agent (dan manusia) yang bekerja di codebase ini. Baca sebelum mengubah kode.

## Gambaran Proyek

**MotionMind** — platform latihan olahraga pribadi berbasis AI (fokus cycling, mendukung multi-sport: lari, renang, angkat beban, yoga, dll). Mirip TrainerRoad/Intervals.icu dengan AI coach: sinkronisasi Strava, unggah file (GPX/TCX/FIT), pemrosesan metrik performa, rencana latihan dari AI yang menyesuaikan diri secara dinamis (sesi terlewat, perubahan kondisi, aktivitas baru), dan target latihan (manual atau rute GPX).

**Bahasa UI & pesan error: Bahasa Indonesia.** Nama variabel/kode: English.

## Stack (bhvr)

- **Runtime/Package manager**: Bun (≥1.4) — jangan gunakan node/npm langsung
- **Monorepo**: workspaces + Turbo
- **Server**: Hono + Drizzle ORM (postgres-js) → PostgreSQL lokal
- **Client**: React 19 + Vite + Tailwind v4 + TanStack Query + react-router + Recharts + Leaflet (tile OpenStreetMap) + lucide-react
- **Shared**: types + zod schemas dipakai client & server
- **Queue**: tabel `jobs` di Postgres + worker loop (TANPA Redis)

## Struktur

```
client/                      React SPA (Bahasa Indonesia, tema dark "performance cockpit")
  src/pages/                 Auth, Onboarding, Dashboard, Activities, ActivityDetail,
                             Targets, TargetAnalysis, Plan, Coach, Settings, Admin, StravaCallback
  src/components/            ui.tsx (design system), Layout, Charts, RouteMap (gradien + km markers +
                             hover sync), ElevationProfile (profil elevasi SVG), SportIcon
  src/lib/api.ts             fetch wrapper (credentials: include, SERVER_URL)
  src/lib/geo.ts             haversine, gradien & warna zona, buildProfile (streams/rute)
  src/index.css              Tailwind v4 @theme tokens (volt/aqua/dll) + animasi rise
server/                      Hono API + worker + scheduler
  src/db/schema.ts           SEMUA tabel Drizzle (19 tabel) + type exports
  src/db/seed.ts             Sports registry (28 sport) + admin user
  src/routes/                auth, onboarding, activities, uploads, strava, targets,
                             plans, coach, dashboard, admin → dirakit di src/index.ts
  src/services/strava/       client.ts (OAuth/token), sync.ts (backfill, streams, push)
  src/services/parsers/      gpx.ts, tcx.ts, fit.ts, common.ts (normalisasi)
  src/services/metrics/      compute.ts (NP/IF/TSS/hrTSS/zona/power curve)
  src/services/fitness.ts    daily TSS, CTL/ATL/TSB, dashboard stats
  src/services/routeAnalysis.ts  analisis rute target: estimasi waktu/power/TSS,
                             tanjakan kunci, distribusi gradien, fokus persiapan
  src/ai/                    provider.ts (registry + chatComplete), context.ts,
                             coach.ts (generatePlan + prompt Indonesia),
                             analyst.ts (Tanya Coach: Q&A analisa data + riwayat chat)
  src/jobs/                  queue.ts (enqueue/worker SKIP LOCKED), handlers.ts
  src/scheduler.ts           interval 60s → check_missed_sessions
  src/middleware/auth.ts     session cookie + requireAuth/requireAdmin
shared/src/                  types (DTO) + schemas (zod input + PlanOutputSchema)
```

## Perintah

```bash
bun install              # install semua workspace
bun dev                  # server :3000 + client :5173 (turbo)
bun run dev:server       # hanya server (bun --watch)
bun run dev:client       # hanya client (vite)
bun run db:push          # push skema Drizzle ke Postgres (dev, destructive-safe push)
bun run db:seed          # seed sports + admin (jika belum ada user)
bun run type-check       # tsc semua workspace
bun run build            # build semua (vite build client)
```

## Environment

`server/.env` (auto-load oleh Bun & bisa di-parse manual bila gagal):
- DB: `DB_HOST=127.0.0.1`, `DB_PORT=5432`, `DB_DATABASE=cyclebundb`, `DB_USERNAME=postgres`, `DB_PASSWORD=kybk`
- `PORT=3000`, `CLIENT_URL=http://localhost:5173`, `APP_SECRET` (untuk AES-256-GCM enkripsi token/API key — WAJIB unik per deployment)
- `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` (callback: `http://localhost:5173/strava/callback`)
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` (dipakai db:seed pertama kali)

## Konvensi Kode

- **TANPA KOMENTAR** kecuali diminta/perlu banget. Kode self-documenting.
- Server: selalu validasi body dengan zod lewat `parseBody(c, Schema)` dari `shared` — JANGAN validasi manual.
- Error lempar `ApiError(status, pesanIndonesia)`; jangan pernah `c.json({error})` langsung tanpa alasan.
- Pesan error/postfix UI dalam Bahasa Indonesia yang natural.
- Safeguard: `requireAuth()` di tiap route group; admin-only pakai `requireAdmin()`.
- Data sensitif (API key, token Strava) SELALU lewat `encrypt()/decrypt()` (AES-GCM, server/src/lib/encrypt.ts).
- Query waktu: gunakan UTC/dates ISO `YYYY-MM-DD` untuk kolom text (planSessions.date, targets.targetDate).
- Pagination/unik: `activities` punya unique `(user_id, source, external_id)`; NULL external_id diperbolehkan (Postgres treats NULL distinct).
- Client: gunakan `api()` dari `@/lib/api`; format via `@/lib/format`; jangan hardcode warna — pakai token `@theme` (volt/aqua/amber2/coral/ink/mute/dim/surface/line).
- Worker baru: tambahkan tipe di union `JobType` (queue.ts) + `registerHandler` (handlers.ts) + tidak lupa debounce `hasPendingJob` untuk job yang bisa spam (regenerate_plan).

## Arsitektur Kunci (jangan rusak)

1. **Pipeline aktivitas**: Strava/upload/manual → insert `activities` → insert `activity_streams` → enqueue `compute_activity_metrics` → row `activity_metrics`. Setelah itu `afterActivityCreated()` mem-link sesi rencana & antre regenerasi.
2. **Regenerasi AI** (`regenerate_plan`): buildCoachContext (fitness, volume, sesi, target, feedback) → prompt system Indonesia → chatComplete (JSON mode, budget token min 8192, retry ×2) → validasi `PlanOutputSchema` → arsip plan lama → plan baru versi+1 → **sesi masa lalu (date < hari ini) disalin dari plan sebelumnya** sehingga riwayat completed/missed tidak hilang → recommendation baru (active) & supersede lama; kegagalan AI terekam sebagai rekomendasi `expired`.
3. **Trigger penyesuaian dinamis**: `check_missed_sessions` (scheduler), feedback kondisi (`/coach/feedback`), target create/update, sesi ditandai missed/dilewati **beserta `reason`** (kolom `plan_sessions.reason`, ikut tersalin saat copy-forward + dibaca AI via `recentSessions.reason`), aktivitas baru — semua → `enqueue("regenerate_plan")` dengan `hasPendingJob` debounce.
4. **Job queue**: claim `FOR UPDATE SKIP LOCKED`, retry 3x backoff 30s·2ⁿ; recovery stuck `running→queued` saat boot (index.ts).
5. **AI provider**: 1 provider aktif (`isActive`) dari tabel `ai_providers`; OpenRouter = base `https://openrouter.ai/api/v1`; custom = baseURL apa pun kompatibel OpenAI `/chat/completions`.

## Verifikasi Sebelum Selesai

1. `bun run type-check` harus 0 error (server, client, shared semua).
2. `bun run build` — client harus ter-build.
3. Uji alur terkait via curl (login cookie → endpoint) atau halaman web; server tidak boleh crash saat boot.
4. Jika mengubah schema: `bun run db:push` lalu uji ulang seed/pipeline.

## Gotchas Windows

- curl Windows tidak paham `/tmp` — gunakan path relatif proyek untuk file uji, dan hapus setelah selesai.
- Bun auto-load `server/.env` ketika cwd = server; skrip drizzle sudah handle sendiri (drizzle.config.ts).
- `bun --watch` restart saat file berubah — job `running` di-recover saat boot.
- Port client DIKUNCI di 5173 (`strictPort: true`): wajib untuk callback Strava; bila gagal bind, matikan proses Vite lama (cek `netstat -ano | grep 5173`), JANGAN biarkan Vite ke port lain.
- Setelah mengubah `server/.env`, restart server manual (`bun run dev:server`) — `bun --watch` tidak me-reload .env yang sudah termuat.

## Yang Belum Ada (lihat Checklist.md)

Webhook Strava (prod), SMTP reset password, unit/e2e tests, i18n, code-splitting client.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
