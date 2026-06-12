"use client";

import { useEffect, useRef, useState } from "react";

export default function InfoTooltip({
  children,
  label = "About this chart",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-expanded={open}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20 text-[10px] font-semibold text-slate-400 transition hover:border-white/40 hover:text-white"
      >
        i
      </button>
      {open && (
        <div className="fixed inset-x-4 bottom-4 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-white/10 bg-slate-900 p-4 text-left text-xs leading-5 text-slate-300 shadow-xl shadow-black/40 sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-6 sm:max-h-none sm:w-80 sm:overflow-visible">
          {children}
        </div>
      )}
    </div>
  );
}
