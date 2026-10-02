import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { activities, activityStreams, sports, type NewActivity, type ParsedStreams } from "../../db/schema";
import { enqueue } from "../../jobs/queue";
import {
  getValidAccessToken,
  stravaGet,
  stravaPost,
  type StravaActivitySummary,
} from "./client";

const TYPE_TO_SPORT: Record<string, string> = {
  Ride: "ride",
  VirtualRide: "virtual_ride",
  GravelRide: "gravel_ride",
  MountainBikeRide: "mountain_bike",
  EBikeRide: "ride",
  Handcycle: "ride",
  Velomobile: "ride",
  Run: "run",
  TrailRun: "trail_run",
  TrackRun: "run",
  Treadmill: "run",
  Swim: "swim",
  OpenWaterSwim: "swim",
  WeightTraining: "strength",
  Workout: "workout",
  HIIT: "hiit",
  Crossfit: "hiit",
  StairsStepper: "stairs",
  Elliptical: "elliptical",
  Yoga: "yoga",
  Pilates: "yoga",
  Barre: "yoga",
  Hike: "hike",
  Walk: "walk",
  Snowshoe: "hike",
  Rowing: "row",
  VirtualRow: "row",
  Kayaking: "kayak",
  Canoe: "kayak",
  StandUpPaddling: "sup",
  Surfing: "surf",
  Kitesurf: "surf",
  Windsurf: "surf",
  IceSkate: "skating",
  InlineSkate: "skating",
  AlpineSki: "alpine_ski",
  BackcountrySki: "alpine_ski",
  Snowboard: "snowboard",
  NordicSki: "nordic_ski",
  RockClimbing: "climbing",
  Golf: "golf",
  Soccer: "soccer",
  Tennis: "workout",
};

export function mapSport(type: string): string {
  return TYPE_TO_SPORT[type] ?? "workout";
}

function resolveSportId(stravaType: string, validIds: Set<string>): string {
  const mapped = mapSport(stravaType);
  if (validIds.has(mapped)) return mapped;
  if (validIds.has("workout")) return "workout";
  return "ride";
}

