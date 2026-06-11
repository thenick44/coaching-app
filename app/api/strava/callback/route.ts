import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin, isServerConfigured, resolveTargetUserId } from "@/src/lib/serverAuth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

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

  if (!isServerConfigured()) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL");
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

    // Redacted server log for success (no tokens)
    console.log("Strava OAuth Success:", {
      athlete_id: tokenData.athlete?.id,
      athlete_name: tokenData.athlete ? `${tokenData.athlete?.firstname} ${tokenData.athlete?.lastname}` : undefined,
    });

    const athleteId = tokenData.athlete?.id ?? null;
    const userId = state || (await resolveTargetUserId());

    if (!userId || !athleteId) {
      return NextResponse.redirect(new URL("/settings?error=oauth_error", request.url));
    }

    const supabaseAdmin = createSupabaseAdmin()!;
    const { error: upsertError } = await supabaseAdmin
      .from("strava_connections")
      .upsert(
        {
          user_id: userId,
          athlete_id: athleteId,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: tokenData.expires_at,
          scope: tokenData.scope,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("Failed to upsert strava_connections:", upsertError.message);
      return NextResponse.redirect(new URL("/settings?error=oauth_error", request.url));
    }

    return NextResponse.redirect(new URL("/settings?strava=connected", request.url));
  } catch (error) {
    console.error("Strava OAuth error:", error);
    return NextResponse.redirect(
      new URL("/settings?error=oauth_error", request.url)
    );
  }
}
