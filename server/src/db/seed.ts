import { sql } from "drizzle-orm";
import { db, pool } from "./index";
import { sports, users } from "./schema";
import { env } from "../lib/env";

const SPORTS = [
  { id: "ride", name: "Bersepeda (Road)", category: "cycling" as const, metricProfile: "power" as const, defaultTssMethod: "power" as const, icon: "bike", stravaType: "Ride" },
  { id: "virtual_ride", name: "Bersepeda (Indoor/Virtual)", category: "cycling" as const, metricProfile: "power" as const, defaultTssMethod: "power" as const, icon: "bike", stravaType: "VirtualRide" },
  { id: "gravel_ride", name: "Bersepeda (Gravel)", category: "cycling" as const, metricProfile: "power" as const, defaultTssMethod: "power" as const, icon: "bike", stravaType: "GravelRide" },
  { id: "mountain_bike", name: "Bersepeda (MTB)", category: "cycling" as const, metricProfile: "power" as const, defaultTssMethod: "power" as const, icon: "bike", stravaType: "MountainBikeRide" },
  { id: "run", name: "Lari", category: "running" as const, metricProfile: "pace" as const, defaultTssMethod: "hr" as const, icon: "footprints", stravaType: "Run" },
  { id: "trail_run", name: "Trail Run", category: "running" as const, metricProfile: "pace" as const, defaultTssMethod: "hr" as const, icon: "mountain", stravaType: "TrailRun" },
  { id: "swim", name: "Renang", category: "swimming" as const, metricProfile: "pace" as const, defaultTssMethod: "hr" as const, icon: "waves", stravaType: "Swim" },
  { id: "strength", name: "Angkat Beban / Strength", category: "strength" as const, metricProfile: "volume" as const, defaultTssMethod: "volume" as const, icon: "dumbbell", stravaType: "WeightTraining" },
  { id: "yoga", name: "Yoga", category: "flexibility" as const, metricProfile: "duration" as const, defaultTssMethod: "duration" as const, icon: "flower-2", stravaType: "Yoga" },
  { id: "stretching", name: "Stretching", category: "flexibility" as const, metricProfile: "duration" as const, defaultTssMethod: "duration" as const, icon: "move-horizontal", stravaType: null },
  { id: "hike", name: "Hiking", category: "other" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "mountain", stravaType: "Hike" },
  { id: "walk", name: "Jalan", category: "other" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "person-standing", stravaType: "Walk" },
  { id: "row", name: "Rowing", category: "other" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "waves", stravaType: "Row" },
  { id: "core", name: "Core / Bodyweight", category: "strength" as const, metricProfile: "volume" as const, defaultTssMethod: "volume" as const, icon: "grip", stravaType: null },
  { id: "workout", name: "Workout Umum", category: "other" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "activity", stravaType: "Workout" },
  { id: "hiit", name: "HIIT / Crossfit", category: "strength" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "heart-pulse", stravaType: "HIIT" },
  { id: "elliptical", name: "Elliptical", category: "other" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "gauge", stravaType: "Elliptical" },
  { id: "stairs", name: "Stairs / Stepper", category: "other" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "chevrons-up", stravaType: "StairsStepper" },
  { id: "skating", name: "Skating (Inline/Es)", category: "other" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "circle-dashed", stravaType: "InlineSkate" },
  { id: "alpine_ski", name: "Ski Alpine", category: "other" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "snowflake", stravaType: "AlpineSki" },
  { id: "snowboard", name: "Snowboard", category: "other" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "snowflake", stravaType: "Snowboard" },
  { id: "nordic_ski", name: "Ski Nordik", category: "other" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "snowflake", stravaType: "NordicSki" },
  { id: "kayak", name: "Kayak / Canoe", category: "other" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "sailboat", stravaType: "Kayaking" },
  { id: "sup", name: "Stand Up Paddle", category: "other" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "sailboat", stravaType: "StandUpPaddling" },
  { id: "surf", name: "Surf / Kite / Windsurf", category: "other" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "waves", stravaType: "Surfing" },
  { id: "climbing", name: "Panjat Tebing", category: "strength" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "mountain", stravaType: "RockClimbing" },
  { id: "golf", name: "Golf", category: "other" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "flag", stravaType: "Golf" },
  { id: "soccer", name: "Sepak Bola", category: "other" as const, metricProfile: "hr" as const, defaultTssMethod: "hr" as const, icon: "trophy", stravaType: "Soccer" },
];

async function main() {
  console.log("Seeding sports registry...");
  for (const s of SPORTS) {
    await db
      .insert(sports)
      .values(s)
      .onConflictDoUpdate({
        target: sports.id,
        set: {
          name: s.name,
          category: s.category,
          metricProfile: s.metricProfile,
          defaultTssMethod: s.defaultTssMethod,
          icon: s.icon,
          stravaType: s.stravaType,
        },
      });
  }

  const existingAdmin = await db.select().from(users).limit(1);
  if (existingAdmin.length === 0) {
    const hash = await Bun.password.hash(env.ADMIN_PASSWORD);
    await db.insert(users).values({
      username: env.ADMIN_USERNAME,
      passwordHash: hash,
      role: "admin",
      name: "Administrator",
      onboardingDone: true,
    });
    console.log(`Admin dibuat: ${env.ADMIN_USERNAME} / ${env.ADMIN_PASSWORD}`);
  }

  console.log("Seed selesai.");
  await pool.end({ timeout: 5 });
}

main().catch(async (e) => {
  console.error(e);
  await pool.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
});
