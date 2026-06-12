"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

function LoginContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(() =>
    searchParams.get("error") ? "error" : "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(() => searchParams.get("error"));
  const [cooldown, setCooldown] = useState<number>(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(id);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage(null);
    try {
      if (!supabase) {
        setErrorMessage("Supabase is not configured.");
        setStatus("error");
        return;
      }

      const base =
        (process.env.NEXT_PUBLIC_APP_URL as string) || (typeof window !== "undefined" ? window.location.origin : undefined);
      const redirectTo = base ? `${String(base).replace(/\/$/, "")}/auth/callback` : undefined;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
        },
      });
      if (error) {
        const msg = error.message ?? String(error);
        if (typeof msg === "string" && msg.toLowerCase().includes("email rate limit exceeded")) {
          setErrorMessage("Too many sign-in emails were requested. Please wait a few minutes before trying again.");
        } else {
          setErrorMessage(msg || "Error sending link.");
        }
        setStatus("error");
        return;
      }
      setStatus("sent");
      setCooldown(60);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      if (typeof msg === "string" && msg.toLowerCase().includes("email rate limit exceeded")) {
        setErrorMessage("Too many sign-in emails were requested. Please wait a few minutes before trying again.");
      } else {
        setErrorMessage(msg || "Error sending link.");
      }
      setStatus("error");
    }
  };

  return (
    <main className="min-h-[calc(100vh-88px)] bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 px-6 py-10 text-white">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-8 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
        <div className="space-y-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">Sign In</p>
          <h1 className="text-3xl font-semibold text-white">Sign in with email</h1>
          <p className="mx-auto max-w-xl text-base leading-7 text-slate-300">
            Enter your email and we&apos;ll send a magic link to sign you in.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md">
          <label className="mb-2 block text-sm text-slate-300">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2 text-white placeholder:text-slate-400"
          />

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={status === "sending" || cooldown > 0}
              className="rounded-full bg-white/6 px-4 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-50"
            >
              {status === "sending" ? "Sending..." : cooldown > 0 ? `Resend in ${cooldown}s` : "Send magic link"}
            </button>
            {status === "sent" && <span className="text-sm text-slate-300">Link sent — check your email.</span>}
            {status === "error" && errorMessage ? (
              <span className="text-sm text-red-400">{errorMessage}</span>
            ) : null}
          </div>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950" />}>
      <LoginContent />
    </Suspense>
  );
}
