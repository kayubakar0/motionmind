import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { SessionStatusInput } from "shared";
import { db } from "../db";
import { planSessions, sports, trainingPlans } from "../db/schema";
import { ApiError, parseBody } from "../http/helpers";
import { getAuthUser, requireAuth, type AppEnv } from "../middleware/auth";
import { enqueue, hasPendingJob } from "../jobs/queue";

export const planRoutes = new Hono<AppEnv>();

planRoutes.use("*", requireAuth());

async function planWithSessions(planId: string, userId: string) {
  const rows = await db
    .select()
    .from(trainingPlans)
    .where(and(eq(trainingPlans.id, planId), eq(trainingPlans.userId, userId)))
    .limit(1);
  if (rows.length === 0) throw new ApiError(404, "Rencana tidak ditemukan");
  const plan = rows[0];
  const sessions = await db
    .select({ session: planSessions, sportName: sports.name, sportIcon: sports.icon, sportCategory: sports.category })
    .from(planSessions)
    .leftJoin(sports, eq(sports.id, planSessions.sportId))
    .where(eq(planSessions.planId, planId))
    .orderBy(planSessions.date);
  return {
    ...plan,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    sessions: sessions.map((s) => ({
      ...s.session,
      sportName: s.sportName ?? s.session.sportId,
      sportIcon: s.sportIcon ?? "activity",
      sportCategory: s.sportCategory ?? "other",
    })),
  };
}

planRoutes.get("/active", async (c) => {
  const user = getAuthUser(c);
  const rows = await db
    .select({ id: trainingPlans.id })
    .from(trainingPlans)
    .where(and(eq(trainingPlans.userId, user.id), eq(trainingPlans.status, "active")))
    .limit(1);
  if (rows.length === 0) return c.json(null);
  return c.json(await planWithSessions(rows[0].id, user.id));
});

planRoutes.get("/history", async (c) => {
  const user = getAuthUser(c);
  const rows = await db
    .select()
    .from(trainingPlans)
    .where(eq(trainingPlans.userId, user.id))
    .orderBy(trainingPlans.version);
  return c.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })));
});

planRoutes.get("/:id", async (c) => {
  const user = getAuthUser(c);
  return c.json(await planWithSessions(c.req.param("id"), user.id));
});

planRoutes.post("/regenerate", async (c) => {
  const user = getAuthUser(c);
  if (await hasPendingJob("regenerate_plan", user.id)) {
    return c.json({ queued: true, message: "Regenerasi sudah berjalan" });
  }
  const job = await enqueue("regenerate_plan", { userId: user.id, trigger: "manual" });
  return c.json({ queued: true, jobId: job.id });
});

planRoutes.patch("/sessions/:id", async (c) => {
  const user = getAuthUser(c);
  const id = c.req.param("id");
  const body = await parseBody(c, SessionStatusInput);
  const rows = await db
    .select()
    .from(planSessions)
    .where(and(eq(planSessions.id, id), eq(planSessions.userId, user.id)))
    .limit(1);
  if (rows.length === 0) throw new ApiError(404, "Sesi tidak ditemukan");

  const [updated] = await db
    .update(planSessions)
    .set({
      status: body.status,
      completedActivityId: body.activityId ?? null,
      completedAt: body.status === "completed" ? new Date() : null,
      reason:
        body.status === "missed" || body.status === "skipped" ? body.reason ?? null : null,
    })
    .where(eq(planSessions.id, id))
    .returning();

  if (body.status === "missed" || body.status === "skipped") {
    if (!(await hasPendingJob("regenerate_plan", user.id))) {
      await enqueue("regenerate_plan", { userId: user.id, trigger: "missed_workout" }, new Date(Date.now() + 3000));
    }
  }

  return c.json(updated);
});
