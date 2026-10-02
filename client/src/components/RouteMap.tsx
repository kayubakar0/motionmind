import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PathOptions } from "leaflet";
import { cumulativeDistances, computeGrades, gradeColor, gradeLabel, gradeTip, GRADE_LEGEND, locateByDistance } from "../lib/geo";
import type { RouteClimb } from "shared";

interface RouteMapProps {
  points: [number, number][];
  profile?: { d: number[]; e: number[]; grade?: number[] } | null;
  highlightIdx?: number | null;
  onHoverIdx?: (idx: number | null) => void;
  pinnedIdx?: number | null;
  onPinIdx?: (idx: number | null) => void;
  climbs?: RouteClimb[] | null;
  height?: number;
  interactive?: boolean;
  showKmMarkers?: boolean;
  showLegend?: boolean;
}

interface Profile {
  d: number[];
  e: number[];
  grade: number[];
}

const MAX_DRAW_POINTS = 2400;
const SIMPLIFY_TOL_M = 4;
const HOVER_TOLERANCE_PX = 30;
const CLICK_TOLERANCE_PX = 34;
const GRADE_SMOOTH_M = 200;
const MIN_RUN_M = 60;
const MAX_SEGMENTS = 160;

const TILE_URL = import.meta.env.VITE_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR = import.meta.env.VITE_TILE_URL
  ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const nf = new Intl.NumberFormat("id-ID");

const CASING_OPTIONS: PathOptions = { color: "#ffffff", weight: 7.5, opacity: 0.8, lineCap: "round", lineJoin: "round" };
const DOT_OPTIONS: PathOptions = { color: "#090b0a", weight: 2, fillColor: "#ffffff", fillOpacity: 1 };
const lineOptionsCache = new Map<string, PathOptions>();
function lineOptions(color: string): PathOptions {
  let opts = lineOptionsCache.get(color);
  if (!opts) {
    opts = { color, weight: 4, opacity: 0.96, lineCap: "round", lineJoin: "round" };
    lineOptionsCache.set(color, opts);
  }
  return opts;
}

