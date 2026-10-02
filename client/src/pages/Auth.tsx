import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Zap, ArrowRight, Bike, Activity, Dumbbell, Waves } from "lucide-react";
import { api } from "../lib/api";
import { Button, ErrorText, Field, Input } from "../components/ui";

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden border-r border-line bg-surface/40 p-10 lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-volt text-bg">
            <Zap size={22} strokeWidth={2.5} />
          </div>
          <span className="font-display text-lg font-bold tracking-[0.24em]">MOTIONMIND</span>
        </div>
        <div>
          <h1 className="font-display text-5xl leading-[1.05] font-bold tracking-wide uppercase">
            Latihan
            <br />
            <span className="text-volt">Lebih Cerdas.</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-mute">
            AI coach pribadi yang membaca seluruh riwayat latihanmu — dari Strava maupun file GPX — lalu menyusun dan menyesuaikan rencana latihan secara dinamis.
          </p>
          <div className="mt-8 flex gap-6 text-dim">
            <Bike size={22} />
            <Activity size={22} />
            <Waves size={22} />
            <Dumbbell size={22} />
          </div>
        </div>
        <div className="hazard h-2 w-full rounded-full opacity-60" />
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm rise">{children}</div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ onboardingDone: boolean }>("/auth/login", { method: "POST", json: { username, password } });
      navigate(res.onboardingDone ? "/" : "/onboarding", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Masuk</h2>
      <p className="mt-1 mb-6 text-sm text-mute">Lanjutkan perjalanan latihanmu.</p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" autoFocus required />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" loading={loading} className="w-full">
          Masuk <ArrowRight size={14} />
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-mute">
        Belum punya akun?{" "}
        <Link to="/register" className="font-semibold text-volt hover:underline">
          Daftar
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/auth/register", { method: "POST", json: { username, password, email: email || undefined } });
      navigate("/onboarding", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mendaftar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Daftar</h2>
      <p className="mt-1 mb-6 text-sm text-mute">Buat akun dan mulai dibimbing AI coach.</p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" autoFocus required minLength={3} />
        </Field>
        <Field label="Email (opsional)" hint="Hanya dipakai untuk reset password.">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
        </Field>
        <Field label="Password" hint="Minimal 8 karakter.">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" loading={loading} className="w-full">
          Buat Akun <ArrowRight size={14} />
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-mute">
        Sudah punya akun?{" "}
        <Link to="/login" className="font-semibold text-volt hover:underline">
          Masuk
        </Link>
      </p>
    </AuthShell>
  );
}
