import { mkdir, writeFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { activities, files } from "../db/schema";
import { ApiError } from "../http/helpers";
import { getAuthUser, requireAuth, type AppEnv } from "../middleware/auth";
import { enqueue } from "../jobs/queue";
import { env } from "../lib/env";

const ALLOWED_EXT = new Set(["gpx", "tcx", "fit"]);
const MAX_SIZE = 30 * 1024 * 1024; // 30MB

export const uploadRoutes = new Hono<AppEnv>();

uploadRoutes.use("*", requireAuth());

uploadRoutes.post("/", async (c) => {
  const user = getAuthUser(c);
  const form = await c.req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "activity");
  const sportId = form.get("sportId") ? String(form.get("sportId")) : undefined;

  if (!(file instanceof File)) throw new ApiError(400, "File tidak ditemukan pada form-data");
  if (kind !== "activity" && kind !== "route") throw new ApiError(400, "kind harus 'activity' atau 'route'");
  if (file.size > MAX_SIZE) throw new ApiError(400, "Ukuran file maksimal 30MB");

  const ext = (file.name.toLowerCase().split(".").pop() ?? "").replace(/[^a-z0-9]/g, "");
  if (!ALLOWED_EXT.has(ext)) throw new ApiError(400, "Format harus GPX, TCX, atau FIT");

  await mkdir(env.UPLOAD_DIR, { recursive: true });
  const storageName = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${env.UPLOAD_DIR}/${storageName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(storagePath, buffer);

  const [row] = await db
    .insert(files)
    .values({
      userId: user.id,
      kind,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      storagePath,
    })
    .returning();

  if (kind === "activity") {
    await enqueue("parse_activity_file", { userId: user.id, fileId: row.id, sportId });
  } else {
    await enqueue("parse_route_file", { userId: user.id, fileId: row.id });
  }

  return c.json({ id: row.id, kind, status: "queued" }, 201);
});

uploadRoutes.get("/:id", async (c) => {
  const user = getAuthUser(c);
  const id = c.req.param("id");
  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.id, id), eq(files.userId, user.id)))
    .limit(1);
  if (rows.length === 0) throw new ApiError(404, "File tidak ditemukan");
  const file = rows[0];

  let linkedActivityId: string | null = null;
  if (file.kind === "activity") {
    const linked = await db
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.userId, user.id), eq(activities.externalId, `upload:${id}`)))
      .limit(1);
    linkedActivityId = linked[0]?.id ?? null;
  }

  return c.json({
    id: file.id,
    kind: file.kind,
    filename: file.filename,
    createdAt: file.createdAt.toISOString(),
    linkedActivityId,
  });
});
