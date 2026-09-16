"use client";

import React, { useState, useRef, useEffect } from "react";
import { Database, Warning as AlertTriangle, CheckCircle as CheckCircle2, CaretRight as ChevronRight, X, Sparkle as Sparkles, Question as HelpCircle } from "@phosphor-icons/react";
import { ContextBreakdown, formatTokenCount } from "@/lib/contextVisualizer";

interface ContextVisualizerProps {
  breakdown: ContextBreakdown;
  onOpenParameters?: () => void;
  onSelectNumCtx?: (tokens: number) => void;
  compact?: boolean;
}

export const ContextVisualizer: React.FC<ContextVisualizerProps> = ({
  breakdown,
  onOpenParameters,
  onSelectNumCtx,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const {
    systemPromptTokens,
    ragTokens,
    historyTokens,
    inputTokens,
    totalUsedTokens,
    totalMaxTokens,
    remainingTokens,
    usagePercentage,
    isNearOverflow,
    historyWasTrimmed,
  } = breakdown;

  // Percentages for the multi-segment bar
  const systemPct = Math.max(0, (systemPromptTokens / totalMaxTokens) * 100);
  const ragPct = Math.max(0, (ragTokens / totalMaxTokens) * 100);
  const historyPct = Math.max(0, (historyTokens / totalMaxTokens) * 100);
  const inputPct = Math.max(0, (inputTokens / totalMaxTokens) * 100);
  const remainingPct = Math.max(0, 100 - (systemPct + ragPct + historyPct + inputPct));

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const statusColor =
    usagePercentage >= 85
      ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
      : usagePercentage >= 65
      ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
      : "text-cyan-400 bg-cyan-500/10 border-cyan-500/30";

  const statusDot =
    usagePercentage >= 85
      ? "bg-rose-500 animate-pulse"
      : usagePercentage >= 65
      ? "bg-amber-400"
      : "bg-cyan-400";

  return (
    <div className="relative inline-block" ref={popoverRef}>
      {/* Top Bar Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-all cursor-pointer shadow-2xs hover:scale-102 active:scale-98 ${statusColor}`}
        title="View Context Window Token Breakdown"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
        <Database className="w-3.5 h-3.5 opacity-80" />
        <span className="font-mono text-[11px] font-semibold">
          {formatTokenCount(totalUsedTokens)} / {formatTokenCount(totalMaxTokens)}
        </span>
        <span className="text-[10px] opacity-75 font-mono">({usagePercentage}%)</span>
      </button>

      {/* Floating Detailed Breakdown Popover */}
      {isOpen && (
        <div className="fixed sm:absolute right-2 sm:right-0 top-14 sm:top-full mt-2 w-[calc(100vw-1rem)] sm:w-84 max-w-sm rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-2xl shadow-black/50 z-50 p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--sidebar-border)]/60 pb-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              <div>
                <h4 className="text-xs font-bold text-[var(--foreground)]">Context Window Budget</h4>
                <p className="text-[10px] text-[var(--muted)] font-mono">
                  Limit: {totalMaxTokens.toLocaleString()} tokens
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Multi-segmented Progress Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--muted)]">Allocated Space</span>
              <span className="font-mono font-semibold text-[var(--foreground)]">
                {totalUsedTokens.toLocaleString()} / {totalMaxTokens.toLocaleString()} tokens
              </span>
            </div>
            <div className="w-full h-3 bg-[var(--sidebar-bg)] rounded-full overflow-hidden flex p-0.5 border border-[var(--sidebar-border)] gap-0.5">
              {systemPct > 0 && (
                <div
                  style={{ width: `${systemPct}%` }}
                  className="h-full bg-purple-500 rounded-xs transition-all duration-300"
                  title={`System Prompt: ${systemPromptTokens} tokens (${systemPct.toFixed(1)}%)`}
                />
              )}
              {ragPct > 0 && (
                <div
                  style={{ width: `${ragPct}%` }}
                  className="h-full bg-blue-500 rounded-xs transition-all duration-300"
                  title={`Project Knowledge (RAG): ${ragTokens} tokens (${ragPct.toFixed(1)}%)`}
                />
              )}
              {historyPct > 0 && (
                <div
                  style={{ width: `${historyPct}%` }}
                  className="h-full bg-emerald-500 rounded-xs transition-all duration-300"
                  title={`Chat History: ${historyTokens} tokens (${historyPct.toFixed(1)}%)`}
                />
              )}
              {inputPct > 0 && (
                <div
                  style={{ width: `${inputPct}%` }}
                  className="h-full bg-amber-400 rounded-xs transition-all duration-300"
                  title={`Current Draft: ${inputTokens} tokens (${inputPct.toFixed(1)}%)`}
                />
              )}
            </div>
          </div>

          {/* Segments Breakdown Legend */}
          <div className="space-y-1.5 text-xs">
            {/* System Prompt */}
            <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-[var(--sidebar-hover)]/40 transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 flex-shrink-0" />
                <span className="text-[var(--foreground)] font-medium">System Prompt</span>
              </div>
              <span className="font-mono text-[11px] text-[var(--muted)]">
                {systemPromptTokens.toLocaleString()} tokens
              </span>
            </div>

            {/* RAG Knowledge */}
            <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-[var(--sidebar-hover)]/40 transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                <span className="text-[var(--foreground)] font-medium">Knowledge & RAG</span>
              </div>
              <span className="font-mono text-[11px] text-[var(--muted)]">
                {ragTokens.toLocaleString()} tokens
              </span>
            </div>

            {/* Chat History */}
            <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-[var(--sidebar-hover)]/40 transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="text-[var(--foreground)] font-medium">Chat History</span>
                {historyWasTrimmed && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 font-mono">
                    budget trimmed
                  </span>
                )}
              </div>
              <span className="font-mono text-[11px] text-[var(--muted)]">
                {historyTokens.toLocaleString()} tokens
              </span>
            </div>

            {/* Draft Input */}
            {inputTokens > 0 && (
              <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-[var(--sidebar-hover)]/40 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
                  <span className="text-[var(--foreground)] font-medium">Current Draft</span>
                </div>
                <span className="font-mono text-[11px] text-[var(--muted)]">
                  {inputTokens.toLocaleString()} tokens
                </span>
              </div>
            )}

            {/* Remaining Space */}
            <div className="flex items-center justify-between p-1.5 rounded-xl bg-[var(--sidebar-bg)]/50 border border-[var(--sidebar-border)]/40">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full border border-dashed border-[var(--muted)] flex-shrink-0" />
                <span className="text-[var(--foreground)] font-semibold">Available for Reply</span>
              </div>
              <span className="font-mono text-[11px] font-bold text-emerald-400">
                {remainingTokens.toLocaleString()} tokens
              </span>
            </div>
          </div>

          {/* Quick Preset Selector Buttons */}
          {onSelectNumCtx && (
            <div className="pt-1 border-t border-[var(--sidebar-border)]/40 space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold block">
                Quick Resize Context Window
              </span>
              <div className="grid grid-cols-4 gap-1">
                {[4096, 8192, 16384, 32768].map((size) => (
                  <button
                    key={size}
                    onClick={() => {
                      onSelectNumCtx(size);
                    }}
                    className={`py-1 text-[11px] font-mono rounded-lg border transition-all cursor-pointer ${
                      totalMaxTokens === size
                        ? "bg-cyan-500 text-white border-cyan-400 font-bold"
                        : "bg-[var(--sidebar-bg)] text-[var(--muted)] hover:text-[var(--foreground)] border-[var(--card-border)]"
                    }`}
                  >
                    {size / 1024}K
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Parameters Drawer link */}
          {onOpenParameters && (
            <div className="pt-1">
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenParameters();
                }}
                className="w-full py-1.5 px-2 rounded-xl text-xs font-semibold text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 border border-cyan-500/20 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>Adjust Parameters & Guardrails</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
