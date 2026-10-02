import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpToLine } from "lucide-react";
import type { ActivityDetail, StreamSeries, ZoneDistribution } from "shared";
import { api } from "../lib/api";
import { Badge, Button, Card, PageHeader, Stat, cx } from "../components/ui";
import { StreamChart, ZoneBars } from "../components/Charts";
import RouteMap from "../components/RouteMap";
import ElevationProfile, { GradeLegend } from "../components/ElevationProfile";
import { buildProfileFromStreams } from "../lib/geo";
import { fmtDate, fmtDistance, fmtDuration, fmtElevation, fmtNum, fmtPace } from "../lib/format";

interface DetailResponse extends ActivityDetail {
  sportIcon?: string;
  metrics: {
    normalizedPower: number | null;
    intensityFactor: number | null;
    tss: number | null;
    hrTss: number | null;
    tssMethod: string | null;
    avgPaceSecPerKm: number | null;
    timeInPowerZones: ZoneDistribution[] | null;
    timeInHrZones: ZoneDistribution[] | null;
    powerCurve: Record<string, number> | null;
  } | null;
  streams: StreamSeries | null;
}

const METRICS_TABS = [
  { key: "watts", label: "Power" },
  { key: "heartrate", label: "Heart Rate" },
  { key: "altitude", label: "Elevasi" },
  { key: "velocity", label: "Kecepatan" },
  { key: "cadence", label: "Kadens" },
];

