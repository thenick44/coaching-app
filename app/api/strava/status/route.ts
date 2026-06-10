import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET() {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { has_connection: false, error: "Strava status is not configured." },
      { status: 500 }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabaseAdmin
    .from("strava_connections")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to load Strava connection status:", error);
    return NextResponse.json(
      { has_connection: false, error: "Unable to load Strava connection status." },
      { status: 500 }
    );
  }

  return NextResponse.json({ has_connection: Boolean(data) });
}