let icons: { start: L.DivIcon; finish: L.DivIcon; pin: L.DivIcon; hover: L.DivIcon } | null = null;
function getIcons() {
  if (!icons) {
    const mk = (label: string, color: string) =>
      L.divIcon({
        html: `<div style="width:20px;height:20px;border-radius:6px;background:${color};color:#090b0a;font:700 11px 'Chakra Petch',sans-serif;display:flex;align-items:center;justify-content:center;border:2px solid #090b0a;box-shadow:0 0 10px rgba(0,0,0,.6)">${label}</div>`,
        className: "",
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
    icons = {
      start: mk("S", "#c9f24b"),
      finish: mk("F", "#f0675a"),
      hover: L.divIcon({
        html: `<div style="width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid #090b0a"></div>`,
        className: "",
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      }),
      pin: L.divIcon({
        html: `<svg width="26" height="34" viewBox="0 0 26 34"><path d="M13 0C5.8 0 0 5.8 0 13c0 9 13 21 13 21s13-12 13-21C26 5.8 20.2 0 13 0z" fill="#090b0a" stroke="#c9f24b" stroke-width="3"/><circle cx="13" cy="12.5" r="4.5" fill="#c9f24b"/></svg>`,
        className: "",
        iconSize: [26, 34],
        iconAnchor: [13, 34],
      }),
    };
  }
  return icons;
}

function useVisible(ref: React.RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return visible;
}

function Fitter({ points }: { points: [number, number][] }) {
  const map = useMap();
  const ptsRef = useRef(points);
  ptsRef.current = points;
  const fitKey = useMemo(
    () =>
      points.length > 1
        ? `${points.length}:${points[0][0]},${points[0][1]};${points[points.length - 1][0]},${points[points.length - 1][1]}`
        : null,
    [points]
  );
  const lastFitted = useRef<string | null>(null);
  useEffect(() => {
    if (fitKey == null || lastFitted.current === fitKey) return;
    lastFitted.current = fitKey;
    map.invalidateSize();
    map.fitBounds(ptsRef.current, { padding: [26, 26], animate: false });
  }, [map, fitKey]);
  return null;
}

interface InteractionDeps {
  src: number[] | null;
  coords: [number, number][];
  cum: number[];
  distRatio: number;
  fullProfile: Profile | null;
  onHoverIdx?: (idx: number | null) => void;
  onPinIdx?: (idx: number | null) => void;
  pinnedIdx: number | null;
}

interface ProjCache {
  coords: [number, number][];
  zoom: number;
  xs: Float64Array;
  ys: Float64Array;
}

interface Hit {
  i: number;
  t: number;
}

function nearestOnLine(
  map: L.Map,
  latlng: L.LatLng,
  deps: InteractionDeps,
  cacheRef: { current: ProjCache | null },
  tolPx: number
): Hit | null {
  const zoom = map.getZoom();
  let cache = cacheRef.current;
  if (!cache || cache.coords !== deps.coords || cache.zoom !== zoom) {
    const n = deps.coords.length;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = map.project(deps.coords[i], zoom);
      xs[i] = p.x;
      ys[i] = p.y;
    }
    cache = cacheRef.current = { coords: deps.coords, zoom, xs, ys };
  }
  const m = map.project(latlng, zoom);
  const tolSq = tolPx * tolPx;
  let bestD = tolSq;
  let bestI = -1;
  let bestT = 0;
  for (let i = 0; i < cache.xs.length - 1; i++) {
    const ax = cache.xs[i];
    const ay = cache.ys[i];
    const dx = cache.xs[i + 1] - ax;
    const dy = cache.ys[i + 1] - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((m.x - ax) * dx + (m.y - ay) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + t * dx - m.x;
    const ey = ay + t * dy - m.y;
    const d = ex * ex + ey * ey;
    if (d < bestD) {
      bestD = d;
      bestI = i;
      bestT = t;
    }
  }
  return bestI < 0 ? null : { i: bestI, t: bestT };
}

function hitDist(deps: InteractionDeps, hit: Hit): number {
  const o0 = deps.src ? deps.src[hit.i] : hit.i;
  const o1 = deps.src ? (deps.src[hit.i + 1] ?? o0) : Math.min(hit.i + 1, deps.cum.length - 1);
  const d0 = deps.cum[o0];
  const d1 = deps.cum[o1];
  return d0 + (d1 - d0) * hit.t;
}

function hitToProfileIdx(deps: InteractionDeps, hit: Hit): number {
  if (!deps.fullProfile) return deps.src ? deps.src[hit.i] : hit.i;
  return locateByDistance(deps.fullProfile.d, hitDist(deps, hit) / deps.distRatio);
}

function MapInteractions({ depsRef, draggingRef }: { depsRef: { current: InteractionDeps | null }; draggingRef: { current: boolean } }) {
  const map = useMap();
  const projRef = useRef<ProjCache | null>(null);
  const pendingRef = useRef<L.LatLng | null>(null);
  const rafRef = useRef(0);
  const lastHoverIdx = useRef(-1);

  useLayoutEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useMapEvents({
    movestart: () => {
      draggingRef.current = true;
    },
    moveend: () => {
      draggingRef.current = false;
    },
    mousemove: (e) => {
      pendingRef.current = e.latlng;
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          const latlng = pendingRef.current;
          pendingRef.current = null;
          if (!latlng) return;
          const deps = depsRef.current;
          if (!deps || draggingRef.current || !deps.onHoverIdx) return;
          const hit = nearestOnLine(map, latlng, deps, projRef, HOVER_TOLERANCE_PX);
          const idx = hit ? hitToProfileIdx(deps, hit) : null;
          if ((idx ?? -1) === lastHoverIdx.current) return;
          lastHoverIdx.current = idx ?? -1;
          deps.onHoverIdx(idx);
        });
      }
    },
    mouseout: () => {
      const deps = depsRef.current;
      if (deps?.onHoverIdx && lastHoverIdx.current !== -1) {
        lastHoverIdx.current = -1;
        deps.onHoverIdx(null);
      }
    },
    click: (e) => {
      const deps = depsRef.current;
      if (!deps || draggingRef.current || !deps.onPinIdx) return;
      const hit = nearestOnLine(map, e.latlng, deps, projRef, CLICK_TOLERANCE_PX);
      if (!hit) return;
      const idx = hitToProfileIdx(deps, hit);
      deps.onPinIdx(idx === (deps.pinnedIdx ?? -1) ? null : idx);
    },
  });
  return null;
}

