"use client";

import React, { useState } from "react";
import {
  X,
  Bot,
  Clock,
  Globe,
  Sliders,
  Folder,
  Sparkles,
  Check,
  Play,
  Calendar,
  Zap,
} from "lucide-react";
import { AgentTask, AgentScheduleType, OllamaModel, Project } from "@/lib/types";
import { AGENT_PRESET_TEMPLATES, calculateNextRun } from "@/lib/agentEngine";

interface AgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent?: AgentTask | null;
  onSaveAgent: (agent: AgentTask) => void;
  onDeleteAgent?: (agentId: string) => void;
  models: OllamaModel[];
  projects: Project[];
}

export const AgentModal: React.FC<AgentModalProps> = ({
  isOpen,
  onClose,
  agent,
  onSaveAgent,
  onDeleteAgent,
  models,
  projects,
}) => {
  const isEditing = !!agent;

  const [name, setName] = useState(agent?.name || "");
  const [description, setDescription] = useState(agent?.description || "");
  const [prompt, setPrompt] = useState(
    agent?.prompt ||
      "Search the web for today's top artificial intelligence breakthroughs and summarize key takeaways."
  );
  const [model, setModel] = useState(agent?.model || models[0]?.name || "");
  const [temperature, setTemperature] = useState(agent?.temperature ?? 0.7);
  const [webSearch, setWebSearch] = useState(agent?.webSearch ?? true);
  const [scheduleType, setScheduleType] = useState<AgentScheduleType>(
    agent?.scheduleType || "daily"
  );
  const [intervalMinutes, setIntervalMinutes] = useState(agent?.intervalMinutes || 360);
  const [dailyTime, setDailyTime] = useState(agent?.dailyTime || "08:00");
  const [targetProjectId, setTargetProjectId] = useState(agent?.targetProjectId || "");
  const [enabled, setEnabled] = useState(agent?.enabled ?? true);

  if (!isOpen) return null;

  const handleApplyTemplate = (tmpl: (typeof AGENT_PRESET_TEMPLATES)[0]) => {
    setName(tmpl.name);
    setDescription(tmpl.description);
    setPrompt(tmpl.prompt);
    setWebSearch(tmpl.webSearch);
    setScheduleType(tmpl.scheduleType);
    if (tmpl.intervalMinutes) setIntervalMinutes(tmpl.intervalMinutes);
    if (tmpl.dailyTime) setDailyTime(tmpl.dailyTime);
    if (tmpl.temperature) setTemperature(tmpl.temperature);
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert("Please enter a name for the AI Agent.");
      return;
    }
    if (!prompt.trim()) {
      alert("Please enter a prompt or instruction for the AI Agent.");
      return;
    }

    const newTask: AgentTask = {
      id: agent?.id || `agent_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      prompt: prompt.trim(),
      model: model || (models[0]?.name ?? ""),
      temperature,
      webSearch,
      scheduleType,
      intervalMinutes: scheduleType === "interval" ? intervalMinutes : undefined,
      dailyTime: scheduleType === "daily" ? dailyTime : undefined,
      targetProjectId: targetProjectId || undefined,
      enabled,
      status: agent?.status || "idle",
      lastRun: agent?.lastRun,
      runCount: agent?.runCount || 0,
      logs: agent?.logs || [],
      createdAt: agent?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    newTask.nextRun = calculateNextRun(newTask);

    onSaveAgent(newTask);
    onClose();
  };

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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Bot className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-semibold">
                {isEditing ? `Edit Agent: ${agent.name}` : "Create Autonomous AI Agent"}
              </h2>
              <p className="text-[11px] text-[var(--muted)]">
                Automate scheduled workflows, web research, and report generation.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 sm:space-y-5 flex-1 overflow-y-auto touch-scroll">
          {/* Quick Preset Templates (if creating new) */}
          {!isEditing && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                Quick-Start Agent Templates
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {AGENT_PRESET_TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyTemplate(tmpl)}
                    className="p-2.5 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] hover:border-purple-500/50 hover:bg-[var(--sidebar-hover)] text-left transition-all group active:scale-[0.98] cursor-pointer"
                  >
                    <div className="font-semibold text-xs text-[var(--foreground)] group-hover:text-purple-400 truncate">
                      {tmpl.name}
                    </div>
                    <div className="text-[11px] text-[var(--muted)] line-clamp-1 mt-0.5">
                      {tmpl.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Agent Name & Enabled Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                Agent Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Daily Tech Digest, Market Watcher..."
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-2 focus:ring-purple-500 focus:outline-none"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                Status
              </label>
              <button
                type="button"
                onClick={() => setEnabled(!enabled)}
                className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                  enabled
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                    : "bg-[var(--sidebar-bg)] border-[var(--card-border)] text-[var(--muted)]"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    enabled ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                  }`}
                />
                {enabled ? "Active / Running" : "Paused"}
              </button>
            </div>
          </div>

          {/* Prompt / Mission Instruction */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5 flex items-center justify-between">
              <span>Agent Prompt / Mission *</span>
              <span className="text-[10px] text-[var(--muted)] font-normal">
                What should this agent do on every trigger?
              </span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Describe the exact task the agent should perform. e.g. Search latest news, summarize, analyze data..."
              className="w-full p-3 text-xs sm:text-sm rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-purple-500 focus:outline-none leading-relaxed"
            />
          </div>

          {/* Schedule Settings */}
          <div className="p-3.5 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-purple-400" />
              Execution Schedule
            </label>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setScheduleType("daily")}
                className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                  scheduleType === "daily"
                    ? "bg-purple-600 text-white font-semibold shadow-xs border-purple-500"
                    : "border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                Daily at Time
              </button>
              <button
                type="button"
                onClick={() => setScheduleType("interval")}
                className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                  scheduleType === "interval"
                    ? "bg-purple-600 text-white font-semibold shadow-xs border-purple-500"
                    : "border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                Repeating Interval
              </button>
              <button
                type="button"
                onClick={() => setScheduleType("manual")}
                className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                  scheduleType === "manual"
                    ? "bg-purple-600 text-white font-semibold shadow-xs border-purple-500"
                    : "border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                Manual (On-Demand)
              </button>
            </div>

            {/* Schedule Details */}
            {scheduleType === "daily" && (
              <div className="flex items-center gap-3 pt-1">
                <span className="text-xs text-[var(--muted)]">Run every day at:</span>
                <input
                  type="time"
                  value={dailyTime}
                  onChange={(e) => setDailyTime(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-xs font-mono text-[var(--foreground)] focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>
            )}

            {scheduleType === "interval" && (
              <div className="flex items-center gap-3 pt-1">
                <span className="text-xs text-[var(--muted)]">Repeat every:</span>
                <select
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                  className="px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-xs text-[var(--foreground)] focus:ring-2 focus:ring-purple-500 focus:outline-none"
                >
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>1 Hour</option>
                  <option value={180}>3 Hours</option>
                  <option value={360}>6 Hours</option>
                  <option value={720}>12 Hours</option>
                  <option value={1440}>24 Hours</option>
                </select>
              </div>
            )}
          </div>

          {/* Model & Web Search Tools */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                Ollama Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-xs sm:text-sm text-[var(--foreground)] focus:ring-2 focus:ring-purple-500 focus:outline-none"
              >
                {models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Project */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                Save Output to Project (Optional)
              </label>
              <select
                value={targetProjectId}
                onChange={(e) => setTargetProjectId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-xs sm:text-sm text-[var(--foreground)] focus:ring-2 focus:ring-purple-500 focus:outline-none"
              >
                <option value="">General Chats (No Project)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    📁 {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Autonomous Tools Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)]">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-400" />
              <div>
                <span className="text-xs font-semibold text-[var(--foreground)] block">
                  Autonomous Web Search (SearXNG)
                </span>
                <span className="text-[11px] text-[var(--muted)]">
                  Allows the agent to search the live web for real-time information before generating.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setWebSearch(!webSearch)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                webSearch ? "bg-blue-600" : "bg-slate-700"
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  webSearch ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] flex items-center justify-between flex-shrink-0 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          {isEditing && onDeleteAgent ? (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Are you sure you want to delete agent "${agent.name}"?`)) {
                  onDeleteAgent(agent.id);
                  onClose();
                }
              }}
              className="px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
            >
              Delete Agent
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--sidebar-hover)] rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl shadow-md transition-colors cursor-pointer"
            >
              {isEditing ? "Save Changes" : "Create Agent"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
