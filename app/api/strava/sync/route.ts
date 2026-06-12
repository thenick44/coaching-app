import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin, isServerConfigured, resolveTargetUserId } from "@/src/lib/serverAuth";

const MAX_PAGE_SIZE = 200;
// When doing an incremental sync, look back this far before the last sync to
// catch activities that were added/edited with a start_date in the past.
const INCREMENTAL_LOOKBACK_SECONDS = 14 * 24 * 60 * 60;

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

  const stravaAccessToken = connection.access_token;

  const params = new URLSearchParams({ per_page: String(MAX_PAGE_SIZE) });
  if (!resync && connection.last_synced_at) {
    const lastSyncedSeconds = Math.floor(new Date(connection.last_synced_at).getTime() / 1000);
    params.set("after", String(lastSyncedSeconds - INCREMENTAL_LOOKBACK_SECONDS));
  }

  const activitiesResponse = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${stravaAccessToken}`,
      },
    }
  );

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
