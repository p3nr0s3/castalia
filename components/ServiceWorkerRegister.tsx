"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js in production builds only (in `next dev` a service worker would cache stale
 * hot-reload chunks and make development confusing). Needs a secure context: https, or localhost.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => console.warn("Service worker registration failed:", err));
  }, []);
  return null;
}
