import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const scope = request.nextUrl.searchParams.get("scope");

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?error=no_code", request.url)
    );
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET");
    return NextResponse.redirect(
      new URL("/settings?error=config_error", request.url)
    );
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      console.error(
        "Failed to exchange code for token:",
        tokenResponse.status,
        await tokenResponse.text()
      );
      return NextResponse.redirect(
        new URL("/settings?error=token_exchange_failed", request.url)
      );
    }

    const tokenData = await tokenResponse.json();

    // Log athlete info and token response
    console.log("Strava OAuth Success:", {
      athlete_id: tokenData.athlete?.id,
      athlete_name: `${tokenData.athlete?.firstname} ${tokenData.athlete?.lastname}`,
      token_response: {
        access_token: tokenData.access_token ? "[REDACTED]" : undefined,
        refresh_token: tokenData.refresh_token ? "[REDACTED]" : undefined,
        expires_at: tokenData.expires_at,
        token_type: tokenData.token_type,
      },
    });

    // TODO: Store tokens in the database when ready
    // For now, just log and redirect
    return NextResponse.redirect(
      new URL("/settings?strava=connected", request.url)
    );
  } catch (error) {
    console.error("Strava OAuth error:", error);
    return NextResponse.redirect(
      new URL("/settings?error=oauth_error", request.url)
    );
  }
}
