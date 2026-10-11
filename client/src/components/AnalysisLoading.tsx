import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { cx } from "./ui";

const STAGES = [
  "Membaca data stream aktivitas…",
  "Menghitung metrik, zona & tanjakan…",
  "Membandingkan dengan riwayat & kebugaran…",
  "AI menyusun analisis mendalam…",
];

const WAVE =
  "M0,74 L28,74 L36,58 L44,88 L52,42 L60,74 L92,74 L100,62 L108,82 L120,36 L130,74 L162,74 L174,58 L186,84 L202,30 L216,74 L244,74 L254,64 L266,78 L280,46 L294,74 L332,74 L344,52 L356,88 L370,26 L382,74 L412,74 L422,66 L434,80 L448,42 L460,74 L502,74 L514,60 L526,82 L540,50 L550,74 L560,74";

const VERTICAL_GRID = [40, 80, 120, 160, 200, 240, 280, 320, 360, 400, 440, 480, 520];

const EQ_HEIGHTS = [12, 24, 16, 32, 20, 38, 14, 28, 42, 18, 34, 15, 26, 40, 17, 30, 22, 36, 13, 28, 44, 20, 32, 16, 25, 37];

export default function AnalysisLoading() {
  const [stage, setStage] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t1 = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 3400);
    const t2 = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-bg">
      <div className="relative">
        <svg viewBox="0 0 560 128" className="block h-32 w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="analysis-scan-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#c9f24b" stopOpacity="0" />
              <stop offset="70%" stopColor="#c9f24b" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#c9f24b" stopOpacity="0.6" />
            </linearGradient>
          </defs>
          {[26, 50, 74, 98].map((y) => (
            <line key={y} x1="0" y1={y} x2="560" y2={y} stroke="#242a27" strokeWidth="1" />
          ))}
          {VERTICAL_GRID.map((x) => (
            <line key={x} x1={x} y1="8" x2={x} y2="120" stroke="#242a27" strokeWidth="1" strokeDasharray="2 8" />
          ))}
          <path
            d={WAVE}
            fill="none"
            stroke="#4ad9f0"
            strokeOpacity="0.25"
            strokeWidth="1.5"
            strokeLinejoin="round"
            pathLength={1}
            className="analysis-trace analysis-trace-echo"
          />
          <path
            d={WAVE}
            fill="none"
            stroke="#c9f24b"
            strokeWidth="2"
            strokeLinejoin="round"
            pathLength={1}
            className="analysis-trace"
          />
          <g className="analysis-scan">
            <rect x="-26" y="0" width="26" height="128" fill="url(#analysis-scan-grad)" />
          </g>
        </svg>
        <div className="absolute right-3 top-3 flex items-center gap-2.5">
          <span className="relative flex h-7 w-7 items-center justify-center">
            <span className="analysis-ring absolute inset-0 rounded-full border border-volt/50" />
            <span className="analysis-ring absolute inset-0 rounded-full border border-volt/30 [animation-delay:1.1s]" />
            <Sparkles size={13} className="text-volt" />
          </span>
          <span className="num text-[11px] text-mute">
            {mm}:{ss}
          </span>
        </div>
      </div>

      <div className="flex h-11 items-end justify-center gap-[3px] border-t border-line bg-surface2/30 px-4 py-2">
        {EQ_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className="analysis-eq w-[3px] rounded-sm bg-volt/70"
            style={{
              height: h,
              animationDelay: `${(i % 9) * 0.09}s`,
              animationDuration: `${0.75 + (i % 5) * 0.13}s`,
            }}
          />
        ))}
      </div>

      <div className="space-y-2.5 border-t border-line px-5 py-4">
        {STAGES.map((label, i) => (
          <div key={label} className="flex items-center gap-2.5 text-[12px]">
            {i < stage ? (
              <Check size={13} className="shrink-0 text-aqua" />
            ) : i === stage ? (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-volt" />
              </span>
            ) : (
              <span className="h-2 w-2 shrink-0 rounded-full border border-line2" />
            )}
            <span className={cx(i === stage ? "text-ink" : i < stage ? "text-mute" : "text-dim")}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
