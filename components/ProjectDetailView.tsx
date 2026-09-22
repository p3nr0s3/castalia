"use client";

import React, { useState, useRef, useEffect } from "react";
import { ArrowRight, Plus, MagnifyingGlass as Search, FileText, Trash as Trash2, PencilSimple as Edit2, Microphone as Mic, Sparkle as Sparkles, CaretRight as ChevronRight, Folder, FileXls as FileSpreadsheet, FileCode, Check, X, PushPin as Pin, Gear as Settings, SidebarSimple as PanelLeft, CaretLineLeft as PanelLeftClose, Faders as Sliders, Brain, Lightning as Zap, CheckCircle as CheckCircle2 } from "@phosphor-icons/react";
import { Project, Conversation, ProjectFile, MemoryItem } from "@/lib/types";
import { estimateTokens } from "@/lib/rag";

interface ProjectDetailViewProps {
  project: Project;
  conversations: Conversation[];
  onSelectConversation: (convId: string) => void;
  onStartChatInProject: (prompt: string) => void;
  onBackToGallery: () => void;
  onSaveProject: (updatedProject: Project) => void;
  onOpenProjectSettings: (project: Project, initialTab?: "general" | "parameters" | "knowledge") => void;
  selectedModel: string;
  onOpenModelSelector?: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const ProjectDetailView: React.FC<ProjectDetailViewProps> = ({
  project,
  conversations,
  onSelectConversation,
  onStartChatInProject,
  onBackToGallery,
  onSaveProject,
  onOpenProjectSettings,
  selectedModel,
  onOpenModelSelector,
  sidebarOpen,
  onToggleSidebar,
}) => {
  const [promptInput, setPromptInput] = useState("");
  const [isEditingInstructions, setIsEditingInstructions] = useState(false);
  const [instructionsText, setInstructionsText] = useState(project?.systemPrompt || "");
  const [isInstructionsExpanded, setIsInstructionsExpanded] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isAddingMemory, setIsAddingMemory] = useState(false);
  const [newMemoryTitle, setNewMemoryTitle] = useState("");
  const [newMemoryContent, setNewMemoryContent] = useState("");

