import { and, eq, gte } from "drizzle-orm";
import { db } from "../db";
import { activities, activityMetrics, athleteProfiles, sports, type Target } from "../db/schema";
import { ApiError } from "../http/helpers";
import type { RouteAnalysisDTO } from "shared";

const G = 9.81;
const RHO = 1.225;
const CDA = 0.4;
const CRR = 0.004;
const BIKE_KG = 8;

function solveSpeedAtPower(power: number, massKg: number, grade: number): number {
  let lo = 0.5;
  let hi = 18;
  const pt = (v: number) => v * (massKg * G * (CRR + grade)) + 0.5 * RHO * CDA * v ** 3;
  if (pt(lo) > power) return lo;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (pt(mid) < power) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function powerAtSpeed(speed: number, massKg: number, grade: number): number {
  return speed * (massKg * G * (CRR + grade)) + 0.5 * RHO * CDA * speed ** 3;
}

interface Climb {
  startIdx: number;
  endIdx: number;
  startKm: number;
  lengthKm: number;
  gainM: number;
  avgGradePct: number;
}

function extractClimbs(d: number[], e: number[]): Climb[] {
  const climbs: Climb[] = [];
  let start = 0;
  let maxSoFar = e[0];
  for (let i = 1; i < d.length; i++) {
    if (e[i] > maxSoFar) maxSoFar = e[i];
    const drop = maxSoFar - e[i];
    if (drop >= 12 || i === d.length - 1) {
      const gain = e[i] - e[start];
      const len = d[i] - d[start];
      if (gain >= 15 && len >= 300) {
        climbs.push({
          startIdx: start,
          endIdx: i,
          startKm: d[start] / 1000,
          lengthKm: Math.round((len / 1000) * 100) / 100,
          gainM: Math.round(gain),
          avgGradePct: Math.round((gain / len) * 1000) / 10,
        });
      }
      start = i;
      maxSoFar = e[i];
    }
  }
  return climbs.sort((a, b) => b.gainM - a.gainM).slice(0, 4);
}

function gradeDistribution(d: number[], e: number[]): Array<{ label: string; km: number }> {
  const buckets = [
    { label: "Datar (<2%)", km: 0 },
    { label: "Bukit ringan (2–5%)", km: 0 },
    { label: "Bukit berat (5–8%)", km: 0 },
    { label: "Steep (>8%)", km: 0 },
  ];
  for (let i = 1; i < d.length; i++) {
    const len = d[i] - d[i - 1];
    if (len <= 0) continue;
    const grade = ((e[i] - e[i - 1]) / len) * 100;
    const idx = grade < 2 ? 0 : grade < 5 ? 1 : grade < 8 ? 2 : 3;
    buckets[idx].km += len / 1000;
  }
  return buckets.map((b) => ({ ...b, km: Math.round(b.km * 10) / 10 }));
}

const DEFAULT_SPEED_KMH: Record<string, number> = {
  ride: 25, virtual_ride: 30, gravel_ride: 22, mountain_bike: 18,
  run: 9, trail_run: 8, swim: 5, hike: 4.5, walk: 4.5, row: 14, kayak: 7, sup: 5, skate: 16, nordic_ski: 10,
};

function feasibilityLabel(pct: number | null): { text: string; severity: "ok" | "warn" | "hard" } {
  if (pct == null) return { text: "Estimasi berbasis kecepatan historis", severity: "ok" };
  if (pct < 65) return { text: "Santai — sangat realistis dengan persiapan ringan", severity: "ok" };
  if (pct < 78) return { text: "Menantang namun realistis untuk atlet dengan persiapan terstruktur", severity: "ok" };
  if (pct < 92) return { text: "Berat — butuh latihan daya tahan intensitas tinggi", severity: "warn" };
  return { text: "Sangat berat — perlu tuning FTP & nutrisi matang, pertimbangkan target durasi lebih longgar", severity: "hard" };
}

export async function analyzeRoute(target: Target): Promise<RouteAnalysisDTO> {
  if (!target.routeStats) throw new ApiError(400, "Rute belum selesai diproses. Tunggu parsing GPX selesai atau unggah ulang GPX-nya.");
  const rs = target.routeStats;
  if (!rs.profile || rs.profile.d.length < 3) throw new ApiError(400, "Profil elevasi rute tidak tersedia — unggah ulang file GPX rute.");

  const [sportRows, profileRows] = await Promise.all([
    db.select().from(sports).where(eq(sports.id, target.sportId)).limit(1),
    db.select().from(athleteProfiles).where(eq(athleteProfiles.userId, target.userId)).limit(1),
  ]);
  const sport = sportRows[0];
  const profile = profileRows[0];
  const sportName = sport?.name ?? target.sportId;

  const since = new Date(Date.now() - 90 * 86400000);
  const hist = await db
    .select({
      distanceM: activities.distanceM,
      movingTimeS: activities.movingTimeS,
      powerCurve: activityMetrics.powerCurve,
    })
    .from(activities)
    .leftJoin(activityMetrics, eq(activityMetrics.activityId, activities.id))
    .where(
      and(
        eq(activities.userId, target.userId),
        eq(activities.sportId, target.sportId),
        gte(activities.startDate, since)
      )
    )
    .limit(500);

  let histDist = 0;
  let histMoving = 0;
  let longestKm = 0;
  let sessions = 0;
  let best20m = 0;
  for (const h of hist) {
    if (h.distanceM && h.movingTimeS) {
      sessions++;
      histDist += h.distanceM;
      histMoving += h.movingTimeS;
      longestKm = Math.max(longestKm, h.distanceM / 1000);
    }
    const c = h.powerCurve?.["1200"];
    if (typeof c === "number" && c > best20m) best20m = c;
  }
  const histAvgKmh = histMoving > 600 ? Math.round(((histDist / histMoving) * 3.6) * 10) / 10 : null;

  const ftp = profile?.ftp ?? null;
  const weight = profile?.weightKg ?? 75;
  const mass = weight + BIKE_KG;

  const distanceM = rs.distanceM;
  const climbM = rs.elevationM;
  const grade = clampGrade(distanceM > 1000 ? climbM / distanceM : 0);
  const isPower = sport?.metricProfile === "power";

  let basis: RouteAnalysisDTO["estimate"]["basis"] = "default";
  let speedMs: number;
  let targetPowerW: number | null = null;
  let pctFtp: number | null = null;

  if (isPower && ftp) {
    targetPowerW = Math.round(ftp * 0.75);
    speedMs = solveSpeedAtPower(targetPowerW, mass, grade);
    basis = "power";
    pctFtp = 75;
  } else if (histAvgKmh != null && histAvgKmh > 3) {
    const climbPerKm = distanceM > 1000 ? climbM / (distanceM / 1000) : 0;
    const penalty = 1 + Math.min(0.35, climbPerKm * 0.011);
    speedMs = histAvgKmh / 3.6 / penalty;
    basis = "history";
    if (isPower && ftp) {
      pctFtp = Math.round(((powerAtSpeed(speedMs, mass, grade) / ftp) * 100) * 10) / 10;
      targetPowerW = Math.round(powerAtSpeed(speedMs, mass, grade));
    }
  } else {
    speedMs = (DEFAULT_SPEED_KMH[target.sportId] ?? 20) / 3.6;
    basis = "default";
  }

  const variability = basis === "history" ? 1.09 : basis === "default" ? 1.12 : 1.07;
  const durationS = Math.round((distanceM / speedMs) * variability);
  const speedKmh = Math.round(speedMs * 3.6 * 10) / 10;
  const hours = durationS / 3600;
  const intensity = pctFtp != null ? pctFtp / 100 : 0.55;
  const tss = Math.round(hours * intensity ** 2 * 100);

  const feas = feasibilityLabel(pctFtp);

  const climbsRaw = extractClimbs(rs.profile.d, rs.profile.e);
  const climbs = climbsRaw.map((c) => ({
    startKm: Math.round(c.startKm * 10) / 10,
    lengthKm: c.lengthKm,
    gainM: c.gainM,
    avgGradePct: c.avgGradePct,
  }));
  const gradeBuckets = gradeDistribution(rs.profile.d, rs.profile.e);

  const focus: string[] = [];
  const notes: string[] = [];
  const climbPerKm = distanceM > 1000 ? climbM / (distanceM / 1000) : 0;

  if (climbPerKm >= 12) focus.push("Daya tahan tanjakan: sisipkan sesi SWEET SPOT/FTP (mis. 2×20 menit di zona 3–4) setiap minggu — rute ini menanjak cukup berat.");
  else if (climbPerKm >= 6) focus.push("Sesi tempo di medan bergelombang (2×15 menit Z3) untuk kebiasaan beban naik-turun.");
  if (climbs[0] && climbs[0].lengthKm >= 8) focus.push(`Tanjakan kunci terpanjang ±${climbs[0].lengthKm} km — latih kemampuan menahan daya stabil lama (cruise interval 3×10 menit).`);
  if (durationS > 3 * 3600) focus.push("Latih endurance panjang: minimal 1 sesi Z2 > 3 jam/minggu + latih strategi nutrisi (60–90 g karbohidrat/jam, minum 500–750 ml/jam).");
  if (longestKm > 0 && distanceM / 1000 > longestKm) {
    const targetLong = Math.round(((distanceM / 1000) * 0.75) * 10) / 10;
    focus.push(`Long ride saat ini maks ±${Math.round(longestKm)} km — naikkan bertahap menuju ±${targetLong} km (75% jarak event).`);
  }
  if (gradeBuckets[3].km >= 3) focus.push("Ada segmen steep >8% — tambahkan intervals pendek daya tinggi (VO2 3–5 menit).");
  if (focus.length === 0) focus.push("Fokus dasar: konsistensi Z2 + 1 sesi intensitas per minggu sudah memadai untuk rute setringan ini.");

  if (!ftp && isPower) notes.push("Isi FTP di Pengaturan agar estimasi power/%FTP lebih akurat.");
  if (!profile?.weightKg) notes.push("Isi berat badan di Pengaturan untuk estimasi power yang presisi.");
  if (histAvgKmh == null) notes.push(`Belum ada data ${sportName} (90 hari) — estimasi memakai kecepatan default. Sinkron Strava atau unggah file aktivitamu.`);
  else if (sessions < 5) notes.push(`Data milikmu (${sessions} sesi) masih sedikit — estimasi akan makin akurat dengan lebih banyak aktivitas.`);

  return {
    route: {
      distanceKm: Math.round((distanceM / 1000) * 10) / 10,
      elevationM: Math.round(climbM),
      maxElevationM: rs.maxElevationM ?? null,
      minElevationM: rs.minElevationM ?? null,
    },
    athlete: {
      sportId: target.sportId,
      sportName,
      ftp,
      weightKg: profile?.weightKg ?? null,
      historySessions: sessions,
      historyHours: Math.round((histMoving / 3600) * 10) / 10,
      historyAvgSpeedKmh: histAvgKmh,
      historyLongestKm: Math.round(longestKm * 10) / 10,
      best20mPower: best20m > 0 ? best20m : null,
    },
    estimate: {
      basis,
      targetPowerW,
      pctFtp,
      feasibility: feas.text,
      severity: feas.severity,
      speedKmh,
      durationS,
      tss,
    },
    climbs,
    gradeDistribution: gradeBuckets,
    focus,
    notes,
  };
}

function clampGrade(v: number): number {
  return Math.max(0, Math.min(0.14, v));
}
