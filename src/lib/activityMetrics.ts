export type ActivityRecord = {
  raw_json: {
    start_date?: string;
    distance?: number;
    total_elevation_gain?: number;
    moving_time?: number;
    sport_type?: string;
    type?: string;
    name?: string;
    [key: string]: unknown;
  };
};

export type WeeklyStat = {
  weekStart: Date;
  distance: number;
  elevation: number;
  movingTime: number;
};

export type LongestEffort = {
  distanceMiles: number;
  name: string | null;
  date: string | null;
};

export function metersToMiles(meters: number) {
  return meters / 1609.34;
}

export function metersToFeet(meters: number) {
  return meters * 3.28084;
}

export function secondsToMinutes(seconds: number) {
  return seconds / 60;
}

function toFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Estimates a relative "effort" score for an activity so rides/runs can be
 * compared on a single training-load axis even when Strava doesn't return
 * the same metrics for every activity. Prefers (in order): Strava's own
 * Relative Effort (suffer_score), a heart-rate based load, a power-based
 * load, falling back to a distance/elevation/duration estimate.
 */
export function calculateEffortScore(raw: ActivityRecord["raw_json"] | undefined | null): number {
  if (!raw) return 0;

  const movingTimeMinutes = secondsToMinutes(toFiniteNumber(raw.moving_time));

  const sufferScore = toFiniteNumber(raw.suffer_score);
  if (sufferScore > 0) return Math.round(sufferScore);

  const avgHeartrate = toFiniteNumber(raw.average_heartrate);
  if (avgHeartrate > 0 && movingTimeMinutes > 0) {
    return Math.round(movingTimeMinutes * (avgHeartrate / 100));
  }

  const avgWatts = toFiniteNumber(raw.average_watts);
  if (avgWatts > 0 && movingTimeMinutes > 0) {
    return Math.round((avgWatts * movingTimeMinutes) / 100);
  }

  const distanceMiles = metersToMiles(toFiniteNumber(raw.distance));
  const elevationFeet = metersToFeet(toFiniteNumber(raw.total_elevation_gain));
  return Math.round(distanceMiles + elevationFeet / 100 + movingTimeMinutes * 0.5);
}

export type EffortLevel = "low" | "medium" | "high";

/**
 * Average effort score across a set of activities, used as the baseline for
 * ranking an individual activity's effort as low/medium/high.
 */
export function calculateAverageEffort(activities: ActivityRecord[]): number {
  if (!activities.length) return 0;
  const total = activities.reduce((sum, activity) => sum + calculateEffortScore(activity.raw_json), 0);
  return total / activities.length;
}

/**
 * Ranks an effort score relative to the average: more than 25% above average
 * is "high", more than 25% below is "low", otherwise "medium".
 */
export function getEffortLevel(effort: number, averageEffort: number): EffortLevel {
  if (averageEffort <= 0) return "medium";
  if (effort >= averageEffort * 1.25) return "high";
  if (effort <= averageEffort * 0.75) return "low";
  return "medium";
}

export function getWeekStart(date: Date) {
  const weekStart = new Date(date);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  return weekStart;
}

export function getWeekEnd(start: Date) {
  const weekEnd = new Date(start);
  weekEnd.setDate(start.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd;
}

export function calculateReadinessScore(current: number, previous: number) {
  if (current <= 0 || previous <= 0) return 50;
  const trend = current / previous;
  const score = 60 + Math.min(20, Math.max(-15, (trend - 1) * 40));
  return Math.round(Math.min(95, Math.max(30, score)));
}

export function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function describeTrend(recent: number, previous: number): "increasing" | "decreasing" | "steady" {
  if (previous <= 0) return recent > 0 ? "increasing" : "steady";
  const changePercent = ((recent - previous) / previous) * 100;
  if (Math.abs(changePercent) < 5) return "steady";
  return changePercent > 0 ? "increasing" : "decreasing";
}

export function getDaysUntilEvent(eventDateStr: string, referenceDate: Date) {
  const event = new Date(`${eventDateStr}T00:00:00Z`);
  const refDateOnly = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
  );
  const diffMs = event.getTime() - refDateOnly.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Buckets activities into `weeks` consecutive Sunday-Saturday weeks ending
 * with the week containing `currentWeekStart`.
 */
export function buildWeeklyStats(activities: ActivityRecord[], currentWeekStart: Date, weeks: number): WeeklyStat[] {
  const weeklyStats: WeeklyStat[] = Array.from({ length: weeks }, (_, index) => {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() - (weeks - 1 - index) * 7);
    return { weekStart, distance: 0, elevation: 0, movingTime: 0 };
  });

  activities.forEach((activity) => {
    const dateValue = activity.raw_json?.start_date;
    if (!dateValue) return;

    const activityDate = new Date(dateValue);
    if (Number.isNaN(activityDate.valueOf())) return;

    const distance = metersToMiles(activity.raw_json?.distance ?? 0);
    const elevation = metersToFeet(activity.raw_json?.total_elevation_gain ?? 0);
    const movingTime = secondsToMinutes(activity.raw_json?.moving_time ?? 0);

    const weekStart = getWeekStart(activityDate);
    const bucket = weeklyStats.find((row) => row.weekStart.toISOString() === weekStart.toISOString());
    if (bucket) {
      bucket.distance += distance;
      bucket.elevation += elevation;
      bucket.movingTime += movingTime;
    }
  });

  return weeklyStats;
}

