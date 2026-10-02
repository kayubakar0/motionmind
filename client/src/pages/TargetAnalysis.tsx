import { memo, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { ArrowLeft, Mountain } from "lucide-react";
import type { RouteAnalysisDTO, TargetDTO } from "shared";
import { api } from "../lib/api";
import { Card, EmptyState, PageHeader, Spinner, cx } from "../components/ui";
import RouteMap from "../components/RouteMap";
import ElevationProfile from "../components/ElevationProfile";
import { fmtDistance, fmtDurationShort, fmtElevation, fmtNum } from "../lib/format";

const GRADE_BAR_COLORS = ["#67d26b", "#c9f24b", "#f0b64a", "#f0675a"];

const AnalysisCards = memo(function AnalysisCards({ a, loading, err }: { a: RouteAnalysisDTO | null; loading: boolean; err: unknown }) {
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-5">
      <div className="lg:col-span-3">
        {loading || !a ? (
          <Card className="flex min-h-40 items-center justify-center gap-2 p-6 text-sm text-dim">
            {loading ? (
              <>
                <Spinner size={16} className="text-volt" /> Menganalisis rute & data atletmu…
              </>
            ) : (
              (err instanceof Error ? err.message : "Analisis tidak tersedia")
            )}
          </Card>
        ) : (
          <Card className="rise d4 p-4">
            <div className="label-tech mb-3">Estimasi Event</div>
            <div className="num grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
              <Cell label="Estimasi Selesai" value={fmtDurationShort(a.estimate.durationS)} />
              <Cell label="Kecepatan" value={`${a.estimate.speedKmh.toLocaleString("id-ID")} km/j`} />
              <Cell label="TSS Event" value={fmtNum(a.estimate.tss)} />
              <Cell
                label={a.estimate.targetPowerW ? "Power Perlu" : "Basis"}
                value={a.estimate.targetPowerW ? `${a.estimate.targetPowerW} W` : a.estimate.basis === "history" ? "Kecepatanmu" : "Default"}
              />
            </div>
            <div
              className={cx(
                "mt-3 rounded-xl border px-4 py-3 text-[13px]",
                a.estimate.severity === "hard" && "border-coral/40 bg-coral/8",
                a.estimate.severity === "warn" && "border-amber2/40 bg-amber2/8",
                a.estimate.severity === "ok" && "border-volt/35 bg-volt/8"
              )}
            >
              <span
                className={cx(
                  "font-semibold",
                  a.estimate.severity === "hard" ? "text-coral" : a.estimate.severity === "warn" ? "text-amber2" : "text-volt"
                )}
              >
                {a.estimate.pctFtp != null ? `Butuh rata-rata ±${a.estimate.pctFtp}% FTP — ` : ""}
              </span>
              {a.estimate.feasibility}
            </div>
          </Card>
        )}
      </div>

      <div className="lg:col-span-2">
        {a && (
          <Card className="rise d5 p-4">
            <div className="label-tech mb-3">Data Historis · 90 Hari</div>
            <div className="num grid grid-cols-2 gap-2 text-[13px]">
              <Cell label="Sesi" value={fmtNum(a.athlete.historySessions)} />
              <Cell label="Total Jam" value={`${a.athlete.historyHours.toLocaleString("id-ID")} j`} />
              <Cell label="Speed Rata" value={a.athlete.historyAvgSpeedKmh ? `${a.athlete.historyAvgSpeedKmh.toLocaleString("id-ID")} km/j` : "—"} />
              <Cell label="Terjauh" value={a.athlete.historyLongestKm ? `${a.athlete.historyLongestKm.toLocaleString("id-ID")} km` : "—"} />
              {a.athlete.best20mPower && <Cell label="Best 20m" value={`${a.athlete.best20mPower} W`} />}
              {a.athlete.ftp && <Cell label="FTP" value={`${a.athlete.ftp} W`} />}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
});

const InsightCards = memo(function InsightCards({ a }: { a: RouteAnalysisDTO }) {
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-5">
      <Card className="rise d6 p-4 lg:col-span-3">
        <div className="label-tech mb-3">Distribusi Gradien</div>
        <div className="flex h-5 w-full overflow-hidden rounded-lg border border-line">
          {a.gradeDistribution.map((gd, i) => {
            const pct = a.route.distanceKm > 0 ? (gd.km / a.route.distanceKm) * 100 : 0;
            if (pct <= 0.5) return null;
            return <div key={gd.label} style={{ width: `${pct}%`, background: GRADE_BAR_COLORS[i] }} title={`${gd.label}: ${gd.km.toLocaleString("id-ID")} km`} />;
          })}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          {a.gradeDistribution.map((gd, i) => (
            <div key={gd.label} className="flex items-center justify-between text-[11px] text-mute">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-3 rounded-full" style={{ background: GRADE_BAR_COLORS[i] }} />
                {gd.label}
              </span>
              <span className="num">{gd.km.toLocaleString("id-ID")} km</span>
            </div>
          ))}
        </div>
      </Card>

      {a.climbs.length > 0 && (
        <Card className="rise d7 p-4 lg:col-span-2">
          <div className="label-tech mb-3 flex items-center gap-2">
            <Mountain size={14} /> Tanjakan Kunci
          </div>
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="bg-surface2 text-[10px] uppercase tracking-wider text-dim">
                  <th className="px-3 py-2">Mulai</th>
                  <th className="px-3 py-2">Panjang</th>
                  <th className="px-3 py-2">Elevasi</th>
                  <th className="px-3 py-2">Gradien</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {a.climbs.map((c, i) => (
                  <tr key={i}>
                    <td className="num px-3 py-2">km {c.startKm.toLocaleString("id-ID")}</td>
                    <td className="num px-3 py-2">{c.lengthKm.toLocaleString("id-ID")} km</td>
                    <td className="num px-3 py-2">{fmtElevation(c.gainM)}</td>
                    <td className="num px-3 py-2 font-semibold" style={{ color: c.avgGradePct >= 6 ? "#f0675a" : c.avgGradePct >= 3 ? "#f0b64a" : "#c9f24b" }}>
                      +{c.avgGradePct.toLocaleString("id-ID")}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
});

const PrepCards = memo(function PrepCards({ a }: { a: RouteAnalysisDTO }) {
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-5">
      <Card className="rise d8 p-4 lg:col-span-3">
        <div className="label-tech mb-3">Fokus Persiapan</div>
        <ul className="space-y-2">
          {a.focus.map((f, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-ink/90">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-volt" />
              {f}
            </li>
          ))}
        </ul>
      </Card>

      {a.notes.length > 0 && (
        <Card className="rise p-4 lg:col-span-2">
          <div className="label-tech mb-2">Kelengkapan Data</div>
          {a.notes.map((n, i) => (
            <p key={i} className={cx("text-[11px] leading-relaxed text-dim", i > 0 && "mt-1.5")}>
              ℹ {n}
            </p>
          ))}
        </Card>
      )}
    </div>
  );
});

export default function TargetAnalysisPage() {
  const { id } = useParams();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  useEffect(() => {
    setHoverIdx(null);
    setPinnedIdx(null);
  }, [id]);
  const activeIdx = hoverIdx ?? pinnedIdx;

  const { data: target, isLoading, error } = useQuery({
    queryKey: ["target", id],
    queryFn: () => api<TargetDTO>(`/targets/${id}`),
  });
  const { data: a, isLoading: loadingA, error: errA } = useQuery({
    queryKey: ["targetAnalysis", id],
    queryFn: () => api<RouteAnalysisDTO>(`/targets/${id}/analysis`),
    enabled: Boolean(target),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size={26} className="text-volt" />
      </div>
    );
  }

  if (error || !target) {
    return (
      <>
        <div className="mb-4">
          <Link to="/targets" className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-volt">
            <ArrowLeft size={13} /> Kembali ke Target
          </Link>
        </div>
        <EmptyState title="Target tidak ditemukan" sub="Target mungkin sudah dihapus." />
      </>
    );
  }

  const rs = target.routeStats;
  const hasProfile = rs?.profile && rs.profile.d.length > 2;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Link to="/targets" className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-volt">
          <ArrowLeft size={13} /> Kembali ke Target
        </Link>
      </div>

      <PageHeader
        kicker="Analisis Rute & Persiapan"
        title={target.name}
        sub="Perkiraan performa, tanjakan kunci, dan fokus latihan — dihitung dari rute GPX + data historismu."
      />

      {!rs ? (
        <EmptyState
          icon={<Mountain size={28} />}
          title="Rute belum tersedia"
          sub="Target ini belum memiliki file GPX rute yang terparse. Unggah GPX rute melalui Edit Target."
        />
      ) : (
        <div className="space-y-4">
          <Card className="rise d1 p-1.5">
            {rs.points && rs.points.length > 1 && (
              <>
                <div className="mb-1 flex items-center justify-between px-2.5 pt-1.5">
                  <span className="label-tech">Rute &amp; Gradien</span>
                  <span className="text-[10px] text-dim">Warna garis = gradien (legend di peta) · klik titik untuk baca &amp; pin</span>
                </div>
                <RouteMap
                  points={rs.points}
                  profile={rs.profile ?? null}
                  highlightIdx={activeIdx}
                  onHoverIdx={setHoverIdx}
                  pinnedIdx={pinnedIdx}
                  onPinIdx={setPinnedIdx}
                  climbs={a?.climbs ?? null}
                  height={500}
                />
              </>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-5">
            {hasProfile && (
              <Card className="rise d2 p-4 lg:col-span-3">
                <div className="label-tech mb-2">Profil Elevasi</div>
                <ElevationProfile
                  profile={rs.profile!}
                  height={160}
                  highlightIdx={activeIdx}
                  onHoverIdx={setHoverIdx}
                  pinnedIdx={pinnedIdx}
                  onPinIdx={setPinnedIdx}
                />
              </Card>
            )}
            <Card className={cx("rise d3 p-4", hasProfile && "lg:col-span-2")}>
              <div className="label-tech mb-3">Rute</div>
              <div className="num grid grid-cols-2 gap-2 text-[13px]">
                <Cell label="Jarak" value={fmtDistance(rs.distanceM)} />
                <Cell label="Elevasi +" value={fmtElevation(rs.elevationM)} />
                <Cell label="Elevasi Maks" value={rs.maxElevationM != null ? fmtElevation(rs.maxElevationM) : "—"} />
                <Cell label="Elevasi Min" value={rs.minElevationM != null ? fmtElevation(rs.minElevationM) : "—"} />
              </div>
            </Card>
          </div>
        </div>
      )}

      <AnalysisCards a={a ?? null} loading={loadingA} err={errA} />
      {a && (
        <>
          <InsightCards a={a} />
          <PrepCards a={a} />
        </>
      )}
    </>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-[0.14em] text-dim">{label}</div>
      <div className="mt-0.5 font-semibold">{value}</div>
    </div>
  );
}