interface Segment {
  color: string;
  coords: [number, number][];
}

interface DrawData {
  coords: [number, number][];
  cum: number[];
  src: number[] | null;
}

function buildDrawData(points: [number, number][], cum: number[]): DrawData {
  if (points.length <= MAX_DRAW_POINTS) return { coords: points, cum, src: null };
  let src = simplifyIndices(points, SIMPLIFY_TOL_M);
  if (src.length > MAX_DRAW_POINTS) {
    const stride = Math.ceil(src.length / MAX_DRAW_POINTS);
    const s2: number[] = [];
    for (let i = 0; i < src.length; i += stride) s2.push(src[i]);
    if (s2[s2.length - 1] !== src[src.length - 1]) s2.push(src[src.length - 1]);
    src = s2;
  }
  const coords: [number, number][] = src.map((i) => points[i]);
  const drawCum = src.map((i) => cum[i]);
  return { coords, cum: drawCum, src };
}

function simplifyIndices(points: [number, number][], tolM: number): number[] {
  const n = points.length;
  if (n <= 2) return points.map((_, i) => i);
  let latSum = 0;
  for (const p of points) latSum += p[0];
  const kx = 111320 * Math.max(0.2, Math.cos((latSum / n) * (Math.PI / 180)));
  const ky = 110540;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = points[i][1] * kx;
    ys[i] = points[i][0] * ky;
  }
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const tolSq = tolM * tolM;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const seg = stack.pop()!;
    const lo = seg[0];
    const hi = seg[1];
    if (hi - lo < 2) continue;
    const ax = xs[lo];
    const ay = ys[lo];
    const dx = xs[hi] - ax;
    const dy = ys[hi] - ay;
    const len2 = dx * dx + dy * dy;
    let bestD = -1;
    let bestI = -1;
    for (let i = lo + 1; i < hi; i++) {
      let ex: number;
      let ey: number;
      if (len2 === 0) {
        ex = xs[i] - ax;
        ey = ys[i] - ay;
      } else {
        const t = ((xs[i] - ax) * dx + (ys[i] - ay) * dy) / len2;
        if (t <= 0) {
          ex = xs[i] - ax;
          ey = ys[i] - ay;
        } else if (t >= 1) {
          ex = xs[i] - xs[hi];
          ey = ys[i] - ys[hi];
        } else {
          ex = ax + t * dx - xs[i];
          ey = ay + t * dy - ys[i];
        }
      }
      const d2 = ex * ex + ey * ey;
      if (d2 > bestD) {
        bestD = d2;
        bestI = i;
      }
    }
    if (bestI > 0 && bestD > tolSq) {
      keep[bestI] = 1;
      stack.push([lo, bestI], [bestI, hi]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}

function smoothGradeByDistance(d: number[], values: number[], windowM: number): number[] {
  const n = d.length;
  const out = new Array<number>(n);
  const half = windowM / 2;
  let lo = 0;
  let hi = 0;
  let sum = values[0] ?? 0;
  for (let i = 0; i < n; i++) {
    while (hi < n - 1 && d[hi + 1] - d[i] <= half) {
      hi++;
      sum += values[hi];
    }
    while (lo < i && d[i] - d[lo] > half) {
      sum -= values[lo];
      lo++;
    }
    out[i] = sum / (hi - lo + 1);
  }
  return out;
}

function mergeTinyRuns(colors: string[], cum: number[], minRunM: number): string[] {
  const n = colors.length;
  const runs: Array<{ start: number; end: number; color: string }> = [];
  let start = 0;
  for (let i = 1; i < n; i++) {
    if (colors[i] !== colors[start]) {
      runs.push({ start, end: i - 1, color: colors[start] });
      start = i;
    }
  }
  runs.push({ start, end: n - 1, color: colors[start] });
  for (let r = 1; r < runs.length - 1; r++) {
    const run = runs[r];
    if (cum[run.end] - cum[run.start] < minRunM) run.color = runs[r - 1].color;
  }
  if (runs.length > 1) {
    if (cum[runs[0].end] - cum[runs[0].start] < minRunM) runs[0].color = runs[1].color;
    const last = runs[runs.length - 1];
    if (cum[last.end] - cum[last.start] < minRunM) last.color = runs[runs.length - 2].color;
  }
  const out = new Array<string>(n);
  for (const run of runs) {
    for (let i = run.start; i <= run.end; i++) out[i] = run.color;
  }
  return out;
}

function majorityColor(colors: string[], lo: number, hi: number): string {
  const counts = new Map<string, number>();
  let best = colors[lo];
  let bestN = 0;
  for (let i = lo; i <= hi; i++) {
    const c = colors[i];
    const cnt = (counts.get(c) ?? 0) + 1;
    counts.set(c, cnt);
    if (cnt > bestN) {
      bestN = cnt;
      best = c;
    }
  }
  return best;
}

function buildSegments(draw: DrawData, profile: Profile | null, distRatio: number): Segment[] {
  const points = draw.coords;
  const cum = draw.cum;
  if (points.length < 2) return [];
  const hasProfile = Boolean(profile && profile.d.length > 2 && profile.grade && profile.grade.length > 2);

  let colors: string[];
  if (hasProfile && profile) {
    const n = points.length;
    const pd = profile.d;
    const pg = profile.grade;
    const raw = new Array<number>(n);
    let pi = 0;
    for (let i = 0; i < n; i++) {
      const dist = cum[i] / distRatio;
      while (pi < pd.length - 1 && pd[pi] < dist) pi++;
      if (pi > 0 && Math.abs(pd[pi - 1] - dist) < Math.abs(pd[pi] - dist)) raw[i] = pg[pi - 1] ?? 0;
      else raw[i] = pg[pi] ?? 0;
    }
    const smooth = smoothGradeByDistance(cum, raw, GRADE_SMOOTH_M);
    colors = new Array<string>(n);
    for (let i = 0; i < n; i++) colors[i] = gradeColor(smooth[i]);
  } else {
    colors = new Array<string>(points.length).fill(gradeColor(0));
  }

  const cleaned = mergeTinyRuns(colors, cum, MIN_RUN_M);

  const segments: Segment[] = [];
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    if (cleaned[i] !== cleaned[start]) {
      segments.push({ color: cleaned[start], coords: points.slice(start, i + 1) });
      start = i;
    }
  }
  segments.push({ color: cleaned[start], coords: points.slice(start) });

  if (segments.length > MAX_SEGMENTS) {
    const stride = Math.ceil(points.length / MAX_SEGMENTS);
    const merged: Segment[] = [];
    for (let i = 0; i < points.length - 1; i += stride) {
      const end = Math.min(points.length - 1, i + stride);
      merged.push({ color: majorityColor(cleaned, i, end), coords: points.slice(i, end + 1) });
    }
    return merged;
  }
  return segments;
}

