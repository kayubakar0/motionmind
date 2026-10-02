import { and, eq, gt, isNull, or } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { ForgotInput, LoginInput, RegisterInput, ResetInput } from "shared";
import { db } from "../db";
import { athleteProfiles, passwordResetTokens, sessions, stravaConnections, userSports, users } from "../db/schema";
import { ApiError, parseBody } from "../http/helpers";
import { createSession, destroySession, getAuthUser, requireAuth, type AppEnv } from "../middleware/auth";
import { sha256 } from "../lib/encrypt";
import { env } from "../lib/env";

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/register", async (c) => {
  const body = await parseBody(c, RegisterInput);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, body.username)).limit(1);
  if (existing.length > 0) throw new ApiError(409, "Username sudah dipakai");
  if (body.email) {
    const emailTaken = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
    if (emailTaken.length > 0) throw new ApiError(409, "Email sudah terdaftar");
  }
  const passwordHash = await Bun.password.hash(body.password);
  const [user] = await db
    .insert(users)
    .values({
      username: body.username,
      email: body.email || null,
      name: body.name || null,
      passwordHash,
    })
    .returning();
  await db.insert(athleteProfiles).values({ userId: user.id }).onConflictDoNothing();
  await createSession(c, user.id);
  return c.json({ id: user.id, username: user.username, role: user.role, onboardingDone: user.onboardingDone });
});

authRoutes.post("/login", async (c) => {
  const body = await parseBody(c, LoginInput);
  const rows = await db.select().from(users).where(eq(users.username, body.username)).limit(1);
  if (rows.length === 0) throw new ApiError(401, "Username atau password salah");
  const user = rows[0];
  const valid = await Bun.password.verify(body.password, user.passwordHash);
  if (!valid) throw new ApiError(401, "Username atau password salah");
  await createSession(c, user.id);
  return c.json({ id: user.id, username: user.username, role: user.role, onboardingDone: user.onboardingDone });
});

authRoutes.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const [profileRows, sportRows, stravaRows] = await Promise.all([
    db.select().from(athleteProfiles).where(eq(athleteProfiles.userId, user.id)).limit(1),
    db.select().from(userSports).where(eq(userSports.userId, user.id)),
    db.select().from(stravaConnections).where(eq(stravaConnections.userId, user.id)).limit(1),
  ]);
  const profile = profileRows[0] ?? null;
  const primary = sportRows.find((s) => s.isPrimary) ?? null;
  return c.json({
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
    onboardingDone: user.onboardingDone,
    sports: sportRows.map((s) => s.sportId),
    primarySport: primary?.sportId ?? null,
    profile: {
      ftp: profile?.ftp ?? null,
      weightKg: profile?.weightKg ?? null,
      restingHr: profile?.restingHr ?? null,
      maxHr: profile?.maxHr ?? null,
      weeklyHoursTarget: profile?.weeklyHoursTarget ?? null,
      experienceLevel: profile?.experienceLevel ?? null,
    },
    stravaConnected: stravaRows.length > 0,
    stravaLastSync: stravaRows[0]?.lastSyncAt?.toISOString() ?? null,
  });
});

authRoutes.post("/forgot", async (c) => {
  const body = await parseBody(c, ForgotInput);
  const rows = await db
    .select()
    .from(users)
    .where(or(eq(users.username, body.username), eq(users.email, body.username)))
    .limit(1);
  const generic = { ok: true, message: "Jika akun ditemukan, token reset telah dibuat." };
  if (rows.length === 0) return c.json(generic);
  const user = rows[0];
  const token = randomBytes(24).toString("hex");
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 3600_000),
  });
  // Pengembangan: kirim email belum dikonfigurasi; token dikembalikan agar bisa diuji
  return c.json({ ...generic, devToken: env.IS_DEV ? token : undefined });
});

authRoutes.post("/reset", async (c) => {
  const body = await parseBody(c, ResetInput);
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, sha256(body.token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);
  if (rows.length === 0) throw new ApiError(400, "Token reset tidak valid atau kedaluwarsa");
  const passwordHash = await Bun.password.hash(body.password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, rows[0].userId));
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, rows[0].id));
  await db.delete(sessions).where(eq(sessions.userId, rows[0].userId));
  return c.json({ ok: true });
});
