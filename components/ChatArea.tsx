"use client";

import React, { useRef, useEffect, useState } from "react";
import { SidebarSimple as PanelLeft, CaretLineLeft as PanelLeftClose, Faders as Sliders, Download, ArrowDown, Robot as Bot, Folder, FileText, Lightning as Zap, Sparkle as Sparkles, CodeSimple as Code2, CaretDown as ChevronDown, CaretRight as ChevronRight, Check, PencilSimple as Edit2, PushPin as Pin, EnvelopeSimple as Mail, Trash as Trash2, Headphones, Gear as Settings } from "@phosphor-icons/react";
import { Conversation, OllamaModel, Attachment, Project, ApiKeysConfig, ThinkingMode, Skill } from "@/lib/types";
import { STARTER_PROMPTS } from "@/lib/constants";
import { processSelectedFiles } from "@/lib/fileUtils";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ContextVisualizer } from "./ContextVisualizer";
import { ContextBreakdown } from "@/lib/contextVisualizer";

interface ChatAreaProps {
  conversation: Conversation | null;
  currentProject?: Project | null;
  projects?: Project[];
  skills?: Skill[];
  onSelectProject?: (projectId: string) => void;
  onOpenProjectSettings?: () => void;
  chatFullWidth?: boolean;
  onOpenDiskExplorer?: () => void;
  onOpenSettings?: () => void;
  onOpenArtifacts?: () => void;
  onOpenSkills?: () => void;
  activeSkillsCount?: number;
  apiKeys?: ApiKeysConfig;
  models: OllamaModel[];
  selectedModel: string;
  onSelectModel: (model: string) => void;
  onRefreshModels: () => void;
  isLoadingModels: boolean;
  input: string;
  setInput: (val: string) => void;
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  webSearchActive: boolean;
  setWebSearchActive: (val: boolean) => void;
  diskToolsActive: boolean;
  setDiskToolsActive: (val: boolean) => void;
  onSendMessage: () => void;
  onStopStreaming: () => void;
  isStreaming: boolean;
  queuedMessage?: string | null;
  onQueueMessage?: () => void;
  onCancelQueuedMessage?: () => void;
  liveStats?: { tokenCount: number; liveTps: number };
  onRegenerate: (messageId: string) => void;
  onEditMessage: (messageId: string, content: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onRenameConversation?: (id: string, newTitle: string) => void;
  onTogglePin?: (id: string) => void;
  onToggleUnread?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  onMoveConversationToProject?: (id: string, targetProjectId?: string) => void;
  onOpenParameters: () => void;
  onNewChat: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  thinkingMode?: ThinkingMode;
  setThinkingMode?: (mode: ThinkingMode) => void;
  onOpenCodespace?: () => void;
  nowPlayingInfo?: { isPlaying: boolean; title: string; onOpenPlayer: () => void } | null;
  onForkConversation?: (messageId: string) => void;
  onApproveTool?: (approvalId: string) => void;
  onRejectTool?: (approvalId: string) => void;
  onOpenVoiceCall?: () => void;
  contextBreakdown?: ContextBreakdown;
  onSelectNumCtx?: (tokens: number) => void;
  isConnected?: boolean;
  ollamaUrl?: string;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  conversation,
  currentProject,
  projects = [],
  skills = [],
  onSelectProject,
  onOpenProjectSettings,
  chatFullWidth = true,
  onOpenDiskExplorer,
  onOpenSettings,
  onOpenArtifacts,
  onOpenSkills,
  activeSkillsCount = 0,
  onForkConversation,
  onApproveTool,
  onRejectTool,
  apiKeys,
  models,
  selectedModel,
  onSelectModel,
  onRefreshModels,
  isLoadingModels,
  input,
  setInput,
  attachments,
  setAttachments,
  webSearchActive,
  setWebSearchActive,
  diskToolsActive,
  setDiskToolsActive,
  onSendMessage,
  onStopStreaming,
  isStreaming,
  queuedMessage,
  onQueueMessage,
  onCancelQueuedMessage,
  liveStats,
  onRegenerate,
  onEditMessage,
  onDeleteMessage,
  onRenameConversation,
  onTogglePin,
  onToggleUnread,
  onDeleteConversation,
  onMoveConversationToProject,
  onOpenParameters,
  onNewChat,
  sidebarOpen,
  onToggleSidebar,
  thinkingMode = "default",
  setThinkingMode,
  onOpenCodespace,
  onOpenVoiceCall,
  contextBreakdown,
  onSelectNumCtx,
  isConnected,
  ollamaUrl,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);
  const chatMenuRef = useRef<HTMLDivElement>(null);

  // Close chat menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(event.target as Node)) {
        setIsChatMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const messages = conversation?.messages || [];

