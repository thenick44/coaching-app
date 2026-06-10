"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

type DashboardActivity = {
  strava_activity_id: number;
  raw_json: any;
};

type DashboardPayload = {
  developmentMode: boolean;
  targetUserId: string | null;
  activityCount: number;
  activities: DashboardActivity[];
};

export default function DashboardPage() {
  const mounted = useRef(true);
  const [loading, setLoading] = useState(true);
  const [isDevMode, setIsDevMode] = useState(false);
  const [signedIn, setSignedIn] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;

    async function loadDashboard() {
      if (!supabase) {
        setError("Supabase is not configured.");
        setSignedIn(false);
        setLoading(false);
        return;
      }

      const sessionResult = await supabase.auth.getSession();
      const session = sessionResult.data?.session;
      const accessToken = session?.access_token;
      const hasSession = Boolean(session?.user?.id);
      setSignedIn(hasSession);

      const headers = accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : undefined;

      const response = await fetch("/api/dashboard/data", {
        method: "GET",
        headers,
      });

      const payload = (await response.json().catch(() => null)) as DashboardPayload | { error?: string } | null;
      if (!mounted.current) return;

      if (!response.ok) {
        setError((payload as any)?.error || "Failed to load dashboard data.");
        setDashboardData(null);
      } else {
        setDashboardData(payload as DashboardPayload);
        setIsDevMode((payload as DashboardPayload).developmentMode ?? false);
      }

      setLoading(false);
    }

    loadDashboard();

    return () => {
      mounted.current = false;
    };
  }, []);

  return (
    <main className="min-h-[calc(100vh-88px)] bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 px-6 py-10 text-white">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center gap-8 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
        <div className="space-y-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">
            Dashboard
          </p>
          <h1 className="text-4xl font-semibold text-white sm:text-5xl">Training Dashboard</h1>
          <p className="mx-auto max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            View your training load, ride history, and recovery trends in one polished overview built for cyclists and endurance athletes.
          </p>
        </div>

        {!signedIn && (
          <div className="mx-auto max-w-2xl rounded-2xl border border-yellow-500/30 bg-yellow-950/30 p-4 text-sm text-yellow-200 shadow-lg shadow-black/20">
            <p className="font-semibold">Development Mode - Not signed in</p>
            <p className="mt-1 text-yellow-100">
              Temporary development-only fallback is active. Dashboard data is loaded from the first
              <span className="font-medium text-white"> strava_connections</span> row.
            </p>
          </div>
        )}

        {error && (
          <div className="mx-auto max-w-2xl rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200 shadow-lg shadow-black/20">
            <p className="font-semibold">Error</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-left shadow-lg shadow-black/20 sm:p-8">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Loading dashboard data...</p>
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
              <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Summary</p>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-3xl font-semibold text-white">{dashboardData?.activityCount ?? 0}</p>
                  <p className="mt-1 text-sm text-slate-400">activities loaded</p>
                </div>
                <div className="rounded-2xl bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
                  {isDevMode
                    ? "Development fallback is loading data from the first Strava connection."
                    : "Authenticated dashboard session is active."}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
              <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Recent activities</p>
              {dashboardData?.activities?.length ? (
                <ul className="mt-4 space-y-4">
                  {dashboardData.activities.slice(0, 5).map((activity) => (
                    <li key={activity.strava_activity_id} className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                      <p className="font-semibold text-white">Activity {activity.strava_activity_id}</p>
                      <p className="mt-2 text-sm text-slate-400">
                        {activity.raw_json?.name || "Unnamed activity"}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-slate-400">No activities available yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
