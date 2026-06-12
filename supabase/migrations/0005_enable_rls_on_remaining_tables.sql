-- Migration: enable row-level security on remaining per-user tables
--
-- Only public.profiles has had RLS enabled so far (see 0002, 0004). The
-- tables below (goals, activities, training_plans, training_plan_workouts,
-- coaching_reports, strava_connections) are normally accessed exclusively
-- through Next.js API routes using the Supabase service-role key, which
-- bypasses RLS entirely -- so these policies do not change how those routes
-- behave.
--
-- However, the browser also holds the public anon key
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY), and Supabase's default grants let the
-- anon/authenticated roles query any table in the public schema via
-- PostgREST. Without RLS, that means these tables -- including
-- strava_connections, which stores plaintext Strava OAuth access/refresh
-- tokens -- are readable and writable by anyone with the anon key,
-- completely bypassing the user_id checks in the API routes. Enabling RLS
-- with an "own rows only" policy closes that off.

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_plan_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strava_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own goals" ON public.goals;
CREATE POLICY "Users can manage own goals" ON public.goals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own activities" ON public.activities;
CREATE POLICY "Users can manage own activities" ON public.activities
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own training plans" ON public.training_plans;
CREATE POLICY "Users can manage own training plans" ON public.training_plans
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own training plan workouts" ON public.training_plan_workouts;
CREATE POLICY "Users can manage own training plan workouts" ON public.training_plan_workouts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own coaching reports" ON public.coaching_reports;
CREATE POLICY "Users can manage own coaching reports" ON public.coaching_reports
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own strava connection" ON public.strava_connections;
CREATE POLICY "Users can manage own strava connection" ON public.strava_connections
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
