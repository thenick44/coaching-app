"use client";

import { useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.014-.07-.04-.23-.04-.4 0-1.13.572-2.27 1.207-2.98.7-.91 1.95-1.6 2.945-1.65.013.13.013.27.013.41zm4.564 16.59c-.04.09-.59 2.04-1.94 4.03-1.16 1.7-2.36 3.4-4.27 3.43-1.86.04-2.46-1.1-4.59-1.1-2.13 0-2.79 1.07-4.55 1.14-1.83.07-3.23-1.84-4.4-3.53-2.39-3.46-4.21-9.78-1.76-14.04 1.21-2.12 3.39-3.46 5.74-3.5 1.79-.03 3.48 1.2 4.58 1.2 1.09 0 3.16-1.49 5.32-1.27.91.04 3.45.37 5.08 2.78-.13.08-3.03 1.77-3 5.27.04 4.18 3.66 5.57 3.7 5.59z" />
    </svg>
  );
}

export default function LoginPage() {
  const [status, setStatus] = useState<"idle" | "redirecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAppleSignIn = async () => {
    if (!supabase) {
      setErrorMessage("Supabase is not configured.");
      setStatus("error");
      return;
    }

    setStatus("redirecting");
    setErrorMessage(null);

    const base =
      (process.env.NEXT_PUBLIC_APP_URL as string) || (typeof window !== "undefined" ? window.location.origin : undefined);
    const redirectTo = base ? `${String(base).replace(/\/$/, "")}/auth/callback` : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo },
    });

    if (error) {
      setErrorMessage(error.message ?? "Error signing in with Apple.");
      setStatus("error");
    }
  };

  return (
    <main className="min-h-[calc(100vh-88px)] bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 px-6 py-10 text-white">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-8 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
        <div className="space-y-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">Sign In</p>
          <h1 className="text-3xl font-semibold text-white">Sign in to your account</h1>
          <p className="mx-auto max-w-xl text-base leading-7 text-slate-300">
            Continue with Apple to access your dashboard, goals, and training plans.
          </p>
        </div>

        <div className="mx-auto w-full max-w-md">
          <button
            type="button"
            onClick={handleAppleSignIn}
            disabled={status === "redirecting"}
            className="flex w-full items-center justify-center gap-3 rounded-full border border-white/10 bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <AppleIcon />
            {status === "redirecting" ? "Redirecting..." : "Continue with Apple"}
          </button>

          {status === "error" && errorMessage ? (
            <p className="mt-4 text-center text-sm text-red-400">{errorMessage}</p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
