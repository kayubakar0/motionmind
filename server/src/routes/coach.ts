import { and, asc, count, desc, eq, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  AskCoachInput,
  CreateCoachSessionInput,
  FeedbackInput,
  RegeneratePlanInput,
  UpdateCoachSessionInput,
} from "shared";
import { db } from "../db";
import { coachMessages, coachSessions, recommendations, userFeedback } from "../db/schema";
import { ApiError, parseBody } from "../http/helpers";
import { getAuthUser, requireAuth, type AppEnv } from "../middleware/auth";
import { enqueue, hasPendingJob } from "../jobs/queue";
import { answerCoachQuestion } from "../ai/analyst";

export const coachRoutes = new Hono<AppEnv>();

coachRoutes.use("*", requireAuth());

const SESSION_TITLE_MAX = 60;

function sessionDto(r: {
  id: string;
  title: string;
  status: "active" | "archived";
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    messageCount: Number(r.messageCount),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

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
  const body = await parseBody(c, RegeneratePlanInput);
  if (await hasPendingJob("regenerate_plan", user.id)) {
    return c.json({ queued: true, message: "Regenerasi sudah berjalan" });
  }
  const job = await enqueue("regenerate_plan", {
    userId: user.id,
    trigger: "initial",
    targetId: body.targetId ?? undefined,
    sports: body.sports,
  });
  return c.json({ queued: true, jobId: job.id });
});

coachRoutes.get("/sessions", async (c) => {
  const user = getAuthUser(c);
  const status = c.req.query("status");
  const conditions = [eq(coachSessions.userId, user.id)];
  if (status === "active" || status === "archived") conditions.push(eq(coachSessions.status, status));

  const rows = await db
    .select({
      id: coachSessions.id,
      title: coachSessions.title,
      status: coachSessions.status,
      createdAt: coachSessions.createdAt,
      updatedAt: coachSessions.updatedAt,
      messageCount: sql<number>`count(${coachMessages.id})`,
    })
    .from(coachSessions)
    .leftJoin(coachMessages, eq(coachMessages.sessionId, coachSessions.id))
    .where(and(...conditions))
    .groupBy(coachSessions.id)
    .orderBy(desc(coachSessions.updatedAt))
    .limit(100);

  return c.json(rows.map(sessionDto));
});

coachRoutes.post("/sessions", async (c) => {
  const user = getAuthUser(c);
  const body = await parseBody(c, CreateCoachSessionInput);
  const [row] = await db
    .insert(coachSessions)
    .values({ userId: user.id, title: body.title ?? "Sesi Baru" })
    .returning();
  return c.json(
    sessionDto({ ...row, messageCount: 0 }),
    201
  );
});

coachRoutes.patch("/sessions/:id", async (c) => {
  const user = getAuthUser(c);
  const id = c.req.param("id");
  const body = await parseBody(c, UpdateCoachSessionInput);
  const [row] = await db
    .update(coachSessions)
    .set({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(coachSessions.id, id), eq(coachSessions.userId, user.id)))
    .returning();
  if (!row) throw new ApiError(404, "Sesi tidak ditemukan");
  const [{ value: messageCount }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(coachMessages)
    .where(eq(coachMessages.sessionId, id));
  return c.json(sessionDto({ ...row, messageCount: Number(messageCount) }));
});

coachRoutes.delete("/sessions/:id", async (c) => {
  const user = getAuthUser(c);
  const id = c.req.param("id");
  const result = await db
    .delete(coachSessions)
    .where(and(eq(coachSessions.id, id), eq(coachSessions.userId, user.id)))
    .returning({ id: coachSessions.id });
  if (result.length === 0) throw new ApiError(404, "Sesi tidak ditemukan");
  return c.json({ ok: true });
});

coachRoutes.get("/sessions/:id/messages", async (c) => {
  const user = getAuthUser(c);
  const id = c.req.param("id");
  const [session] = await db
    .select()
    .from(coachSessions)
    .where(and(eq(coachSessions.id, id), eq(coachSessions.userId, user.id)))
    .limit(1);
  if (!session) throw new ApiError(404, "Sesi tidak ditemukan");

  const rows = await db
    .select()
    .from(coachMessages)
    .where(and(eq(coachMessages.sessionId, id), eq(coachMessages.userId, user.id)))
    .orderBy(asc(coachMessages.createdAt))
    .limit(200);

  return c.json(
    rows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      role: r.role,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    }))
  );
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
      sessionId: r.sessionId,
      role: r.role,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

