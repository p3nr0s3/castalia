"use client";

import React from "react";
import { X, Faders as Sliders, Sparkle as Sparkles, ArrowCounterClockwise as RotateCcw, Database } from "@phosphor-icons/react";
import { PersonaPreset } from "@/lib/types";
import { ContextBreakdown } from "@/lib/contextVisualizer";

interface ParametersDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompt: string;
  setSystemPrompt: (val: string) => void;
  temperature: number;
  setTemperature: (val: number) => void;
  topP: number;
  setTopP: (val: number) => void;
  numCtx?: number;
  setNumCtx?: (val: number) => void;
  personas: PersonaPreset[];
  minP?: number;
  setMinP?: (val: number) => void;
  onSelectPersona: (persona: PersonaPreset) => void;
  onReset: () => void;
  contextBreakdown?: ContextBreakdown;
}

export const ParametersDrawer: React.FC<ParametersDrawerProps> = ({
  isOpen,
  onClose,
  systemPrompt,
  setSystemPrompt,
  temperature,
  setTemperature,
  topP,
  setTopP,
  minP,
  setMinP,
  numCtx,
  setNumCtx,
  personas,
  onSelectPersona,
  onReset,
  contextBreakdown,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div className="w-screen max-w-full sm:max-w-md bg-[var(--card-bg)] text-[var(--foreground)] border-l border-[var(--sidebar-border)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="px-5 py-4 border-b border-[var(--sidebar-border)] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-blue-500" />
              <h2 className="text-sm sm:text-base font-semibold">
                Session Parameters
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 touch-scroll">
            {/* Persona Preset Buttons */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">
                Quick Persona Presets
              </label>
              <div className="grid grid-cols-1 gap-2">
                {personas.map((persona) => (
                  <button
                    key={persona.id}
                    onClick={() => onSelectPersona(persona)}
                    className="w-full text-left p-2.5 sm:p-3 rounded-xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] hover:border-blue-500/50 hover:bg-[var(--sidebar-hover)] transition-all text-xs active:scale-[0.99] cursor-pointer"
                  >
                    <div className="flex items-center justify-between font-medium">
                      <span className="flex items-center gap-1.5 font-semibold text-[var(--foreground)]">
                        <Sparkles className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                        {persona.name}
                      </span>
                    </div>
                    <p className="text-[var(--muted)] mt-1 line-clamp-2 text-[11px]">
                      {persona.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* System Prompt Textarea */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Custom System Prompt
                </label>
              </div>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={3}
                placeholder="Instruct the model on its role..."
                className="w-full p-3 text-xs sm:text-sm rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
              />
            </div>

            {/* Temperature Slider */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1">
                  Temperature
                </label>
                <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded">
                  {temperature.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-2.5 bg-[var(--sidebar-active)] rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-[10px] text-[var(--muted)] mt-1">
                <span>0.0 (Factual)</span>
                <span>2.0 (Creative)</span>
              </div>
            </div>

            {/* Top-P Slider */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Top-P (Nucleus Sampling)
                </label>
                <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded">
                  {topP.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={topP}
                onChange={(e) => setTopP(parseFloat(e.target.value))}
                className="w-full h-2.5 bg-[var(--sidebar-active)] rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-[10px] text-[var(--muted)] mt-1">
                <span>0.0 (Focused)</span>
                <span>1.0 (Diverse)</span>
              </div>
            </div>

            {/* Min-P Slider */}
            {minP !== undefined && setMinP && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1">
                    Min-P (Dynamic Truncation)
                  </label>
                  <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">
                    {minP.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={minP}
                  onChange={(e) => setMinP(parseFloat(e.target.value))}
                  className="w-full h-2.5 bg-[var(--sidebar-active)] rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] text-[var(--muted)] mt-1">
                  <span>0.00 (Off)</span>
                  <span>0.05 (Recommended)</span>
                  <span>0.20 (Strict)</span>
                </div>
              </div>
            )}

            {/* Context Window Size (num_ctx) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Context Window (Tokens)</span>
                </label>
                <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/15 px-2 py-0.5 rounded-lg border border-cyan-500/30">
                  {numCtx ? (numCtx >= 1024 ? `${numCtx / 1024}K` : numCtx) : "16K"}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 pt-1">
                {[4096, 8192, 16384, 32768, 65536].map((ctx) => {
                  const isCur = (numCtx ?? 16384) === ctx;
                  return (
                    <button
                      key={ctx}
                      type="button"
                      onClick={() => setNumCtx && setNumCtx(ctx)}
                      className={`py-1.5 px-1 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer border text-center ${
                        isCur
                          ? "bg-cyan-500 text-white border-cyan-400 shadow-sm"
                          : "bg-[var(--sidebar-bg)] text-[var(--muted)] hover:text-[var(--foreground)] border-[var(--card-border)] hover:border-cyan-500/50"
                      }`}
                    >
                      {ctx / 1024}K
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-[var(--muted)] mt-1.5">
                <span>4K (Light)</span>
                <span className="text-cyan-400 font-medium">16K (Optimal)</span>
                <span>64K (Max)</span>
              </div>

              {/* Live Context Breakdown */}
              {contextBreakdown && (
                <div className="mt-3 p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--muted)] font-medium">Live Budget Breakdown</span>
                    <span className="font-mono text-cyan-400 font-semibold">
                      {contextBreakdown.totalUsedTokens.toLocaleString()} / {contextBreakdown.totalMaxTokens.toLocaleString()} ({contextBreakdown.usagePercentage}%)
                    </span>
                  </div>

                  {/* Multi-segmented bar */}
                  <div className="w-full h-2.5 bg-[var(--card-bg)] rounded-full overflow-hidden flex border border-[var(--card-border)] gap-0.5 p-0.5">
                    {contextBreakdown.systemPromptTokens > 0 && (
                      <div
                        style={{ width: `${Math.max(0, (contextBreakdown.systemPromptTokens / contextBreakdown.totalMaxTokens) * 100)}%` }}
                        className="h-full bg-purple-500 rounded-xs"
                        title={`System Prompt: ${contextBreakdown.systemPromptTokens} tokens`}
                      />
                    )}
                    {contextBreakdown.ragTokens > 0 && (
                      <div
                        style={{ width: `${Math.max(0, (contextBreakdown.ragTokens / contextBreakdown.totalMaxTokens) * 100)}%` }}
                        className="h-full bg-blue-500 rounded-xs"
                        title={`RAG Knowledge: ${contextBreakdown.ragTokens} tokens`}
                      />
                    )}
                    {contextBreakdown.historyTokens > 0 && (
                      <div
                        style={{ width: `${Math.max(0, (contextBreakdown.historyTokens / contextBreakdown.totalMaxTokens) * 100)}%` }}
                        className="h-full bg-emerald-500 rounded-xs"
                        title={`History: ${contextBreakdown.historyTokens} tokens`}
                      />
                    )}
                    {contextBreakdown.inputTokens > 0 && (
                      <div
                        style={{ width: `${Math.max(0, (contextBreakdown.inputTokens / contextBreakdown.totalMaxTokens) * 100)}%` }}
                        className="h-full bg-amber-400 rounded-xs"
                        title={`Draft Input: ${contextBreakdown.inputTokens} tokens`}
                      />
                    )}
                  </div>

                  {/* Micro Legend */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10px] text-[var(--muted)] font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-500" />
                      <span>System: {contextBreakdown.systemPromptTokens}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span>RAG: {contextBreakdown.ragTokens}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>History: {contextBreakdown.historyTokens}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full border border-dashed border-[var(--muted)]" />
                      <span className="text-emerald-400 font-semibold">Free: {contextBreakdown.remainingTokens}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] flex items-center justify-between flex-shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] px-3 py-2 rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
