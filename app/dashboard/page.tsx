"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { calculateEffortScore } from "@/src/lib/activityMetrics";
import Protected from "../components/Protected";
import StravaSyncButton from "../components/StravaSyncButton";
import TrendLineChart from "../components/TrendLineChart";

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
    [key: string]: unknown;
  };
};

type DashboardPayload = {
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

function formatActivityType(type?: string) {
  if (!type) return "Unknown";
  return type.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function metersPerSecondToMph(metersPerSecond: number) {
  return metersPerSecond * 2.23694;
}

function formatPace(metersPerSecond: number) {
  const secondsPerMile = 1609.34 / metersPerSecond;
  const minutes = Math.floor(secondsPerMile / 60);
  const seconds = Math.round(secondsPerMile % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")} /mi`;
}

function getPositiveNumber(raw: DashboardActivity["raw_json"] | undefined, key: string) {
  const value = raw?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ActivityDetailStat({ label, value, colorClass }: { label: string; value: string; colorClass: string }) {
  return (
    <div className={`rounded-xl border p-3 ${colorClass}`}>
      <p className="text-xs uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
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

function getLastNDaysEffort(activities: DashboardActivity[], days: number, referenceDate: Date) {
  const dailyTotals: Record<string, number> = {};
  const result: Array<{ date: Date; effort: number }> = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(referenceDate);
    date.setHours(0, 0, 0, 0);
    date.setDate(referenceDate.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    dailyTotals[key] = 0;
    result.push({ date: new Date(date), effort: 0 });
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
      dailyTotals[key] += calculateEffortScore(activity.raw_json);
    }
  });

  return result.map((entry) => ({
    date: entry.date,
    effort: dailyTotals[entry.date.toISOString().slice(0, 10)] ?? 0,
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

async function fetchDashboardData(): Promise<{ data?: DashboardPayload; error?: string }> {
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const sessionResult = await supabase.auth.getSession();
  const accessToken = sessionResult.data?.session?.access_token;
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;

  const response = await fetch("/api/dashboard/data", {
    method: "GET",
    headers,
  });

  const payload = (await response.json().catch(() => null)) as DashboardPayload | { error?: string } | null;

  if (!response.ok) {
    return { error: (payload as { error?: string } | null)?.error || "Failed to load dashboard data." };
  }

  return { data: payload as DashboardPayload };
}

const ACTIVITIES_PAGE_SIZE = 8;

export default function DashboardPage() {
  const mounted = useRef(true);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleActivityCount, setVisibleActivityCount] = useState(ACTIVITIES_PAGE_SIZE);
  const [expandedActivityId, setExpandedActivityId] = useState<number | null>(null);

  useEffect(() => {
    mounted.current = true;

    (async () => {
      const result = await fetchDashboardData();
      if (!mounted.current) return;

      if (result.error) {
        setError(result.error);
        setDashboardData(null);
      } else {
        setDashboardData(result.data ?? null);
      }

      setLoading(false);
    })();

    return () => {
      mounted.current = false;
    };
  }, []);

  const toggleActivity = useCallback((id: number) => {
    setExpandedActivityId((current) => (current === id ? null : id));
  }, []);

  const refreshDashboard = useCallback(async () => {
    const result = await fetchDashboardData();
    if (!mounted.current) return;

    if (result.error) {
      setError(result.error);
      setDashboardData(null);
    } else {
      setDashboardData(result.data ?? null);
    }
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

  const currentWeekSummary = summarizeActivityMetricsBetween(primaryActivities, currentWeekStart, new Date(today.getTime() + 24 * 60 * 60 * 1000));
  const lastWeekSummary = summarizeActivityMetricsBetween(primaryActivities, lastWeekStart, lastWeekEnd);
  const diffSummary = {
    distance: currentWeekSummary.distance - lastWeekSummary.distance,
    elevation: currentWeekSummary.elevation - lastWeekSummary.elevation,
    movingTime: currentWeekSummary.movingTime - lastWeekSummary.movingTime,
    count: currentWeekSummary.count - lastWeekSummary.count,
  };

  const recentActivities = sortedActivities.slice(0, visibleActivityCount);
  const hasMoreActivities = visibleActivityCount < sortedActivities.length;
  const dailyDistances = getLastNDaysDistance(primaryActivities, 14, today);
  const dailyEffort = getLastNDaysEffort(primaryActivities, 14, today);

  return (
    <Protected>
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
                <StravaSyncButton onSynced={refreshDashboard} />
              </div>
            </div>

            <div className="grid gap-6">
              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
                <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Training summary</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
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
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <TrendLineChart
                    title="14-day distance"
                    xLabels={dailyDistances.map((item) => formatDailyChartLabel(item.date))}
                    series={[
                      {
                        label: "Distance",
                        color: "#22d3ee",
                        values: dailyDistances.map((item) => metersToMiles(item.distance)),
                      },
                    ]}
                    units="mi"
                    formatValue={(value) => value.toFixed(1)}
                    pointTooltips={dailyDistances.map(
                      (item) => `${formatActivityDate(item.date.toISOString())}: ${metersToMiles(item.distance).toFixed(1)} mi`
                    )}
                    width={320}
                    height={140}
                  />
                  <TrendLineChart
                    title="14-day training load"
                    xLabels={dailyEffort.map((item) => formatDailyChartLabel(item.date))}
                    series={[
                      {
                        label: "Training load",
                        color: "#f59e0b",
                        values: dailyEffort.map((item) => item.effort),
                      },
                    ]}
                    units="effort pts"
                    formatValue={(value) => Math.round(value).toString()}
                    pointTooltips={dailyEffort.map(
                      (item) => `${formatActivityDate(item.date.toISOString())}: ${item.effort} effort pts`
                    )}
                    width={320}
                    height={140}
                  />
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
                <>
                  <ul className="mt-4 max-h-[32rem] space-y-4 overflow-y-auto pr-1">
                    {recentActivities.map((activity) => {
                      const isExpanded = expandedActivityId === activity.strava_activity_id;
                      const sportType = String(activity.raw_json?.type || activity.raw_json?.sport_type || "").toLowerCase();
                      const isRun = sportType.includes("run");

                      const elevationGain = activity.raw_json?.total_elevation_gain;
                      const elevationFeet = elevationGain != null ? metersToFeet(elevationGain) : null;
                      const avgSpeed = getPositiveNumber(activity.raw_json, "average_speed");
                      const avgHeartrate = getPositiveNumber(activity.raw_json, "average_heartrate");
                      const avgWatts = getPositiveNumber(activity.raw_json, "average_watts");
                      const calories = getPositiveNumber(activity.raw_json, "calories");

                      const hasDetails = elevationFeet != null || avgSpeed != null || avgHeartrate != null || avgWatts != null || calories != null;

                      return (
                        <li key={activity.strava_activity_id} className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                          <button
                            type="button"
                            onClick={() => toggleActivity(activity.strava_activity_id)}
                            aria-expanded={isExpanded}
                            className="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <p className="font-semibold text-white">{activity.raw_json?.name || "Unnamed activity"}</p>
                              <p className="text-sm text-slate-400">
                                {formatActivityDate(activity.raw_json?.start_date)} · {formatActivityType(activity.raw_json?.type || activity.raw_json?.sport_type)}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300">
                                {activity.raw_json?.distance != null
                                  ? `${metersToMiles(activity.raw_json.distance).toFixed(1)} mi`
                                  : "—"}
                              </span>
                              <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-300">
                                {activity.raw_json?.moving_time != null
                                  ? secondsToHoursMinutes(activity.raw_json.moving_time)
                                  : "—"}
                              </span>
                              <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
                                Effort {calculateEffortScore(activity.raw_json)}
                              </span>
                              <ChevronIcon className={`shrink-0 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 sm:grid-cols-4">
                              {elevationFeet != null && (
                                <ActivityDetailStat
                                  label="Elevation"
                                  value={`${Math.round(elevationFeet)} ft`}
                                  colorClass="border-emerald-400/10 bg-emerald-400/5 text-emerald-300"
                                />
                              )}
                              {avgSpeed != null && (
                                <ActivityDetailStat
                                  label={isRun ? "Avg pace" : "Avg speed"}
                                  value={isRun ? formatPace(avgSpeed) : `${metersPerSecondToMph(avgSpeed).toFixed(1)} mph`}
                                  colorClass="border-indigo-400/10 bg-indigo-400/5 text-indigo-300"
                                />
                              )}
                              {avgHeartrate != null && (
                                <ActivityDetailStat
                                  label="Avg heart rate"
                                  value={`${Math.round(avgHeartrate)} bpm`}
                                  colorClass="border-rose-400/10 bg-rose-400/5 text-rose-300"
                                />
                              )}
                              {avgWatts != null && (
                                <ActivityDetailStat
                                  label="Avg power"
                                  value={`${Math.round(avgWatts)} W`}
                                  colorClass="border-sky-400/10 bg-sky-400/5 text-sky-300"
                                />
                              )}
                              {calories != null && (
                                <ActivityDetailStat
                                  label="Calories"
                                  value={`${Math.round(calories)} cal`}
                                  colorClass="border-orange-400/10 bg-orange-400/5 text-orange-300"
                                />
                              )}
                              {!hasDetails && (
                                <p className="col-span-full text-sm text-slate-400">No additional details available for this activity.</p>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {(hasMoreActivities || visibleActivityCount > ACTIVITIES_PAGE_SIZE) && (
                    <div className="mt-4 flex justify-center gap-3">
                      {hasMoreActivities && (
                        <button
                          type="button"
                          onClick={() => setVisibleActivityCount((count) => count + ACTIVITIES_PAGE_SIZE)}
                          className="rounded-full bg-white/6 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                        >
                          Load more
                        </button>
                      )}
                      {visibleActivityCount > ACTIVITIES_PAGE_SIZE && (
                        <button
                          type="button"
                          onClick={() => setVisibleActivityCount(ACTIVITIES_PAGE_SIZE)}
                          className="rounded-full bg-white/6 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                        >
                          Show less
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-4 text-sm text-slate-400">No activities available yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
    </Protected>
  );
}
