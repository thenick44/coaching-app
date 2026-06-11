"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

const FEATURE_CARDS = [
  {
    title: "Strava Sync",
    description: "Connect your rides and recovery data instantly with Strava sync.",
    href: "/settings",
  },
  {
    title: "Training Dashboard",
    description: "Track progress, load, and goals with a clean dashboard built for endurance athletes.",
    href: "/dashboard",
  },
  {
    title: "AI Coach",
    description: "Receive personalized guidance and training recommendations from your AI coach.",
    href: "/coach",
  },
  {
    title: "Race Planner",
    description: "Plan race day strategy, pacing, and tapering in one place.",
    href: "/goals",
  },
];

export default function Home() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSignedIn(Boolean(data?.session));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setSignedIn(Boolean(session));
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 px-6 py-10 text-white">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center gap-10 sm:gap-14">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
          <div className="max-w-2xl space-y-6 text-center sm:text-left">
            <p className="inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-slate-200">
              Cycling & endurance coaching
            </p>
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Training Signals
            </h1>
            <p className="max-w-xl text-lg leading-8 text-slate-300 sm:text-xl">
              Your personal cycling and endurance coach — built for athletes who want smarter training, better insights, and race-ready results.
            </p>
            <div className="flex justify-center sm:justify-start">
              {signedIn ? (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-full bg-lime-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-lime-400"
                >
                  Go to Dashboard
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-full bg-lime-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-lime-400"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-2">
          {FEATURE_CARDS.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/10 transition hover:-translate-y-1 hover:border-sky-400/40 hover:bg-white/10"
            >
              <h2 className="text-xl font-semibold text-white">{card.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">{card.description}</p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
