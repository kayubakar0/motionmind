import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { TargetInput, TargetUpdateInput } from "shared";
import { db } from "../db";
import { files, targets } from "../db/schema";
import { ApiError, parseBody } from "../http/helpers";
import { getAuthUser, requireAuth, type AppEnv } from "../middleware/auth";
import { enqueue, hasPendingJob } from "../jobs/queue";
import { analyzeRoute } from "../services/routeAnalysis";

export const targetRoutes = new Hono<AppEnv>();

targetRoutes.use("*", requireAuth());

async function triggerRegen(userId: string, targetId: string, delayMs = 3000) {
  if (await hasPendingJob("regenerate_plan", userId)) return;
  await enqueue("regenerate_plan", { userId, targetId, trigger: "target_change" }, new Date(Date.now() + delayMs));
}

targetRoutes.get("/", async (c) => {
  const user = getAuthUser(c);
  const rows = await db
    .select()
    .from(targets)
    .where(eq(targets.userId, user.id))
    .orderBy(desc(targets.status), desc(targets.createdAt));
  return c.json(
    rows.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    }))
  );
});

targetRoutes.get("/:id", async (c) => {
  const user = getAuthUser(c);
  const rows = await db
    .select()
    .from(targets)
    .where(and(eq(targets.id, c.req.param("id")), eq(targets.userId, user.id)))
    .limit(1);
  if (rows.length === 0) throw new ApiError(404, "Target tidak ditemukan");
  return c.json({ ...rows[0], createdAt: rows[0].createdAt.toISOString() });
});

targetRoutes.get("/:id/analysis", async (c) => {
  const user = getAuthUser(c);
  const rows = await db
    .select()
    .from(targets)
    .where(and(eq(targets.id, c.req.param("id")), eq(targets.userId, user.id)))
    .limit(1);
  if (rows.length === 0) throw new ApiError(404, "Target tidak ditemukan");
  return c.json(await analyzeRoute(rows[0]));
});

targetRoutes.post("/", async (c) => {
  const user = getAuthUser(c);
  const body = await parseBody(c, TargetInput);
  if (body.fileId) {
    const fileRows = await db
      .select()
      .from(files)
      .where(and(eq(files.id, body.fileId), eq(files.userId, user.id), eq(files.kind, "route")))
      .limit(1);
    if (fileRows.length === 0) throw new ApiError(400, "File rute tidak ditemukan, unggah GPX rute terlebih dahulu");
    await enqueue("parse_route_file", { userId: user.id, fileId: body.fileId });
  }
  const [row] = await db
    .insert(targets)
    .values({
      userId: user.id,
      sportId: body.sportId,
      name: body.name,
      description: body.description ?? null,
      type: body.type,
      targetDate: body.targetDate ?? null,
      distanceM: body.distanceM ?? null,
      elevationM: body.elevationM ?? null,
      durationS: body.durationS ?? null,
      fileId: body.fileId ?? null,
    })
    .returning();
  await triggerRegen(user.id, row.id);
  return c.json({ ...row, createdAt: row.createdAt.toISOString() }, 201);
});

targetRoutes.patch("/:id", async (c) => {
  const user = getAuthUser(c);
  const id = c.req.param("id");
  const body = await parseBody(c, TargetUpdateInput);
  const existing = await db
    .select()
    .from(targets)
    .where(and(eq(targets.id, id), eq(targets.userId, user.id)))
    .limit(1);
  if (existing.length === 0) throw new ApiError(404, "Target tidak ditemukan");

  let newFileId = existing[0].fileId;
  let routeStats = existing[0].routeStats;
  if (body.fileId && body.fileId !== existing[0].fileId) {
    const fileRows = await db
      .select()
      .from(files)
      .where(and(eq(files.id, body.fileId), eq(files.userId, user.id), eq(files.kind, "route")))
      .limit(1);
    if (fileRows.length === 0) throw new ApiError(400, "File rute tidak ditemukan, unggah GPX rute terlebih dahulu");
    newFileId = body.fileId;
    routeStats = null;
    await enqueue("parse_route_file", { userId: user.id, fileId: body.fileId });
  }

  const [row] = await db
    .update(targets)
    .set({
      name: body.name ?? existing[0].name,
      description: body.description ?? existing[0].description,
      type: body.type ?? existing[0].type,
      targetDate: body.targetDate ?? existing[0].targetDate,
      distanceM: body.distanceM ?? existing[0].distanceM,
      elevationM: body.elevationM ?? existing[0].elevationM,
      durationS: body.durationS ?? existing[0].durationS,
      status: body.status === undefined ? existing[0].status : body.status,
      fileId: newFileId,
      routeStats,
    })
    .where(eq(targets.id, id))
    .returning();
  await triggerRegen(user.id, id);
  return c.json({ ...row, createdAt: row.createdAt.toISOString() });
});

targetRoutes.delete("/:id", async (c) => {
  const user = getAuthUser(c);
  const result = await db
    .delete(targets)
    .where(and(eq(targets.id, c.req.param("id")), eq(targets.userId, user.id)))
    .returning({ id: targets.id });
  if (result.length === 0) throw new ApiError(404, "Target tidak ditemukan");
  return c.json({ ok: true });
});
