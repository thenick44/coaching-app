import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getUserFromAccessToken(accessToken: string) {
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

export async function GET(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Dashboard data is not configured on the server." },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  let targetUserId: string | null = null;
  let developmentMode = false;

  // Try to authenticate user from access token (if provided)
  let user = null;
  if (accessToken) {
    user = await getUserFromAccessToken(accessToken);
    if (user?.id) {
      targetUserId = user.id;
      console.log("Dashboard data: authenticated user detected", { userId: targetUserId });
    } else {
      console.log("Dashboard data: access token present but failed to authenticate user");
    }
  }

  // If no authenticated user was found, fall back to the first strava_connections row
  if (!targetUserId) {
    // Temporary development-only fallback: use first strava_connections row when no user
    // NOTE: This is a development convenience and should be removed before production.
    const { data: firstConn, error: connError } = await supabaseAdmin
      .from("strava_connections")
      .select("user_id")
      .limit(1)
      .maybeSingle();

    if (connError) {
      console.error("Failed to load strava_connections fallback:", connError);
      return NextResponse.json(
        { error: "Unable to load fallback Strava connection." },
        { status: 500 }
      );
    }

    if (firstConn && firstConn.user_id) {
      targetUserId = firstConn.user_id;
      developmentMode = true;
      console.log("Development mode: dashboard using first strava_connections row", { userId: targetUserId });
    }
  }

  // If we still don't have a user id, return 401
  if (!targetUserId) {
    return NextResponse.json(
      { error: "Authentication required or no Strava connection available." },
      { status: 401 }
    );
  }

  const { data: activities, error: activitiesError } = await supabaseAdmin
    .from("activities")
    .select("strava_activity_id, raw_json")
    .eq("user_id", targetUserId)
    .order("strava_activity_id", { ascending: false });

  if (activitiesError) {
    console.error("Failed to load dashboard activities:", activitiesError);
    return NextResponse.json(
      { error: "Failed to load dashboard data." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    developmentMode,
    targetUserId,
    activityCount: Array.isArray(activities) ? activities.length : 0,
    activities: Array.isArray(activities) ? activities : [],
  });
}
