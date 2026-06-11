"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import Protected from "../components/Protected";

type WeeklyTrend = {
  direction: "increasing" | "decreasing" | "steady";
  recent_average_miles?: number;
  previous_average_miles?: number;
  recent_average_feet?: number;
  previous_average_feet?: number;
};

type LongestEffort = {
  distance_miles: number;
  name: string | null;
  date: string | null;
};

type GoalAnalysis = {
  goal: {
    id: string;
    name: string;
    event_date: string;
    event_location: string | null;
    event_type: string | null;
    distance_miles: number | null;
    elevation_feet: number | null;
    target_finish_time: string | null;
    expected_low_temp_f: number | null;
    expected_high_temp_f: number | null;
    days_until_event: number;
  } | null;
  countdown: string | null;
  trends: {
    weekly_distance: WeeklyTrend;
    weekly_elevation: WeeklyTrend;
  };
  recent_training_load: {
    average_weekly_distance_miles: number;
    average_weekly_elevation_feet: number;
    average_weekly_moving_time_minutes: number;
  };
  longest_efforts_last_8_weeks: {
    ride: LongestEffort | null;
    run: LongestEffort | null;
  };
  analysis: {
    volume_comparison: string;
    climbing_comparison: string;
    readiness_risks: string[];
    strengths: string[];
  };
  recommendations: Record<string, string>;
  training_plan_progress: TrainingPlanProgress | null;
};

type TrainingPlanProgress = {
  plan_id: string;
  plan_name: string;
  week_workouts: Array<{
    id: string;
    scheduled_date: string;
    workout_type: string;
    title: string;
    completed: boolean;
    distance_miles: number | null;
    duration_minutes: number | null;
  }>;
  completed_count: number;
  total_count: number;
  adherence_percent: number | null;
};

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
  goal_analysis: GoalAnalysis | null;
  created_at: string;
};

