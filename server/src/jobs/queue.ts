import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { jobs, type Job } from "../db/schema";

export type JobType =
  | "sync_strava_activities"
  | "fetch_strava_stream"
  | "strava_push_activity"
  | "parse_activity_file"
  | "parse_route_file"
  | "compute_activity_metrics"
  | "regenerate_plan"
  | "check_missed_sessions"
  | "recompute_all";

export type JobHandler = (
  payload: Record<string, unknown>,
  ctx: { attempts: number; maxAttempts: number }
) => Promise<void>;

const handlers = new Map<JobType, JobHandler>();

export function registerHandler(type: JobType, handler: JobHandler) {
  handlers.set(type, handler);
}

export async function enqueue(type: JobType, payload: Record<string, unknown> = {}, runAt?: Date) {
  const [job] = await db
    .insert(jobs)
    .values({ type, payload, runAt: runAt ?? new Date() })
    .returning();
  return job;
}

export async function hasPendingJob(type: JobType, userId?: string): Promise<boolean> {
  const rows = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.type, type), inArray(jobs.status, ["queued", "running"])))
    .limit(50);
  if (rows.length === 0) return false;
  if (!userId) return true;
  return rows.some((r) => (r.payload as { userId?: string } | null)?.userId === userId);
}

async function claimJob(): Promise<Job | null> {
  const result = await db.execute(sql`
    UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = now()
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'queued' AND run_at <= now()
      ORDER BY run_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  const rows = (result as unknown as Array<Record<string, unknown>>) ?? [];
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id as string,
    type: r.type as string,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    status: r.status as Job["status"],
    attempts: r.attempts as number,
    maxAttempts: r.max_attempts as number,
    runAt: new Date((r.run_at as string) ?? Date.now()),
    error: (r.error as string) ?? null,
    createdAt: new Date((r.created_at as string) ?? Date.now()),
    updatedAt: new Date((r.updated_at as string) ?? Date.now()),
  };
}

let processing = false;

async function processNext(): Promise<boolean> {
  const job = await claimJob();
  if (!job) return false;
  const handler = handlers.get(job.type as JobType);
  try {
    if (!handler) throw new Error(`Tidak ada handler untuk job ${job.type}`);
    await handler(job.payload, { attempts: job.attempts, maxAttempts: job.maxAttempts });
    await db.update(jobs).set({ status: "done", updatedAt: new Date() }).where(eq(jobs.id, job.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[job:${job.type}] gagal (attempt ${job.attempts}):`, message);
    if (job.attempts < job.maxAttempts) {
      const backoffMs = Math.min(30_000 * 2 ** job.attempts, 10 * 60_000);
      await db
        .update(jobs)
        .set({ status: "queued", error: message, runAt: new Date(Date.now() + backoffMs), updatedAt: new Date() })
        .where(eq(jobs.id, job.id));
    } else {
      await db
        .update(jobs)
        .set({ status: "failed", error: message, updatedAt: new Date() })
        .where(eq(jobs.id, job.id));
    }
  }
  return true;
}

export function startWorker() {
  const loop = async () => {
    if (processing) return;
    processing = true;
    try {
      while (true) {
        const didWork = await processNext();
        if (!didWork) break;
      }
    } catch (err) {
      console.error("[worker] loop error:", err);
    } finally {
      processing = false;
    }
  };
  setInterval(loop, 2000);
  console.log("[worker] job queue aktif");
}
