-- Coaching reports table schema for the coaching app
CREATE TABLE IF NOT EXISTS public.coaching_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  report_week_start date NOT NULL,
  report_week_end date NOT NULL,
  total_distance_miles numeric NOT NULL,
  total_elevation_feet numeric NOT NULL,
  total_moving_time_minutes numeric NOT NULL,
  previous_week_distance_miles numeric,
  previous_week_elevation_feet numeric,
  previous_week_moving_time_minutes numeric,
  readiness_score integer,
  report_summary text,
  upcoming_goals jsonb,
  goal_analysis jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Adds goal_analysis to tables created before this column existed.
-- See supabase/migrations/0001_add_goal_analysis_to_coaching_reports.sql
ALTER TABLE public.coaching_reports
  ADD COLUMN IF NOT EXISTS goal_analysis jsonb;

CREATE INDEX IF NOT EXISTS coaching_reports_user_id_idx ON public.coaching_reports(user_id);
CREATE INDEX IF NOT EXISTS coaching_reports_created_at_idx ON public.coaching_reports(created_at);
