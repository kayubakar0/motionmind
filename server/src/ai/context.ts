import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  activities,
  activityMetrics,
  athleteProfiles,
  planSessions,
  sports,
  targets,
  trainingPlans,
  userFeedback,
  userSports,
  users,
} from "../db/schema";
import { computeFitnessSeries, getDailyTss } from "../services/fitness";

export interface CoachContext {
  generatedAt: string;
  athlete: {
    username: string;
    name: string | null;
    ftp: number | null;
    maxHr: number | null;
    restingHr: number | null;
    weightKg: number | null;
    weeklyHoursTarget: number | null;
    experienceLevel: string | null;
    sports: Array<{ id: string; name: string; category: string }>;
    primarySport: string | null;
  };
  fitness: {
    currentCtl: number;
    currentAtl: number;
    currentTsb: number;
    dailyTss28d: Array<{ date: string; tss: number }>;
  };
  volume: {
    last6Weeks: Array<{ weekStart: string; hoursBySport: Record<string, number>; totalHours: number; tss: number }>;
    summary30d: {
      activities: number;
      hours: number;
      tss: number;
      distanceKm: number;
      bySport: Record<string, { hours: number; tss: number }>;
    };
  };
  recentSessions: Array<{
    date: string;
    sportId: string;
    name: string;
    status: string;
    workoutType: string;
    tssPlanned: number | null;
    reason: string | null;
  }>;
  targets: Array<{
    id: string;
    name: string;
    type: string;
    sportId: string;
    targetDate: string | null;
    distanceM: number | null;
    elevationM: number | null;
    durationS: number | null;
    routeStats: { distanceM?: number; elevationM?: number } | null;
  }>;
  feedback7d: Array<{
    date: string;
    fatigueLevel: number;
    sleepQuality: number | null;
    soreness: number | null;
    availabilityHours: number | null;
    notes: string | null;
  }>;
}

function mondayOf(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  if (day !== 1) date.setUTCDate(date.getUTCDate() - (day - 1));
  return date.toISOString().slice(0, 10);
}

function weekStartOf(d: Date): string {
  return mondayOf(d);
}

