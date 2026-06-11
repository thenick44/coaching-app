import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin, getBearerToken, isServerConfigured, resolveTargetUserId } from "@/src/lib/serverAuth";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isServerConfigured()) {
    return NextResponse.json({ error: "Training plan workouts API is not configured." }, { status: 500 });
  }

  const params = await context.params;
  const body = await request.json().catch(() => ({}));
  const targetUserId = await resolveTargetUserId(getBearerToken(request));

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.completed === "boolean") {
    updates.completed = body.completed;
    updates.completed_at = body.completed ? new Date().toISOString() : null;
  }
  if (typeof body.notes === "string" || body.notes === null) {
    updates.notes = body.notes;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdmin()!;
  const { data, error } = await supabaseAdmin
    .from("training_plan_workouts")
    .update(updates)
    .eq("id", params.id)
    .eq("user_id", targetUserId)
    .select()
    .maybeSingle();

  if (error) {
    console.error("Failed to update training plan workout:", error);
    return NextResponse.json({ error: "Failed to update workout." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Workout not found." }, { status: 404 });
  }

  return NextResponse.json({ workout: data });
}
