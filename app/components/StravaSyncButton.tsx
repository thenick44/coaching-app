"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

export default function StravaSyncButton({ onSynced }: { onSynced?: () => void }) {
  const mounted = useRef(true);
  const [hasConnection, setHasConnection] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  async function handleSync() {
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    setSyncing(true);
    setMessage(null);

    try {
      const sessionResult = await supabase.auth.getSession();
      const accessToken = sessionResult.data?.session?.access_token;

      const response = await fetch("/api/strava/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken ?? null }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error || "Failed to sync activities.");
        return;
      }

      setMessage(`Imported ${result.imported} activities`);
      onSynced?.();
    } catch (err) {
      console.error(err);
      setMessage("An unexpected error occurred while syncing activities.");
    } finally {
      setSyncing(false);
    }
  }

  if (!hasConnection) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={syncing}
        onClick={handleSync}
        className="inline-flex items-center rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {syncing ? "Syncing..." : "Sync Strava"}
      </button>
      {message && <span className="text-sm text-slate-300">{message}</span>}
    </div>
  );
}