function buildKmMarkers(points: [number, number][], cum: number[]): [number, number][] {
  const total = cum[cum.length - 1] ?? 0;
  if (total < 2000) return [];
  const step = total > 100000 ? 20000 : total > 40000 ? 10000 : total > 15000 ? 5000 : 1000;
  const out: [number, number][] = [];
  for (let km = step; km < total; km += step) {
    const idx = locateByDistance(cum, km);
    out.push(points[idx]);
  }
  return out;
}

const RouteLines = memo(function RouteLines({ draw, segments }: { draw: DrawData; segments: Segment[] }) {
  return (
    <>
      <Polyline positions={draw.coords} pathOptions={CASING_OPTIONS} interactive={false} />
      {segments.map((seg, i) => (
        <Polyline key={`g-${i}`} positions={seg.coords} pathOptions={lineOptions(seg.color)} interactive={false} />
      ))}
    </>
  );
});

const KmMarkers = memo(function KmMarkers({ markers }: { markers: [number, number][] }) {
  return (
    <>
      {markers.map((p, i) => (
        <CircleMarker key={i} center={p} radius={4} pathOptions={DOT_OPTIONS} interactive={false} />
      ))}
    </>
  );
});

const HoverMarkers = memo(function HoverMarkers({
  points,
  cum,
  fullProfile,
  distRatio,
  highlightIdx,
  pinnedIdx,
}: {
  points: [number, number][];
  cum: number[];
  fullProfile: Profile | null;
  distRatio: number;
  highlightIdx: number | null;
  pinnedIdx: number | null;
}) {
  const hoverPoint = useMemo(() => {
    if (highlightIdx == null || !fullProfile || highlightIdx >= fullProfile.d.length) return null;
    return points[locateByDistance(cum, fullProfile.d[highlightIdx] * distRatio)] ?? null;
  }, [highlightIdx, fullProfile, cum, points, distRatio]);

  const pinnedPoint = useMemo(() => {
    if (pinnedIdx == null || !fullProfile || pinnedIdx >= fullProfile.d.length) return null;
    return points[locateByDistance(cum, fullProfile.d[pinnedIdx] * distRatio)] ?? null;
  }, [pinnedIdx, fullProfile, cum, points, distRatio]);

  return (
    <>
      {hoverPoint && !pinnedPoint && (
        <Marker position={hoverPoint} icon={getIcons().hover} interactive={false} keyboard={false} zIndexOffset={800} />
      )}
      {pinnedPoint && <Marker position={pinnedPoint} icon={getIcons().pin} interactive={false} keyboard={false} zIndexOffset={900} />}
    </>
  );
});

