import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, MapPinned, CalendarClock, Trash2, Sparkles, Route as RouteIcon, RefreshCw, CheckCircle2, XCircle, Pencil } from "lucide-react";
import type { RecommendationDTO, SportDTO, TargetDTO } from "shared";
import { api, apiUpload } from "../lib/api";
import { Badge, Button, Card, ErrorText, Field, Input, Modal, PageHeader, Select, Textarea, cx } from "../components/ui";
import RouteMap from "../components/RouteMap";
import SportIcon from "../components/SportIcon";
import { daysUntil, fmtDate, fmtDistance, fmtDurationShort, fmtElevation, fmtNum } from "../lib/format";

export default function TargetsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<TargetDTO | null>(null);
  const [genStatus, setGenStatus] = useState<{
    targetId: string;
    phase: "pending" | "done" | "error";
    message?: string;
  } | null>(null);
  const { data: targets, isLoading } = useQuery({ queryKey: ["targets"], queryFn: () => api<TargetDTO[]>("/targets") });
  const { data: sports } = useQuery({ queryKey: ["sports"], queryFn: () => api<SportDTO[]>("/onboarding/sports") });

  const delMut = useMutation({
    mutationFn: (id: string) => api(`/targets/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["targets"] }),
  });

  const genMut = useMutation({
    mutationFn: (targetId: string) =>
      api<{ queued: boolean }>("/coach/generate", { method: "POST", json: { targetId } }),
    onMutate: (targetId) => setGenStatus({ targetId, phase: "pending" }),
    onSuccess: (_res, targetId) => startRegenPoll(targetId),
    onError: (err, targetId) =>
      setGenStatus({
        targetId,
        phase: "error",
        message: err instanceof Error ? err.message : "Gagal meminta rencana AI",
      }),
  });

  function startRegenPoll(targetId: string) {
    const start = Date.now();
    const poll = setInterval(async () => {
      try {
        const st = await api<{ pending: boolean }>("/coach/status");
        if (!st.pending) {
          clearInterval(poll);
          const recs = await api<RecommendationDTO[]>("/coach/recommendations");
          qc.invalidateQueries({ queryKey: ["plan"] });
          qc.invalidateQueries({ queryKey: ["recommendations"] });
          const latest = recs[0];
          if (latest && latest.status === "expired") {
            setGenStatus({ targetId, phase: "error", message: latest.summary ?? "Gagal menyusun rencana" });
          } else {
            setGenStatus({ targetId, phase: "done", message: "Rencana AI siap! Buka menu Rencana — kegiatan yang sudah selesai tetap dipertahankan." });
          }
          setTimeout(() => setGenStatus(null), 10_000);
        } else if (Date.now() - start > 240_000) {
          clearInterval(poll);
          setGenStatus({ targetId, phase: "error", message: "Waktu tunggu habis — pantau hasilnya di menu Pelatih AI." });
          setTimeout(() => setGenStatus(null), 10_000);
        }
      } catch {
        // biarkan polling lanjut
      }
    }, 4_000);
  }

  return (
    <>
      <PageHeader
        kicker="Tujuan Latihan"
        title="Target"
        sub="Tetapkan tujuan spesifik — event, rute GPX, atau kebugaran — dan AI menyusun rute menuju target."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={13} /> Target Baru
          </Button>
        }
      />

      {genStatus && (
        <div
          className={cx(
            "rise mb-4 flex items-center gap-3 rounded-xl border px-4 py-3",
            genStatus.phase === "error" ? "border-coral/40 bg-coral/8" : "border-volt/40 bg-volt/8"
          )}
        >
          {genStatus.phase === "pending" && <RefreshCw size={16} className="shrink-0 animate-spin text-volt" />}
          {genStatus.phase === "done" && <CheckCircle2 size={16} className="shrink-0 text-volt" />}
          {genStatus.phase === "error" && <XCircle size={16} className="shrink-0 text-coral" />}
          <div className="min-w-0">
            <div className={cx("text-sm font-semibold", genStatus.phase === "error" ? "text-coral" : "text-ink")}>
              {genStatus.phase === "pending" && "AI sedang menyusun rencana… biasanya 30–120 detik"}
              {genStatus.phase === "done" && "Rencana AI selesai disusun!"}
              {genStatus.phase === "error" && "Gagal menyusun rencana"}
            </div>
            {genStatus.message && <div className="mt-0.5 text-xs text-mute">{genStatus.message}</div>}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-10 text-center text-sm text-dim">Memuat…</div>
      ) : !targets || targets.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <MapPinned size={28} className="text-dim" />
          <p className="max-w-md text-sm text-mute">
            Belum ada target. Buat target manual (jarak/elevasi/tanggal) atau unggah GPX rute yang ingin kamu taklukkan.
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={13} /> Buat Target
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {targets.map((t, i) => {
            const dLeft = daysUntil(t.targetDate);
            const sport = sports?.find((s) => s.id === t.sportId);
            return (
              <Card key={t.id} className={cx("rise overflow-hidden", `d${Math.min(i + 1, 8)}`)}>
                {t.routeStats?.points && t.routeStats.points.length > 1 && (
                  <div className="relative">
                    <RouteMap points={t.routeStats.points} height={160} interactive={false} showKmMarkers={false} />
                    <button
                      onClick={() => navigate(`/targets/${t.id}/analysis`)}
                      className="absolute right-2 top-2 z-[500] rounded-lg border border-line2 bg-surface/90 p-1.5 text-mute backdrop-blur transition-colors hover:text-volt"
                      title="Buka analisis rute"
                    >
                      <RouteIcon size={14} />
                    </button>
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-volt/10 text-volt">
                        <SportIcon icon={sport?.icon ?? "activity"} size={17} />
                      </div>
                      <div>
                        <div className="font-display text-[15px] font-bold tracking-wide uppercase">{t.name}</div>
                        <div className="text-[11px] text-dim">{sport?.name ?? t.sportId} · {t.type === "route" ? "Rute GPX" : t.type === "event" ? "Event" : "Kebugaran"}</div>
                      </div>
                    </div>
                    {t.status === "active" ? <Badge tone="volt">Aktif</Badge> : <Badge>{t.status}</Badge>}
                  </div>

                  <div className="num mt-4 grid grid-cols-3 gap-2 text-[13px]">
                    <MetricCell label="Jarak" value={fmtDistance(t.routeStats?.distanceM ?? t.distanceM)} />
                    <MetricCell label="Elevasi" value={fmtElevation(t.routeStats?.elevationM ?? t.elevationM)} />
                    <MetricCell label="Durasi" value={t.durationS ? fmtDurationShort(t.durationS) : "—"} />
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-4">
                    <div className="flex items-center gap-2 text-xs text-dim">
                      <CalendarClock size={13} />
                      {t.targetDate ? (
                        <>
                          {fmtDate(t.targetDate)}
                          {dLeft != null && dLeft >= 0 && <span className="ml-1.5 font-semibold text-amber2">· H−{dLeft}</span>}
                          {dLeft != null && dLeft < 0 && <span className="ml-1.5">· terlewat</span>}
                        </>
                      ) : (
                        "Tanpa tanggal"
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/targets/${t.id}/analysis`)}
                        disabled={!t.routeStats}
                        className="text-mute hover:bg-surface2 hover:text-aqua"
                        title="Buka halaman analisis rute & persiapan"
                      >
                        <RouteIcon size={13} /> Analisis
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={(genMut.isPending && genMut.variables === t.id) || (genStatus?.phase === "pending" && genStatus.targetId === t.id)}
                        disabled={genStatus?.phase === "pending"}
                        onClick={() => genMut.mutate(t.id)}
                        title="Buat/atur ulang rencana AI untuk target ini"
                      >
                        <Sparkles size={12} /> Rencana AI
                      </Button>
                      <button
                        onClick={() => setEditingTarget(t)}
                        className="rounded-lg p-1.5 text-dim transition-colors hover:bg-surface2 hover:text-volt"
                        title="Ubah target"
                      >
                        <Pencil size={14} />
                      </button>
                      <Button size="sm" variant="ghost" onClick={() => delMut.mutate(t.id)} className="text-dim hover:text-coral">
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateTargetModal open={createOpen} onClose={() => setCreateOpen(false)} sports={sports ?? []} />

      <EditTargetModal
        target={editingTarget}
        sports={sports ?? []}
        onClose={() => setEditingTarget(null)}
        onSaved={(id) => {
          setEditingTarget(null);
          setGenStatus({ targetId: id, phase: "pending" });
          startRegenPoll(id);
        }}
      />
    </>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-[0.14em] text-dim">{label}</div>
      <div className="mt-0.5 font-semibold">{value}</div>
    </div>
  );
}

