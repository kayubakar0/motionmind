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

export function StreamChart({ series, metric, height = 260 }: { series: StreamSeries; metric: string; height?: number }) {
  const meta = STREAM_META[metric];
  if (!meta) return null;
  const values = (series as unknown as Record<string, number[] | null | undefined>)[metric] ?? null;
  if (!values || values.length === 0) return null;

  const data = series.time.map((t, i) => ({ t, v: values[i] ?? null }));

  return (
    <ResponsiveContainer width="100%" height={height}>
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
        <Line type="monotone" dataKey="v" name={meta.name} stroke={meta.color} strokeWidth={1.8} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
