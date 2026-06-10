import Protected from "../components/Protected";

export default function CoachPage() {
  return (
    <Protected>
      <main className="min-h-[calc(100vh-88px)] bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 px-6 py-10 text-white">
        <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center gap-8 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
          <div className="space-y-4 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">
              Coach
            </p>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">AI Coach</h1>
            <p className="mx-auto max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Get personalized coaching guidance, adaptive workout suggestions, and endurance insights to stay on pace for your next goal.
            </p>
          </div>
        </div>
      </main>
    </Protected>
  );
}
