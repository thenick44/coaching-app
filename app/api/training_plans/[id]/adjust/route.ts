import { NextRequest, NextResponse } from "next/server";
import {
  type ActivityRecord,
  buildWeeklyStats,
  calculateReadinessScore,
  calculateRecentTrainingLoad,
  getDaysUntilEvent,
  getWeekStart,
} from "@/src/lib/activityMetrics";
import { generateTrainingPlan, formatLocalDate, type PlanGoalInput } from "@/src/lib/trainingPlanGenerator";
import { createSupabaseAdmin, getBearerToken, isServerConfigured, resolveTargetUserId } from "@/src/lib/serverAuth";

const MAX_REST_DAYS = 14;

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function parseLocalDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isServerConfigured()) {
    return NextResponse.json({ error: "Training plans API is not configured." }, { status: 500 });
  }

  const params = await context.params;
  const body = await request.json().catch(() => ({}));
  const targetUserId = await resolveTargetUserId(getBearerToken(request));

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const supabaseAdmin = createSupabaseAdmin()!;

  const { data: plan, error: planError } = await supabaseAdmin
    .from("training_plans")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (planError) {
    console.error("Failed to load training plan:", planError);
    return NextResponse.json({ error: "Failed to load training plan." }, { status: 500 });
  }

  if (!plan) {
    return NextResponse.json({ error: "Training plan not found." }, { status: 404 });
  }

  if (plan.status !== "active") {
    return NextResponse.json({ error: "Only the active plan can be adjusted." }, { status: 400 });
  }

  const restDays = Math.min(MAX_REST_DAYS, Math.max(0, Math.round(Number(body.rest_days) || 0)));

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const adjustmentStart = addDays(today, restDays);

  const goalSelect = "id, name, event_date, event_type, distance_miles, elevation_feet, expected_high_temp_f";
  let goal: PlanGoalInput | null = null;

  if (plan.goal_id) {
    const { data: goalRow, error: goalError } = await supabaseAdmin
      .from("goals")
      .select(goalSelect)
      .eq("id", plan.goal_id)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (goalError) {
      console.error("Failed to load goal for plan adjustment:", goalError);
      return NextResponse.json({ error: "Failed to load goal." }, { status: 500 });
    }
    goal = goalRow ?? null;
  } else {
    const { data: goalRow, error: goalError } = await supabaseAdmin
      .from("goals")
      .select(goalSelect)
      .eq("user_id", targetUserId)
      .gte("event_date", formatLocalDate(now))
      .order("event_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (goalError) {
      console.error("Failed to load nearest goal for plan adjustment:", goalError);
      return NextResponse.json({ error: "Failed to load goal." }, { status: 500 });
    }
    goal = goalRow ?? null;
  }

  const daysUntilEvent = goal ? getDaysUntilEvent(goal.event_date, adjustmentStart) : null;

  const currentWeekStart = getWeekStart(now);
  const oldestDate = new Date(currentWeekStart);
  oldestDate.setDate(oldestDate.getDate() - 7 * 11);

  const { data: activities, error: activityError } = await supabaseAdmin
    .from("activities")
    .select("raw_json")
    .eq("user_id", targetUserId)
    .gte("start_date", oldestDate.toISOString())
    .order("start_date", { ascending: true });

  if (activityError) {
    console.error("Failed to load activities for plan adjustment:", activityError);
    return NextResponse.json({ error: "Failed to load activity data." }, { status: 500 });
  }

  const weeklyStats = buildWeeklyStats((activities ?? []) as ActivityRecord[], currentWeekStart, 12);
  const recentTrainingLoad = calculateRecentTrainingLoad(weeklyStats, 4);
  const readinessScore = calculateReadinessScore(
    weeklyStats[weeklyStats.length - 1].distance,
    weeklyStats[weeklyStats.length - 2].distance
  );

  const availableTrainingDays = (plan.available_training_days ?? []) as number[];

  const generatedPlan = generateTrainingPlan({
    goal,
    daysUntilEvent,
    recentTrainingLoad,
    readinessScore,
    availableTrainingDays,
    startDate: adjustmentStart,
  });

  const todayStr = formatLocalDate(today);

  const { error: deleteError } = await supabaseAdmin
    .from("training_plan_workouts")
    .delete()
    .eq("training_plan_id", plan.id)
    .gte("scheduled_date", todayStr);

  if (deleteError) {
    console.error("Failed to clear upcoming workouts for plan adjustment:", deleteError);
    return NextResponse.json({ error: "Failed to adjust training plan." }, { status: 500 });
  }

  const planStart = parseLocalDate(plan.start_date);
  function weekNumberFor(dateStr: string) {
    const diffDays = Math.round((parseLocalDate(dateStr).getTime() - planStart.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, Math.floor(diffDays / 7) + 1);
  }

  const restDayRows = Array.from({ length: restDays }, (_, i) => {
    const dateStr = formatLocalDate(addDays(today, i));
    return {
      training_plan_id: plan.id,
      user_id: targetUserId,
      scheduled_date: dateStr,
      week_number: weekNumberFor(dateStr),
      workout_type: "Recovery",
      title: "Rest Day",
      description: "Scheduled rest day to support recovery before resuming training.",
      duration_minutes: 0,
      distance_miles: 0,
      elevation_feet: 0,
      intensity: "Rest — no training",
    };
  });

  const workoutRows = generatedPlan.workouts.map((workout) => ({
    training_plan_id: plan.id,
    user_id: targetUserId,
    scheduled_date: workout.scheduled_date,
    week_number: weekNumberFor(workout.scheduled_date),
    workout_type: workout.workout_type,
    title: workout.title,
    description: workout.description,
    duration_minutes: workout.duration_minutes,
    distance_miles: workout.distance_miles,
    elevation_feet: workout.elevation_feet,
    intensity: workout.intensity,
  }));

  const newRows = [...restDayRows, ...workoutRows];

  if (newRows.length) {
    const { error: insertError } = await supabaseAdmin.from("training_plan_workouts").insert(newRows);

    if (insertError) {
      console.error("Failed to insert adjusted training plan workouts:", insertError);
      return NextResponse.json({ error: "Failed to adjust training plan." }, { status: 500 });
    }
  }

  const previousSummary =
    plan.generation_summary && typeof plan.generation_summary === "object" ? plan.generation_summary : {};

  const { data: updatedPlan, error: updatePlanError } = await supabaseAdmin
    .from("training_plans")
    .update({
      end_date: generatedPlan.endDate,
      generation_summary: {
        ...previousSummary,
        last_adjustment: {
          adjusted_at: now.toISOString(),
          rest_days: restDays,
          readiness_score: readinessScore,
          recent_training_load: recentTrainingLoad,
          days_until_event: daysUntilEvent,
        },
      },
    })
    .eq("id", plan.id)
    .eq("user_id", targetUserId)
    .select()
    .maybeSingle();

  if (updatePlanError || !updatedPlan) {
    console.error("Failed to update training plan after adjustment:", updatePlanError);
    return NextResponse.json({ error: "Failed to adjust training plan." }, { status: 500 });
  }

  const { data: workouts, error: workoutsError } = await supabaseAdmin
    .from("training_plan_workouts")
    .select("*")
    .eq("training_plan_id", plan.id)
    .order("scheduled_date", { ascending: true });

  if (workoutsError) {
    console.error("Failed to reload training plan workouts after adjustment:", workoutsError);
    return NextResponse.json({ error: "Failed to load updated training plan." }, { status: 500 });
  }

  return NextResponse.json({ plan: updatedPlan, workouts: workouts ?? [] });
}
