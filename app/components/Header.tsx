"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

type NavLink = { href: string; label: string };
type NavGroup = { label: string; href?: string; items?: NavLink[] };

const navGroups: NavGroup[] = [
  { label: "Home", href: "/" },
  {
    label: "Training",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/fitness-trends", label: "Fitness Trends" },
      { href: "/training-plans", label: "Training Plans" },
    ],
  },
  {
    label: "Coaching",
    items: [
      { href: "/coach", label: "Coach" },
      { href: "/goals", label: "Goals" },
    ],
  },
  { label: "Settings", href: "/settings" },
];

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function NavDropdown({
  label,
  items,
  isOpen,
  onToggle,
  onNavigate,
}: {
  label: string;
  items: NavLink[];
  isOpen: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex items-center gap-1 rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white"
      >
        {label}
        <ChevronIcon className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-20 mt-2 min-w-[11rem] rounded-xl border border-white/10 bg-slate-900 p-1 shadow-xl shadow-black/30">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className="block rounded-lg px-3 py-2 text-sm transition hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!openGroup) return;

    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenGroup(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openGroup]);

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

        <nav className="hidden items-center gap-4 lg:flex">
          <div ref={navRef} className="flex flex-wrap items-center gap-1 text-sm font-medium text-slate-200">
            {navGroups.map((group) =>
              group.items ? (
                <NavDropdown
                  key={group.label}
                  label={group.label}
                  items={group.items}
                  isOpen={openGroup === group.label}
                  onToggle={() =>
                    setOpenGroup((current) => (current === group.label ? null : group.label))
                  }
                  onNavigate={() => setOpenGroup(null)}
                />
              ) : (
                <Link
                  key={group.href}
                  href={group.href!}
                  className="rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white"
                >
                  {group.label}
                </Link>
              )
            )}
          </div>

          <div className="ml-3 flex items-center gap-3">
            {userEmail ? (
              <>
                <span className="hidden text-sm text-slate-400 xl:inline-block">{userEmail}</span>
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
          className="inline-flex items-center justify-center rounded-full p-2 text-slate-200 transition hover:bg-white/10 lg:hidden"
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
        <nav className="mx-auto mt-4 flex max-w-6xl flex-col gap-1 lg:hidden">
          {navGroups.map((group) =>
            group.items ? (
              <div key={group.label} className="flex flex-col gap-1">
                <span className="px-4 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {group.label}
                </span>
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-xl px-4 py-3 pl-8 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : (
              <Link
                key={group.href}
                href={group.href!}
                onClick={() => setMenuOpen(false)}
                className="rounded-xl px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
              >
                {group.label}
              </Link>
            )
          )}
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
