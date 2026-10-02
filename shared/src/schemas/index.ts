import { z } from "zod";

export const RegisterInput = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_.]+$/, "Hanya huruf, angka, titik, underscore"),
  password: z.string().min(8, "Minimal 8 karakter"),
  email: z.string().email().optional().or(z.literal("")),
  name: z.string().max(64).optional(),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const ForgotInput = z.object({ username: z.string().min(1) });

export const ResetInput = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Minimal 8 karakter"),
});

export const OnboardingInput = z.object({
  sports: z.array(z.string()).min(1, "Pilih minimal satu olahraga"),
  primarySport: z.string().min(1),
  profile: z.object({
    ftp: z.number().int().min(50).max(600).nullable().optional(),
    weightKg: z.number().min(25).max(250).nullable().optional(),
    restingHr: z.number().int().min(30).max(120).nullable().optional(),
    maxHr: z.number().int().min(120).max(230).nullable().optional(),
    weeklyHoursTarget: z.number().min(1).max(40).nullable().optional(),
    experienceLevel: z.enum(["beginner", "intermediate", "advanced"]).nullable().optional(),
  }),
});
export type OnboardingInput = z.infer<typeof OnboardingInput>;

export const ManualActivityInput = z.object({
  sportId: z.string().min(1),
  name: z.string().min(1).max(120),
  startDate: z.string().min(1),
  durationS: z.number().int().min(60).max(86400 * 2),
  distanceM: z.number().min(0).nullable().optional(),
  elevationGainM: z.number().min(0).nullable().optional(),
  avgHr: z.number().min(60).max(230).nullable().optional(),
  avgPower: z.number().min(20).max(2000).nullable().optional(),
  sets: z.number().int().min(0).max(200).nullable().optional(),
  reps: z.number().int().min(0).max(2000).nullable().optional(),
  weightKg: z.number().min(0).max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  completedSessionId: z.string().uuid().nullable().optional(),
});
export type ManualActivityInput = z.infer<typeof ManualActivityInput>;

export const TargetInput = z.object({
  sportId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  type: z.enum(["event", "route", "fitness"]),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  distanceM: z.number().min(0).nullable().optional(),
  elevationM: z.number().min(0).nullable().optional(),
  durationS: z.number().min(0).nullable().optional(),
  fileId: z.string().uuid().nullable().optional(),
});
export type TargetInput = z.infer<typeof TargetInput>;

export const TargetUpdateInput = TargetInput.partial().extend({
  status: z.enum(["active", "achieved", "archived"]).optional(),
});
export type TargetUpdateInput = z.infer<typeof TargetUpdateInput>;

export const SessionStatusInput = z.object({
  status: z.enum(["planned", "completed", "missed", "skipped"]),
  activityId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().max(500, "Alasan maksimal 500 karakter").nullable().optional(),
});

export const FeedbackInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fatigueLevel: z.number().int().min(1).max(5),
  sleepQuality: z.number().int().min(1).max(5).nullable().optional(),
  soreness: z.number().int().min(1).max(5).nullable().optional(),
  availabilityHours: z.number().min(0).max(16).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});
export type FeedbackInput = z.infer<typeof FeedbackInput>;

export const AskCoachInput = z.object({
  question: z.string().trim().min(3, "Pertanyaan terlalu pendek").max(600, "Pertanyaan maksimal 600 karakter"),
});
export type AskCoachInput = z.infer<typeof AskCoachInput>;

export const AiProviderInput = z.object({
  name: z.string().min(1).max(60),
  kind: z.enum(["openrouter", "custom_openai"]),
  baseUrl: z.string().url(),
  apiKey: z.string().max(300).optional(),
  model: z.string().min(1).max(120),
  params: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().min(256).max(32000).optional(),
    })
    .optional(),
  isActive: z.boolean().optional(),
});
export type AiProviderInput = z.infer<typeof AiProviderInput>;

export const PlanOutputSchema = z.object({
  name: z.string().min(1),
  goal_summary: z.string().min(1),
  weekly_hours: z.number().min(0.5).max(40).optional(),
  weeks: z
    .array(
      z.object({
        week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        focus: z.string().min(1),
        notes: z.string().optional(),
        sessions: z.array(
          z.object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            sport: z.string().min(1),
            workout_type: z.enum([
              "endurance",
              "tempo",
              "intervals",
              "recovery",
              "long",
              "strength",
              "flexibility",
              "test",
              "race",
              "rest",
            ]),
            title: z.string().min(1),
            description: z.string().min(1),
            duration_min: z.number().min(5).max(600).optional(),
            distance_km: z.number().min(0).max(500).optional(),
            intensity: z.string().optional(),
            tss: z.number().min(0).max(1000).optional(),
          })
        ),
      })
    )
    .min(1),
  rationale: z.string().min(1),
  warnings: z.array(z.string()).default([]),
});
export type PlanOutput = z.infer<typeof PlanOutputSchema>;
