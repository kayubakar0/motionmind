import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { activities, activityMetrics, sports } from "../db/schema";
import type { DashboardStats, FitnessPoint } from "shared";

export async function getDailyTss(userId: string, days: number): Promise<Array<{ date: string; tss: number }>> {
  const rows = await db
    .select({
      date: sql<string>`to_char(${activities.startDate}, 'YYYY-MM-DD')`,
      tss: sql<number>`coalesce(sum(${activityMetrics.tss}), 0)`,
    })
    .from(activities)
    .innerJoin(activityMetrics, eq(activityMetrics.activityId, activities.id))
    .where(and(eq(activities.userId, userId), gte(activities.startDate, sql`now() - (${days} || ' days')::interval`)))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return rows.map((r) => ({ date: r.date, tss: Math.round(Number(r.tss) * 10) / 10 }));
}

export function computeFitnessSeries(daily: Array<{ date: string; tss: number }>, days: number): FitnessPoint[] {
  const byDate = new Map(daily.map((d) => [d.date, d.tss]));
  const out: FitnessPoint[] = [];
  let ctl = 0;
  let atl = 0;
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const ctlFactor = 1 - Math.exp(-1 / 42);
  const atlFactor = 1 - Math.exp(-1 / 7);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const tss = byDate.get(key) ?? 0;
    ctl = ctl + (tss - ctl) * ctlFactor;
    atl = atl + (tss - atl) * atlFactor;
    out.push({
      date: key,
      tss: Math.round(tss * 10) / 10,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round((ctl - atl) * 10) / 10,
    });
  }
  return out;
}

function isoWeekStart(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  if (day !== 1) date.setUTCDate(date.getUTCDate() - (day - 1));
  return date.toISOString().slice(0, 10);
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const since = new Date(Date.now() - 91 * 86400000);

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
      elevation: activities.totalElevationGainM,
      avgPower: activities.avgPower,
      avgHr: activities.avgHr,
      tss: activityMetrics.tss,
    })
    .from(activities)
    .leftJoin(sports, eq(sports.id, activities.sportId))
    .leftJoin(activityMetrics, eq(activityMetrics.activityId, activities.id))
    .where(and(eq(activities.userId, userId), gte(activities.startDate, since)))
    .orderBy(desc(activities.startDate))
    .limit(1000);

  const fitness = computeFitnessSeries(await getDailyTss(userId, 91), 91);
  const last = fitness[fitness.length - 1];

  const weekMap = new Map<
    string,
    { hoursBySport: Record<string, number>; totalHours: number; tss: number }
  >();
  for (const r of rows) {
    const week = isoWeekStart(new Date(r.startDate));
    if (!weekMap.has(week)) weekMap.set(week, { hoursBySport: {}, totalHours: 0, tss: 0 });
    const w = weekMap.get(week)!;
    const hours = (r.movingTimeS ?? r.elapsedTimeS ?? 0) / 3600;
    const sportName = r.sportName ?? r.sportId;
    w.hoursBySport[sportName] = Math.round(((w.hoursBySport[sportName] ?? 0) + hours) * 100) / 100;
    w.totalHours = Math.round((w.totalHours + hours) * 100) / 100;
    w.tss = Math.round((w.tss + (r.tss ?? 0)) * 10) / 10;
  }
  const weekly = [...weekMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, v]) => ({ weekStart, ...v }));

  const cutoff30 = Date.now() - 30 * 86400000;
  const last30 = rows.filter((r) => new Date(r.startDate).getTime() >= cutoff30);

  return {
    fitness,
    weekly,
    totals: {
      activities30d: last30.length,
      hours30d: Math.round(last30.reduce((a, r) => a + (r.movingTimeS ?? r.elapsedTimeS ?? 0) / 3600, 0) * 10) / 10,
      tss30d: Math.round(last30.reduce((a, r) => a + (r.tss ?? 0), 0) * 10) / 10,
      distance30dKm: Math.round(last30.reduce((a, r) => a + (r.distanceM ?? 0), 0) / 100) / 10,
      currentCtl: last?.ctl ?? 0,
      currentAtl: last?.atl ?? 0,
      currentTsb: last?.tsb ?? 0,
    },
    recentActivities: rows.slice(0, 8).map((r) => ({
      id: r.id,
      sportId: r.sportId,
      sportName: r.sportName ?? r.sportId,
      source: r.source,
      name: r.name,
      startDate: new Date(r.startDate).toISOString(),
      distanceM: r.distanceM,
      movingTimeS: r.movingTimeS,
      elapsedTimeS: r.elapsedTimeS,
      totalElevationGainM: r.elevation,
      avgPower: r.avgPower,
      avgHr: r.avgHr,
      tss: r.tss,
    })),
  };
}
