import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/src/lib/supabaseClient";

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

    // Redacted server log for success (no tokens)
    console.log("Strava OAuth Success:", {
      athlete_id: tokenData.athlete?.id,
      athlete_name: tokenData.athlete ? `${tokenData.athlete?.firstname} ${tokenData.athlete?.lastname}` : undefined,
    });

    const athleteId = tokenData.athlete?.id ?? null;

    try {
      if (supabase && athleteId) {
        // Try to determine the signed-in user on the server via the anon client.
        // This may return null if no user session is present; in that case redirect with dev flag.
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user ?? null;

        if (user) {
          const { error: updateError } = await supabase
            .from("profiles")
            .update({ strava_athlete_id: athleteId })
            .eq("id", user.id);

          if (updateError) {
            console.error("Failed to update profile with Strava athlete id:", updateError.message);
          }

          return NextResponse.redirect(new URL("/settings?strava=connected", request.url));
        }
      }

      // If we reach here, no signed-in user was found or supabase isn't configured
      return NextResponse.redirect(new URL("/settings?strava=connected_dev", request.url));
    } catch (err) {
      console.error("Strava post-exchange handling error:", err);
      return NextResponse.redirect(new URL("/settings?error=oauth_error", request.url));
    }
  } catch (error) {
    console.error("Strava OAuth error:", error);
    return NextResponse.redirect(
      new URL("/settings?error=oauth_error", request.url)
    );
  }
}