const Legend = memo(function Legend({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-[500] hidden max-w-[74%] flex-wrap gap-x-2.5 gap-y-1 rounded-lg border border-line/80 bg-surface/85 p-2 backdrop-blur-sm sm:flex">
      {GRADE_LEGEND.map((g) => (
        <span key={g.label} className="flex items-center gap-1 text-[9px] text-mute">
          <span className="h-1.5 w-3 rounded-full" style={{ background: g.color }} />
          {g.label}
        </span>
      ))}
    </div>
  );
});

function readPoint(profile: Profile, idx: number, climbs?: RouteClimb[] | null) {
  const km = profile.d[idx] / 1000;
  const grade = profile.grade[idx] ?? 0;
  const color = gradeColor(grade);
  let climbTag: string | null = null;
  if (climbs) {
    const hit = climbs.findIndex(
      (c) => km >= c.startKm - 0.15 && km <= c.startKm + c.lengthKm + 0.15
    );
    if (hit >= 0) climbTag = `Tanjakan kunci #${hit + 1}`;
  }
  return {
    km: Math.round(km * 10) / 10,
    elevation: profile.e[idx] ?? 0,
    grade,
    color,
    label: climbTag ?? gradeLabel(grade),
    tip: gradeTip(grade),
  };
}

const InfoCard = memo(function InfoCard({
  fullProfile,
  idx,
  climbs,
  pinned,
}: {
  fullProfile: Profile | null;
  idx: number | null;
  climbs?: RouteClimb[] | null;
  pinned: boolean;
}) {
  if (idx == null || !fullProfile || idx >= fullProfile.d.length) return null;
  const info = readPoint(fullProfile, idx, climbs);
  return (
    <div className="pointer-events-none absolute left-2 top-2 z-[600] w-44 rounded-xl border border-line bg-surface/92 p-2.5 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="num text-[11px] font-semibold text-ink">km {nf.format(info.km)}</span>
        <span className="num text-[11px] font-semibold" style={{ color: info.color }}>
          {info.grade > 0 ? "+" : ""}
          {info.grade.toFixed(1)}%
        </span>
      </div>
      <div className="num mt-0.5 text-[10px] text-mute">elevasi {nf.format(Math.round(info.elevation))} m</div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="h-1.5 w-3 rounded-full" style={{ background: info.color }} />
        <span className="text-[10px] font-semibold text-ink">{info.label}</span>
        {pinned && <span className="ml-auto text-[9px] text-dim">dipin</span>}
      </div>
      {info.tip && <div className="mt-1.5 border-t border-line pt-1.5 text-[10px] leading-relaxed text-mute">{info.tip}</div>}
    </div>
  );
});

