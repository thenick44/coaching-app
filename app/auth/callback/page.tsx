"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function completeSignIn() {
      const errorDescription = searchParams.get("error_description") || searchParams.get("error");
      if (errorDescription) {
        router.replace(`/login?error=${encodeURIComponent(errorDescription)}`);
        return;
      }

      if (!supabase) {
        router.replace(`/login?error=${encodeURIComponent("Supabase is not configured.")}`);
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        router.replace(`/login?error=${encodeURIComponent(error.message)}`);
        return;
      }

      if (!data.session) {
        router.replace(`/login?error=${encodeURIComponent("Sign-in link is invalid or has expired.")}`);
        return;
      }

      router.replace("/dashboard");
    }

    completeSignIn();
  }, [router, searchParams]);

  return (
    <main className="flex min-h-[calc(100vh-88px)] items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 px-6 py-10 text-white">
      <p className="text-base text-slate-300">Signing you in...</p>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950" />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