function summaryToActivity(userId: string, a: StravaActivitySummary, validSportIds: Set<string>): NewActivity {
  return {
    userId,
    source: "strava",
    externalId: String(a.id),
    sportId: resolveSportId(a.sport_type ?? a.type, validSportIds),
    name: a.name?.slice(0, 200) || "Aktivitas Strava",
    description: a.description ?? null,
    startDate: new Date(a.start_date),
    timezone: a.timezone ?? null,
    distanceM: a.distance ?? null,
    movingTimeS: a.moving_time ?? null,
    elapsedTimeS: a.elapsed_time ?? null,
    totalElevationGainM: a.total_elevation_gain ?? null,
    avgSpeed: a.average_speed ?? null,
    maxSpeed: a.max_speed ?? null,
    avgHr: a.average_heartrate ?? null,
    maxHr: a.max_heartrate ?? null,
    avgCadence: a.average_cadence ?? null,
    avgPower: a.average_watts ?? null,
    maxPower: a.max_watts ?? null,
    calories: a.calories ?? (a.kilojoules ? Math.round(a.kilojoules) : null),
    deviceName: a.device_name ?? null,
    trainer: Boolean(a.trainer),
    raw: a as unknown as Record<string, unknown>,
  };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function syncUserActivities(userId: string, opts: { backfill?: boolean } = {}): Promise<{ imported: number; streamsQueued: number }> {
  const token = await getValidAccessToken(userId);
  const sportRows = await db.select({ id: sports.id }).from(sports);
  const validSportIds = new Set(sportRows.map((s) => s.id));
  let imported = 0;
  let streamsQueued = 0;
  const maxPages = opts.backfill ? 30 : 5;
  const perPage = 100;

  for (let page = 1; page <= maxPages; page++) {
    const items = await stravaGet<StravaActivitySummary[]>("/athlete/activities", token, {
      per_page: perPage,
      page,
    });
    if (!Array.isArray(items) || items.length === 0) break;

    for (const a of items) {
      const externalId = String(a.id);
      const existing = await db
        .select({ id: activities.id })
        .from(activities)
        .where(and(eq(activities.userId, userId), eq(activities.source, "strava"), eq(activities.externalId, externalId)))
        .limit(1);
      if (existing.length > 0) continue;

      // hindari duplikat dengan aktivitas manual yang sudah di-push ke Strava
      const startDate = new Date(a.start_date);
      const manualDupe = await db
        .select({ id: activities.id })
        .from(activities)
        .where(
          and(
            eq(activities.userId, userId),
            eq(activities.source, "manual"),
            eq(activities.pushedToStrava, true),
            sql`abs(extract(epoch from (${activities.startDate} - ${startDate.toISOString()}::timestamptz))) < 300`
          )
        )
        .limit(1);
      if (manualDupe.length > 0) continue;

      const [row] = await db.insert(activities).values(summaryToActivity(userId, a, validSportIds)).returning({ id: activities.id });
      imported++;
      streamsQueued++;
      await enqueue("fetch_strava_stream", { userId, activityId: row.id, externalId });
    }

    if (items.length < perPage) break;
    await sleep(400);
  }

  const { stravaConnections } = await import("../../db/schema");
  await db.update(stravaConnections).set({ lastSyncAt: new Date() }).where(eq(stravaConnections.userId, userId));
  return { imported, streamsQueued };
}

const STREAM_KEYS = "time,latlng,altitude,heartrate,cadence,watts,velocity_smooth,distance,temp,moving";

export async function fetchAndStoreStreams(userId: string, activityId: string, externalId: string): Promise<void> {
  const token = await getValidAccessToken(userId);
  const data = await stravaGet<Record<string, { data: Array<number | number[]> } | undefined>>(
    `/activities/${externalId}/streams`,
    token,
    { keys: STREAM_KEYS, key_by_type: "true" }
  );

  const time = (data.time?.data as number[]) ?? [];
  if (time.length === 0) return;

  const streams: ParsedStreams = { time };
  const pick = (key: string): (number | null)[] | null => {
    const arr = data[key]?.data;
    if (!Array.isArray(arr)) return null;
    const filled: (number | null)[] = [];
    for (let i = 0; i < time.length; i++) {
      const v = arr[i];
      filled.push(typeof v === "number" && Number.isFinite(v) ? v : null);
    }
    return filled;
  };

  const latlngRaw = data.latlng?.data;
  if (Array.isArray(latlngRaw)) {
    streams.latlng = time.map((_, i) => {
      const p = latlngRaw[i];
      return Array.isArray(p) && p.length === 2 ? ([p[0], p[1]] as [number, number]) : null;
    }).filter((p): p is [number, number] => p !== null);
  }

  const altitude = pick("altitude");
  const heartrate = pick("heartrate");
  const cadence = pick("cadence");
  const watts = pick("watts");
  const velocity = pick("velocity_smooth");
  const distance = pick("distance");

  const clean = (arr: (number | null)[] | null) => {
    if (!arr || !arr.some((v) => v != null)) return null;
    const out: number[] = [];
    let last = 0;
    for (const v of arr) {
      if (v != null) last = v;
      out.push(last);
    }
    return out;
  };

  streams.altitude = clean(altitude);
  streams.heartrate = clean(heartrate);
  streams.cadence = clean(cadence);
  streams.watts = clean(watts);
  streams.velocity = clean(velocity);
  streams.distance = clean(distance);

  await db.delete(activityStreams).where(eq(activityStreams.activityId, activityId));
  await db.insert(activityStreams).values({ activityId, ...streams });
  await enqueue("compute_activity_metrics", { activityId });
}

export async function pushActivityToStrava(userId: string, activityId: string): Promise<{ stravaId?: string }> {
  const rows = await db
    .select({ activity: activities, stravaType: sports.stravaType })
    .from(activities)
    .leftJoin(sports, eq(sports.id, activities.sportId))
    .where(and(eq(activities.id, activityId), eq(activities.userId, userId)))
    .limit(1);
  if (rows.length === 0) throw new Error("Aktivitas tidak ditemukan");
  const { activity, stravaType } = rows[0];
  if (activity.pushedToStrava && activity.externalId) return { stravaId: activity.externalId };
  if (!stravaType) throw new Error(`Sport ${activity.sportId} tidak didukung Strava`);

  const token = await getValidAccessToken(userId);
  const body: Record<string, unknown> = {
    name: activity.name,
    type: stravaType,
    sport_type: stravaType,
    start_date_local: new Date(activity.startDate).toISOString(),
    elapsed_time: activity.elapsedTimeS ?? activity.movingTimeS ?? 0,
    description: activity.description ?? undefined,
  };
  if (activity.distanceM) body.distance = Math.round(activity.distanceM);
  if (activity.trainer) body.trainer = true;

  const created = await stravaPost<{ id: number }>("/activities", token, body);
  await db
    .update(activities)
    .set({ pushedToStrava: true, externalId: String(created.id) })
    .where(eq(activities.id, activityId));
  return { stravaId: String(created.id) };
}
