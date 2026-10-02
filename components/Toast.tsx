"use client";

import React, { useEffect, useState } from "react";
import { toastManager, ToastItem } from "@/lib/toast";
import {
  CheckCircle,
  WarningCircle,
  Warning,
  Info,
  X,
} from "@phosphor-icons/react";

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return toastManager.subscribe((items) => {
      setToasts(items);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4 sm:px-0"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((t) => {
        const isError = t.type === "error";
        const isWarning = t.type === "warning";
        const isSuccess = t.type === "success";

        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl border shadow-xl backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-bottom-3 ${
              isError
                ? "bg-rose-950/80 border-rose-500/30 text-rose-200"
                : isWarning
                ? "bg-amber-950/80 border-amber-500/30 text-amber-200"
                : isSuccess
                ? "bg-emerald-950/80 border-emerald-500/30 text-emerald-200"
                : "bg-[var(--card-bg)]/95 border-[var(--card-border)] text-[var(--foreground)]"
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {isError && <WarningCircle size={18} weight="fill" className="text-rose-400" />}
              {isWarning && <Warning size={18} weight="fill" className="text-amber-400" />}
              {isSuccess && <CheckCircle size={18} weight="fill" className="text-emerald-400" />}
              {!isError && !isWarning && !isSuccess && (
                <Info size={18} weight="fill" className="text-sky-400" />
              )}
            </div>

            <div className="flex-1 text-xs leading-relaxed font-medium break-words">
              {t.message}
            </div>

            <button
              onClick={() => toastManager.dismiss(t.id)}
              className="shrink-0 p-1 -mr-1 -mt-1 rounded-lg text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors"
              aria-label="Tutup notifikasi"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
