import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { db } from "./db";
import { jobs } from "./db/schema";
import { env } from "./lib/env";
import { handleError } from "./http/helpers";
import { authRoutes } from "./routes/auth";
import { onboardingRoutes } from "./routes/onboarding";
import { activityRoutes } from "./routes/activities";
import { uploadRoutes } from "./routes/uploads";
import { stravaRoutes } from "./routes/strava";
import { targetRoutes } from "./routes/targets";
import { planRoutes } from "./routes/plans";
import { coachRoutes } from "./routes/coach";
import { dashboardRoutes } from "./routes/dashboard";
import { adminRoutes } from "./routes/admin";
import { startWorker } from "./jobs/queue";
import "./jobs/handlers";
import { startScheduler } from "./scheduler";

const app = new Hono();

function resolveOrigin(origin: string): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (env.IS_DEV && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      return origin;
    }
  } catch {
    return null;
  }
  return origin === env.CLIENT_URL ? origin : null;
}

app.use(
  "*",
  cors({
    origin: resolveOrigin,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.get("/", (c) => c.json({ name: "MotionMind API", ok: true }));
app.onError(handleError);

const api = new Hono();
api.route("/auth", authRoutes);
api.route("/onboarding", onboardingRoutes);
api.route("/activities", activityRoutes);
api.route("/uploads", uploadRoutes);
api.route("/strava", stravaRoutes);
api.route("/targets", targetRoutes);
api.route("/plans", planRoutes);
api.route("/coach", coachRoutes);
api.route("/dashboard", dashboardRoutes);
api.route("/admin", adminRoutes);
app.route("/api/v1", api);

async function recoverStuckJobs() {
  await db.update(jobs).set({ status: "queued" }).where(eq(jobs.status, "running"));
}

async function bootstrap() {
  await recoverStuckJobs();
  startWorker();
  startScheduler();
}

try {
  Bun.serve({
    port: env.PORT,
    fetch: app.fetch,
  });
} catch (err) {
  const msg = String(err);
  if (msg.includes("in use") || msg.includes("EADDRINUSE")) {
    console.error(
      `[boot] Port ${env.PORT} sedang dipakai proses lain.\n` +
        `       Cari dan matikan: netstat -ano | grep ${env.PORT} lalu taskkill //F //PID <pid>\n` +
        `       Jangan mengganti PORT — client & Strava callback sudah terikat pada konfigurasi ini.`
    );
    process.exit(1);
  }
  throw err;
}

console.log(`MotionMind server berjalan di http://localhost:${env.PORT}`);
bootstrap().catch((e) => {
  console.error("Bootstrap gagal:", e);
  process.exit(1);
});