const RouteMap = memo(function RouteMap({
  points,
  profile,
  highlightIdx,
  onHoverIdx,
  pinnedIdx,
  onPinIdx,
  climbs,
  height = 300,
  interactive = true,
  showKmMarkers = true,
  showLegend = true,
}: RouteMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const visible = useVisible(wrapRef);
  const mountMap = interactive || visible;

  const fullProfile = useMemo(() => {
    if (!profile || profile.d.length < 2) return null;
    if (profile.grade && profile.grade.length === profile.d.length) {
      return { d: profile.d, e: profile.e, grade: profile.grade };
    }
    return { d: profile.d, e: profile.e, grade: computeGrades(profile.d, profile.e) };
  }, [profile]);

  const cum = useMemo(() => cumulativeDistances(points), [points]);
  const draw = useMemo(() => buildDrawData(points, cum), [points, cum]);
  const distRatio = useMemo(() => {
    const totalCum = cum[cum.length - 1] ?? 0;
    const totalD = fullProfile?.d[fullProfile.d.length - 1] ?? 0;
    return totalCum > 0 && totalD > 0 ? totalCum / totalD : 1;
  }, [cum, fullProfile]);
  const segments = useMemo(() => buildSegments(draw, fullProfile, distRatio), [draw, fullProfile, distRatio]);
  const kmMarkers = useMemo(
    () => (showKmMarkers ? buildKmMarkers(points, cum) : []),
    [points, cum, showKmMarkers]
  );

  const draggingRef = useRef(false);
  const depsRef = useRef<InteractionDeps | null>(null);

  useLayoutEffect(() => {
    depsRef.current = {
      src: draw.src,
      coords: draw.coords,
      cum,
      distRatio,
      fullProfile,
      onHoverIdx,
      onPinIdx,
      pinnedIdx: pinnedIdx ?? null,
    };
  });

  if (points.length < 2) return null;

  const interactiveHover = interactive && (onHoverIdx != null || onPinIdx != null);
  const infoIdx = highlightIdx ?? pinnedIdx;

  return (
    <div ref={wrapRef} className="relative overflow-hidden" style={{ height }}>
      {mountMap ? (
        <MapContainer
          bounds={points}
          boundsOptions={{ padding: [26, 26] }}
          dragging={interactive}
          touchZoom={interactive}
          doubleClickZoom={interactive}
          boxZoom={interactive}
          keyboard={interactive}
          scrollWheelZoom={interactive}
          zoomControl={false}
          style={{ height: "100%", width: "100%", background: "#eef1ec" }}
          preferCanvas
        >
          <ZoomControl position="bottomright" />
          <TileLayer attribution={TILE_ATTR} url={TILE_URL} keepBuffer={3} updateWhenZooming={false} />
          <RouteLines draw={draw} segments={segments} />
          <Marker position={points[0]} icon={getIcons().start} interactive={false} keyboard={false} />
          <Marker position={points[points.length - 1]} icon={getIcons().finish} interactive={false} keyboard={false} />
          <KmMarkers markers={kmMarkers} />
          <HoverMarkers
            points={points}
            cum={cum}
            fullProfile={fullProfile}
            distRatio={distRatio}
            highlightIdx={highlightIdx ?? null}
            pinnedIdx={pinnedIdx ?? null}
          />
          {interactiveHover && <MapInteractions depsRef={depsRef} draggingRef={draggingRef} />}
          <Fitter points={points} />
        </MapContainer>
      ) : (
        <div className="h-full w-full bg-surface2" />
      )}

      <Legend show={showLegend} />
      <InfoCard fullProfile={fullProfile} idx={infoIdx ?? null} climbs={climbs} pinned={pinnedIdx != null} />
    </div>
  );
});

export default RouteMap;
