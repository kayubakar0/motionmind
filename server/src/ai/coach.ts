import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  activities,
  planSessions,
  recommendations,
  trainingPlans,
  userSports,
} from "../db/schema";
import { ApiError } from "../http/helpers";
import { chatComplete, getActiveProvider, type ChatMessage } from "./provider";
import { buildCoachContext, type CoachContext } from "./context";
import { PlanOutputSchema, type PlanOutput } from "shared";

const SYSTEM_PROMPT = `Kamu adalah AI pelatih (coach) olahraga profesional dan sains olahraga bersertifikasi, berpengalaman melatih atlet sepeda, lari, renang, angkat beban, dan multi-sport.
Tugasmu menyusun rencana latihan mingguan yang aman, progresif, dan terpersonalisasi berdasarkan data atlet.

Prinsip:
- Progresif: naikkan beban (TSS/durasi) maksimal ~5-10% per minggu, sisipkan minggu recovery setiap 3-4 minggu.
- Pola intensitas sehat: mayoritas sesi mudah (endurance/recovery), sedikit sesi keras (intervals/tempo) — pendekatan 80/20 untuk olahraga enduran.
- Sertakan hari istirahat/recovery. Jangan jadwalkan dua hari keras berurutan untuk sport yang sama.
- Jika ada tanggal target (event/race), lakukan tapering 7-10 hari sebelum tanggal target, lalu sesi race/event pada tanggal tersebut.
- Hormati availability jam per minggu atlet. Jangan melebihi total yang realistis.
- Jika ada sesi yang terlewat, jangan "menghukum" atlet: sesuaikan beban, lanjutkan secara progresif dari kondisi saat ini.
- BACA ALASAN: recentSessions dapat menyertakan field "reason" (alasan atlet melewati/menandai sesi) — perhatikan alasannya, akui secara eksplisit di rationale/warnings, dan sesuaikan rencana berdasarkan penyebabnya (mis. sakit → kurangi beban bertahap sampai kondisinya pulih; tidak ada waktu → kompres durasi sesi; perangkat/batal → substitusi olahraga).
- Jika CTL rendah / atlet pemula, mulai dari volume ringan.
- Jika feedback menunjukkan kelelahan tinggi (fatigue level tinggi), kurangi beban dan prioritaskan recovery.
- MULTI-OLAHRAGA: atlet dapat memiliki beberapa olahraga aktif (lihat athlete.sports dan volume.summary30d.bySport). Perlakukan SEMUA olahraga yang aktif, bukan hanya sepeda:
  - strength/core = sesi beban (sebutkan pola set×reps dan beban di description), yoga/flexibility/stretching = sesi durasi untuk mobilitas & recovery.
  - run/swim = sesi berbasis durasi + jarak, gunakan intensitas berbasis Zona HR/pace, bukan power.
  - Olahraga lain (hike, kayak, ski, dst.) = sesi berbasis durasi/HR sesuai data historis atlet.
  - Anggap TSS lintas olahraga setara saat menghitung beban total mingguan; jaga keseimbangan beban antar olahraga sesuai proporsi historis & target utama atlet.
- Gunakan HANYA sport id yang tersedia pada daftar sport atlet.
- Angka TSS realistis: endurance 40-90, tempo 60-120, intervals 70-140, long ride 120-260, recovery 20-40, strength 30-80, yoga/flexibility 10-30.

Format output: HANYA satu objek JSON valid (tanpa markdown, tanpa penjelasan di luar JSON) dengan skema:
{
  "name": string,
  "goal_summary": string,
  "weekly_hours": number,
  "weeks": [
    {
      "week_start": "YYYY-MM-DD",
      "focus": string,
      "notes": string (opsional),
      "sessions": [
        {
          "date": "YYYY-MM-DD",
          "sport": string (sport id dari daftar),
          "workout_type": salah satu dari endurance|tempo|intervals|recovery|long|strength|flexibility|test|race|rest,
          "title": string,
          "description": string (instruksi sesi yang jelas, sebutkan zona/durasi/jarak),
          "duration_min": number (opsional),
          "distance_km": number (opsional),
          "intensity": string (opsional, mis. "Z2", "4x5min Z4"),
          "tss": number (opsional, estimasi TSS)
        }
      ]
    }
  ],
  "rationale": string,
  "warnings": string[]
}`;

