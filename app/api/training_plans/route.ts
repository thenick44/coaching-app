import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  type ActivityRecord,
  buildWeeklyStats,
  calculateReadinessScore,
  calculateRecentTrainingLoad,
  getDaysUntilEvent,
  getWeekStart,
} from "@/src/lib/activityMetrics";
import { generateTrainingPlan, formatLocalDate, type PlanGoalInput } from "@/src/lib/trainingPlanGenerator";

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

export async function GET(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Training plans API is not configured." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const targetUserId = await resolveTargetUserId(accessToken || undefined);

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data: plans, error } = await supabaseAdmin
    .from("training_plans")
    .select("*")
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load training plans:", error);
    return NextResponse.json({ error: "Failed to load training plans." }, { status: 500 });
  }

  const planIds = (plans ?? []).map((plan) => plan.id);
  const progressByPlan: Record<string, { completed_count: number; total_count: number }> = {};

  if (planIds.length) {
    const { data: workouts, error: workoutsError } = await supabaseAdmin
      .from("training_plan_workouts")
      .select("training_plan_id, completed")
      .in("training_plan_id", planIds);

    if (workoutsError) {
      console.error("Failed to load training plan workout counts:", workoutsError);
    } else {
      (workouts ?? []).forEach((workout) => {
        const entry = progressByPlan[workout.training_plan_id] ?? { completed_count: 0, total_count: 0 };
        entry.total_count += 1;
        if (workout.completed) entry.completed_count += 1;
        progressByPlan[workout.training_plan_id] = entry;
      });
    }
  }

  const plansWithProgress = (plans ?? []).map((plan) => ({
    ...plan,
    completed_count: progressByPlan[plan.id]?.completed_count ?? 0,
    total_count: progressByPlan[plan.id]?.total_count ?? 0,
  }));

  return NextResponse.json({ plans: plansWithProgress });
}

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Training plans API is not configured." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const targetUserId = await resolveTargetUserId(accessToken || undefined);

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date();

  const goalSelect = "id, name, event_date, event_type, distance_miles, elevation_feet, expected_high_temp_f";
  let goal: PlanGoalInput | null = null;

  if (body.goal_id) {
    const { data: goalRow, error: goalError } = await supabaseAdmin
      .from("goals")
      .select(goalSelect)
      .eq("id", body.goal_id)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (goalError) {
      console.error("Failed to load goal for training plan:", goalError);
      return NextResponse.json({ error: "Failed to load goal." }, { status: 500 });
    }
    if (!goalRow) {
      return NextResponse.json({ error: "Goal not found." }, { status: 404 });
    }
    goal = goalRow;
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
      console.error("Failed to load nearest goal for training plan:", goalError);
      return NextResponse.json({ error: "Failed to load goal." }, { status: 500 });
    }
    goal = goalRow ?? null;
  }

  const daysUntilEvent = goal ? getDaysUntilEvent(goal.event_date, now) : null;

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
    console.error("Failed to load activities for training plan:", activityError);
    return NextResponse.json({ error: "Failed to load activity data." }, { status: 500 });
  }

  const weeklyStats = buildWeeklyStats((activities ?? []) as ActivityRecord[], currentWeekStart, 12);
  const recentTrainingLoad = calculateRecentTrainingLoad(weeklyStats, 4);
  const readinessScore = calculateReadinessScore(
    weeklyStats[weeklyStats.length - 1].distance,
    weeklyStats[weeklyStats.length - 2].distance
  );

  const availableTrainingDays: number[] = Array.isArray(body.available_training_days) && body.available_training_days.length
    ? Array.from(
        new Set(
          (body.available_training_days as unknown[]).filter(
            (day): day is number => typeof day === "number" && day >= 0 && day <= 6
          )
        )
      )
    : [0, 1, 2, 3, 4, 5, 6];

  if (!availableTrainingDays.length) {
    return NextResponse.json({ error: "At least one available training day is required." }, { status: 400 });
  }

  let startDate: Date;
  if (typeof body.start_date === "string" && body.start_date) {
    startDate = new Date(`${body.start_date}T00:00:00`);
    if (Number.isNaN(startDate.valueOf())) {
      return NextResponse.json({ error: "Invalid start date." }, { status: 400 });
    }
  } else {
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
  }

  const generatedPlan = generateTrainingPlan({
    goal,
    daysUntilEvent,
    recentTrainingLoad,
    readinessScore,
    availableTrainingDays,
    startDate,
  });

  const planName = typeof body.name === "string" && body.name.trim()
    ? body.name.trim()
    : goal
      ? `${goal.name} Training Plan`
      : `${generatedPlan.totalWeeks}-Week Training Plan`;

  const { error: archiveError } = await supabaseAdmin
    .from("training_plans")
    .update({ status: "archived" })
    .eq("user_id", targetUserId)
    .eq("status", "active");

  if (archiveError) {
    console.error("Failed to archive existing training plans:", archiveError);
    return NextResponse.json({ error: "Failed to archive existing training plans." }, { status: 500 });
  }

  const { data: insertedPlan, error: insertPlanError } = await supabaseAdmin
    .from("training_plans")
    .insert([
      {
        user_id: targetUserId,
        goal_id: goal?.id ?? null,
        name: planName,
        start_date: generatedPlan.startDate,
        end_date: generatedPlan.endDate,
        status: "active",
        available_training_days: availableTrainingDays,
        generation_summary: {
          goal,
          days_until_event: daysUntilEvent,
          readiness_score: readinessScore,
          recent_training_load: recentTrainingLoad,
          total_weeks: generatedPlan.totalWeeks,
        },
      },
    ])
    .select()
    .maybeSingle();

  if (insertPlanError || !insertedPlan) {
    console.error("Failed to create training plan:", insertPlanError);
    return NextResponse.json({ error: "Failed to create training plan." }, { status: 500 });
  }

  const workoutRows = generatedPlan.workouts.map((workout) => ({
    training_plan_id: insertedPlan.id,
    user_id: targetUserId,
    scheduled_date: workout.scheduled_date,
    week_number: workout.week_number,
    workout_type: workout.workout_type,
    title: workout.title,
    description: workout.description,
    duration_minutes: workout.duration_minutes,
    distance_miles: workout.distance_miles,
    elevation_feet: workout.elevation_feet,
    intensity: workout.intensity,
  }));

  const { data: insertedWorkouts, error: insertWorkoutsError } = await supabaseAdmin
    .from("training_plan_workouts")
    .insert(workoutRows)
    .select();

  if (insertWorkoutsError) {
    console.error("Failed to create training plan workouts:", insertWorkoutsError);
    return NextResponse.json({ error: "Failed to create training plan workouts." }, { status: 500 });
  }

  const sortedWorkouts = (insertedWorkouts ?? [])
    .slice()
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  return NextResponse.json({ plan: insertedPlan, workouts: sortedWorkouts });
}
