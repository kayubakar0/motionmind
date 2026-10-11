import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Sparkles,
  History,
  CheckCircle2,
  CircleDashed,
  SendHorizonal,
  MessageSquareText,
  XCircle,
  ChevronDown,
  Plus,
  Archive,
  ArchiveRestore,
  Trash2,
  PanelLeft,
} from "lucide-react";
import type { CoachChatMessageDTO, CoachSessionDTO, RecommendationDTO, RecommendationsHistoryPageDTO } from "shared";
import { api } from "../lib/api";
import { Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, Textarea, cx } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { fmtDateShort, fmtDateTime, fmtNum, TRIGGER_LABEL } from "../lib/format";

const QUICK_ACTIONS = [
  "Analisa data latihan saya secara menyeluruh",
  "Apakah beban latihan saya seimbang antar olahraga?",
  "Bagaimana tren kebugaran (CTL/ATL/TSB) saya?",
  "Bagaimana kualitas dan konsistensi minggu ini?",
  "Apa titik kuat dan lemah saya berdasarkan data?",
  "Saran pemulihan untuk kondisi saya saat ini",
];

const HISTORY_PAGE_SIZE = 10;

function oneLine(text: string | null | undefined, max = 110) {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max).trimEnd() + "…" : flat;
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `Hari ini ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return fmtDateShort(iso);
}

function persistedBool(key: string, fallback: boolean): boolean {
  const v = localStorage.getItem(key);
  return v === null ? fallback : v === "1";
}

export default function CoachPage() {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [view, setView] = useState<"active" | "archived">("active");
  const [panelOpen, setPanelOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CoachSessionDTO | null>(null);
  const [quickActionsOpen, setQuickActionsOpen] = useState(() => persistedBool("coach.quickActions", false));
  const [recsOpen, setRecsOpen] = useState(() => persistedBool("coach.recsOpen", false));
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: sessions, isLoading: loadingSessions } = useQuery({
    queryKey: ["coachSessions"],
    queryFn: () => api<CoachSessionDTO[]>("/coach/sessions"),
  });

  const activeSessions = (sessions ?? []).filter((s) => s.status === "active");
  const archivedSessions = (sessions ?? []).filter((s) => s.status === "archived");
  const activeSession = (sessions ?? []).find((s) => s.id === activeSessionId) ?? null;
  const listedSessions = view === "active" ? activeSessions : archivedSessions;

  const { data: messages, isLoading: loadingMsgs } = useQuery({
    queryKey: ["coachMessages", activeSessionId],
    queryFn: () => api<CoachChatMessageDTO[]>(`/coach/sessions/${activeSessionId}/messages`),
    enabled: !!activeSessionId,
  });

  useEffect(() => {
    if (loadingSessions) return;
    if (!activeSessionId && activeSessions.length > 0) {
      setActiveSessionId(activeSessions[0].id);
    }
  }, [loadingSessions, sessions, activeSessionId]);

  const askMut = useMutation({
    mutationFn: async (question: string) => {
      let sid = activeSessionId;
      if (!sid) {
        const s = await api<CoachSessionDTO>("/coach/sessions", { method: "POST", json: {} });
        sid = s.id;
        setActiveSessionId(s.id);
      }
      const res = await api<{ answer: string; sessionId: string; createdAt: string }>("/coach/ask", {
        method: "POST",
        json: { question, sessionId: sid },
      });
      return res;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["coachMessages", res.sessionId] });
      qc.invalidateQueries({ queryKey: ["coachSessions"] });
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ["coachMessages"] });
      qc.invalidateQueries({ queryKey: ["coachSessions"] });
    },
  });

  const createSessionMut = useMutation({
    mutationFn: () => api<CoachSessionDTO>("/coach/sessions", { method: "POST", json: {} }),
    onSuccess: (s) => {
      setActiveSessionId(s.id);
      setView("active");
      setPanelOpen(false);
      qc.invalidateQueries({ queryKey: ["coachSessions"] });
      setTimeout(() => inputRef.current?.focus(), 80);
    },
  });

  const updateSessionMut = useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: "active" | "archived" }) =>
      api<CoachSessionDTO>(`/coach/sessions/${id}`, { method: "PATCH", json: body }),
    onSuccess: (_s, vars) => {
      qc.invalidateQueries({ queryKey: ["coachSessions"] });
      if (vars.id === activeSessionId && vars.status === "archived") setView("archived");
    },
  });

  const deleteSessionMut = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>(`/coach/sessions/${id}`, { method: "DELETE" }),
    onSuccess: (_res, id) => {
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["coachSessions"] });
      if (id === activeSessionId) {
        const rest = activeSessions.filter((s) => s.id !== id);
        setActiveSessionId(rest[0]?.id ?? null);
      }
    },
  });

  const { data: activeRecs, isLoading: loadingActiveRecs } = useQuery({
    queryKey: ["recommendations", "active"],
    queryFn: () => api<RecommendationDTO[]>("/coach/recommendations/active"),
    enabled: recsOpen,
  });

  const historyQuery = useInfiniteQuery({
    queryKey: ["recommendations", "history"],
    queryFn: ({ pageParam }) =>
      api<RecommendationsHistoryPageDTO>(`/coach/recommendations/history?page=${pageParam}&pageSize=${HISTORY_PAGE_SIZE}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    enabled: recsOpen && historyOpen,
  });

  const historyItems = historyQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const historyTotal = historyQuery.data?.pages[0]?.total ?? 0;
  const noRecsAtAll = !!activeRecs && activeRecs.length === 0 && !!historyQuery.data && historyTotal === 0;

  const [openRows, setOpenRows] = useState<Set<string>>(new Set());

  function toggleRow(id: string) {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, askMut.isPending]);

  function send(question: string) {
    const q = question.trim();
    if (q.length < 3 || askMut.isPending) return;
    if (activeSession?.status === "archived") return;
    setInput("");
    askMut.mutate(q);
  }

  function toggleQuickActions() {
    const v = !quickActionsOpen;
    setQuickActionsOpen(v);
    localStorage.setItem("coach.quickActions", v ? "1" : "0");
  }

  function toggleRecsOpen() {
    const v = !recsOpen;
    setRecsOpen(v);
    localStorage.setItem("coach.recsOpen", v ? "1" : "0");
    if (!v) setHistoryOpen(false);
  }

  const busy = askMut.isPending;
  const isArchived = activeSession?.status === "archived";
  const hasAnySession = (sessions?.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        kicker="Asisten Pelatih"
        title="Pelatih AI"
        sub="Tanya apa saja tentang datamu — tren, beban, pola olahraga, pemulihan. AI membaca angka asli dari sistem, bukan perkiraan."
        actions={
          <>
            <Button variant="outline" className="lg:hidden" onClick={() => setPanelOpen((v) => !v)}>
              <PanelLeft size={14} /> Riwayat
            </Button>
            <Link to="/plan">
              <Button variant="outline">Lihat Rencana Aktif</Button>
            </Link>
          </>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className={cx("rise d1 overflow-hidden", panelOpen ? "block" : "hidden lg:block")}>
          <div className="flex items-center justify-between gap-2 border-b border-line bg-surface2/40 px-4 py-3">
            <span className="label-tech flex items-center gap-2 text-volt/90">
              <History size={13} /> Percakapan
            </span>
            <Button size="sm" loading={createSessionMut.isPending} onClick={() => createSessionMut.mutate()}>
              <Plus size={13} /> Baru
            </Button>
          </div>

          <div className="flex gap-1 border-b border-line px-3 py-2">
            {(
              [
                { key: "active", label: "Aktif", count: activeSessions.length },
                { key: "archived", label: "Arsip", count: archivedSessions.length },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                className={cx(
                  "flex-1 rounded-md px-2 py-1 font-display text-[10px] font-semibold uppercase tracking-wider transition-colors",
                  view === t.key ? "border border-volt/25 bg-volt/12 text-volt" : "border border-transparent text-mute hover:bg-surface2"
                )}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>

          <div className="max-h-[440px] space-y-1 overflow-y-auto p-2">
            {createSessionMut.error && (
              <p className="rounded-lg border border-coral/30 bg-coral/10 px-2.5 py-1.5 text-[11px] text-coral">
                {createSessionMut.error instanceof Error ? createSessionMut.error.message : "Gagal membuat sesi"}
              </p>
            )}
            {deleteSessionMut.error && (
              <p className="rounded-lg border border-coral/30 bg-coral/10 px-2.5 py-1.5 text-[11px] text-coral">
                {deleteSessionMut.error instanceof Error ? deleteSessionMut.error.message : "Gagal menghapus sesi"}
              </p>
            )}
            {loadingSessions ? (
              <div className="py-8 text-center text-xs text-dim">Memuat…</div>
            ) : listedSessions.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-dim">
                {view === "active" ? "Belum ada percakapan. Tekan Baru untuk mulai." : "Belum ada sesi yang diarsipkan."}
              </div>
            ) : (
              listedSessions.map((s) => (
                <div
                  key={s.id}
                  className={cx(
                    "group relative cursor-pointer rounded-lg border px-3 py-2.5 transition-colors",
                    s.id === activeSessionId ? "border-volt/40 bg-volt/8" : "border-transparent hover:bg-surface2"
                  )}
                  onClick={() => {
                    setActiveSessionId(s.id);
                    setPanelOpen(false);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveSessionId(s.id);
                      setPanelOpen(false);
                    }
                  }}
                >
                  <div className="pr-14">
                    <div className={cx("truncate text-[12.5px] font-medium", s.id === activeSessionId ? "text-ink" : "text-ink/80")}>
                      {s.title}
                    </div>
                    <div className="num mt-0.5 text-[10px] text-dim">
                      {fmtNum(s.messageCount)} pesan · {whenLabel(s.updatedAt)}
                    </div>
                  </div>
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1 opacity-60 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                    <button
                      title={s.status === "archived" ? "Aktifkan kembali" : "Arsipkan"}
                      className="rounded-md p-1.5 text-mute transition-colors hover:bg-surface hover:text-aqua"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateSessionMut.mutate({ id: s.id, status: s.status === "archived" ? "active" : "archived" });
                      }}
                    >
                      {s.status === "archived" ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                    </button>
                    <button
                      title="Hapus"
                      className="rounded-md p-1.5 text-mute transition-colors hover:bg-coral/15 hover:text-coral"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(s);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-line px-4 py-2.5">
            <p className="text-[10px] leading-relaxed text-dim">
              Hanya 6 pesan terakhir sesi ini yang dikirim ke AI — chat lama tidak membebani konteks.
            </p>
          </div>
        </Card>

        <Card className="rise d1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line bg-surface2/40 px-5 py-3">
            <MessageSquareText size={15} className="shrink-0 text-volt" />
            <span className="truncate text-[12.5px] font-medium text-ink/90">
              {activeSession?.title ?? "Tanya Coach — Analisa Data"}
            </span>
            {isArchived && <Badge tone="amber">Diarsipkan</Badge>}
          </div>

          {isArchived && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber2/25 bg-amber2/10 px-5 py-2.5">
              <span className="text-xs text-amber2">Sesi ini diarsipkan — aktifkan kembali untuk melanjutkan chat.</span>
              <Button
                size="sm"
                variant="outline"
                loading={updateSessionMut.isPending}
                onClick={() => updateSessionMut.mutate({ id: activeSession!.id, status: "active" })}
              >
                <ArchiveRestore size={12} /> Aktifkan
              </Button>
            </div>
          )}

          <div ref={scrollRef} className="max-h-[420px] min-h-[260px] space-y-3 overflow-y-auto px-5 py-4">
            {loadingSessions || (activeSessionId && loadingMsgs) ? (
              <div className="py-10 text-center text-sm text-dim">Memuat percakapan…</div>
            ) : !activeSession ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Sparkles size={22} className="text-volt" />
                <p className="max-w-md text-sm text-mute">
                  Belum ada percakapan. Buat sesi baru lalu tanyakan apa saja — AI akan membaca data olahragamu
                  (kebugaran, volume, zona, konsistensi) dan menjelaskannya.
                </p>
                <Button className="mt-2" loading={createSessionMut.isPending} onClick={() => createSessionMut.mutate()}>
                  <Plus size={14} /> Sesi Baru
                </Button>
              </div>
            ) : !messages || messages.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Sparkles size={22} className="text-volt" />
                <p className="max-w-md text-sm text-mute">
                  Sesi baru siap. Mulai dengan pertanyaan sendiri atau pakai contoh di bawah — AI akan membaca data
                  olahragamu dan menjelaskannya.
                </p>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cx(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed",
                      m.role === "user"
                        ? "whitespace-pre-wrap rounded-br-md bg-volt/12 border border-volt/25 text-ink"
                        : "rounded-bl-md border border-line bg-surface2 text-ink/90"
                    )}
                  >
                    {m.role === "assistant" ? <Markdown content={m.content} /> : m.content}
                    <div className="mt-1 text-right text-[9px] text-dim">{fmtDateTime(m.createdAt)}</div>
                  </div>
                </div>
              ))
            )}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md border border-line bg-surface2 px-4 py-2.5">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-volt [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-volt [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-volt [animation-delay:300ms]" />
                    <span className="ml-1.5 text-[11px] text-dim">Coach membaca datamu…</span>
                  </span>
                </div>
              </div>
            )}
            {askMut.error && (
              <p className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-xs text-coral">
                {askMut.error instanceof Error ? askMut.error.message : "Gagal bertanya"}
              </p>
            )}
          </div>

          <div className="border-t border-line px-5 py-4">
            <button
              onClick={toggleQuickActions}
              className="inline-flex items-center gap-1.5 rounded-full border border-line2 bg-bg px-3 py-1.5 text-[11px] text-dim transition-colors hover:border-volt/40 hover:text-volt"
              aria-expanded={quickActionsOpen}
            >
              <Sparkles size={11} /> Contoh pertanyaan
              <ChevronDown size={11} className={cx("transition-transform duration-200", quickActionsOpen && "rotate-180")} />
            </button>
            {quickActionsOpen && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {QUICK_ACTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    disabled={busy || isArchived || !hasAnySession}
                    className="rounded-full border border-line2 bg-bg px-3 py-1.5 text-[11px] text-mute transition-colors hover:border-volt/50 hover:text-volt disabled:opacity-40"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-end gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder={
                  isArchived
                    ? "Sesi diarsipkan — aktifkan kembali untuk chat"
                    : "Tanya datamu… (Enter kirim, Shift+Enter baris baru)"
                }
                disabled={isArchived}
                className="min-h-[46px]"
                rows={1}
              />
              <Button
                onClick={() => send(input)}
                disabled={input.trim().length < 3 || isArchived}
                loading={busy}
                className="shrink-0"
              >
                <SendHorizonal size={14} />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Percakapan"
        message={
          <>
            Sesi <b className="text-ink">“{deleteTarget?.title}”</b> beserta{" "}
            <b className="text-ink">{fmtNum(deleteTarget?.messageCount ?? 0)} pesan</b> di dalamnya akan dihapus
            permanen. Tindakan ini tidak bisa dibatalkan.
          </>
        }
        confirmLabel="Hapus Permanen"
        danger
        loading={deleteSessionMut.isPending}
        onConfirm={() => deleteTarget && deleteSessionMut.mutate(deleteTarget.id)}
      />

      <div className="mt-6">
        <button
          onClick={toggleRecsOpen}
          className="group flex w-full items-center gap-2 text-left"
          aria-expanded={recsOpen}
        >
          <ChevronDown size={13} className={cx("text-dim transition-transform duration-200", recsOpen && "rotate-180")} />
          <History size={13} className="text-volt/70" />
          <span className="label-tech transition-colors group-hover:text-volt/90">Riwayat Rekomendasi Rencana</span>
          {!recsOpen && <span className="text-[10px] text-dim">· disembunyikan</span>}
        </button>

        {recsOpen && (
          <div className="mt-3 space-y-3">
            {loadingActiveRecs ? (
              <div className="p-6 text-center text-sm text-dim">Memuat…</div>
            ) : (
              <>
                {(activeRecs ?? []).map((r, i) => (
                  <Card key={r.id} className={cx("rise overflow-hidden border-volt/30", `d${Math.min(i + 2, 8)}`)}>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface2/40 px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 size={15} className="text-volt" />
                        <Badge tone="volt">Rekomendasi Aktif</Badge>
                        <Badge tone={r.trigger === "condition_change" ? "amber" : r.trigger === "missed_workout" ? "coral" : "aqua"}>
                          {TRIGGER_LABEL[r.trigger] ?? r.trigger}
                        </Badge>
                      </div>
                      <div className="num flex items-center gap-3 text-[11px] text-dim">
                        {r.providerName && (
                          <span className="flex items-center gap-1">
                            <History size={11} /> {r.providerName}
                          </span>
                        )}
                        {fmtDateTime(r.createdAt)}
                      </div>
                    </div>
                    <div className="px-5 py-4">
                      {r.output?.name && <div className="font-display text-sm font-bold tracking-wide uppercase">{r.output.name}</div>}
                      {r.output?.warnings && r.output.warnings.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {r.output.warnings.map((w, j) => (
                            <li key={j} className="flex items-start gap-1.5 text-xs text-amber2">
                              <XCircle size={12} className="mt-0.5 shrink-0" /> {w}
                            </li>
                          ))}
                        </ul>
                      )}
                      {r.summary && <Markdown content={r.summary} />}
                      {r.planId && (
                        <Link to="/plan" className="mt-3 inline-block text-xs font-semibold text-volt hover:underline">
                          Buka rencana hasil rekomendasi ini →
                        </Link>
                      )}
                    </div>
                  </Card>
                ))}

                <Card className="rise overflow-hidden">
                  <button
                    onClick={() => setHistoryOpen((v) => !v)}
                    className="label-tech flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:text-volt/90"
                    aria-expanded={historyOpen}
                  >
                    <span className="flex items-center gap-2">
                      <History size={12} /> Riwayat Terdahulu
                      {historyQuery.data && <span className="text-[10px] normal-case tracking-normal text-dim">({fmtNum(historyTotal)})</span>}
                    </span>
                    <ChevronDown size={13} className={cx("transition-transform duration-200", historyOpen && "rotate-180")} />
                  </button>

                  {historyOpen && (
                    <>
                      {noRecsAtAll ? (
                        <div className="border-t border-line">
                          <EmptyState
                            icon={<Sparkles size={26} />}
                            title="Belum ada rekomendasi rencana"
                            sub="Buat target latihan di menu Target, atau tekan Regenerasi di halaman Rencana."
                            action={
                              <Link to="/targets">
                                <Button>Buat Target</Button>
                              </Link>
                            }
                          />
                        </div>
                      ) : (
                        <>
                          <div className="divide-y divide-line border-t border-line">
                            {historyItems.map((r) => {
                              const open = openRows.has(r.id);
                              const statusIcon =
                                r.status === "expired" ? (
                                  <XCircle size={13} className="shrink-0 text-coral" />
                                ) : (
                                  <CircleDashed size={13} className="shrink-0 text-dim" />
                                );
                              return (
                                <div
                                  key={r.id}
                                  className={cx("group cursor-pointer text-left transition-colors hover:bg-surface2/60", open && "bg-surface2/40")}
                                  onClick={() => toggleRow(r.id)}
                                  role="button"
                                  tabIndex={0}
                                  aria-expanded={open}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      toggleRow(r.id);
                                    }
                                  }}
                                >
                                  <div className="flex items-center gap-2.5 px-4 py-2.5">
                                    <ChevronDown size={12} className={cx("shrink-0 text-dim transition-transform duration-200", open && "rotate-180")} />
                                    {statusIcon}
                                    <span className="truncate text-xs text-mute group-hover:text-ink/90">{oneLine(r.output?.name ?? r.summary, 90)}</span>
                                    <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-dim">{fmtDateTime(r.createdAt)}</span>
                                  </div>
                                  {open && (
                                    <div className="px-4 pb-3.5 pt-0.5" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <Badge tone={r.status === "expired" ? "coral" : "neutral"}>
                                          {r.status === "expired" ? "Gagal" : "Tersuperse"}
                                        </Badge>
                                        <Badge tone={r.trigger === "condition_change" ? "amber" : r.trigger === "missed_workout" ? "coral" : "aqua"}>
                                          {TRIGGER_LABEL[r.trigger] ?? r.trigger}
                                        </Badge>
                                        {r.providerName && <span className="text-[10px] text-dim">{r.providerName}</span>}
                                      </div>
                                      {r.output?.name && (
                                        <div className="mt-2 font-display text-xs font-bold uppercase tracking-wide text-ink/90">{r.output.name}</div>
                                      )}
                                      {r.summary && (
                                        <div className="mt-1.5">
                                          <Markdown content={r.summary} />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {historyQuery.isFetching && (
                              <div className="px-4 py-3 text-center text-[11px] text-dim">Memuat…</div>
                            )}
                          </div>
                          {historyQuery.hasNextPage && !historyQuery.isFetching && (
                            <div className="border-t border-line px-4 py-2 text-center">
                              <button
                                onClick={() => historyQuery.fetchNextPage()}
                                className="text-[11px] font-semibold text-volt transition-colors hover:underline"
                              >
                                Muat lebih banyak — sisa {fmtNum(historyTotal - historyItems.length)} →
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </Card>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
