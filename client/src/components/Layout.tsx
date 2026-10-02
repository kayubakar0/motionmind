import { NavLink, Outlet, Link, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  LayoutDashboard,
  Bike,
  Target as TargetIcon,
  CalendarDays,
  Sparkles,
  Settings as SettingsIcon,
  ShieldCheck,
  LogOut,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";
import type { UserProfileDTO } from "shared";
import { cx } from "./ui";
import OfflineBanner from "./OfflineBanner";

const NAV = [
  { to: "/", label: "Dashboard", labelShort: "Home", icon: LayoutDashboard },
  { to: "/activities", label: "Aktivitas", labelShort: "Aktiv.", icon: Bike },
  { to: "/targets", label: "Target", labelShort: "Target", icon: TargetIcon },
  { to: "/plan", label: "Rencana", labelShort: "Rencana", icon: CalendarDays },
  { to: "/coach", label: "Pelatih AI", labelShort: "Coach", icon: Sparkles },
  { to: "/settings", label: "Pengaturan", labelShort: "Atur", icon: SettingsIcon },
];

const MOBILE_NAV = NAV.filter((n) => n.to !== "/settings");

export default function Layout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<UserProfileDTO>("/auth/me"),
  });

  const initial = (me?.name || me?.username || "?").charAt(0).toUpperCase();

  async function logout() {
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      qc.clear();
      navigate("/login", { replace: true });
    }
  }

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-surface/80 backdrop-blur-md md:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="pulse-glow flex h-9 w-9 items-center justify-center rounded-xl bg-volt text-bg">
            <Zap size={20} strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-display text-[15px] font-bold tracking-[0.22em]">MOTIONMIND</div>
            <div className="text-[10px] tracking-[0.3em] text-dim uppercase">AI Training Coach</div>
          </div>
        </div>

        <nav className="mt-2 flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cx(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all",
                  isActive
                    ? "bg-volt/10 text-volt border border-volt/20"
                    : "text-mute border border-transparent hover:bg-surface2 hover:text-ink"
                )
              }
            >
              <Icon size={17} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
          {me?.role === "admin" && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                cx(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all",
                  isActive
                    ? "bg-aqua/10 text-aqua border border-aqua/20"
                    : "text-mute border border-transparent hover:bg-surface2 hover:text-ink"
                )
              }
            >
              <ShieldCheck size={17} strokeWidth={2} />
              Admin
            </NavLink>
          )}
        </nav>

        <div className="border-t border-line p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{me?.name || me?.username || "…"}</div>
              <div className="truncate text-[11px] text-dim">@{me?.username}</div>
            </div>
            <button
              onClick={logout}
              disabled={busy}
              className="rounded-lg p-2 text-dim transition-colors hover:bg-coral/10 hover:text-coral"
              title="Keluar"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <header className="fixed inset-x-0 top-0 z-40 flex h-[calc(3.5rem_+_env(safe-area-inset-top))] items-center justify-between border-b border-line bg-surface/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md md:hidden">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="pulse-glow flex h-8 w-8 items-center justify-center rounded-lg bg-volt text-bg">
            <Zap size={17} strokeWidth={2.5} />
          </div>
          <span className="font-display text-[13px] font-bold tracking-[0.24em]">MOTIONMIND</span>
        </Link>
        <div className="flex items-center gap-2">
          {me?.role === "admin" && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                cx(
                  "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
                  isActive ? "border-aqua/30 bg-aqua/10 text-aqua" : "border-line text-mute"
                )
              }
              aria-label="Admin"
            >
              <ShieldCheck size={17} />
            </NavLink>
          )}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cx(
                "flex h-9 w-9 items-center justify-center rounded-lg border font-display text-sm font-bold transition-colors",
                isActive ? "border-volt/40 bg-volt/10 text-volt" : "border-line bg-surface2 text-mute"
              )
            }
            aria-label="Pengaturan"
          >
            {initial}
          </NavLink>
        </div>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/92 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid h-16 grid-cols-5">
          {MOBILE_NAV.map(({ to, labelShort, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cx(
                  "flex flex-col items-center justify-center gap-1 transition-colors",
                  isActive ? "text-volt" : "text-dim active:text-mute"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cx("relative", isActive && "drop-shadow-[0_0_8px_rgba(201,242,75,0.5)]")}>
                    <Icon size={21} strokeWidth={isActive ? 2.3 : 1.8} />
                    <span
                      className={cx(
                        "absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-volt transition-opacity",
                        isActive ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </span>
                  <span className="font-display text-[9px] font-semibold uppercase tracking-[0.14em]">{labelShort}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="w-full flex-1 px-4 pt-[calc(4.25rem_+_env(safe-area-inset-top))] pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] md:ml-60 md:px-6 md:pt-8 md:pb-8 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      <OfflineBanner />
    </div>
  );
}
