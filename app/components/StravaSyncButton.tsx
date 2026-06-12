"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { formatRelativeTime } from "@/src/lib/formatRelativeTime";

export default function StravaSyncButton({ onSynced }: { onSynced?: () => void }) {
  const mounted = useRef(true);
  const [hasConnection, setHasConnection] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;

    async function checkConnection() {
      if (!supabase) return;
      try {
        const sessionResult = await supabase.auth.getSession();
        const accessToken = sessionResult.data?.session?.access_token;
        const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
        const response = await fetch("/api/strava/status", { headers });
        if (!response.ok) return;
        const data = await response.json();
        if (mounted.current) {
          setHasConnection(Boolean(data?.has_connection));
          setLastSyncedAt(data?.last_synced_at ?? null);
        }
      } catch (err) {
        console.error("Failed to load Strava connection status:", err);
      }
    }

    checkConnection();

    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  async function runSync(resync: boolean) {
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    const setBusy = resync ? setResyncing : setSyncing;
    setBusy(true);
    setMessage(null);

    try {
      const sessionResult = await supabase.auth.getSession();
      const accessToken = sessionResult.data?.session?.access_token;

      const response = await fetch("/api/strava/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken ?? null, resync }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error || "Failed to sync activities.");
        return;
      }

      if (resync) {
        const removedNote = result.removed ? ` Removed ${result.removed} stale ${result.removed === 1 ? "activity" : "activities"}.` : "";
        setMessage(`Re-synced! Imported ${result.imported} ${result.imported === 1 ? "activity" : "activities"}.${removedNote}`);
      } else {
        setMessage(`Synced! Imported ${result.imported} ${result.imported === 1 ? "activity" : "activities"}.`);
      }
      if (result.last_synced_at) {
        setLastSyncedAt(result.last_synced_at);
      }
      onSynced?.();
    } catch (err) {
      console.error(err);
      setMessage("An unexpected error occurred while syncing activities.");
    } finally {
      setBusy(false);
    }
  }

  function handleSync() {
    runSync(false);
  }

  function handleResync() {
    const confirmed = window.confirm(
      "Re-syncing will replace your recent activities with the latest data from Strava, including removing any that were deleted. This may shift your recent fitness, fatigue, and training load metrics. Continue?"
    );
    if (!confirmed) return;
    runSync(true);
  }

  if (!hasConnection) return null;

  const lastSyncedLabel = formatRelativeTime(lastSyncedAt);
  const busy = syncing || resyncing;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={handleSync}
          className="inline-flex items-center rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync Strava"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleResync}
          className="inline-flex items-center rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resyncing ? "Re-syncing..." : "Re-sync recent activities"}
        </button>
        {message && <span className="text-sm text-slate-300">{message}</span>}
      </div>
      {!message && lastSyncedLabel && (
        <span className="text-xs text-slate-500">Last synced {lastSyncedLabel}</span>
      )}
    </div>
  );
}
