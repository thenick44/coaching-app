import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, resolveTargetUserId } from "@/src/lib/serverAuth";

export async function GET(request: NextRequest) {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://trainingsignals.cc";
  const redirectUri = `${siteUrl}/api/strava/callback`;
  const scopes = "read,activity:read_all";

  if (!clientId) {
    return NextResponse.json(
      { error: "STRAVA_CLIENT_ID is not configured" },
      { status: 500 }
    );
  }

  const userId = await resolveTargetUserId(getBearerToken(request));

  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const stravaAuthUrl = new URL("https://www.strava.com/oauth/authorize");
  stravaAuthUrl.searchParams.set("client_id", clientId);
  stravaAuthUrl.searchParams.set("redirect_uri", redirectUri);
  stravaAuthUrl.searchParams.set("response_type", "code");
  stravaAuthUrl.searchParams.set("scope", scopes);
  stravaAuthUrl.searchParams.set("state", userId);

  return NextResponse.json({ url: stravaAuthUrl.toString() });
}
