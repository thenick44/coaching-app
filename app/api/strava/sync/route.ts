import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin, isServerConfigured, resolveTargetUserId } from "@/src/lib/serverAuth";

const MAX_PAGE_SIZE = 200;
// When doing an incremental sync, look back this far before the last sync to
// catch activities that were added/edited with a start_date in the past.
const INCREMENTAL_LOOKBACK_SECONDS = 14 * 24 * 60 * 60;
// Refresh the Strava access token if it's already expired or will expire
// within this window.
const TOKEN_REFRESH_BUFFER_SECONDS = 5 * 60;

type StravaTokenRefreshResult = { accessToken: string } | { error: string };

async function refreshStravaToken(
  supabaseAdmin: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  targetUserId: string,
  refreshToken: string
): Promise<StravaTokenRefreshResult> {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET for token refresh");
    return { error: "Strava sync is not configured on the server." };
  }

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Failed to refresh Strava token:", response.status, text);
    return { error: "Your Strava connection has expired. Please reconnect Strava in Settings." };
  }

  const data = await response.json();

  const { error: updateError } = await supabaseAdmin
    .from("strava_connections")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", targetUserId);

  if (updateError) {
    console.error("Failed to persist refreshed Strava token:", updateError);
  }

  return { accessToken: data.access_token };
}

export async function POST(request: NextRequest) {
  if (!isServerConfigured()) {
    return NextResponse.json(
      { error: "Strava sync is not configured on the server." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const accessToken = typeof body?.access_token === "string" ? body.access_token : undefined;
  const resync = body?.resync === true;

  const targetUserId = await resolveTargetUserId(accessToken);

  if (!targetUserId) {
    return NextResponse.json({ error: "Unable to resolve user." }, { status: 401 });
  }

  const supabaseAdmin = createSupabaseAdmin()!;
  const { data: connection, error } = await supabaseAdmin
    .from("strava_connections")
    .select("*")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch Strava connection for user:", error);
    return NextResponse.json({ error: "Failed to load Strava connection." }, { status: 500 });
  }

  if (!connection || !connection.access_token) {
    return NextResponse.json({ error: "No Strava connection available for sync." }, { status: 404 });
  }

  let stravaAccessToken = connection.access_token;
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (connection.expires_at && connection.expires_at <= nowSeconds + TOKEN_REFRESH_BUFFER_SECONDS) {
    const refreshed = await refreshStravaToken(supabaseAdmin, targetUserId, connection.refresh_token);
    if ("error" in refreshed) {
      return NextResponse.json({ error: refreshed.error }, { status: 401 });
    }
    stravaAccessToken = refreshed.accessToken;
  }

  const params = new URLSearchParams({ per_page: String(MAX_PAGE_SIZE) });
  if (!resync && connection.last_synced_at) {
    const lastSyncedSeconds = Math.floor(new Date(connection.last_synced_at).getTime() / 1000);
    params.set("after", String(lastSyncedSeconds - INCREMENTAL_LOOKBACK_SECONDS));
  }

  let activitiesResponse = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${stravaAccessToken}`,
      },
    }
  );

  if (activitiesResponse.status === 401) {
    const refreshed = await refreshStravaToken(supabaseAdmin, targetUserId, connection.refresh_token);
    if ("error" in refreshed) {
      return NextResponse.json({ error: refreshed.error }, { status: 401 });
    }
    stravaAccessToken = refreshed.accessToken;
    activitiesResponse = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${stravaAccessToken}`,
        },
      }
    );
  }

  if (!activitiesResponse.ok) {
    const text = await activitiesResponse.text();
    console.error("Failed to fetch Strava activities:", activitiesResponse.status, text);
    return NextResponse.json({ error: "Failed to fetch activities from Strava." }, { status: activitiesResponse.status });
  }

  const activities = await activitiesResponse.json();
  if (!Array.isArray(activities)) {
    return NextResponse.json({ error: "Unexpected Strava response format." }, { status: 500 });
  }

  let imported = 0;
  const fetchedIds = new Set<number>();
  let oldestStartDate: string | null = null;

  for (const activity of activities) {
    if (!activity?.id) continue;

    fetchedIds.add(activity.id);
    const startDate = activity.start_date ?? activity.start_date_local ?? null;
    if (startDate && (!oldestStartDate || startDate < oldestStartDate)) {
      oldestStartDate = startDate;
    }

    const row = {
      user_id: targetUserId,
      strava_activity_id: activity.id,
      name: activity.name ?? null,
      sport_type: activity.sport_type ?? activity.type ?? null,
      distance_meters: activity.distance ?? null,
      moving_time_seconds: activity.moving_time ?? null,
      elevation_gain_meters: activity.total_elevation_gain ?? null,
      average_speed: activity.average_speed ?? null,
      max_speed: activity.max_speed ?? null,
      start_date: startDate,
      raw_json: activity,
    };

    const { error: upsertError } = await supabaseAdmin.from("activities").upsert(row, { onConflict: "strava_activity_id" });
    if (upsertError) {
      console.error("Failed to upsert activity:", upsertError, activity);
      continue;
    }
    imported += 1;
  }

  let removed = 0;
  if (resync && oldestStartDate) {
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("activities")
      .select("strava_activity_id")
      .eq("user_id", targetUserId)
      .gte("start_date", oldestStartDate);

    if (existingError) {
      console.error("Failed to load existing activities for resync:", existingError);
    } else {
      const idsToRemove = (existingRows ?? [])
        .map((row) => row.strava_activity_id)
        .filter((id) => !fetchedIds.has(id));

      if (idsToRemove.length) {
        const { error: deleteError } = await supabaseAdmin
          .from("activities")
          .delete()
          .eq("user_id", targetUserId)
          .in("strava_activity_id", idsToRemove);

        if (deleteError) {
          console.error("Failed to remove stale activities during resync:", deleteError);
        } else {
          removed = idsToRemove.length;
        }
      }
    }
  }

  const lastSyncedAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("strava_connections")
    .update({ last_synced_at: lastSyncedAt })
    .eq("user_id", targetUserId);

  if (updateError) {
    console.error("Failed to update last_synced_at:", updateError);
  }

  return NextResponse.json({ imported, removed, last_synced_at: lastSyncedAt });
}
