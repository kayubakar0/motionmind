import { Hono } from "hono";
import { getAuthUser, requireAuth, type AppEnv } from "../middleware/auth";
import { getDashboardStats } from "../services/fitness";

export const dashboardRoutes = new Hono<AppEnv>();

dashboardRoutes.use("*", requireAuth());

dashboardRoutes.get("/stats", async (c) => {
  const user = getAuthUser(c);
  return c.json(await getDashboardStats(user.id));
});
