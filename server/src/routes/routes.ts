import { readFile } from "node:fs/promises";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { RouteInput, RouteUpdateInput, type SavedRouteDTO } from "shared";
import { db } from "../db";
import { files, savedRoutes, type SavedRoute } from "../db/schema";
import { ApiError, parseBody } from "../http/helpers";
import { getAuthUser, requireAuth, type AppEnv } from "../middleware/auth";
import { enqueue } from "../jobs/queue";
import { analyzeRoute } from "../services/routeAnalysis";

export const savedRouteRoutes = new Hono<AppEnv>();

savedRouteRoutes.use("*", requireAuth());

function toDTO(route: SavedRoute, filename: string | null): SavedRouteDTO {
  return {
    id: route.id,
    sportId: route.sportId,
    name: route.name,
    description: route.description,
    fileId: route.fileId,
    filename,
    routeStats: route.routeStats,
    distanceM: route.distanceM,
    elevationM: route.elevationM,
    createdAt: route.createdAt.toISOString(),
    updatedAt: route.updatedAt.toISOString(),
  };
}

async function getOwnedRoute(userId: string, id: string) {
  const rows = await db
    .select({ route: savedRoutes, file: files })
    .from(savedRoutes)
    .leftJoin(files, eq(files.id, savedRoutes.fileId))
    .where(and(eq(savedRoutes.id, id), eq(savedRoutes.userId, userId)))
    .limit(1);
  if (rows.length === 0) throw new ApiError(404, "Rute tidak ditemukan");
  return { route: rows[0].route, file: rows[0].file };
}

savedRouteRoutes.get("/", async (c) => {
  const user = getAuthUser(c);
  const rows = await db
    .select({ route: savedRoutes, filename: files.filename })
    .from(savedRoutes)
    .leftJoin(files, eq(files.id, savedRoutes.fileId))
    .where(eq(savedRoutes.userId, user.id))
    .orderBy(desc(savedRoutes.createdAt));
  return c.json(
    rows.map(({ route, filename }) =>
      toDTO(
        {
          ...route,
          routeStats: route.routeStats
            ? {
                distanceM: route.routeStats.distanceM,
                elevationM: route.routeStats.elevationM,
                maxElevationM: route.routeStats.maxElevationM,
                minElevationM: route.routeStats.minElevationM,
              }
            : null,
        },
        filename
      )
    )
  );
});

savedRouteRoutes.get("/:id", async (c) => {
  const user = getAuthUser(c);
  const { route, file } = await getOwnedRoute(user.id, c.req.param("id"));
  return c.json(toDTO(route, file?.filename ?? null));
});

savedRouteRoutes.get("/:id/analysis", async (c) => {
  const user = getAuthUser(c);
  const { route } = await getOwnedRoute(user.id, c.req.param("id"));
  return c.json(await analyzeRoute(route));
});

savedRouteRoutes.get("/:id/file", async (c) => {
  const user = getAuthUser(c);
  const { file } = await getOwnedRoute(user.id, c.req.param("id"));
  if (!file) throw new ApiError(404, "Rute ini tidak memiliki file sumber");
  let content: Buffer;
  try {
    content = await readFile(file.storagePath);
  } catch {
    throw new ApiError(404, "File sumber tidak ditemukan di penyimpanan");
  }
  const encoded = encodeURIComponent(file.filename);
  return c.body(new Uint8Array(content), 200, {
    "Content-Type": file.mimeType || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
  });
});

savedRouteRoutes.post("/", async (c) => {
  const user = getAuthUser(c);
  const body = await parseBody(c, RouteInput);
  let filename: string | null = null;
  if (body.fileId) {
    const fileRows = await db
      .select()
      .from(files)
      .where(and(eq(files.id, body.fileId), eq(files.userId, user.id), eq(files.kind, "route")))
      .limit(1);
    if (fileRows.length === 0) throw new ApiError(400, "File rute tidak ditemukan, unggah file GPX/TCX/FIT terlebih dahulu");
    filename = fileRows[0].filename;
    await enqueue("parse_route_file", { userId: user.id, fileId: body.fileId });
  }
  const [row] = await db
    .insert(savedRoutes)
    .values({
      userId: user.id,
      sportId: body.sportId,
      name: body.name,
      description: body.description ?? null,
      fileId: body.fileId ?? null,
    })
    .returning();
  return c.json(toDTO(row, filename), 201);
});

savedRouteRoutes.patch("/:id", async (c) => {
  const user = getAuthUser(c);
  const id = c.req.param("id");
  const body = await parseBody(c, RouteUpdateInput);
  const existing = await db
    .select()
    .from(savedRoutes)
    .where(and(eq(savedRoutes.id, id), eq(savedRoutes.userId, user.id)))
    .limit(1);
  if (existing.length === 0) throw new ApiError(404, "Rute tidak ditemukan");
  const prev = existing[0];

  let fileId = prev.fileId;
  let routeStats = prev.routeStats;
  let distanceM = prev.distanceM;
  let elevationM = prev.elevationM;
  if (body.fileId && body.fileId !== prev.fileId) {
    const fileRows = await db
      .select()
      .from(files)
      .where(and(eq(files.id, body.fileId), eq(files.userId, user.id), eq(files.kind, "route")))
      .limit(1);
    if (fileRows.length === 0) throw new ApiError(400, "File rute tidak ditemukan, unggah file GPX/TCX/FIT terlebih dahulu");
    fileId = body.fileId;
    routeStats = null;
    distanceM = null;
    elevationM = null;
    await enqueue("parse_route_file", { userId: user.id, fileId: body.fileId });
  }

  const [row] = await db
    .update(savedRoutes)
    .set({
      name: body.name ?? prev.name,
      description: body.description ?? prev.description,
      sportId: body.sportId ?? prev.sportId,
      fileId,
      routeStats,
      distanceM,
      elevationM,
      updatedAt: new Date(),
    })
    .where(eq(savedRoutes.id, id))
    .returning();
  return c.json(toDTO(row, null));
});

savedRouteRoutes.delete("/:id", async (c) => {
  const user = getAuthUser(c);
  const result = await db
    .delete(savedRoutes)
    .where(and(eq(savedRoutes.id, c.req.param("id")), eq(savedRoutes.userId, user.id)))
    .returning({ id: savedRoutes.id });
  if (result.length === 0) throw new ApiError(404, "Rute tidak ditemukan");
  return c.json({ ok: true });
});
