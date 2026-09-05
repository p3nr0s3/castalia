"use client";

import React from "react";
import {
  X,
  Bot,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Zap,
  Globe,
  Sliders,
  Calendar,
} from "lucide-react";
import { AgentTask } from "@/lib/types";

interface AgentLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: AgentTask | null;
  onRunNow: (agentId: string) => void;
  onOpenConversation: (conversationId: string) => void;
  onEditAgent: (agent: AgentTask) => void;
  isRunning?: boolean;
}

export const AgentLogsModal: React.FC<AgentLogsModalProps> = ({
  isOpen,
  onClose,
  agent,
  onRunNow,
  onOpenConversation,
  onEditAgent,
  isRunning = false,
}) => {
  if (!isOpen || !agent) return null;

  const logs = agent.logs || [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl bg-[var(--card-bg)] text-[var(--foreground)] rounded-t-3xl sm:rounded-2xl border-t sm:border border-[var(--card-border)] shadow-2xl overflow-hidden flex flex-col z-10 max-h-[92dvh] sm:max-h-[88vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--sidebar-border)] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Bot className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-semibold">{agent.name}</h2>
              <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                <span>Model: {agent.model}</span>
                {agent.webSearch && (
                  <span className="flex items-center gap-1 text-blue-400">
                    • <Globe className="w-3 h-3" /> Web Search
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onEditAgent(agent)}
              className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
              title="Edit Agent"
            >
              <Sliders className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Info & Trigger Banner */}
        <div className="p-4 bg-[var(--sidebar-bg)] border-b border-[var(--sidebar-border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-[var(--foreground)]">Schedule:</span>
              <span className="text-[var(--muted)]">
                {agent.scheduleType === "daily"
                  ? `Daily at ${agent.dailyTime || "08:00"}`
                  : agent.scheduleType === "interval"
                  ? `Every ${agent.intervalMinutes} mins`
                  : "Manual (On-Demand)"}
              </span>
              {agent.enabled ? (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Active
                </span>
              ) : (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-500/15 text-slate-400 border border-slate-500/30">
                  Paused
                </span>
              )}
            </div>

            {agent.nextRun && agent.enabled && (
              <div className="flex items-center gap-1 text-[11px] text-[var(--muted)]">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span>Next Scheduled Run: {new Date(agent.nextRun).toLocaleString()}</span>
              </div>
            )}
          </div>

          <button
            onClick={() => onRunNow(agent.id)}
            disabled={isRunning}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${isRunning ? "animate-spin" : ""}`} />
            <span>{isRunning ? "Executing Agent..." : "Run Agent Now"}</span>
          </button>
        </div>

        {/* Prompt Mission Box */}
        <div className="px-5 pt-3 pb-1">
          <div className="p-3 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs">
            <span className="font-semibold text-[var(--muted)] block mb-0.5">Goal / Prompt:</span>
            <p className="text-[var(--foreground)] italic leading-relaxed">{agent.prompt}</p>
          </div>
        </div>

        {/* Run History Logs */}
        <div className="p-5 flex-1 overflow-y-auto space-y-3 touch-scroll">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            <span>Execution History ({logs.length})</span>
            <span>Total Runs: {agent.runCount || 0}</span>
          </div>

          {logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--muted)] border border-dashed border-[var(--card-border)] rounded-2xl">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-30 text-purple-400" />
              <p className="font-medium text-[var(--foreground)]">No executions recorded yet</p>
              <p className="text-[11px] mt-0.5">Click &quot;Run Agent Now&quot; to test your agent immediately.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {log.status === "success" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )}
                      <span className="font-semibold text-[var(--foreground)]">
                        {new Date(log.runAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-[var(--muted)] font-mono">
                      {log.durationSeconds !== undefined && <span>{log.durationSeconds}s</span>}
                      {log.tokensGenerated ? <span>• {log.tokensGenerated} tokens</span> : null}
                    </div>
                  </div>

                  <p className="text-[11px] text-[var(--muted)] line-clamp-2">{log.summary}</p>

                  {log.conversationId && (
                    <div className="pt-1 flex justify-end">
                      <button
                        onClick={() => {
                          if (log.conversationId) onOpenConversation(log.conversationId);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors cursor-pointer"
                      >
                        <span>Open Generated Chat Report</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
