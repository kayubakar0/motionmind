import { and, desc, eq, gte, ne } from "drizzle-orm";
import { db } from "../db";
import {
  activities,
  activityAnalyses,
  activityMetrics,
  activityStreams,
  athleteProfiles,
  planSessions,
  sports,
} from "../db/schema";
import { ApiError } from "../http/helpers";
import { computeFitnessSeries, getDailyTss } from "../services/fitness";
import { chatComplete, getActiveProvider } from "./provider";

const PROMPT = `Kamu adalah coach olahraga yang ramah di aplikasi MotionMind. Tugasmu: menganalisis SATU aktivitas secara mendalam dari data JSON, lalu menjelaskannya dengan bahasa yang MUDAH DIPAHAMI ORANG AWAM.

GAYA BAHASA (PALING PENTING):
- Bicara seperti coach menjelaskan ke teman dekat yang bukan ahli: bahasa Indonesia sehari-hari, hangat, langsung ke poin.
- Hindari istilah teknis seminimal mungkin. Jika istilah memang perlu dipakai (mis. TSS, zona HR, IF, FTP, CTL/TSB), sebut sekali lalu langsung jelaskan artinya dengan kalimat sederhana dalam kurung. Contoh: "TSS 48 (angka seberapa berat latihan ini; 50-an tergolong sedang)".
- Jangan tumpuk angka mentah — pilih hanya angka yang benar-benar penting dan langsung beri tahu artinya. Contoh alih-alih "drift HR 5,5%, decoupling 24,8%": "detak jantung naik perlahan sekitar 5% di paruh kedua walau tempo tetap — ini wajar untuk sesi sepanjang ini".
- Kalimat pendek dan mengalir, bukan gaya laporan laboratorium.

ATURAN:
- HANYA gunakan angka dari DATA. Jangan pernah mengarang angka.
- Ceritakan jalannya sesi: sebut momen kunci (menit/km ke-berapa) saat ada tanjakan berat, sprint, atau perubahan tempo, dan apa yang terjadi dengan tubuh di momen itu.
- Jelaskan seberapa berat sesi ini bagi tubuh, serta perannya dibanding latihan 14 hari terakhir.
- Jika data tidak lengkap (mis. tanpa power meter), sebut sekilas dengan bahasa sederhana, lalu lanjutkan analisis dari data yang ada.
- Jangan menyusun jadwal lengkap; cukup arahan untuk sesi berikutnya.

STRUKTUR WAJIB (mulai langsung dengan "###", tanpa kalimat pembuka):
### Ringkasan Sesi
### Yang Terjadi di Lapangan
### Apa Artinya untuk Tubuhmu
### Yang Sudah Bagus & Yang Bisa Ditingkatkan
### Saran Selanjutnya

Maksimal ~500 kata.`;

type NumStream = number[] | null | undefined;