export default function ActivityDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState("heartrate");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  const activeIdx = hoverIdx ?? pinnedIdx;
  const { data: a, isLoading } = useQuery({
    queryKey: ["activity", id],
    queryFn: () => api<DetailResponse>(`/activities/${id}?withStreams=1`),
  });

  const streamRec = (a?.streams ?? null) as unknown as Record<string, number[] | null | undefined> | null;
  const availableTabs = useMemo(
    () => (streamRec ? METRICS_TABS.filter((t) => streamRec[t.key]?.length) : []),
    [streamRec]
  );

  const geoProfile = useMemo(
    () =>
      a?.streams
        ? buildProfileFromStreams({
            altitude: a.streams.altitude ?? null,
            distance: a.streams.distance ?? null,
            latlng: a.streams.latlng ?? null,
          })
        : null,
    [a?.streams]
  );

  const mapProfile = useMemo(
    () => (geoProfile ? { d: geoProfile.d, e: geoProfile.e } : null),
    [geoProfile]
  );

  useEffect(() => {
    setHoverIdx(null);
    setPinnedIdx(null);
  }, [a?.id]);

  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.some((t) => t.key === tab)) {
      setTab(availableTabs[0].key);
    }
  }, [availableTabs, tab]);

  const profileStats = useMemo(() => {
    if (!geoProfile) return null;
    const maxGrade = Math.max(...geoProfile.grade.map((g) => Math.abs(g)));
    const climbD = geoProfile.d.reduce((acc, d, i) => (geoProfile.grade[i] > 3 && i > 0 ? acc + (d - geoProfile.d[i - 1]) : acc), 0);
    return {
      maxGrade: maxGrade.toFixed(1),
      climbPct: Math.round((climbD / (geoProfile.d[geoProfile.d.length - 1] || 1)) * 100),
    };
  }, [geoProfile]);

  const pushMut = useMutation({
    mutationFn: () => api(`/activities/${id}/push-strava`, { method: "POST" }),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ["activity", id] }), 4000),
  });

  if (isLoading || !a) {
    return <div className="p-10 text-center text-sm text-dim">Memuat aktivitas…</div>;
  }

  return (
    <>
      <div className="mb-4">
        <Link to="/activities" className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-volt">
          <ArrowLeft size={13} /> Kembali ke Aktivitas
        </Link>
      </div>

      <PageHeader
        kicker={`${a.sportName} · ${fmtDate(a.startDate)}`}
        title={a.name}
        actions={
          !a.pushedToStrava && a.source !== "strava" ? (
            <Button variant="outline" loading={pushMut.isPending} onClick={() => pushMut.mutate()}>
              <ArrowUpToLine size={13} /> Kirim ke Strava
            </Button>
          ) : a.pushedToStrava ? (
            <Badge tone="volt">Tersinkron Strava</Badge>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat className="rise d1" label="Jarak" value={fmtDistance(a.distanceM)} />
        <Stat className="rise d2" label="Durasi" value={fmtDuration(a.movingTimeS ?? a.elapsedTimeS)} />
        <Stat className="rise d3" label="Elevasi +" value={fmtElevation(a.totalElevationGainM)} tone="aqua" />
        <Stat
          className="rise d4"
          label="TSS"
          value={a.metrics?.tss != null ? fmtNum(a.metrics.tss, 1) : "…"}
          tone="volt"
          hint={a.metrics?.tssMethod ? `metode: ${a.metrics.tssMethod}` : "dihitung di background"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {a.streams?.latlng && a.streams.latlng.length > 1 && (
        <Card className="rise d5 overflow-hidden p-1.5">
          <RouteMap
            points={a.streams.latlng}
            profile={mapProfile}
            highlightIdx={activeIdx}
            onHoverIdx={setHoverIdx}
            pinnedIdx={pinnedIdx}
            onPinIdx={setPinnedIdx}
            height={340}
          />
        </Card>
      )}

      <Card className={cx("rise d6 p-5", !(a.streams?.latlng && a.streams.latlng.length > 1) && "lg:col-span-2")}>
          {availableTabs.length > 0 ? (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {availableTabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={cx(
                      "rounded-lg px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-wider transition-colors",
                      tab === t.key ? "bg-volt/12 text-volt border border-volt/25" : "text-mute hover:bg-surface2 border border-transparent"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <StreamChart series={a.streams!} metric={tab} />
            </>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-dim">Tidak ada data stream untuk aktivitas ini.</div>
          )}
        </Card>
      </div>

      {geoProfile && profileStats && (
        <Card className="rise d7 mt-4 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="label-tech">Profil Elevasi &amp; Gradien</div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="num flex gap-4 text-[12px]">
                <span className="text-mute">
                  Jarak <b className="text-ink">{fmtDistance(geoProfile.d[geoProfile.d.length - 1])}</b>
                </span>
                <span className="text-mute">
                  Elevasi + <b className="text-ink">{fmtElevation(a.totalElevationGainM)}</b>
                </span>
                <span className="text-mute">
                  Gradien maks <b className="text-coral">{profileStats.maxGrade}%</b>
                </span>
                <span className="text-mute">
                  Tanjakan <b className="text-amber2">{profileStats.climbPct}%</b>
                </span>
              </div>
            </div>
          </div>
          <ElevationProfile
            profile={geoProfile}
            height={170}
            highlightIdx={activeIdx}
            onHoverIdx={setHoverIdx}
            pinnedIdx={pinnedIdx}
            onPinIdx={setPinnedIdx}
          />
          <div className="mt-3 border-t border-line pt-3">
            <GradeLegend />
          </div>
        </Card>
      )}

      {a.metrics && (a.metrics.timeInPowerZones || a.metrics.timeInHrZones) && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {a.metrics.timeInPowerZones && (
            <Card className="rise d7 p-5">
              <div className="label-tech mb-2">Distribusi Zona Power</div>
              <ZoneBars zones={a.metrics.timeInPowerZones} refValue={["<55%", "55–75%", "75–90%", "90–105%", "105–120%", "120–150%", ">150%"]} unitLabel="m" />
            </Card>
          )}
          {a.metrics.timeInHrZones && (
            <Card className={cx("rise d8 p-5", !a.metrics.timeInPowerZones && "lg:col-span-2")}>
              <div className="label-tech mb-2">Distribusi Zona Heart Rate</div>
              <ZoneBars zones={a.metrics.timeInHrZones} refValue={["50–60%", "60–70%", "70–80%", "80–90%", ">90%"]} unitLabel="m" />
            </Card>
          )}
        </div>
      )}

      <Card className="mt-4 rise p-5">
        <div className="label-tech mb-3">Metrik Performa</div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <MiniMetric label="Normalized Power" value={a.metrics?.normalizedPower ? `${fmtNum(a.metrics.normalizedPower)} W` : "—"} />
          <MiniMetric label="Intensity Factor" value={a.metrics?.intensityFactor ? fmtNum(a.metrics.intensityFactor, 2) : "—"} />
          <MiniMetric label="hrTSS" value={a.metrics?.hrTss != null ? fmtNum(a.metrics.hrTss, 1) : "—"} />
          <MiniMetric label="Pace" value={fmtPace(a.metrics?.avgPaceSecPerKm ?? null)} />
          <MiniMetric label="Avg HR" value={a.avgHr ? `${fmtNum(a.avgHr)} bpm` : "—"} />
          <MiniMetric label="Avg Power" value={a.avgPower ? `${fmtNum(a.avgPower)} W` : "—"} />
        </div>
        {a.metrics?.powerCurve && Object.keys(a.metrics.powerCurve).length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <div className="label-tech mb-2">Power Curve (best efforts)</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(a.metrics.powerCurve).map(([w, p]) => (
                <div key={w} className="rounded-lg border border-line bg-bg px-3 py-1.5">
                  <span className="text-[10px] text-dim">{w}s</span>
                  <span className="num ml-2 text-[13px] font-semibold text-volt">{fmtNum(p)} W</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-dim">{label}</div>
      <div className="num mt-1 text-[15px] font-semibold">{value}</div>
    </div>
  );
}
