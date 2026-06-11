import { NextRequest, NextResponse } from "next/server";
import {
  type ActivityRecord,
  average,
  buildWeeklyStats,
  calculateReadinessScore,
  calculateRecentTrainingLoad,
  describeTrend,
  findLongestEfforts,
  getDaysUntilEvent,
  getWeekEnd,
  getWeekStart,
} from "@/src/lib/activityMetrics";
import { createSupabaseAdmin, getBearerToken, isServerConfigured, resolveTargetUserId } from "@/src/lib/serverAuth";

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
  if (!isServerConfigured()) {
    return NextResponse.json({ error: "Coaching reports API is not configured." }, { status: 500 });
  }

  const targetUserId = await resolveTargetUserId(getBearerToken(request));

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const supabaseAdmin = createSupabaseAdmin()!;
  const { data, error } = await supabaseAdmin
    .from("coaching_reports")
    .select("*")
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load coaching reports:", error);
    return NextResponse.json({ error: "Failed to load coaching reports." }, { status: 500 });
  }

  return NextResponse.json({ reports: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!isServerConfigured()) {
    return NextResponse.json({ error: "Coaching reports API is not configured." }, { status: 500 });
  }

  const targetUserId = await resolveTargetUserId(getBearerToken(request));

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const now = new Date();
  const currentWeekStart = getWeekStart(now);
  const currentWeekEnd = getWeekEnd(currentWeekStart);
  const oldestDate = new Date(currentWeekStart);
  oldestDate.setDate(oldestDate.getDate() - 7 * 11);
  const eightWeeksAgo = new Date(currentWeekStart);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 7 * 7);

  const supabaseAdmin = createSupabaseAdmin()!;
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

  const weeklyStats = buildWeeklyStats((activities ?? []) as ActivityRecord[], currentWeekStart, 12);
  const { longestRide, longestRun } = findLongestEfforts((activities ?? []) as ActivityRecord[], eightWeeksAgo);

  const reportMetrics = {
    currentDistance: weeklyStats[weeklyStats.length - 1].distance,
    currentElevation: weeklyStats[weeklyStats.length - 1].elevation,
    currentMovingTime: weeklyStats[weeklyStats.length - 1].movingTime,
    previousDistance: weeklyStats[weeklyStats.length - 2].distance,
    previousElevation: weeklyStats[weeklyStats.length - 2].elevation,
    previousMovingTime: weeklyStats[weeklyStats.length - 2].movingTime,
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

  const recentTrainingLoad = calculateRecentTrainingLoad(weeklyStats, 4);

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

  // Active training plan progress for the current week, if one exists.
  let trainingPlanProgress: {
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
  } | null = null;

  const { data: activePlan, error: activePlanError } = await supabaseAdmin
    .from("training_plans")
    .select("id, name")
    .eq("user_id", targetUserId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activePlanError) {
    console.error("Failed to load active training plan for coaching report:", activePlanError);
  } else if (activePlan) {
    const { data: weekWorkouts, error: weekWorkoutsError } = await supabaseAdmin
      .from("training_plan_workouts")
      .select("id, scheduled_date, workout_type, title, completed, distance_miles, duration_minutes")
      .eq("training_plan_id", activePlan.id)
      .gte("scheduled_date", currentWeekStart.toISOString().slice(0, 10))
      .lte("scheduled_date", currentWeekEnd.toISOString().slice(0, 10))
      .order("scheduled_date", { ascending: true });

    if (weekWorkoutsError) {
      console.error("Failed to load training plan workouts for coaching report:", weekWorkoutsError);
    } else {
      const workouts = weekWorkouts ?? [];
      const completedCount = workouts.filter((workout) => workout.completed).length;
      trainingPlanProgress = {
        plan_id: activePlan.id,
        plan_name: activePlan.name,
        week_workouts: workouts,
        completed_count: completedCount,
        total_count: workouts.length,
        adherence_percent: workouts.length ? Math.round((completedCount / workouts.length) * 100) : null,
      };
    }
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
    training_plan_progress: trainingPlanProgress,
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
