-- Migration: add row-level security policies for profiles
--
-- The profiles table has row-level security enabled but no policies,
-- so getOrCreateProfile() (src/lib/profile.ts) fails with:
--   "new row violates row-level security policy for table \"profiles\""
-- when a signed-in user's first profile row is created on the client
-- with the anon key + their session.
--
-- These policies let an authenticated user select and insert only the
-- profile row matching their own auth.users id.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);
