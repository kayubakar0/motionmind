import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  activities,
  activityMetrics,
  activityStreams,
  athleteProfiles,
  files,
  planSessions,
  recommendations,
  sports,
  targets,
  trainingPlans,
  type NewActivity,
  type ParsedStreams,
} from "../db/schema";
import { registerHandler, enqueue, hasPendingJob } from "./queue";
import { syncUserActivities, fetchAndStoreStreams, pushActivityToStrava } from "../services/strava/sync";
import { detectFormat, parseActivityFile, parseGpxRoute } from "../services/parsers";
import { computeActivityMetrics } from "../services/metrics/compute";
import { generatePlan, linkCompletedActivityToPlan, type PlanTrigger } from "../ai/coach";
import { readFile } from "node:fs/promises";

registerHandler("sync_strava_activities", async (payload) => {
  const userId = payload.userId as string;
  const backfill = Boolean(payload.backfill);
  const result = await syncUserActivities(userId, { backfill });
  console.log(`[sync] user ${userId}: ${result.imported} aktivitas baru, ${result.streamsQueued} streams antre`);
});

registerHandler("fetch_strava_stream", async (payload) => {
  const userId = payload.userId as string;
  const activityId = payload.activityId as string;
  const externalId = payload.externalId as string;
  await fetchAndStoreStreams(userId, activityId, externalId);
});

registerHandler("strava_push_activity", async (payload) => {
  const userId = payload.userId as string;
  const activityId = payload.activityId as string;
  const result = await pushActivityToStrava(userId, activityId);
  console.log(`[push] aktivitas ${activityId} → Strava ${result.stravaId ?? "?"}`);
});

registerHandler("parse_activity_file", async (payload) => {
  const userId = payload.userId as string;
  const fileId = payload.fileId as string;
  const sportIdHint = (payload.sportId as string | undefined) ?? null;

  const [file] = await db.select().from(files).where(and(eq(files.id, fileId), eq(files.userId, userId))).limit(1);
  if (!file) throw new Error("File tidak ditemukan");

  const buffer = await readFile(file.storagePath);
  const format = detectFormat(file.filename, buffer);
  const parsed = await parseActivityFile(format, buffer);

  let sportId = sportIdHint ?? parsed.sportHint ?? "ride";
  const sportExists = await db.select({ id: sports.id }).from(sports).where(eq(sports.id, sportId)).limit(1);
  if (sportExists.length === 0) sportId = "ride";

  const activityValues: NewActivity = {
    userId,
    source: "upload",
    externalId: `upload:${fileId}`,
    sportId,
    name: parsed.name ?? file.filename.replace(/\.[^.]+$/, ""),
    startDate: parsed.startTime,
    distanceM: parsed.distanceM,
    movingTimeS: parsed.movingTimeS,
    elapsedTimeS: parsed.elapsedTimeS,
    totalElevationGainM: parsed.elevationGainM,
    avgHr: parsed.avgHr,
    maxHr: parsed.maxHr,
    avgPower: parsed.avgPower,
    maxPower: parsed.maxPower,
    avgCadence: parsed.avgCadence,
    deviceName: parsed.deviceName,
    raw: { format, filename: file.filename },
  };

  const existing = await db
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.source, "upload"), eq(activities.externalId, `upload:${fileId}`)))
    .limit(1);

  let activityId: string;
  if (existing.length > 0) {
    activityId = existing[0].id;
    await db.update(activities).set(activityValues).where(eq(activities.id, activityId));
    await db.delete(activityStreams).where(eq(activityStreams.activityId, activityId));
  } else {
    const [row] = await db.insert(activities).values(activityValues).returning({ id: activities.id });
    activityId = row.id;
  }

  const s = parsed.streams;
  await db.insert(activityStreams).values({
    activityId,
    time: s.time,
    latlng: s.latlng && s.latlng.length > 0 ? s.latlng : null,
    altitude: s.altitude ?? null,
    heartrate: s.heartrate ?? null,
    cadence: s.cadence ?? null,
    watts: s.watts ?? null,
    velocity: s.velocity ?? null,
    distance: s.distance ?? null,
  });

  await enqueue("compute_activity_metrics", { activityId });
});

registerHandler("parse_route_file", async (payload) => {
  const userId = payload.userId as string;
  const fileId = payload.fileId as string;
  const [file] = await db.select().from(files).where(and(eq(files.id, fileId), eq(files.userId, userId))).limit(1);
  if (!file) throw new Error("File tidak ditemukan");
  const buffer = await readFile(file.storagePath);
  const format = detectFormat(file.filename, buffer);
  if (format !== "gpx") throw new Error("File rute harus berformat GPX");
  const stats = parseGpxRoute(buffer.toString("utf8"));
  await db
    .update(targets)
    .set({ routeStats: stats })
    .where(and(eq(targets.fileId, fileId), eq(targets.userId, userId)));
});

