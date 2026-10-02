import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { SportDTO } from "shared";
import { api } from "../lib/api";
import { OnboardingInput } from "shared";
import { Button, Card, ErrorText, Field, Input, Select, Spinner, cx } from "../components/ui";
import SportIcon from "../components/SportIcon";
import { Zap } from "lucide-react";

type OnboardingStatus = {
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
};

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["onboarding"],
    queryFn: () => api<OnboardingStatus>("/onboarding/status"),
  });

  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [primary, setPrimary] = useState<string>("");
  const [ftp, setFtp] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [restingHr, setRestingHr] = useState("");
  const [maxHr, setMaxHr] = useState("");
  const [weeklyHours, setWeeklyHours] = useState("6");
  const [experience, setExperience] = useState("beginner");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      if (data.selected.length > 0) {
        setSelected(data.selected);
        setPrimary(data.primarySport ?? data.selected[0]);
      }
      const p = data.profile;
      if (p) {
        if (p.ftp) setFtp(String(p.ftp));
        if (p.weightKg) setWeightKg(String(p.weightKg));
        if (p.restingHr) setRestingHr(String(p.restingHr));
        if (p.maxHr) setMaxHr(String(p.maxHr));
        if (p.weeklyHoursTarget) setWeeklyHours(String(p.weeklyHoursTarget));
        if (p.experienceLevel) setExperience(p.experienceLevel);
      }
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size={28} className="text-volt" />
      </div>
    );
  }

  const sports = data?.sports ?? [];

  function toggleSport(id: string) {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
      if (!next.includes(primary) && next.length > 0) setPrimary(next[0]);
      return next;
    });
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const payload = OnboardingInput.parse({
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
      });
      await api("/onboarding", { method: "POST", json: payload });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
      <div className="rise mb-8 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-volt text-bg">
          <Zap size={20} strokeWidth={2.5} />
        </div>
        <div>
          <div className="font-display text-lg font-bold tracking-[0.22em]">MOTIONMIND</div>
          <div className="text-[10px] tracking-[0.3em] text-dim uppercase">Pengaturan Awal</div>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-2">
        {[1, 2].map((s) => (
          <div key={s} className={cx("h-1.5 flex-1 rounded-full transition-colors", s <= step ? "bg-volt" : "bg-line2")} />
        ))}
      </div>

      {step === 1 && (
        <Card className="rise p-6">
          <h1 className="font-display text-xl font-bold uppercase tracking-wide">Pilih olahragamu</h1>
          <p className="mt-1 text-sm text-mute">
            Pilih semua olahraga yang ingin dilatih. AI coach akan menyusun rencana multi-olahraga.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {sports.map((s) => {
              const active = selected.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSport(s.id)}
                  className={cx(
                    "flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-[13px] font-medium transition-all",
                    active
                      ? "border-volt/50 bg-volt/10 text-volt"
                      : "border-line2 bg-bg text-mute hover:border-line2 hover:bg-surface2 hover:text-ink"
                  )}
                >
                  <SportIcon icon={s.icon} size={17} />
                  <span className="leading-tight">{s.name}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-5">
            <Field label="Olahraga utama" hint="Menjadi fokus utama rencana latihan.">
              <Select value={primary} onChange={(e) => setPrimary(e.target.value)}>
                <option value="">— pilih —</option>
                {sports
                  .filter((s) => selected.includes(s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
          <ErrorText>{error}</ErrorText>
          <div className="mt-6 flex justify-end">
            <Button disabled={selected.length === 0 || !primary} onClick={() => setStep(2)}>
              Lanjut
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="rise p-6">
          <h1 className="font-display text-xl font-bold uppercase tracking-wide">Profil atlet</h1>
          <p className="mt-1 text-sm text-mute">Semua opsional — bisa diubah nanti di Pengaturan. Data ini memperbaiki akurasi TSS & rekomendasi AI.</p>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <Field label="FTP (W)" hint="Functional Threshold Power">
              <Input type="number" value={ftp} onChange={(e) => setFtp(e.target.value)} placeholder="mis. 220" />
            </Field>
            <Field label="Berat badan (kg)">
              <Input type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="mis. 70" />
            </Field>
            <Field label="Resting HR (bpm)">
              <Input type="number" value={restingHr} onChange={(e) => setRestingHr(e.target.value)} placeholder="mis. 55" />
            </Field>
            <Field label="Max HR (bpm)">
              <Input type="number" value={maxHr} onChange={(e) => setMaxHr(e.target.value)} placeholder="mis. 190" />
            </Field>
            <Field label="Jam latihan / minggu">
              <Input type="number" value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} />
            </Field>
            <Field label="Level pengalaman">
              <Select value={experience} onChange={(e) => setExperience(e.target.value)}>
                <option value="beginner">Pemula</option>
                <option value="intermediate">Menengah</option>
                <option value="advanced">Mahir</option>
              </Select>
            </Field>
          </div>
          <ErrorText>{error}</ErrorText>
          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Kembali
            </Button>
            <Button loading={saving} onClick={submit}>
              Selesai & Mulai
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
