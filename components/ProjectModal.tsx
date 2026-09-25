"use client";

import React, { useState, useRef, useEffect } from "react";
import { X, FolderPlus, Folder, FileText, Upload, Trash as Trash2, Faders as Sliders, Sparkle as Sparkles, Check, Plus, Brain, Lightning as Zap, MagicWand as Wand2, Hash, Prohibit as Ban, Eye, EyeSlash, Globe, CircleNotch } from "@phosphor-icons/react";
import { Project, ProjectFile, OllamaModel, ThinkingMode } from "@/lib/types";
import { formatBytes } from "@/lib/ollama";
import { processSelectedFiles } from "@/lib/fileUtils";
import { CLOUD_MODEL_PRESETS } from "@/lib/constants";
import { estimateTokens, chunkDocument, getCachedFileChunks } from "@/lib/rag";
import { apiFetch } from "@/lib/apiClient";

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project?: Project | null;
  onSaveProject: (project: Project) => void;
  onDeleteProject?: (projectId: string) => void;
  models: OllamaModel[];
  initialTab?: "general" | "parameters" | "knowledge";
}

const PROJECT_COLORS = [
  { id: "blue", bg: "bg-blue-500", border: "border-blue-500", text: "text-blue-400" },
  { id: "emerald", bg: "bg-emerald-500", border: "border-emerald-500", text: "text-emerald-400" },
  { id: "purple", bg: "bg-purple-500", border: "border-purple-500", text: "text-purple-400" },
  { id: "amber", bg: "bg-amber-500", border: "border-amber-500", text: "text-amber-400" },
  { id: "rose", bg: "bg-rose-500", border: "border-rose-500", text: "text-rose-400" },
  { id: "cyan", bg: "bg-cyan-500", border: "border-cyan-500", text: "text-cyan-400" },
  { id: "indigo", bg: "bg-indigo-500", border: "border-indigo-500", text: "text-indigo-400" },
];

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  onClose,
  project,
  onSaveProject,
  onDeleteProject,
  models,
  initialTab = "general",
}) => {
  const isEditing = !!project;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(project?.name || "");
  const [description, setDescription] = useState(project?.description || "");
  const [color, setColor] = useState(project?.color || "blue");
  const [systemPrompt, setSystemPrompt] = useState(
    project?.systemPrompt ||
      "You are a specialized AI assistant tailored specifically for this project. Use the attached project knowledge and guidelines below to provide precise, context-aware answers."
  );
  const [defaultModel, setDefaultModel] = useState(project?.defaultModel || "");
  const [temperature, setTemperature] = useState(project?.temperature ?? 0.7);
  const [topP, setTopP] = useState(project?.topP ?? 0.9);
  const [topK, setTopK] = useState(project?.topK ?? 40);
  const [numCtx, setNumCtx] = useState(project?.numCtx ?? 16384);
  const [numPredict, setNumPredict] = useState(project?.numPredict ?? -1);
  const [repeatPenalty, setRepeatPenalty] = useState(project?.repeatPenalty ?? 1.1);
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>(project?.thinkingMode ?? "default");
  const [seed, setSeed] = useState<string>(project?.seed !== undefined ? String(project?.seed) : "");
  const [stopSequences, setStopSequences] = useState<string>(
    project?.stopSequences ? project.stopSequences.join(", ") : ""
  );
  const [ragChunkSizeChars, setRagChunkSizeChars] = useState(project?.ragChunkSizeChars ?? 1800);
  const [ragChunkOverlapChars, setRagChunkOverlapChars] = useState(project?.ragChunkOverlapChars ?? 200);
  const [ragTopK, setRagTopK] = useState(project?.ragTopK ?? 8);
  const [ragSemanticWeight, setRagSemanticWeight] = useState(project?.ragSemanticWeight ?? 0.55);
  const [ragStitchChunks, setRagStitchChunks] = useState<boolean>(project?.ragStitchChunks ?? true);
  const [ragHydeEnabled, setRagHydeEnabled] = useState<boolean>(Boolean(project?.ragHydeEnabled));
  const [ragHydeModel, setRagHydeModel] = useState<string>(project?.ragHydeModel ?? "");
  const [ragRerankEnabled, setRagRerankEnabled] = useState<boolean>(project?.ragRerankEnabled ?? true);
  const [ragRerankModel, setRagRerankModel] = useState<string>(project?.ragRerankModel ?? "");
  const [ragRerankMinScore, setRagRerankMinScore] = useState<number>(project?.ragRerankMinScore ?? 0.0);
  const [watchedFolderPath, setWatchedFolderPath] = useState(project?.watchedFolderPath ?? "");
  const [watchedFolderEnabled, setWatchedFolderEnabled] = useState(Boolean(project?.watchedFolderEnabled));
  const [watcherStatus, setWatcherStatus] = useState<"idle" | "starting" | "stopping" | "error">("idle");
  const [watcherError, setWatcherError] = useState<string | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>(project?.files || []);
  const [urlToIngest, setUrlToIngest] = useState("");
  const [isIngestingUrl, setIsIngestingUrl] = useState(false);
  const [urlIngestError, setUrlIngestError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"general" | "parameters" | "knowledge">(initialTab);

  // Sync state whenever modal opens or active project changes
  useEffect(() => {
    if (isOpen) {
      if (project) {
        setName(project.name || "");
        setDescription(project.description || "");
        setColor(project.color || "blue");
        setSystemPrompt(
          project.systemPrompt ||
            "You are a specialized AI assistant tailored specifically for this project. Use the attached project knowledge and guidelines below to provide precise, context-aware answers."
        );
        setDefaultModel(project.defaultModel || "");
        setTemperature(project.temperature ?? 0.7);
        setTopP(project.topP ?? 0.9);
        setTopK(project.topK ?? 40);
        setNumCtx(project.numCtx ?? 16384);
        setNumPredict(project.numPredict ?? -1);
        setRepeatPenalty(project.repeatPenalty ?? 1.1);
        setThinkingMode(project.thinkingMode ?? "default");
        setSeed(project.seed !== undefined ? String(project.seed) : "");
        setStopSequences(project.stopSequences ? project.stopSequences.join(", ") : "");
        setRagChunkSizeChars(project.ragChunkSizeChars ?? 1800);
        setRagChunkOverlapChars(project.ragChunkOverlapChars ?? 200);
        setRagTopK(project.ragTopK ?? 8);
        setRagSemanticWeight(project.ragSemanticWeight ?? 0.55);
        setRagStitchChunks(project.ragStitchChunks ?? true);
        setRagHydeEnabled(Boolean(project.ragHydeEnabled));
        setRagHydeModel(project.ragHydeModel ?? "");
        setRagRerankEnabled(project.ragRerankEnabled ?? true);
        setRagRerankModel(project.ragRerankModel ?? "");
        setRagRerankMinScore(project.ragRerankMinScore ?? 0.0);
        setWatchedFolderPath(project.watchedFolderPath ?? "");
        setWatchedFolderEnabled(Boolean(project.watchedFolderEnabled));
        setWatcherError(null);
        setUrlToIngest("");
        setIsIngestingUrl(false);
        setUrlIngestError(null);
        setFiles(project.files || []);
      } else {
        setName("");
        setDescription("");
        setColor("blue");
        setSystemPrompt(
          "You are a specialized AI assistant tailored specifically for this project. Use the attached project knowledge and guidelines below to provide precise, context-aware answers."
        );
        setDefaultModel("");
        setTemperature(0.7);
        setTopP(0.9);
        setTopK(40);
        setNumCtx(16384);
        setNumPredict(-1);
        setRepeatPenalty(1.1);
        setThinkingMode("default");
        setSeed("");
        setStopSequences("");
        setRagChunkSizeChars(1800);
        setRagChunkOverlapChars(200);
        setRagTopK(8);
        setRagSemanticWeight(0.55);
        setRagStitchChunks(false);
        setRagHydeEnabled(false);
        setRagHydeModel("");
        setRagRerankEnabled(false);
        setRagRerankModel("");
        setRagRerankMinScore(0.0);
        setWatchedFolderPath("");
        setWatchedFolderEnabled(false);
        setWatcherError(null);
        setUrlToIngest("");
        setIsIngestingUrl(false);
        setUrlIngestError(null);
        setFiles([]);
      }
      if (initialTab) {
        setActiveTab(initialTab);
      }
    }
  }, [isOpen, project, initialTab]);

  const applyPreset = (preset: "architect" | "reasoner" | "creative" | "balanced" | "analyst") => {
    if (preset === "architect") {
      setTemperature(0.2);
      setTopP(0.8);
      setTopK(40);
      setNumCtx(8192);
      setRepeatPenalty(1.15);
      setThinkingMode("nothink");
    } else if (preset === "reasoner") {
      setTemperature(0.6);
      setTopP(0.95);
      setTopK(50);
      setNumCtx(16384);
      setRepeatPenalty(1.1);
      setThinkingMode("think");
    } else if (preset === "creative") {
      setTemperature(0.95);
      setTopP(0.95);
      setTopK(80);
      setNumCtx(16384);
      setRepeatPenalty(1.05);
      setThinkingMode("default");
    } else if (preset === "analyst") {
      setTemperature(0.1);
      setTopP(0.5);
      setTopK(20);
      setNumCtx(16384);
      setRepeatPenalty(1.2);
      setThinkingMode("default");
    } else {
      setTemperature(0.7);
      setTopP(0.9);
      setTopK(40);
      setNumCtx(16384);
      setRepeatPenalty(1.1);
      setThinkingMode("default");
    }
  };

  if (!isOpen) return null;

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const processed = await processSelectedFiles(selectedFiles);
    const newProjectFiles: ProjectFile[] = processed.map((p) => ({
      id: p.id,
      name: p.name,
      size: p.size,
      type: p.type,
      textContent: p.textContent || `[Base64 Media: ${p.name}]`,
      uploadedAt: Date.now(),
    }));

    setFiles((prev) => [...prev, ...newProjectFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleIngestUrl = async () => {
    const trimmed = urlToIngest.trim();
    if (!trimmed) return;
    setIsIngestingUrl(true);
    setUrlIngestError(null);
    try {
      const res = await apiFetch("/api/projects/ingest-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.file) {
        setUrlIngestError(data.error || "Failed to ingest URL.");
        return;
      }
      setFiles((prev) => [...prev, data.file]);
      setUrlToIngest("");
    } catch (err: any) {
      setUrlIngestError(err.message || "Failed to ingest URL.");
    } finally {
      setIsIngestingUrl(false);
    }
  };

  const toggleWatcher = async () => {
    if (!project?.id) {
      alert("Save the project first — a project must exist before its folder can be watched.");
      return;
    }

    setWatcherError(null);

    if (watchedFolderEnabled) {
      setWatcherStatus("stopping");
      try {
        await apiFetch("/api/projects/watcher", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: project.id, action: "stop" }),
        });
        setWatchedFolderEnabled(false);
      } catch (err: any) {
        setWatcherError(err.message || "Failed to stop the watcher.");
      } finally {
        setWatcherStatus("idle");
      }
      return;
    }

    if (!watchedFolderPath.trim()) {
      setWatcherError("Enter a folder path first.");
      return;
    }

    setWatcherStatus("starting");
    try {
      const res = await apiFetch("/api/projects/watcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, action: "start", folderPath: watchedFolderPath.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWatcherError(data.error || "Failed to start the watcher.");
        setWatcherStatus("error");
        return;
      }
      setWatchedFolderEnabled(true);
      setWatcherStatus("idle");
    } catch (err: any) {
      setWatcherError(err.message || "Failed to start the watcher.");
      setWatcherStatus("error");
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert("Please enter a project name.");
      return;
    }

    const savedProject: Project = {
      id: project?.id || `proj_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      color,
      systemPrompt: systemPrompt.trim(),
      defaultModel: defaultModel || undefined,
      temperature,
      topP,
      topK,
      numCtx,
      numPredict: numPredict > 0 ? numPredict : undefined,
      repeatPenalty,
      thinkingMode,
      seed: seed.trim() ? parseInt(seed.trim(), 10) : undefined,
      stopSequences: stopSequences.trim()
        ? stopSequences.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
      ragChunkSizeChars,
      ragChunkOverlapChars,
      ragTopK,
      ragSemanticWeight,
      ragStitchChunks,
      ragHydeEnabled,
      ragHydeModel: ragHydeModel.trim() || undefined,
      ragRerankEnabled,
      ragRerankModel: ragRerankModel.trim() || undefined,
      ragRerankMinScore: ragRerankMinScore > 0 ? ragRerankMinScore : undefined,
      watchedFolderPath: watchedFolderPath.trim() || undefined,
      watchedFolderEnabled,
      files,
      createdAt: project?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    onSaveProject(savedProject);
    onClose();
  };

  const totalKnowledgeBytes = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl bg-[var(--card-bg)] text-[var(--foreground)] rounded-t-3xl sm:rounded-2xl border-t sm:border border-[var(--card-border)] shadow-2xl overflow-hidden flex flex-col z-10 max-h-[92dvh] sm:max-h-[88vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--sidebar-border)] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-blue-500" />
            <h2 className="text-sm sm:text-base font-semibold">
              {isEditing ? `Edit Project: ${project.name}` : "Create New Claude-Style Project"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--sidebar-border)] px-5 gap-3 sm:gap-6 text-xs sm:text-sm font-medium flex-shrink-0 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab("general")}
            className={`py-2.5 sm:py-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "general"
                ? "border-blue-500 text-blue-500 font-semibold"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            General & Instructions
          </button>
          <button
            onClick={() => setActiveTab("parameters")}
            className={`py-2.5 sm:py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "parameters"
                ? "border-blue-500 text-blue-500 font-semibold"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Agent Parameters</span>
            <span className="px-1.5 py-0.2 rounded-full bg-[var(--sidebar-hover)] text-[10px] font-mono">
              T:{temperature.toFixed(2)}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("knowledge")}
            className={`py-2.5 sm:py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "knowledge"
                ? "border-blue-500 text-blue-500 font-semibold"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <span>Project Knowledge Base</span>
            <span className="px-1.5 py-0.2 rounded-full bg-[var(--sidebar-hover)] text-[10px] font-mono">
              {files.length}
            </span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 space-y-4 sm:space-y-5 flex-1 overflow-y-auto touch-scroll">
          {activeTab === "general" && (
            <>
              {/* Project Name & Color */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                  Project Name *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Codebase Architecture, Marketing Campaign, Research"
                    className="flex-1 px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                    autoFocus
                  />
                  {/* Color Selector */}
                  <div className="flex items-center gap-1.5 bg-[var(--sidebar-bg)] p-1 rounded-xl border border-[var(--card-border)] flex-shrink-0">
                    {PROJECT_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setColor(c.id)}
                        className={`w-5 h-5 rounded-full ${c.bg} transition-all cursor-pointer flex items-center justify-center ${
                          color === c.id ? "ring-2 ring-white scale-110" : "opacity-70 hover:opacity-100"
                        }`}
                        title={`Color: ${c.id}`}
                      >
                        {color === c.id && <Check className="w-3 h-3 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                  Short Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is the focus or purpose of this project?"
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Custom Instructions / System Prompt */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                    Custom Instructions for this Project
                  </label>
                </div>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={6}
                  placeholder="Define specific rules, coding conventions, tone, persona, or project goals that will apply to every chat inside this project..."
                  className="w-full p-3 text-xs sm:text-sm rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-blue-500 focus:outline-none leading-relaxed"
                />
                <p className="text-[11px] text-[var(--muted)] mt-1">
                  These instructions guide the LLM on every message sent within this project.
                </p>
              </div>
            </>
          )}

          {/* AGENT PARAMETERS TAB */}
          {activeTab === "parameters" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Presets Toolbar */}
              <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Quick Agent Presets</span>
                  </span>
                  <span className="text-[10px] text-[var(--muted)]">Click to autofill parameters</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: "architect", label: "Code Architect", color: "text-blue-400" },
                    { id: "reasoner", label: "Deep Reasoner", color: "text-purple-400" },
                    { id: "creative", label: "Creative Writer", color: "text-pink-400" },
                    { id: "balanced", label: "Balanced Assistant", color: "text-emerald-400" },
                    { id: "analyst", label: "Precise Analyst", color: "text-amber-400" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id as any)}
                      className="px-2.5 py-1 rounded-xl text-xs bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-[var(--foreground)] transition-colors cursor-pointer"
                    >
                      <span className={p.color}>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Model & Thinking Mode Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Model Selection */}
                <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1.5">
                  <label className="block text-xs font-bold text-[var(--foreground)]">
                    Default Project Model
                  </label>
                  <select
                    value={defaultModel}
                    onChange={(e) => setDefaultModel(e.target.value)}
                    className="w-full p-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">Use Global Workspace Default</option>
                    <optgroup label="Local Ollama Models">
                      {models.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Cloud AI Models">
                      {CLOUD_MODEL_PRESETS.map((cm) => (
                        <option key={cm.id} value={cm.id}>
                          {cm.name} ({cm.provider})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <p className="text-[10px] text-[var(--muted)]">
                    Model automatically selected whenever starting new chats in this project.
                  </p>
                </div>

                {/* Thinking Mode */}
                <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1.5">
                  <label className="block text-xs font-bold text-[var(--foreground)] flex items-center gap-1">
                    <Brain className="w-3.5 h-3.5 text-purple-400" />
                    <span>Deep Reasoning (Thinking Mode)</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                    {[
                      { id: "default", label: "Default", icon: Sparkles },
                      { id: "think", label: "Think ON", icon: Brain },
                      { id: "nothink", label: "Fast", icon: Zap },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setThinkingMode(mode.id as ThinkingMode)}
                        className={`py-1.5 px-2 rounded-xl text-xs font-medium border text-center transition-all cursor-pointer ${
                          thinkingMode === mode.id
                            ? "bg-purple-600 text-white border-purple-500 shadow-xs"
                            : "bg-[var(--card-bg)] text-[var(--muted)] border-[var(--card-border)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-[var(--muted)]">
                    Forces chain-of-thought analysis or high-speed concise answers.
                  </p>
                </div>
              </div>

              {/* Sliders Grid: Temperature, TopP, TopK, Repeat Penalty */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Temperature */}
                <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                    <span>Temperature</span>
                    <span className="font-mono text-emerald-400 bg-emerald-500/15 px-2 py-0.2 rounded text-[11px]">
                      {temperature.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2.0}
                    step={0.05}
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-[var(--sidebar-active)] rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--muted)]">
                    <span>0.0 (Precise/Code)</span>
                    <span>2.0 (Creative)</span>
                  </div>
                </div>

                {/* Top-P */}
                <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                    <span>Top-P (Nucleus Sampling)</span>
                    <span className="font-mono text-blue-400 bg-blue-500/15 px-2 py-0.2 rounded text-[11px]">
                      {topP.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={topP}
                    onChange={(e) => setTopP(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-[var(--sidebar-active)] rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--muted)]">
                    <span>0.1 (Focused)</span>
                    <span>1.0 (Full Pool)</span>
                  </div>
                </div>

                {/* Top-K */}
                <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                    <span>Top-K Sampling</span>
                    <span className="font-mono text-amber-400 bg-amber-500/15 px-2 py-0.2 rounded text-[11px]">
                      {topK}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={topK}
                    onChange={(e) => setTopK(parseInt(e.target.value, 10))}
                    className="w-full h-1.5 bg-[var(--sidebar-active)] rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--muted)]">
                    <span>1 (Top choice)</span>
                    <span>100 (Diverse)</span>
                  </div>
                </div>

                {/* Repeat Penalty */}
                <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                    <span>Repeat Penalty</span>
                    <span className="font-mono text-purple-400 bg-purple-500/15 px-2 py-0.2 rounded text-[11px]">
                      {repeatPenalty.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.0}
                    max={2.0}
                    step={0.05}
                    value={repeatPenalty}
                    onChange={(e) => setRepeatPenalty(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-[var(--sidebar-active)] rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--muted)]">
                    <span>1.0 (None)</span>
                    <span>2.0 (High Penalty)</span>
                  </div>
                </div>
              </div>

              {/* Context Window (num_ctx) & Max Output Tokens (num_predict) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Context Window */}
                <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                    <span>Context Window (num_ctx)</span>
                    <span className="font-mono text-cyan-400 text-xs">{numCtx.toLocaleString()} tokens</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[2048, 4096, 8192, 16384, 32768, 65536].map((ctx) => (
                      <button
                        key={ctx}
                        type="button"
                        onClick={() => setNumCtx(ctx)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition-colors cursor-pointer ${
                          numCtx === ctx
                            ? "bg-cyan-500 text-white font-bold"
                            : "bg-[var(--card-bg)] text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--card-border)]"
                        }`}
                      >
                        {ctx >= 1024 ? `${ctx / 1024}K` : ctx}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Max Predict Tokens */}
                <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                    <span>Max Tokens (num_predict)</span>
                    <span className="font-mono text-emerald-400 text-xs">
                      {numPredict === -1 ? "Auto (Infinite)" : `${numPredict.toLocaleString()}`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[-1, 1024, 2048, 4096, 8192].map((tok) => (
                      <button
                        key={tok}
                        type="button"
                        onClick={() => setNumPredict(tok)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition-colors cursor-pointer ${
                          numPredict === tok
                            ? "bg-emerald-500 text-white font-bold"
                            : "bg-[var(--card-bg)] text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--card-border)]"
                        }`}
                      >
                        {tok === -1 ? "Auto" : `${tok >= 1024 ? `${tok / 1024}K` : tok}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Seed & Stop Sequences */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Seed */}
                <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1">
                  <label className="block text-xs font-bold text-[var(--foreground)]">
                    Reproducibility Seed (Optional)
                  </label>
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    placeholder="e.g., 42 (Leave empty for random)"
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Stop Sequences */}
                <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1">
                  <label className="block text-xs font-bold text-[var(--foreground)]">
                    Stop Sequences (Comma separated)
                  </label>
                  <input
                    type="text"
                    value={stopSequences}
                    onChange={(e) => setStopSequences(e.target.value)}
                    placeholder="User:, Human:, ###"
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "knowledge" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                      <Folder className="w-4 h-4 text-blue-500" />
                      Persistent Project Knowledge Base
                    </h3>
                    <p className="text-[11px] text-[var(--muted)] mt-0.5">
                      Upload documents, API specs, schemas, or source files. All chats in this project will automatically reference this knowledge.
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-mono font-semibold text-cyan-400">
                      ~{files.reduce((acc, f) => acc + estimateTokens(f.textContent || ""), 0).toLocaleString()} tokens
                    </div>
                    <div className="text-[10px] font-mono text-[var(--muted)]">
                      {formatBytes(totalKnowledgeBytes)} total
                    </div>
                  </div>
                </div>

                {/* 16K Context Guard Notification Banner */}
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs">
                  <Zap className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    <strong className="font-semibold text-emerald-300">16K Context Guard Active:</strong> Large files are automatically split into semantic chunks and retrieved via in-memory BM25 ranker. Fully compatible with Gemma 4, Llama 3, and 16K models with zero GPU VRAM overhead.
                  </div>
                </div>

                {/* Advanced Retrieval Tuning — only matters once files exceed the token budget and chunking kicks in. Defaults match lib/rag.ts's previous hardcoded values, so leaving these untouched reproduces the old behavior exactly. */}
                <details className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2">
                  <summary className="text-xs font-semibold text-[var(--foreground)] cursor-pointer select-none">
                    Advanced Retrieval Tuning
                  </summary>
                  <div className="mt-3 space-y-3">
                    <p className="text-[10px] text-[var(--muted)] leading-relaxed">
                      Only applies once this project's files exceed the token budget and get chunked + ranked. Leave as-is unless retrieval quality needs adjusting for this specific project.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Chunk Size */}
                      <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                          <span>Chunk Size</span>
                          <span className="font-mono text-cyan-400 text-xs">{ragChunkSizeChars.toLocaleString()} chars</span>
                        </div>
                        <input
                          type="range"
                          min={500}
                          max={4000}
                          step={100}
                          value={ragChunkSizeChars}
                          onChange={(e) => setRagChunkSizeChars(parseInt(e.target.value, 10))}
                          className="w-full h-1.5 bg-[var(--card-bg)] rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        />
                        <div className="flex justify-between text-[10px] text-[var(--muted)]">
                          <span>500 (Precise)</span>
                          <span>4000 (Broad)</span>
                        </div>
                      </div>

                      {/* Chunk Overlap */}
                      <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                          <span>Chunk Overlap</span>
                          <span className="font-mono text-cyan-400 text-xs">{ragChunkOverlapChars.toLocaleString()} chars</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={Math.min(1000, Math.max(0, ragChunkSizeChars - 100))}
                          step={50}
                          value={Math.min(ragChunkOverlapChars, Math.max(0, ragChunkSizeChars - 100))}
                          onChange={(e) => setRagChunkOverlapChars(parseInt(e.target.value, 10))}
                          className="w-full h-1.5 bg-[var(--card-bg)] rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        />
                        <div className="flex justify-between text-[10px] text-[var(--muted)]">
                          <span>0 (None)</span>
                          <span>Prevents context loss at chunk boundaries</span>
                        </div>
                      </div>

                      {/* Retrieved Chunks (topK) */}
                      <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                          <span>Chunks Retrieved (topK)</span>
                          <span className="font-mono text-purple-400 text-xs">{ragTopK}</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={20}
                          step={1}
                          value={ragTopK}
                          onChange={(e) => setRagTopK(parseInt(e.target.value, 10))}
                          className="w-full h-1.5 bg-[var(--card-bg)] rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                        <div className="flex justify-between text-[10px] text-[var(--muted)]">
                          <span>2 (Focused)</span>
                          <span>20 (Comprehensive)</span>
                        </div>
                      </div>

                      {/* Semantic vs Keyword Blend — only meaningful when hybrid RAG (Settings > semanticRagEnabled) is on */}
                      <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                          <span>Semantic / Keyword Blend</span>
                          <span className="font-mono text-emerald-400 text-xs">
                            {Math.round(ragSemanticWeight * 100)}% / {Math.round((1 - ragSemanticWeight) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={ragSemanticWeight}
                          onChange={(e) => setRagSemanticWeight(parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-[var(--card-bg)] rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                        <div className="flex justify-between text-[10px] text-[var(--muted)]">
                          <span>Keyword (exact terms)</span>
                          <span>Semantic (meaning)</span>
                        </div>
                        <p className="text-[10px] text-[var(--muted)]">
                          Only applies when hybrid semantic RAG is enabled in Settings — otherwise pure keyword (BM25) ranking is used regardless of this slider.
                        </p>
                      </div>

                      {/* Adjacent Chunk Stitching */}
                      <div className="pt-2 border-t border-[var(--card-border)] space-y-2">
                        <label className="flex items-center justify-between cursor-pointer">
                          <div className="pr-4">
                            <span className="text-xs font-medium text-[var(--foreground)]">Stitch Adjacent Chunks</span>
                            <p className="text-[10px] text-[var(--muted)]">
                              Merges consecutive chunks from the same file into unified passages with boundary deduplication, eliminating fragmented code across chunk edges.
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            checked={ragStitchChunks}
                            onChange={(e) => setRagStitchChunks(e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-[var(--card-bg)] border-[var(--card-border)] cursor-pointer shrink-0"
                          />
                        </label>
                      </div>

                      {/* HyDE (Hypothetical Document Embeddings) */}
                      <div className="pt-2 border-t border-[var(--card-border)] space-y-2">
                        <label className="flex items-center justify-between cursor-pointer">
                          <div className="pr-4">
                            <span className="text-xs font-medium text-[var(--foreground)]">HyDE Dense Semantic Expansion</span>
                            <p className="text-[10px] text-[var(--muted)]">
                              Generates a brief hypothetical code/technical answer to embed into dense vector space, matching documentation with higher conceptual relevance.
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            checked={ragHydeEnabled}
                            onChange={(e) => setRagHydeEnabled(e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-[var(--card-bg)] border-[var(--card-border)] cursor-pointer shrink-0"
                          />
                        </label>
                        {ragHydeEnabled && (
                          <div className="mt-2 space-y-1">
                            <label className="text-[10px] font-medium text-[var(--muted)]">
                              HyDE Generator Model (optional, defaults to project or active model)
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. llama3.2, qwen2.5:7b"
                              value={ragHydeModel}
                              onChange={(e) => setRagHydeModel(e.target.value)}
                              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        )}
                      </div>

                      {/* Stage-2 Cross-Encoder Re-Ranking */}
                      <div className="pt-2 border-t border-[var(--card-border)] space-y-2">
                        <label className="flex items-center justify-between cursor-pointer">
                          <div className="pr-4">
                            <span className="text-xs font-medium text-[var(--foreground)]">Stage-2 Cross-Encoder Re-Ranking</span>
                            <p className="text-[10px] text-[var(--muted)]">
                              Evaluates candidate passages with deep query-document cross-attention via local LLM batch scoring or instant in-memory cross-scoring, filtering false positives.
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            checked={ragRerankEnabled}
                            onChange={(e) => setRagRerankEnabled(e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-[var(--card-bg)] border-[var(--card-border)] cursor-pointer shrink-0"
                          />
                        </label>
                        {ragRerankEnabled && (
                          <div className="mt-2 space-y-2">
                            <div className="space-y-1">
                              <label className="text-[10px] font-medium text-[var(--muted)]">
                                Re-ranker Model (optional, defaults to project or active model)
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. llama3.2, qwen2.5:7b"
                                value={ragRerankModel}
                                onChange={(e) => setRagRerankModel(e.target.value)}
                                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-medium text-[var(--muted)]">
                                  Min Relevance Score Threshold
                                </label>
                                <span className="text-[10px] font-mono text-[var(--foreground)]">
                                  {ragRerankMinScore.toFixed(2)}
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={0.9}
                                step={0.05}
                                value={ragRerankMinScore}
                                onChange={(e) => setRagRerankMinScore(parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-blue-600"
                              />
                              <p className="text-[9px] text-[var(--muted)]">
                                Passages scoring below this threshold are pruned from context (0.00 = disabled).
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </details>

                {/* Ambient File-Watcher — server-side folder sync, additive to manual upload above. Only usable for saved projects (needs a project.id to attach the watcher to). */}
                <details className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2">
                  <summary className="text-xs font-semibold text-[var(--foreground)] cursor-pointer select-none flex items-center gap-2">
                    {watchedFolderEnabled ? (
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <EyeSlash className="w-3.5 h-3.5 text-[var(--muted)]" />
                    )}
                    Ambient Folder Watcher
                    {watchedFolderEnabled && (
                      <span className="ml-auto text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </summary>
                  <div className="mt-3 space-y-3">
                    <p className="text-[10px] text-[var(--muted)] leading-relaxed">
                      Point this at a folder on the server's machine and it stays synced automatically — edit a file there and it's re-indexed within a second, no re-upload needed. Only plain-text/code files are watched (same types Upload accepts, minus PDF). Manually uploaded files above are untouched and continue to work alongside watched ones. The path is sandboxed to your home directory, same as the disk tools.
                    </p>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={watchedFolderPath}
                        onChange={(e) => setWatchedFolderPath(e.target.value)}
                        disabled={watchedFolderEnabled || watcherStatus !== "idle"}
                        placeholder="e.g. Documents/my-project-notes"
                        className="flex-1 px-3 py-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={toggleWatcher}
                        disabled={watcherStatus === "starting" || watcherStatus === "stopping" || !project?.id}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${
                          watchedFolderEnabled
                            ? "bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20"
                        }`}
                      >
                        {watcherStatus === "starting" ? "Starting…" : watcherStatus === "stopping" ? "Stopping…" : watchedFolderEnabled ? "Stop Watching" : "Start Watching"}
                      </button>
                    </div>

                    {!project?.id && (
                      <p className="text-[10px] text-amber-400">Save this project first — the watcher needs a project to attach to.</p>
                    )}
                    {watcherError && (
                      <p className="text-[10px] text-red-400">{watcherError}</p>
                    )}
                  </div>
                </details>

                {/* File Upload & Web URL Ingestion */}
                <div className="space-y-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Add Files to Project
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.txt,.md,.json,.csv,.py,.js,.ts,.html,.css,.java,.cpp,.c,.rs,.go,.sql,.sh,.yml,.yaml,.xml,.log,.env"
                      onChange={handleUploadFiles}
                      className="hidden"
                    />
                  </div>

                  {/* Web URL Documentation Ingestion */}
                  <div className="p-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-2">
                    <div className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-blue-400" />
                      <span>Import Web Documentation / URL</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={urlToIngest}
                        onChange={(e) => {
                          setUrlToIngest(e.target.value);
                          if (urlIngestError) setUrlIngestError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleIngestUrl();
                          }
                        }}
                        placeholder="https://docs.example.com/api..."
                        disabled={isIngestingUrl}
                        className="flex-1 px-3 py-1.5 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] disabled:opacity-60 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleIngestUrl}
                        disabled={isIngestingUrl || !urlToIngest.trim()}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                      >
                        {isIngestingUrl && <CircleNotch className="w-3.5 h-3.5 animate-spin" />}
                        {isIngestingUrl ? "Ingesting..." : "Import URL"}
                      </button>
                    </div>
                    {urlIngestError && (
                      <p className="text-[11px] text-red-400 font-medium">{urlIngestError}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Uploaded Files List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[var(--muted)] px-1">
                  <span>Attached Knowledge Files ({files.length})</span>
                  <span>Tokens & Chunks</span>
                </div>

                {files.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--muted)] border border-dashed border-[var(--card-border)] rounded-2xl">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-40 text-blue-400" />
                    <p className="font-medium text-[var(--foreground)]">No files attached to this project yet</p>
                    <p className="text-[11px] text-[var(--muted)] mt-1">
                      Add `.md`, `.txt`, `.py`, `.ts`, or `.json` files to give your project permanent memory.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto touch-scroll">
                    {files.map((file) => {
                      const fileTok = estimateTokens(file.textContent || "");
                      const chunkCount = getCachedFileChunks(file).length;
                      return (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)]"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium truncate max-w-[200px] sm:max-w-[320px]">
                                {file.name}
                              </div>
                              <div className="text-[10px] text-[var(--muted)] font-mono flex items-center gap-1.5 flex-wrap">
                                <span>{formatBytes(file.size)}</span>
                                <span>•</span>
                                <span className="text-cyan-400">~{fileTok.toLocaleString()} tok</span>
                                <span>•</span>
                                <span>{chunkCount} {chunkCount === 1 ? "chunk" : "chunks"}</span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeFile(file.id)}
                            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Remove file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] flex items-center justify-between flex-shrink-0 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          {isEditing && onDeleteProject ? (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Are you sure you want to delete project "${project.name}"?`)) {
                  onDeleteProject(project.id);
                  onClose();
                }
              }}
              className="px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
            >
              Delete Project
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
              className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-colors cursor-pointer"
            >
              {isEditing ? "Save Changes" : "Create Project"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
