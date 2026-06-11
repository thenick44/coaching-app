"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import Protected from "../components/Protected";

type Goal = {
  id: string;
  name: string;
  event_date: string;
  event_location: string | null;
  event_type: string | null;
  distance_miles: number | null;
  elevation_feet: number | null;
  expected_low_temp_f: number | null;
  expected_high_temp_f: number | null;
  weather_notes: string | null;
  forecast_last_updated_at: string | null;
  target_finish_time: string | null;
  notes: string | null;
  created_at: string;
};

type GoalFormState = {
  name: string;
  event_date: string;
  event_location: string;
  event_type: string;
  distance_miles: string;
  elevation_feet: string;
  target_finish_time: string;
  expected_low_temp_f: string;
  expected_high_temp_f: string;
  weather_notes: string;
  notes: string;
};

const emptyForm: GoalFormState = {
  name: "",
  event_date: "",
  event_location: "",
  event_type: "",
  distance_miles: "",
  elevation_feet: "",
  target_finish_time: "",
  expected_low_temp_f: "",
  expected_high_temp_f: "",
  weather_notes: "",
  notes: "",
};

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isNaN(num) ? null : num;
}

function goalToForm(goal: Goal): GoalFormState {
  return {
    name: goal.name ?? "",
    event_date: goal.event_date ?? "",
    event_location: goal.event_location ?? "",
    event_type: goal.event_type ?? "",
    distance_miles: goal.distance_miles != null ? String(goal.distance_miles) : "",
    elevation_feet: goal.elevation_feet != null ? String(goal.elevation_feet) : "",
    target_finish_time: goal.target_finish_time ?? "",
    expected_low_temp_f: goal.expected_low_temp_f != null ? String(goal.expected_low_temp_f) : "",
    expected_high_temp_f: goal.expected_high_temp_f != null ? String(goal.expected_high_temp_f) : "",
    weather_notes: goal.weather_notes ?? "",
    notes: goal.notes ?? "",
  };
}

