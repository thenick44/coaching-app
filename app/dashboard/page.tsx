"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

type DashboardActivity = {
  strava_activity_id: number;
  raw_json: {
    id?: number;
    name?: string;
    start_date?: string;
    distance?: number;
    total_elevation_gain?: number;
    moving_time?: number;
    type?: string;
    sport_type?: string;
    [key: string]: any;
  };
};

type DashboardPayload = {
  developmentMode: boolean;
  targetUserId: string | null;
  activityCount: number;
  activities: DashboardActivity[];
};

const PRIMARY_ACTIVITY_TYPES = new Set([
  "Ride",
  "VirtualRide",
  "MountainBikeRide",
  "GravelRide",
  "Run",
]);

const SECONDARY_ACTIVITY_TYPES = new Set(["Walk", "WeightTraining"]);

function metersToMiles(meters: number) {
  return meters / 1609.34;
}

function metersToFeet(meters: number) {
  return meters * 3.28084;
}

function secondsToHoursMinutes(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${minutes}m`;
}

function formatActivityDate(dateString?: string) {
  if (!dateString) return "Unknown date";
  const date = new Date(dateString);
  if (Number.isNaN(date.valueOf())) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

type SummaryTotals = {
  distance: number;
  elevation: number;
  movingTime: number;
  count: number;
};

function summarizeActivityMetrics(activities: DashboardActivity[], since: Date) {
  return activities.reduce(
    (summary, activity) => {
      const activityDate = activity.raw_json?.start_date
        ? new Date(activity.raw_json.start_date)
        : null;
      if (!activityDate || Number.isNaN(activityDate.valueOf())) return summary;
      if (activityDate < since) return summary;

      summary.distance += activity.raw_json?.distance ?? 0;
      summary.elevation += activity.raw_json?.total_elevation_gain ?? 0;
      summary.movingTime += activity.raw_json?.moving_time ?? 0;
      return summary;
    },
    {
      distance: 0,
      elevation: 0,
      movingTime: 0,
    }
  );
}

function summarizeActivityMetricsBetween(
  activities: DashboardActivity[],
  start: Date,
  end: Date
): SummaryTotals {
  return activities.reduce(
    (summary, activity) => {
      const activityDate = activity.raw_json?.start_date
        ? new Date(activity.raw_json.start_date)
        : null;
      if (!activityDate || Number.isNaN(activityDate.valueOf())) return summary;
      if (activityDate < start || activityDate >= end) return summary;

      summary.distance += activity.raw_json?.distance ?? 0;
      summary.elevation += activity.raw_json?.total_elevation_gain ?? 0;
      summary.movingTime += activity.raw_json?.moving_time ?? 0;
      summary.count += 1;
      return summary;
    },
    {
      distance: 0,
      elevation: 0,
      movingTime: 0,
      count: 0,
    }
  );
}

function getLastNDaysDistance(activities: DashboardActivity[], days: number, referenceDate: Date) {
  const dailyTotals: Record<string, number> = {};
  const result: Array<{ date: Date; distance: number }> = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(referenceDate);
    date.setHours(0, 0, 0, 0);
    date.setDate(referenceDate.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    dailyTotals[key] = 0;
    result.push({ date: new Date(date), distance: 0 });
  }

  activities.forEach((activity) => {
    const activityDate = activity.raw_json?.start_date
      ? new Date(activity.raw_json.start_date)
      : null;
    if (!activityDate || Number.isNaN(activityDate.valueOf())) return;

    const day = new Date(activityDate);
    day.setHours(0, 0, 0, 0);
    const key = day.toISOString().slice(0, 10);

    if (key in dailyTotals) {
      dailyTotals[key] += activity.raw_json?.distance ?? 0;
    }
  });

  return result.map((entry) => ({
    date: entry.date,
    distance: dailyTotals[entry.date.toISOString().slice(0, 10)] ?? 0,
  }));
}

function formatDifferenceValue(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}`;
}

function formatDifferenceTime(seconds: number) {
  const sign = seconds > 0 ? "+" : "";
  const formatted = secondsToHoursMinutes(Math.abs(seconds));
  return `${sign}${formatted}`;
}

function formatDailyChartLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
}

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

  const activities = dashboardData?.activities ?? [];
  const sortedActivities = [...activities].sort((a, b) => {
    const aDate = new Date(a.raw_json?.start_date ?? 0).valueOf();
    const bDate = new Date(b.raw_json?.start_date ?? 0).valueOf();
    return bDate - aDate || b.strava_activity_id - a.strava_activity_id;
  });

  const lastActivity = sortedActivities[0];
  const totalActivities = activities.length;

  const primaryActivities = activities.filter((activity) => {
    const activityType = activity.raw_json?.type ?? activity.raw_json?.sport_type ?? "";
    return PRIMARY_ACTIVITY_TYPES.has(activityType);
  });

  const secondaryActivities = activities.filter((activity) => {
    const activityType = activity.raw_json?.type ?? activity.raw_json?.sport_type ?? "";
    return SECONDARY_ACTIVITY_TYPES.has(activityType);
  });

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - today.getDay());

  const lastWeekStart = new Date(currentWeekStart);
  lastWeekStart.setDate(currentWeekStart.getDate() - 7);

  const lastWeekEnd = new Date(currentWeekStart);

  const primary7Day = summarizeActivityMetrics(primaryActivities, sevenDaysAgo);
  const primary30Day = summarizeActivityMetrics(primaryActivities, thirtyDaysAgo);
  const secondary7Day = summarizeActivityMetrics(secondaryActivities, sevenDaysAgo);
  const secondary30Day = summarizeActivityMetrics(secondaryActivities, thirtyDaysAgo);

  const currentWeekSummary = summarizeActivityMetricsBetween(primaryActivities, currentWeekStart, new Date(today.getTime() + 24 * 60 * 60 * 1000));
  const lastWeekSummary = summarizeActivityMetricsBetween(primaryActivities, lastWeekStart, lastWeekEnd);
  const diffSummary = {
    distance: currentWeekSummary.distance - lastWeekSummary.distance,
    elevation: currentWeekSummary.elevation - lastWeekSummary.elevation,
    movingTime: currentWeekSummary.movingTime - lastWeekSummary.movingTime,
    count: currentWeekSummary.count - lastWeekSummary.count,
  };

  const recentActivities = sortedActivities.slice(0, 8);
  const dailyDistances = getLastNDaysDistance(primaryActivities, 14, today);

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
                  <p className="text-3xl font-semibold text-white">{totalActivities}</p>
                  <p className="mt-1 text-sm text-slate-400">total activities</p>
                </div>
                <div className="rounded-2xl bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
                  {isDevMode
                    ? "Development fallback is loading data from the first Strava connection."
                    : "Authenticated dashboard session is active."}
                </div>
              </div>
            </div>

            <div className="grid gap-6">
              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
                <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Training summary</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-4">
                  <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">This week</p>
                    <p className="mt-3 text-sm text-slate-400">Distance</p>
                    <p className="text-xl font-semibold text-white">{metersToMiles(currentWeekSummary.distance).toFixed(1)} mi</p>
                    <p className="mt-3 text-sm text-slate-400">Elevation</p>
                    <p className="text-xl font-semibold text-white">{Math.round(metersToFeet(currentWeekSummary.elevation))} ft</p>
                    <p className="mt-3 text-sm text-slate-400">Time</p>
                    <p className="text-xl font-semibold text-white">{secondsToHoursMinutes(currentWeekSummary.movingTime)}</p>
                    <p className="mt-3 text-sm text-slate-400">Activities</p>
                    <p className="text-xl font-semibold text-white">{currentWeekSummary.count}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Last week</p>
                    <p className="mt-3 text-sm text-slate-400">Distance</p>
                    <p className="text-xl font-semibold text-white">{metersToMiles(lastWeekSummary.distance).toFixed(1)} mi</p>
                    <p className="mt-3 text-sm text-slate-400">Elevation</p>
                    <p className="text-xl font-semibold text-white">{Math.round(metersToFeet(lastWeekSummary.elevation))} ft</p>
                    <p className="mt-3 text-sm text-slate-400">Time</p>
                    <p className="text-xl font-semibold text-white">{secondsToHoursMinutes(lastWeekSummary.movingTime)}</p>
                    <p className="mt-3 text-sm text-slate-400">Activities</p>
                    <p className="text-xl font-semibold text-white">{lastWeekSummary.count}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Difference</p>
                    <p className="mt-3 text-sm text-slate-400">Distance</p>
                    <p className="text-xl font-semibold text-white">{formatDifferenceValue(Number(metersToMiles(diffSummary.distance).toFixed(1)))} mi</p>
                    <p className="mt-3 text-sm text-slate-400">Elevation</p>
                    <p className="text-xl font-semibold text-white">{formatDifferenceValue(Math.round(metersToFeet(diffSummary.elevation)))} ft</p>
                    <p className="mt-3 text-sm text-slate-400">Time</p>
                    <p className="text-xl font-semibold text-white">{formatDifferenceTime(diffSummary.movingTime)}</p>
                    <p className="mt-3 text-sm text-slate-400">Activities</p>
                    <p className="text-xl font-semibold text-white">{formatDifferenceValue(diffSummary.count)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">14-day distance</p>
                    <div className="mt-4 grid h-36 grid-cols-14 gap-1">
                      {dailyDistances.map((item) => {
                        const height = item.distance ? Math.min(100, (item.distance / 1609.34) * 4) : 2;
                        return (
                          <div key={item.date.toISOString()} className="relative flex items-end justify-center">
                            <div
                              className="w-full rounded-t-lg bg-cyan-500"
                              style={{ height: `${Math.max(2, height)}%` }}
                              title={`${formatActivityDate(item.date.toISOString())}: ${metersToMiles(item.distance).toFixed(1)} mi`}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 grid grid-cols-7 gap-1 text-[10px] text-slate-500">
                      {dailyDistances.map((item) => (
                        <span key={item.date.toISOString()} className="text-center">
                          {formatDailyChartLabel(item.date)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
                <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Last activity</p>
                {lastActivity ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-xl font-semibold text-white">
                      {lastActivity.raw_json?.name || "Unnamed activity"}
                    </p>
                    <p className="text-sm text-slate-400">{formatActivityDate(lastActivity.raw_json?.start_date)}</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Distance</p>
                        <p className="mt-2 text-lg font-semibold text-white">
                          {lastActivity.raw_json?.distance != null
                            ? `${metersToMiles(lastActivity.raw_json.distance).toFixed(1)} mi`
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Elevation</p>
                        <p className="mt-2 text-lg font-semibold text-white">
                          {lastActivity.raw_json?.total_elevation_gain != null
                            ? `${Math.round(metersToFeet(lastActivity.raw_json.total_elevation_gain))} ft`
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Moving time</p>
                        <p className="mt-2 text-lg font-semibold text-white">
                          {lastActivity.raw_json?.moving_time != null
                            ? secondsToHoursMinutes(lastActivity.raw_json.moving_time)
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-400">No recent activity available.</p>
                )}
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
                <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Recent activity metrics</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Last 7 days</p>
                    <p className="mt-3 text-sm text-slate-400">Distance</p>
                    <p className="text-xl font-semibold text-white">{metersToMiles(primary7Day.distance).toFixed(1)} mi</p>
                    <p className="mt-3 text-sm text-slate-400">Elevation</p>
                    <p className="text-xl font-semibold text-white">{Math.round(metersToFeet(primary7Day.elevation))} ft</p>
                    <p className="mt-3 text-sm text-slate-400">Moving time</p>
                    <p className="text-xl font-semibold text-white">{secondsToHoursMinutes(primary7Day.movingTime)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Last 30 days</p>
                    <p className="mt-3 text-sm text-slate-400">Distance</p>
                    <p className="text-xl font-semibold text-white">{metersToMiles(primary30Day.distance).toFixed(1)} mi</p>
                    <p className="mt-3 text-sm text-slate-400">Elevation</p>
                    <p className="text-xl font-semibold text-white">{Math.round(metersToFeet(primary30Day.elevation))} ft</p>
                    <p className="mt-3 text-sm text-slate-400">Moving time</p>
                    <p className="text-xl font-semibold text-white">{secondsToHoursMinutes(primary30Day.movingTime)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
              <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Recent activities</p>
              {recentActivities.length ? (
                <ul className="mt-4 space-y-4">
                  {recentActivities.map((activity) => (
                    <li key={activity.strava_activity_id} className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-white">{activity.raw_json?.name || "Unnamed activity"}</p>
                          <p className="text-sm text-slate-400">{formatActivityDate(activity.raw_json?.start_date)}</p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <div className="rounded-2xl bg-slate-900/80 px-3 py-2 text-xs uppercase tracking-[0.24em] text-slate-500">
                            {activity.raw_json?.type || activity.raw_json?.sport_type || "Unknown"}
                          </div>
                          <div className="rounded-2xl bg-slate-900/80 px-3 py-2 text-xs uppercase tracking-[0.24em] text-slate-500">
                            {activity.raw_json?.distance != null
                              ? `${metersToMiles(activity.raw_json.distance).toFixed(1)} mi`
                              : "—"}
                          </div>
                          <div className="rounded-2xl bg-slate-900/80 px-3 py-2 text-xs uppercase tracking-[0.24em] text-slate-500">
                            {activity.raw_json?.moving_time != null
                              ? secondsToHoursMinutes(activity.raw_json.moving_time)
                              : "—"}
                          </div>
                        </div>
                      </div>
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
