import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Check, X, RefreshCw, CalendarDays, HeartPulse, Info, PencilLine, Trash2, Sparkles, AlertTriangle } from "lucide-react";
import type { PlanSessionDTO, RecommendationDTO, SportDTO, TrainingPlanDTO, UserProfileDTO } from "shared";
import { api } from "../lib/api";
import { Badge, Button, Card, EmptyState, ErrorText, Field, Modal, PageHeader, Select, Spinner, Textarea, cx } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { ChevronRight } from "lucide-react";
import SportIcon from "../components/SportIcon";
import { dayLabel, fmtDate, fmtDateShort, fmtDistance, fmtDurationShort, fmtNum, WORKOUT_TYPE_LABEL } from "../lib/format";

const TYPE_TONE: Record<string, "volt" | "aqua" | "amber" | "coral" | "neutral"> = {
  intervals: "coral",
  tempo: "amber",
  race: "coral",
  test: "amber",
  long: "volt",
  endurance: "aqua",
  recovery: "neutral",
  strength: "aqua",
  flexibility: "neutral",
  rest: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  planned: "Terjadwal",
  completed: "Selesai",
  missed: "Terlewat",
  skipped: "Dilewati",
};

const CATEGORY_TONE: Record<string, string> = {
  cycling: "text-volt bg-volt/10",
  running: "text-aqua bg-aqua/10",
  swimming: "text-aqua bg-aqua/10",
  strength: "text-amber2 bg-amber2/10",
  flexibility: "text-[#a78bfa] bg-[#a78bfa]/10",
  other: "text-mute bg-surface2/60",
};

