import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin, getBearerToken, isServerConfigured, resolveTargetUserId } from "@/src/lib/serverAuth";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isServerConfigured()) {
    return NextResponse.json({ error: "Training plans API is not configured." }, { status: 500 });
  }

  const params = await context.params;
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
  if (!isServerConfigured()) {
    return NextResponse.json({ error: "Training plans API is not configured." }, { status: 500 });
  }

  const params = await context.params;
  const targetUserId = await resolveTargetUserId(getBearerToken(request));

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const supabaseAdmin = createSupabaseAdmin()!;
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
