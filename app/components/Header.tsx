"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/goals", label: "Goals" },
  { href: "/training-plans", label: "Training Plans" },
  { href: "/coach", label: "Coach" },
  { href: "/settings", label: "Settings" },
];

export default function Header() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    async function load() {
      const client = supabase;
      if (!client) return;
      const { data } = await client.auth.getSession();
      const session = data?.session;
      if (!mounted) return;
      setUserEmail(session?.user?.email ?? null);
    }

    load();

    const client = supabase;
    if (client) {
      const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
        setUserEmail(session?.user?.email ?? null);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    }

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const signOut = async () => {
    const client = supabase;
    if (client) {
      await client.auth.signOut();
    }
    setMenuOpen(false);
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/95 px-6 py-4 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6">
        <div className="text-lg font-semibold">Nick&apos;s Coaching App</div>

        <nav className="hidden items-center gap-4 sm:flex">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-200">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-4 py-2 transition hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="ml-3 flex items-center gap-3">
            {userEmail ? (
              <>
                <span className="hidden rounded-full px-3 py-2 text-sm text-slate-300 lg:inline-block">
                  {userEmail}
                </span>
                <button
                  onClick={signOut}
                  className="rounded-full bg-white/6 px-3 py-2 text-sm font-medium hover:bg-white/10"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-full bg-white/6 px-3 py-2 text-sm font-medium hover:bg-white/10"
              >
                Sign In
              </Link>
            )}
          </div>
        </nav>

        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
          className="inline-flex items-center justify-center rounded-full p-2 text-slate-200 transition hover:bg-white/10 sm:hidden"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {menuOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <nav className="mx-auto mt-4 flex max-w-6xl flex-col gap-1 sm:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-xl px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-3">
            {userEmail ? (
              <>
                <span className="px-4 text-sm text-slate-400">{userEmail}</span>
                <button
                  onClick={signOut}
                  className="rounded-xl bg-white/6 px-4 py-3 text-left text-sm font-medium text-slate-200 transition hover:bg-white/10"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="rounded-xl bg-white/6 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
              >
                Sign In
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