export type PlanTrigger =
  | "initial"
  | "missed_workout"
  | "condition_change"
  | "new_activity"
  | "target_change"
  | "manual";

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildUserPrompt(ctx: CoachContext, trigger: PlanTrigger, targetId?: string): string {
  const today = todayLocal();
  const focusTarget = targetId ? ctx.targets.find((t) => t.id === targetId) ?? ctx.targets[0] : ctx.targets[0];
  return `Susun rencana latihan baru untuk atlet berikut.

TANGGAL HARI INI: ${today} (rencana dimulai dari tanggal ini).
TRIGGER PENYUSUNAN: ${trigger}

DATA ATLET (JSON):
${JSON.stringify(ctx, null, 2)}

${focusTarget ? `TARGET UTAMA YANG DIPRIORITASKAN: ${JSON.stringify(focusTarget)}` : "Tidak ada target spesifik — bangun kebugaran dasar yang sehat."}

ATURAN TAMBAHAN:
- weeks[].week_start harus Senin dari minggu terkait; sesi pertama dimulai dari ${today}.
- Setiap sesi harus punya date antara ${today} dan maksimal 12 minggu ke depan (atau sampai tanggal target jika lebih dekat).
- duration_min wajib untuk semua sesi selain rest.
- Jika trigger adalah missed_workout atau condition_change, buat rencana yang menyesuaikan dari kondisi TERKINI (lihat recentSessions yang completed/missed dan feedback), jangan ulang sesi yang sudah selesai.
- rationale berikan dalam Bahasa Indonesia yang mudah dipahami, sebutkan alasan struktur rencana.

Balas HANYA JSON.`;
}

async function requestPlan(
  messages: ChatMessage[],
  provider: Awaited<ReturnType<typeof getActiveProvider>>,
  userId: string
): Promise<PlanOutput> {
  let lastError = "";
  const baseTokens = Math.max(provider.params?.maxTokens ?? 0, 8192);
  for (let attempt = 0; attempt < 2; attempt++) {
    const msgs: ChatMessage[] =
      attempt === 0
        ? messages
        : [
            ...messages,
            {
              role: "user",
              content: `Upaya sebelumnya gagal: ${lastError}. Balas ulang HANYA JSON yang valid sesuai skema, tanpa teks tambahan, tanpa markdown code fence. Ringkas description bila perlu agar tidak terpotong.`,
            },
          ];
    try {
      const res = await chatComplete(provider, msgs, {
        json: true,
        userId,
        purpose: "plan",
        maxTokens: attempt === 0 ? baseTokens : Math.min(baseTokens * 2, 32768),
      });
      const raw = res.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        lastError = `Output bukan JSON valid (${res.completionTokens ?? "?"} token terpakai)`;
        continue;
      }
      const validated = PlanOutputSchema.safeParse(parsedJson);
      if (validated.success) return validated.data;
      lastError = validated.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(lastError || "Output AI tidak valid");
}

async function persistPlan(
  userId: string,
  output: PlanOutput,
  meta: {
    trigger: PlanTrigger;
    providerName: string;
    model: string;
    ctx: CoachContext;
    targetId?: string;
  }
): Promise<{ planId: string }> {
  const sportRows = await db
    .select({ id: userSports.sportId })
    .from(userSports)
    .where(eq(userSports.userId, userId));
  const allowed = new Set(sportRows.map((s) => s.id));
  const primary = meta.ctx.athlete.primarySport ?? "ride";

  const today = todayLocal();
  const sessions = output.weeks.flatMap((w) =>
    w.sessions
      .filter((s) => s.workout_type !== "rest" && s.date >= today)
      .map((s) => {
        let sportId = allowed.has(s.sport) ? s.sport : null;
        if (!sportId) sportId = primary;
        return {
          date: s.date,
          sportId,
          workoutType: s.workout_type,
          title: s.title.slice(0, 200),
          description: s.description,
          durationPlannedS: s.duration_min ? Math.round(s.duration_min * 60) : null,
          distancePlannedM: s.distance_km ? Math.round(s.distance_km * 1000) : null,
          intensityTargets: s.intensity ? [s.intensity] : null,
          tssPlanned: s.tss ?? null,
        };
      })
  );
  if (sessions.length === 0) throw new Error("Rencana AI tidak mengandung sesi valid");

  const endDate = sessions.reduce((max, s) => (s.date > max ? s.date : max), sessions[0].date);

  const oldActive = await db
    .select({ id: trainingPlans.id })
    .from(trainingPlans)
    .where(and(eq(trainingPlans.userId, userId), eq(trainingPlans.status, "active")))
    .limit(1);
  await db
    .update(trainingPlans)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(trainingPlans.userId, userId), eq(trainingPlans.status, "active")))
    .returning({ id: trainingPlans.id });

  const maxVersionRow = await db
    .select({ v: sql<number>`coalesce(max(${trainingPlans.version}), 0)` })
    .from(trainingPlans)
    .where(eq(trainingPlans.userId, userId));
  const version = Number(maxVersionRow[0]?.v ?? 0) + 1;

  const [plan] = await db
    .insert(trainingPlans)
    .values({
      userId,
      targetId: meta.targetId ?? null,
      name: output.name.slice(0, 200),
      goalSummary: output.goal_summary,
      startDate: today,
      endDate,
      weeklyHours: output.weekly_hours ?? meta.ctx.athlete.weeklyHoursTarget ?? null,
      version,
      status: "active",
      rationale: output.rationale,
      warnings: output.warnings ?? [],
      providerName: meta.providerName,
    })
    .returning();

  await db.insert(planSessions).values(
    sessions.map((s) => ({
      planId: plan.id,
      userId,
      ...s,
    }))
  );

  // Pertahankan riwayat: sesi masa lalu (completed/missed/skipped) dari plan sebelumnya
  // disalin ke plan baru, sehingga regenerasi TIDAK menghapus kegiatan yang sudah dilakukan.
  if (oldActive.length > 0) {
    await db.execute(sql`
      INSERT INTO plan_sessions
        (plan_id, user_id, sport_id, date, workout_type, title, description,
         duration_planned_s, distance_planned_m, intensity_targets, tss_planned,
         status, reason, completed_activity_id, completed_at)
      SELECT ${plan.id}, user_id, sport_id, date, workout_type, title, description,
         duration_planned_s, distance_planned_m, intensity_targets, tss_planned,
         status, reason, completed_activity_id, completed_at
      FROM plan_sessions
      WHERE plan_id = ${oldActive[0].id} AND date < ${today}
    `);
  }

  await db
    .update(recommendations)
    .set({ status: "superseded" })
    .where(and(eq(recommendations.userId, userId), eq(recommendations.status, "active")));

  await db.insert(recommendations).values({
    userId,
    planId: plan.id,
    trigger: meta.trigger,
    providerName: meta.providerName,
    model: meta.model,
    inputSnapshot: { ...meta.ctx, trigger: meta.trigger } as unknown as Record<string, unknown>,
    output: output as unknown as Record<string, unknown>,
    summary: output.rationale,
    status: "active",
  });

  return { planId: plan.id };
}