function CreateTargetModal({ open, onClose, sports }: { open: boolean; onClose: () => void; sports: SportDTO[] }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"manual" | "route">("manual");
  const [name, setName] = useState("");
  const [sportId, setSportId] = useState("ride");
  const [type, setType] = useState<"event" | "route" | "fitness">("event");
  const [targetDate, setTargetDate] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [elevation, setElevation] = useState("");
  const [durationH, setDurationH] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [routeFileId, setRouteFileId] = useState<string | null>(null);
  const [routeStats, setRouteStats] = useState<TargetDTO["routeStats"] | null>(null);

  const pollRoute = useQuery({
    queryKey: ["routeFile", routeFileId],
    queryFn: () => api<{ id: string; linkedActivityId: string | null }>(`/uploads/${routeFileId}`),
    enabled: Boolean(routeFileId),
    refetchInterval: 2500,
  });

  // setelah file rute diproses, ambil stats dari target — ambil via /targets setelah create? lebih mudah:
  // parse_route_file hanya update target. Jadi kita buat target dulu dengan fileId, lalu stats muncul setelah poll.
  const routeReady = routeFileId != null && pollRoute.data != null;

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "route");
      return apiUpload<{ id: string }>("/uploads", form);
    },
    onSuccess: (res) => {
      setRouteFileId(res.id);
      setType("route");
      setUploading(false);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Gagal unggah rute");
      setUploading(false);
    },
  });

  const createMut = useMutation({
    mutationFn: () =>
      api("/targets", {
        method: "POST",
        json: {
          sportId,
          name,
          type: mode === "route" ? "route" : type,
          targetDate: targetDate || null,
          distanceM: mode === "manual" && distanceKm ? Number(distanceKm) * 1000 : null,
          elevationM: mode === "manual" && elevation ? Number(elevation) : null,
          durationS: mode === "manual" && durationH ? Math.round(Number(durationH) * 3600) : null,
          fileId: mode === "route" ? routeFileId : null,
          description: description || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["targets"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Gagal membuat target"),
  });

  return (
    <Modal open={open} onClose={onClose} title="Target Baru" wide>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode("manual")}
          className={cx("rounded-xl border px-3 py-2.5 text-[12px] font-semibold transition-all", mode === "manual" ? "border-volt/50 bg-volt/10 text-volt" : "border-line2 bg-bg text-mute hover:text-ink")}
        >
          Input Manual
        </button>
        <button
          onClick={() => setMode("route")}
          className={cx("rounded-xl border px-3 py-2.5 text-[12px] font-semibold transition-all", mode === "route" ? "border-volt/50 bg-volt/10 text-volt" : "border-line2 bg-bg text-mute hover:text-ink")}
        >
          <RouteIcon size={13} className="mr-1 inline" /> Unggah GPX Rute
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama target">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Gran Fondo Jakarta 2026" />
        </Field>
        <Field label="Olahraga">
          <Select value={sportId} onChange={(e) => setSportId(e.target.value)}>
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {mode === "manual" && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Jenis target">
              <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                <option value="event">Event / Race</option>
                <option value="fitness">Kebugaran</option>
              </Select>
            </Field>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <Field label="Jarak (km)">
              <Input type="number" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} placeholder="mis. 100" />
            </Field>
            <Field label="Elevasi + (m)">
              <Input type="number" value={elevation} onChange={(e) => setElevation(e.target.value)} placeholder="mis. 1200" />
            </Field>
            <Field label="Durasi (jam)">
              <Input type="number" step="0.5" value={durationH} onChange={(e) => setDurationH(e.target.value)} placeholder="mis. 4" />
            </Field>
          </div>
        </>
      )}

      {mode === "route" && (
        <div className="mt-4">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line2 px-6 py-8 transition-colors hover:border-volt/50 hover:bg-volt/5"
          >
            <RouteIcon size={24} className="text-volt" />
            <span className="text-sm font-medium">{uploading ? "Mengunggah…" : "Pilih file GPX rute"}</span>
            <span className="text-[11px] text-dim">Jarak & elevasi otomatis dibaca dari rute</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".gpx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setUploading(true);
                uploadMut.mutate(f);
              }
            }}
          />
          {routeFileId && (
            <p className={cx("mt-3 rounded-lg px-3 py-2 text-xs", routeReady ? "border border-volt/30 bg-volt/10 text-volt" : "border border-line bg-surface2 text-mute")}>
              {routeReady ? "Rute terunggah. Statistik rute dihitung setelah target dibuat." : "Memproses rute…"}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Tanggal target" hint="AI menyusun tapering menuju tanggal ini — berlaku untuk semua mode, termasuk GPX.">
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Catatan (opsional)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detail tambahan untuk AI coach…" />
        </Field>
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Batal
        </Button>
        <Button disabled={!name || (mode === "route" && !routeFileId)} loading={createMut.isPending} onClick={() => createMut.mutate()}>
          <Sparkles size={13} /> Buat & Susun Rencana
        </Button>
      </div>
    </Modal>
  );
}

function EditTargetModal({
  target,
  sports,
  onClose,
  onSaved,
}: {
  target: TargetDTO | null;
  sports: SportDTO[];
  onClose: () => void;
  onSaved: (targetId: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [sportId, setSportId] = useState("ride");
  const [type, setType] = useState<"event" | "route" | "fitness">("event");
  const [targetDate, setTargetDate] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [elevation, setElevation] = useState("");
  const [durationH, setDurationH] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [replaceFileId, setReplaceFileId] = useState<string | null>(null);

  const loadedId = useRef<string | null>(null);
  if (target && loadedId.current !== target.id) {
    loadedId.current = target.id;
    setName(target.name);
    setSportId(target.sportId);
    setType(target.type);
    setTargetDate(target.targetDate ?? "");
    setDistanceKm(target.distanceM != null ? String(target.distanceM / 1000) : "");
    setElevation(target.elevationM != null ? String(target.elevationM) : "");
    setDurationH(target.durationS != null ? String(Math.round((target.durationS / 3600) * 100) / 100) : "");
    setDescription(target.description ?? "");
    setReplaceFileId(null);
    setError(null);
  }

  const editMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name,
        sportId,
        type,
        targetDate: targetDate || null,
        description: description || null,
      };
      if (type === "route") {
        if (replaceFileId) body.fileId = replaceFileId;
      } else {
        if (distanceKm) body.distanceM = Number(distanceKm) * 1000;
        if (elevation) body.elevationM = Number(elevation);
        if (durationH) body.durationS = Math.round(Number(durationH) * 3600);
      }
      return api(`/targets/${target!.id}`, { method: "PATCH", json: body });
    },
    onSuccess: () => {
      if (target) onSaved(target.id);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Gagal menyimpan perubahan"),
  });

  const replaceMut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "route");
      return apiUpload<{ id: string }>("/uploads", form);
    },
    onSuccess: (res) => {
      setReplaceFileId(res.id);
      setUploading(false);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Gagal unggah rute");
      setUploading(false);
    },
  });

  if (!target) return null;
  const rs = target.routeStats;

  return (
    <Modal open onClose={onClose} title="Ubah Target" wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama target">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Olahraga">
          <Select value={sportId} onChange={(e) => setSportId(e.target.value)}>
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Jenis target">
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="event">Event / Race</option>
            <option value="route">Rute GPX</option>
            <option value="fitness">Kebugaran</option>
          </Select>
        </Field>
        <Field label="Tanggal target" hint="UTC ISO — AI menyusun tapering menuju tanggal ini.">
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </Field>
      </div>

      {type === "route" ? (
        <div className="mt-4">
          <div className="num mb-3 flex flex-wrap gap-2 text-[12px]">
            {rs?.distanceM != null && <span className="rounded-lg border border-line bg-bg px-2.5 py-1.5">Jarak <b>{fmtDistance(rs.distanceM)}</b></span>}
            {rs?.elevationM != null && <span className="rounded-lg border border-line bg-bg px-2.5 py-1.5">Elevasi + <b>{fmtElevation(rs.elevationM)}</b></span>}
            {rs?.maxElevationM != null && <span className="rounded-lg border border-line bg-bg px-2.5 py-1.5">Maks <b>{fmtElevation(rs.maxElevationM)}</b></span>}
            {target.fileId && !rs && <span className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-mute">Rute lama menunggu dihitung ulang…</span>}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-line2 px-6 py-5 transition-colors hover:border-volt/50 hover:bg-volt/5"
          >
            <RouteIcon size={20} className="text-volt" />
            <span className="text-sm font-medium">{uploading ? "Mengunggah…" : replaceFileId ? "Rute baru terunggah ✓ — akan menggantikan rute lama" : "Ganti file GPX rute (opsional)"}</span>
            <span className="text-[11px] text-dim">{replaceFileId ? `ID: ${replaceFileId.slice(0, 8)}…` : "Biarkan kosong untuk memakai rute saat ini"}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".gpx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setUploading(true);
                replaceMut.mutate(f);
              }
            }}
          />
          {replaceFileId && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setReplaceFileId(null)}>
              Batalkan ganti — pakai rute lama
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-4">
          <Field label="Jarak (km)" hint="kosongkan bila tidak dilakukan perubahan">
            <Input type="number" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
          </Field>
          <Field label="Elevasi + (m)">
            <Input type="number" value={elevation} onChange={(e) => setElevation(e.target.value)} />
          </Field>
          <Field label="Durasi (jam)">
            <Input type="number" step="0.5" value={durationH} onChange={(e) => setDurationH(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="mt-4">
        <Field label="Catatan">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>

      <ErrorText>{error}</ErrorText>
      <p className="mt-3 rounded-lg border border-line bg-surface2 px-3 py-2 text-[11px] text-mute">
        Simpan akan otomatis memicu regenerasi rencana versi baru. Kegiatan yang sudah kamu lakukan (selesai/terlewat) tetap dipertahankan — hanya sesi ke depan yang diperbarui.
      </p>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Batal
        </Button>
        <Button disabled={!name} loading={editMut.isPending} onClick={() => editMut.mutate()}>
          Simpan &amp; Regenerasi Rencana
        </Button>
      </div>
    </Modal>
  );
}
