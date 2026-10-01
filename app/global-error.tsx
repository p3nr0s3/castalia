"use client";

/**
 * Last-resort error UI: replaces the root layout when the layout itself throws, so it must
 * render its own <html>/<body> and cannot rely on any app styles or providers.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#111", color: "#eee" }}>
        <div role="alert" style={{ display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 24, textAlign: "center" }}>
          <h2 style={{ fontSize: 18 }}>Aplikasi mengalami error fatal</h2>
          <p style={{ maxWidth: 480, fontSize: 13, opacity: 0.7, wordBreak: "break-word" }}>{error.message}</p>
          <button onClick={reset} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #888", background: "transparent", color: "inherit", cursor: "pointer" }}>
            Muat ulang
          </button>
        </div>
      </body>
    </html>
  );
}
