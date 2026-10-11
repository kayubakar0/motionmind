import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { ArrowLeft, Mountain } from "lucide-react";
import type { RouteAnalysisDTO, TargetDTO } from "shared";
import { api } from "../lib/api";
import { Card, EmptyState, PageHeader, Spinner, cx } from "../components/ui";
import RouteMap from "../components/RouteMap";
import ElevationProfile from "../components/ElevationProfile";
import { EstimateCards, InsightCards, PrepCards, RouteStatCell } from "../components/RouteAnalysisCards";
import { fmtDistance, fmtElevation } from "../lib/format";

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
                <RouteStatCell label="Jarak" value={fmtDistance(rs.distanceM)} />
                <RouteStatCell label="Elevasi +" value={fmtElevation(rs.elevationM)} />
                <RouteStatCell label="Elevasi Maks" value={rs.maxElevationM != null ? fmtElevation(rs.maxElevationM) : "—"} />
                <RouteStatCell label="Elevasi Min" value={rs.minElevationM != null ? fmtElevation(rs.minElevationM) : "—"} />
              </div>
            </Card>
          </div>
        </div>
      )}

      <EstimateCards a={a ?? null} loading={loadingA} err={errA} />
      {a && (
        <>
          <InsightCards a={a} />
          <PrepCards a={a} />
        </>
      )}
    </>
  );
}
