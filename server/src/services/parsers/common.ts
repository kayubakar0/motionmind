import type { ParsedStreams } from "../../db/schema";
import { cumulativeDistances, elevationGainM } from "../geo";

export interface ParsedActivityFile {
  sportHint: string | null;
  name: string | null;
  startTime: Date;
  elapsedTimeS: number;
  movingTimeS: number | null;
  distanceM: number | null;
  elevationGainM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgPower: number | null;
  maxPower: number | null;
  avgCadence: number | null;
  deviceName: string | null;
  streams: ParsedStreams;
}

export type SeriesAccum = {
  time: number[];
  latlng: Array<[number, number]>;
  altitude: Array<number | null>;
  heartrate: Array<number | null>;
  cadence: Array<number | null>;
  watts: Array<number | null>;
  distance: Array<number | null>;
};

export function newAccum(): SeriesAccum {
  return { time: [], latlng: [], altitude: [], heartrate: [], cadence: [], watts: [], distance: [] };
}

function mean(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

function maxOf(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (valid.length === 0) return null;
  return Math.round(Math.max(...valid) * 10) / 10;
}

export function finalizeAccum(accum: SeriesAccum, start: Date): ParsedActivityFile {
  const n = accum.time.length;
  const distCum = accum.latlng.length === n ? cumulativeDistances(accum.latlng) : null;
  const distance: Array<number | null> =
    distCum && !accum.distance.some((d) => d != null) ? distCum : accum.distance;

  const velocity: Array<number | null> = new Array(n).fill(null);
  let movingS = 0;
  for (let i = 1; i < n; i++) {
    const dt = accum.time[i] - accum.time[i - 1];
    const dd = (distance[i] ?? 0) - (distance[i - 1] ?? 0);
    if (dt > 0) {
      const v = dd / dt;
      velocity[i] = v;
      if (v > 0.5) movingS += dt;
    }
  }

  const streams: ParsedStreams = {
    time: accum.time,
    latlng: accum.latlng.length === n ? accum.latlng : undefined,
    altitude: accum.altitude.some((a) => a != null) ? fillForward(accum.altitude) : undefined,
    heartrate: accum.heartrate.some((h) => h != null) ? fillForward(accum.heartrate) : undefined,
    cadence: accum.cadence.some((c) => c != null) ? fillForward(accum.cadence) : undefined,
    watts: accum.watts.some((w) => w != null) ? fillForward(accum.watts) : undefined,
    velocity: velocity.some((v) => v != null) ? velocity.map((v) => v ?? 0) : undefined,
    distance: distance.every((d) => d != null) ? distance.map((d) => d as number) : undefined,
  };

  return {
    sportHint: null,
    name: null,
    startTime: start,
    elapsedTimeS: n > 1 ? accum.time[n - 1] : 0,
    movingTimeS: n > 1 ? movingS : null,
    distanceM: distCum ? Math.round(distCum[distCum.length - 1] * 10) / 10 : maxOf(distance),
    elevationGainM: accum.altitude.some((a) => a != null)
      ? elevationGainM(accum.altitude.map((a) => a ?? null))
      : null,
    avgHr: mean(accum.heartrate),
    maxHr: maxOf(accum.heartrate),
    avgPower: mean(accum.watts),
    maxPower: maxOf(accum.watts),
    avgCadence: mean(accum.cadence),
    deviceName: null,
    streams,
  };
}

function fillForward(values: Array<number | null | undefined>): number[] {
  const out: number[] = new Array(values.length);
  let last = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === "number" && Number.isFinite(v)) last = v;
    out[i] = last;
  }
  return out;
}

export function guessSportHint(text: string, hasPower: boolean): string | null {
  const t = text.toLowerCase();
  if (hasPower) return "ride";
  if (/\b(swim|renang)\b/.test(t)) return "swim";
  if (/\b(run|running|lari|jog|treadmill)\b/.test(t)) return "run";
  if (/\b(trail)\b/.test(t)) return "trail_run";
  if (/\b(cycl|ride|bik|pedal|sepeda)\b/.test(t)) return "ride";
  if (/\b(hike|hiking)\b/.test(t)) return "hike";
  if (/\b(walk|jalan)\b/.test(t)) return "walk";
  if (/\b(yoga)\b/.test(t)) return "yoga";
  if (/\b(strength|weight|gym|beban)\b/.test(t)) return "strength";
  return null;
}
