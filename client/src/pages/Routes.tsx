import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, MapPinned, Trash2, Route as RouteIcon, Pencil, ChevronRight, FileWarning } from "lucide-react";

import type { SavedRouteDTO, SportDTO } from "shared";
import { api } from "../lib/api";
import { Badge, Button, Card, EmptyState, PageHeader, cx } from "../components/ui";
import SportIcon from "../components/SportIcon";
import { CreateRouteModal, EditRouteModal } from "../components/RouteModals";
import { RouteStatCell } from "../components/RouteAnalysisCards";
import { fmtDate, fmtDistance, fmtElevation } from "../lib/format";

export default function RoutesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<SavedRouteDTO | null>(null);

  const { data: routes, isLoading } = useQuery({ queryKey: ["routes"], queryFn: () => api<SavedRouteDTO[]>("/routes") });
  const { data: sports } = useQuery({ queryKey: ["sports"], queryFn: () => api<SportDTO[]>("/onboarding/sports") });

  const delMut = useMutation({
    mutationFn: (id: string) => api(`/routes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["routes"] }),
  });

  return (
    <>
      <PageHeader
        kicker="Pustaka Rute"
        title="Rute Saya"
        sub="Simpan koleksi file rute (GPX/TCX/FIT) — jarak, elevasi, tanjakan kunci, dan estimasi performa otomatis dianalisis."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={13} /> Unggah Rute
          </Button>
        }
      />

      {isLoading ? (
        <div className="p-10 text-center text-sm text-dim">Memuat…</div>
      ) : !routes || routes.length === 0 ? (
        <EmptyState
          icon={<MapPinned size={28} />}
          title="Belum ada rute tersimpan"
          sub="Unggah file rute GPX/TCX/FIT untuk membangun pustaka rute pribadimu. Setiap rute otomatis dianalisis: profil elevasi, gradien, dan estimasi waktu."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={13} /> Unggah Rute Pertama
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {routes.map((r, i) => {
            const sport = sports?.find((s) => s.id === r.sportId);
            const processing = !r.routeStats && Boolean(r.fileId);
            return (
              <Card key={r.id} className={cx("rise overflow-hidden", `d${Math.min(i + 1, 8)}`)}>
                <button onClick={() => navigate(`/routes/${r.id}`)} className="block w-full p-5 text-left" title="Buka detail rute">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-volt/10 text-volt">
                        <SportIcon icon={sport?.icon ?? "activity"} size={17} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-display truncate text-[15px] font-bold tracking-wide uppercase">{r.name}</div>
                        <div className="truncate text-[11px] text-dim">
                          {sport?.name ?? r.sportId}
                          {r.filename && <> · {r.filename}</>}
                        </div>
                      </div>
                    </div>
                    {processing ? (
                      <Badge tone="amber">Diproses…</Badge>
                    ) : !r.fileId ? (
                      <Badge>
                        <FileWarning size={10} /> Tanpa File
                      </Badge>
                    ) : (
                      <Badge tone="volt">Siap</Badge>
                    )}
                  </div>

                  <div className="num mt-4 grid grid-cols-3 gap-2 text-[13px]">
                    <RouteStatCell label="Jarak" value={fmtDistance(r.routeStats?.distanceM ?? r.distanceM)} />
                    <RouteStatCell label="Elevasi +" value={fmtElevation(r.routeStats?.elevationM ?? r.elevationM)} />
                    <RouteStatCell label="Disimpan" value={fmtDate(r.createdAt)} />
                  </div>

                  {r.description && <p className="mt-3 line-clamp-2 text-xs text-mute">{r.description}</p>}
                </button>

                <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
                  <button
                    onClick={() => navigate(`/routes/${r.id}`)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-aqua transition-colors hover:text-volt"
                  >
                    Buka & Analisis <ChevronRight size={13} />
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setEditingRoute(r)}
                      className="rounded-lg p-1.5 text-dim transition-colors hover:bg-surface2 hover:text-volt"
                      title="Ubah rute"
                    >
                      <Pencil size={14} />
                    </button>
                    <Button size="sm" variant="ghost" onClick={() => delMut.mutate(r.id)} className="text-dim hover:text-coral" title="Hapus rute">
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateRouteModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => navigate(`/routes/${id}`)}
      />

      <EditRouteModal route={editingRoute} onClose={() => setEditingRoute(null)} />
    </>
  );
}
