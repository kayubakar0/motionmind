import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Mountain, Pencil, RefreshCw, Trash2 } from "lucide-react";
import type { RouteAnalysisDTO, SavedRouteDTO } from "shared";
import { SERVER_URL, api } from "../lib/api";
import { Button, Card, EmptyState, PageHeader, Spinner, cx } from "../components/ui";
import RouteMap from "../components/RouteMap";
import ElevationProfile from "../components/ElevationProfile";
import { EstimateCards, InsightCards, PrepCards, RouteStatCell } from "../components/RouteAnalysisCards";
import { EditRouteModal } from "../components/RouteModals";
import { fmtDateTime, fmtDistance, fmtElevation } from "../lib/format";

export default function RouteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  useEffect(() => {
    setHoverIdx(null);
    setPinnedIdx(null);
  }, [id]);
  const activeIdx = hoverIdx ?? pinnedIdx;

  const { data: route, isLoading, error } = useQuery({
    queryKey: ["route", id],
    queryFn: () => api<SavedRouteDTO>(`/routes/${id}`),
    refetchInterval: (q) => (q.state.data && !q.state.data.routeStats ? 2500 : false),
  });

  const processing = Boolean(route && !route.routeStats && route.fileId);

  const { data: a, isLoading: loadingA, error: errA } = useQuery({
    queryKey: ["routeAnalysis", id],
    queryFn: () => api<RouteAnalysisDTO>(`/routes/${id}/analysis`),
    enabled: Boolean(route?.routeStats),
    staleTime: 60_000,
  });

  const delMut = useMutation({
    mutationFn: () => api(`/routes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routes"] });
      navigate("/routes");
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size={26} className="text-volt" />
      </div>
    );
  }

  if (error || !route) {
    return (
      <>
        <div className="mb-4">
          <Link to="/routes" className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-volt">
            <ArrowLeft size={13} /> Kembali ke Rute Saya
          </Link>
        </div>
        <EmptyState title="Rute tidak ditemukan" sub="Rute mungkin sudah dihapus." />
      </>
    );
  }

  const rs = route.routeStats;
  const hasProfile = rs?.profile && rs.profile.d.length > 2;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Link to="/routes" className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-volt">
          <ArrowLeft size={13} /> Kembali ke Rute Saya
        </Link>
        <div className="flex items-center gap-1.5">
          {route.fileId && (
            <Button size="sm" variant="ghost" className="text-mute hover:bg-surface2 hover:text-aqua" title="Unduh file asli">
              <a href={`${SERVER_URL}/api/v1/routes/${route.id}/file`} download className="inline-flex items-center gap-1.5">
                <Download size={13} /> File
              </a>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil size={12} /> Ubah
          </Button>
          <Button size="sm" variant="ghost" loading={delMut.isPending} onClick={() => delMut.mutate()} className="text-dim hover:text-coral" title="Hapus rute">
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      <PageHeader
        kicker="Pustaka Rute"
        title={route.name}
        sub={route.description ?? route.filename ?? "Rute tersimpan di pustaka pribadimu."}
      />

      {processing && (
        <div className="rise mb-4 flex items-center gap-3 rounded-xl border border-amber2/40 bg-amber2/8 px-4 py-3">
          <RefreshCw size={16} className="shrink-0 animate-spin text-amber2" />
          <div className="text-sm">
            <span className="font-semibold text-amber2">Memproses file rute…</span>
            <span className="ml-2 text-mute">Peta & analisis muncul otomatis beberapa detik setelah ini.</span>
          </div>
        </div>
      )}

      {!rs ? (
        !processing && (
          <EmptyState
            icon={<Mountain size={28} />}
            title="Data rute belum tersedia"
            sub="Rute ini belum memiliki file sumber yang terparse. Unggah file GPX/TCX/FIT melalui tombol Ubah."
          />
        )
      ) : (
        <div className="space-y-4">
          <Card className="rise d1 p-1.5">
            {rs.points && rs.points.length > 1 ? (
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
            ) : (
              <div className="p-8 text-center text-sm text-dim">Rute tidak memiliki titik GPS yang bisa digambar.</div>
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
              <div className="mt-3 space-y-1 border-t border-line pt-3 text-[11px] text-dim">
                {route.filename && <div>File: <span className="text-mute">{route.filename}</span></div>}
                <div>Disimpan: <span className="text-mute">{fmtDateTime(route.createdAt)}</span></div>
              </div>
            </Card>
          </div>
        </div>
      )}

      <EstimateCards a={a ?? null} loading={processing || loadingA} err={errA} estimateTitle="Estimasi Waktu Tempuh" />
      {a && (
        <>
          <InsightCards a={a} />
          <PrepCards a={a} />
        </>
      )}

      <EditRouteModal
        route={editOpen ? route : null}
        onClose={() => setEditOpen(false)}
      />
    </>
  );
}
