import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Sparkles, History, CheckCircle2, CircleDashed, SendHorizonal, MessageSquareText, XCircle, ChevronDown } from "lucide-react";
import type { RecommendationDTO } from "shared";
import { api } from "../lib/api";
import { Badge, Button, Card, EmptyState, PageHeader, Textarea, cx } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { fmtDateTime, TRIGGER_LABEL } from "../lib/format";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface RecFull extends RecommendationDTO {
  output: {
    name?: string;
    goal_summary?: string;
    rationale?: string;
    warnings?: string[];
  } | null;
}

const QUICK_ACTIONS = [
  "Analisa data latihan saya secara menyeluruh",
  "Apakah beban latihan saya seimbang antar olahraga?",
  "Bagaimana tren kebugaran (CTL/ATL/TSB) saya?",
  "Bagaimana kualitas dan konsistensi minggu ini?",
  "Apa titik kuat dan lemah saya berdasarkan data?",
  "Saran pemulihan untuk kondisi saya saat ini",
];

const HISTORY_VISIBLE = 4;

function oneLine(text: string | null | undefined, max = 110) {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max).trimEnd() + "…" : flat;
}

export default function CoachPage() {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading: loadingMsgs } = useQuery({
    queryKey: ["coachMessages"],
    queryFn: () => api<ChatMsg[]>("/coach/messages"),
  });

  const { data: recs, isLoading: loadingRecs } = useQuery({
    queryKey: ["recommendations"],
    queryFn: () => api<RecFull[]>("/coach/recommendations"),
  });

  const askMut = useMutation({
    mutationFn: (question: string) => api<{ answer: string }>("/coach/ask", { method: "POST", json: { question } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coachMessages"] }),
  });

  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [showAllHistory, setShowAllHistory] = useState(false);

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
    setInput("");
    askMut.mutate(q);
  }

  const busy = askMut.isPending;

  return (
    <>
      <PageHeader
        kicker="Asisten Pelatih"
        title="Pelatih AI"
        sub="Tanya apa saja tentang datamu — tren, beban, pola olahraga, pemulihan. AI membaca angka asli dari sistem, bukan perkiraan."
        actions={
          <Link to="/plan">
            <Button variant="outline">Lihat Rencana Aktif</Button>
          </Link>
        }
      />

      <Card className="rise d1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line bg-surface2/40 px-5 py-3">
          <MessageSquareText size={15} className="text-volt" />
          <span className="label-tech text-volt/90">Tanya Coach — Analisa Data</span>
        </div>

        <div ref={scrollRef} className="max-h-[420px] min-h-[260px] space-y-3 overflow-y-auto px-5 py-4">
          {loadingMsgs ? (
            <div className="py-10 text-center text-sm text-dim">Memuat percakapan…</div>
          ) : !messages || messages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Sparkles size={22} className="text-volt" />
              <p className="max-w-md text-sm text-mute">
                Belum ada percakapan. Mulai dengan pertanyaan sendiri atau pakai contoh di bawah — AI akan membaca data olahragamu (kebugaran, volume, zona, konsistensi) dan menjelaskannya.
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
          <div className="mb-3 flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                disabled={busy}
                className="rounded-full border border-line2 bg-bg px-3 py-1.5 text-[11px] text-mute transition-colors hover:border-volt/50 hover:text-volt disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Tanya datamu… (Enter kirim, Shift+Enter baris baru)"
              className="min-h-[46px]"
              rows={1}
            />
            <Button onClick={() => send(input)} disabled={input.trim().length < 3} loading={busy} className="shrink-0">
              <SendHorizonal size={14} />
            </Button>
          </div>
        </div>
      </Card>

      <div className="mt-6">
        <div className="label-tech mb-3 flex items-center gap-2">
          <History size={13} /> Riwayat Rekomendasi Rencana
        </div>
        {loadingRecs ? (
          <div className="p-6 text-center text-sm text-dim">Memuat…</div>
        ) : !recs || recs.length === 0 ? (
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
        ) : (
          (() => {
            const actives = recs.filter((r) => r.status === "active");
            const history = recs.filter((r) => r.status !== "active");
            const visibleHistory = showAllHistory ? history : history.slice(0, HISTORY_VISIBLE);

            return (
              <div className="space-y-3">
                {actives.map((r, i) => (
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

                {history.length > 0 && (
                  <Card className="rise d2 overflow-hidden">
                    <button
                      onClick={() => setShowAllHistory((v) => !v)}
                      className="label-tech flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:text-volt/90"
                      aria-expanded={showAllHistory}
                    >
                      <span className="flex items-center gap-2">
                        <History size={12} /> Riwayat Terdahulu ({history.length})
                        {!showAllHistory && history.length > HISTORY_VISIBLE && (
                          <span className="text-[10px] text-dim normal-case tracking-normal">· {visibleHistory.length} terakhir</span>
                        )}
                      </span>
                      <ChevronDown size={13} className={cx("transition-transform duration-200", showAllHistory && "rotate-180")} />
                    </button>

                    <div className="divide-y divide-line border-t border-line">
                      {visibleHistory.map((r) => {
                        const open = openRows.has(r.id);
                        const statusIcon =
                          r.status === "expired" ? <XCircle size={13} className="shrink-0 text-coral" /> : <CircleDashed size={13} className="shrink-0 text-dim" />;
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
                              <span className="ml-auto shrink-0 text-[10px] text-dim whitespace-nowrap">{fmtDateTime(r.createdAt)}</span>
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
                                  <div className="mt-2 font-display text-xs font-bold tracking-wide uppercase text-ink/90">{r.output.name}</div>
                                )}
                                {r.summary && <div className="mt-1.5"><Markdown content={r.summary} /></div>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {history.length > visibleHistory.length && (
                      <div className="border-t border-line px-4 py-2 text-center">
                        <button
                          onClick={() => setShowAllHistory(true)}
                          className="text-[11px] font-semibold text-volt transition-colors hover:underline"
                        >
                          Tampilkan semua {history.length} →
                        </button>
                      </div>
                    )}
                  </Card>
                )}
              </div>
            );
          })()
        )}
      </div>
    </>
  );
}
