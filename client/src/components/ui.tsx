import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-display font-semibold uppercase tracking-wider transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "px-3 py-1.5 text-[11px]" : "px-4 py-2.5 text-xs",
        variant === "primary" && "bg-volt text-bg hover:brightness-110 active:scale-[0.98]",
        variant === "outline" && "border border-line2 bg-transparent text-ink hover:border-volt/60 hover:text-volt",
        variant === "ghost" && "bg-transparent text-mute hover:bg-surface2 hover:text-ink",
        variant === "danger" && "border border-coral/40 bg-coral/10 text-coral hover:bg-coral/20",
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cx("animate-spin", className)} fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("card", className)}>{children}</div>;
}

export function PageHeader({
  title,
  sub,
  actions,
  kicker,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
  kicker?: string;
}) {
  return (
    <div className="rise mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <div className="label-tech mb-1.5 text-volt/80">{kicker}</div>}
        <h1 className="font-display text-2xl font-bold tracking-wide uppercase">{title}</h1>
        {sub && <p className="mt-1 max-w-xl text-sm text-mute">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "volt" | "aqua" | "amber" | "coral";
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-[0.14em]",
        tone === "neutral" && "bg-surface2 text-mute border border-line",
        tone === "volt" && "bg-volt/12 text-volt border border-volt/25",
        tone === "aqua" && "bg-aqua/10 text-aqua border border-aqua/25",
        tone === "amber" && "bg-amber2/10 text-amber2 border border-amber2/25",
        tone === "coral" && "bg-coral/10 text-coral border border-coral/25",
        className
      )}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  unit,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: "default" | "volt" | "aqua" | "amber" | "coral";
  className?: string;
}) {
  const toneText =
    tone === "volt" ? "text-volt" : tone === "aqua" ? "text-aqua" : tone === "amber" ? "text-amber2" : tone === "coral" ? "text-coral" : "text-ink";
  return (
    <div className={cx("card relative overflow-hidden p-4", className)}>
      <div className="label-tech">{label}</div>
      <div className={cx("num mt-2 text-[26px] leading-none font-semibold", toneText)}>
        {value}
        {unit && <span className="ml-1 text-sm text-mute">{unit}</span>}
      </div>
      {hint && <div className="mt-1.5 text-[11px] text-dim">{hint}</div>}
      <div className="absolute -right-3 -bottom-3 h-14 w-14 rounded-full bg-volt/5 blur-xl" />
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label-tech mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-dim">{hint}</span>}
    </label>
  );
}

const inputBase =
  "w-full rounded-lg border border-line2 bg-bg px-3 py-2.5 text-sm text-ink placeholder:text-dim outline-none transition-colors focus:border-volt/60 focus:ring-1 focus:ring-volt/25";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputBase, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputBase, "min-h-[84px] resize-y", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputBase, "appearance-none bg-surface", className)} {...rest}>
      {children}
    </select>
  );
}

export function EmptyState({ icon, title, sub, action }: { icon?: ReactNode; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line2 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-dim">{icon}</div>}
      <div className="font-display text-sm font-semibold uppercase tracking-wider text-mute">{title}</div>
      {sub && <p className="mt-1.5 max-w-sm text-sm text-dim">{sub}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div
        className={cx(
          "rise card my-8 w-full max-h-[86vh] overflow-y-auto p-6 shadow-2xl shadow-black/60",
          wide ? "max-w-2xl" : "max-w-md"
        )}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold uppercase tracking-wide">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-mute transition-colors hover:bg-surface2 hover:text-ink" aria-label="Tutup">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return <p className="mt-2 rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-xs text-coral">{children}</p>;
}
