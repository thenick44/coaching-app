-- Goals table schema for the coaching app
CREATE TABLE IF NOT EXISTS public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  event_date date NOT NULL,
  event_location text,
  event_type text,
  distance_miles numeric,
  elevation_feet numeric,
  expected_low_temp_f numeric,
  expected_high_temp_f numeric,
  weather_notes text,
  forecast_last_updated_at timestamptz,
  target_finish_time text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS goals_user_id_idx ON public.goals(user_id);
CREATE INDEX IF NOT EXISTS goals_event_date_idx ON public.goals(event_date);
