"use client";

import { useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      setStatus("sent");
    } catch (err) {
      console.error(err);
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
            required
            className="w-full rounded-md border border-white/10 bg-transparent px-4 py-2 text-white placeholder:text-slate-400"
          />

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              className="rounded-full bg-white/6 px-4 py-2 text-sm font-medium hover:bg-white/10"
            >
              {status === "sending" ? "Sending..." : "Send magic link"}
            </button>
            {status === "sent" && <span className="text-sm text-slate-300">Link sent — check your email.</span>}
            {status === "error" && <span className="text-sm text-red-400">Error sending link.</span>}
          </div>
        </form>
      </div>
    </main>
  );
}
