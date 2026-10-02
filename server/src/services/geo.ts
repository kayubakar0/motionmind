const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
    out[i] =
      out[i - 1] + haversineM(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }
  return out;
}

/** Elevasi gain dengan smoothing + threshold untuk mengurangi noise GPS/barometer */
export function elevationGainM(alt: Array<number | null | undefined>, threshold = 1.0): number {
  const clean = alt.filter((a): a is number => typeof a === "number" && Number.isFinite(a));
  if (clean.length < 3) return 0;
  const win = 5;
  const smoothed = clean.map((_, i) => {
    const start = Math.max(0, i - Math.floor(win / 2));
    const end = Math.min(clean.length, i + Math.floor(win / 2) + 1);
    let sum = 0;
    for (let j = start; j < end; j++) sum += clean[j];
    return sum / (end - start);
  });
  let gain = 0;
  let pending = 0;
  for (let i = 1; i < smoothed.length; i++) {
    const d = smoothed[i] - smoothed[i - 1];
    pending += d;
    if (pending >= threshold) {
      gain += pending;
      pending = 0;
    } else if (pending < 0) {
      pending = 0;
    }
  }
  return Math.max(0, Math.round(gain * 10) / 10);
}

export function samplePoints(points: [number, number][], maxPoints = 500): [number, number][] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out: [number, number][] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
