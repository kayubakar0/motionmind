import { memo, useMemo } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LineChart,
} from "recharts";
import type { FitnessPoint, WeeklyVolume, ZoneDistribution, StreamSeries } from "shared";
import { fmtDateShort } from "../lib/format";

const AXIS = { stroke: "#5c6660", fontSize: 11, fontFamily: "IBM Plex Mono" } as const;
const GRID = "#1d2320";

const tooltipStyle = {
  backgroundColor: "#101312",
  border: "1px solid #2f3733",
  borderRadius: 12,
  fontSize: 12,
  fontFamily: "IBM Plex Mono",
} as const;

export function FitnessChart({ data, height = 280 }: { data: FitnessPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="ctlFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c9f24b" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#c9f24b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickFormatter={(v: string) => fmtDateShort(v)} minTickGap={40} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#8b968f" }} />
        <Area type="monotone" dataKey="ctl" name="Fitness (CTL)" stroke="#c9f24b" strokeWidth={2} fill="url(#ctlFill)" dot={false} />
        <Line type="monotone" dataKey="atl" name="Fatigue (ATL)" stroke="#4ad9f0" strokeWidth={1.6} dot={false} />
        <ReferenceLine y={0} stroke="#2f3733" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="tsb" name="Form (TSB)" stroke="#f0b64a" strokeWidth={1.4} strokeDasharray="5 4" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function WeeklyVolumeChart({ data, height = 280 }: { data: WeeklyVolume[]; height?: number }) {
  const palette = ["#c9f24b", "#4ad9f0", "#f0b64a", "#f0675a", "#a78bfa", "#34d399", "#f472b6"];
  const sports = new Set<string>();
  for (const w of data) for (const s of Object.keys(w.hoursBySport)) sports.add(s);
  const sportKeys = [...sports];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="weekStart" tick={AXIS} tickFormatter={(v: string) => fmtDateShort(v)} minTickGap={24} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} unit="j" />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: "#8b968f" }}
          formatter={(value: number, name: string) => [`${value?.toFixed?.(1) ?? value} jam`, name]}
        />
        {sportKeys.map((s, i) => (
          <Bar key={s} dataKey={(row: WeeklyVolume) => row.hoursBySport[s] ?? 0} name={s} stackId="vol" fill={palette[i % palette.length]} radius={i === sportKeys.length - 1 ? [4, 4, 0, 0] : undefined} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ZoneBars({ zones, refValue, unitLabel, height = 200 }: { zones: ZoneDistribution[]; refValue: string[]; unitLabel: string; height?: number }) {
  const data = zones.map((z) => ({
    name: `Z${z.zone}`,
    menit: Math.round((z.seconds / 60) * 10) / 10,
    label: refValue[z.zone - 1] != null ? `${refValue[z.zone - 1]}` : `Z${z.zone}`,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} unit={unitLabel} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} menit`, "Waktu"]} />
        <Bar dataKey="menit" fill="#4ad9f0" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const STREAM_META: Record<string, { color: string; name: string; unit: string }> = {
  watts: { color: "#c9f24b", name: "Power", unit: "W" },
  heartrate: { color: "#f0675a", name: "Heart Rate", unit: "bpm" },
  altitude: { color: "#4ad9f0", name: "Elevasi", unit: "m" },
  velocity: { color: "#f0b64a", name: "Kecepatan", unit: "m/s" },
  cadence: { color: "#a78bfa", name: "Kadens", unit: "rpm" },
};

const STREAM_MAX_POINTS = 512;

type StreamPoint = { t: number; v: number | null };

function decimateStream(time: number[], values: Array<number | null | undefined>): StreamPoint[] {
  const n = Math.min(time.length, values.length);
  if (n === 0) return [];
  if (n <= STREAM_MAX_POINTS) {
    return values.slice(0, n).map((v, i) => ({ t: time[i], v: v ?? null }));
  }
  const bucket = Math.ceil(n / STREAM_MAX_POINTS);
  const out: StreamPoint[] = [];
  for (let start = 0; start < n; start += bucket) {
    const end = Math.min(start + bucket, n);
    const sv = values[start];
    if (sv != null) out.push({ t: time[start], v: sv });
    let minI = -1;
    let maxI = -1;
    let minV = Infinity;
    let maxV = -Infinity;
    for (let i = start; i < end; i++) {
      const v = values[i];
      if (v == null) continue;
      if (v < minV) {
        minV = v;
        minI = i;
      }
      if (v > maxV) {
        maxV = v;
        maxI = i;
      }
    }
    if (minI < 0) {
      if (out.length === 0 || out[out.length - 1].v !== null) out.push({ t: time[start], v: null });
      continue;
    }
    const a = Math.min(minI, maxI);
    const b = Math.max(minI, maxI);
    if (a === b) {
      out.push({ t: time[minI], v: minV });
    } else {
      if (out.length === 0 || out[out.length - 1].t !== time[a]) {
        out.push({ t: time[a], v: values[a] ?? null });
      }
      out.push({ t: time[b], v: values[b] ?? null });
    }
  }
  return out;
}

export const StreamChart = memo(function StreamChart({
  series,
  metric,
  height = 260,
}: {
  series: StreamSeries;
  metric: string;
  height?: number;
}) {
  const meta = STREAM_META[metric];
  const data = useMemo<StreamPoint[] | null>(() => {
    const values = (series as unknown as Record<string, number[] | null | undefined>)[metric] ?? null;
    if (!values || values.length === 0 || series.time.length === 0) return null;
    return decimateStream(series.time, values);
  }, [series, metric]);

  if (!meta || !data) return null;

  return (
    <ResponsiveContainer width="100%" height={height} debounce={100}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="t"
          tick={AXIS}
          axisLine={{ stroke: GRID }}
          tickLine={false}
          tickFormatter={(t: number) => {
            const h = Math.floor(t / 3600);
            const m = Math.floor((t % 3600) / 60);
            return h > 0 ? `${h}j${String(m).padStart(2, "0")}` : `${m}m`;
          }}
          minTickGap={60}
        />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={52} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(t: number) => `Menit ${Math.floor(Number(t) / 60)}:${String(Math.floor(Number(t) % 60)).padStart(2, "0")}`}
          formatter={(v: number) => [`${v?.toFixed?.(1) ?? v} ${meta.unit}`, meta.name]}
        />
        <Line type="monotone" dataKey="v" name={meta.name} stroke={meta.color} strokeWidth={1.8} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
});
