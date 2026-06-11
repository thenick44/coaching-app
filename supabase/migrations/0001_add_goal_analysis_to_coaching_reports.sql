-- Migration: add goal_analysis column to coaching_reports
--
-- Adds a structured JSON column populated by the coaching report generator
-- (app/api/coaching_reports/route.ts) with goal-aware analysis: the nearest
-- upcoming goal and countdown, weekly distance/elevation trends, recent
-- training load, the longest ride/run in the last 8 weeks, goal volume and
-- climbing comparisons, readiness risks, strengths, and training
-- recommendations (including heat adaptation when the goal's
-- expected_high_temp_f exceeds 80).

ALTER TABLE public.coaching_reports
  ADD COLUMN IF NOT EXISTS goal_analysis jsonb;

COMMENT ON COLUMN public.coaching_reports.goal_analysis IS
  'Structured goal-aware analysis generated alongside the weekly report: nearest goal + countdown, weekly distance/elevation trends, recent training load, longest ride/run in the last 8 weeks, goal volume/climbing comparisons, readiness risks, strengths, and training recommendations.';
