import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { UserProfileDTO } from "shared";
import { api } from "./lib/api";
import { Spinner } from "./components/ui";
import Layout from "./components/Layout";
import { LoginPage, RegisterPage } from "./pages/Auth";
import OnboardingPage from "./pages/Onboarding";
import DashboardPage from "./pages/Dashboard";
import ActivitiesPage from "./pages/Activities";
import ActivityDetailPage from "./pages/ActivityDetail";
import TargetsPage from "./pages/Targets";
import TargetAnalysisPage from "./pages/TargetAnalysis";
import PlanPage from "./pages/Plan";
import CoachPage from "./pages/Coach";
import SettingsPage from "./pages/Settings";
import AdminPage from "./pages/Admin";
import StravaCallbackPage from "./pages/StravaCallback";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
});

function FullSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner size={28} className="text-volt" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { data, isLoading, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<UserProfileDTO>("/auth/me"),
  });

  if (isLoading) return <FullSpinner />;
  if (error) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (data && !data.onboardingDone) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<UserProfileDTO>("/auth/me"),
  });
  if (isLoading) return <FullSpinner />;
  if (data) return <Navigate to={data.onboardingDone ? "/" : "/onboarding"} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
          <Route path="/register" element={<RedirectIfAuthed><RegisterPage /></RedirectIfAuthed>} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/strava/callback" element={<StravaCallbackPage />} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<DashboardPage />} />
            <Route path="/activities" element={<ActivitiesPage />} />
            <Route path="/activities/:id" element={<ActivityDetailPage />} />
            <Route path="/targets" element={<TargetsPage />} />
            <Route path="/targets/:id/analysis" element={<TargetAnalysisPage />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/coach" element={<CoachPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
