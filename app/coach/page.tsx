"use client";

import { useEffect, useRef, useState } from "react";
import Protected from "../components/Protected";
import { supabase } from "@/src/lib/supabaseClient";

type CoachingReport = {
  id: string;
  report_week_start: string;
  report_week_end: string;
  total_distance_miles: number;
  total_elevation_feet: number;
  total_moving_time_minutes: number;
  previous_week_distance_miles: number | null;
  previous_week_elevation_feet: number | null;
  previous_week_moving_time_minutes: number | null;
  readiness_score: number | null;
  report_summary: string | null;
  upcoming_goals: Array<{
    name: string;
    event_date: string;
    event_type: string | null;
    distance_miles: number | null;
    event_location: string | null;
  }>;
  created_at: string;
};

type CoachingReportPayload = {
  developmentMode: boolean;
  reports: CoachingReport[];
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDistance(value: number | null) {
  return value != null ? `${value.toFixed(1)} mi` : "—";
}

function formatElevation(value: number | null) {
  return value != null ? `${Math.round(value)} ft` : "—";
}

function formatMovingTime(minutes: number | null) {
  if (minutes == null) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins.toString().padStart(2, "0")}m` : `${mins}m`;
}

function getWeekLabel(startDate: string, endDate: string) {
  return `${formatDate(startDate)} — ${formatDate(endDate)}`;
}

export default function CoachPage() {
  const mounted = useRef(true);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<CoachingReport[]>([]);
  const [isDevMode, setIsDevMode] = useState(false);
  const [signedIn, setSignedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    mounted.current = true;

    async function loadReports() {
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

      const response = await fetch("/api/coaching_reports", {
        method: "GET",
        headers,
      });

      const payload = (await response.json().catch(() => null)) as CoachingReportPayload | { error?: string } | null;
      if (!mounted.current) return;

      if (!response.ok) {
        setError((payload as any)?.error || "Failed to load coaching reports.");
        setReports([]);
      } else {
        setReports((payload as CoachingReportPayload).reports ?? []);
        setIsDevMode((payload as CoachingReportPayload).developmentMode ?? false);
      }

      setLoading(false);
    }

    loadReports();

    return () => {
      mounted.current = false;
    };
  }, []);

  async function createWeeklyReport() {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);

    const sessionResult = await supabase.auth.getSession();
    const session = sessionResult.data?.session;
    const accessToken = session?.access_token;

    const response = await fetch("/api/coaching_reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({}),
    });

    const payload = (await response.json().catch(() => null)) as
      | { report?: CoachingReport; reports?: CoachingReport[]; error?: string }
      | null;

    if (!response.ok || !payload) {
      setError((payload as any)?.error || "Failed to generate weekly report.");
      setCreating(false);
      return;
    }

    const newReport = (payload as any).report as CoachingReport | undefined;
    if (newReport) {
      setReports((prev) => [newReport, ...prev]);
      setSuccess("Weekly coaching report generated successfully.");
    } else {
      setError("Report generated but no report data was returned.");
    }

    setCreating(false);
  }

  const latestReport = reports[0];

  return (
    <Protected>
      <main className="min-h-[calc(100vh-88px)] bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 px-6 py-10 text-white">
        <div className="mx-auto flex min-h-full max-w-6xl flex-col justify-center gap-8 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
          <div className="space-y-4 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">Coach</p>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">Weekly Coaching Reports</h1>
            <p className="mx-auto max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Generate a data-driven weekly coaching summary from your recent Strava activity and upcoming goals. Keep your plan focused and monitor readiness over time.
            </p>
          </div>

          {!signedIn && (
            <div className="mx-auto max-w-2xl rounded-2xl border border-yellow-500/30 bg-yellow-950/30 p-4 text-sm text-yellow-200 shadow-lg shadow-black/20">
              <p className="font-semibold">Development Mode - Not signed in</p>
              <p className="mt-1 text-yellow-100">
                A temporary fallback is active so you can generate reports from available Strava activity when a signed-in user is not present.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200 shadow-lg shadow-black/20">
              <p className="font-semibold">Error</p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {success && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm text-emerald-200 shadow-lg shadow-black/20">
              <p className="font-semibold">Success</p>
              <p className="mt-1">{success}</p>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(320px,1fr)_minmax(320px,1fr)]">
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Create report</p>
                  <p className="mt-3 text-lg text-slate-300">
                    Generate a new weekly coaching report based on your latest 12 weeks of activity and current goals.
                  </p>
                </div>
                <button
                  onClick={createWeeklyReport}
                  disabled={creating}
                  className="inline-flex items-center justify-center rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? "Generating..." : "Generate report"}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
              <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Latest report</p>
              {loading ? (
                <p className="mt-4 text-sm text-slate-400">Loading reports...</p>
              ) : latestReport ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-3xl bg-slate-950/80 p-4">
                    <p className="text-sm text-slate-400">Week</p>
                    <p className="mt-2 text-lg font-semibold text-white">{getWeekLabel(latestReport.report_week_start, latestReport.report_week_end)}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-3xl bg-slate-950/80 p-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Distance</p>
                      <p className="mt-3 text-xl font-semibold text-white">{formatDistance(latestReport.total_distance_miles)}</p>
                    </div>
                    <div className="rounded-3xl bg-slate-950/80 p-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Elevation</p>
                      <p className="mt-3 text-xl font-semibold text-white">{formatElevation(latestReport.total_elevation_feet)}</p>
                    </div>
                    <div className="rounded-3xl bg-slate-950/80 p-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Moving time</p>
                      <p className="mt-3 text-xl font-semibold text-white">{formatMovingTime(latestReport.total_moving_time_minutes)}</p>
                    </div>
                  </div>
                  <div className="rounded-3xl bg-slate-950/80 p-4 text-sm text-slate-300">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Readiness score</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{latestReport.readiness_score ?? "—"}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-400">No reports available yet. Generate one to get started.</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Saved coaching reports</p>
                <p className="mt-2 text-sm text-slate-300">
                  Review your weekly summaries and coaching recommendations over time.
                </p>
              </div>
              <span className="rounded-full bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.28em] text-slate-400">
                {reports.length} reports
              </span>
            </div>

            {loading ? (
              <p className="mt-6 text-sm text-slate-400">Loading saved reports...</p>
            ) : reports.length ? (
              <div className="mt-6 space-y-4">
                {reports.map((report) => (
                  <article key={report.id} className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm uppercase tracking-[0.28em] text-slate-400">{getWeekLabel(report.report_week_start, report.report_week_end)}</p>
                        <p className="mt-2 text-base leading-7 text-slate-300">{report.report_summary ?? "No summary available."}</p>
                      </div>
                      <p className="text-sm text-slate-500">{formatDate(report.created_at)}</p>
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-4">
                      <div className="rounded-2xl bg-slate-900/80 p-4 text-sm text-slate-300">
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Distance</p>
                        <p className="mt-2 text-lg font-semibold text-white">{formatDistance(report.total_distance_miles)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-900/80 p-4 text-sm text-slate-300">
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Elevation</p>
                        <p className="mt-2 text-lg font-semibold text-white">{formatElevation(report.total_elevation_feet)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-900/80 p-4 text-sm text-slate-300">
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Time</p>
                        <p className="mt-2 text-lg font-semibold text-white">{formatMovingTime(report.total_moving_time_minutes)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-900/80 p-4 text-sm text-slate-300">
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Readiness</p>
                        <p className="mt-2 text-lg font-semibold text-white">{report.readiness_score ?? "—"}</p>
                      </div>
                    </div>

                    {report.upcoming_goals?.length ? (
                      <div className="mt-5 rounded-2xl bg-slate-900/80 p-4 text-sm text-slate-300">
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Upcoming goals</p>
                        <ul className="mt-3 space-y-2">
                          {report.upcoming_goals.map((goal, index) => (
                            <li key={`${report.id}-goal-${index}`} className="rounded-2xl bg-slate-950/80 p-3">
                              <p className="font-semibold text-white">{goal.name}</p>
                              <p className="mt-1 text-slate-400">{formatDate(goal.event_date)} · {goal.event_type ?? "Event"} · {formatDistance(goal.distance_miles)}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-400">No coaching reports have been generated yet.</p>
            )}
          </div>
        </div>
      </main>
    </Protected>
  );
}