registerHandler("compute_activity_metrics", async (payload) => {
  const activityId = payload.activityId as string;
  const rows = await db
    .select({ activity: activities, sport: sports })
    .from(activities)
    .innerJoin(sports, eq(sports.id, activities.sportId))
    .where(eq(activities.id, activityId))
    .limit(1);
  if (rows.length === 0) return;
  const { activity, sport } = rows[0];

  const streamRows = await db.select().from(activityStreams).where(eq(activityStreams.activityId, activityId)).limit(1);
  const profileRows = await db.select().from(athleteProfiles).where(eq(athleteProfiles.userId, activity.userId)).limit(1);
  const profile = profileRows[0] ?? null;

  const streams: ParsedStreams | null = streamRows.length
    ? {
        time: streamRows[0].time,
        latlng: streamRows[0].latlng ?? undefined,
        altitude: streamRows[0].altitude ?? undefined,
        heartrate: streamRows[0].heartrate ?? undefined,
        cadence: streamRows[0].cadence ?? undefined,
        watts: streamRows[0].watts ?? undefined,
        velocity: streamRows[0].velocity ?? undefined,
        distance: streamRows[0].distance ?? undefined,
      }
    : null;

  const computed = computeActivityMetrics({
    sport,
    ftp: profile?.ftp ?? null,
    maxHr: profile?.maxHr ?? null,
    restingHr: profile?.restingHr ?? null,
    elapsedS: activity.elapsedTimeS ?? activity.movingTimeS ?? streams?.time?.length ?? 0,
    movingTimeS: activity.movingTimeS,
    distanceM: activity.distanceM ?? null,
    streams,
    avgHr: activity.avgHr ?? null,
  });

  await db
    .insert(activityMetrics)
    .values({ activityId, ...computed })
    .onConflictDoUpdate({ target: activityMetrics.activityId, set: { ...computed, processedAt: new Date() } });
});

registerHandler("regenerate_plan", async (payload, ctx) => {
  const userId = payload.userId as string;
  const trigger = (payload.trigger as PlanTrigger) ?? "manual";
  const targetId = payload.targetId as string | undefined;
  try {
    await generatePlan(userId, trigger, { targetId });
  } catch (err) {
    if (ctx.attempts >= ctx.maxAttempts) {
      const message = err instanceof Error ? err.message : String(err);
      await db.insert(recommendations).values({
        userId,
        planId: null,
        trigger,
        providerName: null,
        model: null,
        inputSnapshot: null,
        output: null,
        summary: `Gagal menyusun rencana: ${message}`,
        status: "expired",
      });
    }
    throw err;
  }
});

registerHandler("check_missed_sessions", async () => {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const missed = await db
    .select({ id: planSessions.id, userId: planSessions.userId })
    .from(planSessions)
    .innerJoin(trainingPlans, eq(trainingPlans.id, planSessions.planId))
    .where(
      and(
        eq(trainingPlans.status, "active"),
        eq(planSessions.status, "planned"),
        lt(planSessions.date, todayStr),
        sql`${planSessions.workoutType} <> 'rest'`
      )
    )
    .limit(200);

  if (missed.length === 0) return;

  const byUser = new Map<string, string[]>();
  for (const m of missed) {
    const arr = byUser.get(m.userId) ?? [];
    arr.push(m.id);
    byUser.set(m.userId, arr);
  }

  for (const [userId, ids] of byUser) {
    await db
      .update(planSessions)
      .set({ status: "missed" })
      .where(inArray(planSessions.id, ids));
    if (!(await hasPendingJob("regenerate_plan", userId))) {
      await enqueue("regenerate_plan", { userId, trigger: "missed_workout" });
      console.log(`[dynamic] ${ids.length} sesi terlewat untuk user ${userId} → rencana di-regenerasi`);
    }
  }
});

registerHandler("recompute_all", async (payload) => {
  const userId = payload.requestedBy as string;
  const rows = await db
    .select({ id: activities.id, hasMetrics: activityMetrics.activityId })
    .from(activities)
    .leftJoin(activityMetrics, eq(activityMetrics.activityId, activities.id))
    .where(eq(activities.userId, userId));
  for (const r of rows) {
    if (r.hasMetrics == null) {
      await enqueue("compute_activity_metrics", { activityId: r.id });
    }
  }
});

export async function afterActivityCreated(userId: string, activityId: string, sportId: string) {
  await linkCompletedActivityToPlan(userId, activityId);
  void sportId;
  if (!(await hasPendingJob("regenerate_plan", userId))) {
    await enqueue(
      "regenerate_plan",
      { userId, trigger: "new_activity" },
      new Date(Date.now() + 10_000)
    );
  }
}
