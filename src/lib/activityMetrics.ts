export type ActivityRecord = {
  raw_json: {
    start_date?: string;
    distance?: number;
    total_elevation_gain?: number;
    moving_time?: number;
    sport_type?: string;
    type?: string;
    name?: string;
    [key: string]: any;
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
