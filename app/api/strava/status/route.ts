import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin, getBearerToken, isServerConfigured, resolveTargetUserId } from "@/src/lib/serverAuth";

export async function GET(request: NextRequest) {
  if (!isServerConfigured()) {
    return NextResponse.json(
      { has_connection: false, error: "Strava status is not configured." },
      { status: 500 }
    );
  }

  const targetUserId = await resolveTargetUserId(getBearerToken(request));

  if (!targetUserId) {
    return NextResponse.json(
      { has_connection: false, error: "Unable to resolve user." },
      { status: 401 }
    );
  }

  const supabaseAdmin = createSupabaseAdmin()!;
  const { data, error } = await supabaseAdmin
    .from("strava_connections")
    .select("id, athlete_id, scope, last_synced_at")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load Strava connection status:", error);
    return NextResponse.json(
      { has_connection: false, error: "Unable to load Strava connection status." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    has_connection: Boolean(data),
    athlete_id: data?.athlete_id ?? null,
    scope: data?.scope ?? null,
    last_synced_at: data?.last_synced_at ?? null,
  });
}
