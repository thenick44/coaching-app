"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { calculateEffortScore, calculateFitnessSeries } from "@/src/lib/activityMetrics";
import Protected from "../components/Protected";
import StravaSyncButton from "../components/StravaSyncButton";
import TrendLineChart from "../components/TrendLineChart";
import InfoTooltip from "../components/InfoTooltip";

type DashboardActivity = {
  strava_activity_id: number;
  raw_json: {
    start_date?: string;
    distance?: number;
    total_elevation_gain?: number;
    moving_time?: number;
    [key: string]: unknown;
  };
};

type DashboardPayload = {
  targetUserId: string | null;
  activityCount: number;
  activities: DashboardActivity[];
};

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

type WeeklyTotals = {
  weekStart: Date;
  label: string;
  distance: number;
  elevation: number;
  movingTime: number;
  effort: number;
};

function metersToMiles(meters: number) {
  return meters / 1609.34;
}

function metersToFeet(meters: number) {
  return meters * 3.28084;
}

function getWeekStart(date: Date) {
  const weekStart = new Date(date);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  return weekStart;
}

function formatWeekLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatForm(value: number) {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function buildWeeklySeries(activities: DashboardActivity[], weeks: number, referenceDate: Date) {
  const currentWeekStart = getWeekStart(referenceDate);
  const series: WeeklyTotals[] = [];
  const weeklyMap: Record<string, WeeklyTotals> = {};

  for (let i = weeks - 1; i >= 0; i -= 1) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() - i * 7);
    const key = weekStart.toISOString().slice(0, 10);
    const data = {
      weekStart,
      label: formatWeekLabel(weekStart),
      distance: 0,
      elevation: 0,
      movingTime: 0,
      effort: 0,
    };
    series.push(data);
    weeklyMap[key] = data;
  }

  activities.forEach((activity) => {
    const startDate = activity.raw_json?.start_date ? new Date(activity.raw_json.start_date) : null;
    if (!startDate || Number.isNaN(startDate.valueOf())) return;

    const weekStart = getWeekStart(startDate);
    const key = weekStart.toISOString().slice(0, 10);
    const totals = weeklyMap[key];
    if (!totals) return;

    totals.distance += activity.raw_json?.distance ?? 0;
    totals.elevation += activity.raw_json?.total_elevation_gain ?? 0;
    totals.movingTime += activity.raw_json?.moving_time ?? 0;
    totals.effort += calculateEffortScore(activity.raw_json);
  });

  return series;
}

function rollingAverage(values: number[], windowSize: number) {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const subset = values.slice(start, index + 1);
    const sum = subset.reduce((total, value) => total + value, 0);
    return subset.length ? sum / subset.length : 0;
  });
}

