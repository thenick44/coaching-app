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

  if (accessToken) {
    const user = await getUserFromAccessToken(accessToken);
    if (user?.id) {
      targetUserId = user.id;
    } else if (process.env.NODE_ENV !== "production") {
      developmentMode = true;
    } else {
      return NextResponse.json(
        { error: "Unable to authenticate user." },
        { status: 401 }
      );
    }
  } else if (process.env.NODE_ENV !== "production") {
    developmentMode = true;
  } else {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  if (developmentMode) {
    const { data: fallbackConnections, error: fallbackError } = await supabaseAdmin
      .from("strava_connections")
      .select("user_id")
      .limit(1);

    if (fallbackError) {
      console.error("Failed to load fallback Strava connection:", fallbackError);
      return NextResponse.json(
        { error: "Unable to load development fallback connection." },
        { status: 500 }
      );
    }

    targetUserId = fallbackConnections?.[0]?.user_id ?? null;
    if (!targetUserId) {
      return NextResponse.json(
        { error: "No Strava connection found for development fallback." },
        { status: 404 }
      );
    }
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
