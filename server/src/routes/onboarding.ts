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
  await db
    .insert(athleteProfiles)
    .values({
      userId: user.id,
      ftp: p.ftp ?? null,
      weightKg: p.weightKg ?? null,
      restingHr: p.restingHr ?? null,
      maxHr: p.maxHr ?? null,
      weeklyHoursTarget: p.weeklyHoursTarget ?? null,
      experienceLevel: p.experienceLevel ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: athleteProfiles.userId,
      set: {
        ftp: p.ftp ?? null,
        weightKg: p.weightKg ?? null,
        restingHr: p.restingHr ?? null,
        maxHr: p.maxHr ?? null,
        weeklyHoursTarget: p.weeklyHoursTarget ?? null,
        experienceLevel: p.experienceLevel ?? null,
        updatedAt: new Date(),
      },
    });

  if (p.ftp) {
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(ftpHistory).values({ userId: user.id, date: today, ftp: p.ftp, source: "onboarding" });
  }

  await db.update(users).set({ onboardingDone: true }).where(eq(users.id, user.id));
  return c.json({ ok: true });
});
