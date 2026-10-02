export function fmtDuration(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function fmtDurationShort(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

export function fmtDistance(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 100000 ? 1 : 0)} km`;
}

export function fmtElevation(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "—";
  return `${Math.round(m).toLocaleString("id-ID")} m`;
}

export function fmtPace(secPerKm: number | null | undefined): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("id-ID", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function fmtDateShort(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(date);
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function dayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Besok";
  if (diff === -1) return "Kemarin";
  return new Intl.DateTimeFormat("id-ID", { weekday: "long" }).format(d);
}

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export const WORKOUT_TYPE_LABEL: Record<string, string> = {
  endurance: "Endurance",
  tempo: "Tempo",
  intervals: "Intervals",
  recovery: "Recovery",
  long: "Long",
  strength: "Strength",
  flexibility: "Flexibility",
  test: "Test",
  race: "Race",
  rest: "Rest",
};

export const TRIGGER_LABEL: Record<string, string> = {
  initial: "Rencana awal",
  missed_workout: "Sesi terlewat",
  condition_change: "Perubahan kondisi",
  new_activity: "Aktivitas baru",
  target_change: "Target berubah",
  manual: "Manual",
};

export function tsbTone(tsb: number): { label: string; tone: string } {
  if (tsb > 5) return { label: "Fresh", tone: "text-volt" };
  if (tsb >= -10) return { label: "Netral", tone: "text-aqua" };
  if (tsb >= -30) return { label: "Produktif", tone: "text-amber2" };
  return { label: "Overreach", tone: "text-coral" };
}

/** Hilangkan sintaks markdown untuk teaser teks pendek (non-render) */
export function stripMarkdown(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ");
}
