import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin, isServerConfigured, resolveTargetUserId } from "@/src/lib/serverAuth";

export async function POST(request: NextRequest) {
  if (!isServerConfigured()) {
    return NextResponse.json(
      { error: "Strava sync is not configured on the server." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const accessToken = typeof body?.access_token === "string" ? body.access_token : undefined;

  const targetUserId = await resolveTargetUserId(accessToken);

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const supabaseAdmin = createSupabaseAdmin()!;
  const { data: connection, error } = await supabaseAdmin
    .from("strava_connections")
    .select("*")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch Strava connection for user:", error);
    return NextResponse.json({ error: "Failed to load Strava connection." }, { status: 500 });
  }

  if (!connection || !connection.access_token) {
    return NextResponse.json({ error: "No Strava connection available for sync." }, { status: 404 });
  }

  const stravaAccessToken = connection.access_token;

  const activitiesResponse = await fetch(
    "https://www.strava.com/api/v3/athlete/activities?per_page=90",
    {
      headers: {
        Authorization: `Bearer ${stravaAccessToken}`,
      },
    }
  );

  if (!activitiesResponse.ok) {
    const text = await activitiesResponse.text();
    console.error("Failed to fetch Strava activities:", activitiesResponse.status, text);
    return NextResponse.json({ error: "Failed to fetch activities from Strava." }, { status: activitiesResponse.status });
  }

  const activities = await activitiesResponse.json();
  if (!Array.isArray(activities)) {
    return NextResponse.json({ error: "Unexpected Strava response format." }, { status: 500 });
  }

  let imported = 0;

  for (const activity of activities) {
    if (!activity?.id) continue;

    const row = {
      user_id: targetUserId,
      strava_activity_id: activity.id,
      name: activity.name ?? null,
      sport_type: activity.sport_type ?? activity.type ?? null,
      distance_meters: activity.distance ?? null,
      moving_time_seconds: activity.moving_time ?? null,
      elevation_gain_meters: activity.total_elevation_gain ?? null,
      average_speed: activity.average_speed ?? null,
      max_speed: activity.max_speed ?? null,
      start_date: activity.start_date ?? activity.start_date_local ?? null,
      raw_json: activity,
    };

    const { error: upsertError } = await supabaseAdmin.from("activities").upsert(row, { onConflict: "strava_activity_id" });
    if (upsertError) {
      console.error("Failed to upsert activity:", upsertError, activity);
      continue;
    }
    imported += 1;
  }

  return NextResponse.json({ imported });
}
