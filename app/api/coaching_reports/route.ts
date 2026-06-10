import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ActivityRecord = {
  raw_json: {
    start_date?: string;
    distance?: number;
    total_elevation_gain?: number;
    moving_time?: number;
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

function buildReportSummary(
  currentDistance: number,
  previousDistance: number,
  currentElevation: number,
  currentMovingTime: number,
  upcomingGoals: GoalRecord[]
) {
  const distanceChange = currentDistance - previousDistance;
  const trend = distanceChange >= 0 ? "up" : "down";
  const distancePhrase = Math.abs(distanceChange) < 0.1
    ? "steady"
    : `${trend} ${Math.abs(distanceChange).toFixed(1)} miles from last week`;

  const firstGoal = upcomingGoals[0];
  const goalPhrase = firstGoal
    ? `Your next goal is ${firstGoal.name} on ${new Date(firstGoal.event_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}.`
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
    .select("id, name, event_date, event_location, event_type, distance_miles")
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

  const parsedGoals = (goals ?? []).map((goal: GoalRecord) => ({
    id: goal.id,
    name: goal.name,
    event_date: goal.event_date,
    event_location: goal.event_location ?? null,
    event_type: goal.event_type ?? null,
    distance_miles: goal.distance_miles ?? null,
  }));

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
  });

  const readinessScore = calculateReadinessScore(reportMetrics.currentDistance, reportMetrics.previousDistance);
  const reportSummary = buildReportSummary(
    reportMetrics.currentDistance,
    reportMetrics.previousDistance,
    reportMetrics.currentElevation,
    reportMetrics.currentMovingTime,
    parsedGoals
  );

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
