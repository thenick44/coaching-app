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
      const base =
        (process.env.NEXT_PUBLIC_APP_URL as string) || (typeof window !== "undefined" ? window.location.origin : undefined);
      const redirectTo = base ? `${String(base).replace(/\/$/, "")}/auth/callback` : undefined;
      const { error } = await supabase.auth.signInWithOtp({ email }, { emailRedirectTo: redirectTo });
      "use client";

      import { useEffect, useState } from "react";
      import { supabase } from "@/src/lib/supabaseClient";

      export default function LoginPage() {
        const [email, setEmail] = useState("");
        const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
        const [errorMessage, setErrorMessage] = useState<string | null>(null);
        const [cooldown, setCooldown] = useState<number>(0);

        useEffect(() => {
          if (cooldown <= 0) return;
          const id = setInterval(() => {
            setCooldown((c) => {
              if (c <= 1) {
                clearInterval(id);
                return 0;
              }
              return c - 1;
            });
          }, 1000);
          return () => clearInterval(id);
        }, [cooldown]);

        const handleSubmit = async (e: React.FormEvent) => {
          e.preventDefault();
          setStatus("sending");
          setErrorMessage(null);
          try {
            const base =
              (process.env.NEXT_PUBLIC_APP_URL as string) || (typeof window !== "undefined" ? window.location.origin : undefined);
            const redirectTo = base ? `${String(base).replace(/\/$/, "")}/auth/callback` : undefined;
            const { error } = await supabase.auth.signInWithOtp({ email }, { emailRedirectTo: redirectTo });
            if (error) {
              const msg = (error as any)?.message ?? String(error);
              if (typeof msg === "string" && msg.toLowerCase().includes("email rate limit exceeded")) {
                setErrorMessage("Too many sign-in emails were requested. Please wait a few minutes before trying again.");
              } else {
                setErrorMessage(msg || "Error sending link.");
              }
              setStatus("error");
              return;
            }
            setStatus("sent");
            setCooldown(60);
          } catch (err) {
            console.error(err);
            const msg = (err as any)?.message ?? String(err);
            if (typeof msg === "string" && msg.toLowerCase().includes("email rate limit exceeded")) {
              setErrorMessage("Too many sign-in emails were requested. Please wait a few minutes before trying again.");
            } else {
              setErrorMessage("Error sending link.");
            }
            setStatus("error");
          }
        };
