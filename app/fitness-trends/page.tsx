"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import Protected from "../components/Protected";

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

type WeeklyTotals = {
  weekStart: Date;
  label: string;
  distance: number;
  elevation: number;
  movingTime: number;
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

function buildPath(values: number[], width: number, height: number) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1 || 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function FitnessTrendChart({
  title,
  values,
  averageValues,
  units,
  highlightIndex,
}: {
  title: string;
  values: number[];
  averageValues: number[];
  units: string;
  highlightIndex: number;
}) {
  const width = 700;
  const height = 260;
  const path = buildPath(values, width, height);
  const avgPath = buildPath(averageValues, width, height);

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.28em] text-slate-400">{title}</p>
          <p className="mt-2 text-sm text-slate-300">Last 12 weeks</p>
        </div>
        <div className="rounded-2xl bg-slate-950/80 px-3 py-2 text-xs uppercase tracking-[0.28em] text-slate-500">
          Rolling 4-week average
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg width={width + 40} height={height + 40} className="block">
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <g transform="translate(30, 10)">
            {[0, 1, 2, 3].map((row) => {
              const y = (row / 4) * height;
              return (
                <line
                  key={row}
                  x1={0}
                  y1={y}
                  x2={width}
                  y2={y}
                  stroke="rgba(148,163,184,0.18)"
                  strokeWidth="1"
                />
              );
            })}
            <path d={avgPath} fill="none" stroke="#a5b4fc" strokeWidth="2" strokeDasharray="8 6" />
            <path d={path} fill="none" stroke="#22d3ee" strokeWidth="3" />
            {values.map((value, index) => {
              const x = (index / (values.length - 1 || 1)) * width;
              const max = Math.max(...values, 1);
              const min = Math.min(...values, 0);
              const range = max - min || 1;
              const y = height - ((value - min) / range) * height;
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r={index === highlightIndex ? 6 : 4}
                  fill={index === highlightIndex ? "#0ea5e9" : "#ffffff"}
                  stroke="#22d3ee"
                  strokeWidth={index === highlightIndex ? 2 : 1}
                />
              );
            })}
            {values.map((_, index) => {
              const x = (index / (values.length - 1 || 1)) * width;
              return (
                <text
                  key={`label-${index}`}
                  x={x}
                  y={height + 24}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="10"
                >
                  {index % 2 === 0 ? `W${index + 1}` : ""}
                </text>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {values.map((value, index) => {
          if (index !== highlightIndex) return null;
          return (
            <div key={`highlight-${index}`} className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Best week</p>
              <p className="mt-2 text-base font-semibold text-white">W{index + 1}</p>
              <p className="mt-1 text-sm text-slate-400">{value.toFixed(1)} {units}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FitnessTrendsPage() {
  const mounted = useRef(true);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;

    async function loadDashboard() {
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

      const response = await fetch("/api/dashboard/data", {
        method: "GET",
        headers,
      });

      const payload = (await response.json().catch(() => null)) as DashboardPayload | { error?: string } | null;
      if (!mounted.current) return;

      if (!response.ok) {
        setError((payload as { error?: string } | null)?.error || "Failed to load dashboard data.");
        setDashboardData(null);
      } else {
        setDashboardData(payload as DashboardPayload);
      }

      setLoading(false);
    }

    loadDashboard();

    return () => {
      mounted.current = false;
    };
  }, []);

  const activities = dashboardData?.activities ?? [];
  const weeks = 12;
  const now = new Date();
  const weeklySeries = buildWeeklySeries(activities, weeks, now);

  const distanceValues = weeklySeries.map((week) => metersToMiles(week.distance));
  const elevationValues = weeklySeries.map((week) => metersToFeet(week.elevation));
  const timeValues = weeklySeries.map((week) => week.movingTime / 3600);

  const distanceAverage = rollingAverage(distanceValues, 4);
  const elevationAverage = rollingAverage(elevationValues, 4);
  const timeAverage = rollingAverage(timeValues, 4);

  const bestDistanceIndex = distanceValues.indexOf(Math.max(...distanceValues));
  const bestElevationIndex = elevationValues.indexOf(Math.max(...elevationValues));
  const bestTimeIndex = timeValues.indexOf(Math.max(...timeValues));

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
            <FitnessTrendChart
              title="Weekly distance"
              values={distanceValues}
              averageValues={distanceAverage}
              units="mi"
              highlightIndex={bestDistanceIndex}
            />

            <FitnessTrendChart
              title="Weekly elevation"
              values={elevationValues}
              averageValues={elevationAverage}
              units="ft"
              highlightIndex={bestElevationIndex}
            />

            <FitnessTrendChart
              title="Weekly moving time"
              values={timeValues}
              averageValues={timeAverage}
              units="h"
              highlightIndex={bestTimeIndex}
            />
          </div>
        )}
      </div>
    </main>
    </Protected>
  );
}
