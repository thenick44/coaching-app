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

export async function GET(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Goals API is not configured." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const targetUserId = await resolveTargetUserId(accessToken || undefined);

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
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
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Goals API is not configured." }, { status: 500 });
  }

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
