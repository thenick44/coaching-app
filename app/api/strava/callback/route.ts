import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!clientId || !clientSecret) {
    console.error("Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET");
    return NextResponse.redirect(
      new URL("/settings?error=config_error", request.url)
    );
  }

  if (!supabaseUrl || !serviceRoleKey) {
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

    try {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
      let userId: string | null = null;
      let developmentFallback = false;

      // Temporary development-only logic: no authenticated browser session required.
      console.log("Development mode: using first profile row for Strava connection");
      developmentFallback = true;

      const { data: fallbackProfile, error: profileError } = await supabaseAdmin
        .from("public.profiles")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (profileError) {
        console.error("Error querying public.profiles for development fallback:", profileError.message);
      }

      if (fallbackProfile?.id) {
        userId = fallbackProfile.id;
        console.log("Development mode: using first profile row for Strava connection", fallbackProfile.id);
      } else {
        console.error(
          "Development mode active but no profile row was found in public.profiles. Cannot store Strava connection."
        );
        return NextResponse.redirect(new URL("/settings?error=oauth_error", request.url));
      }

      if (!userId || !athleteId) {
        return NextResponse.redirect(new URL("/settings?strava=connected_dev", request.url));
      }

      const { error: upsertError } = await supabaseAdmin
        .from("public.strava_connections")
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

      if (developmentFallback) {
        console.log("Strava connection saved using development fallback user_id:", userId);
      }

      if (upsertError) {
        console.error("Failed to upsert strava_connections:", upsertError.message);
      }

      return NextResponse.redirect(new URL("/settings?strava=connected", request.url));
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
