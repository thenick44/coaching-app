"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import { getOrCreateProfile, markWelcomeSeen } from "@/src/lib/profile";
import WelcomeTour from "./WelcomeTour";

export default function Protected({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeUserId, setWelcomeUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function check() {
      const client = supabase;
      if (!client) {
        router.push("/login");
        return;
      }

      const { data } = await client.auth.getSession();
      const session = data?.session;
      if (!mounted) return;
      if (!session) {
        router.push("/login");
        return;
      }

      setLoading(false);

      const user = session.user;
      const result = await getOrCreateProfile({ id: user.id, email: user.email });
      if (!mounted) return;
      if (result.profile && !result.profile.has_seen_welcome) {
        setWelcomeUserId(result.profile.id);
        setShowWelcome(true);
      }
    }

    check();

    let unsubscribe: (() => void) | null = null;
    const client = supabase;
    if (client) {
      const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
        if (!session) router.push("/login");
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    }

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [router]);

  const dismissWelcome = () => {
    setShowWelcome(false);
    if (welcomeUserId) {
      markWelcomeSeen(welcomeUserId);
    }
  };

  if (loading) return null;
  return (
    <>
      {children}
      {showWelcome && <WelcomeTour onDismiss={dismissWelcome} />}
    </>
  );
}
