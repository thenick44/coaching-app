-- Profiles table schema for the coaching app
--
-- NOTE: This file documents the CURRENT PRODUCTION SCHEMA for a table that
-- already exists in Supabase (created manually). It is derived from how the
-- application code reads and writes this table:
--   - src/lib/profile.ts (getOrCreateProfile)
--   - resolveTargetUserId() helpers in app/api/goals, app/api/coaching_reports,
--     and app/api/strava/callback
-- The CREATE statements use IF NOT EXISTS guards so this script is safe to
-- run, but it is intended primarily as documentation/reference rather than a
-- migration that needs to be applied.

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  strava_athlete_id bigint,
  has_seen_welcome boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
  'Documents the existing production profiles table. One row per application user, keyed by the Supabase Auth user id. Rows are created on first sign-in via getOrCreateProfile().';
COMMENT ON COLUMN public.profiles.id IS 'Matches auth.users.id (Supabase Auth user id).';
COMMENT ON COLUMN public.profiles.email IS 'Cached copy of the user''s email address, set at profile creation time.';
COMMENT ON COLUMN public.profiles.strava_athlete_id IS 'Strava athlete id for the connected Strava account, if any. Mirrors strava_connections.athlete_id for display purposes (e.g. Settings page).';
COMMENT ON COLUMN public.profiles.has_seen_welcome IS 'Whether the user has dismissed the one-time welcome walkthrough.';
COMMENT ON COLUMN public.profiles.created_at IS 'Timestamp when the profile row was first created.';

-- A given Strava athlete should only ever be linked to one profile.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_strava_athlete_id_idx
  ON public.profiles(strava_athlete_id)
  WHERE strava_athlete_id IS NOT NULL;
