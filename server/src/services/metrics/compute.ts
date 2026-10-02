import type { ParsedStreams, Sport, ZoneDistribution } from "../../db/schema";
import { ApiError } from "../../http/helpers";

export interface ComputeMetricsInput {
  sport: Sport;
  ftp: number | null;
  maxHr: number | null;
  restingHr: number | null;
  elapsedS: number;
  movingTimeS: number | null;
  distanceM: number | null;
  streams: ParsedStreams | null;
  avgHr: number | null;
}

export interface ComputedMetrics {
  normalizedPower: number | null;
  intensityFactor: number | null;
  tss: number | null;
  hrTss: number | null;
  tssMethod: string;
  avgPaceSecPerKm: number | null;
  timeInPowerZones: ZoneDistribution[] | null;
  timeInHrZones: ZoneDistribution[] | null;
  powerCurve: Record<string, number> | null;
}

const POWER_WINDOW_LABELS = [5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];
const POWER_ZONES = [0.55, 0.75, 0.9, 1.05, 1.2, 1.5]; // batas atas zone 1..6 (%FTP), zone 7 di atasnya
const HR_ZONES = [0.6, 0.7, 0.8, 0.9, 1.0]; // %maxHR batas atas zone 1..5
const LTHR_ZONES = [0.68, 0.83, 0.88, 0.93, Infinity]; // %LTHR batas bawah zone 2..5, faktor per jam
const LTHR_ZONE_FACTORS = [40, 70, 90, 110, 140];

function rollingMaxMean(values: number[], window: number): number | null {
  if (values.length < Math.max(2, Math.floor(window * 0.9))) return null;
  const prefix = new Float64Array(values.length + 1);
  for (let i = 0; i < values.length; i++) prefix[i + 1] = prefix[i] + values[i];
  let best = 0;
  for (let i = window; i <= values.length; i++) {
    const mean = (prefix[i] - prefix[i - window]) / window;
    if (mean > best) best = mean;
  }
  return best > 0 ? Math.round(best * 10) / 10 : null;
}

function normalizedPower(watts: number[]): number | null {
  if (watts.length < 60) return null;
  const prefix = new Float64Array(watts.length + 1);
  for (let i = 0; i < watts.length; i++) prefix[i + 1] = prefix[i] + Math.max(0, watts[i]);
  let sum4 = 0;
  let count = 0;
  for (let i = 30; i <= watts.length; i++) {
    const avg = (prefix[i] - prefix[i - 30]) / 30;
    sum4 += avg ** 4;
    count++;
  }
  if (count === 0) return null;
  return Math.round((sum4 / count) ** 0.25);
}

function zoneSeconds(series: (number | null | undefined)[] | null | undefined, upperBounds: number[], ref: number) {
  if (!series || !ref || ref <= 0) return null;
  const seconds = new Array(upperBounds.length + 1).fill(0);
  for (const v of series) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue;
    let z = upperBounds.findIndex((b) => v <= ref * b);
    if (z === -1) z = upperBounds.length;
    seconds[z] += 1;
  }
  const total = seconds.reduce((a, b) => a + b, 0);
  if (total < 60) return null;
  return seconds.map((s, i) => ({ zone: i + 1, seconds: s }));
}

function hrTssFromZones(zones: ZoneDistribution[] | null, lthr: number): number | null {
  if (!zones || !lthr) return null;
  let tss = 0;
  for (const { zone, seconds } of zones) {
    const lower = zone === 1 ? 0 : LTHR_ZONES[zone - 2];
    const zoneHrMid = lthr * ((lower + (LTHR_ZONES[zone - 1] === Infinity ? 1.1 : LTHR_ZONES[zone - 1])) / 2);
    let z = LTHR_ZONES.findIndex((b) => zoneHrMid <= lthr * b);
    if (z === -1) z = LTHR_ZONES.length - 1;
    tss += (seconds / 3600) * LTHR_ZONE_FACTORS[z];
  }
  return Math.round(tss * 10) / 10;
}

export function computeActivityMetrics(input: ComputeMetricsInput): ComputedMetrics {
  const { sport, ftp, maxHr, restingHr, distanceM, streams } = input;
  const elapsedS = input.elapsedS || streams?.time?.length || 0;
  if (!elapsedS) throw new ApiError(400, "Durasi aktivitas tidak diketahui");

  let movingS = input.movingTimeS ?? elapsedS;
  const watts = streams?.watts?.filter((w): w is number => typeof w === "number" && w > 0) ?? null;
  const wattsFull = streams?.watts ?? null;

  if (input.movingTimeS == null) {
    if (streams?.velocity?.length) {
      movingS = streams.velocity.filter((v) => typeof v === "number" && v > 0.5).length;
    } else if (streams?.distance?.length && streams.distance.length > 1) {
      let s = 0;
      for (let i = 1; i < streams.distance.length; i++) {
        if ((streams.distance[i] ?? 0) - (streams.distance[i - 1] ?? 0) > 0.4) s++;
      }
      movingS = s;
    } else if (watts) {
      movingS = elapsedS;
    }
  }
  movingS = Math.max(60, Math.min(movingS, elapsedS));

  const np = wattsFull ? normalizedPower(wattsFull.filter((w): w is number => typeof w === "number")) : null;
  const intensityFactor = np && ftp ? Math.round((np / ftp) * 1000) / 1000 : null;
  const powerTss =
    np && ftp ? Math.round(((movingS * np * (np / ftp)) / (ftp * 3600)) * 100 * 10) / 10 : null;

  const hrZones = zoneSeconds(
    streams?.heartrate ?? null,
    HR_ZONES,
    maxHr ?? 190
  );

  const lthr = maxHr ? Math.round(maxHr * 0.88) : null;
  const hrTss = hrTssFromZones(hrZones, lthr ?? 0) ?? null;

  const powerZones = ftp ? zoneSeconds(streams?.watts ?? null, POWER_ZONES, ftp) : null;

  let powerCurve: Record<string, number> | null = null;
  if (wattsFull && wattsFull.length >= 10) {
    const numeric = wattsFull.map((w) => (typeof w === "number" && Number.isFinite(w) ? Math.max(0, w) : 0));
    powerCurve = {};
    for (const w of POWER_WINDOW_LABELS) {
      const best = rollingMaxMean(numeric, w);
      if (best != null) powerCurve[String(w)] = best;
    }
    if (Object.keys(powerCurve).length === 0) powerCurve = null;
  }

  const avgPaceSecPerKm = distanceM && distanceM > 100 ? Math.round((movingS / distanceM) * 1000 * 10) / 10 : null;

  let tss: number | null = null;
  let tssMethod = "duration";
  if (powerTss != null) {
    tss = powerTss;
    tssMethod = "power";
  } else if (hrTss != null) {
    tss = hrTss;
    tssMethod = "hr";
  } else if (sport.metricProfile === "volume") {
    tss = Math.round((movingS / 60) * 0.5 * 10) / 10;
    tssMethod = "volume";
  } else if (sport.metricProfile === "duration") {
    tss = Math.round((movingS / 60) * 0.3 * 10) / 10;
    tssMethod = "duration";
  } else {
    tss = Math.round((movingS / 60) * 0.4 * 10) / 10;
    tssMethod = "duration";
  }

  return {
    normalizedPower: np,
    intensityFactor,
    tss,
    hrTss,
    tssMethod,
    avgPaceSecPerKm,
    timeInPowerZones: powerZones,
    timeInHrZones: hrZones,
    powerCurve,
  };
}