/**
 * Finds the longest ride and longest run (by distance) among activities
 * starting on or after `since`.
 */
export function findLongestEfforts(activities: ActivityRecord[], since: Date) {
  const longestRide: LongestEffort = { distanceMiles: 0, name: null, date: null };
  const longestRun: LongestEffort = { distanceMiles: 0, name: null, date: null };

  activities.forEach((activity) => {
    const dateValue = activity.raw_json?.start_date;
    if (!dateValue) return;

    const activityDate = new Date(dateValue);
    if (Number.isNaN(activityDate.valueOf()) || activityDate < since) return;

    const distance = metersToMiles(activity.raw_json?.distance ?? 0);
    const sportType = String(activity.raw_json?.sport_type || activity.raw_json?.type || "").toLowerCase();

    if (sportType.includes("run") && distance > longestRun.distanceMiles) {
      longestRun.distanceMiles = distance;
      longestRun.name = activity.raw_json?.name ?? null;
      longestRun.date = dateValue;
    } else if (sportType.includes("ride") && distance > longestRide.distanceMiles) {
      longestRide.distanceMiles = distance;
      longestRide.name = activity.raw_json?.name ?? null;
      longestRide.date = dateValue;
    }
  });

  return { longestRide, longestRun };
}

export type RecentTrainingLoad = {
  average_weekly_distance_miles: number;
  average_weekly_elevation_feet: number;
  average_weekly_moving_time_minutes: number;
};

/**
 * Computes the average weekly distance/elevation/moving time over the most
 * recent `recentWeeksCount` weeks of `weeklyStats` (which is ordered oldest
 * to newest).
 */
export function calculateRecentTrainingLoad(weeklyStats: WeeklyStat[], recentWeeksCount: number): RecentTrainingLoad {
  const recentWeeks = weeklyStats.slice(-recentWeeksCount);
  return {
    average_weekly_distance_miles: Number(average(recentWeeks.map((week) => week.distance)).toFixed(1)),
    average_weekly_elevation_feet: Number(average(recentWeeks.map((week) => week.elevation)).toFixed(0)),
    average_weekly_moving_time_minutes: Number(average(recentWeeks.map((week) => week.movingTime)).toFixed(0)),
  };
}

export type DailyLoad = {
  date: string;
  load: number;
  ctl: number;
  atl: number;
  tsb: number;
};

const CTL_TIME_CONSTANT_DAYS = 42;
const ATL_TIME_CONSTANT_DAYS = 7;
const MAX_WARMUP_DAYS = 180;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Builds a day-by-day Fitness (CTL), Fatigue (ATL), and Form (TSB) series
 * from each day's total effort score (see calculateEffortScore), using the
 * same exponentially-weighted moving average approach as TrainingPeaks'
 * Performance Management Chart:
 *   CTL ("Fitness") = 42-day EWMA of daily training load
 *   ATL ("Fatigue") = 7-day EWMA of daily training load
 *   TSB ("Form")    = CTL - ATL
 *
 * The EWMA starts at the earliest available activity (seeded at 0) so CTL/ATL
 * have time to "warm up" before the returned window, then returns the most
 * recent `displayDays` days ending on `referenceDate`.
 */
export function calculateFitnessSeries(
  activities: ActivityRecord[],
  displayDays: number,
  referenceDate: Date
): DailyLoad[] {
  const dailyLoad = new Map<string, number>();
  let earliest: Date | null = null;

  activities.forEach((activity) => {
    const dateValue = activity.raw_json?.start_date;
    if (!dateValue) return;

    const activityDate = new Date(dateValue);
    if (Number.isNaN(activityDate.valueOf())) return;

    const key = dateKey(activityDate);
    dailyLoad.set(key, (dailyLoad.get(key) ?? 0) + calculateEffortScore(activity.raw_json));

    if (!earliest || activityDate < earliest) earliest = activityDate;
  });

  const today = startOfDay(referenceDate);
  const displayStart = addDays(today, -(displayDays - 1));
  const earliestWarmup = addDays(today, -(displayDays + MAX_WARMUP_DAYS - 1));

  const start =
    earliest && startOfDay(earliest) < displayStart
      ? new Date(Math.max(startOfDay(earliest).getTime(), earliestWarmup.getTime()))
      : displayStart;

  const totalDays = Math.round((today.getTime() - start.getTime()) / MS_PER_DAY) + 1;

  const ctlAlpha = 1 - Math.exp(-1 / CTL_TIME_CONSTANT_DAYS);
  const atlAlpha = 1 - Math.exp(-1 / ATL_TIME_CONSTANT_DAYS);

  let ctl = 0;
  let atl = 0;
  const series: DailyLoad[] = [];

  for (let i = 0; i < totalDays; i += 1) {
    const day = addDays(start, i);
    const key = dateKey(day);
    const load = dailyLoad.get(key) ?? 0;

    ctl += (load - ctl) * ctlAlpha;
    atl += (load - atl) * atlAlpha;

    series.push({
      date: key,
      load,
      ctl: Number(ctl.toFixed(1)),
      atl: Number(atl.toFixed(1)),
      tsb: Number((ctl - atl).toFixed(1)),
    });
  }

  return series.slice(-displayDays);
}
