"use client";

import { useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.725-4.042-1.61-4.042-1.61-.546-1.385-1.333-1.755-1.333-1.755-1.089-.745.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.605-2.665-.303-5.466-1.332-5.466-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.5 11.5 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.61-2.805 5.624-5.476 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.286 0 .322.216.696.825.578C20.565 21.795 24 17.298 24 12c0-6.63-5.373-12-12-12Z" />
    </svg>
  );
}

export default function LoginPage() {
  const [status, setStatus] = useState<"idle" | "redirecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGitHubSignIn = async () => {
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
      provider: "github",
      options: { redirectTo },
    });

    if (error) {
      setErrorMessage(error.message ?? "Error signing in with GitHub.");
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
            Continue with GitHub to access your dashboard, goals, and training plans.
          </p>
        </div>

        <div className="mx-auto w-full max-w-md">
          <button
            type="button"
            onClick={handleGitHubSignIn}
            disabled={status === "redirecting"}
            className="flex w-full items-center justify-center gap-3 rounded-full border border-white/10 bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <GitHubIcon />
            {status === "redirecting" ? "Redirecting..." : "Continue with GitHub"}
          </button>

          {status === "error" && errorMessage ? (
            <p className="mt-4 text-center text-sm text-red-400">{errorMessage}</p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