export default function PlanPage() {
  const qc = useQueryClient();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [skipFor, setSkipFor] = useState<PlanSessionDTO | null>(null);
  const [detailSession, setDetailSession] = useState<PlanSessionDTO | null>(null);
  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan"],
    queryFn: () => api<TrainingPlanDTO | null>("/plans/active"),
  });

  const { data: genStatus } = useQuery({
    queryKey: ["coach-status"],
    queryFn: () => api<{ pending: boolean }>("/coach/status"),
    refetchInterval: (q) => (q.state.data?.pending ? 5000 : false),
  });
  const generating = genStatus?.pending ?? false;

  const wasGenerating = useRef(false);
  useEffect(() => {
    if (generating) {
      wasGenerating.current = true;
    } else if (wasGenerating.current) {
      wasGenerating.current = false;
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    }
  }, [generating, qc]);

  const { data: recs } = useQuery({
    queryKey: ["recommendations"],
    queryFn: () => api<RecommendationDTO[]>("/coach/recommendations"),
    enabled: !isLoading && !plan && !generating,
  });
  const lastFailure = recs?.find(
    (r) =>
      r.status === "expired" &&
      r.summary?.startsWith("Gagal menyusun rencana") &&
      Date.now() - new Date(r.createdAt).getTime() < 30 * 60_000
  );

  const sessionMut = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string | null }) =>
      api(`/plans/sessions/${id}`, { method: "PATCH", json: { status, reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api<{ ok: boolean }>("/plans/active", { method: "DELETE" }),
    onSuccess: () => {
      setDeleteOpen(false);
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (isLoading) return <div className="p-10 text-center text-sm text-dim">Memuat rencana…</div>;

  if (!plan) {
    return (
      <>
        <PageHeader kicker="Rencana Latihan" title="Rencana" />
        {generating ? (
          <Card className="rise p-10 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-volt/30 bg-volt/10 text-volt">
              <Spinner size={22} />
            </div>
            <div className="font-display text-sm font-semibold uppercase tracking-wider">AI Coach sedang menyusun rencanamu…</div>
            <p className="mx-auto mt-2 max-w-sm text-sm text-dim">
              Coach sedang menghitung beban, pemulihan, dan jadwal untuk olahraga pilihanmu. Halaman ini akan diperbarui otomatis — biasanya
              kurang dari satu menit.
            </p>
          </Card>
        ) : (
          <>
            <EmptyState
              icon={<CalendarDays size={28} />}
              title="Belum ada rencana aktif"
              sub="Pilih olahraga yang ingin dilatih, lalu AI coach akan menyusun rencana latihan mingguan yang dipersonalisasi. Buat target agar rencana lebih terfokus."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button onClick={() => setGenOpen(true)}>
                    <Sparkles size={13} /> Susun Rencana
                  </Button>
                  <Link to="/targets">
                    <Button variant="outline">Buat Target</Button>
                  </Link>
                </div>
              }
            />
            {lastFailure && (
              <Card className="rise d1 mt-4 flex items-start gap-3 border-amber2/30 bg-amber2/5 p-4">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber2" />
                <div className="min-w-0 text-[12px]">
                  <div className="font-semibold text-amber2">Percobaan penyusunan terakhir gagal</div>
                  <p className="mt-0.5 text-mute">{lastFailure.summary}</p>
                  <p className="mt-1 text-dim">Coba tekan "Susun Rencana" lagi — kalau berulang, periksa konfigurasi AI provider di menu Admin.</p>
                </div>
              </Card>
            )}
          </>
        )}
        <GenerateModal open={genOpen} onClose={() => setGenOpen(false)} />
      </>
    );
  }

  const sessions = plan.sessions ?? [];
  const completed = sessions.filter((s) => s.status === "completed").length;
  const missed = sessions.filter((s) => s.status === "missed").length;
  const progress = sessions.length > 0 ? Math.round((completed / sessions.length) * 100) : 0;

  const byWeek = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const d = new Date(`${s.date}T00:00:00`);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - (day - 1));
    const week = d.toISOString().slice(0, 10);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week)!.push(s);
  }
  const weeks = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        kicker={`Rencana Aktif · Versi ${plan.version}`}
        title={plan.name}
        sub={plan.goalSummary}
        actions={
          <>
            <Button variant="outline" onClick={() => setFeedbackOpen(true)}>
              <HeartPulse size={13} /> Lapor Kondisi
            </Button>
            <Button variant="outline" onClick={() => setGenOpen(true)}>
              <RefreshCw size={13} /> Regenerasi
            </Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={13} /> Hapus
            </Button>
          </>
        }
      />

      {generating && (
        <Card className="rise mb-4 flex items-center gap-3 border-volt/30 bg-volt/5 p-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-volt/30 bg-volt/10 text-volt">
            <Spinner size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-volt">AI Coach sedang menyesuaikan rencana…</div>
            <div className="text-[11px] text-dim">
              Rencana baru akan menggantikan versi ini otomatis setelah selesai — sesi masa lalu yang sudah selesai tetap dipertahankan.
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="rise d1 p-4">
          <div className="label-tech">Progres</div>
          <div className="num mt-1 text-2xl font-semibold text-volt">{progress}%</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line2">
            <div className="h-full rounded-full bg-volt transition-all" style={{ width: `${progress}%` }} />
          </div>
        </Card>
        <Card className="rise d2 p-4">
          <div className="label-tech">Sesi</div>
          <div className="num mt-1 text-2xl font-semibold">{sessions.length}</div>
          <div className="mt-1 text-[11px] text-dim">{completed} selesai · {missed} terlewat</div>
        </Card>
        <Card className="rise d3 p-4">
          <div className="label-tech">Periode</div>
          <div className="num mt-1 text-sm font-semibold">{fmtDate(plan.startDate)} → {plan.endDate ? fmtDate(plan.endDate) : "…"}</div>
          {plan.weeklyHours && <div className="mt-1 text-[11px] text-dim">target ~{fmtNum(plan.weeklyHours, 1)} jam/minggu</div>}
        </Card>
        <Card className="rise d4 p-4">
          <div className="label-tech">Disusun oleh</div>
          <div className="mt-1 text-sm font-semibold text-aqua">{plan.providerName ?? "AI"}</div>
          <div className="mt-1 text-[11px] text-dim">model: {plan.name ? "" : ""}{plan.providerName ? "aktif" : ""}</div>
        </Card>
      </div>

      {plan.rationale && (
        <Card className="rise d5 mt-4 p-5">
          <div className="flex items-start gap-3">
            <Info size={16} className="mt-0.5 shrink-0 text-volt" />
            <div>
              <div className="label-tech mb-1.5 text-volt/90">Penjelasan Coach</div>
              <Markdown content={plan.rationale} />
              {plan.warnings?.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {plan.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-amber2">⚠ {w}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="mt-4 space-y-4">
        {weeks.map(([weekStart, weekSessions], wi) => (
          <Card key={weekStart} className={cx("rise p-3.5 md:p-5", `d${Math.min(wi + 5, 8)}`)}>
            <div className="mb-3 flex items-center justify-between">
              <div className="label-tech">
                Minggu {fmtDateShort(weekStart)}
                {weekStart === today && <span className="ml-2 text-volt">← minggu ini</span>}
              </div>
              <span className="num text-xs text-dim">
                TSS {fmtNum(weekSessions.reduce((a, s) => a + (s.tssPlanned ?? 0), 0))} ·{" "}
                {fmtDurationShort(weekSessions.reduce((a, s) => a + (s.durationPlannedS ?? 0), 0))}
              </span>
            </div>
            <div className="space-y-2">
              {weekSessions.map((s) => {
                const ended = s.status === "missed" || s.status === "skipped";
                return (
                <div
                  key={s.id}
                  className={cx(
                    "rounded-xl border px-3 py-3 transition-colors md:flex md:flex-wrap md:items-center md:gap-3 md:px-4",
                    s.status === "completed" && "border-volt/25 bg-volt/5",
                    s.status === "missed" && "border-coral/25 bg-coral/5 opacity-80",
                    s.status === "skipped" && "border-line bg-bg opacity-60",
                    s.status === "planned" && "border-line bg-bg hover:border-line2"
                  )}
                >
                  <div className="hidden w-20 shrink-0 md:block">
                    <div className="text-[10px] uppercase tracking-wider text-dim">{dayLabel(s.date)}</div>
                    <div className="num text-[13px] font-semibold">{fmtDateShort(s.date)}</div>
                  </div>
                  <div className="flex min-w-0 items-start gap-2.5 md:flex-1" onClick={() => setDetailSession(s)} title="Klik untuk detail lengkap">
                    <div className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line", CATEGORY_TONE[s.sportCategory ?? "other"])}>
                      <SportIcon icon={s.sportIcon ?? "activity"} size={16} />
                    </div>
                    <div className="min-w-0 flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className={cx("truncate text-[13px] font-medium", s.status === "completed" && "text-volt")}>{s.title}</span>
                        <Badge tone={TYPE_TONE[s.workoutType] ?? "neutral"}>{WORKOUT_TYPE_LABEL[s.workoutType] ?? s.workoutType}</Badge>
                        <ChevronRight size={14} className="ml-auto shrink-0 text-dim" />
                      </div>
                      <p className="num mt-0.5 truncate text-[11px] text-dim md:hidden">
                        {dayLabel(s.date)} · {fmtDateShort(s.date)}
                        {s.durationPlannedS ? ` · ${fmtDurationShort(s.durationPlannedS)}` : ""}
                        {s.distancePlannedM ? ` · ${fmtDistance(s.distancePlannedM)}` : ""}
                        {s.tssPlanned != null ? ` · TSS ${fmtNum(s.tssPlanned)}` : ""}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-dim">{s.description}</p>
                      {s.reason && (
                        <div className="mt-1 w-fit max-w-full truncate rounded border border-amber2/30 bg-amber2/10 px-2 py-0.5 text-[10px] text-amber2" title={s.reason}>
                          Alasan: {s.reason}
                        </div>
                      )}
                      {s.status === "completed" && s.actual && (
                        <Link
                          to={`/activities/${s.actual.activityId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 flex w-fit max-w-full items-center gap-1.5 truncate rounded border border-volt/25 bg-volt/10 px-2 py-0.5 text-[10px] text-volt transition-colors hover:bg-volt/20"
                          title={`Aktivitas: ${s.actual.name}`}
                        >
                          <Check size={11} className="shrink-0" />
                          <span className="truncate font-medium">{s.actual.name}</span>
                          {s.actual.durationS != null && <span className="num shrink-0">· {fmtDurationShort(s.actual.durationS)}</span>}
                          {s.actual.distanceM != null && <span className="num shrink-0">· {fmtDistance(s.actual.distanceM)}</span>}
                          {s.actual.tss != null && (
                            <span className="num shrink-0">
                              · TSS {fmtNum(s.actual.tss)}
                              {s.tssPlanned != null ? ` / ${fmtNum(s.tssPlanned)}` : ""}
                            </span>
                          )}
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="num hidden shrink-0 gap-3 text-[12px] text-mute md:flex">
                    {s.durationPlannedS && <span>{fmtDurationShort(s.durationPlannedS)}</span>}
                    {s.distancePlannedM && <span>{fmtDistance(s.distancePlannedM)}</span>}
                    {s.intensityTargets && <span className="text-amber2">{s.intensityTargets.join(", ")}</span>}
                    {s.tssPlanned != null && <span>TSS {fmtNum(s.tssPlanned)}</span>}
                  </div>
                  <div className="mt-2.5 flex items-center justify-end gap-1.5 border-t border-line/60 pt-2.5 md:mt-0 md:border-0 md:pt-0">
                    <Badge tone={s.status === "completed" ? "volt" : s.status === "missed" ? "coral" : s.status === "skipped" ? "neutral" : "aqua"}>
                      {STATUS_LABEL[s.status]}
                    </Badge>
                    {s.status === "planned" && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            sessionMut.mutate({ id: s.id, status: "completed" });
                          }}
                          className="flex h-8 items-center gap-1.5 rounded-md border border-volt/30 px-2.5 text-volt transition-colors hover:bg-volt/10"
                          title="Tandai selesai"
                        >
                          <Check size={13} />
                          <span className="font-display text-[10px] font-semibold uppercase tracking-wider">Selesai</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSkipFor(s);
                          }}
                          className="flex h-8 items-center gap-1.5 rounded-md border border-coral/30 px-2.5 text-coral transition-colors hover:bg-coral/10"
                          title="Terlewat / dilewati — tulis alasannya agar AI menyesuaikan"
                        >
                          <X size={13} />
                          <span className="font-display text-[10px] font-semibold uppercase tracking-wider">Lewat</span>
                        </button>
                      </>
                    )}
                    {ended && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSkipFor(s);
                        }}
                        className="flex h-8 items-center gap-1.5 rounded-md border border-amber2/40 px-2.5 text-amber2 transition-colors hover:bg-amber2/10"
                        title={s.reason ? "Perbarui alasan sesi ini" : "Tulis alasan sesi ini agar AI menyesuaikan"}
                      >
                        <PencilLine size={13} />
                        <span className="font-display text-[10px] font-semibold uppercase tracking-wider">{s.reason ? "Edit Alasan" : "Tulis Alasan"}</span>
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      <GenerateModal open={genOpen} onClose={() => setGenOpen(false)} />

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Hapus Rencana">
        <p className="text-sm text-mute">
          Rencana aktif <b className="font-semibold text-ink">{plan.name}</b> beserta seluruh sesi latihannya akan dihapus permanen. Riwayat
          aktivitas dan progres kebugaran tetap tersimpan.
        </p>
        <p className="mt-3 rounded-lg border border-amber2/30 bg-amber2/10 px-3 py-2 text-[11px] text-amber2">
          Setelah dihapus, kamu bisa langsung menyusun rencana baru dengan pilihan olahraga yang diinginkan.
        </p>
        <ErrorText>{deleteMut.error instanceof Error ? deleteMut.error.message : null}</ErrorText>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="w-full sm:w-auto" onClick={() => setDeleteOpen(false)}>
            Batal
          </Button>
          <Button variant="danger" className="w-full sm:w-auto" loading={deleteMut.isPending} onClick={() => deleteMut.mutate()}>
            <Trash2 size={13} /> Hapus Permanen
          </Button>
        </div>
      </Modal>

      <SessionDetailModal
        session={detailSession}
        busy={sessionMut.isPending}
        onClose={() => setDetailSession(null)}
        onComplete={(id) => {
          sessionMut.mutate({ id, status: "completed" });
          setDetailSession(null);
        }}
        onSkip={(s) => {
          setDetailSession(null);
          setSkipFor(s);
        }}
      />

      {skipFor && (
        <SkipModal
          key={skipFor.id}
          session={skipFor}
          busy={sessionMut.isPending}
          onClose={() => setSkipFor(null)}
          onSubmit={(status, reason) => {
            sessionMut.mutate({ id: skipFor.id, status, reason: reason || null });
            setSkipFor(null);
          }}
        />
      )}
    </>
  );
}

const QUICK_REASONS = [
  "Sakit / demam",
  "Kondisi tubuh tidak fit",
  "Tidak ada waktu",
  "Cuaca buruk",
  "Travel / luar kota",
  "Perangkat sepeda rusak",
];

function SkipModal({
  session,
  busy,
  onClose,
  onSubmit,
}: {
  session: PlanSessionDTO;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (status: "missed" | "skipped", reason: string | null) => void;
}) {
  const reasonMode = session.status === "missed" || session.status === "skipped";
  const [reason, setReason] = useState(session.reason ?? "");
  return (
    <Modal open onClose={onClose} title={reasonMode ? "Tulis Alasan" : `Lewati Sesi`}>
      <div className="mb-3 flex items-center gap-2 text-xs text-mute">
        <span className={cx("flex h-7 w-7 items-center justify-center rounded-lg border border-line", CATEGORY_TONE[session.sportCategory ?? "other"])}>
          <SportIcon icon={session.sportIcon ?? "activity"} size={14} />
        </span>
        <b className="font-semibold text-ink">{session.title}</b> · {session.sportName} · {fmtDateShort(session.date)} ·{" "}
        {WORKOUT_TYPE_LABEL[session.workoutType] ?? session.workoutType}
        {session.durationPlannedS ? ` · ${fmtDurationShort(session.durationPlannedS)}` : ""}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {QUICK_REASONS.map((r) => (
          <button
            key={r}
            onClick={() => setReason(reason === r ? "" : r)}
            className={cx(
              "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              reason === r ? "border-amber2/50 bg-amber2/10 text-amber2" : "border-line2 bg-bg text-mute hover:text-ink"
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <Field label="Alasan (tujuan)">
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="mis. demam dua hari, rencananya ada rapat mendadak… — penjelasan ini akan dibaca AI saat menyusun ulang rencana."
        />
      </Field>
      <p className="mt-3 rounded-lg border border-line bg-surface2 px-3 py-2 text-[11px] text-mute">
        Alasan tersimpan bersama sesi dan otomatis menyertai regenerasi rencana — AI akan menyesuaikan beban berdasarkan penyebabnya. Sesi yang selesai/terlewat lainnya tetap dipertahankan.
      </p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" className="w-full sm:w-auto" onClick={onClose}>
          Batal
        </Button>
        {reasonMode ? (
          <Button
            className="w-full sm:w-auto"
            loading={busy}
            disabled={!reason.trim()}
            onClick={() => onSubmit(session.status as "missed" | "skipped", reason.trim())}
          >
            Simpan Alasan
          </Button>
        ) : (
          <>
            <Button variant="outline" className="w-full sm:w-auto" disabled={!reason.trim()} onClick={() => onSubmit("skipped", reason.trim())}>
              Dilewati
            </Button>
            <Button variant="danger" className="w-full sm:w-auto" loading={busy} disabled={!reason.trim()} onClick={() => onSubmit("missed", reason.trim())}>
              Terlewatkan
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}

function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [fatigue, setFatigue] = useState(3);
  const [sleep, setSleep] = useState(3);
  const [soreness, setSoreness] = useState(2);
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      api("/coach/feedback", {
        method: "POST",
        json: {
          date: new Date().toISOString().slice(0, 10),
          fatigueLevel: fatigue,
          sleepQuality: sleep,
          soreness,
          availabilityHours: hours ? Number(hours) : null,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recommendations"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Gagal mengirim"),
  });

  return (
    <Modal open={open} onClose={onClose} title="Lapor Kondisi Hari Ini">
      <p className="mb-4 text-xs text-dim">
        AI coach akan memproses ulang rencana latihanmu secara otomatis berdasarkan kondisi ini.
      </p>
      <div className="space-y-4">
        <Field label={`Tingkat kelelahan: ${fatigue}/5`}>
          <input type="range" min={1} max={5} value={fatigue} onChange={(e) => setFatigue(Number(e.target.value))} className="w-full accent-volt" />
        </Field>
        <Field label={`Kualitas tidur: ${sleep}/5`}>
          <input type="range" min={1} max={5} value={sleep} onChange={(e) => setSleep(Number(e.target.value))} className="w-full accent-volt" />
        </Field>
        <Field label={`Nyeri/sakit otot: ${soreness}/5`}>
          <input type="range" min={1} max={5} value={soreness} onChange={(e) => setSoreness(Number(e.target.value))} className="w-full accent-volt" />
        </Field>
        <Field label="Jam tersedia untuk latihan hari ini">
          <Select value={hours} onChange={(e) => setHours(e.target.value)}>
            <option value="">Normal</option>
            <option value="0.5">± 30 menit</option>
            <option value="1">± 1 jam</option>
            <option value="2">± 2 jam</option>
            <option value="4">4 jam atau lebih</option>
          </Select>
        </Field>
        <Field label="Catatan">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="mis. kaki masih berat setelah kemarin, demam ringan, dst." />
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" className="w-full sm:w-auto" onClick={onClose}>
          Batal
        </Button>
        <Button loading={mut.isPending} className="w-full sm:w-auto" onClick={() => mut.mutate()}>
          Kirim & Minta Penyesuaian
        </Button>
      </div>
    </Modal>
  );
}

function GenerateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[] | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: allSports } = useQuery({
    queryKey: ["sports"],
    queryFn: () => api<SportDTO[]>("/onboarding/sports"),
    enabled: open,
  });
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<UserProfileDTO>("/auth/me"),
    enabled: open,
  });

  useEffect(() => {
    if (open && me && selected === null) {
      setSelected(me.sports.length > 0 ? me.sports : []);
    }
  }, [open, me, selected]);

  const mut = useMutation({
    mutationFn: () =>
      api<{ queued: boolean; message?: string }>("/plans/regenerate", {
        method: "POST",
        json: { sports: selected ?? [] },
      }),
    onSuccess: (res) => {
      if (res.message) {
        setInfo(res.message);
        return;
      }
      onClose();
      qc.invalidateQueries({ queryKey: ["coach-status"] });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["coach-status"] }), 60_000);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Gagal meminta penyusunan rencana"),
  });

  return (
    <Modal open={open} onClose={onClose} title={info ? "Regenerasi Berjalan" : "Susun Rencana Baru"}>
      {info ? (
        <>
          <p className="rounded-lg border border-aqua/30 bg-aqua/10 px-3 py-2 text-xs text-aqua">{info}</p>
          <p className="mt-3 text-xs text-dim">
            Rencana baru akan muncul otomatis setelah AI selesai menyusun — biasanya kurang dari satu menit.
          </p>
          <div className="mt-5 flex justify-end">
            <Button onClick={onClose}>Tutup</Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-4 text-xs text-dim">
            Pilih olahraga yang ingin dimasukkan AI coach ke dalam rencana. Sesi masa lalu yang sudah selesai atau terlewat tetap dipertahankan.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(allSports ?? []).map((s) => {
              const active = (selected ?? []).includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() =>
                    setSelected((prev) => {
                      const cur = prev ?? [];
                      return cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id];
                    })
                  }
                  className={cx(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[12px] font-medium transition-all",
                    active ? "border-volt/50 bg-volt/10 text-volt" : "border-line2 bg-bg text-mute hover:text-ink"
                  )}
                >
                  <SportIcon icon={s.icon} size={15} />
                  <span className="truncate">{s.name}</span>
                </button>
              );
            })}
          </div>
          {selected !== null && selected.length === 0 && (
            <p className="mt-2 text-[11px] text-amber2">Pilih minimal satu olahraga.</p>
          )}
          <ErrorText>{error}</ErrorText>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" className="w-full sm:w-auto" onClick={onClose}>
              Batal
            </Button>
            <Button
              className="w-full sm:w-auto"
              loading={mut.isPending}
              disabled={!selected || selected.length === 0}
              onClick={() => mut.mutate()}
            >
              <Sparkles size={13} /> Susun Rencana
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function SessionDetailModal({
  session,
  busy,
  onClose,
  onComplete,
  onSkip,
}: {
  session: PlanSessionDTO | null;
  busy?: boolean;
  onClose: () => void;
  onComplete: (id: string) => void;
  onSkip: (s: PlanSessionDTO) => void;
}) {
  if (!session) return null;
  const isPlanned = session.status === "planned";
  const hasActual = session.status === "completed" && session.actual != null;
  const cells: Array<[string, string]> = [
    ["Durasi", session.durationPlannedS ? fmtDurationShort(session.durationPlannedS) : "—"],
    ["Jarak", session.distancePlannedM ? fmtDistance(session.distancePlannedM) : "—"],
    ["TSS rencana", session.tssPlanned != null ? fmtNum(session.tssPlanned) : "—"],
    ["Intensitas", session.intensityTargets?.join(", ") || "—"],
  ];
  const comparison: Array<[string, string, string]> = hasActual
    ? [
        [
          "Durasi",
          session.durationPlannedS ? fmtDurationShort(session.durationPlannedS) : "—",
          session.actual!.durationS != null ? fmtDurationShort(session.actual!.durationS) : "—",
        ],
        [
          "Jarak",
          session.distancePlannedM ? fmtDistance(session.distancePlannedM) : "—",
          session.actual!.distanceM != null ? fmtDistance(session.actual!.distanceM) : "—",
        ],
        [
          "TSS",
          session.tssPlanned != null ? fmtNum(session.tssPlanned) : "—",
          session.actual!.tss != null ? fmtNum(session.actual!.tss) : "—",
        ],
      ]
    : [];
  return (
    <Modal open onClose={onClose} title={session.title} wide>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className={cx("flex h-9 w-9 items-center justify-center rounded-xl border border-line", CATEGORY_TONE[session.sportCategory ?? "other"])}>
          <SportIcon icon={session.sportIcon ?? "activity"} size={16} />
        </div>
        <div className="text-[13px] font-semibold">{session.sportName}</div>
        <span className="text-dim">·</span>
        <div className="text-[12px] text-mute">
          {dayLabel(session.date)}, {fmtDate(session.date)}
        </div>
        <Badge tone={session.status === "completed" ? "volt" : session.status === "missed" ? "coral" : session.status === "skipped" ? "neutral" : "aqua"}>
          {STATUS_LABEL[session.status]}
        </Badge>
        <Badge tone={TYPE_TONE[session.workoutType] ?? "neutral"}>{WORKOUT_TYPE_LABEL[session.workoutType] ?? session.workoutType}</Badge>
      </div>

      {hasActual ? (
        <div className="num mt-4 overflow-hidden rounded-lg border border-line">
          <div className="grid grid-cols-3 bg-surface2 px-3 py-1.5 text-[9px] uppercase tracking-[0.14em] text-dim">
            <div>Metrik</div>
            <div>Rencana</div>
            <div className="text-volt/80">Aktual</div>
          </div>
          {comparison.map(([label, planned, actual]) => (
            <div key={label} className="grid grid-cols-3 border-t border-line px-3 py-2 text-[13px]">
              <div className="text-mute">{label}</div>
              <div>{planned}</div>
              <div className="font-semibold text-volt">{actual}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="num mt-4 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
          {cells.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-line bg-bg px-3 py-2">
              <div className="text-[9px] uppercase tracking-[0.14em] text-dim">{label}</div>
              <div className="mt-0.5 font-semibold">{value}</div>
            </div>
          ))}
        </div>
      )}

      {session.actual && (
        <div className="mt-3">
          <Link
            to={`/activities/${session.actual.activityId}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-volt/30 bg-volt/10 px-3 py-1.5 text-[12px] font-medium text-volt transition-colors hover:bg-volt/20"
          >
            Lihat aktivitas: {session.actual.name} <ChevronRight size={13} />
          </Link>
        </div>
      )}

      <div className="mt-4">
        <div className="label-tech mb-2">Instruksi Sesi</div>
        <div className="rounded-xl border border-line bg-bg px-4 py-3">
          <Markdown content={session.description} />
        </div>
      </div>

      {session.reason && (
        <div className="mt-3 rounded-lg border border-amber2/30 bg-amber2/10 px-3 py-2 text-[12px] text-amber2">
          Alasan: {session.reason}
        </div>
      )}

      {isPlanned && (
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="danger" className="w-full sm:w-auto" onClick={() => onSkip(session)}>
            Terlewat / Dilewati…
          </Button>
          <Button loading={busy} className="w-full sm:w-auto" onClick={() => onComplete(session.id)}>
            <Check size={13} /> Tandai Selesai
          </Button>
        </div>
      )}
    </Modal>
  );
}
