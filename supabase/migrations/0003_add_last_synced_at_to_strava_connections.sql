-- Migration: track the last successful Strava activity sync
--
-- The sync UI (Settings, Dashboard, Fitness Trends) needs to show users
-- when their Strava data was last refreshed. Add a timestamp column that
-- the sync endpoint updates on every successful run.

ALTER TABLE public.strava_connections
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

COMMENT ON COLUMN public.strava_connections.last_synced_at IS
  'Timestamp of the most recent successful activity sync from Strava.';
