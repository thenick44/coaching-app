import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin, getAuthenticatedUser, getBearerToken, isServerConfigured, resolveTargetUserId } from "@/src/lib/serverAuth";

export async function GET(request: NextRequest) {
  if (!isServerConfigured()) {
    return NextResponse.json(
      { error: "Dashboard data is not configured on the server." },
      { status: 500 }
    );
  }

  const accessToken = getBearerToken(request);

  let targetUserId: string | null = null;
  let developmentMode = false;

  if (accessToken) {
    const user = await getAuthenticatedUser(accessToken);
    if (user?.id) {
      targetUserId = user.id;
    }
  }

  if (!targetUserId) {
    targetUserId = await resolveTargetUserId();
    developmentMode = Boolean(targetUserId);
  }

  if (!targetUserId) {
    return NextResponse.json(
      { error: "Authentication required or no profile available." },
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
    developmentMode,
    targetUserId,
    activityCount: Array.isArray(activities) ? activities.length : 0,
    activities: Array.isArray(activities) ? activities : [],
  });
}
