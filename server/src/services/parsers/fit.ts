import FitParser from "fit-file-parser";
import { newAccum, finalizeAccum, guessSportHint, type ParsedActivityFile } from "./common";
import { elevationGainM } from "../geo";

const SPORT_MAP: Record<string, string> = {
  cycling: "ride",
  running: "run",
  swimming: "swim",
  training: "strength",
  hiking: "hike",
  walking: "walk",
  rowing: "row",
};

interface FitRecord {
  timestamp?: Date;
  position_lat?: number;
  position_long?: number;
  altitude?: number;
  enhanced_altitude?: number;
  heart_rate?: number;
  cadence?: number;
  power?: number;
  distance?: number;
  speed?: number;
  [key: string]: unknown;
}

interface FitData {
  records?: FitRecord[];
  sessions?: Array<{
    sport?: string;
    sub_sport?: string;
    start_time?: Date;
    total_elapsed_time?: number;
    total_distance?: number;
    total_moving_time?: number;
    total_ascent?: number;
    total_calories?: number;
    avg_power?: number;
    max_power?: number;
    avg_heart_rate?: number;
    max_heart_rate?: number;
    avg_cadence?: number;
  }>;
  activity?: { device?: string };
  file_id?: { device_name?: string; manufacturer?: string; product?: string };
}

function parseFitAsync(buffer: Buffer): Promise<FitData> {
  return new Promise((resolve, reject) => {
    const fitParser = new FitParser({
      force: true,
      speedUnit: "m/s",
      lengthUnit: "m",
      temperatureUnit: "celsius",
      elapsedRecordField: false,
      mode: "list",
    });
    fitParser.parse(buffer, (err: Error | null, data: FitData) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

export async function parseFit(buffer: Buffer): Promise<ParsedActivityFile> {
  const data = await parseFitAsync(buffer);
  const records = data.records ?? [];
  if (records.length < 2) throw new Error("FIT tidak berisi cukup record");

  const session = data.sessions?.[0] ?? {};
  const accum = newAccum();
  let startTime: Date = session.start_time ?? records[0].timestamp ?? new Date();

  for (const r of records) {
    const ts = r.timestamp instanceof Date ? r.timestamp : new Date(String(r.timestamp));
    if (!Number.isFinite(ts.getTime())) continue;
    const tS = Math.round((ts.getTime() - startTime.getTime()) / 1000);
    if (accum.time.length > 0 && tS <= accum.time[accum.time.length - 1]) continue;
    const lat = typeof r.position_lat === "number" ? r.position_lat : null;
    const lon = typeof r.position_long === "number" ? r.position_long : null;
    accum.time.push(tS);
    if (lat != null && lon != null && Math.abs(lat) <= 90) accum.latlng.push([lat, lon]);
    const alt = (r.enhanced_altitude ?? r.altitude) as number | undefined;
    accum.altitude.push(typeof alt === "number" && Number.isFinite(alt) ? alt : null);
    accum.heartrate.push(typeof r.heart_rate === "number" ? r.heart_rate : null);
    accum.cadence.push(typeof r.cadence === "number" ? r.cadence : null);
    accum.watts.push(typeof r.power === "number" && r.power >= 0 ? r.power : null);
    accum.distance.push(typeof r.distance === "number" && Number.isFinite(r.distance) ? r.distance : null);
  }

  const result = finalizeAccum(accum, startTime);

  if (session.total_distance != null) result.distanceM = Math.round(session.total_distance * 10) / 10;
  if (session.total_elapsed_time != null) result.elapsedTimeS = Math.round(session.total_elapsed_time);
  if (session.total_moving_time != null) result.movingTimeS = Math.round(session.total_moving_time);
  if (session.total_ascent != null) result.elevationGainM = session.total_ascent;
  else if (!result.elevationGainM) {
    const alts = accum.altitude;
    if (alts.some((a) => a != null)) result.elevationGainM = elevationGainM(alts.map((a) => a ?? null));
  }
  result.avgHr = session.avg_heart_rate ?? result.avgHr;
  result.maxHr = session.max_heart_rate ?? result.maxHr;
  result.avgPower = session.avg_power ?? result.avgPower;
  result.maxPower = session.max_power ?? result.maxPower;
  result.avgCadence = session.avg_cadence ?? result.avgCadence;

  const deviceBits = [data.file_id?.manufacturer, data.file_id?.product].filter(Boolean).join(" ");
  result.deviceName = deviceBits || data.activity?.device || null;

  const sportKey = (session.sport ?? "").toLowerCase();
  const subSport = (session.sub_sport ?? "").toLowerCase();
  result.sportHint =
    guessSportHint(`${sportKey} ${subSport}`, accum.watts.some((w) => (w ?? 0) > 50)) ??
    SPORT_MAP[sportKey] ??
    null;

  return result;
}
