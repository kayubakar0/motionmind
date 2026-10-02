import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { AiProviderInput } from "shared";
import { z } from "zod";
import { db } from "../db";
import { aiProviders, jobs, users } from "../db/schema";
import { ApiError, parseBody } from "../http/helpers";
import { getAuthUser, requireAdmin, type AppEnv } from "../middleware/auth";
import { encrypt } from "../lib/encrypt";
import { testProvider } from "../ai/provider";
import { enqueue } from "../jobs/queue";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("*", requireAdmin());

adminRoutes.get("/users", async (c) => {
  const rows = await db
    .select({ id: users.id, username: users.username, email: users.email, role: users.role, onboardingDone: users.onboardingDone, createdAt: users.createdAt })
    .from(users)
    .orderBy(users.createdAt);
  return c.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

adminRoutes.patch("/users/:id", async (c) => {
  const body = await parseBody(c, z.object({ role: z.enum(["admin", "user"]) }));
  const user = getAuthUser(c);
  if (c.req.param("id") === user.id) throw new ApiError(400, "Tidak dapat mengubah role sendiri");
  const [row] = await db
    .update(users)
    .set({ role: body.role })
    .where(eq(users.id, c.req.param("id")))
    .returning({ id: users.id, role: users.role });
  if (!row) throw new ApiError(404, "User tidak ditemukan");
  return c.json(row);
});

adminRoutes.get("/ai-providers", async (c) => {
  const rows = await db.select().from(aiProviders).orderBy(desc(aiProviders.createdAt));
  return c.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      baseUrl: r.baseUrl,
      model: r.model,
      params: r.params,
      isActive: r.isActive,
      lastStatus: r.lastStatus,
      lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
      hasApiKey: true,
    }))
  );
});

adminRoutes.post("/ai-providers", async (c) => {
  const user = getAuthUser(c);
  const body = await parseBody(c, AiProviderInput);
  if (!body.apiKey) throw new ApiError(400, "API key wajib diisi untuk provider baru");
  const [row] = await db
    .insert(aiProviders)
    .values({
      name: body.name,
      kind: body.kind,
      baseUrl: body.baseUrl,
      apiKeyEnc: encrypt(body.apiKey),
      model: body.model,
      params: body.params ?? {},
      isActive: body.isActive ?? false,
      createdBy: user.id,
    })
    .returning();
  if (row.isActive) await deactivateOthers(row.id);
  return c.json({ id: row.id });
});

adminRoutes.patch("/ai-providers/:id", async (c) => {
  const id = c.req.param("id");
  const body = await parseBody(c, AiProviderInput.partial());
  const rows = await db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1);
  if (rows.length === 0) throw new ApiError(404, "Provider tidak ditemukan");
  const existing = rows[0];
  const [row] = await db
    .update(aiProviders)
    .set({
      name: body.name ?? existing.name,
      kind: body.kind ?? existing.kind,
      baseUrl: body.baseUrl ?? existing.baseUrl,
      model: body.model ?? existing.model,
      params: body.params ?? existing.params,
      apiKeyEnc: body.apiKey ? encrypt(body.apiKey) : existing.apiKeyEnc,
      isActive: body.isActive ?? existing.isActive,
    })
    .where(eq(aiProviders.id, id))
    .returning();
  if (row.isActive) await deactivateOthers(row.id);
  return c.json({ ok: true });
});

adminRoutes.delete("/ai-providers/:id", async (c) => {
  const result = await db.delete(aiProviders).where(eq(aiProviders.id, c.req.param("id"))).returning({ id: aiProviders.id });
  if (result.length === 0) throw new ApiError(404, "Provider tidak ditemukan");
  return c.json({ ok: true });
});

adminRoutes.post("/ai-providers/:id/test", async (c) => {
  const rows = await db.select().from(aiProviders).where(eq(aiProviders.id, c.req.param("id"))).limit(1);
  if (rows.length === 0) throw new ApiError(404, "Provider tidak ditemukan");
  const result = await testProvider(rows[0]);
  return c.json(result);
});

adminRoutes.get("/jobs", async (c) => {
  const rows = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(50);
  return c.json(
    rows.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      attempts: r.attempts,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

adminRoutes.post("/recompute-all", async (c) => {
  const user = getAuthUser(c);
  const job = await enqueue("recompute_all", { requestedBy: user.id });
  return c.json({ queued: true, jobId: job.id });
});

async function deactivateOthers(keepId: string) {
  const rows = await db.select({ id: aiProviders.id }).from(aiProviders).where(eq(aiProviders.isActive, true));
  for (const r of rows) {
    if (r.id !== keepId) {
      await db.update(aiProviders).set({ isActive: false }).where(eq(aiProviders.id, r.id));
    }
  }
}
