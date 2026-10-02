import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { RefreshCw, CloudUpload, Link2, Sparkles, ArrowRight, Zap, TrendingUp } from "lucide-react";
import type { DashboardStats, RecommendationDTO, UserProfileDTO } from "shared";
import { api } from "../lib/api";
import { Badge, Button, Card, PageHeader, Stat, cx } from "../components/ui";
import { FitnessChart, WeeklyVolumeChart } from "../components/Charts";
import { fmtDate, fmtDateShort, fmtDistance, fmtDurationShort, fmtNum, stripMarkdown, tsbTone, TRIGGER_LABEL } from "../lib/format";

export default function DashboardPage() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<UserProfileDTO>("/auth/me") });
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardStats>("/dashboard/stats"),
    refetchInterval: 60_000,
  });
  const { data: recs } = useQuery({
    queryKey: ["recommendations"],
    queryFn: () => api<RecommendationDTO[]>("/coach/recommendations"),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["activities"] });
  };

  const syncMut = useMutation({
    mutationFn: async () => {
      const before = await api<{ lastSyncAt: string | null }>("/strava/status");
      const res = await api<{ queued: boolean }>("/strava/sync", { method: "POST" });
      return { before: before.lastSyncAt, queued: res.queued };
    },
    onMutate: () => setSyncing(true),
    onSuccess: ({ before }) => {
      const start = Date.now();
      const poll = setInterval(async () => {
        try {
          const st = await api<{ lastSyncAt: string | null }>("/strava/status");
          if (st.lastSyncAt && st.lastSyncAt !== before) {
            clearInterval(poll);
            refreshAll();
            setSyncing(false);
            setTimeout(refreshAll, 15_000);
            setTimeout(refreshAll, 45_000);
            return;
          }
          if (Date.now() - start > 180_000) {
            clearInterval(poll);
            refreshAll();
            setSyncing(false);
            return;
          }
        } catch {
          // biarkan polling lanjut
        }
      }, 6_000);
    },
    onError: () => setSyncing(false),
  });

  const activeRec = recs?.find((r) => r.status === "active");
  const tsb = stats?.totals.currentTsb ?? 0;
  const form = tsbTone(tsb);

  return (
    <>
      <PageHeader
        kicker="Performance Cockpit"
        title={`Halo, ${me?.name || me?.username || "Atlet"}`}
        sub="Ringkasan kebugaran, beban latihan, dan saran AI coach-mu."
        actions={
          me?.stravaConnected ? (
            <Button variant="outline" loading={syncMut.isPending || syncing} onClick={() => syncMut.mutate()}>
              <RefreshCw size={13} className={syncing ? "animate-spin" : undefined} />
              {syncing ? "Menyinkronkan…" : "Sync Strava"}
            </Button>
          ) : (
            <Link to="/settings">
              <Button variant="outline">
                <Link2 size={13} /> Hubungkan Strava
              </Button>
            </Link>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat className="rise d1" label="Fitness (CTL)" value={fmtNum(stats?.totals.currentCtl, 1)} tone="volt" hint="Beban latihan kronis · 42 hari" />
        <Stat className="rise d2" label="Fatigue (ATL)" value={fmtNum(stats?.totals.currentAtl, 1)} tone="aqua" hint="Kelelahan akut · 7 hari" />
        <Stat className="rise d3" label={`Form (TSB) · ${form.label}`} value={fmtNum(tsb, 1)} tone={tsb > 5 ? "volt" : tsb >= -30 ? "aqua" : "coral"} hint="CTL − ATL" />
        <Stat className="rise d4" label="TSS · 30 hari" value={fmtNum(stats?.totals.tss30d)} hint={`${fmtNum(stats?.totals.hours30d, 1)} jam · ${fmtNum(stats?.totals.activities30d)} sesi`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="rise d5 p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="label-tech">Kurva Kebugaran · 90 hari</div>
            <div className="flex gap-3 text-[10px] uppercase tracking-wider text-dim">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-full bg-volt" />CTL</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-full bg-aqua" />ATL</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-full bg-amber2" />TSB</span>
            </div>
          </div>
          {stats ? <FitnessChart data={stats.fitness} /> : <ChartSkeleton />}
        </Card>

        <Card className="rise d6 p-5 lg:col-span-2">
          <div className="label-tech mb-3">Volume Mingguan · Jam per Olahraga</div>
          {stats && stats.weekly.length > 0 ? <WeeklyVolumeChart data={stats.weekly.slice(-10)} /> : <ChartSkeleton />}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="rise d7 relative overflow-hidden p-5 lg:col-span-2">
          <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-volt/8 blur-2xl" />
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-volt" />
            <span className="label-tech text-volt/90">AI Coach</span>
          </div>
          {activeRec ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone="volt">{TRIGGER_LABEL[activeRec.trigger] ?? activeRec.trigger}</Badge>
                <span className="text-[11px] text-dim">{fmtDate(activeRec.createdAt)}</span>
              </div>
              <p className="mt-3 line-clamp-4 whitespace-pre-line text-[13px] leading-relaxed text-ink/90">{stripMarkdown(activeRec.summary)}</p>
              <Link to="/coach" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-volt hover:underline">
                Lihat semua rekomendasi <ArrowRight size={13} />
              </Link>
            </>
          ) : (
            <>
              <p className="mt-3 text-[13px] leading-relaxed text-mute">
                Belum ada rencana dari AI coach. Buat target latihan pertamamu, dan AI akan menyusun rencana yang dipersonalisasi.
              </p>
              <Link to="/targets" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-volt hover:underline">
                Buat target <ArrowRight size={13} />
              </Link>
            </>
          )}
        </Card>

        <Card className="rise d8 p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="label-tech">Aktivitas Terakhir</div>
            <Link to="/activities" className="text-xs font-semibold text-mute hover:text-volt">
              Semua →
            </Link>
          </div>
          {stats && stats.recentActivities.length > 0 ? (
            <div className="divide-y divide-line">
              {stats.recentActivities.slice(0, 5).map((a) => (
                <Link key={a.id} to={`/activities/${a.id}`} className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-volt">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{a.name}</div>
                    <div className="text-[11px] text-dim">
                      {fmtDateShort(a.startDate)} · {a.sportName}
                    </div>
                  </div>
                  <div className="num flex shrink-0 gap-4 text-[12px] text-mute">
                    <span>{fmtDistance(a.distanceM)}</span>
                    <span>{fmtDurationShort(a.movingTimeS ?? a.elapsedTimeS)}</span>
                    <span className={cx((a.tss ?? 0) > 0 ? "text-volt" : "text-dim")}>TSS {fmtNum(a.tss, 1)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <TrendingUp size={22} className="text-dim" />
              <p className="text-sm text-dim">Belum ada aktivitas. Sinkronkan Strava atau unggah file GPX di menu Aktivitas.</p>
            </div>
          )}
        </Card>
      </div>

      {isLoading && (
        <div className="mt-6 flex items-center gap-2 text-xs text-dim">
          <Zap size={13} className="animate-pulse text-volt" /> Memuat data performa…
        </div>
      )}
    </>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed border-line2">
      <div className="flex items-center gap-2 text-xs text-dim">
        <CloudUpload size={14} className="animate-pulse" /> Menunggu data latihan…
      </div>
    </div>
  );
}
