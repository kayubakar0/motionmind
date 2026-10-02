import { useRef, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, ChevronLeft, ChevronRight, CloudUpload, ArrowUpToLine, Trash2 } from "lucide-react";
import type { SportDTO } from "shared";
import { api, apiUpload } from "../lib/api";
import { Badge, Button, Card, ErrorText, Field, Modal, PageHeader, Select, cx } from "../components/ui";
import SportIcon from "../components/SportIcon";
import { fmtDateShort, fmtDistance, fmtDurationShort, fmtElevation, fmtNum } from "../lib/format";

interface ActivityRow {
  id: string;
  sportId: string;
  sportName: string;
  source: string;
  name: string;
  startDate: string;
  distanceM: number | null;
  movingTimeS: number | null;
  elapsedTimeS: number | null;
  totalElevationGainM: number | null;
  avgPower: number | null;
  avgHr: number | null;
  tss: number | null;
  pushedToStrava?: boolean;
}

interface SportRow {
  id: string;
  name: string;
  icon: string;
}

export default function ActivitiesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [sportId, setSportId] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: sports } = useQuery({ queryKey: ["sports"], queryFn: () => api<SportRow[]>("/onboarding/sports") });
  const { data, isLoading } = useQuery({
    queryKey: ["activities", page, sportId],
    queryFn: () =>
      api<{ items: ActivityRow[]; total: number; pageSize: number }>(
        `/activities?page=${page}&pageSize=25${sportId ? `&sportId=${sportId}` : ""}`
      ),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const delMut = useMutation({
    mutationFn: (id: string) => api(`/activities/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => alert(err instanceof Error ? err.message : "Gagal menghapus aktivitas"),
  });

  function confirmDelete(name: string, id: string) {
    if (window.confirm(`Hapus "${name}"? Data aktivitas, stream, dan metriknya akan dihapus permanen.`)) {
      delMut.mutate(id);
    }
  }

  return (
    <>
      <PageHeader
        kicker="Riwayat Latihan"
        title="Aktivitas"
        sub="Semua aktivitas dari Strava, unggahan file, dan input manual."
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <Upload size={13} /> Unggah File
          </Button>
        }
      />

      <Card className="rise d1 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-dim">
            <CloudUpload size={14} className="text-volt" />
            GPX · TCX · FIT — diproses otomatis menjadi data performa
          </div>
          <Select value={sportId} onChange={(e) => { setSportId(e.target.value); setPage(1); }} className="w-52">
            <option value="">Semua olahraga</option>
            {(sports ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-sm text-dim">Memuat…</div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <CloudUpload size={28} className="text-dim" />
            <p className="text-sm text-mute">Belum ada aktivitas. Hubungkan Strava di Pengaturan atau unggah file GPX.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-[0.14em] text-dim">
                  <th className="px-4 py-3 font-semibold">Tanggal</th>
                  <th className="px-4 py-3 font-semibold">Aktivitas</th>
                  <th className="px-4 py-3 font-semibold">Jarak</th>
                  <th className="px-4 py-3 font-semibold">Durasi</th>
                  <th className="px-4 py-3 font-semibold">Elevasi</th>
                  <th className="px-4 py-3 font-semibold">Power/HR</th>
                  <th className="px-4 py-3 font-semibold">TSS</th>
                  <th className="px-4 py-3 font-semibold">Sumber</th>
                  <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {data.items.map((a) => (
                  <tr key={a.id} className="group transition-colors hover:bg-surface2/60">
                    <td className="num px-4 py-3 whitespace-nowrap text-mute">{fmtDateShort(a.startDate)}</td>
                    <td className="max-w-[260px] px-4 py-3">
                      <Link to={`/activities/${a.id}`} className="flex items-center gap-2 font-medium group-hover:text-volt">
                        <SportIcon icon={iconOf(sports, a.sportId)} size={14} className="text-dim" />
                        <span className="truncate">{a.name}</span>
                      </Link>
                    </td>
                    <td className="num px-4 py-3 whitespace-nowrap">{fmtDistance(a.distanceM)}</td>
                    <td className="num px-4 py-3 whitespace-nowrap">{fmtDurationShort(a.movingTimeS ?? a.elapsedTimeS)}</td>
                    <td className="num px-4 py-3 whitespace-nowrap">{fmtElevation(a.totalElevationGainM)}</td>
                    <td className="num px-4 py-3 whitespace-nowrap">
                      {a.avgPower ? `${fmtNum(a.avgPower)} W` : a.avgHr ? `${fmtNum(a.avgHr)} bpm` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cx("num rounded-md px-2 py-0.5", (a.tss ?? 0) > 0 ? "bg-volt/10 text-volt" : "text-dim")}>
                        {a.tss != null ? fmtNum(a.tss, 1) : "…"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Badge tone={a.source === "strava" ? "amber" : a.source === "upload" ? "aqua" : "neutral"}>
                          {a.source === "strava" ? "Strava" : a.source === "upload" ? "File" : "Manual"}
                        </Badge>
                        {a.pushedToStrava && (
                          <span title="Tersinkron ke Strava">
                            <ArrowUpToLine size={12} className="text-volt" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => confirmDelete(a.name, a.id)}
                        disabled={delMut.isPending}
                        className="rounded-md p-1.5 text-dim transition-colors hover:bg-coral/10 hover:text-coral disabled:opacity-40"
                        title="Hapus aktivitas"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-dim">
          <span>
            Halaman {page} dari {totalPages} · {data?.total ?? 0} aktivitas
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={14} />
            </Button>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      </Card>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} sports={sports ?? []} onDone={() => qc.invalidateQueries({ queryKey: ["activities"] })} />
    </>
  );
}

function iconOf(sports: SportRow[] | undefined, sportId: string): string {
  return sports?.find((s) => s.id === sportId)?.icon ?? "activity";
}

function UploadModal({
  open,
  onClose,
  sports,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  sports: SportRow[];
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"activity" | "route">("activity");
  const [sportId, setSportId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [queued, setQueued] = useState(false);

  const mut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      if (kind === "activity" && sportId) form.append("sportId", sportId);
      return apiUpload<{ id: string; kind: string }>("/uploads", form);
    },
    onSuccess: (res) => {
      setQueued(true);
      onDone();
      setTimeout(() => {
        setQueued(false);
        onClose();
      }, 2500);
      void res;
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Gagal unggah"),
  });

  return (
    <Modal open={open} onClose={onClose} title="Unggah File Aktivitas">
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(["activity", "route"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cx(
              "rounded-xl border px-3 py-2.5 text-[12px] font-semibold transition-all",
              kind === k ? "border-volt/50 bg-volt/10 text-volt" : "border-line2 bg-bg text-mute hover:text-ink"
            )}
          >
            {k === "activity" ? "Data Aktivitas" : "Rute GPX (untuk Target)"}
          </button>
        ))}
      </div>

      {kind === "activity" && (
        <Field label="Olahraga (opsional)" hint="Jika kosong, sistem menebak otomatis dari isi file.">
          <Select value={sportId} onChange={(e) => setSportId(e.target.value)}>
            <option value="">Deteksi otomatis</option>
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <button
        onClick={() => fileRef.current?.click()}
        className={cx(
          "mt-4 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 transition-colors",
          "border-line2 hover:border-volt/50 hover:bg-volt/5"
        )}
      >
        <CloudUpload size={26} className="text-volt" />
        <span className="text-sm font-medium">{uploading ? "Mengunggah…" : "Klik untuk pilih file"}</span>
        <span className="text-[11px] text-dim">GPX · TCX · FIT — maksimal 30 MB</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".gpx,.tcx,.fit"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) mut.mutate(f);
        }}
      />

      {queued && (
        <p className="mt-3 rounded-lg border border-volt/30 bg-volt/10 px-3 py-2 text-xs text-volt">
          File terunggah dan sedang diproses di background. Aktivitas akan muncul otomatis.
        </p>
      )}
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}
