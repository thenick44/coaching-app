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
  if (!accessToken) {
    return NextResponse.json(
      { error: "Missing access token for user authentication." },
      { status: 400 }
    );
  }

  const user = await getAuthenticatedUser(accessToken);
  if (!user) {
    return NextResponse.json(
      { error: "Unable to authenticate user." },
      { status: 401 }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("strava_connections")
    .select("access_token")
    .eq("user_id", user.id)
    .maybeSingle();

  if (connectionError) {
    console.error("Failed to fetch Strava connection:", connectionError);
    return NextResponse.json(
      { error: "Failed to load Strava connection." },
      { status: 500 }
    );
  }

  const stravaAccessToken = connection?.access_token;
  if (!stravaAccessToken) {
    return NextResponse.json(
      { error: "No Strava connection found for this user." },
      { status: 404 }
    );
  }

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
    return NextResponse.json(
      { error: "Failed to fetch activities from Strava." },
      { status: activitiesResponse.status }
    );
  }

  const activities = await activitiesResponse.json();
  if (!Array.isArray(activities)) {
    return NextResponse.json(
      { error: "Unexpected Strava response format." },
      { status: 500 }
    );
  }

  let imported = 0;

  for (const activity of activities) {
    if (!activity?.id) continue;

    const { error: upsertError } = await supabaseAdmin.from("activities").upsert(
      {
        user_id: user.id,
        strava_activity_id: activity.id,
        activity_json: activity,
      },
      { onConflict: "strava_activity_id" }
    );

    if (upsertError) {
      console.error("Failed to upsert activity:", upsertError, activity);
      continue;
    }

    imported += 1;
  }

  return NextResponse.json({ imported });
}
