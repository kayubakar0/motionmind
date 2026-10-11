import { parseGpx, parseGpxRoute } from "./gpx";
import { parseTcx, parseTcxRoute } from "./tcx";
import { parseFit, parseFitRoute } from "./fit";
import type { ParsedActivityFile, RouteStats } from "./common";

export type { ParsedActivityFile, RouteStats };

export type ActivityFormat = "gpx" | "tcx" | "fit";

export function detectFormat(filename: string, buffer: Buffer): ActivityFormat {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "gpx") return "gpx";
  if (ext === "tcx") return "tcx";
  if (ext === "fit") return "fit";
  if (buffer.length > 11 && buffer.slice(8, 12).toString("ascii") === ".FIT") return "fit";
  const head = buffer.slice(0, 512).toString("utf8");
  if (head.includes("<gpx")) return "gpx";
  if (head.includes("TrainingCenterDatabase")) return "tcx";
  throw new Error("Format file tidak dikenali. Gunakan GPX, TCX, atau FIT.");
}

export async function parseActivityFile(format: ActivityFormat, buffer: Buffer): Promise<ParsedActivityFile> {
  switch (format) {
    case "gpx":
      return parseGpx(buffer.toString("utf8"));
    case "tcx":
      return parseTcx(buffer.toString("utf8"));
    case "fit":
      return parseFit(buffer);
  }
}

export async function parseRouteFile(format: ActivityFormat, buffer: Buffer): Promise<RouteStats> {
  switch (format) {
    case "gpx":
      return parseGpxRoute(buffer.toString("utf8"));
    case "tcx":
      return parseTcxRoute(buffer.toString("utf8"));
    case "fit":
      return parseFitRoute(buffer);
  }
}

export { parseGpxRoute };