  const handleAddProjectMemory = () => {
    if (!newMemoryTitle.trim() || !newMemoryContent.trim()) return;
    const newMem: MemoryItem = {
      id: `pmem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      category: "project",
      title: newMemoryTitle.trim(),
      content: newMemoryContent.trim(),
      updatedAt: Date.now(),
      enabled: true,
    };
    const updatedMemories = [...(project.memories || []), newMem];
    onSaveProject({
      ...project,
      memories: updatedMemories,
      updatedAt: Date.now(),
    });
    setNewMemoryTitle("");
    setNewMemoryContent("");
    setIsAddingMemory(false);
  };

  const handleToggleProjectMemory = (memId: string) => {
    const updatedMemories = (project.memories || []).map((m) =>
      m.id === memId ? { ...m, enabled: !m.enabled, updatedAt: Date.now() } : m
    );
    onSaveProject({
      ...project,
      memories: updatedMemories,
      updatedAt: Date.now(),
    });
  };

  const handleDeleteProjectMemory = (memId: string) => {
    const updatedMemories = (project.memories || []).filter((m) => m.id !== memId);
    onSaveProject({
      ...project,
      memories: updatedMemories,
      updatedAt: Date.now(),
    });
  };

  useEffect(() => {
    if (project) {
      setInstructionsText(project.systemPrompt || "");
    }
  }, [project?.id, project?.systemPrompt]);

  // Filter conversations for this project
  const projectChats = conversations
    .filter((c) => c.projectId === project.id)
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));

  // Date formatting helper
  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "Recent";
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // Get file type badge
  const getFileTypeBadge = (filename: string) => {
    const ext = filename.split(".").pop()?.toUpperCase() || "DOC";
    return ext.slice(0, 4);
  };

  // Calculate project context capacity percentage
  const totalFileBytes = (project.files || []).reduce((acc, f) => acc + (f.size || f.textContent?.length || 0), 0);
  const maxCapacityBytes = 500 * 1024; // 500KB context capacity reference
  const capacityPercent = Math.min(Math.round((totalFileBytes / maxCapacityBytes) * 100), 100);

  const handleSendPrompt = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!promptInput.trim()) return;
    onStartChatInProject(promptInput.trim());
    setPromptInput("");
  };

  const handleSaveInstructions = () => {
    onSaveProject({
      ...project,
      systemPrompt: instructionsText,
      updatedAt: Date.now(),
    });
    setIsEditingInstructions(false);
  };

  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newProjectFiles: ProjectFile[] = [...(project.files || [])];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await file.text();
        newProjectFiles.push({
          id: `file_${Date.now()}_${i}`,
          name: file.name,
          size: file.size,
          textContent: text,
          type: file.type?.startsWith("image/") ? "image" : "document",
          mimeType: file.type || "text/plain",
          uploadedAt: Date.now(),
        });
      } catch (err) {
        console.error("Failed to read file:", file.name, err);
      }
    }

    onSaveProject({
      ...project,
      files: newProjectFiles,
      updatedAt: Date.now(),
    });

    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteFile = (fileId: string) => {
    const updatedFiles = (project.files || []).filter((f) => f.id !== fileId);
    onSaveProject({
      ...project,
      files: updatedFiles,
      updatedAt: Date.now(),
    });
  };

  if (!project) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center p-8 bg-[var(--background)] text-[var(--foreground)]">
        <div className="text-center space-y-4 max-w-sm">
          <Folder className="w-12 h-12 text-[var(--muted)] mx-auto opacity-40" />
          <h2 className="text-base font-semibold">Project not found</h2>
          <p className="text-xs text-[var(--muted)]">The requested project could not be found or has been moved.</p>
          <button
            type="button"
            onClick={onBackToGallery}
            className="px-4 py-2 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold hover:opacity-90 cursor-pointer transition-opacity"
          >
            Back to Projects Gallery
          </button>
        </div>
      </div>
    );
  }

  const filteredFiles = (project.files || []).filter((f) =>
    f.name.toLowerCase().includes(fileSearchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[var(--background)] text-[var(--foreground)] touch-scroll">
      {/* Top Breadcrumb Header matching Claude Projects */}
      <div className="px-4 sm:px-6 py-3.5 border-b border-[var(--sidebar-border)]/60 flex items-center justify-between text-xs text-[var(--muted)]">
        <div className="flex items-center gap-2">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-1.5 -ml-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors flex-shrink-0 cursor-pointer"
              title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={onBackToGallery}
            className="hover:text-[var(--foreground)] transition-colors cursor-pointer"
          >
            Projects
          </button>
          <span>/</span>
          <span className="text-[var(--foreground)] font-medium truncate max-w-xs">{project.name}</span>
        </div>

        <button
          onClick={() => onOpenProjectSettings(project, "general")}
          className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
          title="Project Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 items-start">
          {/* LEFT / CENTER COLUMN: Title, Chat Prompt Box, Recents */}
          <div className="flex-1 w-full space-y-8 min-w-0">
            {/* Project Title */}
            <div className="flex items-center justify-between">
              <h1 className="font-serif text-2xl sm:text-3xl font-normal tracking-tight text-[var(--foreground)]">
                {project.name}
              </h1>
            </div>

            {/* Chat Input Prompt Box matching Claude with Theme variables */}
            <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-4 space-y-3 shadow-xs focus-within:border-[var(--muted)]/50 transition-all">
              <textarea
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendPrompt();
                  }
                }}
                placeholder="How can I help you today?"
                rows={3}
                className="w-full bg-transparent resize-none border-none outline-none text-sm text-[var(--foreground)] placeholder-[var(--muted)] font-sans"
              />

              <div className="flex items-center justify-between pt-1 border-t border-[var(--card-border)]/50">
                {/* Lower Pills */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-lg bg-[var(--sidebar-bg)] text-[var(--foreground)] text-xs font-medium flex items-center gap-1 border border-[var(--card-border)]">
                    <Plus className="w-3 h-3 text-[var(--muted)]" />
                    <span>Chat</span>
                  </span>

                  <span className="px-2.5 py-1 rounded-lg bg-[var(--sidebar-bg)] text-[var(--muted)] text-xs font-medium border border-[var(--card-border)]">
                    Cowork
                  </span>

                  {onOpenModelSelector && (
                    <button
                      type="button"
                      onClick={onOpenModelSelector}
                      className="px-2.5 py-1 rounded-lg bg-[var(--sidebar-bg)] hover:bg-[var(--sidebar-hover)] text-[var(--foreground)] text-xs font-mono border border-[var(--card-border)] transition-colors cursor-pointer truncate max-w-[160px]"
                      title="Select Model"
                    >
                      {selectedModel || "Model"}
                    </button>
                  )}

                  <button
                    type="button"
                    className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
                    title="Voice dictation"
                  >
                    <Mic className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Send Button */}
                <button
                  type="button"
                  onClick={() => handleSendPrompt()}
                  disabled={!promptInput.trim()}
                  className="w-8 h-8 rounded-full bg-[var(--foreground)]/10 hover:bg-[var(--foreground)] text-[var(--muted)] hover:text-[var(--background)] flex items-center justify-center transition-all disabled:opacity-40 disabled:hover:bg-[var(--foreground)]/10 disabled:hover:text-[var(--muted)] cursor-pointer flex-shrink-0"
                  title="Send message"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Recents Section matching Image 3 */}
            <div className="space-y-2.5 pt-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Recents
              </h2>

              {projectChats.length === 0 ? (
                <div className="p-6 rounded-2xl bg-[var(--card-bg)]/60 border border-[var(--card-border)] text-center text-xs text-[var(--muted)]">
                  No chats in this project yet. Use the prompt box above to start the first conversation.
                </div>
              ) : (
                <div className="divide-y divide-[var(--card-border)]/50 border-t border-b border-[var(--card-border)]/50">
                  {projectChats.map((chat) => (
                    <div
                      key={chat.id}
                      onClick={() => onSelectConversation(chat.id)}
                      className="py-3 px-2 flex items-center justify-between gap-4 hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer rounded-xl group"
                    >
                      <span className="text-sm text-[var(--foreground)] font-medium truncate">
                        {chat.title}
                      </span>
                      <span suppressHydrationWarning className="text-xs text-[var(--muted)] font-sans flex-shrink-0">
                        {formatDate(chat.updatedAt || chat.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDE PANEL: Instructions, Context & Files matching Image 3 */}
          <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 lg:border-l lg:border-[var(--card-border)] lg:pl-8 space-y-6">
            {/* Section 0: Model & Hyperparameters Summary Card */}
            <div className="space-y-2 p-3.5 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--foreground)]">
                  <Sliders className="w-3.5 h-3.5 text-blue-400" />
                  <span>Agent Model & Parameters</span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenProjectSettings(project, "parameters")}
                  className="text-[11px] text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
                >
                  Configure
                </button>
              </div>

              <div className="pt-1 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--muted)]">Model:</span>
                  <span className="font-mono font-semibold text-[var(--foreground)] truncate max-w-[160px]">
                    {project.defaultModel || selectedModel || "Default"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 pt-1">
                  <span className="px-2 py-0.5 rounded-lg bg-[var(--sidebar-bg)] text-[10px] font-mono border border-[var(--card-border)] text-emerald-400">
                    T:{(project.temperature ?? 0.7).toFixed(2)}
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-[var(--sidebar-bg)] text-[10px] font-mono border border-[var(--card-border)] text-blue-400">
                    TopP:{(project.topP ?? 0.9).toFixed(2)}
                  </span>
                  {project.topK !== undefined && (
                    <span className="px-2 py-0.5 rounded-lg bg-[var(--sidebar-bg)] text-[10px] font-mono border border-[var(--card-border)] text-amber-400">
                      TopK:{project.topK}
                    </span>
                  )}
                  {project.numCtx !== undefined && (
                    <span className="px-2 py-0.5 rounded-lg bg-[var(--sidebar-bg)] text-[10px] font-mono border border-[var(--card-border)] text-cyan-400">
                      Ctx:{project.numCtx >= 1024 ? `${project.numCtx / 1024}K` : project.numCtx}
                    </span>
                  )}
                  {project.thinkingMode && project.thinkingMode !== "default" && (
                    <span className="px-2 py-0.5 rounded-lg bg-[var(--sidebar-bg)] text-[10px] font-mono border border-[var(--card-border)] text-purple-400">
                      {project.thinkingMode === "think" ? "Think" : "Fast"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Section 1: Instructions (Bubble Card) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--foreground)]">
                  <FileText className="w-3.5 h-3.5 text-purple-400" />
                  <span>Instructions</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingInstructions(!isEditingInstructions)}
                  className="text-[11px] text-purple-400 hover:text-purple-300 font-medium cursor-pointer"
                  title="Edit Instructions"
                >
                  {isEditingInstructions ? "Cancel" : project.systemPrompt ? "Edit" : "+ Add"}
                </button>
              </div>

              {isEditingInstructions ? (
                <div className="space-y-2.5 p-3.5 rounded-2xl bg-[var(--card-bg)] border border-purple-500/30 shadow-2xs animate-in fade-in">
                  <textarea
                    value={instructionsText}
                    onChange={(e) => setInstructionsText(e.target.value)}
                    placeholder="Add instructions to tailor AI responses for this project..."
                    rows={4}
                    className="w-full p-2.5 text-xs font-mono rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-purple-500 resize-y"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingInstructions(false)}
                      className="px-2.5 py-1 rounded-lg text-xs text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveInstructions}
                      className="px-3 py-1 rounded-lg text-xs bg-purple-600 text-white font-semibold hover:bg-purple-500 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      <span>Save</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-2xs space-y-2">
                  <div
                    onClick={() => setIsEditingInstructions(true)}
                    className={`text-xs font-mono text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer transition-colors leading-relaxed whitespace-pre-wrap ${
                      isInstructionsExpanded ? "" : "line-clamp-4"
                    }`}
                  >
                    {project.systemPrompt
                      ? project.systemPrompt
                      : "Add instructions to tailor AI responses specifically for this project."}
                  </div>
                  {project.systemPrompt && project.systemPrompt.length > 140 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsInstructionsExpanded((prev) => !prev);
                      }}
                      className="text-[10px] font-medium text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
                    >
                      {isInstructionsExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Section 2: Context Capacity & Files matching Image 3 */}
            <div className="space-y-3 pt-4 border-t border-[var(--card-border)]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Context</h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                    title="Add Files"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Capacity Progress Bar */}
              <div className="space-y-1.5">
                <div className="w-full h-1.5 rounded-full bg-[var(--sidebar-hover)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${Math.max(capacityPercent, 8)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[var(--muted)] font-sans">
                  <span>{capacityPercent}% capacity</span>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                    <Zap className="w-2.5 h-2.5 flex-shrink-0" />
                    <span>16K Guard</span>
                  </span>
                </div>
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt,.md,.pdf,.json,.csv,.xlsx,.docx,.ts,.js,.py"
                onChange={handleFileUpload}
                className="hidden"
              />

              {/* Files Grid matching Image 3 cards */}
              {filteredFiles.length === 0 ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-4 rounded-xl border border-dashed border-[var(--card-border)] hover:border-[var(--muted)] text-center text-xs text-[var(--muted)] cursor-pointer transition-colors"
                >
                  Click + or drop documents to build project knowledge
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  {filteredFiles.map((file) => (
                    <div
                      key={file.id}
                      className="group relative p-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-[var(--muted)]/40 transition-all flex flex-col justify-between min-h-[90px]"
                    >
                      {/* Delete icon on hover */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFile(file.id);
                        }}
                        className="absolute top-1.5 right-1.5 p-1 rounded-md text-[var(--muted)] hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Delete file"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>

                      {/* File Name */}
                      <div className="text-[11px] text-[var(--foreground)] font-medium line-clamp-2 pr-3">
                        {file.name}
                      </div>

                      {/* File Type Badge & Token Count */}
                      <div className="pt-2 flex items-center justify-between">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[var(--sidebar-bg)] text-[var(--muted)] border border-[var(--card-border)]">
                          {getFileTypeBadge(file.name)}
                        </span>
                        <span className="text-[9px] font-mono text-cyan-400">
                          ~{estimateTokens(file.textContent || "").toLocaleString()} tok
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 3: Project Memory */}
            <div className="space-y-3 pt-4 border-t border-[var(--card-border)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--foreground)]">
                  <Brain className="w-3.5 h-3.5 text-pink-400" />
                  <span>Project Memory</span>
                  {project.memories && project.memories.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-pink-500/15 text-pink-400 border border-pink-500/30">
                      {project.memories.filter((m) => m.enabled).length}/{project.memories.length}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingMemory(!isAddingMemory)}
                  className="text-[11px] text-pink-400 hover:text-pink-300 font-medium cursor-pointer"
                  title="Add Memory"
                >
                  {isAddingMemory ? "Cancel" : "+ Add Memory"}
                </button>
              </div>

              {isAddingMemory && (
                <div className="space-y-2.5 p-3 rounded-2xl bg-[var(--card-bg)] border border-pink-500/30 shadow-2xs animate-in fade-in">
                  <input
                    type="text"
                    value={newMemoryTitle}
                    onChange={(e) => setNewMemoryTitle(e.target.value)}
                    placeholder="Memory title (e.g. Coding Standard, Persona, Goal)..."
                    className="w-full p-2 text-xs rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-pink-500"
                  />
                  <textarea
                    value={newMemoryContent}
                    onChange={(e) => setNewMemoryContent(e.target.value)}
                    placeholder="What should AI always remember when working in this project?..."
                    rows={3}
                    className="w-full p-2 text-xs rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-pink-500 resize-y"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingMemory(false);
                        setNewMemoryTitle("");
                        setNewMemoryContent("");
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddProjectMemory}
                      disabled={!newMemoryTitle.trim() || !newMemoryContent.trim()}
                      className="px-3 py-1 rounded-lg text-xs bg-pink-600 text-white font-semibold hover:bg-pink-500 disabled:opacity-50 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      <span>Save Memory</span>
                    </button>
                  </div>
                </div>
              )}

              {(!project.memories || project.memories.length === 0) && !isAddingMemory ? (
                <div
                  onClick={() => setIsAddingMemory(true)}
                  className="p-3.5 rounded-xl border border-dashed border-[var(--card-border)] hover:border-pink-500/40 text-center text-xs text-[var(--muted)] cursor-pointer transition-colors"
                >
                  Click + Add Memory to retain project-specific rules, tech stack, or persona facts.
                </div>
              ) : (
                <div className="space-y-2">
                  {project.memories?.map((mem) => (
                    <div
                      key={mem.id}
                      className={`group p-2.5 rounded-xl border transition-all flex items-start gap-2.5 ${
                        mem.enabled
                          ? "bg-[var(--card-bg)] border-[var(--card-border)] hover:border-pink-500/30"
                          : "bg-[var(--sidebar-bg)]/50 border-[var(--card-border)]/50 opacity-60"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleProjectMemory(mem.id)}
                        className={`mt-0.5 p-0.5 rounded cursor-pointer transition-colors ${
                          mem.enabled ? "text-pink-400 hover:text-pink-300" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                        title={mem.enabled ? "Disable memory" : "Enable memory"}
                      >
                        <CheckCircle2 className={`w-3.5 h-3.5 ${mem.enabled ? "fill-pink-500/20" : ""}`} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-[var(--foreground)] truncate">
                          {mem.title}
                        </div>
                        <p className="text-[11px] text-[var(--muted)] leading-relaxed line-clamp-2 mt-0.5 whitespace-pre-wrap">
                          {mem.content}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteProjectMemory(mem.id)}
                        className="p-1 rounded-md text-[var(--muted)] hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex-shrink-0"
                        title="Delete memory"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetailView;
