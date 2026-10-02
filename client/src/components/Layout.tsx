import { NavLink, Outlet, useNavigate } from "react-router";
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

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/activities", label: "Aktivitas", icon: Bike },
  { to: "/targets", label: "Target", icon: TargetIcon },
  { to: "/plan", label: "Rencana", icon: CalendarDays },
  { to: "/coach", label: "Pelatih AI", icon: Sparkles },
  { to: "/settings", label: "Pengaturan", icon: SettingsIcon },
];

export default function Layout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<UserProfileDTO>("/auth/me"),
  });

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
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-surface/80 backdrop-blur-md">
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

      <main className="ml-60 flex-1 px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
