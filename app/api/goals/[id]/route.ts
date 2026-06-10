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

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Goals API is not configured." }, { status: 500 });
  }

  const params = await context.params;
  const body = await request.json().catch(() => ({}));
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const targetUserId = await resolveTargetUserId(accessToken || undefined);

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const { name, event_date, event_location, event_type, distance_miles, elevation_feet, expected_low_temp_f, expected_high_temp_f, weather_notes, forecast_last_updated_at, target_finish_time, notes } = body;
  if (!name || !event_date) {
    return NextResponse.json({ error: "Name and event date are required." }, { status: 400 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
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
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Goals API is not configured." }, { status: 500 });
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
