import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const redirectUri = "https://coaching-app-hazel-six.vercel.app/api/strava/callback";
  const scopes = "read,activity:read_all";

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

  return NextResponse.redirect(stravaAuthUrl.toString());
}
