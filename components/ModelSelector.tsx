"use client";

import React, { useState, useRef, useEffect } from "react";
import { CaretDown as ChevronDown, ArrowsClockwise as RefreshCw, Sparkle as Sparkles, Check, Cloud, Laptop, Key, MagnifyingGlass as Search, X, HardDrive, Cpu, Stack as Layers, CloudArrowDown as DownloadCloud, Trash as Trash2, SpinnerGap as Loader2, WarningCircle as AlertCircle, CheckCircle as CheckCircle2 } from "@phosphor-icons/react";
import { OllamaModel, ApiKeysConfig, ModelPullProgress } from "@/lib/types";
import { formatBytes, pullOllamaModel, deleteOllamaModel } from "@/lib/ollama";
import { CLOUD_MODEL_PRESETS } from "@/lib/constants";

const CURATED_MODELS = [
  { id: "deepseek-r1:7b", name: "DeepSeek R1 (7B)", desc: "State-of-the-art chain-of-thought reasoning", size: "4.7 GB", tag: "Reasoning" },
  { id: "deepseek-r1:8b", name: "DeepSeek R1 (8B)", desc: "Distilled Llama 3.1 architecture reasoning", size: "4.9 GB", tag: "Distilled" },
  { id: "llama3.2:3b", name: "Llama 3.2 (3B)", desc: "Ultra-fast, lightweight daily assistant", size: "2.0 GB", tag: "Fast" },
  { id: "llama3.2-vision:11b", name: "Llama 3.2 Vision (11B)", desc: "Multimodal visual reasoning & OCR", size: "7.9 GB", tag: "Vision" },
  { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder (7B)", desc: "Exceptional code generation and refactoring", size: "4.7 GB", tag: "Coding" },
  { id: "mistral:7b", name: "Mistral (7B)", desc: "Versatile instruction follower & creative tasks", size: "4.1 GB", tag: "Popular" },
  { id: "nomic-embed-text", name: "Nomic Embed Text", desc: "Embeddings for document RAG & vector search", size: "274 MB", tag: "Embedding" },
];

interface ModelSelectorProps {
  models: OllamaModel[];
  selectedModel: string;
  onSelectModel: (modelName: string) => void;
  onRefresh: () => void;
  isLoading?: boolean;
  apiKeys?: ApiKeysConfig;
  onOpenSettings?: () => void;
  direction?: "up" | "down";
  textOnly?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  models,
  selectedModel,
  onSelectModel,
  onRefresh,
  isLoading = false,
  apiKeys,
  onOpenSettings,
  textOnly = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"all" | "local" | "cloud" | "hub">("all");
  const modalRef = useRef<HTMLDivElement>(null);

  // Model Hub & Pulling States
  const [pullModelName, setPullModelName] = useState("");
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<ModelPullProgress | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);

  const handlePullModel = async (targetModel: string) => {
    if (!targetModel.trim() || isPulling) return;
    setIsPulling(true);
    setPullError(null);
    setPullProgress({ status: "Connecting to Ollama library..." });

    try {
      await pullOllamaModel(targetModel.trim(), undefined, (progress) => {
        setPullProgress(progress);
      });
      setPullProgress({ status: "Successfully installed model!", percent: 100 });
      onRefresh();
      setTimeout(() => {
        setIsPulling(false);
        setPullProgress(null);
        setPullModelName("");
      }, 2500);
    } catch (err: any) {
      setPullError(err.message || "Failed to download model");
      setIsPulling(false);
    }
  };

  const handleDeleteModel = async (modelName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete local model "${modelName}" to free up disk space?`)) return;
    setDeletingModel(modelName);
    try {
      const ok = await deleteOllamaModel(modelName);
      if (ok) {
        onRefresh();
        if (selectedModel === modelName) {
          const remaining = models.find((m) => m.name !== modelName);
          if (remaining) onSelectModel(remaining.name);
        }
      } else {
        alert("Failed to delete model from Ollama.");
      }
    } catch (err: any) {
      alert(`Error deleting model: ${err.message}`);
    } finally {
      setDeletingModel(null);
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Provider badge helper
  const getProviderBadge = (provider: string) => {
    switch (provider) {
      case "gemini":
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">Gemini</span>;
      case "openai":
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">OpenAI</span>;
      case "anthropic":
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">Claude</span>;
      case "deepseek":
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">DeepSeek</span>;
      case "groq":
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">Groq</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Ollama</span>;
    }
  };

  const isSelectedCloud = CLOUD_MODEL_PRESETS.some((m) => m.id === selectedModel);

  // Filter models
  const filteredLocalModels = models.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCloudModels = CLOUD_MODEL_PRESETS.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.badge && m.badge.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalFilteredCount =
    (activeCategory === "all" || activeCategory === "local" ? filteredLocalModels.length : 0) +
    (activeCategory === "all" || activeCategory === "cloud" ? filteredCloudModels.length : 0);

  return (
    <>
      {/* Trigger Button in Input Toolbar */}
      {textOnly ? (
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setIsOpen(true);
            }}
            className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer py-1 px-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] border-none shadow-none font-medium min-w-0"
            title="Click to select AI Model"
          >
            <span className="font-semibold text-[var(--foreground)] truncate max-w-[200px]">
              {selectedModel || (models.length > 0 ? "Select Model" : "No Models")}
            </span>
            <span className="text-[10px] text-[var(--muted)] opacity-70 flex-shrink-0">
              {isSelectedCloud ? "Cloud" : "Local"}
            </span>
            <ChevronDown className="w-3 h-3 text-[var(--muted)] opacity-60 flex-shrink-0" />
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors flex-shrink-0 cursor-pointer disabled:opacity-50"
            title="Refresh local Ollama models"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setIsOpen(true);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] text-[var(--foreground)] border border-[var(--card-border)] shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/40 active:scale-98 cursor-pointer min-w-0 max-w-[130px] xs:max-w-[160px] sm:max-w-[210px] md:max-w-[260px]"
            title="Click to select AI Model (Modal Popup)"
          >
            {isSelectedCloud ? (
              <Cloud className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400 flex-shrink-0" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400 flex-shrink-0" />
            )}
            <span className="truncate flex-1 text-left min-w-0">
              {selectedModel || (models.length > 0 ? "Select Model" : "No Models")}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--muted)] flex-shrink-0" />
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1.5 sm:p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] transition-colors flex-shrink-0 cursor-pointer disabled:opacity-50"
            title="Refresh local Ollama models"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
          </button>
        </div>
      )}

      {/* Dedicated Centered Modal Popup Dialog */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsOpen(false)}
        >
          <div
            ref={modalRef}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-2xl shadow-black/60 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex-shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--foreground)]">
                    Select AI Model
                  </h3>
                  <p className="text-xs text-[var(--muted)]">
                    Choose from local Ollama LLMs or cloud models
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isLoading}
                  className="p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] border border-[var(--card-border)] transition-colors cursor-pointer"
                  title="Refresh local models"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] border border-[var(--card-border)] transition-colors cursor-pointer"
                  title="Close modal (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="p-3 sm:px-4 sm:pt-3 sm:pb-2 border-b border-[var(--sidebar-border)]/50">
              <div className="relative flex items-center w-full">
                <Search className="absolute left-3.5 w-4 h-4 text-[var(--muted)] pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter models by name or provider..."
                  autoFocus
                  className="w-full pl-10 pr-9 py-2 text-xs sm:text-sm rounded-xl border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 shadow-xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 p-1 text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="px-3 sm:px-4 py-2 border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/50 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveCategory("all")}
                className={`py-1.5 px-3 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                  activeCategory === "all"
                    ? "bg-[var(--card-bg)] text-[var(--foreground)] shadow-xs border border-[var(--card-border)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                All Models ({models.length + CLOUD_MODEL_PRESETS.length})
              </button>
              <button
                onClick={() => setActiveCategory("local")}
                className={`py-1.5 px-3 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeCategory === "local"
                    ? "bg-[var(--card-bg)] text-[var(--foreground)] shadow-xs border border-[var(--card-border)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <Laptop className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>Local ({models.length})</span>
              </button>
              <button
                onClick={() => setActiveCategory("cloud")}
                className={`py-1.5 px-3 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeCategory === "cloud"
                    ? "bg-[var(--card-bg)] text-[var(--foreground)] shadow-xs border border-[var(--card-border)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <Cloud className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                <span>Cloud ({CLOUD_MODEL_PRESETS.length})</span>
              </button>
              <button
                onClick={() => setActiveCategory("hub")}
                className={`py-1.5 px-3 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeCategory === "hub"
                    ? "bg-[var(--card-bg)] text-purple-400 shadow-xs border border-purple-500/30"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <DownloadCloud className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                <span>Model Hub & Pull</span>
              </button>
            </div>

            {/* Scrollable Model Cards List */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 touch-scroll">
              {totalFilteredCount === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--muted)]">
                  No matching models found for &quot;{searchQuery}&quot;
                </div>
              ) : (
                <>
                  {/* LOCAL OLLAMA MODELS SECTION */}
                  {(activeCategory === "all" || activeCategory === "local") && filteredLocalModels.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
                        <Laptop className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Local Ollama Models ({filteredLocalModels.length})</span>
                      </div>

                      <div className="space-y-1.5">
                        {filteredLocalModels.map((model) => {
                          const isSelected = model.name === selectedModel;
                          return (
                            <button
                              key={model.name}
                              type="button"
                              onClick={() => {
                                onSelectModel(model.name);
                                setIsOpen(false);
                              }}
                              className={`w-full text-left p-3 rounded-2xl flex items-center justify-between gap-3 transition-all cursor-pointer border ${
                                isSelected
                                  ? "bg-emerald-500/15 border-emerald-500/40 text-[var(--foreground)] shadow-sm ring-1 ring-emerald-500/30"
                                  : "bg-[var(--sidebar-bg)]/60 hover:bg-[var(--sidebar-hover)] border-[var(--card-border)] text-[var(--foreground)]"
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-xs sm:text-sm truncate">
                                    {model.name}
                                  </span>
                                  {isSelected && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white flex-shrink-0">
                                      Active
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-[var(--muted)]">
                                  {model.details?.parameter_size && (
                                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--card-bg)] border border-[var(--card-border)] font-mono text-[10px]">
                                      <Cpu className="w-3 h-3 text-emerald-400" />
                                      {model.details.parameter_size}
                                    </span>
                                  )}
                                  {model.details?.quantization_level && (
                                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--card-bg)] border border-[var(--card-border)] font-mono text-[10px]">
                                      <Layers className="w-3 h-3 text-purple-400" />
                                      {model.details.quantization_level}
                                    </span>
                                  )}
                                  {model.size ? (
                                    <span className="flex items-center gap-1 font-mono text-[10px]">
                                      <HardDrive className="w-3 h-3" />
                                      {formatBytes(model.size)}
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {isSelected ? (
                                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500 text-emerald-400 flex items-center justify-center">
                                    <Check className="w-3.5 h-3.5" />
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-full border border-[var(--card-border)]" />
                                )}

                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteModel(model.name, e)}
                                  disabled={deletingModel === model.name}
                                  className="p-1.5 rounded-lg text-[var(--muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                  title={`Delete local model ${model.name}`}
                                >
                                  {deletingModel === model.name ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* MODEL HUB & DOWNLOADER SECTION */}
                  {activeCategory === "hub" && (
                    <div className="space-y-4">
                      {/* Pull Custom Model Input */}
                      <div className="p-3.5 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] space-y-3">
                        <div className="flex items-center gap-2">
                          <DownloadCloud className="w-4 h-4 text-purple-400" />
                          <span className="font-semibold text-xs text-[var(--foreground)]">Pull Any Ollama Model</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={pullModelName}
                            onChange={(e) => setPullModelName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handlePullModel(pullModelName);
                            }}
                            placeholder="e.g. deepseek-r1:7b or qwen2.5:3b"
                            disabled={isPulling}
                            className="flex-1 px-3 py-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-purple-500 shadow-2xs"
                          />
                          <button
                            type="button"
                            onClick={() => handlePullModel(pullModelName)}
                            disabled={isPulling || !pullModelName.trim()}
                            className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                          >
                            {isPulling ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Pulling...</span>
                              </>
                            ) : (
                              <>
                                <DownloadCloud className="w-3.5 h-3.5" />
                                <span>Pull Model</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Progress Bar & Status */}
                        {pullProgress && (
                          <div className="p-3 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2 animate-in fade-in">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-mono text-[11px] text-purple-400 truncate max-w-[220px]">
                                {pullProgress.status}
                              </span>
                              {pullProgress.percent !== undefined && (
                                <span className="font-mono text-[11px] font-bold text-[var(--foreground)]">
                                  {pullProgress.percent}%
                                </span>
                              )}
                            </div>
                            <div className="w-full h-2 rounded-full bg-[var(--card-border)] overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-200"
                                style={{ width: `${pullProgress.percent || 10}%` }}
                              />
                            </div>
                            {pullProgress.completed && pullProgress.total ? (
                              <div className="text-[10px] text-[var(--muted)] text-right font-mono">
                                {formatBytes(pullProgress.completed)} / {formatBytes(pullProgress.total)}
                              </div>
                            ) : null}
                          </div>
                        )}

                        {/* Error Alert */}
                        {pullError && (
                          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{pullError}</span>
                          </div>
                        )}
                      </div>

                      {/* Curated 1-Click Popular Models */}
                      <div className="space-y-2">
                        <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                          <span>Recommended & Curated Models</span>
                        </div>

                        <div className="space-y-2">
                          {CURATED_MODELS.map((curated) => {
                            const isInstalled = models.some((m) => m.name.toLowerCase().startsWith(curated.id.toLowerCase()));
                            return (
                              <div
                                key={curated.id}
                                className="p-3 rounded-2xl bg-[var(--sidebar-bg)]/60 border border-[var(--card-border)] flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-xs sm:text-sm text-[var(--foreground)]">
                                      {curated.name}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                                      {curated.tag}
                                    </span>
                                    <span className="font-mono text-[10px] text-[var(--muted)]">
                                      {curated.size}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-[var(--muted)] mt-0.5 line-clamp-1">
                                    {curated.desc}
                                  </p>
                                </div>

                                <div className="flex items-center flex-shrink-0">
                                  {isInstalled ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Installed</span>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handlePullModel(curated.id)}
                                      disabled={isPulling}
                                      className="px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                                    >
                                      <DownloadCloud className="w-3.5 h-3.5 text-purple-400" />
                                      <span>Pull</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CLOUD ONLINE MODELS SECTION */}
                  {(activeCategory === "all" || activeCategory === "cloud") && filteredCloudModels.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Cloud className="w-3.5 h-3.5 text-blue-400" />
                          <span>Cloud Models ({filteredCloudModels.length})</span>
                        </div>
                        {onOpenSettings && (
                          <button
                            onClick={() => {
                              setIsOpen(false);
                              onOpenSettings();
                            }}
                            className="text-[11px] text-blue-400 hover:underline flex items-center gap-1 normal-case cursor-pointer"
                          >
                            <Key className="w-3 h-3" />
                            <span>Setup API Keys</span>
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {filteredCloudModels.map((cloudModel) => {
                          const isSelected = cloudModel.id === selectedModel;
                          return (
                            <button
                              key={cloudModel.id}
                              type="button"
                              onClick={() => {
                                onSelectModel(cloudModel.id);
                                setIsOpen(false);
                              }}
                              className={`w-full text-left p-3 rounded-2xl flex items-center justify-between gap-3 transition-all cursor-pointer border ${
                                isSelected
                                  ? "bg-blue-500/15 border-blue-500/40 text-[var(--foreground)] shadow-sm ring-1 ring-blue-500/30"
                                  : "bg-[var(--sidebar-bg)]/60 hover:bg-[var(--sidebar-hover)] border-[var(--card-border)] text-[var(--foreground)]"
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-xs sm:text-sm truncate">
                                    {cloudModel.name}
                                  </span>
                                  {isSelected && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500 text-white flex-shrink-0">
                                      Active
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  {getProviderBadge(cloudModel.provider)}
                                  {cloudModel.badge && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-[var(--card-bg)] border border-[var(--card-border)] text-[10px] text-[var(--muted)]">
                                      {cloudModel.badge}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center flex-shrink-0">
                                {isSelected ? (
                                  <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500 text-blue-400 flex items-center justify-center">
                                    <Check className="w-3.5 h-3.5" />
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-full border border-[var(--card-border)]" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:px-4 border-t border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] flex items-center justify-between text-xs text-[var(--muted)]">
              <span>{models.length} local + {CLOUD_MODEL_PRESETS.length} cloud models</span>
              {onOpenSettings && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onOpenSettings();
                  }}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Configure Keys</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