function sortByEventDate(a: Goal, b: Goal) {
  return a.event_date.localeCompare(b.event_date);
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDaysUntil(eventDateStr: string) {
  const event = new Date(`${eventDateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = event.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function formatDaysUntil(eventDateStr: string) {
  const days = getDaysUntil(eventDateStr);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
}

function formatDistance(value: number | null) {
  return value != null ? `${value} mi` : "—";
}

function formatElevation(value: number | null) {
  return value != null ? `${value} ft` : "—";
}

function formatTempRange(low: number | null, high: number | null) {
  if (low == null && high == null) return "—";
  const lowText = low != null ? `${low}°F` : "—";
  const highText = high != null ? `${high}°F` : "—";
  return `${lowText} – ${highText}`;
}

export default function GoalsPage() {
  const mounted = useRef(true);
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [form, setForm] = useState<GoalFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function getAuthHeaders(): Promise<Record<string, string>> {
    if (!supabase) return {};
    const sessionResult = await supabase.auth.getSession();
    const accessToken = sessionResult.data?.session?.access_token;
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  }

  useEffect(() => {
    mounted.current = true;

    async function loadGoals() {
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

      const response = await fetch("/api/goals", { method: "GET", headers });
      const payload = await response.json().catch(() => null);
      if (!mounted.current) return;

      if (!response.ok) {
        setError(payload?.error || "Failed to load goals.");
        setGoals([]);
      } else {
        setGoals(((payload?.goals ?? []) as Goal[]).slice().sort(sortByEventDate));
      }
      setLoading(false);
    }

    loadGoals();

    return () => {
      mounted.current = false;
    };
  }, []);

  function updateField<K extends keyof GoalFormState>(field: K, value: GoalFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function startEdit(goal: Goal) {
    setEditingId(goal.id);
    setForm(goalToForm(goal));
    setError(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    if (!form.name.trim() || !form.event_date) {
      setError("Name and event date are required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const headers = {
      "Content-Type": "application/json",
      ...(await getAuthHeaders()),
    };

    const payload = {
      name: form.name.trim(),
      event_date: form.event_date,
      event_location: form.event_location.trim() || null,
      event_type: form.event_type.trim() || null,
      distance_miles: toNumberOrNull(form.distance_miles),
      elevation_feet: toNumberOrNull(form.elevation_feet),
      target_finish_time: form.target_finish_time.trim() || null,
      expected_low_temp_f: toNumberOrNull(form.expected_low_temp_f),
      expected_high_temp_f: toNumberOrNull(form.expected_high_temp_f),
      weather_notes: form.weather_notes.trim() || null,
      notes: form.notes.trim() || null,
    };

    const url = editingId ? `/api/goals/${editingId}` : "/api/goals";
    const method = editingId ? "PATCH" : "POST";

    const response = await fetch(url, { method, headers, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => null);

    if (!mounted.current) return;

    if (!response.ok) {
      setError(result?.error || "Failed to save goal.");
      setSubmitting(false);
      return;
    }

    const savedGoal = result?.goal as Goal | undefined;
    if (savedGoal) {
      setGoals((prev) => {
        const next = editingId
          ? prev.map((g) => (g.id === savedGoal.id ? savedGoal : g))
          : [...prev, savedGoal];
        return next.sort(sortByEventDate);
      });
      setSuccess(editingId ? "Goal updated successfully." : "Goal created successfully.");
    } else {
      setError("Goal saved, but the response did not include the updated goal. Reload the page to see the latest list.");
    }

    setForm(emptyForm);
    setEditingId(null);
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setDeletingId(id);
    setError(null);
    setSuccess(null);

    const headers = await getAuthHeaders();
    const response = await fetch(`/api/goals/${id}`, { method: "DELETE", headers });
    const result = await response.json().catch(() => null);

    if (!mounted.current) return;

    if (!response.ok) {
      setError(result?.error || "Failed to delete goal.");
      setDeletingId(null);
      return;
    }

    setGoals((prev) => prev.filter((g) => g.id !== id));
    if (editingId === id) {
      cancelEdit();
    }
    setSuccess("Goal deleted.");
    setDeletingId(null);
  }

  const todayStr = getLocalDateString(new Date());
  const upcomingGoals = goals.filter((goal) => goal.event_date >= todayStr);

  return (
    <Protected>
    <main className="min-h-[calc(100vh-88px)] bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 px-6 py-10 text-white">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col justify-center gap-8 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
        <div className="space-y-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">Goals</p>
          <h1 className="text-4xl font-semibold text-white sm:text-5xl">Race & Event Goals</h1>
          <p className="mx-auto max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            Track upcoming events, target times, and expected conditions so your training and coaching reports stay aligned with what&apos;s next.
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
          <p className="text-sm uppercase tracking-[0.28em] text-slate-400">
            {editingId ? "Edit goal" : "Add a goal"}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="mb-2 block text-sm text-slate-300">Name *</label>
              <input
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                required
                className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2 text-white placeholder:text-slate-400"
                placeholder="Leadville 100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Event date *</label>
              <input
                type="date"
                value={form.event_date}
                onChange={(e) => updateField("event_date", e.target.value)}
                required
                className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2 text-white placeholder:text-slate-400 [color-scheme:dark]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Event location</label>
              <input
                value={form.event_location}
                onChange={(e) => updateField("event_location", e.target.value)}
                className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2 text-white placeholder:text-slate-400"
                placeholder="Leadville, CO"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Event type</label>
              <input
                value={form.event_type}
                onChange={(e) => updateField("event_type", e.target.value)}
                className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2 text-white placeholder:text-slate-400"
                placeholder="Gravel race"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Distance (miles)</label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={form.distance_miles}
                onChange={(e) => updateField("distance_miles", e.target.value)}
                className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2 text-white placeholder:text-slate-400"
                placeholder="100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Elevation gain (feet)</label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={form.elevation_feet}
                onChange={(e) => updateField("elevation_feet", e.target.value)}
                className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2 text-white placeholder:text-slate-400"
                placeholder="12000"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Target finish time</label>
              <input
                value={form.target_finish_time}
                onChange={(e) => updateField("target_finish_time", e.target.value)}
                className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2 text-white placeholder:text-slate-400"
                placeholder="9:30:00"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Expected low temp (°F)</label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={form.expected_low_temp_f}
                onChange={(e) => updateField("expected_low_temp_f", e.target.value)}
                className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2 text-white placeholder:text-slate-400"
                placeholder="40"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Expected high temp (°F)</label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={form.expected_high_temp_f}
                onChange={(e) => updateField("expected_high_temp_f", e.target.value)}
                className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2 text-white placeholder:text-slate-400"
                placeholder="75"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-2 block text-sm text-slate-300">Weather notes</label>
              <textarea
                value={form.weather_notes}
                onChange={(e) => updateField("weather_notes", e.target.value)}
                rows={2}
                className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2 text-white placeholder:text-slate-400"
                placeholder="Cold mornings, possible afternoon storms"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-2 block text-sm text-slate-300">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                rows={3}
                className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2 text-white placeholder:text-slate-400"
                placeholder="Pacing plan, nutrition strategy, gear notes..."
              />
            </div>

            <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-full bg-lime-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Saving..." : editingId ? "Save changes" : "Add goal"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="inline-flex items-center justify-center rounded-full bg-slate-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-600"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
          <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Upcoming goals</p>
          {loading ? (
            <p className="mt-4 text-sm text-slate-400">Loading goals...</p>
          ) : upcomingGoals.length ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingGoals.map((goal) => (
                <div key={goal.id} className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">{formatDaysUntil(goal.event_date)}</p>
                  <p className="mt-2 text-lg font-semibold text-white">{goal.name}</p>
                  <p className="mt-1 text-slate-400">
                    {formatDate(goal.event_date)}
                    {goal.event_location ? ` · ${goal.event_location}` : ""}
                  </p>
                  {(goal.event_type || goal.distance_miles != null) && (
                    <p className="mt-1 text-slate-400">
                      {[goal.event_type, goal.distance_miles != null ? `${goal.distance_miles} mi` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-400">No upcoming goals scheduled yet.</p>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/20 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">All goals</p>
            <span className="rounded-full bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.28em] text-slate-400">
              {goals.length} goals
            </span>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-slate-400">Loading goals...</p>
          ) : goals.length ? (
            <div className="mt-6 space-y-4">
              {goals.map((goal) => (
                <article key={goal.id} className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-[0.28em] text-slate-400">
                        {formatDate(goal.event_date)} · {formatDaysUntil(goal.event_date)}
                      </p>
                      <p className="mt-2 text-xl font-semibold text-white">{goal.name}</p>
                      {goal.event_location && <p className="mt-1 text-slate-400">{goal.event_location}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(goal)}
                        className="inline-flex items-center justify-center rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(goal.id)}
                        disabled={deletingId === goal.id}
                        className="inline-flex items-center justify-center rounded-full bg-red-600/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingId === goal.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
                    <div className="rounded-2xl bg-slate-900/80 p-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Type</p>
                      <p className="mt-2 text-lg font-semibold text-white">{goal.event_type ?? "—"}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-900/80 p-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Distance</p>
                      <p className="mt-2 text-lg font-semibold text-white">{formatDistance(goal.distance_miles)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-900/80 p-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Elevation</p>
                      <p className="mt-2 text-lg font-semibold text-white">{formatElevation(goal.elevation_feet)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-900/80 p-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Target time</p>
                      <p className="mt-2 text-lg font-semibold text-white">{goal.target_finish_time ?? "—"}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-900/80 p-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Expected temps</p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {formatTempRange(goal.expected_low_temp_f, goal.expected_high_temp_f)}
                      </p>
                    </div>
                  </div>

                  {goal.weather_notes && (
                    <div className="mt-4 rounded-2xl bg-slate-900/80 p-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Weather notes</p>
                      <p className="mt-2 leading-6 text-slate-300">{goal.weather_notes}</p>
                    </div>
                  )}

                  {goal.notes && (
                    <div className="mt-4 rounded-2xl bg-slate-900/80 p-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Notes</p>
                      <p className="mt-2 leading-6 text-slate-300">{goal.notes}</p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm text-slate-400">No goals yet. Add your first goal above.</p>
          )}
        </div>
      </div>
    </main>
    </Protected>
  );
}
