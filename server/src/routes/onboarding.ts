import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { OnboardingInput } from "shared";
import { db } from "../db";
import { athleteProfiles, ftpHistory, sports, userSports, users } from "../db/schema";
import { ApiError, parseBody } from "../http/helpers";
import { getAuthUser, requireAuth, type AppEnv } from "../middleware/auth";

export const onboardingRoutes = new Hono<AppEnv>();

onboardingRoutes.get("/sports", requireAuth(), async (c) => {
  const rows = await db.select().from(sports);
  return c.json(rows);
});

onboardingRoutes.get("/status", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const [allSports, mine, profileRows] = await Promise.all([
    db.select().from(sports),
    db.select().from(userSports).where(eq(userSports.userId, user.id)),
    db.select().from(athleteProfiles).where(eq(athleteProfiles.userId, user.id)).limit(1),
  ]);
  const primary = mine.find((s) => s.isPrimary) ?? null;
  return c.json({
    onboardingDone: user.onboardingDone,
    sports: allSports,
    selected: mine.map((s) => s.sportId),
    primarySport: primary?.sportId ?? null,
    profile: profileRows[0] ?? null,
  });
});

onboardingRoutes.post("/", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const body = await parseBody(c, OnboardingInput);
  if (!body.sports.includes(body.primarySport)) {
    throw new ApiError(400, "Olahraga utama harus termasuk dalam daftar olahraga terpilih");
  }
  const known = await db.select({ id: sports.id }).from(sports);
  const knownIds = new Set(known.map((k) => k.id));
  for (const s of body.sports) {
    if (!knownIds.has(s)) throw new ApiError(400, `Sport tidak dikenal: ${s}`);
  }

  await db.delete(userSports).where(eq(userSports.userId, user.id));
  await db.insert(userSports).values(
    body.sports.map((s) => ({ userId: user.id, sportId: s, isPrimary: s === body.primarySport }))
  );

  const p = body.profile ?? {};
  const insertValues = {
    userId: user.id,
    ftp: p.ftp ?? null,
    weightKg: p.weightKg ?? null,
    restingHr: p.restingHr ?? null,
    maxHr: p.maxHr ?? null,
    weeklyHoursTarget: p.weeklyHoursTarget ?? null,
    experienceLevel: p.experienceLevel ?? null,
    age: p.age ?? null,
    heightCm: p.heightCm ?? null,
    lthr: p.lthr ?? null,
    preferredDaysPerWeek: p.preferredDaysPerWeek ?? null,
    preferredWorkoutTime: p.preferredWorkoutTime ?? null,
    hasPowerMeter: p.hasPowerMeter ?? null,
    hasTrainer: p.hasTrainer ?? null,
    healthNotes: p.healthNotes ?? null,
    updatedAt: new Date(),
  };
  const updateSet: Partial<typeof athleteProfiles.$inferInsert> = { updatedAt: new Date() };
  if (p.ftp !== undefined) updateSet.ftp = p.ftp;
  if (p.weightKg !== undefined) updateSet.weightKg = p.weightKg;
  if (p.restingHr !== undefined) updateSet.restingHr = p.restingHr;
  if (p.maxHr !== undefined) updateSet.maxHr = p.maxHr;
  if (p.weeklyHoursTarget !== undefined) updateSet.weeklyHoursTarget = p.weeklyHoursTarget;
  if (p.experienceLevel !== undefined) updateSet.experienceLevel = p.experienceLevel;
  if (p.age !== undefined) updateSet.age = p.age;
  if (p.heightCm !== undefined) updateSet.heightCm = p.heightCm;
  if (p.lthr !== undefined) updateSet.lthr = p.lthr;
  if (p.preferredDaysPerWeek !== undefined) updateSet.preferredDaysPerWeek = p.preferredDaysPerWeek;
  if (p.preferredWorkoutTime !== undefined) updateSet.preferredWorkoutTime = p.preferredWorkoutTime;
  if (p.hasPowerMeter !== undefined) updateSet.hasPowerMeter = p.hasPowerMeter;
  if (p.hasTrainer !== undefined) updateSet.hasTrainer = p.hasTrainer;
  if (p.healthNotes !== undefined) updateSet.healthNotes = p.healthNotes;
  await db
    .insert(athleteProfiles)
    .values(insertValues)
    .onConflictDoUpdate({ target: athleteProfiles.userId, set: updateSet });

  if (p.ftp) {
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(ftpHistory).values({ userId: user.id, date: today, ftp: p.ftp, source: "onboarding" });
  }

  await db.update(users).set({ onboardingDone: true }).where(eq(users.id, user.id));
  return c.json({ ok: true });
});
