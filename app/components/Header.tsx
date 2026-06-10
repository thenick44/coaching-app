"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/coach", label: "Coach" },
  { href: "/settings", label: "Settings" },
];

export default function Header() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!mounted) return;
      setUserEmail(session?.user?.email ?? null);
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/95 px-6 py-4 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6">
        <div className="text-lg font-semibold">Nick&apos;s Coaching App</div>
        <nav className="flex items-center gap-4">
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
                <span className="hidden rounded-full px-3 py-2 text-sm text-slate-300 sm:inline-block">
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
      </div>
    </header>
  );
}