export async function buildCoachContext(userId: string): Promise<CoachContext> {
  const [profileRows, sportRows, userRows] = await Promise.all([
    db.select().from(athleteProfiles).where(eq(athleteProfiles.userId, userId)).limit(1),
    db
      .select({ sportId: userSports.sportId, isPrimary: userSports.isPrimary, name: sports.name, category: sports.category })
      .from(userSports)
      .innerJoin(sports, eq(sports.id, userSports.sportId))
      .where(eq(userSports.userId, userId)),
    db.select({ username: users.username, name: users.name }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  const profile = profileRows[0] ?? null;
  const user = userRows[0] ?? null;
  const primary = sportRows.find((s) => s.isPrimary) ?? null;

  const daily = await getDailyTss(userId, 28);
  const series = computeFitnessSeries(daily, 28);
  const last = series[series.length - 1];

  const since30 = new Date(Date.now() - 30 * 86400000);
  const since42 = new Date(Date.now() - 42 * 86400000);

  const recentRows = await db
    .select({
      startDate: activities.startDate,
      sportId: activities.sportId,
      movingTimeS: activities.movingTimeS,
      elapsedTimeS: activities.elapsedTimeS,
      distanceM: activities.distanceM,
      tss: activityMetrics.tss,
    })
    .from(activities)
    .leftJoin(activityMetrics, eq(activityMetrics.activityId, activities.id))
    .where(and(eq(activities.userId, userId), gte(activities.startDate, since42)))
    .orderBy(desc(activities.startDate))
    .limit(500);

  const weekMap = new Map<string, { hoursBySport: Record<string, number>; totalHours: number; tss: number }>();
  const bySport30d: Record<string, { hours: number; tss: number }> = {};
  let sum30 = { activities: 0, hours: 0, tss: 0, distanceKm: 0 };
  for (const r of recentRows) {
    const week = weekStartOf(new Date(r.startDate));
    if (!weekMap.has(week)) weekMap.set(week, { hoursBySport: {}, totalHours: 0, tss: 0 });
    const w = weekMap.get(week)!;
    const hours = (r.movingTimeS ?? r.elapsedTimeS ?? 0) / 3600;
    const sportName = r.sportId;
    w.hoursBySport[sportName] = Math.round(((w.hoursBySport[sportName] ?? 0) + hours) * 100) / 100;
    w.totalHours = Math.round((w.totalHours + hours) * 100) / 100;
    w.tss = Math.round((w.tss + (r.tss ?? 0)) * 10) / 10;
    if (new Date(r.startDate).getTime() >= since30.getTime()) {
      sum30.activities++;
      sum30.hours += hours;
      sum30.tss += r.tss ?? 0;
      sum30.distanceKm += (r.distanceM ?? 0) / 1000;
      if (!bySport30d[sportName]) bySport30d[sportName] = { hours: 0, tss: 0 };
      bySport30d[sportName].hours = Math.round((bySport30d[sportName].hours + hours) * 100) / 100;
      bySport30d[sportName].tss = Math.round((bySport30d[sportName].tss + (r.tss ?? 0)) * 10) / 10;
    }
  }

  const last6Weeks = [...weekMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([weekStart, v]) => ({ weekStart, ...v }));

  const sessionRows = await db
    .select({
      date: planSessions.date,
      sportId: planSessions.sportId,
      title: planSessions.title,
      status: planSessions.status,
      workoutType: planSessions.workoutType,
      tssPlanned: planSessions.tssPlanned,
      reason: planSessions.reason,
    })
    .from(planSessions)
    .innerJoin(trainingPlans, eq(trainingPlans.id, planSessions.planId))
    .where(
      and(
        eq(planSessions.userId, userId),
        eq(trainingPlans.status, "active"),
        gte(planSessions.date, sql`to_char(now() - interval '14 days', 'YYYY-MM-DD')`)
      )
    )
    .orderBy(planSessions.date)
    .limit(120);

  const targetRows = await db
    .select()
    .from(targets)
    .where(and(eq(targets.userId, userId), eq(targets.status, "active")))
    .orderBy(desc(targets.createdAt));

  const feedbackRows = await db
    .select()
    .from(userFeedback)
    .where(
      and(
        eq(userFeedback.userId, userId),
        gte(userFeedback.date, sql`to_char(now() - interval '7 days', 'YYYY-MM-DD')`)
      )
    )
    .orderBy(desc(userFeedback.date))
    .limit(7);

  return {
    generatedAt: new Date().toISOString(),
    athlete: {
      username: user?.username ?? "",
      name: user?.name ?? null,
      ftp: profile?.ftp ?? null,
      maxHr: profile?.maxHr ?? null,
      restingHr: profile?.restingHr ?? null,
      weightKg: profile?.weightKg ?? null,
      weeklyHoursTarget: profile?.weeklyHoursTarget ?? null,
      experienceLevel: profile?.experienceLevel ?? null,
      sports: sportRows.map((s) => ({ id: s.sportId, name: s.name, category: s.category })),
      primarySport: primary?.sportId ?? null,
    },
    fitness: {
      currentCtl: last?.ctl ?? 0,
      currentAtl: last?.atl ?? 0,
      currentTsb: last?.tsb ?? 0,
      dailyTss28d: daily,
    },
    volume: {
      last6Weeks,
      summary30d: {
        activities: sum30.activities,
        hours: Math.round(sum30.hours * 10) / 10,
        tss: Math.round(sum30.tss),
        distanceKm: Math.round(sum30.distanceKm),
        bySport: bySport30d,
      },
    },
    recentSessions: sessionRows.map((s) => ({
      date: s.date,
      sportId: s.sportId,
      name: s.title,
      status: s.status,
      workoutType: s.workoutType,
      tssPlanned: s.tssPlanned,
      reason: s.reason ?? null,
    })),
    targets: targetRows.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      sportId: t.sportId,
      targetDate: t.targetDate,
      distanceM: t.distanceM,
      elevationM: t.elevationM,
      durationS: t.durationS,
      routeStats: t.routeStats ? { distanceM: t.routeStats.distanceM, elevationM: t.routeStats.elevationM } : null,
    })),
    feedback7d: feedbackRows.map((f) => ({
      date: f.date,
      fatigueLevel: f.fatigueLevel,
      sleepQuality: f.sleepQuality,
      soreness: f.soreness,
      availabilityHours: f.availabilityHours,
      notes: f.notes,
    })),
  };
}
