import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin, getBearerToken, isServerConfigured, resolveTargetUserId } from "@/src/lib/serverAuth";

export async function GET(request: NextRequest) {
  if (!isServerConfigured()) {
    return NextResponse.json(
      { error: "Dashboard data is not configured on the server." },
      { status: 500 }
    );
  }

  const targetUserId = await resolveTargetUserId(getBearerToken(request));

  if (!targetUserId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const supabaseAdmin = createSupabaseAdmin()!;
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
    targetUserId,
    activityCount: Array.isArray(activities) ? activities.length : 0,
    activities: Array.isArray(activities) ? activities : [],
  });
}
