import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://coaching-app-hazel-six.vercel.app";
  const redirectUri = `${siteUrl}/api/strava/callback`;
  const scopes = "read,activity:read_all";
  const userId = request.nextUrl.searchParams.get("user_id");

  if (!clientId) {
    return NextResponse.json(
      { error: "STRAVA_CLIENT_ID is not configured" },
      { status: 500 }
    );
  }

  const stravaAuthUrl = new URL("https://www.strava.com/oauth/authorize");
  stravaAuthUrl.searchParams.set("client_id", clientId);
  stravaAuthUrl.searchParams.set("redirect_uri", redirectUri);
  stravaAuthUrl.searchParams.set("response_type", "code");
  stravaAuthUrl.searchParams.set("scope", scopes);
  if (userId) {
    stravaAuthUrl.searchParams.set("state", userId);
  }

  return NextResponse.redirect(stravaAuthUrl.toString());
}
