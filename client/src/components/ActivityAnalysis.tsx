import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, RefreshCw, Sparkles } from "lucide-react";
import type { ActivityAnalysisDTO } from "shared";
import { api } from "../lib/api";
import { Badge, Button, Card, ErrorText } from "./ui";
import AnalysisLoading from "./AnalysisLoading";
import { Markdown } from "./Markdown";
import { fmtDateTime, fmtNum } from "../lib/format";

export default function ActivityAnalysis({ activityId }: { activityId: string }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["activity-analysis", activityId],
    queryFn: () => api<{ analysis: ActivityAnalysisDTO | null }>(`/activities/${activityId}/analysis`),
  });

  const runMut = useMutation({
    mutationFn: () => api<{ analysis: ActivityAnalysisDTO }>(`/activities/${activityId}/analysis`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activity-analysis", activityId] }),
  });

  const analysis = data?.analysis ?? null;
  const busy = runMut.isPending;

  return (
    <Card className="mt-4 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BrainCircuit size={15} className="text-volt" />
          <span className="label-tech text-volt/90">Analisis AI Mendalam</span>
          {analysis && <Badge tone="aqua">Manual · 1 klik</Badge>}
        </div>
        {analysis && !busy && (
          <div className="flex items-center gap-3">
            <span className="num text-[10px] text-dim">
              {analysis.model ?? analysis.providerName ?? "AI"} · {fmtDateTime(analysis.createdAt)}
              {analysis.latencyMs != null && ` · ${(analysis.latencyMs / 1000).toFixed(1)}s`}
            </span>
            <Button variant="outline" size="sm" onClick={() => runMut.mutate()}>
              <RefreshCw size={12} /> Analisis Ulang
            </Button>
          </div>
        )}
      </div>

      {busy ? (
        <AnalysisLoading />
      ) : analysis ? (
        <div className="rounded-xl border border-line bg-bg/60 px-5 py-4">
          <Markdown content={analysis.content} />
        </div>
      ) : isLoading ? (
        <div className="py-6 text-center text-sm text-dim">Memuat…</div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line2 px-6 py-10 text-center">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-volt/8">
            <span className="analysis-ring absolute inset-0 rounded-full border border-volt/30" />
            <Sparkles size={20} className="text-volt" />
          </div>
          <div className="font-display text-sm font-semibold uppercase tracking-wider text-mute">Belum dianalisis</div>
          <p className="max-w-md text-sm text-dim">
            Tekan tombol di bawah untuk membedah sesi ini dengan AI: pola pacing &amp; power, drift HR, distribusi zona,
            penanganan tanjakan, dampak ke kebugaran, dan saran sesi berikutnya.
          </p>
          <Button className="mt-2" onClick={() => runMut.mutate()}>
            <Sparkles size={14} /> Analisis dengan AI
          </Button>
        </div>
      )}

      {runMut.error && (
        <ErrorText>
          {runMut.error instanceof Error
            ? runMut.error.message
            : "Gagal menganalisis aktivitas. Coba lagi beberapa saat."}
        </ErrorText>
      )}

      {analysis?.latencyMs != null && !busy && (
        <div className="num mt-3 text-[10px] text-dim">
          diproses {fmtNum(analysis.latencyMs / 1000, 1)} detik · hasil tersimpan lokal, analisis ulang akan menimpa
        </div>
      )}
    </Card>
  );
}
