"use client";

type WelcomeSection = {
  title: string;
  description: string;
  colorClass: string;
};

const sections: WelcomeSection[] = [
  {
    title: "Dashboard",
    description: "Your home base — weekly summary, recent activities, and 14-day trends at a glance.",
    colorClass: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",
  },
  {
    title: "Fitness Trends",
    description: "Longer-term charts for distance, elevation, time, and training load over 12 weeks.",
    colorClass: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  },
  {
    title: "Training Plans",
    description: "Structured plans to help you build toward your next event.",
    colorClass: "border-violet-400/20 bg-violet-400/10 text-violet-300",
  },
  {
    title: "Coach",
    description: "AI-powered coaching insights based on your recent training data.",
    colorClass: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  },
  {
    title: "Goals",
    description: "Set targets and track your progress toward upcoming events.",
    colorClass: "border-rose-400/20 bg-rose-400/10 text-rose-300",
  },
  {
    title: "Settings",
    description: "Connect your Strava account here to start syncing activities automatically.",
    colorClass: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  },
];

export default function WelcomeTour({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/40 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Welcome</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">Welcome to Nick&apos;s Coaching App!</h2>
        <p className="mt-3 text-base leading-7 text-slate-300">
          Here&apos;s a quick look at where to find things. Use the navigation bar at the top to jump
          between these sections any time.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {sections.map((section) => (
            <div key={section.title} className={`rounded-2xl border p-4 ${section.colorClass}`}>
              <p className="font-semibold text-white">{section.title}</p>
              <p className="mt-1 text-sm leading-6 opacity-90">{section.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Got it, let&apos;s go
          </button>
        </div>
      </div>
    </div>
  );
}
