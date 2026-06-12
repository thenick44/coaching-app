"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function InfoTooltip({
  children,
  label = "About this chart",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-expanded={open}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20 text-[10px] font-semibold text-slate-400 transition hover:border-white/40 hover:text-white"
      >
        i
      </button>
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="relative max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-xl border border-white/10 bg-slate-900 p-4 pr-9 text-left text-xs leading-5 text-slate-300 shadow-xl shadow-black/60"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
              {children}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
