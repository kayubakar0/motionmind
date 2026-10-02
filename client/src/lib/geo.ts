export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function cumulativeDistances(points: [number, number][]): number[] {
  const out = new Array<number>(points.length);
  out[0] = 0;
  for (let i = 1; i < points.length; i++) {
    out[i] = out[i - 1] + haversineM(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }
  return out;
}

export interface ProfileData {
  d: number[];
  e: number[];
  grade: number[];
}

function sampleDown(d: number[], e: number[], maxSamples: number): { d: number[]; e: number[] } {
  const stride = Math.max(1, Math.ceil(d.length / maxSamples));
  const sd: number[] = [];
  const se: number[] = [];
  for (let i = 0; i < d.length; i += stride) {
    sd.push(d[i]);
    se.push(e[i]);
  }
  const last = d.length - 1;
  if (sd.length === 0 || sd[sd.length - 1] !== d[last]) {
    sd.push(d[last]);
    se.push(e[last]);
  }
  return { d: sd, e: se };
}

export function computeGrades(d: number[], e: number[], windowM = 25): number[] {  const n = d.length;
  const grade = new Array<number>(n).fill(0);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    while (lo < i && d[i] - d[lo] > windowM) lo++;
    while (lo > 0 && d[i] - d[lo] < windowM * 0.5 && lo > 0) lo--;
    while (hi < n - 1 && d[hi] - d[i] < windowM) hi++;
    const dd = d[hi] - d[lo];
    if (dd > 5) {
      grade[i] = Math.max(-25, Math.min(25, ((e[hi] - e[lo]) / dd) * 100));
    } else if (i > 0) {
      grade[i] = grade[i - 1];
    }
  }
  return grade;
}

export function buildProfile(d: number[], e: number[], maxSamples = 400): ProfileData {
  const { d: sd, e: se } = sampleDown(d, e, maxSamples);
  return { d: sd, e: se, grade: computeGrades(sd, se) };
}

export function buildProfileFromStreams(
  streams: {
    altitude?: number[] | null;
    distance?: number[] | null;
    latlng?: [number, number][] | null;
  } | null
): ProfileData | null {
  if (!streams?.altitude || streams.altitude.length < 5) return null;
  let d: number[] | null = null;
  if (streams.distance && streams.distance.length === streams.altitude.length) {
    d = streams.distance;
  } else if (streams.latlng && streams.latlng.length === streams.altitude.length) {
    d = cumulativeDistances(streams.latlng);
  }
  if (!d || d[d.length - 1] < 50) return null;
  return buildProfile(d, streams.altitude, 400);
}

export function gradeColor(g: number): string {
  if (g < -8) return "#3b82f6";
  if (g < -2) return "#06b6d4";
  if (g < 2) return "#16a34a";
  if (g < 5) return "#65a30d";
  if (g < 8) return "#f97316";
  if (g < 12) return "#ef4444";
  return "#e11d48";
}

export function gradeLabel(g: number): string {
  if (g < -8) return "Turunan tajam";
  if (g < -2) return "Turunan";
  if (g < 2) return "Datar";
  if (g < 5) return "Bukit ringan";
  if (g < 8) return "Bukit berat";
  return "Steep";
}

export function gradeTip(g: number): string | null {
  if (g >= 5) return "Gear ringan, duduk & jaga kadens 80+ — stabilkan daya, jangan menekan.";
  if (g >= 2) return "Jaga ritme sinkron pedal, daya sedang (Z2–Z3).";
  if (g <= -5) return "Turunan: waspadai kecepatan, rem awal sebelum tikungan.";
  return null;
}

export const GRADE_LEGEND: Array<{ label: string; color: string }> = [
  { label: "< −8%", color: "#3b82f6" },
  { label: "−8…−2%", color: "#06b6d4" },
  { label: "−2…+2%", color: "#16a34a" },
  { label: "+2…+5%", color: "#65a30d" },
  { label: "+5…+8%", color: "#f97316" },
  { label: "+8…+12%", color: "#ef4444" },
  { label: "> +12%", color: "#e11d48" },
];

export function locateByDistance(arr: number[], dist: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < dist) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(arr[lo - 1] - dist) < Math.abs(arr[lo] - dist)) return lo - 1;
  return lo;
}
