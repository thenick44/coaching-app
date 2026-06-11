import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ActivityRecord = {
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

type GoalRecord = {
  id: string;
  name: string;
  event_date: string;
  event_location?: string | null;
  event_type?: string | null;
  distance_miles?: number | null;
  elevation_feet?: number | null;
  target_finish_time?: string | null;
  expected_low_temp_f?: number | null;
  expected_high_temp_f?: number | null;
};

type LongestEffort = {
  distanceMiles: number;
  name: string | null;
  date: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getAuthenticatedUser(accessToken: string) {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
    },
  });

  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? user : null;
}

async function resolveTargetUserId(accessToken?: string) {
  const supabaseAdmin = createClient(supabaseUrl!, serviceRoleKey!);

  if (accessToken) {
    const user = await getAuthenticatedUser(accessToken);
    if (user?.id) return user.id;
  }

  const { data: firstProfile, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (error || !firstProfile?.id) return null;
  return firstProfile.id;
}

function metersToMiles(meters: number) {
  return meters / 1609.34;
}

function metersToFeet(meters: number) {
  return meters * 3.28084;
}

function secondsToMinutes(seconds: number) {
  return seconds / 60;
}

function getWeekStart(date: Date) {
  const weekStart = new Date(date);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  return weekStart;
}

function getWeekEnd(start: Date) {
  const weekEnd = new Date(start);
  weekEnd.setDate(start.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd;
}

function calculateReadinessScore(current: number, previous: number) {
  if (current <= 0 || previous <= 0) return 50;
  const trend = current / previous;
  const score = 60 + Math.min(20, Math.max(-15, (trend - 1) * 40));
  return Math.round(Math.min(95, Math.max(30, score)));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function describeTrend(recent: number, previous: number): "increasing" | "decreasing" | "steady" {
  if (previous <= 0) return recent > 0 ? "increasing" : "steady";
  const changePercent = ((recent - previous) / previous) * 100;
  if (Math.abs(changePercent) < 5) return "steady";
  return changePercent > 0 ? "increasing" : "decreasing";
}

function getDaysUntilEvent(eventDateStr: string, referenceDate: Date) {
  const event = new Date(`${eventDateStr}T00:00:00Z`);
  const refDateOnly = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
  );
  const diffMs = event.getTime() - refDateOnly.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function pickRelevantLongestDistance(eventType: string | null | undefined, longestRideMiles: number, longestRunMiles: number) {
  const type = (eventType || "").toLowerCase();
  if (type.includes("run")) return longestRunMiles;
  if (type.includes("ride") || type.includes("bike") || type.includes("cycl")) return longestRideMiles;
  return Math.max(longestRideMiles, longestRunMiles);
}

function buildReportSummary(
  currentDistance: number,
  previousDistance: number,
  currentElevation: number,
  currentMovingTime: number,
  nearestGoal: GoalRecord | null,
  daysUntilEvent: number | null
) {
  const distanceChange = currentDistance - previousDistance;
  const trend = distanceChange >= 0 ? "up" : "down";
  const distancePhrase = Math.abs(distanceChange) < 0.1
    ? "steady"
    : `${trend} ${Math.abs(distanceChange).toFixed(1)} miles from last week`;

  const goalPhrase = nearestGoal
    ? `Your next goal is ${nearestGoal.name} on ${new Date(`${nearestGoal.event_date}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })} — ${daysUntilEvent} day${daysUntilEvent === 1 ? "" : "s"} away.`
    : "No upcoming goals are scheduled yet.";

  return `This week you logged ${currentDistance.toFixed(1)} miles, climbed ${Math.round(currentElevation)} feet, and spent ${Math.round(currentMovingTime)} minutes moving. Training is ${distancePhrase}. ${goalPhrase}`;
}

export async function GET(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Coaching reports API is not configured." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const targetUserId = await resolveTargetUserId(accessToken || undefined);

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabaseAdmin
    .from("coaching_reports")
    .select("*")
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load coaching reports:", error);
    return NextResponse.json({ error: "Failed to load coaching reports." }, { status: 500 });
  }

  return NextResponse.json({ developmentMode: false, reports: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Coaching reports API is not configured." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const targetUserId = await resolveTargetUserId(accessToken || undefined);

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const now = new Date();
  const currentWeekStart = getWeekStart(now);
  const currentWeekEnd = getWeekEnd(currentWeekStart);
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7);
  const previousWeekEnd = getWeekEnd(previousWeekStart);
  const oldestDate = new Date(currentWeekStart);
  oldestDate.setDate(oldestDate.getDate() - 7 * 11);
  const eightWeeksAgo = new Date(currentWeekStart);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 7 * 7);

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data: activities, error: activityError } = await supabaseAdmin
    .from("activities")
    .select("raw_json")
    .eq("user_id", targetUserId)
    .gte("start_date", oldestDate.toISOString())
    .order("start_date", { ascending: true });

  if (activityError) {
    console.error("Failed to load activities for coaching report:", activityError);
    return NextResponse.json({ error: "Failed to load activity data." }, { status: 500 });
  }

  const { data: goals, error: goalsError } = await supabaseAdmin
    .from("goals")
    .select(
      "id, name, event_date, event_location, event_type, distance_miles, elevation_feet, target_finish_time, expected_low_temp_f, expected_high_temp_f"
    )
    .eq("user_id", targetUserId)
    .gte("event_date", now.toISOString().slice(0, 10))
    .order("event_date", { ascending: true })
    .limit(3);

  if (goalsError) {
    console.error("Failed to load upcoming goals for coaching report:", goalsError);
    return NextResponse.json({ error: "Failed to load goals data." }, { status: 500 });
  }

  const weeklyStats = Array.from({ length: 12 }, (_, index) => ({
    weekStart: new Date(currentWeekStart),
    distance: 0,
    elevation: 0,
    movingTime: 0,
  })).map((item, index) => {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() - (11 - index) * 7);
    return { ...item, weekStart };
  });

  const reportMetrics = {
    currentDistance: 0,
    currentElevation: 0,
    currentMovingTime: 0,
    previousDistance: 0,
    previousElevation: 0,
    previousMovingTime: 0,
  };

  const parsedGoals: GoalRecord[] = (goals ?? []).map((goal: GoalRecord) => ({
    id: goal.id,
    name: goal.name,
    event_date: goal.event_date,
    event_location: goal.event_location ?? null,
    event_type: goal.event_type ?? null,
    distance_miles: goal.distance_miles ?? null,
    elevation_feet: goal.elevation_feet ?? null,
    target_finish_time: goal.target_finish_time ?? null,
    expected_low_temp_f: goal.expected_low_temp_f ?? null,
    expected_high_temp_f: goal.expected_high_temp_f ?? null,
  }));

  const longestRide: LongestEffort = { distanceMiles: 0, name: null, date: null };
  const longestRun: LongestEffort = { distanceMiles: 0, name: null, date: null };

  (activities ?? []).forEach((activity: ActivityRecord) => {
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

    if (activityDate >= currentWeekStart && activityDate <= currentWeekEnd) {
      reportMetrics.currentDistance += distance;
      reportMetrics.currentElevation += elevation;
      reportMetrics.currentMovingTime += movingTime;
    }

    if (activityDate >= previousWeekStart && activityDate <= previousWeekEnd) {
      reportMetrics.previousDistance += distance;
      reportMetrics.previousElevation += elevation;
      reportMetrics.previousMovingTime += movingTime;
    }

    if (activityDate >= eightWeeksAgo) {
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
    }
  });

  const readinessScore = calculateReadinessScore(reportMetrics.currentDistance, reportMetrics.previousDistance);

  const nearestGoal = parsedGoals[0] ?? null;
  const daysUntilEvent = nearestGoal ? getDaysUntilEvent(nearestGoal.event_date, now) : null;
  const countdown = nearestGoal ? `${daysUntilEvent} day${daysUntilEvent === 1 ? "" : "s"} until ${nearestGoal.name}` : null;

  const reportSummary = buildReportSummary(
    reportMetrics.currentDistance,
    reportMetrics.previousDistance,
    reportMetrics.currentElevation,
    reportMetrics.currentMovingTime,
    nearestGoal,
    daysUntilEvent
  );

  // Trends: compare the most recent 4 weeks against the 4 weeks before that.
  const recentWeeks = weeklyStats.slice(-4);
  const priorWeeks = weeklyStats.slice(-8, -4);

  const recentAvgDistance = average(recentWeeks.map((week) => week.distance));
  const priorAvgDistance = average(priorWeeks.map((week) => week.distance));
  const recentAvgElevation = average(recentWeeks.map((week) => week.elevation));
  const priorAvgElevation = average(priorWeeks.map((week) => week.elevation));
  const recentAvgMovingTime = average(recentWeeks.map((week) => week.movingTime));

  const weeklyDistanceTrend = {
    direction: describeTrend(recentAvgDistance, priorAvgDistance),
    recent_average_miles: Number(recentAvgDistance.toFixed(1)),
    previous_average_miles: Number(priorAvgDistance.toFixed(1)),
  };

  const weeklyElevationTrend = {
    direction: describeTrend(recentAvgElevation, priorAvgElevation),
    recent_average_feet: Number(recentAvgElevation.toFixed(0)),
    previous_average_feet: Number(priorAvgElevation.toFixed(0)),
  };

  const recentTrainingLoad = {
    average_weekly_distance_miles: Number(recentAvgDistance.toFixed(1)),
    average_weekly_elevation_feet: Number(recentAvgElevation.toFixed(0)),
    average_weekly_moving_time_minutes: Number(recentAvgMovingTime.toFixed(0)),
  };

  // Goal-specific analysis and recommendations.
  let volumeComparison: string;
  let climbingComparison: string;
  const readinessRisks: string[] = [];
  const strengths: string[] = [];
  const recommendations: Record<string, string> = {};

  if (nearestGoal) {
    const relevantLongest = pickRelevantLongestDistance(nearestGoal.event_type, longestRide.distanceMiles, longestRun.distanceMiles);
    const volumeRatio = nearestGoal.distance_miles ? relevantLongest / nearestGoal.distance_miles : null;

    if (nearestGoal.distance_miles == null) {
      volumeComparison = "Goal distance was not specified, so training volume cannot be compared directly.";
    } else if (relevantLongest <= 0) {
      volumeComparison = `No long efforts have been logged in the last 8 weeks to compare against the ${nearestGoal.distance_miles} mi goal distance.`;
    } else if (volumeRatio! >= 0.75) {
      volumeComparison = `Your longest recent effort (${relevantLongest.toFixed(1)} mi) covers ${(volumeRatio! * 100).toFixed(0)}% of the ${nearestGoal.distance_miles} mi goal distance — a solid endurance base.`;
    } else if (volumeRatio! >= 0.4) {
      volumeComparison = `Your longest recent effort (${relevantLongest.toFixed(1)} mi) is ${(volumeRatio! * 100).toFixed(0)}% of the ${nearestGoal.distance_miles} mi goal distance — keep building toward race distance.`;
    } else {
      volumeComparison = `Your longest recent effort (${relevantLongest.toFixed(1)} mi) is only ${(volumeRatio! * 100).toFixed(0)}% of the ${nearestGoal.distance_miles} mi goal distance — prioritize longer endurance sessions.`;
    }

    const elevationRatio = nearestGoal.elevation_feet ? recentAvgElevation / nearestGoal.elevation_feet : null;

    if (nearestGoal.elevation_feet == null) {
      climbingComparison = "Goal elevation gain was not specified, so climbing volume cannot be compared directly.";
    } else if (recentAvgElevation <= 0) {
      climbingComparison = `No climbing has been logged recently to compare against the goal's ${Math.round(nearestGoal.elevation_feet)} ft of elevation gain.`;
    } else if (elevationRatio! >= 0.5) {
      climbingComparison = `Your average weekly climbing (${Math.round(recentAvgElevation)} ft) is ${(elevationRatio! * 100).toFixed(0)}% of the goal's ${Math.round(nearestGoal.elevation_feet)} ft elevation gain — good climbing fitness.`;
    } else if (elevationRatio! >= 0.2) {
      climbingComparison = `Your average weekly climbing (${Math.round(recentAvgElevation)} ft) is ${(elevationRatio! * 100).toFixed(0)}% of the goal's ${Math.round(nearestGoal.elevation_feet)} ft elevation gain — add more hill work.`;
    } else {
      climbingComparison = `Your average weekly climbing (${Math.round(recentAvgElevation)} ft) is well below the goal's ${Math.round(nearestGoal.elevation_feet)} ft elevation gain — climbing should be a training priority.`;
    }

    if (volumeRatio !== null && volumeRatio < 0.5) {
      readinessRisks.push(`Longest recent effort is under half of the ${nearestGoal.distance_miles} mi goal distance.`);
    }
    if (elevationRatio !== null && elevationRatio < 0.3) {
      readinessRisks.push("Weekly climbing volume is well below the goal's elevation profile.");
    }
    if (weeklyDistanceTrend.direction === "decreasing") {
      readinessRisks.push("Weekly training distance has been trending down over the last several weeks.");
    }
    if (daysUntilEvent !== null && daysUntilEvent <= 21 && volumeRatio !== null && volumeRatio < 0.6) {
      readinessRisks.push(`Only ${daysUntilEvent} day${daysUntilEvent === 1 ? "" : "s"} remain to build toward race distance.`);
    }
    if (nearestGoal.expected_high_temp_f != null && nearestGoal.expected_high_temp_f > 80) {
      readinessRisks.push(`Forecast highs near ${nearestGoal.expected_high_temp_f}°F may add heat stress on event day.`);
    }
    if (readinessRisks.length === 0) {
      readinessRisks.push("No major readiness risks identified based on recent training data.");
    }

    if (weeklyDistanceTrend.direction === "increasing") {
      strengths.push("Weekly training distance has been trending upward, building a stronger aerobic base.");
    }
    if (volumeRatio !== null && volumeRatio >= 0.75) {
      strengths.push("Long efforts already approach the goal distance, indicating strong endurance readiness.");
    }
    if (elevationRatio !== null && elevationRatio >= 0.5) {
      strengths.push("Climbing volume closely matches the demands of the goal's elevation profile.");
    }
    if (weeklyElevationTrend.direction === "increasing") {
      strengths.push("Weekly climbing volume has been trending upward.");
    }
    if (strengths.length === 0) {
      strengths.push("Training is consistent — keep logging activities to surface more specific strengths.");
    }

    recommendations.endurance_focus =
      volumeRatio !== null && volumeRatio < 0.6
        ? `Build toward the ${nearestGoal.distance_miles} mi goal distance with a weekly long session, gradually increasing until you reach at least 70-80% of race distance.`
        : `Maintain your current long-session routine to stay race-ready for the ${nearestGoal.distance_miles ?? "target"} mi goal.`;

    recommendations.climbing_focus =
      elevationRatio !== null && elevationRatio < 0.5
        ? `Add hill repeats or routes with sustained climbing to close the gap toward the goal's ${nearestGoal.elevation_feet ?? "target"} ft of elevation gain.`
        : `Keep including climbing-focused sessions to stay sharp for the goal's ${nearestGoal.elevation_feet ?? "target"} ft of elevation gain.`;

    recommendations.recovery_focus =
      daysUntilEvent !== null && daysUntilEvent <= 14
        ? `With ${daysUntilEvent} day${daysUntilEvent === 1 ? "" : "s"} until ${nearestGoal.name}, begin tapering — reduce volume while keeping some intensity to arrive fresh.`
        : "Schedule an easier recovery week every 3-4 weeks to absorb training load and reduce injury risk.";

    if (nearestGoal.expected_high_temp_f != null && nearestGoal.expected_high_temp_f > 80) {
      recommendations.heat_adaptation_focus = `Forecast highs near ${nearestGoal.expected_high_temp_f}°F for ${nearestGoal.name} — practice some sessions in warm conditions, prioritize hydration and electrolytes, and consider a heat acclimation block in the weeks before the event.`;
    }
  } else {
    volumeComparison = "No upcoming goal is set, so training volume cannot be compared against a target distance.";
    climbingComparison = "No upcoming goal is set, so climbing volume cannot be compared against a target elevation gain.";
    readinessRisks.push("No upcoming goal is set yet.");
    strengths.push(
      weeklyDistanceTrend.direction === "increasing"
        ? "Weekly training distance has been trending upward, building a stronger aerobic base."
        : "Training is consistent — set a goal to get tailored readiness analysis."
    );
    recommendations.endurance_focus = "Continue building weekly mileage with at least one longer endurance session.";
    recommendations.climbing_focus = "Include weekly climbing or hill work to build leg strength and durability.";
    recommendations.recovery_focus = "Prioritize sleep, nutrition, and at least one full rest day per week to support consistent training.";
  }

  const goalAnalysis = {
    goal: nearestGoal
      ? {
          id: nearestGoal.id,
          name: nearestGoal.name,
          event_date: nearestGoal.event_date,
          event_location: nearestGoal.event_location,
          event_type: nearestGoal.event_type,
          distance_miles: nearestGoal.distance_miles,
          elevation_feet: nearestGoal.elevation_feet,
          target_finish_time: nearestGoal.target_finish_time,
          expected_low_temp_f: nearestGoal.expected_low_temp_f,
          expected_high_temp_f: nearestGoal.expected_high_temp_f,
          days_until_event: daysUntilEvent,
        }
      : null,
    countdown,
    trends: {
      weekly_distance: weeklyDistanceTrend,
      weekly_elevation: weeklyElevationTrend,
    },
    recent_training_load: recentTrainingLoad,
    longest_efforts_last_8_weeks: {
      ride:
        longestRide.distanceMiles > 0
          ? { distance_miles: Number(longestRide.distanceMiles.toFixed(1)), name: longestRide.name, date: longestRide.date }
          : null,
      run:
        longestRun.distanceMiles > 0
          ? { distance_miles: Number(longestRun.distanceMiles.toFixed(1)), name: longestRun.name, date: longestRun.date }
          : null,
    },
    analysis: {
      volume_comparison: volumeComparison,
      climbing_comparison: climbingComparison,
      readiness_risks: readinessRisks,
      strengths,
    },
    recommendations,
  };

  const upcomingGoals = parsedGoals.slice(0, 3);

  const { data: insertedReport, error: insertError } = await supabaseAdmin
    .from("coaching_reports")
    .insert([
      {
        user_id: targetUserId,
        report_week_start: currentWeekStart.toISOString().slice(0, 10),
        report_week_end: currentWeekEnd.toISOString().slice(0, 10),
        total_distance_miles: Number(reportMetrics.currentDistance.toFixed(2)),
        total_elevation_feet: Number(reportMetrics.currentElevation.toFixed(0)),
        total_moving_time_minutes: Number(reportMetrics.currentMovingTime.toFixed(0)),
        previous_week_distance_miles: Number(reportMetrics.previousDistance.toFixed(2)),
        previous_week_elevation_feet: Number(reportMetrics.previousElevation.toFixed(0)),
        previous_week_moving_time_minutes: Number(reportMetrics.previousMovingTime.toFixed(0)),
        readiness_score: readinessScore,
        report_summary: reportSummary,
        upcoming_goals: upcomingGoals,
        goal_analysis: goalAnalysis,
      },
    ])
    .select()
    .maybeSingle();

  if (insertError) {
    console.error("Failed to save coaching report:", insertError);
    return NextResponse.json({ error: "Failed to save coaching report." }, { status: 500 });
  }

  return NextResponse.json({ report: insertedReport, reports: [insertedReport] });
}
