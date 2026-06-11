-- Training plans table schema for the coaching app
--
-- Stores generated training plans, one row per plan. Plans are generated
-- by app/api/training_plans/route.ts (POST) based on the user's nearest
-- upcoming goal, days until the event, recent training load, readiness
-- score, and the days of the week the user is available to train.
-- Individual scheduled workouts live in training_plan_workouts.

CREATE TABLE IF NOT EXISTS public.training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  available_training_days jsonb NOT NULL,
  generation_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.training_plans IS
  'Generated training plans. Each plan is built from the user''s nearest upcoming goal, days until event, recent training load, readiness score, and selected training days. Workouts for the plan are stored in training_plan_workouts.';
COMMENT ON COLUMN public.training_plans.user_id IS 'References profiles.id / auth.users.id. Owner of the plan.';
COMMENT ON COLUMN public.training_plans.goal_id IS 'The goal this plan was generated for, if any.';
COMMENT ON COLUMN public.training_plans.status IS 'active: currently in use (only one per user is treated as the active plan for coaching report integration); completed/archived: historical plans.';
COMMENT ON COLUMN public.training_plans.available_training_days IS 'JSON array of weekday numbers (0 = Sunday .. 6 = Saturday) the user selected as available to train when the plan was generated.';
COMMENT ON COLUMN public.training_plans.generation_summary IS 'Snapshot of the inputs used to generate the plan: goal details, days until event, readiness score, recent training load, and total plan weeks.';

CREATE INDEX IF NOT EXISTS training_plans_user_id_idx ON public.training_plans(user_id);
CREATE INDEX IF NOT EXISTS training_plans_user_id_status_idx ON public.training_plans(user_id, status);
