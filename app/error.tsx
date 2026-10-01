"use client";

import { useEffect } from "react";

/** Route-level error UI (Next.js App Router): shown when rendering a page segment throws. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);
  return (
    <div role="alert" style={{ display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 24, textAlign: "center" }}>
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Terjadi kesalahan</h2>
      <p style={{ maxWidth: 480, fontSize: 13, opacity: 0.7, wordBreak: "break-word" }}>{error.message}</p>
      <button onClick={reset} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid currentColor", cursor: "pointer" }}>
        Coba lagi
      </button>
    </div>
  );
}
