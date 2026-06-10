"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

export default function Protected({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

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
      } else {
        setLoading(false);
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

  if (loading) return null;
  return <>{children}</>;
}
