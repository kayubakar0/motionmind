import { and, eq, gt } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db } from "../db";
import { sessions, users, type User } from "../db/schema";
import { sha256 } from "../lib/encrypt";
import { ApiError } from "../http/helpers";

export const SESSION_COOKIE = "mm_session";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export type AppEnv = { Variables: { user: User } };

export async function createSession(c: { header: (k: string, v: string) => void }, userId: string) {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt });
  setCookie(c as never, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession(c: Parameters<typeof getCookie>[0]) {
  const token = getCookie(c as never, SESSION_COOKIE);
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  }
  deleteCookie(c as never, SESSION_COOKIE, { path: "/" });
}

export const requireAuth = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) throw new ApiError(401, "Belum login");
    const rows = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
      .limit(1);
    if (rows.length === 0) throw new ApiError(401, "Sesi tidak valid atau kedaluwarsa");
    c.set("user", rows[0].user);
    await next();
  });

export const requireAdmin = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) throw new ApiError(401, "Belum login");
    const rows = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
      .limit(1);
    if (rows.length === 0) throw new ApiError(401, "Sesi tidak valid atau kedaluwarsa");
    if (rows[0].user.role !== "admin") throw new ApiError(403, "Akses khusus admin");
    c.set("user", rows[0].user);
    await next();
  });

export function getAuthUser(c: Parameters<typeof getCookie>[0]): User {
  const user = (c as unknown as { get: (k: string) => User }).get("user");
  if (!user) throw new ApiError(401, "Belum login");
  return user;
}
