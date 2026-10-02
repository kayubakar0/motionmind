import { XMLParser } from "fast-xml-parser";
import { newAccum, finalizeAccum, guessSportHint, type ParsedActivityFile } from "./common";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: true,
});

function asArray(v: unknown): Record<string, unknown>[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  return [v as Record<string, unknown>];
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

const SPORT_MAP: Record<string, string> = {
  biking: "ride",
  cycling: "ride",
  running: "run",
  swimming: "swim",
  other: null as never,
};

export function parseTcx(xml: string): ParsedActivityFile {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const tcd = (doc.TrainingCenterDatabase ?? doc) as Record<string, unknown>;
  const acts = asArray(tcd.Activities as Record<string, unknown>);

  const accum = newAccum();
  let startTime: Date | null = null;
  let sportText = "";
  let hasPower = false;

  const activitiesList = acts.flatMap((a) => asArray(a.Activity));
  if (activitiesList.length === 0) throw new Error("TCX tidak berisi <Activity>");

  for (const act of activitiesList) {
    if (typeof act["@_Sport"] === "string") sportText += ` ${act["@_Sport"]}`;
    const laps = asArray((act.Laps as Record<string, unknown> | undefined)?.Lap ?? act.Lap);
    for (const lap of laps) {
      const track = asArray(lap.Track);
      for (const t of track) {
        for (const tp of asArray(t.Trackpoint)) {
          const tIso = typeof tp.Time === "string" ? tp.Time : null;
          if (!tIso) continue;
          const tMs = Date.parse(tIso);
          if (!Number.isFinite(tMs)) continue;
          if (!startTime) startTime = new Date(tMs);
          const tS = Math.round((tMs - startTime.getTime()) / 1000);
          if (accum.time.length > 0 && tS <= accum.time[accum.time.length - 1]) continue;
          const pos = (tp.Position ?? null) as Record<string, unknown> | null;
          const lat = pos ? num(pos.LatitudeDegrees) : null;
          const lon = pos ? num(pos.LongitudeDegrees) : null;
          const hr = num((tp.HeartRateBpm as Record<string, unknown> | undefined)?.Value);
          const ext = (tp.Extensions ?? null) as Record<string, unknown> | null;
          const watts = num((ext?.TPX as Record<string, unknown> | undefined)?.Watts);          if (watts != null && watts > 0) hasPower = true;
          accum.time.push(tS);
          if (lat != null && lon != null) accum.latlng.push([lat, lon]);
          accum.altitude.push(num(tp.AltitudeMeters));
          accum.heartrate.push(hr);
          accum.cadence.push(num(tp.Cadence));
          accum.watts.push(watts);
          accum.distance.push(num(tp.DistanceMeters));
        }
      }
    }
  }

  if (!startTime) throw new Error("TCX tidak berisi timestamp valid");
  const result = finalizeAccum(accum, startTime);
  result.sportHint = guessSportHint(sportText, hasPower) ?? (SPORT_MAP[sportText.trim().toLowerCase()] ?? null);
  return result;
}
