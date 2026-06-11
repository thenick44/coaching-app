import { supabase } from "@/src/lib/supabaseClient";

export type Profile = {
  id: string;
  email?: string | null;
  strava_athlete_id?: number | null;
  [key: string]: unknown;
};

export type ProfileResult = {
  profile: Profile | null;
  error: string | null;
};

export async function getOrCreateProfile(user: { id: string; email?: string | null }): Promise<ProfileResult> {
  if (!user?.id) return { profile: null, error: null };

  const client = supabase;
  if (!client) {
    return { profile: null, error: "Supabase is not configured." };
  }

  // Try to fetch existing profile
  const { data: existing, error: fetchError } = await client
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (fetchError) {
    console.error("Error fetching profile:", fetchError);
    return { profile: null, error: `Failed to fetch profile: ${fetchError.message}` };
  }

  if (existing) return { profile: existing, error: null };

  // Insert a new profile with id and email
  const { data: inserted, error: insertError } = await client
    .from("profiles")
    .insert({ id: user.id, email: user.email })
    .select()
    .maybeSingle();

  if (insertError) {
    console.error("Error inserting profile:", insertError);
    return { profile: null, error: `Failed to create profile: ${insertError.message}` };
  }

  return { profile: inserted ?? null, error: null };
}
