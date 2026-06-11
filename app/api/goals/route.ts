import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin, getBearerToken, isServerConfigured, resolveTargetUserId } from "@/src/lib/serverAuth";

export async function GET(request: NextRequest) {
  if (!isServerConfigured()) {
    return NextResponse.json({ error: "Goals API is not configured." }, { status: 500 });
  }

  const targetUserId = await resolveTargetUserId(getBearerToken(request));

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const supabaseAdmin = createSupabaseAdmin()!;
  const { data, error } = await supabaseAdmin
    .from("goals")
    .select("*")
    .eq("user_id", targetUserId)
    .order("event_date", { ascending: true });

  if (error) {
    console.error("Failed to fetch goals:", error);
    return NextResponse.json({ error: "Failed to load goals." }, { status: 500 });
  }

  return NextResponse.json({ goals: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!isServerConfigured()) {
    return NextResponse.json({ error: "Goals API is not configured." }, { status: 500 });
  }

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
    .insert([
      {
        user_id: targetUserId,
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
      },
    ])
    .select()
    .maybeSingle();

  if (error) {
    console.error("Failed to create goal:", error);
    return NextResponse.json({ error: "Failed to create goal." }, { status: 500 });
  }

  return NextResponse.json({ goal: data });
}