coachRoutes.post("/ask", async (c) => {
  const user = getAuthUser(c);
  const body = await parseBody(c, AskCoachInput);

  let session = null;
  if (body.sessionId) {
    const [row] = await db
      .select()
      .from(coachSessions)
      .where(and(eq(coachSessions.id, body.sessionId), eq(coachSessions.userId, user.id)))
      .limit(1);
    if (!row) throw new ApiError(404, "Sesi tidak ditemukan");
    if (row.status === "archived") throw new ApiError(400, "Sesi ini diarsipkan. Aktifkan kembali untuk melanjutkan chat.");
    session = row;
  } else {
    const [row] = await db
      .insert(coachSessions)
      .values({ userId: user.id, title: body.question.slice(0, SESSION_TITLE_MAX) })
      .returning();
    session = row;
  }

  if (session.title === "Sesi Baru") {
    await db
      .update(coachSessions)
      .set({ title: body.question.slice(0, SESSION_TITLE_MAX), updatedAt: new Date() })
      .where(eq(coachSessions.id, session.id));
  } else {
    await db.update(coachSessions).set({ updatedAt: new Date() }).where(eq(coachSessions.id, session.id));
  }

  await db.insert(coachMessages).values({ sessionId: session.id, userId: user.id, role: "user", content: body.question });
  try {
    const answer = await answerCoachQuestion(user.id, body.question, session.id);
    const [row] = await db
      .insert(coachMessages)
      .values({ sessionId: session.id, userId: user.id, role: "assistant", content: answer })
      .returning();
    await db.update(coachSessions).set({ updatedAt: new Date() }).where(eq(coachSessions.id, session.id));
    return c.json({
      answer,
      sessionId: session.id,
      createdAt: row.createdAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal mendapatkan jawaban AI";
    await db.insert(coachMessages).values({
      sessionId: session.id,
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

function recommendationDto(r: typeof recommendations.$inferSelect) {
  return {
    id: r.id,
    trigger: r.trigger,
    providerName: r.providerName,
    model: r.model,
    summary: r.summary,
    status: r.status,
    planId: r.planId,
    output: r.output,
    createdAt: r.createdAt.toISOString(),
  };
}

coachRoutes.get("/recommendations/active", async (c) => {
  const user = getAuthUser(c);
  const rows = await db
    .select()
    .from(recommendations)
    .where(and(eq(recommendations.userId, user.id), eq(recommendations.status, "active")))
    .orderBy(desc(recommendations.createdAt))
    .limit(20);
  return c.json(rows.map(recommendationDto));
});

coachRoutes.get("/recommendations/history", async (c) => {
  const user = getAuthUser(c);
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const pageSize = Math.min(50, Math.max(5, Number(c.req.query("pageSize") ?? "10")));
  const conditions = and(eq(recommendations.userId, user.id), ne(recommendations.status, "active"));

  const [{ value: total }] = await db.select({ value: count() }).from(recommendations).where(conditions);
  const rows = await db
    .select()
    .from(recommendations)
    .where(conditions)
    .orderBy(desc(recommendations.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return c.json({ items: rows.map(recommendationDto), total: Number(total), page, pageSize });
});

coachRoutes.get("/recommendations", async (c) => {
  const user = getAuthUser(c);
  const rows = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.userId, user.id))
    .orderBy(desc(recommendations.createdAt))
    .limit(50);
  return c.json(rows.map(recommendationDto));
});
