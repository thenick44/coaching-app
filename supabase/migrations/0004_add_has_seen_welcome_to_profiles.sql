-- Migration: track whether a user has dismissed the welcome tour
--
-- Adds a flag so the app can show a one-time "welcome" walkthrough the
-- first time a new user signs in, and never show it again afterwards
-- (across devices/sessions, since it's stored on the profile row).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_seen_welcome boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.has_seen_welcome IS
  'Whether the user has dismissed the one-time welcome walkthrough.';

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
