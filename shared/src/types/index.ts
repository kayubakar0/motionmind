export type SportCategory = "cycling" | "running" | "swimming" | "strength" | "flexibility" | "other";
export type MetricProfile = "power" | "pace" | "hr" | "volume" | "duration";
export type TssMethod = "power" | "hr" | "pace" | "volume" | "duration";

export interface SportDTO {
  id: string;
  name: string;
  category: SportCategory;
  metricProfile: MetricProfile;
  defaultTssMethod: TssMethod;
  icon: string;
  stravaType: string | null;
}

export type ActivitySource = "strava" | "upload" | "manual";
export type WorkoutType =
  | "endurance"
  | "tempo"
  | "intervals"
  | "recovery"
  | "long"
  | "strength"
  | "flexibility"
  | "test"
  | "race"
  | "rest";
export type SessionStatus = "planned" | "completed" | "missed" | "skipped";
export type PlanSessionStatus = SessionStatus;

export interface ActivitySummary {
  id: string;
  sportId: string;
  sportName: string;
  source: ActivitySource;
  name: string;
  startDate: string;
  distanceM: number | null;
  movingTimeS: number | null;
  elapsedTimeS: number | null;
  totalElevationGainM: number | null;
  avgPower: number | null;
  avgHr: number | null;
  tss: number | null;
}

export interface ZoneDistribution {
  zone: number;
  seconds: number;
}

export interface ActivityDetail extends ActivitySummary {
  description: string | null;
  avgCadence: number | null;
  maxHr: number | null;
  maxPower: number | null;
  avgSpeed: number | null;
  calories: number | null;
  deviceName: string | null;
  trainer: boolean;
  normalizedPower: number | null;
  intensityFactor: number | null;
  hrTss: number | null;
  tssMethod: string | null;
  timeInPowerZones: ZoneDistribution[] | null;
  timeInHrZones: ZoneDistribution[] | null;
  hasGps: boolean;
  hasStreams: boolean;
  pushedToStrava: boolean;
}

export interface StreamSeries {
  time: number[];
  latlng?: [number, number][] | null;
  altitude?: number[] | null;
  heartrate?: number[] | null;
  cadence?: number[] | null;
  watts?: number[] | null;
  velocity?: number[] | null;
  distance?: number[] | null;
}

export interface FitnessPoint {
  date: string;
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface WeeklyVolume {
  weekStart: string;
  hoursBySport: Record<string, number>;
  totalHours: number;
  tss: number;
}

export interface DashboardStats {
  fitness: FitnessPoint[];
  weekly: WeeklyVolume[];
  totals: {
    activities30d: number;
    hours30d: number;
    tss30d: number;
    distance30dKm: number;
    currentCtl: number;
    currentAtl: number;
    currentTsb: number;
  };
  recentActivities: ActivitySummary[];
}

export interface TargetDTO {
  id: string;
  sportId: string;
  name: string;
  description: string | null;
  type: "event" | "route" | "fitness";
  targetDate: string | null;
  distanceM: number | null;
  elevationM: number | null;
  durationS: number | null;
  fileId: string | null;
  routeStats: {
    distanceM?: number;
    elevationM?: number;
    maxElevationM?: number;
    minElevationM?: number;
    points?: [number, number][];
    profile?: { d: number[]; e: number[] };
  } | null;
  status: "active" | "achieved" | "archived";
  createdAt: string;
}

export interface PlanSessionDTO {
  id: string;
  planId: string;
  date: string;
  sportId: string;
  sportName?: string;
  sportIcon?: string;
  sportCategory?: string;
  workoutType: WorkoutType;
  title: string;
  description: string;
  durationPlannedS: number | null;
  distancePlannedM: number | null;
  intensityTargets: string[] | null;
  tssPlanned: number | null;
  status: PlanSessionStatus;
  reason: string | null;
}

export interface TrainingPlanDTO {
  id: string;
  targetId: string | null;
  name: string;
  goalSummary: string;
  startDate: string;
  endDate: string | null;
  version: number;
  status: "active" | "archived";
  weeklyHours: number | null;
  rationale: string | null;
  warnings: string[];
  providerName: string | null;
  sessions: PlanSessionDTO[];
}

export interface RecommendationDTO {
  id: string;
  trigger: string;
  providerName: string | null;
  model: string | null;
  summary: string | null;
  status: "active" | "superseded" | "expired";
  planId: string | null;
  createdAt: string;
}

export type AiProviderKind = "openrouter" | "custom_openai";

export interface AiProviderDTO {
  id: string;
  name: string;
  kind: AiProviderKind;
  baseUrl: string;
  model: string;
  params: { temperature?: number; maxTokens?: number };
  isActive: boolean;
  lastStatus: string | null;
  lastCheckedAt: string | null;
  hasApiKey: boolean;
}

export interface RouteClimb {
  startKm: number;
  lengthKm: number;
  gainM: number;
  avgGradePct: number;
}

export interface RouteAnalysisDTO {
  route: {
    distanceKm: number;
    elevationM: number;
    maxElevationM: number | null;
    minElevationM: number | null;
  };
  athlete: {
    sportId: string;
    sportName: string;
    ftp: number | null;
    weightKg: number | null;
    historySessions: number;
    historyHours: number;
    historyAvgSpeedKmh: number | null;
    historyLongestKm: number | null;
    best20mPower: number | null;
  };
  estimate: {
    basis: "power" | "history" | "default";
    targetPowerW: number | null;
    pctFtp: number | null;
    feasibility: string;
    severity: "ok" | "warn" | "hard";
    speedKmh: number;
    durationS: number;
    tss: number;
  };
  climbs: RouteClimb[];
  gradeDistribution: Array<{ label: string; km: number }>;
  focus: string[];
  notes: string[];
}

export interface UserProfileDTO {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  role: "admin" | "user";
  onboardingDone: boolean;
  sports: string[];
  primarySport: string | null;
  profile: {
    ftp: number | null;
    weightKg: number | null;
    restingHr: number | null;
    maxHr: number | null;
    weeklyHoursTarget: number | null;
    experienceLevel: string | null;
  };
  stravaConnected: boolean;
  stravaLastSync: string | null;
}

export interface JobDTO {
  id: string;
  type: string;
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
  error: string | null;
  createdAt: string;
}
