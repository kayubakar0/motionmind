import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { activities, activityMetrics, coachMessages, planSessions, sports, trainingPlans } from "../db/schema";
import { buildCoachContext, type CoachContext } from "./context";
import { chatComplete, getActiveProvider, type ChatMessage } from "./provider";

const ANALYST_PROMPT = `Kamu adalah analis performa olahraga & asisten coach dalam aplikasi MotionMind.
PERAN: membantu atlet MEMBACA dan MEMAHAMI data latihannya — tren kebugaran, beban, pola olahraga, konsistensi, titik kuat/lemah, dan pemulihan. Kamu TIDAK menyusun jadwal (fitur rencana menangani itu).

ATURAN MENJAWAB:
- Bahasa Indonesia, singkat-padat, gunakan bullet/poin bila membantu. Maksimal ~300 kata.
- HANYA gunakan angka yang ada di DATA yang diberikan. Jangan pernah mengarang angka.
- Jika data kurang (mis. tidak ada power meter / HR / FTP belum diisi), sebutkan apa yang kurang dan cara melengkapinya.
- Struktur jawaban yang baik: (1) fakta utama dari data, (2) interpretasi apa artinya, (3) 1-3 saran konkret & aman.
- Interpretasi acuan: TSB > +5 fresh, -10..+5 netral/produktif, < -30 overreach; naikkan beban maksimal 5-10%/minggu; jaga rasio olahraga sesuai proporsi historis atlet.
- Jika atlet bertanya soal jadwal/rencana, arahkan ke fitur Rencana dan tetap jawab bagian datanya.`;

export interface AnalystExtras {
  recentActivities: Array<{
    date: string;
    sport: string;
    name: string;
    distanceKm: number | null;
    minutes: number | null;
    tss: number | null;
    avgHr: number | null;
    avgPower: number | null;
  }>;
  powerBests: Record<string, number>;
  adherence28d: { completed: number; missed: number; planned: number };
  volume90dBySport: Record<string, { hours: number; tss: number }>;
}

export async function buildAnalystExtras(userId: string): Promise<AnalystExtras> {
  const since90 = new Date(Date.now() - 90 * 86400000);
  const since28 = new Date(Date.now() - 28 * 86400000);
  const date28 = since28.toISOString().slice(0, 10);

  const [recentRows, curveRows, adherenceRows, volumeRows] = await Promise.all([
    db
      .select({
        startDate: activities.startDate,
        sportId: activities.sportId,
        sportName: sports.name,
        name: activities.name,
        distanceM: activities.distanceM,
        movingTimeS: activities.movingTimeS,
        elapsedTimeS: activities.elapsedTimeS,
        avgHr: activities.avgHr,
        avgPower: activities.avgPower,
        tss: activityMetrics.tss,
      })
      .from(activities)
      .leftJoin(sports, eq(sports.id, activities.sportId))
      .leftJoin(activityMetrics, eq(activityMetrics.activityId, activities.id))
      .where(and(eq(activities.userId, userId), gte(activities.startDate, new Date(Date.now() - 45 * 86400000))))
      .orderBy(desc(activities.startDate))
      .limit(10),
    db
      .select({ powerCurve: activityMetrics.powerCurve })
      .from(activityMetrics)
      .innerJoin(activities, eq(activities.id, activityMetrics.activityId))
      .where(and(eq(activities.userId, userId), gte(activities.startDate, since90)))
      .limit(500),
    db
      .select({ status: planSessions.status, count: sql<number>`count(*)` })
      .from(planSessions)
      .where(and(eq(planSessions.userId, userId), gte(planSessions.date, date28)))
      .groupBy(planSessions.status),
    db
      .select({
        sportId: activities.sportId,
        seconds: sql<number>`coalesce(sum(${activities.movingTimeS}), 0)`,
        tss: sql<number>`coalesce(sum(${activityMetrics.tss}), 0)`,
      })
      .from(activities)
      .leftJoin(activityMetrics, eq(activityMetrics.activityId, activities.id))
      .where(and(eq(activities.userId, userId), gte(activities.startDate, since90)))
      .groupBy(activities.sportId),
  ]);

  const powerBests: Record<string, number> = {};
  for (const row of curveRows) {
    if (!row.powerCurve) continue;
    for (const [w, v] of Object.entries(row.powerCurve)) {
      if (!["5", "60", "300", "1200"].includes(w)) continue;
      const label = { "5": "5s", "60": "1m", "300": "5m", "1200": "20m" }[w] ?? w;
      if (typeof v === "number" && v > (powerBests[label] ?? 0)) powerBests[label] = Math.round(v);
    }
  }

  const adherence28d = { completed: 0, missed: 0, planned: 0 };
  for (const r of adherenceRows) {
    const n = Number(r.count);
    if (r.status === "completed") adherence28d.completed = n;
    else if (r.status === "missed") adherence28d.missed = n;
    else if (r.status === "planned") adherence28d.planned = n;
  }

  const volume90dBySport: Record<string, { hours: number; tss: number }> = {};
  for (const r of volumeRows) {
    volume90dBySport[r.sportId] = {
      hours: Math.round((Number(r.seconds) / 3600) * 10) / 10,
      tss: Math.round(Number(r.tss)),
    };
  }

  return {
    recentActivities: recentRows.map((r) => ({
      date: new Date(r.startDate).toISOString().slice(0, 10),
      sport: r.sportName ?? r.sportId,
      name: r.name,
      distanceKm: r.distanceM != null ? Math.round((r.distanceM / 1000) * 10) / 10 : null,
      minutes: r.movingTimeS != null ? Math.round(r.movingTimeS / 60) : r.elapsedTimeS != null ? Math.round(r.elapsedTimeS / 60) : null,
      tss: r.tss != null ? Math.round(r.tss * 10) / 10 : null,
      avgHr: r.avgHr != null ? Math.round(r.avgHr) : null,
      avgPower: r.avgPower != null ? Math.round(r.avgPower) : null,
    })),
    powerBests,
    adherence28d,
    volume90dBySport,
  };
}

async function recentConversation(userId: string, limit = 8): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(coachMessages)
    .where(eq(coachMessages.userId, userId))
    .orderBy(desc(coachMessages.createdAt))
    .limit(limit);
  return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
}

export async function answerCoachQuestion(userId: string, question: string): Promise<string> {
  const provider = await getActiveProvider();
  const [ctx, extras] = await Promise.all([buildCoachContext(userId), buildAnalystExtras(userId)]);
  const payload: CoachContext & AnalystExtras = { ...ctx, ...extras };

  const history = await recentConversation(userId);
  const messages: ChatMessage[] = [
    { role: "system", content: ANALYST_PROMPT },
    {
      role: "user",
      content: `DATA ATLET TERKINI (JSON, gunakan hanya angka dari sini):\n${JSON.stringify(payload)}`,
    },
    { role: "assistant", content: "Siap. Saya sudah membaca data latihanmu. Silakan bertanya." },
    ...history.slice(0, 6),
    { role: "user", content: question },
  ];

  const res = await chatComplete(provider, messages, { userId, purpose: "ask" });
  return res.content.trim();
}
