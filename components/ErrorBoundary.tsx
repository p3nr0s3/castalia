"use client";

import React from "react";

interface ErrorBoundaryProps {
  /** Short label shown in the fallback and logged ("workspace", "modals", …). */
  name: string;
  children: React.ReactNode;
  /** When any of these values change the boundary clears its error (e.g. switching conversation). */
  resetKeys?: unknown[];
  /** `inline` renders a compact banner; `panel` fills its container. */
  variant?: "inline" | "panel";
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * React error boundary. Without one, a render error anywhere below app/page.tsx unmounts the
 * whole tree and the user gets a blank page — including their unsent draft. Wrapping the
 * workspace and the modal layer separately means a bug in (say) SettingsModal cannot take the
 * chat down with it.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name}]`, error, info.componentStack);
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (!this.state.error) return;
    const a = prev.resetKeys || [];
    const b = this.props.resetKeys || [];
    if (a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))) this.setState({ error: null });
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const panel = this.props.variant === "panel";
    return (
      <div
        role="alert"
        className={
          panel
            ? "flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
            : "fixed bottom-4 right-4 z-[200] max-w-sm rounded-xl border border-red-500/40 bg-[var(--background)] p-4 shadow-xl"
        }
      >
        <p className="text-sm font-semibold text-red-400">Bagian “{this.props.name}” mengalami error</p>
        <p className="max-w-md break-words text-xs text-[var(--muted-foreground,#888)]">{error.message}</p>
        <div className="flex gap-2">
          <button onClick={this.reset} className="rounded-lg border border-[var(--border,#444)] px-3 py-1 text-xs hover:bg-white/5">
            Coba lagi
          </button>
          {panel && (
            <button onClick={() => window.location.reload()} className="rounded-lg border border-[var(--border,#444)] px-3 py-1 text-xs hover:bg-white/5">
              Muat ulang halaman
            </button>
          )}
        </div>
      </div>
    );
  }
}
