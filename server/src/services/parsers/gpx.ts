import { XMLParser } from "fast-xml-parser";
import { buildRouteStats, newAccum, finalizeAccum, guessSportHint, type ParsedActivityFile, type RoutePoint, type RouteStats } from "./common";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: true,
  parseAttributeValue: true,
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

function extractExtensions(ext: unknown): { hr: number | null; cad: number | null; atemp: number | null; power: number | null } {
  const out = { hr: null as number | null, cad: null as number | null, atemp: null as number | null, power: null as number | null };
  if (!ext || typeof ext !== "object") return out;
  const tpx = (ext as Record<string, unknown>).TrackPointExtension;
  const merged: Record<string, unknown> = { ...(ext as Record<string, unknown>), ...((tpx as Record<string, unknown>) ?? {}) };
  out.hr = num(merged.hr ?? merged.heartrate ?? merged.HeartRate);
  out.cad = num(merged.cad ?? merged.cadence);
  out.atemp = num(merged.atemp ?? merged.temp);
  out.power = num(merged.power ?? merged.watts ?? merged.Watts);
  return out;
}

export function parseGpx(xml: string): ParsedActivityFile {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const gpx = (doc.gpx ?? doc) as Record<string, unknown>;
  const trks = asArray(gpx.trk);
  if (trks.length === 0) throw new Error("GPX tidak berisi <trk>");

  const accum = newAccum();
  let firstTime: number | null = null;
  let name: string | null = null;
  let typeText = "";
  let hasPower = false;

  for (const trk of trks) {
    if (!name && typeof trk.name === "string") name = trk.name;
    if (typeof trk.type === "string") typeText += ` ${trk.type}`;
    for (const seg of asArray(trk.trkseg)) {
      for (const pt of asArray(seg.trkpt)) {
        const lat = num(pt["@_lat"]);
        const lon = num(pt["@_lon"]);
        const tIso = typeof pt.time === "string" ? pt.time : null;
        if (lat == null || lon == null || !tIso) continue;
        const tMs = Date.parse(tIso);
        if (!Number.isFinite(tMs)) continue;
        if (firstTime == null) firstTime = tMs;
        const tS = Math.round((tMs - firstTime) / 1000);
        if (accum.time.length > 0 && tS <= accum.time[accum.time.length - 1]) continue;
        const ext = extractExtensions(pt.extensions);
        if (ext.power != null && ext.power > 0) hasPower = true;
        accum.time.push(tS);
        accum.latlng.push([lat, lon]);
        accum.altitude.push(num(pt.ele));
        accum.heartrate.push(ext.hr);
        accum.cadence.push(ext.cad);
        accum.watts.push(ext.power);
        accum.distance.push(null);
      }
    }
  }

  const result = finalizeAccum(accum, new Date(firstTime ?? Date.now()));
  result.name = name;
  result.sportHint = guessSportHint(typeText, hasPower) ?? guessSportHint(String(gpx["@_creator"] ?? ""), hasPower);
  return result;
}

/** Parse GPX rute (rte atau trk) menjadi statistik rute */
export function parseGpxRoute(xml: string): RouteStats {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const gpx = (doc.gpx ?? doc) as Record<string, unknown>;
  const points: RoutePoint[] = [];

  for (const rte of asArray(gpx.rte)) {
    for (const pt of asArray(rte.rtept)) {
      const lat = num(pt["@_lat"]);
      const lon = num(pt["@_lon"]);
      if (lat == null || lon == null) continue;
      points.push({ lat, lon, ele: num(pt.ele) });
    }
  }
  if (points.length < 2) {
    for (const trk of asArray(gpx.trk)) {
      for (const seg of asArray(trk.trkseg)) {
        for (const pt of asArray(seg.trkpt)) {
          const lat = num(pt["@_lat"]);
          const lon = num(pt["@_lon"]);
          if (lat == null || lon == null) continue;
          points.push({ lat, lon, ele: num(pt.ele) });
        }
      }
    }
  }
  if (points.length < 2) throw new Error("GPX rute tidak berisi cukup titik");
  return buildRouteStats(points);
}