type CoachingReportPayload = {
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

function formatTrendDirection(direction: WeeklyTrend["direction"]) {
  if (direction === "increasing") return "Increasing";
  if (direction === "decreasing") return "Decreasing";
  return "Steady";
}

const recommendationLabels: Record<string, string> = {
  endurance_focus: "Endurance focus",
  climbing_focus: "Climbing focus",
  recovery_focus: "Recovery focus",
  heat_adaptation_focus: "Heat adaptation focus",
};

export default function CoachPage() {
  const mounted = useRef(true);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<CoachingReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    mounted.current = true;

    async function loadReports() {
      if (!supabase) {
        setError("Supabase is not configured.");
        setLoading(false);
        return;
      }

      const sessionResult = await supabase.auth.getSession();
      const session = sessionResult.data?.session;
      const accessToken = session?.access_token;

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
        setError((payload as { error?: string } | null)?.error || "Failed to load coaching reports.");
        setReports([]);
      } else {
        setReports((payload as CoachingReportPayload).reports ?? []);
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
      setError(payload?.error || "Failed to generate weekly report.");
      setCreating(false);
      return;
    }

    const newReport = payload.report;
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

          {!loading && latestReport?.goal_analysis && (
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
              <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Goal readiness</p>
              {latestReport.goal_analysis.countdown ? (
                <p className="mt-3 text-2xl font-semibold text-white">{latestReport.goal_analysis.countdown}</p>
              ) : (
                <p className="mt-3 text-base text-slate-300">No upcoming goal is set yet.</p>
              )}
              {latestReport.goal_analysis.goal && (
                <p className="mt-1 text-sm text-slate-400">
                  {latestReport.goal_analysis.goal.event_location ?? "Location TBD"} · {latestReport.goal_analysis.goal.event_type ?? "Event"} · {formatDate(latestReport.goal_analysis.goal.event_date)}
                </p>
              )}

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Distance trend</p>
                  <p className="mt-2 text-lg font-semibold text-white">{formatTrendDirection(latestReport.goal_analysis.trends.weekly_distance.direction)}</p>
                  <p className="mt-1 text-slate-400">{(latestReport.goal_analysis.trends.weekly_distance.recent_average_miles ?? 0).toFixed(1)} mi/wk avg</p>
                </div>
                <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Elevation trend</p>
                  <p className="mt-2 text-lg font-semibold text-white">{formatTrendDirection(latestReport.goal_analysis.trends.weekly_elevation.direction)}</p>
                  <p className="mt-1 text-slate-400">{Math.round(latestReport.goal_analysis.trends.weekly_elevation.recent_average_feet ?? 0)} ft/wk avg</p>
                </div>
                <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Longest ride (8 wks)</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {latestReport.goal_analysis.longest_efforts_last_8_weeks.ride
                      ? `${latestReport.goal_analysis.longest_efforts_last_8_weeks.ride.distance_miles.toFixed(1)} mi`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Longest run (8 wks)</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {latestReport.goal_analysis.longest_efforts_last_8_weeks.run
                      ? `${latestReport.goal_analysis.longest_efforts_last_8_weeks.run.distance_miles.toFixed(1)} mi`
                      : "—"}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Volume vs. goal</p>
                  <p className="mt-2 leading-6">{latestReport.goal_analysis.analysis.volume_comparison}</p>
                </div>
                <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Climbing vs. goal</p>
                  <p className="mt-2 leading-6">{latestReport.goal_analysis.analysis.climbing_comparison}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Strengths</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 leading-6">
                    {latestReport.goal_analysis.analysis.strengths.map((item, index) => (
                      <li key={`strength-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Readiness risks</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 leading-6">
                    {latestReport.goal_analysis.analysis.readiness_risks.map((item, index) => (
                      <li key={`risk-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-6 rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Training recommendations</p>
                <div className="mt-3 space-y-3">
                  {Object.entries(latestReport.goal_analysis.recommendations).map(([key, value]) => (
                    <div key={key}>
                      <p className="font-semibold text-white">{recommendationLabels[key] ?? key}</p>
                      <p className="mt-1 leading-6 text-slate-400">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {latestReport.goal_analysis.training_plan_progress && (
                <div className="mt-6 rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">This week&apos;s plan</p>
                    <span className="rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                      {latestReport.goal_analysis.training_plan_progress.completed_count}/{latestReport.goal_analysis.training_plan_progress.total_count} done
                      {latestReport.goal_analysis.training_plan_progress.adherence_percent != null
                        ? ` · ${latestReport.goal_analysis.training_plan_progress.adherence_percent}%`
                        : ""}
                    </span>
                  </div>
                  <p className="mt-2 text-base font-semibold text-white">{latestReport.goal_analysis.training_plan_progress.plan_name}</p>
                  {latestReport.goal_analysis.training_plan_progress.week_workouts.length ? (
                    <ul className="mt-3 space-y-2">
                      {latestReport.goal_analysis.training_plan_progress.week_workouts.map((workout) => (
                        <li key={workout.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-900/80 p-3">
                          <div>
                            <p className="font-semibold text-white">{workout.title}</p>
                            <p className="mt-1 text-slate-400">
                              {formatDate(workout.scheduled_date)} · {workout.workout_type}
                              {workout.distance_miles != null ? ` · ${workout.distance_miles} mi` : ""}
                              {workout.duration_minutes != null ? ` · ${workout.duration_minutes} min` : ""}
                            </p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${workout.completed ? "bg-emerald-500/10 text-emerald-300" : "bg-white/5 text-slate-400"}`}>
                            {workout.completed ? "Done" : "Pending"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-slate-400">No workouts scheduled for this week.</p>
                  )}
                </div>
              )}
            </div>
          )}

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
                        {report.goal_analysis?.countdown && (
                          <p className="mt-2 inline-block rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                            {report.goal_analysis.countdown}
                          </p>
                        )}
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
