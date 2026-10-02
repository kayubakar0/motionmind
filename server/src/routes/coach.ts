import { asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { AskCoachInput, FeedbackInput } from "shared";
import { db } from "../db";
import { coachMessages, recommendations, userFeedback } from "../db/schema";
import { parseBody } from "../http/helpers";
import { getAuthUser, requireAuth, type AppEnv } from "../middleware/auth";
import { enqueue, hasPendingJob } from "../jobs/queue";
import { answerCoachQuestion } from "../ai/analyst";

export const coachRoutes = new Hono<AppEnv>();

coachRoutes.use("*", requireAuth());

coachRoutes.post("/feedback", async (c) => {
  const user = getAuthUser(c);
  const body = await parseBody(c, FeedbackInput);
  await db.insert(userFeedback).values({
    userId: user.id,
    date: body.date,
    fatigueLevel: body.fatigueLevel,
    sleepQuality: body.sleepQuality ?? null,
    soreness: body.soreness ?? null,
    availabilityHours: body.availabilityHours ?? null,
    notes: body.notes ?? null,
  });
  const queued = !(await hasPendingJob("regenerate_plan", user.id));
  if (queued) {
    await enqueue("regenerate_plan", { userId: user.id, trigger: "condition_change" }, new Date(Date.now() + 3000));
  }
  return c.json({ ok: true, replanQueued: queued });
});

coachRoutes.post("/generate", async (c) => {
  const user = getAuthUser(c);
  let targetId: string | undefined;
  try {
    const body = (await c.req.json()) as { targetId?: string };
    targetId = body?.targetId;
  } catch {
    targetId = undefined;
  }
  if (await hasPendingJob("regenerate_plan", user.id)) {
    return c.json({ queued: true, message: "Regenerasi sudah berjalan" });
  }
  const job = await enqueue("regenerate_plan", { userId: user.id, trigger: "initial", targetId });
  return c.json({ queued: true, jobId: job.id });
});

coachRoutes.get("/messages", async (c) => {
  const user = getAuthUser(c);
  const rows = await db
    .select()
    .from(coachMessages)
    .where(eq(coachMessages.userId, user.id))
    .orderBy(desc(coachMessages.createdAt))
    .limit(60);
  return c.json(
    rows.reverse().map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

coachRoutes.post("/ask", async (c) => {
  const user = getAuthUser(c);
  const body = await parseBody(c, AskCoachInput);
  await db.insert(coachMessages).values({ userId: user.id, role: "user", content: body.question });
  try {
    const answer = await answerCoachQuestion(user.id, body.question);
    const [row] = await db
      .insert(coachMessages)
      .values({ userId: user.id, role: "assistant", content: answer })
      .returning();
    return c.json({
      answer,
      createdAt: row.createdAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal mendapatkan jawaban AI";
    await db.insert(coachMessages).values({
      userId: user.id,
      role: "assistant",
      content: `⚠ ${message}`,
    });
    throw err;
  }
});

coachRoutes.get("/status", async (c) => {
  const user = getAuthUser(c);
  const pending = await hasPendingJob("regenerate_plan", user.id);
  return c.json({ pending });
});

coachRoutes.get("/recommendations", async (c) => {
  const user = getAuthUser(c);
  const rows = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.userId, user.id))
    .orderBy(desc(recommendations.createdAt))
    .limit(50);
  return c.json(
    rows.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      providerName: r.providerName,
      model: r.model,
      summary: r.summary,
      status: r.status,
      planId: r.planId,
      output: r.output,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});
