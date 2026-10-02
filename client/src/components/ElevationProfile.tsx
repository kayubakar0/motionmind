import { useMemo, useRef, useState } from "react";
import { GRADE_LEGEND, computeGrades, gradeColor, type ProfileData } from "../lib/geo";

interface Props {
  profile: { d: number[]; e: number[]; grade?: number[] };
  highlightIdx?: number | null;
  onHoverIdx?: (idx: number | null) => void;
  pinnedIdx?: number | null;
  onPinIdx?: (idx: number | null) => void;
  height?: number;
}

export default function ElevationProfile({ profile: raw, highlightIdx, onHoverIdx, pinnedIdx, onPinIdx, height = 170 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [localIdx, setLocalIdx] = useState<number | null>(null);

  const profile = useMemo<ProfileData>(() => {
    if (raw.grade && raw.grade.length === raw.d.length) {
      return raw as ProfileData;
    }
    return { d: raw.d, e: raw.e, grade: computeGrades(raw.d, raw.e) };
  }, [raw]);

  const H = 100;
  const N = profile.d.length;

  const geom = useMemo(() => {
    const minE = Math.min(...profile.e);
    const maxE = Math.max(...profile.e);
    const span = Math.max(20, maxE - minE);
    const pad = span * 0.12;
    const lo = Math.max(0, minE - pad);
    const hi = maxE + pad;
    const totalD = profile.d[N - 1] || 1;
    const x = (i: number) => (profile.d[i] / totalD) * 1000;
    const y = (v: number) => H - ((v - lo) / (hi - lo)) * (H - 8) - 4;
    return { minE, maxE, lo, hi, totalD, x, y };
  }, [profile, N]);

  const areaPath = useMemo(() => {
    let path = `M 0 ${H}`;
    for (let i = 0; i < N; i++) path += ` L ${geom.x(i).toFixed(2)} ${geom.y(profile.e[i]).toFixed(2)}`;
    path += ` L 1000 ${H} Z`;
    return path;
  }, [geom, profile, N]);

  const linePath = useMemo(() => {
    let path = "";
    for (let i = 0; i < N; i++) {
      path += `${i === 0 ? "M" : "L"} ${geom.x(i).toFixed(2)} ${geom.y(profile.e[i]).toFixed(2)} `;
    }
    return path;
  }, [geom, profile, N]);

  const gradeStrip = useMemo(() => {
    const rects: Array<{ x: number; w: number; color: string }> = [];
    for (let i = 1; i < N; i++) {
      const x0 = geom.x(i - 1);
      const x1 = geom.x(i);
      const color = gradeColor(profile.grade[i]);
      const prev = rects[rects.length - 1];
      if (prev && prev.color === color) prev.w = x1 - prev.x;
      else rects.push({ x: x0, w: x1 - x0, color });
    }
    return rects;
  }, [geom, profile, N]);

  const activeIdx = localIdx ?? (highlightIdx != null && highlightIdx < N ? highlightIdx : null);
  const showPinned = pinnedIdx != null && pinnedIdx < N && pinnedIdx !== activeIdx;

  function handleMove(clientX: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const idx = Math.round(frac * (N - 1));
    setLocalIdx(idx);
    onHoverIdx?.(idx);
  }

  function handleLeave() {
    setLocalIdx(null);
    onHoverIdx?.(null);
  }

  function handleClick(e: React.MouseEvent) {
    if (!onPinIdx) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(frac * (N - 1));
    onPinIdx(idx === (pinnedIdx ?? -1) ? null : idx);
  }

  const active = activeIdx != null ? activeIdx : null;

  return (
    <div
      ref={wrapRef}
      className="relative w-full select-none"
      style={{ height }}
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseLeave={handleLeave}
      onClick={handleClick}
      title="Klik untuk pin titik ini"
    >
      <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="h-full w-full">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={1000} y1={H * f} y2={H * f} stroke="#1d2320" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={areaPath} fill="rgba(201,242,75,0.10)" />
        {showPinned && (
          <>
            <line
              x1={geom.x(pinnedIdx as number)}
              x2={geom.x(pinnedIdx as number)}
              y1={0}
              y2={H - 7}
              stroke="#c9f24b"
              strokeWidth={1}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={geom.x(pinnedIdx as number)}
              cy={geom.y(profile.e[pinnedIdx as number])}
              r={3.5}
              fill="#c9f24b"
              stroke="#090b0a"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
        {gradeStrip.map((r, i) => (
          <rect key={i} x={r.x} y={H - 7} width={Math.max(0.5, r.w)} height={7} fill={r.color} />
        ))}
        <path d={linePath} fill="none" stroke="#c9f24b" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        {active != null && (
          <>
            <line
              x1={geom.x(active)}
              x2={geom.x(active)}
              y1={0}
              y2={H - 7}
              stroke="#e9efe9"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={geom.x(active)}
              cy={geom.y(profile.e[active])}
              r={4.5}
              fill="#ffffff"
              stroke="#090b0a"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      <div className="pointer-events-none absolute right-1.5 top-1 text-right">
        <span className="num rounded bg-bg/70 px-1.5 py-0.5 text-[10px] text-mute">
          max {Math.round(geom.maxE)} m
        </span>
      </div>
      <div className="pointer-events-none absolute inset-x-1.5 bottom-8 flex justify-between">
        <span className="num text-[10px] text-dim">0 km</span>
        <span className="num text-[10px] text-dim">{(geom.totalD / 2000).toFixed(1)} km</span>
      </div>

      {active != null && wrapRef.current && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line2 bg-surface px-2.5 py-1.5 shadow-xl"
          style={{
            left: `${Math.min(88, Math.max(12, (geom.x(active) / 1000) * 100))}%`,
            top: 4,
          }}
        >
          <div className="num text-[11px] font-semibold text-ink">
            {(profile.d[active] / 1000).toFixed(1)} km · {Math.round(profile.e[active])} m
          </div>
          <div className="num text-[10px]" style={{ color: gradeColor(profile.grade[active]) }}>
            gradien {profile.grade[active] > 0 ? "+" : ""}
            {profile.grade[active].toFixed(1)}%
          </div>
        </div>
      )}
    </div>
  );
}

export function GradeLegend({ compact }: { compact?: boolean }) {
  const items = compact ? GRADE_LEGEND.slice(1) : GRADE_LEGEND;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((g) => (
        <span key={g.label} className="flex items-center gap-1.5 text-[10px] text-dim">
          <span className="h-1.5 w-3 rounded-full" style={{ background: g.color }} />
          {g.label}
        </span>
      ))}
    </div>
  );
}
