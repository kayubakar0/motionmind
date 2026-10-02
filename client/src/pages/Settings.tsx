import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Link2, Unlink, Save, ExternalLink, LogOut } from "lucide-react";
import type { SportDTO, UserProfileDTO } from "shared";
import { api } from "../lib/api";
import { Badge, Button, Card, ErrorText, Field, Input, PageHeader, Select, cx } from "../components/ui";
import SportIcon from "../components/SportIcon";
import { fmtDateTime } from "../lib/format";

interface OnbStatus {
  onboardingDone: boolean;
  sports: SportDTO[];
  selected: string[];
  primarySport: string | null;
  profile: {
    ftp: number | null;
    weightKg: number | null;
    restingHr: number | null;
    maxHr: number | null;
    weeklyHoursTarget: number | null;
    experienceLevel: string | null;
  } | null;
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<UserProfileDTO>("/auth/me") });
  const { data: status } = useQuery({ queryKey: ["onboarding"], queryFn: () => api<OnbStatus>("/onboarding/status") });
  const { data: strava } = useQuery({ queryKey: ["strava"], queryFn: () => api<{ connected: boolean; lastSyncAt: string | null }>("/strava/status") });

  const [selected, setSelected] = useState<string[]>([]);
  const [primary, setPrimary] = useState("");
  const [ftp, setFtp] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [restingHr, setRestingHr] = useState("");
  const [maxHr, setMaxHr] = useState("");
  const [weeklyHours, setWeeklyHours] = useState("");
  const [experience, setExperience] = useState("beginner");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      qc.clear();
      navigate("/login", { replace: true });
    }
  }

  useEffect(() => {
    if (status) {
      setSelected(status.selected);
      setPrimary(status.primarySport ?? status.selected[0] ?? "");
      const p = status.profile;
      if (p?.ftp) setFtp(String(p.ftp));
      if (p?.weightKg) setWeightKg(String(p.weightKg));
      if (p?.restingHr) setRestingHr(String(p.restingHr));
      if (p?.maxHr) setMaxHr(String(p.maxHr));
      if (p?.weeklyHoursTarget) setWeeklyHours(String(p.weeklyHoursTarget));
      if (p?.experienceLevel) setExperience(p.experienceLevel);
    }
  }, [status]);

  const saveMut = useMutation({
    mutationFn: () =>
      api("/onboarding", {
        method: "POST",
        json: {
          sports: selected,
          primarySport: primary,
          profile: {
            ftp: ftp ? Number(ftp) : null,
            weightKg: weightKg ? Number(weightKg) : null,
            restingHr: restingHr ? Number(restingHr) : null,
            maxHr: maxHr ? Number(maxHr) : null,
            weeklyHoursTarget: weeklyHours ? Number(weeklyHours) : null,
            experienceLevel: experience,
          },
        },
      }),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["me"] });
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Gagal menyimpan"),
  });

  const connectMut = useMutation({
    mutationFn: () => api<{ url: string }>("/strava/connect"),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
  });
  const connectError = connectMut.error instanceof Error ? connectMut.error.message : null;

  const syncMut = useMutation({
    mutationFn: async () => {
      const before = await api<{ lastSyncAt: string | null }>("/strava/status");
      await api("/strava/sync", { method: "POST" });
      return before.lastSyncAt;
    },
    onSuccess: (before) => {
      const start = Date.now();
      const poll = setInterval(async () => {
        try {
          const st = await api<{ lastSyncAt: string | null }>("/strava/status");
          if ((st.lastSyncAt && st.lastSyncAt !== before) || Date.now() - start > 180_000) {
            clearInterval(poll);
            qc.invalidateQueries({ queryKey: ["strava"] });
            qc.invalidateQueries({ queryKey: ["activities"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            setTimeout(() => qc.invalidateQueries({ queryKey: ["strava"] }), 20_000);
            return;
          }
        } catch {
          // biarkan polling lanjut
        }
      }, 6_000);
    },
  });

  const disconnectMut = useMutation({
    mutationFn: () => api("/strava", { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["strava"] }),
  });

  return (
    <>
      <PageHeader kicker="Akun & Preferensi" title="Pengaturan" sub="Profil atlet, olahraga aktif, dan koneksi Strava." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rise d1 p-5">
          <div className="label-tech mb-4">Olahraga Aktif</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(status?.sports ?? []).map((s) => {
              const active = selected.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() =>
                    setSelected((prev) => {
                      const next = prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id];
                      if (!next.includes(primary) && next.length > 0) setPrimary(next[0]);
                      return next;
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
          <div className="mt-4">
            <Field label="Olahraga utama">
              <Select value={primary} onChange={(e) => setPrimary(e.target.value)}>
                {selected.map((id) => {
                  const s = status?.sports.find((x) => x.id === id);
                  return (
                    <option key={id} value={id}>
                      {s?.name ?? id}
                    </option>
                  );
                })}
              </Select>
            </Field>
          </div>
        </Card>

        <Card className="rise d2 p-5">
          <div className="label-tech mb-4">Profil Performa</div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="FTP (W)">
              <Input type="number" value={ftp} onChange={(e) => setFtp(e.target.value)} />
            </Field>
            <Field label="Berat (kg)">
              <Input type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
            </Field>
            <Field label="Resting HR">
              <Input type="number" value={restingHr} onChange={(e) => setRestingHr(e.target.value)} />
            </Field>
            <Field label="Max HR">
              <Input type="number" value={maxHr} onChange={(e) => setMaxHr(e.target.value)} />
            </Field>
            <Field label="Jam latihan / minggu">
              <Input type="number" value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} />
            </Field>
            <Field label="Level">
              <Select value={experience} onChange={(e) => setExperience(e.target.value)}>
                <option value="beginner">Pemula</option>
                <option value="intermediate">Menengah</option>
                <option value="advanced">Mahir</option>
              </Select>
            </Field>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <ErrorText>{error}</ErrorText>
            {saved && <span className="text-xs text-volt">Tersimpan ✓</span>}
            <Button loading={saveMut.isPending} disabled={selected.length === 0} onClick={() => saveMut.mutate()}>
              <Save size={13} /> Simpan
            </Button>
          </div>
        </Card>
      </div>

      <Card className="rise d3 mt-4 p-5">
        <div className="label-tech mb-4">Integrasi Strava</div>
        {strava?.connected ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone="volt">Terhubung</Badge>
                <span className="text-xs text-dim">Sinkron terakhir: {strava.lastSyncAt ? fmtDateTime(strava.lastSyncAt) : "belum pernah"}</span>
              </div>
              <p className="mt-2 max-w-md text-[12px] text-mute">
                Sinkronisasi manual: tekan tombol di bawah untuk menarik aktivitas terbaru. Aktivitas yang kamu selesaikan di aplikasi otomatis dikirim ke Strava.
              </p>
            </div>
            <div className="flex gap-2">
              <Button loading={syncMut.isPending} onClick={() => syncMut.mutate()}>
                <RefreshCw size={13} /> Sync Sekarang
              </Button>
              <Button variant="danger" onClick={() => disconnectMut.mutate()}>
                <Unlink size={13} /> Putuskan
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone="neutral">Belum terhubung</Badge>
              </div>
              <p className="mt-2 max-w-md text-[12px] text-mute">
                Hubungkan akun Strava untuk mengimpor seluruh riwayat latihan dan mengirim aktivitas baru otomatis.
              </p>
              <p className="mt-1 text-[11px] text-dim">Pastikan STRAVA_CLIENT_ID &amp; SECRET sudah diatur di server .env</p>
            </div>
            <div className="text-right">
              <Button loading={connectMut.isPending} onClick={() => connectMut.mutate()}>
                <Link2 size={13} /> Hubungkan Strava <ExternalLink size={12} />
              </Button>
              {connectError && (
                <p className="mt-2 max-w-56 text-right text-[11px] leading-relaxed text-coral">{connectError}</p>
              )}
            </div>
          </div>
        )}
      </Card>

      {me && (
        <Card className="rise d4 mt-4 p-5">
          <div className="label-tech mb-3">Akun</div>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <span className="text-dim">Username: </span>
              <span className="font-semibold">{me.username}</span>
            </div>
            <div>
              <span className="text-dim">Email: </span>
              <span className="font-semibold">{me.email ?? "—"}</span>
            </div>
            <div>
              <span className="text-dim">Role: </span>
              <Badge tone={me.role === "admin" ? "aqua" : "neutral"}>{me.role}</Badge>
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <Button variant="danger" onClick={logout}>
              <LogOut size={13} /> Keluar dari akun
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
