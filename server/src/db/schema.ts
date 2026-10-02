import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type UserRole = "admin" | "user";
export type ActivitySource = "strava" | "upload" | "manual";
export type MetricProfile = "power" | "pace" | "hr" | "volume" | "duration";
export type TssMethod = "power" | "hr" | "pace" | "volume" | "duration";
export type SportCategory = "cycling" | "running" | "swimming" | "strength" | "flexibility" | "other";
export type SessionStatus = "planned" | "completed" | "missed" | "skipped";
export type JobStatus = "queued" | "running" | "done" | "failed";
export type ZoneDistribution = { zone: number; seconds: number };

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    email: text("email"),
    name: text("name"),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<UserRole>().notNull().default("user"),
    onboardingDone: boolean("onboarding_done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_username_uq").on(t.username), uniqueIndex("users_email_uq").on(t.email)]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)]
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("prt_token_uq").on(t.tokenHash)]
);

export const sports = pgTable("sports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").$type<SportCategory>().notNull(),
  metricProfile: text("metric_profile").$type<MetricProfile>().notNull(),
  defaultTssMethod: text("default_tss_method").$type<TssMethod>().notNull(),
  icon: text("icon").notNull().default("activity"),
  stravaType: text("strava_type"),
});

export const userSports = pgTable(
  "user_sports",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sportId: text("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.sportId] })]
);

export const athleteProfiles = pgTable("athlete_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  ftp: integer("ftp"),
  weightKg: doublePrecision("weight_kg"),
  restingHr: integer("resting_hr"),
  maxHr: integer("max_hr"),
  weeklyHoursTarget: doublePrecision("weekly_hours_target"),
  experienceLevel: text("experience_level"),
  zones: jsonb("zones").$type<Record<string, number[]>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ftpHistory = pgTable(
  "ftp_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    ftp: integer("ftp").notNull(),
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ftp_history_user_idx").on(t.userId, t.date)]
);

export const stravaConnections = pgTable("strava_connections", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  athleteId: text("athlete_id").notNull(),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scope: text("scope").notNull().default(""),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"activity" | "route">().notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull().default(""),
    sizeBytes: integer("size_bytes").notNull().default(0),
    storagePath: text("storage_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("files_user_idx").on(t.userId)]
);

export type RouteProfile = { d: number[]; e: number[] };

export type RouteStats = {
  distanceM: number;
  elevationM: number;
  maxElevationM?: number;
  minElevationM?: number;
  points?: [number, number][];
  profile?: RouteProfile;
};

export const targets = pgTable(
  "targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sportId: text("sport_id")
      .notNull()
      .references(() => sports.id),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").$type<"event" | "route" | "fitness">().notNull(),
    targetDate: text("target_date"),
    distanceM: doublePrecision("distance_m"),
    elevationM: doublePrecision("elevation_m"),
    durationS: integer("duration_s"),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    routeStats: jsonb("route_stats").$type<RouteStats>(),
    status: text("status").$type<"active" | "achieved" | "archived">().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("targets_user_idx").on(t.userId, t.status)]
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").$type<ActivitySource>().notNull(),
    externalId: text("external_id"),
    sportId: text("sport_id")
      .notNull()
      .references(() => sports.id),
    name: text("name").notNull().default("Aktivitas"),
    description: text("description"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    timezone: text("timezone"),
    distanceM: doublePrecision("distance_m"),
    movingTimeS: integer("moving_time_s"),
    elapsedTimeS: integer("elapsed_time_s"),
    totalElevationGainM: doublePrecision("total_elevation_gain_m"),
    avgSpeed: doublePrecision("avg_speed"),
    maxSpeed: doublePrecision("max_speed"),
    avgHr: doublePrecision("avg_hr"),
    maxHr: doublePrecision("max_hr"),
    avgCadence: doublePrecision("avg_cadence"),
    avgPower: doublePrecision("avg_power"),
    maxPower: doublePrecision("max_power"),
    calories: integer("calories"),
    deviceName: text("device_name"),
    trainer: boolean("trainer").notNull().default(false),
    sets: integer("sets"),
    reps: integer("reps"),
    weightUsedKg: doublePrecision("weight_used_kg"),
    pushedToStrava: boolean("pushed_to_strava").notNull().default(false),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("activities_external_uq").on(t.userId, t.source, t.externalId),
    index("activities_user_date_idx").on(t.userId, t.startDate),
    index("activities_sport_idx").on(t.userId, t.sportId),
  ]
);

export type ParsedStreams = {
  time: number[];
  latlng?: [number, number][] | null;
  altitude?: number[] | null;
  heartrate?: number[] | null;
  cadence?: number[] | null;
  watts?: number[] | null;
  velocity?: number[] | null;
  distance?: number[] | null;
};

export const activityStreams = pgTable(
  "activity_streams",
  {
    activityId: uuid("activity_id")
      .primaryKey()
      .references(() => activities.id, { onDelete: "cascade" }),
    time: jsonb("time").$type<number[]>().notNull(),
    latlng: jsonb("latlng").$type<[number, number][] | null>(),
    altitude: jsonb("altitude").$type<number[] | null>(),
    heartrate: jsonb("heartrate").$type<number[] | null>(),
    cadence: jsonb("cadence").$type<number[] | null>(),
    watts: jsonb("watts").$type<number[] | null>(),
    velocity: jsonb("velocity").$type<number[] | null>(),
    distance: jsonb("distance").$type<number[] | null>(),
  },
  (t) => [index("activity_streams_act_idx").on(t.activityId)]
);

export const activityMetrics = pgTable(
  "activity_metrics",
  {
    activityId: uuid("activity_id")
      .primaryKey()
      .references(() => activities.id, { onDelete: "cascade" }),
    normalizedPower: doublePrecision("normalized_power"),
    intensityFactor: doublePrecision("intensity_factor"),
    tss: doublePrecision("tss"),
    hrTss: doublePrecision("hr_tss"),
    tssMethod: text("tss_method"),
    avgPaceSecPerKm: doublePrecision("avg_pace_sec_per_km"),
    timeInPowerZones: jsonb("time_in_power_zones").$type<ZoneDistribution[] | null>(),
    timeInHrZones: jsonb("time_in_hr_zones").$type<ZoneDistribution[] | null>(),
    powerCurve: jsonb("power_curve").$type<Record<string, number> | null>(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_metrics_act_idx").on(t.activityId)]
);

export const trainingPlans = pgTable(
  "training_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetId: uuid("target_id").references(() => targets.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    goalSummary: text("goal_summary").notNull().default(""),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    weeklyHours: doublePrecision("weekly_hours"),
    version: integer("version").notNull().default(1),
    status: text("status").$type<"active" | "archived">().notNull().default("active"),
    rationale: text("rationale"),
    warnings: jsonb("warnings").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    providerName: text("provider_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("training_plans_user_idx").on(t.userId, t.status)]
);

export const planSessions = pgTable(
  "plan_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => trainingPlans.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sportId: text("sport_id")
      .notNull()
      .references(() => sports.id),
    date: text("date").notNull(),
    workoutType: text("workout_type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    durationPlannedS: integer("duration_planned_s"),
    distancePlannedM: doublePrecision("distance_planned_m"),
    intensityTargets: jsonb("intensity_targets").$type<string[]>(),
    tssPlanned: doublePrecision("tss_planned"),
    status: text("status").$type<SessionStatus>().notNull().default("planned"),
    reason: text("reason"),
    completedActivityId: uuid("completed_activity_id").references(() => activities.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("plan_sessions_plan_idx").on(t.planId, t.date),
    index("plan_sessions_user_date_idx").on(t.userId, t.date),
  ]
);

export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => trainingPlans.id, { onDelete: "set null" }),
    trigger: text("trigger").notNull(),
    providerName: text("provider_name"),
    model: text("model"),
    inputSnapshot: jsonb("input_snapshot"),
    output: jsonb("output"),
    summary: text("summary"),
    status: text("status").$type<"active" | "superseded" | "expired">().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recommendations_user_idx").on(t.userId, t.createdAt)]
);

export const coachMessages = pgTable(
  "coach_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("coach_messages_user_idx").on(t.userId, t.createdAt)]
);

export type CoachMessage = typeof coachMessages.$inferSelect;

export const aiProviders = pgTable(
  "ai_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: text("kind").$type<"openrouter" | "custom_openai">().notNull(),
    baseUrl: text("base_url").notNull(),
    apiKeyEnc: text("api_key_enc").notNull(),
    model: text("model").notNull(),
    params: jsonb("params").$type<{ temperature?: number; maxTokens?: number }>().notNull().default(sql`'{}'::jsonb`),
    isActive: boolean("is_active").notNull().default(false),
    lastStatus: text("last_status"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ai_providers_name_uq").on(t.name)]
);

export const aiLogs = pgTable(
  "ai_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    providerId: uuid("provider_id").references(() => aiProviders.id, { onDelete: "set null" }),
    purpose: text("purpose").notNull(),
    ok: boolean("ok").notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_logs_created_idx").on(t.createdAt)]
);

export const userFeedback = pgTable(
  "user_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    fatigueLevel: integer("fatigue_level").notNull(),
    sleepQuality: integer("sleep_quality"),
    soreness: integer("soreness"),
    availabilityHours: doublePrecision("availability_hours"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("user_feedback_user_idx").on(t.userId, t.date)]
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_status_idx").on(t.status, t.runAt)]
);

export type User = typeof users.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type Sport = typeof sports.$inferSelect;
export type Target = typeof targets.$inferSelect;
export type TrainingPlan = typeof trainingPlans.$inferSelect;
export type PlanSession = typeof planSessions.$inferSelect;
export type AiProvider = typeof aiProviders.$inferSelect;
export type Job = typeof jobs.$inferSelect;
