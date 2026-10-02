import { z } from "zod";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { stravaConnections } from "../db/schema";
import { ApiError, parseBody } from "../http/helpers";
import { getAuthUser, requireAuth, type AppEnv } from "../middleware/auth";
import { buildAuthorizeUrl, exchangeCode, getConnection, saveConnection } from "../services/strava/client";
import { enqueue, hasPendingJob } from "../jobs/queue";

export const stravaRoutes = new Hono<AppEnv>();

stravaRoutes.use("*", requireAuth());

stravaRoutes.get("/connect", (c) => {
  return c.json({ url: buildAuthorizeUrl() });
});

stravaRoutes.post("/exchange", async (c) => {
  const user = getAuthUser(c);
  const body = await parseBody(c, z.object({ code: z.string().min(5) }));
  const tokenRes = await exchangeCode(body.code);
  await saveConnection(user.id, tokenRes);
  if (!(await hasPendingJob("sync_strava_activities", user.id))) {
    await enqueue("sync_strava_activities", { userId: user.id, backfill: true });
  }
  return c.json({ ok: true });
});

stravaRoutes.get("/status", async (c) => {
  const user = getAuthUser(c);
  const conn = await getConnection(user.id);
  return c.json({
    connected: conn != null,
    athleteId: conn?.athleteId ?? null,
    lastSyncAt: conn?.lastSyncAt?.toISOString() ?? null,
    scope: conn?.scope ?? null,
  });
});

stravaRoutes.post("/sync", async (c) => {
  const user = getAuthUser(c);
  const conn = await getConnection(user.id);
  if (!conn) throw new ApiError(400, "Strava belum terhubung");
  if (await hasPendingJob("sync_strava_activities", user.id)) {
    return c.json({ queued: false, message: "Sinkronisasi sudah berjalan" });
  }
  const job = await enqueue("sync_strava_activities", { userId: user.id });
  return c.json({ queued: true, jobId: job.id });
});

stravaRoutes.delete("/", async (c) => {
  const user = getAuthUser(c);
  await db.delete(stravaConnections).where(eq(stravaConnections.userId, user.id));
  return c.json({ ok: true });
});
