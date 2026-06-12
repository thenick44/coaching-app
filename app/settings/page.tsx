"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/src/lib/supabaseClient";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrCreateProfile, Profile } from "@/src/lib/profile";
import { formatRelativeTime } from "@/src/lib/formatRelativeTime";
import Protected from "../components/Protected";

const ERROR_MESSAGES: Record<string, string> = {
  no_code: "Failed to connect to Strava: No authorization code received",
  config_error: "Strava is not properly configured",
  invalid_state: "Your Strava connection request expired or was invalid. Please try connecting again.",
  token_exchange_failed: "Failed to exchange authorization code for token",
  oauth_error: "An error occurred during Strava authentication",
};

function SettingsContent() {
  const searchParams = useSearchParams();
  const mounted = useRef(true);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [connectingStrava, setConnectingStrava] = useState(false);
  const [hasStravaConnection, setHasStravaConnection] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const stravaConnected = searchParams.get("strava");
  const stravaConnectedParam =
    stravaConnected === "connected" || stravaConnected === "connected_dev";
  const showSyncButton = stravaConnectedParam || hasStravaConnection;

  const [success, setSuccess] = useState<string | null>(() => {
    if (stravaConnectedParam) {
      return stravaConnected === "connected" ? "Strava connected successfully!" : "Strava connected (dev)";
    }
    return null;
  });

  const [error, setError] = useState<string | null>(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      return ERROR_MESSAGES[errorParam] || "An error occurred";
    }
    return supabase ? null : "Supabase is not configured.";
  });

  // Checks whether the sync actually completed server-side even though the
  // browser's fetch was interrupted (e.g. the user backgrounded the tab and
  // mobile Safari killed the in-flight request).
  async function checkSyncCompletedAfterInterruption(
    client: SupabaseClient,
    syncStartedAt: number
  ): Promise<string | null> {
    try {
      const sessionResult = await client.auth.getSession();
      const accessToken = sessionResult.data?.session?.access_token;
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
      const response = await fetch("/api/strava/status", { headers });
      if (!response.ok) return null;
      const data = await response.json();
      const newLastSyncedAt = data?.last_synced_at ?? null;
      if (newLastSyncedAt && new Date(newLastSyncedAt).getTime() >= syncStartedAt) {
        return newLastSyncedAt;
      }
    } catch (err) {
      console.error("Failed to check sync status after interruption:", err);
    }
    return null;
  }

  async function syncActivities() {
    const client = supabase;
    if (!client) {
      setError("Unable to sync activities: Supabase is not configured.");
      return;
    }

    setSyncing(true);
    setError(null);
    setSuccess(null);

    const syncStartedAt = Date.now();

    try {
      const sessionResult = await client.auth.getSession();
      const accessToken = sessionResult.data?.session?.access_token;

      const response = await fetch("/api/strava/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken ?? null }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || "Failed to sync activities.");
        return;
      }

      setSuccess(`Synced! Imported ${result.imported} ${result.imported === 1 ? "activity" : "activities"}.`);
      if (result.last_synced_at) {
        setLastSyncedAt(result.last_synced_at);
      }
    } catch (err) {
      console.error(err);
      const completedAt = await checkSyncCompletedAfterInterruption(client, syncStartedAt);
      if (completedAt) {
        setLastSyncedAt(completedAt);
        setSuccess("Connection was interrupted, but the sync finished successfully.");
      } else {
        setError("Connection was interrupted before the sync finished. It may complete in the background — check back in a moment, or try again.");
      }
    } finally {
      setSyncing(false);
    }
  }

  async function connectStrava() {
    const client = supabase;
    if (!client) {
      setError("Unable to connect Strava: Supabase is not configured.");
      return;
    }

    setConnectingStrava(true);
    setError(null);

    try {
      const sessionResult = await client.auth.getSession();
      const accessToken = sessionResult.data?.session?.access_token;
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;

      const response = await fetch("/api/strava/connect", { headers });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.url) {
        setError(result?.error || "Failed to start Strava connection.");
        return;
      }

      window.location.href = result.url;
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred while connecting to Strava.");
    } finally {
      setConnectingStrava(false);
    }
  }

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      return;
    }

    async function loadStravaConnectionStatus(accessToken?: string) {
      try {
        const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
        const response = await fetch("/api/strava/status", { headers });
        if (!response.ok) return;
        const data = await response.json();
        if (mounted.current) {
          setHasStravaConnection(Boolean(data?.has_connection));
          setLastSyncedAt(data?.last_synced_at ?? null);
        }
      } catch (err) {
        console.error("Failed to load Strava connection status:", err);
      }
    }

    async function loadUser(c: SupabaseClient) {
      const { data } = await c.auth.getUser();
      if (!mounted.current) return;
      const user = data?.user ?? null;
      setEmail(user?.email ?? null);
      if (user) {
        const result = await getOrCreateProfile({ id: user.id, email: user.email });
        if (mounted.current) {
          setProfile(result.profile);
          setError(result.error);
        }
      } else {
        setProfile(null);
        setError(null);
      }

      const sessionResult = await c.auth.getSession();
      await loadStravaConnectionStatus(sessionResult.data?.session?.access_token);
    }

    loadUser(client);

    const { data: sub } = client.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;
      setEmail(user?.email ?? null);
      if (user) {
        const result = await getOrCreateProfile({ id: user.id, email: user.email });
        if (mounted.current) {
          setProfile(result.profile);
          setError(result.error);
        }
      } else {
        setProfile(null);
        setError(null);
      }
      await loadStravaConnectionStatus(session?.access_token);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const lastSyncedLabel = formatRelativeTime(lastSyncedAt);

  return (
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

        {success && (
          <div className="mx-auto max-w-2xl rounded-2xl border border-green-500/30 bg-green-950/30 p-4 text-sm text-green-200 shadow-lg shadow-black/20">
            <p className="font-semibold">Success</p>
            <p className="mt-1">{success}</p>
          </div>
        )}

        <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-left shadow-lg shadow-black/20 sm:p-8">
          <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Account</p>
          {email ? (
            <>
              <p className="mt-4 text-xl font-semibold text-white">{email}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">Profile id: {profile?.id ?? "—"}</p>
              <p className="mt-1 text-sm leading-6 text-slate-300">Strava athlete id: {profile?.strava_athlete_id ?? "Not connected"}</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {hasStravaConnection || profile?.strava_athlete_id ? (
                  <span
                    aria-disabled="true"
                    className="inline-flex cursor-not-allowed items-center rounded-lg bg-orange-600/40 px-4 py-2 font-semibold text-white/70"
                  >
                    Strava Connected
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={connectingStrava}
                    onClick={connectStrava}
                    className="inline-flex items-center rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {connectingStrava ? "Connecting..." : "Connect Strava"}
                  </button>
                )}
                {showSyncButton && (
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={syncActivities}
                    className="inline-flex items-center rounded-lg bg-slate-700 px-4 py-2 font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {syncing ? "Syncing..." : "Sync Strava Activities"}
                  </button>
                )}
              </div>
              {showSyncButton && !success && lastSyncedLabel && (
                <p className="mt-2 text-sm text-slate-400">Last synced {lastSyncedLabel}</p>
              )}
            </>
          ) : (
            <p className="mt-4 text-base text-slate-300">Loading account details...</p>
          )}

          <p className="mt-4 text-sm leading-6 text-slate-400">
            {isSupabaseConfigured ? "Supabase connected" : "Supabase not configured"}
          </p>
        </div>
      </div>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950" />}>
      <Protected>
        <SettingsContent />
      </Protected>
    </Suspense>
  );
}