  // Auto-scroll to bottom on new messages or streaming tokens
  useEffect(() => {
    if (!showScrollBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming, showScrollBottom]);

  // Detect if user has scrolled up
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollBottom(!isNearBottom);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollBottom(false);
  };

  const handleExportMarkdown = () => {
    if (!conversation) return;
    let mdContent = `# ${conversation.title}\n\n`;
    if (currentProject) {
      mdContent += `**Project**: ${currentProject.name}\n`;
    }
    mdContent += `**Model**: ${conversation.model || selectedModel}\n`;
    mdContent += `**Date**: ${new Date(conversation.createdAt).toLocaleString()}\n\n---\n\n`;

    for (const msg of conversation.messages) {
      const roleName = msg.role === "user" ? "User" : "Assistant";
      mdContent += `### ${roleName}\n\n${msg.content}\n\n`;
    }

    const blob = new Blob([mdContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${conversation.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_export.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Global Drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingGlobal(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingGlobal(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingGlobal(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newAttachments = await processSelectedFiles(e.dataTransfer.files);
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex flex-col flex-1 h-[100dvh] w-full max-w-full overflow-hidden bg-[var(--background)] text-[var(--foreground)]"
    >
      {/* Drag Overlay */}
      {isDraggingGlobal && (
        <div className="absolute inset-0 z-50 bg-blue-600/20 backdrop-blur-xs border-2 border-dashed border-blue-500 rounded-2xl flex flex-col items-center justify-center text-white pointer-events-none animate-in fade-in">
          <Bot className="w-12 h-12 text-blue-400 mb-2 animate-bounce" />
          <p className="text-lg font-semibold">Drop files here to attach</p>
          <p className="text-xs text-blue-200">Supports images, code, and documents</p>
        </div>
      )}

      {/* Top Navigation Bar: Project > Chat Context Header & Tools */}
      <header className="flex-shrink-0 h-13 sm:h-14 border-b border-[var(--sidebar-border)] px-2 sm:px-4 flex items-center justify-between bg-[var(--header-bg)] backdrop-blur-md z-30 gap-1.5 relative">
        {/* Left Side: Sidebar Toggle + Project > Chat Breadcrumb Dropdown */}
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-1">
          <button
            onClick={onToggleSidebar}
            className="p-1.5 sm:p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors flex-shrink-0 cursor-pointer"
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
          </button>

          {/* Breadcrumb Navigation: Project > Chat Dropdown */}
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {/* Project Pill */}
            {currentProject ? (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => {
                    if (onSelectProject) {
                      onSelectProject(currentProject.id);
                    } else if (onOpenProjectSettings) {
                      onOpenProjectSettings();
                    }
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-xl text-xs font-semibold text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors cursor-pointer max-w-[120px] xs:max-w-[160px] sm:max-w-[200px] truncate"
                  title={`Project: ${currentProject.name} (Click to open project dashboard)`}
                >
                  <Folder className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                  <span className="truncate">{currentProject.name}</span>
                </button>
                {onOpenProjectSettings && (
                  <button
                    onClick={onOpenProjectSettings}
                    className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                    title="Project Settings"
                  >
                    <Settings className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : (
              <span className="flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium text-[var(--muted)] flex-shrink-0">
                <span>💬 General</span>
              </span>
            )}

            <ChevronRight className="w-3.5 h-3.5 text-[var(--muted)] opacity-50 flex-shrink-0" />

            {/* Chat Dropdown Menu */}
            <div className="relative inline-block text-left min-w-0" ref={chatMenuRef}>
              <button
                onClick={() => setIsChatMenuOpen(!isChatMenuOpen)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-xl text-xs sm:text-sm font-semibold hover:bg-[var(--sidebar-hover)] text-[var(--foreground)] transition-colors cursor-pointer max-w-[120px] xs:max-w-[160px] sm:max-w-[220px] md:max-w-[300px]"
                title={conversation ? conversation.title : "New Chat"}
              >
                {conversation?.unread && (
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
                )}
                {conversation?.pinned && (
                  <Pin className="w-3 h-3 text-amber-400 fill-current flex-shrink-0" />
                )}
                <span className="truncate text-left flex-1 min-w-0">
                  {conversation ? conversation.title : "New Chat"}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-[var(--muted)] flex-shrink-0 transition-transform duration-200 ${
                    isChatMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Chat Actions Dropdown Menu */}
              {isChatMenuOpen && conversation && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="fixed sm:absolute inset-x-3 sm:inset-x-auto sm:left-0 top-14 sm:top-full mt-2 w-auto sm:w-64 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-2xl shadow-black/50 z-50 p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] border-b border-[var(--sidebar-border)]/50 pb-1.5 mb-1 truncate">
                    {conversation.title}
                  </div>

                  {/* Rename */}
                  <button
                    onClick={() => {
                      setIsChatMenuOpen(false);
                      const newTitle = prompt("Rename conversation:", conversation.title);
                      if (newTitle && newTitle.trim() && onRenameConversation) {
                        onRenameConversation(conversation.id, newTitle.trim());
                      }
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Rename Conversation</span>
                  </button>

                  {/* Pin / Unpin */}
                  <button
                    onClick={() => {
                      setIsChatMenuOpen(false);
                      if (onTogglePin) onTogglePin(conversation.id);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                  >
                    <Pin className={`w-3.5 h-3.5 ${conversation.pinned ? "text-amber-400 fill-current" : "text-[var(--muted)]"}`} />
                    <span>{conversation.pinned ? "Unpin from Top" : "Pin to Top"}</span>
                  </button>

                  {/* Mark as Unread */}
                  <button
                    onClick={() => {
                      setIsChatMenuOpen(false);
                      if (onToggleUnread) onToggleUnread(conversation.id);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5 text-purple-400" />
                    <span>{conversation.unread ? "Mark as Read" : "Mark as Unread"}</span>
                  </button>

                  {/* Move to Project Submenu */}
                  {projects && projects.length > 0 && onMoveConversationToProject && (
                    <div className="border-t border-[var(--sidebar-border)]/50 pt-1 mt-1">
                      <div className="px-2.5 py-1 text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">
                        Move to Project
                      </div>
                      <button
                        onClick={() => {
                          setIsChatMenuOpen(false);
                          onMoveConversationToProject(conversation.id, undefined);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer ${
                          !conversation.projectId ? "text-emerald-400 font-semibold bg-emerald-500/10" : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                        }`}
                      >
                        <span>💬 General (No Project)</span>
                        {!conversation.projectId && <Check className="w-3 h-3" />}
                      </button>
                      {projects.map((proj) => {
                        const isThisProj = conversation.projectId === proj.id;
                        return (
                          <button
                            key={proj.id}
                            onClick={() => {
                              setIsChatMenuOpen(false);
                              onMoveConversationToProject(conversation.id, proj.id);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer ${
                              isThisProj ? "text-blue-400 font-semibold bg-blue-500/10" : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                            }`}
                          >
                            <span className="truncate">📁 {proj.name}</span>
                            {isThisProj && <Check className="w-3 h-3" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Export Markdown & Delete */}
                  <div className="border-t border-[var(--sidebar-border)]/50 pt-1 mt-1">
                    <button
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        handleExportMarkdown();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Export to Markdown</span>
                    </button>

                    {onDeleteConversation && (
                      <button
                        onClick={() => {
                          setIsChatMenuOpen(false);
                          if (confirm(`Delete conversation "${conversation.title}"?`)) {
                            onDeleteConversation(conversation.id);
                          }
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Conversation</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Action Toolbar with Compact Responsive Icons */}
        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          {/* Interactive Chat Button (Indonesian Female Voice Mode) */}
          {onOpenVoiceCall && (
            <button
              onClick={onOpenVoiceCall}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 transition-colors cursor-pointer flex-shrink-0 shadow-xs"
              title="Interactive Chat (Percakapan Suara Real-Time)"
            >
              <Headphones className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline font-semibold">Interactive Chat</span>
            </button>
          )}

          {/* Artifacts & Share Hub Button */}
          {onOpenArtifacts && (
            <button
              onClick={onOpenArtifacts}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors cursor-pointer flex-shrink-0"
              title="View Generated Artifacts & Export / Share File"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden lg:inline">Artifacts</span>
            </button>
          )}

          {/* Context Window Live Visualizer Pill */}
          {contextBreakdown && (
            <ContextVisualizer
              breakdown={contextBreakdown}
              onOpenParameters={onOpenParameters}
              onSelectNumCtx={onSelectNumCtx}
            />
          )}

          {/* Parameters Drawer Toggle */}
          {onOpenParameters && (
            <button
              onClick={onOpenParameters}
              className="p-1.5 sm:p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer flex-shrink-0"
              title="Session Parameters (Temperature, Context Size, Persona)"
            >
              <Sliders className="w-4 h-4" />
            </button>
          )}

          {/* Settings Button */}
          {onOpenSettings && (
            <button
              onClick={() => onOpenSettings()}
              className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer flex items-center gap-1.5 flex-shrink-0"
              title="Open Settings (Parameters, Disk Explorer, Themes & API Keys)"
            >
              <Settings className="w-3.5 h-3.5 text-[var(--muted)]" />
              <span className="hidden lg:inline">Settings</span>
            </button>
          )}

          {/* Export Chat Markdown */}
          {messages.length > 0 && (
            <button
              onClick={handleExportMarkdown}
              className="p-1.5 sm:p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors hidden sm:block cursor-pointer flex-shrink-0"
              title="Export to Markdown"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Claude-style Project Banner */}
      {currentProject && (
        <div className="flex-shrink-0 bg-blue-500/5 px-3.5 py-1.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
            <span className="font-semibold text-blue-400 truncate">
              Project: {currentProject.name}
            </span>
            {currentProject.files.length > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-[var(--muted)] font-mono">
                <FileText className="w-3 h-3 text-blue-400" />
                {currentProject.files.length} knowledge files loaded
              </span>
            )}
          </div>

          {onOpenProjectSettings && (
            <button
              onClick={onOpenProjectSettings}
              className="text-[11px] font-medium text-blue-400 hover:text-blue-300 underline underline-offset-2 flex-shrink-0 cursor-pointer"
            >
              Project Settings & Knowledge
            </button>
          )}
        </div>
      )}

      {/* Main Messages Viewport */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden touch-scroll"
      >
        {messages.length === 0 ? (
          /* Ultra-Minimalist Empty / Welcome State */
          <div className="min-h-full max-w-xl mx-auto px-4 flex flex-col items-center justify-center text-center py-10 sm:py-16 space-y-4 animate-in fade-in duration-200">
            <div className="space-y-1.5">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--foreground)]">
                {currentProject ? currentProject.name : "How can I help you today?"}
              </h1>
              <p className="text-xs text-[var(--muted)]">
                {currentProject
                  ? currentProject.description || "Project Workspace with persistent knowledge context"
                  : selectedModel
                  ? `Powered by ${selectedModel}`
                  : "Local Ollama & Cloud AI Models"}
              </p>
            </div>

            {/* Minimalist Starter Prompt Chips */}
            <div className="flex flex-wrap justify-center gap-2 pt-2 max-w-md">
              {STARTER_PROMPTS.slice(0, 4).map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => setInput(item.prompt)}
                  className="px-3 py-1.5 rounded-xl border border-[var(--card-border)]/60 bg-[var(--card-bg)]/40 hover:bg-[var(--sidebar-hover)] hover:border-[var(--card-border)] text-xs text-[var(--foreground)] transition-all cursor-pointer shadow-2xs active:scale-95"
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message List (Seamless Transparent Stream) */
          <div className={`w-full mx-auto py-2 space-y-1 min-w-0 ${chatFullWidth ? "max-w-none px-2 sm:px-6 xl:px-10" : "max-w-4xl"}`}>
            {messages.map((msg, index) => {
              const isLastMessage = index === messages.length - 1;
              return (
                <ChatMessage
                  key={msg.id || index}
                  message={msg}
                  isStreaming={isLastMessage && isStreaming && msg.role === "assistant"}
                  liveStats={isLastMessage && isStreaming && msg.role === "assistant" ? liveStats : undefined}
                  onRegenerate={onRegenerate}
                  onEdit={onEditMessage}
                  onDelete={onDeleteMessage}
                  onForkConversation={onForkConversation}
                  onApproveTool={onApproveTool}
                  onRejectTool={onRejectTool}
                  chatFullWidth={chatFullWidth}
                />
              );
            })}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        )}
      </div>

      {/* Floating Scroll to Bottom Button (Bottom-Left Corner to never obstruct typing or right side) */}
      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 sm:bottom-28 left-4 sm:left-6 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--card-bg)]/95 backdrop-blur-md border border-[var(--card-border)] text-xs font-semibold text-[var(--foreground)] shadow-xl hover:bg-[var(--sidebar-hover)] hover:scale-105 active:scale-95 transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2"
          title="Scroll to latest messages"
        >
          <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px]">Latest</span>
        </button>
      )}

      {/* Sticky Bottom Input Composer */}
      <ChatInput
        input={input}
        setInput={setInput}
        attachments={attachments}
        setAttachments={setAttachments}
        chatFullWidth={chatFullWidth}
        webSearchActive={webSearchActive}
        setWebSearchActive={setWebSearchActive}
        diskToolsActive={diskToolsActive}
        setDiskToolsActive={setDiskToolsActive}
        onSend={onSendMessage}
        onStop={onStopStreaming}
        isStreaming={isStreaming}
        queuedMessage={queuedMessage}
        onQueueMessage={onQueueMessage}
        onCancelQueuedMessage={onCancelQueuedMessage}
        disabled={models.length === 0 && !selectedModel}
        models={models}
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
        onRefreshModels={onRefreshModels}
        isLoadingModels={isLoadingModels}
        apiKeys={apiKeys}
        onOpenSettings={onOpenSettings}
        thinkingMode={thinkingMode}
        setThinkingMode={setThinkingMode}
        onOpenSkills={onOpenSkills}
        onOpenArtifacts={onOpenArtifacts}
        onOpenDiskExplorer={onOpenDiskExplorer}
        onClearChat={onNewChat}
        onOpenVoiceCall={onOpenVoiceCall}
        skills={skills}
        isConnected={isConnected}
        ollamaUrl={ollamaUrl}
      />
    </div>
  );
};
