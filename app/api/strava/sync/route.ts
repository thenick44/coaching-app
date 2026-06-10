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

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Strava sync is not configured on the server." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const accessToken = body?.access_token;

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Determine which Strava connection to use
  let connection: any = null;
  let targetUserId: string | null = null;

  if (accessToken) {
    const user = await getAuthenticatedUser(accessToken);
    if (user?.id) {
      const { data, error } = await supabaseAdmin
        .from("strava_connections")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Failed to fetch Strava connection for user:", error);
        return NextResponse.json({ error: "Failed to load Strava connection." }, { status: 500 });
      }

      if (data) {
        connection = data;
        targetUserId = data.user_id;
        console.log("Strava sync: using authenticated user's connection", { userId: targetUserId });
      }
    } else {
      console.log("Strava sync: access token present but could not authenticate user");
    }
  }

  // Development fallback: use first row from public.strava_connections
  if (!connection) {
    // Temporary development-only behavior: fall back to first strava_connections row
    // NOTE: Remove this fallback before deploying to production.
    const { data: firstConn, error: connError } = await supabaseAdmin
      .from("strava_connections")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (connError) {
      console.error("Failed to load strava_connections fallback:", connError);
      return NextResponse.json({ error: "Unable to load fallback Strava connection." }, { status: 500 });
    }

    if (firstConn && firstConn.access_token) {
      connection = firstConn;
      targetUserId = firstConn.user_id;
      console.log("Development mode: using first strava_connections row for sync", { userId: targetUserId });
    }
  }

  if (!connection || !connection.access_token) {
    return NextResponse.json({ error: "No Strava connection available for sync." }, { status: 404 });
  }

  const stravaAccessToken = connection.access_token;

  const activitiesResponse = await fetch(
    "https://www.strava.com/api/v3/athlete/activities?per_page=30",
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