export default function FitnessTrendsPage() {
  const mounted = useRef(true);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const weeks = 12;
  const now = new Date();
  const weeklySeries = buildWeeklySeries(activities, weeks, now);
  const weekLabels = weeklySeries.map((week) => week.label);

  const distanceValues = weeklySeries.map((week) => metersToMiles(week.distance));
  const elevationValues = weeklySeries.map((week) => metersToFeet(week.elevation));
  const timeValues = weeklySeries.map((week) => week.movingTime / 3600);
  const effortValues = weeklySeries.map((week) => week.effort);

  const distanceAverage = rollingAverage(distanceValues, 4);
  const elevationAverage = rollingAverage(elevationValues, 4);
  const timeAverage = rollingAverage(timeValues, 4);
  const effortAverage = rollingAverage(effortValues, 4);

  const bestDistanceIndex = distanceValues.indexOf(Math.max(...distanceValues));
  const bestElevationIndex = elevationValues.indexOf(Math.max(...elevationValues));
  const bestTimeIndex = timeValues.indexOf(Math.max(...timeValues));
  const bestEffortIndex = effortValues.indexOf(Math.max(...effortValues));

  const fitnessSeries = calculateFitnessSeries(activities, weeks * 7, now);
  const fitnessLabels = fitnessSeries.map((day) => formatWeekLabel(parseDateKey(day.date)));
  const ctlValues = fitnessSeries.map((day) => day.ctl);
  const atlValues = fitnessSeries.map((day) => day.atl);
  const tsbValues = fitnessSeries.map((day) => day.tsb);
  const fitnessTooltips = fitnessSeries.map(
    (day) =>
      `${formatWeekLabel(parseDateKey(day.date))}: Fitness ${Math.round(day.ctl)}, Fatigue ${Math.round(day.atl)}, Form ${formatForm(day.tsb)}`
  );

  return (
    <Protected>
    <main className="min-h-[calc(100vh-88px)] bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 px-6 py-10 text-white">
      <div className="mx-auto flex min-h-full max-w-7xl flex-col justify-center gap-8 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
        <div className="space-y-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">Fitness Trends</p>
          <h1 className="text-4xl font-semibold text-white sm:text-5xl">Training trend insights</h1>
          <p className="mx-auto max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            Track weekly progress, rolling averages, and your best training weeks over the last 12 weeks.
          </p>
          <div className="flex justify-center">
            <StravaSyncButton onSynced={refreshDashboard} />
          </div>
        </div>

        {error && (
          <div className="mx-auto max-w-2xl rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200 shadow-lg shadow-black/20">
            <p className="font-semibold">Error</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-left shadow-lg shadow-black/20 sm:p-8">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Loading trend data...</p>
          </div>
        ) : (
          <div className="grid gap-6">
            <TrendLineChart
              title="Weekly distance"
              caption="Last 12 weeks"
              xLabels={weekLabels}
              series={[
                { label: "Weekly distance", color: "#22d3ee", values: distanceValues },
                { label: "4-week average", color: "#94a3b8", values: distanceAverage, dashed: true },
              ]}
              units="mi"
              formatValue={(value) => value.toFixed(1)}
              highlightIndex={bestDistanceIndex}
              highlightLabel="Best week"
              pointTooltips={weekLabels.map((label, index) => `${label}: ${distanceValues[index].toFixed(1)} mi`)}
            />

            <TrendLineChart
              title="Weekly elevation"
              caption="Last 12 weeks"
              xLabels={weekLabels}
              series={[
                { label: "Weekly elevation", color: "#34d399", values: elevationValues },
                { label: "4-week average", color: "#94a3b8", values: elevationAverage, dashed: true },
              ]}
              units="ft"
              formatValue={(value) => Math.round(value).toString()}
              highlightIndex={bestElevationIndex}
              highlightLabel="Best week"
              pointTooltips={weekLabels.map((label, index) => `${label}: ${Math.round(elevationValues[index])} ft`)}
            />

            <TrendLineChart
              title="Weekly moving time"
              caption="Last 12 weeks"
              xLabels={weekLabels}
              series={[
                { label: "Weekly moving time", color: "#a78bfa", values: timeValues },
                { label: "4-week average", color: "#94a3b8", values: timeAverage, dashed: true },
              ]}
              units="h"
              formatValue={(value) => value.toFixed(1)}
              highlightIndex={bestTimeIndex}
              highlightLabel="Best week"
              pointTooltips={weekLabels.map((label, index) => `${label}: ${timeValues[index].toFixed(1)} h`)}
            />

            <TrendLineChart
              title="Weekly training load"
              caption="Last 12 weeks"
              xLabels={weekLabels}
              series={[
                { label: "Weekly training load", color: "#f59e0b", values: effortValues },
                { label: "4-week average", color: "#94a3b8", values: effortAverage, dashed: true },
              ]}
              units="effort pts"
              formatValue={(value) => Math.round(value).toString()}
              highlightIndex={bestEffortIndex}
              highlightLabel="Best week"
              pointTooltips={weekLabels.map((label, index) => `${label}: ${Math.round(effortValues[index])} effort pts`)}
            />

            <TrendLineChart
              title="Fitness, fatigue & form"
              caption="Last 12 weeks"
              info={
                <InfoTooltip label="About fitness, fatigue & form">
                  <p className="font-semibold text-white">How these are calculated</p>
                  <p className="mt-2">
                    <span className="font-semibold text-sky-300">Fitness (CTL)</span> is a 42-day exponentially
                    weighted average of your daily training load. It represents long-term aerobic fitness and
                    changes slowly.
                  </p>
                  <p className="mt-2">
                    <span className="font-semibold text-rose-300">Fatigue (ATL)</span> is a 7-day exponentially
                    weighted average of the same daily load. It reflects short-term tiredness from recent training.
                  </p>
                  <p className="mt-2">
                    <span className="font-semibold text-lime-300">Form (TSB)</span> is Fitness minus Fatigue.
                    Positive values mean you&apos;re fresh/recovered; negative values mean you&apos;re carrying
                    fatigue (common during hard training blocks).
                  </p>
                  <p className="mt-2">
                    Daily training load uses the same effort score shown elsewhere in the app &mdash; Strava&apos;s
                    Relative Effort when available, otherwise an estimate from heart rate, power, or
                    distance/elevation/duration.
                  </p>
                  <p className="mt-2 text-slate-400">
                    Fitness and Fatigue need time to reflect your training history, so they may read low until
                    several weeks of activity have synced.
                  </p>
                </InfoTooltip>
              }
              xLabels={fitnessLabels}
              xLabelStep={7}
              series={[
                { label: "Fitness (CTL)", color: "#38bdf8", values: ctlValues },
                { label: "Fatigue (ATL)", color: "#fb7185", values: atlValues },
                { label: "Form (TSB)", color: "#a3e635", values: tsbValues },
              ]}
              units="pts"
              formatValue={(value) => Math.round(value).toString()}
              pointTooltips={fitnessTooltips}
            />
          </div>
        )}
      </div>
    </main>
    </Protected>
  );
}
