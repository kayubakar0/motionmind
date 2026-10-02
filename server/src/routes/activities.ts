import { and, count, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { ManualActivityInput } from "shared";
import { db } from "../db";
import { activities, activityMetrics, activityStreams, sports } from "../db/schema";
import { ApiError, parseBody } from "../http/helpers";
import { getAuthUser, requireAuth, type AppEnv } from "../middleware/auth";
import { enqueue, hasPendingJob } from "../jobs/queue";
import { getConnection } from "../services/strava/client";
import { afterActivityCreated } from "../jobs/handlers";

export const activityRoutes = new Hono<AppEnv>();

activityRoutes.use("*", requireAuth());

activityRoutes.get("/", async (c) => {
  const user = getAuthUser(c);
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(5, Number(c.req.query("pageSize") ?? "30")));
  const sportId = c.req.query("sportId") ?? null;
  const days = Number(c.req.query("days") ?? "365");

  const conditions = [eq(activities.userId, user.id), sql`${activities.startDate} >= now() - (${days} || ' days')::interval`];
  if (sportId) conditions.push(eq(activities.sportId, sportId));

  const rows = await db
    .select({
      id: activities.id,
      sportId: activities.sportId,
      sportName: sports.name,
      source: activities.source,
      name: activities.name,
      startDate: activities.startDate,
      distanceM: activities.distanceM,
      movingTimeS: activities.movingTimeS,
      elapsedTimeS: activities.elapsedTimeS,
      totalElevationGainM: activities.totalElevationGainM,
      avgPower: activities.avgPower,
      avgHr: activities.avgHr,
      tss: activityMetrics.tss,
      pushedToStrava: activities.pushedToStrava,
    })
    .from(activities)
    .leftJoin(sports, eq(sports.id, activities.sportId))
    .leftJoin(activityMetrics, eq(activityMetrics.activityId, activities.id))
    .where(and(...conditions))
    .orderBy(desc(activities.startDate))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(activities)
    .where(and(...conditions));

  return c.json({
    items: rows.map((r) => ({
      ...r,
      startDate: new Date(r.startDate).toISOString(),
      sportName: r.sportName ?? r.sportId,
    })),
    total: Number(total),
    page,
    pageSize,
  });
});

activityRoutes.get("/:id", async (c) => {
  const user = getAuthUser(c);
  const id = c.req.param("id");
  const rows = await db
    .select({ activity: activities, sport: sports, metrics: activityMetrics })
    .from(activities)
    .leftJoin(sports, eq(sports.id, activities.sportId))
    .leftJoin(activityMetrics, eq(activityMetrics.activityId, activities.id))
    .where(and(eq(activities.id, id), eq(activities.userId, user.id)))
    .limit(1);
  if (rows.length === 0) throw new ApiError(404, "Aktivitas tidak ditemukan");
  const { activity, sport, metrics } = rows[0];

  let streams = null;
  if (c.req.query("withStreams") === "1") {
    const streamRows = await db.select().from(activityStreams).where(eq(activityStreams.activityId, id)).limit(1);
    if (streamRows.length > 0) {
      streams = {
        time: streamRows[0].time,
        latlng: streamRows[0].latlng ?? undefined,
        altitude: streamRows[0].altitude ?? undefined,
        heartrate: streamRows[0].heartrate ?? undefined,
        cadence: streamRows[0].cadence ?? undefined,
        watts: streamRows[0].watts ?? undefined,
        velocity: streamRows[0].velocity ?? undefined,
        distance: streamRows[0].distance ?? undefined,
      };
    }
  }

  return c.json({
    ...activity,
    startDate: new Date(activity.startDate).toISOString(),
    sportName: sport?.name ?? activity.sportId,
    sportIcon: sport?.icon ?? "activity",
    metrics: metrics ?? null,
    streams,
  });
});

activityRoutes.delete("/:id", async (c) => {
  const user = getAuthUser(c);
  const id = c.req.param("id");
  const result = await db
    .delete(activities)
    .where(and(eq(activities.id, id), eq(activities.userId, user.id)))
    .returning({ id: activities.id });
  if (result.length === 0) throw new ApiError(404, "Aktivitas tidak ditemukan");
  return c.json({ ok: true });
});

activityRoutes.post("/manual", async (c) => {
  const user = getAuthUser(c);
  const body = await parseBody(c, ManualActivityInput);

  const sportRows = await db.select().from(sports).where(eq(sports.id, body.sportId)).limit(1);
  if (sportRows.length === 0) throw new ApiError(400, "Sport tidak dikenal");
  const sport = sportRows[0];

  const startDate = new Date(body.startDate);
  if (!Number.isFinite(startDate.getTime())) throw new ApiError(400, "Tanggal mulai tidak valid");

  const [row] = await db
    .insert(activities)
    .values({
      userId: user.id,
      source: "manual",
      sportId: body.sportId,
      name: body.name,
      startDate,
      movingTimeS: body.durationS,
      elapsedTimeS: body.durationS,
      distanceM: body.distanceM ?? null,
      totalElevationGainM: body.elevationGainM ?? null,
      avgHr: body.avgHr ?? null,
      avgPower: body.avgPower ?? null,
      sets: body.sets ?? null,
      reps: body.reps ?? null,
      weightUsedKg: body.weightKg ?? null,
      description: body.notes ?? null,
      raw: body.sets ? { sets: body.sets, reps: body.reps, weightKg: body.weightKg } : null,
    })
    .returning();

  await enqueue("compute_activity_metrics", { activityId: row.id });
  await afterActivityCreated(user.id, row.id, body.sportId);

  if (user.id && (await getConnection(user.id)) && sport.stravaType) {
    await enqueue("strava_push_activity", { userId: user.id, activityId: row.id });
  }

  return c.json({ id: row.id }, 201);
});

activityRoutes.post("/:id/push-strava", async (c) => {
  const user = getAuthUser(c);
  const id = c.req.param("id");
  const rows = await db
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.userId, user.id)))
    .limit(1);
  if (rows.length === 0) throw new ApiError(404, "Aktivitas tidak ditemukan");
  if (!(await getConnection(user.id))) throw new ApiError(400, "Strava belum terhubung");
  const job = await enqueue("strava_push_activity", { userId: user.id, activityId: id });
  return c.json({ queued: true, jobId: job.id });
});

activityRoutes.post("/:id/recompute", async (c) => {
  const user = getAuthUser(c);
  const id = c.req.param("id");
  const rows = await db
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.userId, user.id)))
    .limit(1);
  if (rows.length === 0) throw new ApiError(404, "Aktivitas tidak ditemukan");
  await enqueue("compute_activity_metrics", { activityId: id });
  if (!(await hasPendingJob("regenerate_plan", user.id))) {
    await enqueue("regenerate_plan", { userId: user.id, trigger: "new_activity" }, new Date(Date.now() + 5000));
  }
  return c.json({ queued: true });
});
