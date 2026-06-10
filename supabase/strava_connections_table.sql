-- Strava connections table schema for the coaching app
--
-- NOTE: This file documents the CURRENT PRODUCTION SCHEMA for a table that
-- already exists in Supabase (created manually). It is derived from how the
-- application code reads and writes this table:
--   - app/api/strava/callback/route.ts (upserts on OAuth connect)
--   - app/api/strava/sync/route.ts (reads connection for activity sync)
--   - app/api/strava/status/route.ts (checks connection existence)
--   - app/api/dashboard/data/route.ts (development fallback lookup)
-- The CREATE statements use IF NOT EXISTS guards so this script is safe to
-- run, but it is intended primarily as documentation/reference rather than a
-- migration that needs to be applied.

CREATE TABLE IF NOT EXISTS public.strava_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  athlete_id bigint NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at bigint,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.strava_connections IS
  'Documents the existing production strava_connections table. Stores one Strava OAuth connection per application user. Rows are upserted with onConflict: "user_id" by the Strava OAuth callback.';
COMMENT ON COLUMN public.strava_connections.user_id IS 'References profiles.id / auth.users.id. Unique because each user has at most one Strava connection (upsert key).';
COMMENT ON COLUMN public.strava_connections.athlete_id IS 'Strava athlete id returned by the OAuth token exchange.';
COMMENT ON COLUMN public.strava_connections.access_token IS 'Current Strava OAuth access token.';
COMMENT ON COLUMN public.strava_connections.refresh_token IS 'Strava OAuth refresh token used to obtain new access tokens.';
COMMENT ON COLUMN public.strava_connections.expires_at IS 'Unix timestamp (seconds since epoch) when access_token expires, as returned by Strava (tokenData.expires_at).';
COMMENT ON COLUMN public.strava_connections.scope IS 'Comma-separated OAuth scopes granted by the athlete (e.g. "read,activity:read_all").';
COMMENT ON COLUMN public.strava_connections.updated_at IS 'Set explicitly by the application on every upsert.';

-- Used by the (dev-mode) fallback lookups that fetch a connection by athlete.
CREATE INDEX IF NOT EXISTS strava_connections_athlete_id_idx ON public.strava_connections(athlete_id);
