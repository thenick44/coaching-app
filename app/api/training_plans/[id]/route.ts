import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Training plans API is not configured." }, { status: 500 });
  }

  const params = await context.params;
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const targetUserId = await resolveTargetUserId(accessToken || undefined);

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
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

  const { data: workouts, error: workoutsError } = await supabaseAdmin
    .from("training_plan_workouts")
    .select("*")
    .eq("training_plan_id", plan.id)
    .order("scheduled_date", { ascending: true });

  if (workoutsError) {
    console.error("Failed to load training plan workouts:", workoutsError);
    return NextResponse.json({ error: "Failed to load training plan workouts." }, { status: 500 });
  }

  return NextResponse.json({ plan, workouts: workouts ?? [] });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Training plans API is not configured." }, { status: 500 });
  }

  const params = await context.params;
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const targetUserId = await resolveTargetUserId(accessToken || undefined);

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { error } = await supabaseAdmin
    .from("training_plans")
    .delete()
    .eq("id", params.id)
    .eq("user_id", targetUserId);

  if (error) {
    console.error("Failed to delete training plan:", error);
    return NextResponse.json({ error: "Failed to delete training plan." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
