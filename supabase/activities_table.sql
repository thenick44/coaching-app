-- Activities table schema for the coaching app
--
-- NOTE: This file documents the CURRENT PRODUCTION SCHEMA for a table that
-- already exists in Supabase (created manually). It is derived from how the
-- application code reads and writes this table:
--   - app/api/strava/sync/route.ts (upserts imported Strava activities)
--   - app/api/dashboard/data/route.ts (lists activities for the dashboard)
--   - app/api/coaching_reports/route.ts (aggregates activities into weekly reports)
-- The CREATE statements use IF NOT EXISTS guards so this script is safe to
-- run, but it is intended primarily as documentation/reference rather than a
-- migration that needs to be applied.

CREATE TABLE IF NOT EXISTS public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  strava_activity_id bigint NOT NULL UNIQUE,
  name text,
  sport_type text,
  distance_meters numeric,
  moving_time_seconds numeric,
  elevation_gain_meters numeric,
  average_speed numeric,
  max_speed numeric,
  start_date timestamptz,
  raw_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.activities IS
  'Documents the existing production activities table. Strava activities imported per user. Rows are upserted with onConflict: "strava_activity_id" by the Strava sync endpoint.';
COMMENT ON COLUMN public.activities.user_id IS 'References profiles.id / auth.users.id. Owner of the imported activity.';
COMMENT ON COLUMN public.activities.strava_activity_id IS 'Strava activity id. Unique upsert key for syncing.';
COMMENT ON COLUMN public.activities.name IS 'Activity title from Strava.';
COMMENT ON COLUMN public.activities.sport_type IS 'Strava sport_type (falls back to type), e.g. Ride, Run, VirtualRide.';
COMMENT ON COLUMN public.activities.distance_meters IS 'Activity distance in meters, as returned by Strava (activity.distance).';
COMMENT ON COLUMN public.activities.moving_time_seconds IS 'Activity moving time in seconds, as returned by Strava (activity.moving_time).';
COMMENT ON COLUMN public.activities.elevation_gain_meters IS 'Total elevation gain in meters, as returned by Strava (activity.total_elevation_gain).';
COMMENT ON COLUMN public.activities.average_speed IS 'Average speed in meters/second, as returned by Strava.';
COMMENT ON COLUMN public.activities.max_speed IS 'Max speed in meters/second, as returned by Strava.';
COMMENT ON COLUMN public.activities.start_date IS 'Activity start date/time, used for weekly bucketing in the dashboard, fitness trends, and coaching reports.';
COMMENT ON COLUMN public.activities.raw_json IS 'Full raw activity payload returned by the Strava API; used as the source of truth for derived metrics.';

CREATE INDEX IF NOT EXISTS activities_user_id_idx ON public.activities(user_id);
-- Supports queries that filter by user and a start_date range/order
-- (dashboard data and coaching report weekly aggregation).
CREATE INDEX IF NOT EXISTS activities_user_id_start_date_idx ON public.activities(user_id, start_date);
