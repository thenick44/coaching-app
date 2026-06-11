"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import Protected from "../components/Protected";
import type { WorkoutType } from "@/src/lib/trainingPlanGenerator";
import { getWeekEnd, getWeekStart } from "@/src/lib/activityMetrics";

type TrainingPlanWorkout = {
  id: string;
  training_plan_id: string;
  scheduled_date: string;
  week_number: number;
  workout_type: WorkoutType;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  distance_miles: number | null;
  elevation_feet: number | null;
  intensity: string | null;
  completed: boolean;
  completed_at: string | null;
  notes: string | null;
};

type TrainingPlan = {
  id: string;
  user_id: string;
  goal_id: string | null;
  name: string;
  start_date: string;
  end_date: string;
  status: "active" | "completed" | "archived";
  available_training_days: number[];
  generation_summary: Record<string, unknown> | null;
  created_at: string;
  completed_count?: number;
  total_count?: number;
};

type GoalOption = {
  id: string;
  name: string;
  event_date: string;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const WORKOUT_TYPE_STYLES: Record<WorkoutType, string> = {
  Endurance: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  Tempo: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  Threshold: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  VO2: "border-red-500/30 bg-red-500/10 text-red-300",
  Recovery: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  Climbing: "border-purple-500/30 bg-purple-500/10 text-purple-300",
  "Long Ride": "border-blue-500/30 bg-blue-500/10 text-blue-300",
};

type CheckInTone = "positive" | "neutral" | "supportive";

const CHECKIN_TONE_STYLES: Record<CheckInTone, string> = {
  positive: "border-emerald-500/30 bg-emerald-950/30 text-emerald-200",
  neutral: "border-cyan-500/30 bg-cyan-950/30 text-cyan-200",
  supportive: "border-amber-500/30 bg-amber-950/30 text-amber-200",
};

function getLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function formatDate(value: string) {
  const date = parseLocalDate(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatShortDate(value: string) {
  const date = parseLocalDate(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function formatDuration(minutes: number | null) {
  if (minutes == null) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${mins.toString().padStart(2, "0")}m` : `${mins}m`;
}

function formatDistance(value: number | null) {
  return value != null ? `${value} mi` : "—";
}

function formatElevation(value: number | null) {
  return value != null ? `${value} ft` : "—";
}

function getEncouragementMessage(
  completed: number,
  total: number,
  today: Date
): { message: string; tone: CheckInTone; suggestAdjust: boolean } {
  if (total === 0) {
    return { message: "No workouts are scheduled for this week.", tone: "neutral", suggestAdjust: false };
  }

  if (completed === total) {
    return {
      message: `You've completed all ${total} workout${total === 1 ? "" : "s"} for this week. Great work staying on track!`,
      tone: "positive",
      suggestAdjust: false,
    };
  }

  const dayOfWeek = today.getDay();

  if (completed === 0 && dayOfWeek <= 1) {
    return {
      message: `This week's plan has ${total} workout${total === 1 ? "" : "s"} lined up. Let's get started!`,
      tone: "neutral",
      suggestAdjust: false,
    };
  }

  const expectedProgress = (dayOfWeek + 1) / 7;
  const actualProgress = completed / total;

  if (actualProgress + 0.15 >= expectedProgress) {
    return {
      message: `You're ${completed} of ${total} done this week — right on pace. Keep it up!`,
      tone: "positive",
      suggestAdjust: false,
    };
  }

  if (dayOfWeek >= 4) {
    return {
      message: `You've completed ${completed} of ${total} workouts this week. If something came up, use "Adjust remaining plan" below to rebalance your schedule.`,
      tone: "supportive",
      suggestAdjust: true,
    };
  }

  return {
    message: `You're ${completed} of ${total} done this week. There's still time to catch up — you've got this!`,
    tone: "supportive",
    suggestAdjust: false,
  };
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function buildMonthGrid(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    return date;
  });
}

function WorkoutNotesEditor({
  workout,
  onSave,
  saving,
}: {
  workout: TrainingPlanWorkout;
  onSave: (notes: string) => void;
  saving: boolean;
}) {
  const [notes, setNotes] = useState(workout.notes ?? "");

  return (
    <div>
      <label className="mb-2 block text-sm text-slate-300">Notes</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2 text-white placeholder:text-slate-400"
        placeholder="How did it go? Add notes about effort, conditions, or how you felt."
      />
      <button
        type="button"
        onClick={() => onSave(notes)}
        disabled={saving}
        className="mt-3 inline-flex items-center justify-center rounded-full bg-slate-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save notes"}
      </button>
    </div>
  );
}

export default function TrainingPlansPage() {
  const mounted = useRef(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<TrainingPlanWorkout[]>([]);
  const [workoutsLoading, setWorkoutsLoading] = useState(false);

  const [goals, setGoals] = useState<GoalOption[]>([]);

  const [view, setView] = useState<"calendar" | "weekly">("calendar");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [savingWorkoutId, setSavingWorkoutId] = useState<string | null>(null);

  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [goalId, setGoalId] = useState("");
  const [availableDays, setAvailableDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [startDate, setStartDate] = useState(() => getLocalDateString(new Date()));
  const [generating, setGenerating] = useState(false);

  const [showAdjustForm, setShowAdjustForm] = useState(false);
  const [restDaysInput, setRestDaysInput] = useState("0");
  const [adjusting, setAdjusting] = useState(false);

  async function getAuthHeaders(): Promise<Record<string, string>> {
    if (!supabase) return {};
    const sessionResult = await supabase.auth.getSession();
    const accessToken = sessionResult.data?.session?.access_token;
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  }

  useEffect(() => {
    mounted.current = true;

    async function loadInitial() {
      if (!supabase) {
        setError("Supabase is not configured.");
        setLoading(false);
        return;
      }

      const sessionResult = await supabase.auth.getSession();
      const session = sessionResult.data?.session;

      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const [plansResponse, goalsResponse] = await Promise.all([
        fetch("/api/training_plans", { method: "GET", headers }),
        fetch("/api/goals", { method: "GET", headers }),
      ]);

      const plansPayload = await plansResponse.json().catch(() => null);
      const goalsPayload = await goalsResponse.json().catch(() => null);

      if (!mounted.current) return;

      if (!plansResponse.ok) {
        setError(plansPayload?.error || "Failed to load training plans.");
      } else {
        const loadedPlans = (plansPayload?.plans ?? []) as TrainingPlan[];
        setPlans(loadedPlans);
        const activePlan = loadedPlans.find((plan) => plan.status === "active") ?? loadedPlans[0];
        if (activePlan) setSelectedPlanId(activePlan.id);
      }

      if (goalsResponse.ok) {
        const todayStr = getLocalDateString(new Date());
        const upcoming = ((goalsPayload?.goals ?? []) as GoalOption[])
          .filter((goal) => goal.event_date >= todayStr)
          .sort((a, b) => a.event_date.localeCompare(b.event_date));
        setGoals(upcoming);
      }

      setLoading(false);
    }

    loadInitial();

    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedPlanId) {
      return;
    }

    let active = true;

    async function loadWorkouts() {
      if (!supabase) return;
      setWorkoutsLoading(true);
      setSelectedWorkoutId(null);

      const sessionResult = await supabase.auth.getSession();
      const session = sessionResult.data?.session;
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const response = await fetch(`/api/training_plans/${selectedPlanId}`, { method: "GET", headers });
      const payload = await response.json().catch(() => null);
      if (!active) return;

      if (!response.ok) {
        setError(payload?.error || "Failed to load training plan.");
        setWorkouts([]);
      } else {
        setWorkouts((payload?.workouts ?? []) as TrainingPlanWorkout[]);
        const plan = payload?.plan as TrainingPlan | undefined;
        if (plan?.start_date) {
          const planStart = parseLocalDate(plan.start_date);
          setCurrentMonth(new Date(planStart.getFullYear(), planStart.getMonth(), 1));
        }
      }

      setWorkoutsLoading(false);
    }

    loadWorkouts();

    return () => {
      active = false;
    };
  }, [selectedPlanId]);

  function toggleDay(day: number) {
    setAvailableDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  }

  async function handleGeneratePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    if (!availableDays.length) {
      setError("Select at least one available training day.");
      return;
    }

    setGenerating(true);
    setError(null);
    setSuccess(null);

    const headers = {
      "Content-Type": "application/json",
      ...(await getAuthHeaders()),
    };

    const payload = {
      goal_id: goalId || undefined,
      available_training_days: availableDays,
      start_date: startDate || undefined,
    };

    const response = await fetch("/api/training_plans", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => null);

    if (!mounted.current) return;

    if (!response.ok) {
      setError(result?.error || "Failed to generate training plan.");
      setGenerating(false);
      return;
    }

    const newPlan = result?.plan as TrainingPlan | undefined;
    const newWorkouts = (result?.workouts ?? []) as TrainingPlanWorkout[];

    if (newPlan) {
      setPlans((prev) => [
        { ...newPlan, completed_count: 0, total_count: newWorkouts.length },
        ...prev.map((plan) => (plan.status === "active" ? { ...plan, status: "archived" as const } : plan)),
      ]);
      setSelectedPlanId(newPlan.id);
      setWorkouts(newWorkouts);
      setSelectedWorkoutId(null);
      const planStart = parseLocalDate(newPlan.start_date);
      setCurrentMonth(new Date(planStart.getFullYear(), planStart.getMonth(), 1));
      setView("calendar");
      setSuccess("Training plan generated successfully.");
      setShowGenerateForm(false);
    } else {
      setError("Plan generated, but the response did not include plan data.");
    }

    setGenerating(false);
  }

  async function handleAdjustPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !selectedPlanId) {
      setError("Supabase is not configured.");
      return;
    }

    const restDays = Math.min(14, Math.max(0, Math.round(Number(restDaysInput) || 0)));

    setAdjusting(true);
    setError(null);
    setSuccess(null);

    const headers = {
      "Content-Type": "application/json",
      ...(await getAuthHeaders()),
    };

    const response = await fetch(`/api/training_plans/${selectedPlanId}/adjust`, {
      method: "POST",
      headers,
      body: JSON.stringify({ rest_days: restDays }),
    });

    const result = await response.json().catch(() => null);

    if (!mounted.current) return;

    if (!response.ok) {
      setError(result?.error || "Failed to adjust training plan.");
      setAdjusting(false);
      return;
    }

    const updatedPlan = result?.plan as TrainingPlan | undefined;
    const updatedWorkouts = (result?.workouts ?? []) as TrainingPlanWorkout[];

    if (updatedPlan) {
      setPlans((prev) =>
        prev.map((plan) =>
          plan.id === updatedPlan.id
            ? {
                ...updatedPlan,
                completed_count: updatedWorkouts.filter((workout) => workout.completed).length,
                total_count: updatedWorkouts.length,
              }
            : plan
        )
      );
      setWorkouts(updatedWorkouts);
      setSelectedWorkoutId(null);
      setSuccess(
        restDays > 0
          ? `Plan adjusted with ${restDays} rest day${restDays === 1 ? "" : "s"}.`
          : "Plan adjusted based on your recent training."
      );
      setShowAdjustForm(false);
      setRestDaysInput("0");
    } else {
      setError("Plan adjusted, but the response did not include plan data.");
    }

    setAdjusting(false);
  }

  async function updateWorkout(workoutId: string, updates: { completed?: boolean; notes?: string }) {
    setSavingWorkoutId(workoutId);
    setError(null);
    setSuccess(null);

    const headers = {
      "Content-Type": "application/json",
      ...(await getAuthHeaders()),
    };

    const response = await fetch(`/api/training_plan_workouts/${workoutId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(updates),
    });

    const result = await response.json().catch(() => null);

    if (!mounted.current) return;

    if (!response.ok) {
      setError(result?.error || "Failed to update workout.");
      setSavingWorkoutId(null);
      return;
    }

    const updated = result?.workout as TrainingPlanWorkout | undefined;
    if (updated) {
      const previous = workouts.find((workout) => workout.id === workoutId);
      setWorkouts((prev) => prev.map((workout) => (workout.id === updated.id ? updated : workout)));

      if (updates.completed !== undefined && previous && previous.completed !== updates.completed) {
        const delta = updates.completed ? 1 : -1;
        setPlans((prev) =>
          prev.map((plan) =>
            plan.id === selectedPlanId
              ? { ...plan, completed_count: Math.max(0, (plan.completed_count ?? 0) + delta) }
              : plan
          )
        );
      }

      setSuccess(
        updates.completed !== undefined
          ? updated.completed
            ? "Workout marked complete."
            : "Workout marked incomplete."
          : "Notes saved."
      );
    }

    setSavingWorkoutId(null);
  }

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const selectedWorkout = workouts.find((workout) => workout.id === selectedWorkoutId) ?? null;

  const today = new Date();
  const weekStart = getWeekStart(today);
  const weekEnd = getWeekEnd(weekStart);
  const weekStartStr = getLocalDateString(weekStart);
  const weekEndStr = getLocalDateString(weekEnd);
  const thisWeekWorkouts = workouts.filter(
    (workout) => workout.scheduled_date >= weekStartStr && workout.scheduled_date <= weekEndStr
  );
  const completedThisWeek = thisWeekWorkouts.filter((workout) => workout.completed).length;
  const totalThisWeek = thisWeekWorkouts.length;
  const checkIn = getEncouragementMessage(completedThisWeek, totalThisWeek, today);

  const workoutsByDate = new Map<string, TrainingPlanWorkout>();
  workouts.forEach((workout) => workoutsByDate.set(workout.scheduled_date, workout));

  const monthGrid = buildMonthGrid(currentMonth);

  const weekGroups = new Map<number, TrainingPlanWorkout[]>();
  workouts.forEach((workout) => {
    const list = weekGroups.get(workout.week_number) ?? [];
    list.push(workout);
    weekGroups.set(workout.week_number, list);
  });
  const sortedWeeks = Array.from(weekGroups.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <Protected>
    <main className="min-h-[calc(100vh-88px)] bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 px-6 py-10 text-white">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col justify-center gap-8 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
        <div className="space-y-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">Training Plans</p>
          <h1 className="text-4xl font-semibold text-white sm:text-5xl">Your Training Plan</h1>
          <p className="mx-auto max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            Generate a personalized training plan based on your upcoming goal, recent training load, and readiness — then track your progress day by day.
          </p>
        </div>

        {error && (
          <div className="mx-auto max-w-2xl rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200 shadow-lg shadow-black/20">
            <p className="font-semibold">Error</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {success && (
          <div className="mx-auto max-w-2xl rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm text-emerald-200 shadow-lg shadow-black/20">
            <p className="font-semibold">Success</p>
            <p className="mt-1">{success}</p>
          </div>
        )}

        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Generate plan</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Create a new plan based on your nearest goal (or pick one), recent training load, and readiness score. Generating a new plan archives your current active plan.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGenerateForm((value) => !value)}
              className="inline-flex items-center justify-center rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              {showGenerateForm ? "Cancel" : "New plan"}
            </button>
          </div>

          {showGenerateForm && (
            <form onSubmit={handleGeneratePlan} className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-slate-300">Goal</label>
                <select
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-slate-950 px-4 py-2 text-white [color-scheme:dark]"
                >
                  <option value="">Use nearest upcoming goal</option>
                  {goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.name} — {formatDate(goal.event_date)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Start date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2 text-white placeholder:text-slate-400 [color-scheme:dark]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm text-slate-300">Available training days</label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_LABELS.map((label, index) => (
                    <button
                      type="button"
                      key={label}
                      onClick={() => toggleDay(index)}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        availableDays.includes(index)
                          ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-200"
                          : "border-white/10 bg-transparent text-slate-400 hover:bg-white/5"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={generating}
                  className="inline-flex items-center justify-center rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generating ? "Generating..." : "Generate plan"}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Your plans</p>
            <span className="rounded-full bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.28em] text-slate-400">
              {plans.length} plans
            </span>
          </div>

          {loading ? (
            <p className="mt-4 text-sm text-slate-400">Loading training plans...</p>
          ) : plans.length ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <button
                  type="button"
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`rounded-2xl border p-4 text-left text-sm transition ${
                    plan.id === selectedPlanId
                      ? "border-cyan-500/50 bg-cyan-500/10 text-white"
                      : "border-white/10 bg-slate-950/80 text-slate-300 hover:bg-slate-950"
                  }`}
                >
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">{plan.status}</p>
                  <p className="mt-2 text-lg font-semibold text-white">{plan.name}</p>
                  <p className="mt-1 text-slate-400">
                    {formatShortDate(plan.start_date)} – {formatShortDate(plan.end_date)}
                  </p>
                  <p className="mt-1 text-slate-400">
                    {plan.completed_count ?? 0}/{plan.total_count ?? 0} workouts complete
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-400">No training plans yet. Generate one above to get started.</p>
          )}
        </div>

        {selectedPlan && (
          <>
            {!workoutsLoading && selectedPlan.status === "active" && (
              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.28em] text-slate-400">This week&apos;s check-in</p>
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      {formatShortDate(weekStartStr)} – {formatShortDate(weekEndStr)} · {completedThisWeek} of {totalThisWeek} workouts complete
                    </p>
                  </div>
                  {checkIn.suggestAdjust && (
                    <button
                      type="button"
                      onClick={() => setShowAdjustForm(true)}
                      className="inline-flex items-center justify-center rounded-full bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
                    >
                      Adjust remaining plan
                    </button>
                  )}
                </div>
                <div className={`mt-4 rounded-2xl border p-4 text-sm leading-6 ${CHECKIN_TONE_STYLES[checkIn.tone]}`}>
                  {checkIn.message}
                </div>
              </div>
            )}

            {!workoutsLoading && selectedPlan.status === "active" && (
              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Adjust remaining plan</p>
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      Recompute the rest of your plan from your recent training load and readiness. Add rest days if you&apos;ve been sick, injured, or away — your plan will pick back up afterward.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAdjustForm((value) => !value)}
                    className="inline-flex items-center justify-center rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                  >
                    {showAdjustForm ? "Cancel" : "Adjust plan"}
                  </button>
                </div>

                {showAdjustForm && (
                  <form onSubmit={handleAdjustPlan} className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm text-slate-300">Days off (illness, injury, travel, etc.)</label>
                      <input
                        type="number"
                        min={0}
                        max={14}
                        value={restDaysInput}
                        onChange={(e) => setRestDaysInput(e.target.value)}
                        className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2 text-white placeholder:text-slate-400"
                      />
                      <p className="mt-2 text-xs text-slate-400">
                        We&apos;ll add this many rest days starting today, then rebuild the rest of your plan around your current training load and readiness.
                      </p>
                    </div>

                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={adjusting}
                        className="inline-flex items-center justify-center rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {adjusting ? "Adjusting..." : "Adjust plan"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView("calendar")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  view === "calendar" ? "bg-cyan-500 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                Calendar
              </button>
              <button
                type="button"
                onClick={() => setView("weekly")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  view === "weekly" ? "bg-cyan-500 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                Weekly
              </button>
            </div>

            {workoutsLoading && <p className="text-sm text-slate-400">Loading workouts...</p>}

            {!workoutsLoading && view === "calendar" && (
              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setCurrentMonth((prev) => addMonths(prev, -1))}
                    className="rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10"
                  >
                    ← Prev
                  </button>
                  <p className="text-lg font-semibold text-white">
                    {new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(currentMonth)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCurrentMonth((prev) => addMonths(prev, 1))}
                    className="rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10"
                  >
                    Next →
                  </button>
                </div>

                <div className="mt-6 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-[0.1em] text-slate-500 sm:gap-2 sm:text-xs sm:tracking-[0.2em]">
                  {WEEKDAY_LABELS.map((label) => (
                    <div key={label}>{label}</div>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-2">
                  {monthGrid.map((date) => {
                    const dateStr = getLocalDateString(date);
                    const workout = workoutsByDate.get(dateStr);
                    const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
                    return (
                      <button
                        type="button"
                        key={dateStr}
                        onClick={() => workout && setSelectedWorkoutId(workout.id)}
                        disabled={!workout}
                        className={`flex min-h-[56px] flex-col items-start rounded-xl border p-1 text-left text-[10px] transition sm:min-h-[88px] sm:rounded-2xl sm:p-2 sm:text-xs ${
                          isCurrentMonth ? "border-white/10 bg-slate-950/80" : "border-white/5 bg-slate-950/40"
                        } ${workout ? "cursor-pointer hover:bg-slate-900" : "cursor-default"} ${
                          workout && selectedWorkoutId === workout.id ? "ring-2 ring-cyan-400" : ""
                        }`}
                      >
                        <span className={isCurrentMonth ? "text-slate-300" : "text-slate-600"}>{date.getDate()}</span>
                        {workout && (
                          <span
                            className={`mt-1 w-full truncate rounded-md border px-1 py-0.5 text-[9px] font-semibold sm:px-2 sm:py-1 sm:text-[11px] ${WORKOUT_TYPE_STYLES[workout.workout_type]} ${
                              workout.completed ? "opacity-60" : ""
                            }`}
                          >
                            {workout.completed ? "✓ " : ""}
                            {workout.workout_type}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {!workoutsLoading && view === "weekly" && (
              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
                {sortedWeeks.length ? (
                  <div className="space-y-6">
                    {sortedWeeks.map(([weekNumber, weekWorkouts]) => (
                      <div key={weekNumber}>
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Week {weekNumber}</p>
                        <div className="mt-3 space-y-2">
                          {weekWorkouts
                            .slice()
                            .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
                            .map((workout) => (
                              <button
                                type="button"
                                key={workout.id}
                                onClick={() => setSelectedWorkoutId(workout.id)}
                                className={`flex w-full flex-col gap-2 rounded-2xl border p-4 text-left text-sm transition sm:flex-row sm:items-center sm:justify-between ${
                                  selectedWorkoutId === workout.id
                                    ? "border-cyan-500/50 bg-cyan-500/10"
                                    : "border-white/10 bg-slate-950/80 hover:bg-slate-950"
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${WORKOUT_TYPE_STYLES[workout.workout_type]}`}
                                  >
                                    {workout.workout_type}
                                  </span>
                                  <div>
                                    <p className="font-semibold text-white">{workout.title}</p>
                                    <p className="mt-1 text-slate-400">{formatShortDate(workout.scheduled_date)}</p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-4 text-slate-400">
                                  <span>{formatDuration(workout.duration_minutes)}</span>
                                  <span>{formatDistance(workout.distance_miles)}</span>
                                  <span>{formatElevation(workout.elevation_feet)}</span>
                                  <span
                                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                                      workout.completed ? "bg-emerald-500/10 text-emerald-300" : "bg-white/5 text-slate-400"
                                    }`}
                                  >
                                    {workout.completed ? "Done" : "Pending"}
                                  </span>
                                </div>
                              </button>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No workouts scheduled for this plan.</p>
                )}
              </div>
            )}

            {selectedWorkout && (
              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                      Week {selectedWorkout.week_number} · {formatDate(selectedWorkout.scheduled_date)}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">{selectedWorkout.title}</p>
                    <span
                      className={`mt-2 inline-block rounded-md border px-2 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${WORKOUT_TYPE_STYLES[selectedWorkout.workout_type]}`}
                    >
                      {selectedWorkout.workout_type}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateWorkout(selectedWorkout.id, { completed: !selectedWorkout.completed })}
                    disabled={savingWorkoutId === selectedWorkout.id}
                    className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      selectedWorkout.completed
                        ? "bg-slate-700 text-white hover:bg-slate-600"
                        : "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                    }`}
                  >
                    {savingWorkoutId === selectedWorkout.id
                      ? "Saving..."
                      : selectedWorkout.completed
                        ? "Mark incomplete"
                        : "Mark complete"}
                  </button>
                </div>

                {selectedWorkout.description && (
                  <p className="mt-4 leading-6 text-slate-300">{selectedWorkout.description}</p>
                )}

                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Duration</p>
                    <p className="mt-2 text-lg font-semibold text-white">{formatDuration(selectedWorkout.duration_minutes)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Distance</p>
                    <p className="mt-2 text-lg font-semibold text-white">{formatDistance(selectedWorkout.distance_miles)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Elevation</p>
                    <p className="mt-2 text-lg font-semibold text-white">{formatElevation(selectedWorkout.elevation_feet)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Intensity</p>
                    <p className="mt-2 text-sm font-semibold text-white">{selectedWorkout.intensity ?? "—"}</p>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl bg-slate-950/80 p-4">
                  <WorkoutNotesEditor
                    key={selectedWorkout.id}
                    workout={selectedWorkout}
                    saving={savingWorkoutId === selectedWorkout.id}
                    onSave={(notes) => updateWorkout(selectedWorkout.id, { notes })}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
    </Protected>
  );
}
