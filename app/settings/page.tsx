"use client";

import { useEffect, useState } from "react";
import Protected from "../components/Protected";
import { supabase, isSupabaseConfigured } from "@/src/lib/supabaseClient";
import { getOrCreateProfile, Profile } from "@/src/lib/profile";

export default function SettingsPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      const user = data?.user ?? null;
      setEmail(user?.email ?? null);
      if (user) {
        const result = await getOrCreateProfile({ id: user.id, email: user.email });
        if (mounted) {
          setProfile(result.profile);
          setError(result.error);
        }
      } else {
        setProfile(null);
        setError(null);
      }
    }

    loadUser();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;
      setEmail(user?.email ?? null);
      if (user) {
        const result = await getOrCreateProfile({ id: user.id, email: user.email });
        if (mounted) {
          setProfile(result.profile);
          setError(result.error);
        }
      } else {
        setProfile(null);
        setError(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <Protected>
      <main className="min-h-[calc(100vh-88px)] bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 px-6 py-10 text-white">
        <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center gap-8 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
          <div className="space-y-4 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">
              Settings
            </p>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">App Settings</h1>
            <p className="mx-auto max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Configure your profile, notification preferences, and training options from one central hub.
            </p>
          </div>

          {error && (
            <div className="mx-auto max-w-2xl rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200 shadow-lg shadow-black/20">
              <p className="font-semibold">Error</p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-left shadow-lg shadow-black/20 sm:p-8">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Account</p>
            {email ? (
              <>
                <p className="mt-4 text-xl font-semibold text-white">{email}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">Profile id: {profile?.id ?? "—"}</p>
                <p className="mt-1 text-sm leading-6 text-slate-300">Strava athlete id: {profile?.strava_athlete_id ?? "Not connected"}</p>
              </>
            ) : (
              <p className="mt-4 text-base text-slate-300">Please sign in to view account details.</p>
            )}

            <p className="mt-4 text-sm leading-6 text-slate-400">
              {isSupabaseConfigured ? "Supabase connected" : "Supabase not configured"}
            </p>
          </div>
        </div>
      </main>
    </Protected>
  );
}