export async function generatePlan(
  userId: string,
  trigger: PlanTrigger,
  opts: { targetId?: string } = {}
): Promise<{ planId: string }> {
  const provider = await getActiveProvider();
  const ctx = await buildCoachContext(userId);
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(ctx, trigger, opts.targetId) },
  ];
  const output = await requestPlan(messages, provider, userId);
  return persistPlan(userId, output, {
    trigger,
    providerName: provider.name,
    model: provider.model,
    ctx,
    targetId: opts.targetId,
  });
}

/** Dipanggil saat aktivitas baru selesai — sesi rencana yang cocok otomatis ditandai selesai,
 *  lalu rencana disesuaikan secara dinamis bila diperlukan. */
export async function linkCompletedActivityToPlan(userId: string, activityId: string): Promise<void> {
  const rows = await db
    .select({ activity: activities })
    .from(activities)
    .where(and(eq(activities.id, activityId), eq(activities.userId, userId)))
    .limit(1);
  if (!rows.length) return;
  const activity = rows[0].activity;
  const dateStr = `${activity.startDate.getFullYear()}-${String(activity.startDate.getMonth() + 1).padStart(2, "0")}-${String(activity.startDate.getDate()).padStart(2, "0")}`;

  const candidates = await db
    .select({ id: planSessions.id })
    .from(planSessions)
    .where(
      and(
        eq(planSessions.userId, userId),
        eq(planSessions.date, dateStr),
        eq(planSessions.sportId, activity.sportId),
        eq(planSessions.status, "planned")
      )
    )
    .limit(1);

  if (candidates.length > 0) {
    await db
      .update(planSessions)
      .set({ status: "completed", completedActivityId: activityId, completedAt: new Date() })
      .where(eq(planSessions.id, candidates[0].id));
    return;
  }

  // fallback: tandai sesi planned dalam rentang 1 hari dengan sport sama
  const near = await db
    .select({ id: planSessions.id })
    .from(planSessions)
    .where(
      and(
        eq(planSessions.userId, userId),
        eq(planSessions.sportId, activity.sportId),
        eq(planSessions.status, "planned"),
        sql`abs((${planSessions.date}::date - ${dateStr}::date)) <= 1`
      )
    )
    .limit(1);
  if (near.length > 0) {
    await db
      .update(planSessions)
      .set({ status: "completed", completedActivityId: activityId, completedAt: new Date() })
      .where(eq(planSessions.id, near[0].id));
  }
}