interface StreamsForStats {
  time: NumStream;
  watts: NumStream;
  heartrate: NumStream;
  cadence: NumStream;
  velocity: NumStream;
  altitude: NumStream;
  distance: NumStream;
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function halvesAvg(arr: number[]): [number | null, number | null] {
  if (arr.length < 8) return [null, null];
  const mid = Math.floor(arr.length / 2);
  return [avg(arr.slice(0, mid)), avg(arr.slice(mid))];
}

function downsample(arr: number[] | null | undefined, max = 60, round: (v: number) => number = Math.round): number[] | null {
  if (!arr || arr.length === 0) return null;
  if (arr.length <= max) return arr.map(round);
  const step = arr.length / max;
  const out: number[] = [];
  for (let i = 0; i < max; i++) out.push(round(arr[Math.floor(i * step)]));
  return out;
}

function computeStreamStats(s: StreamsForStats): Record<string, unknown> {
  const watts = s.watts?.filter((v) => v > 0) ?? [];
  const hr = s.heartrate?.filter((v) => v > 0) ?? [];
  const cadence = s.cadence?.filter((v) => v > 0) ?? [];
  const velocity = s.velocity?.filter((v) => v > 0) ?? [];
  const stats: Record<string, unknown> = {};

  if (watts.length > 4) {
    const mean = avg(watts)!;
    const sd = Math.sqrt(avg(watts.map((w) => (w - mean) ** 2))!);
    stats.power = {
      avg_w: Math.round(mean),
      max_w: Math.round(Math.max(...watts)),
      variability_index: Math.round((sd / mean) * 100) / 100,
    };
  }
  if (hr.length > 4) {
    const [h1, h2] = halvesAvg(hr);
    stats.heart_rate = {
      max_bpm: Math.round(Math.max(...hr)),
      drift_pct: h1 && h2 ? Math.round(((h2 / h1 - 1) * 100) * 10) / 10 : null,
    };
  }
  if (velocity.length > 4) {
    const [v1, v2] = halvesAvg(velocity);
    stats.kecepatan = {
      max_kmh: Math.round(Math.max(...velocity) * 3.6 * 10) / 10,
      decoupling_pct: v1 && v2 ? Math.round(((1 - v2 / v1) * 100) * 10) / 10 : null,
    };
  }
  if (cadence.length > 4) {
    stats.kadens = { avg: Math.round(avg(cadence)!), max: Math.round(Math.max(...cadence)) };
  }
  if (s.altitude && s.altitude.length > 4 && s.distance && s.distance.length > 4) {
    let gain = 0;
    const buckets = { flat: 0, rolling: 0, steep: 0 };
    let prevAlt: number | null = null;
    let prevD: number | null = null;
    for (let i = 0; i < s.altitude.length; i++) {
      const a = s.altitude[i];
      const d = s.distance[i];
      if (a == null || d == null) continue;
      if (prevAlt != null && a > prevAlt) gain += a - prevAlt;
      if (prevAlt != null && prevD != null && d > prevD) {
        const grade = ((a - prevAlt) / (d - prevD)) * 100;
        const km = (d - prevD) / 1000;
        if (grade > 6) buckets.steep += km;
        else if (grade > 3) buckets.rolling += km;
        else buckets.flat += km;
      }
      prevAlt = a;
      prevD = d;
    }
    const totalKm = buckets.flat + buckets.rolling + buckets.steep;
    if (totalKm > 0.1) {
      const pct = (v: number) => Math.round((v / totalKm) * 100);
      stats.gradien = {
        flat_pct: pct(buckets.flat),
        rolling_3_6_pct: pct(buckets.rolling),
        steep_gt6_pct: pct(buckets.steep),
      };
    }
    if (gain > 0) stats.elevasi_dari_stream_m = Math.round(gain);
  }
  return stats;
}

const POWER_ZONE_LABELS = ["", "Z1 Pemulihan", "Z2 Endurance", "Z3 Tempo", "Z4 Threshold", "Z5 VO2max", "Z6 Anaerobik", "Z7 Neuromuskular"];
const HR_ZONE_LABELS = ["", "Z1 (<60%)", "Z2 (60-70%)", "Z3 (70-80%)", "Z4 (80-90%)", "Z5 (>90%)"];

function labelZones(zones: Array<{ zone: number; seconds: number }> | null | undefined, labels: string[]) {
  if (!zones || zones.length === 0) return null;
  return zones
    .filter((z) => z.seconds > 0)
    .map((z) => ({ zona: labels[z.zone] ?? `Z${z.zone}`, menit: Math.round(z.seconds / 60) }));
}

export async function getActivityAnalysis(userId: string, activityId: string) {
  const rows = await db
    .select()
    .from(activityAnalyses)
    .where(and(eq(activityAnalyses.activityId, activityId), eq(activityAnalyses.userId, userId)))
    .limit(1);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    activityId: r.activityId,
    content: r.content,
    providerName: r.providerName,
    model: r.model,
    latencyMs: r.latencyMs,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function analyzeActivity(userId: string, activityId: string) {
  const rows = await db
    .select({ activity: activities, sport: sports, metrics: activityMetrics })
    .from(activities)
    .leftJoin(sports, eq(sports.id, activities.sportId))
    .leftJoin(activityMetrics, eq(activityMetrics.activityId, activities.id))
    .where(and(eq(activities.id, activityId), eq(activities.userId, userId)))
    .limit(1);
  if (rows.length === 0) throw new ApiError(404, "Aktivitas tidak ditemukan");
  const { activity, sport, metrics } = rows[0];

  const [streamRows, profileRows] = await Promise.all([
    db.select().from(activityStreams).where(eq(activityStreams.activityId, activityId)).limit(1),
    db.select().from(athleteProfiles).where(eq(athleteProfiles.userId, userId)).limit(1),
  ]);
  const st = streamRows[0] ?? null;
  const profile = profileRows[0] ?? null;

  const since14 = new Date(Date.now() - 14 * 86400000);
  const [recentRows, daily, sessionRows] = await Promise.all([
    db
      .select({
        startDate: activities.startDate,
        sportName: sports.name,
        name: activities.name,
        movingTimeS: activities.movingTimeS,
        distanceM: activities.distanceM,
        tss: activityMetrics.tss,
      })
      .from(activities)
      .leftJoin(sports, eq(sports.id, activities.sportId))
      .leftJoin(activityMetrics, eq(activityMetrics.activityId, activities.id))
      .where(and(eq(activities.userId, userId), gte(activities.startDate, since14), ne(activities.id, activityId)))
      .orderBy(desc(activities.startDate))
      .limit(15),
    getDailyTss(userId, 42),
    db
      .select({
        date: planSessions.date,
        title: planSessions.title,
        workoutType: planSessions.workoutType,
        description: planSessions.description,
        durationPlannedS: planSessions.durationPlannedS,
        distancePlannedM: planSessions.distancePlannedM,
        tssPlanned: planSessions.tssPlanned,
        intensityTargets: planSessions.intensityTargets,
      })
      .from(planSessions)
      .where(and(eq(planSessions.userId, userId), eq(planSessions.completedActivityId, activityId)))
      .limit(1),
  ]);

  const series = computeFitnessSeries(daily, 42);
  const fit = series[series.length - 1] ?? { ctl: 0, atl: 0, tsb: 0 };

  const streamStats = computeStreamStats({
    time: st?.time ?? null,
    watts: st?.watts ?? null,
    heartrate: st?.heartrate ?? null,
    cadence: st?.cadence ?? null,
    velocity: st?.velocity ?? null,
    altitude: st?.altitude ?? null,
    distance: st?.distance ?? null,
  });

  const minutes = Math.floor((activity.movingTimeS ?? activity.elapsedTimeS ?? 0) / 60);
  const timeMinutes = downsample(st?.time, 60, (v) => Math.round(v / 60));
  const sampel = {
    waktu_menit: timeMinutes,
    power_w: downsample(st?.watts, 60),
    hr_bpm: downsample(st?.heartrate, 60),
    kadens: downsample(st?.cadence, 60),
    kecepatan_kmh: downsample(st?.velocity, 60, (v) => Math.round(v * 3.6 * 10) / 10),
    elevasi_m: downsample(st?.altitude, 60, (v) => Math.round(v)),
  };

  const data = {
    aktivitas: {
      nama: activity.name,
      sport: sport?.name ?? activity.sportId,
      tanggal: new Date(activity.startDate).toISOString().slice(0, 10),
      sumber: activity.source,
      jarak_km: activity.distanceM != null ? Math.round((activity.distanceM / 1000) * 10) / 10 : null,
      durasi_menit: minutes,
      elevasi_m: activity.totalElevationGainM != null ? Math.round(activity.totalElevationGainM) : null,
      avg_hr: activity.avgHr != null ? Math.round(activity.avgHr) : null,
      max_hr: activity.maxHr != null ? Math.round(activity.maxHr) : null,
      avg_power: activity.avgPower != null ? Math.round(activity.avgPower) : null,
      max_power: activity.maxPower != null ? Math.round(activity.maxPower) : null,
      kalori: activity.calories,
      trainer: activity.trainer,
    },
    metrik: {
      tss: metrics?.tss != null ? Math.round(metrics.tss * 10) / 10 : null,
      hr_tss: metrics?.hrTss != null ? Math.round(metrics.hrTss) : null,
      metode_tss: metrics?.tssMethod,
      normalized_power: metrics?.normalizedPower != null ? Math.round(metrics.normalizedPower) : null,
      intensity_factor: metrics?.intensityFactor,
      pace_avg: metrics?.avgPaceSecPerKm != null ? `${Math.floor(metrics.avgPaceSecPerKm / 60)}:${String(Math.round(metrics.avgPaceSecPerKm % 60)).padStart(2, "0")} /km` : null,
      zona_power: labelZones(metrics?.timeInPowerZones, POWER_ZONE_LABELS),
      zona_hr: labelZones(metrics?.timeInHrZones, HR_ZONE_LABELS),
      power_curve: metrics?.powerCurve,
    },
    statistik_stream: streamStats,
    atlet: {
      ftp: profile?.ftp ?? null,
      berat_kg: profile?.weightKg,
      max_hr: profile?.maxHr,
      lthr: profile?.lthr,
      usia: profile?.age,
      level: profile?.experienceLevel,
    },
    kebugaran_saat_ini: { ctl: fit.ctl, atl: fit.atl, tsb: fit.tsb },
    aktivitas_14h: recentRows.map((r) => ({
      tanggal: new Date(r.startDate).toISOString().slice(0, 10),
      sport: r.sportName ?? "",
      nama: r.name,
      menit: r.movingTimeS != null ? Math.round(r.movingTimeS / 60) : null,
      jarak_km: r.distanceM != null ? Math.round((r.distanceM / 1000) * 10) / 10 : null,
      tss: r.tss != null ? Math.round(r.tss) : null,
    })),
    sesi_rencana_terkait: sessionRows[0]
      ? {
          tanggal: sessionRows[0].date,
          judul: sessionRows[0].title,
          tipe: sessionRows[0].workoutType,
          deskripsi: sessionRows[0].description,
          durasi_rencana_menit: sessionRows[0].durationPlannedS != null ? Math.round(sessionRows[0].durationPlannedS / 60) : null,
          jarak_rencana_km: sessionRows[0].distancePlannedM != null ? Math.round((sessionRows[0].distancePlannedM / 1000) * 10) / 10 : null,
          tss_rencana: sessionRows[0].tssPlanned,
          target_intensitas: sessionRows[0].intensityTargets,
        }
      : null,
    sampel_stream: sampel,
  };

  const provider = await getActiveProvider();
  const res = await chatComplete(
    provider,
    [
      { role: "system", content: PROMPT },
      { role: "user", content: `DATA AKTIVITAS (JSON, gunakan hanya angka dari sini):\n${JSON.stringify(data)}` },
    ],
    { userId, purpose: "activity_analysis", maxTokens: Math.max(provider.params?.maxTokens ?? 0, 8192) }
  );

  const content = res.content.trim();
  await db
    .insert(activityAnalyses)
    .values({
      activityId,
      userId,
      content,
      providerName: provider.name,
      model: provider.model,
      latencyMs: res.latencyMs,
    })
    .onConflictDoUpdate({
      target: activityAnalyses.activityId,
      set: {
        userId,
        content,
        providerName: provider.name,
        model: provider.model,
        latencyMs: res.latencyMs,
        updatedAt: new Date(),
      },
    });

  return {
    activityId,
    content,
    providerName: provider.name,
    model: provider.model,
    latencyMs: res.latencyMs,
    createdAt: new Date().toISOString(),
  };
}
