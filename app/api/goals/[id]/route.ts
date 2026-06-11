import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin, getBearerToken, isServerConfigured, resolveTargetUserId } from "@/src/lib/serverAuth";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isServerConfigured()) {
    return NextResponse.json({ error: "Goals API is not configured." }, { status: 500 });
  }

  const params = await context.params;
  const body = await request.json().catch(() => ({}));
  const targetUserId = await resolveTargetUserId(getBearerToken(request));

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const { name, event_date, event_location, event_type, distance_miles, elevation_feet, expected_low_temp_f, expected_high_temp_f, weather_notes, forecast_last_updated_at, target_finish_time, notes } = body;
  if (!name || !event_date) {
    return NextResponse.json({ error: "Name and event date are required." }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdmin()!;
  const { data, error } = await supabaseAdmin
    .from("goals")
    .update({
      name,
      event_date,
      event_location,
      event_type,
      distance_miles,
      elevation_feet,
      expected_low_temp_f,
      expected_high_temp_f,
      weather_notes,
      forecast_last_updated_at,
      target_finish_time,
      notes,
    })
    .eq("id", params.id)
    .eq("user_id", targetUserId)
    .select()
    .maybeSingle();

  if (error) {
    console.error("Failed to update goal:", error);
    return NextResponse.json({ error: "Failed to update goal." }, { status: 500 });
  }

  return NextResponse.json({ goal: data });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isServerConfigured()) {
    return NextResponse.json({ error: "Goals API is not configured." }, { status: 500 });
  }

  const params = await context.params;
  const targetUserId = await resolveTargetUserId(getBearerToken(request));

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const supabaseAdmin = createSupabaseAdmin()!;
  const { error } = await supabaseAdmin
    .from("goals")
    .delete()
    .eq("id", params.id)
    .eq("user_id", targetUserId);

  if (error) {
    console.error("Failed to delete goal:", error);
    return NextResponse.json({ error: "Failed to delete goal." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
