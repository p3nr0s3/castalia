"use client";

import React, { useState } from "react";
import { Plus, PushPin as Pin, Trash as Trash2, PencilSimple as Edit2, Check, X, MagnifyingGlass as Search, Gear as Settings, Folder, FolderOpen, CaretRight as ChevronRight, CaretDown as ChevronDown, SquaresFour as LayoutDashboard, FadersHorizontal as SlidersHorizontal, Play, Pulse as Activity, CodeSimple as Code2, Sparkle as Sparkles, Stack as Layers, Palette, ArrowsDownUp as ArrowUpDown, DotsThreeVertical as MoreVertical, Download, CaretLineLeft as PanelLeftClose, Scroll as ScrollText, Stack as Blocks, Plug, ArrowCounterClockwise as RotateCcw, ShieldWarning as ShieldAlert, BookmarkSimple as BookMarked, ShareNetwork as Share2 } from "@phosphor-icons/react";
import { Conversation, Project, AgentTask } from "@/lib/types";
import { storage } from "@/lib/storage";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: (projectId?: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onTogglePin: (id: string) => void;
  onOpenSettings: (section?: any) => void;
  onOpenSkills?: () => void;
  isConnected: boolean;
  ollamaUrl: string;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  /** Current sidebar width in px (desktop only — mobile is a fixed-width overlay drawer). */
  width?: number;
  onWidthChange?: (width: number) => void;
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onOpenNewProjectModal: () => void;
  onOpenEditProjectModal?: (project: Project) => void;
  onOpenProjectsGallery: () => void;
  workspaceView?: "chat" | "projects-gallery" | "project-detail";
  onOpenArtifacts?: () => void;
  onOpenCodespace?: () => void;
  onOpenJournal?: () => void;
  onOpenKnowledgeGraph?: () => void;
  onOpenWorkspace?: () => void;
  mainView?: "workspace" | "codespace" | "journal";
  agents?: AgentTask[];
  onOpenNewAgentModal?: () => void;
  onOpenAgentLogs?: (agent: AgentTask) => void;
  onToggleAgentStatus?: (agentId: string) => void;
  onRunAgentNow?: (agentId: string) => void;
  runningAgentIds?: string[];
  onOpenDiskExplorer?: () => void;
  onOpenDirectory?: (tab?: "skills" | "connectors" | "plugins") => void;
  onOpenMemory?: () => void;
  onOpenApprovals?: () => void;
  pendingApprovalCount?: number;
}

type SortOption = "recent" | "created" | "title";

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onRenameConversation,
  onTogglePin,
  onOpenSettings,
  onOpenSkills,
  onOpenDirectory,
  onOpenMemory,
  isConnected,
  ollamaUrl,
  isOpen,
  setIsOpen,
  width = 256,
  onWidthChange,
  projects,
  activeProjectId,
  onSelectProject,
  onOpenNewProjectModal,
  onOpenEditProjectModal,
  onOpenProjectsGallery,
  workspaceView = "chat",
  onOpenArtifacts,
  onOpenCodespace,
  onOpenJournal,
  onOpenKnowledgeGraph,
  onOpenWorkspace,
  mainView = "workspace",
  agents = [],
  onOpenNewAgentModal,
  onOpenAgentLogs,
  onToggleAgentStatus,
  onRunAgentNow,
  runningAgentIds = [],
  onOpenDiskExplorer,
  onOpenApprovals,
  pendingApprovalCount = 0,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    () => new Set(activeProjectId ? [activeProjectId] : [])
  );

  React.useEffect(() => {
    if (activeProjectId) {
      setExpandedProjectIds((prev) => new Set(prev).add(activeProjectId));
    }
  }, [activeProjectId]);

  const toggleProjectExpand = (projId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projId)) {
        next.delete(projId);
      } else {
        next.add(projId);
      }
      return next;
    });
  };

  const handleProjectClick = (projId: string) => {
    onSelectProject(projId);
    setExpandedProjectIds((prev) => new Set(prev).add(projId));
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsOpen(false);
    }
  };

  const handleQuickExport = () => {
    try {
      const dataStr = storage.exportData();
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ollama-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Quick export failed:", e);
    }
  };

  const handleSelectConv = (id: string) => {
    onSelectConversation(id);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsOpen(false);
    }
  };

  const handleStartNewChat = () => {
    onNewChat(undefined);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsOpen(false);
    }
  };

  const handleStartRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const handleSaveRename = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  // Filter conversations
  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sorting
  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    if (sortBy === "created") {
      return b.createdAt - a.createdAt;
    }
    if (sortBy === "title") {
      return a.title.localeCompare(b.title);
    }
    return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
  });

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container matching layout with theme variables */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 h-full flex-shrink-0 flex-col bg-[var(--sidebar-bg)] text-[var(--foreground)] border-r border-[var(--sidebar-border)] transition-transform duration-200 ease-in-out shadow-2xl md:shadow-none select-none relative ${
          isOpen ? "flex translate-x-0" : "hidden -translate-x-full"
        }`}
        style={{ width: `${width}px`, maxWidth: "85vw" }}
      >
        {/* Drag handle — desktop only (md:static, part of the flex row so the
            main content naturally reflows). Mobile is a fixed-width overlay
            drawer over the content, dragging doesn't make sense there. */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = width;
            const prevCursor = document.body.style.cursor;
            const prevUserSelect = document.body.style.userSelect;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const next = Math.min(480, Math.max(200, startWidth + (moveEvent.clientX - startX)));
              onWidthChange?.(next);
            };
            const handleMouseUp = () => {
              document.body.style.cursor = prevCursor;
              document.body.style.userSelect = prevUserSelect;
              window.removeEventListener("mousemove", handleMouseMove);
              window.removeEventListener("mouseup", handleMouseUp);
            };
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleMouseUp);
          }}
          className="hidden md:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500/70 z-10 touch-none translate-x-1/2"
          title="Geser buat ubah lebar sidebar"
        />
        {/* Brand Header: Serif Font with Theme Foreground */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <span className="font-serif text-xl font-bold tracking-tight text-[var(--foreground)]">
            Ollama
          </span>

          <button
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className={`p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer ${
              isSearchOpen ? "text-[var(--foreground)] bg-[var(--sidebar-hover)]" : ""
            }`}
            title="Search chats"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar (Expandable) */}
        {isSearchOpen && (
          <div className="px-3 pb-2 animate-in fade-in duration-150">
            <div className="relative flex items-center">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                autoFocus
                className="w-full px-2.5 py-1 text-xs rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--card-border)]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Primary Action Navigation List matching Image 1 */}
        <div className="px-2 py-1 space-y-0.5">
          {/* + New Chat */}
          <button
            onClick={handleStartNewChat}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer group"
          >
            <Plus className="w-4 h-4 text-[var(--muted)] group-hover:text-[var(--foreground)] transition-colors" />
            <span>New</span>
          </button>

          {/* Projects Gallery */}
          <button
            onClick={() => {
              onOpenProjectsGallery();
              if (typeof window !== "undefined" && window.innerWidth < 768) setIsOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
              workspaceView === "projects-gallery"
                ? "bg-[var(--sidebar-hover)] text-[var(--foreground)] font-medium"
                : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
            }`}
          >
            <Layers className="w-4 h-4 text-[var(--muted)]" />
            <span>Projects</span>
          </button>

          {/* Artifacts */}
          {onOpenArtifacts && (
            <button
              onClick={() => {
                onOpenArtifacts();
                if (typeof window !== "undefined" && window.innerWidth < 768) setIsOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[var(--muted)]" />
              <span>Artifacts</span>
            </button>
          )}

          {/* Code / Codespace */}
          {onOpenCodespace && (
            <button
              onClick={() => {
                onOpenCodespace();
                if (typeof window !== "undefined" && window.innerWidth < 768) setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                mainView === "codespace"
                  ? "bg-[var(--sidebar-hover)] text-[var(--foreground)] font-medium"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
              }`}
            >
              <Code2 className="w-4 h-4 text-[var(--muted)]" />
              <span>Code</span>
            </button>
          )}

          {/* Journal (Notion-style Workspace Notebook) */}
          {onOpenJournal && (
            <button
              onClick={() => {
                onOpenJournal();
                if (typeof window !== "undefined" && window.innerWidth < 768) setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                mainView === "journal"
                  ? "bg-[var(--sidebar-hover)] text-[var(--foreground)] font-medium"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
              }`}
              title="Workspace Journal & Catatan Kerja"
            >
              <BookMarked className="w-4 h-4 text-[var(--muted)]" />
              <span>Journal</span>
            </button>
          )}

          {/* Knowledge Graph (Obsidian 2D Force-Directed Canvas) */}
          {onOpenKnowledgeGraph && (
            <button
              onClick={() => {
                onOpenKnowledgeGraph();
                if (typeof window !== "undefined" && window.innerWidth < 768) setIsOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
              title="Visual Knowledge Graph (Obsidian-Style 2D Canvas)"
            >
              <Share2 className="w-4 h-4 text-purple-400" />
              <span>Knowledge Graph</span>
            </button>
          )}

          {/* SECTION: CUSTOMIZE matching Image 4 */}
          <div className="pt-2">
            <div className="px-3 py-1 text-[11px] font-semibold text-[var(--muted)] select-none">
              Customize
            </div>
            <div className="space-y-0.5 mt-0.5">
              {/* Skills */}
              <button
                onClick={() => {
                  if (onOpenDirectory) onOpenDirectory("skills");
                  else if (onOpenSkills) onOpenSkills();
                  else onOpenSettings("skills");
                  if (typeof window !== "undefined" && window.innerWidth < 768) setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer group"
              >
                <ScrollText className="w-4 h-4 text-[var(--muted)] group-hover:text-[var(--foreground)] transition-colors" />
                <span>Skills</span>
              </button>

              {/* Connectors */}
              <button
                onClick={() => {
                  if (onOpenDirectory) onOpenDirectory("connectors");
                  else onOpenSettings("cloud");
                  if (typeof window !== "undefined" && window.innerWidth < 768) setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer group"
              >
                <Blocks className="w-4 h-4 text-[var(--muted)] group-hover:text-[var(--foreground)] transition-colors" />
                <span>Connectors</span>
              </button>

              {/* Plugins */}
              <button
                onClick={() => {
                  if (onOpenDirectory) onOpenDirectory("plugins");
                  else onOpenSettings("skills");
                  if (typeof window !== "undefined" && window.innerWidth < 768) setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer group"
              >
                <Plug className="w-4 h-4 text-[var(--muted)] group-hover:text-[var(--foreground)] transition-colors" />
                <span>Plugins</span>
              </button>

              {/* Memory */}
              <button
                onClick={() => {
                  if (onOpenMemory) onOpenMemory();
                  else onOpenSettings("personalization");
                  if (typeof window !== "undefined" && window.innerWidth < 768) setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer group"
              >
                <RotateCcw className="w-4 h-4 text-[var(--muted)] group-hover:text-[var(--foreground)] transition-colors" />
                <span>Memory</span>
              </button>

              {/* Agent Approval Queue — badge stays visible until each item is decided */}
              {onOpenApprovals && (
                <button
                  onClick={() => {
                    onOpenApprovals();
                    if (typeof window !== "undefined" && window.innerWidth < 768) setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer group ${
                    pendingApprovalCount > 0
                      ? "text-amber-300 hover:bg-amber-500/10"
                      : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                  }`}
                >
                  <ShieldAlert
                    className={`w-4 h-4 transition-colors ${
                      pendingApprovalCount > 0 ? "text-amber-400" : "text-[var(--muted)] group-hover:text-[var(--foreground)]"
                    }`}
                  />
                  <span className="flex-1 text-left">Persetujuan Agent</span>
                  {pendingApprovalCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-neutral-950 text-[10px] font-bold leading-none">
                      {pendingApprovalCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Section Lists: Projects & Chats */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 touch-scroll">
          {/* SECTION: PROJECTS matching Image 1 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-3 py-1 text-xs font-semibold text-[var(--muted)] select-none">
              <span>Projects</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenNewProjectModal();
                }}
                className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                title="Create Project"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-0.5">
              {projects.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-[var(--muted)] italic">
                  No projects yet
                </div>
              ) : (
                projects.map((proj) => {
                  const isSelected =
                    workspaceView === "project-detail" && activeProjectId === proj.id;
                  // Note: intentionally NOT `|| isSelected` — the useEffect above
                  // already auto-expands a project the moment it becomes active,
                  // but after that the user must be able to manually collapse the
                  // active project's folder too. Forcing it open via isSelected
                  // made the chevron toggle a no-op for whichever project is
                  // currently selected.
                  const isExpanded = expandedProjectIds.has(proj.id);
                  const projChats = conversations.filter((c) => c.projectId === proj.id);

                  return (
                    <div key={proj.id} className="space-y-0.5">
                      <div
                        onClick={() => handleProjectClick(proj.id)}
                        className={`group w-full flex items-center justify-between px-2 py-1.5 rounded-xl text-xs transition-colors cursor-pointer text-left ${
                          isSelected
                            ? "bg-[var(--sidebar-hover)] text-[var(--foreground)] font-medium"
                            : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {/* Folder Chevron Toggle */}
                          <button
                            type="button"
                            onClick={(e) => toggleProjectExpand(proj.id, e)}
                            className="p-1 -ml-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
                            title={isExpanded ? "Collapse project folder" : "Expand project folder"}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Folder Icon */}
                          {isExpanded ? (
                            <FolderOpen className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          ) : (
                            <Folder className="w-4 h-4 text-amber-400/80 flex-shrink-0" />
                          )}

                          <span className="truncate flex-1 font-medium">{proj.name}</span>
                        </div>

                        {/* Badges / Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {projChats.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-[var(--card-bg)] text-[10px] text-[var(--muted)] font-mono border border-[var(--card-border)]">
                              {projChats.length}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNewChat(proj.id);
                              setExpandedProjectIds((prev) => new Set(prev).add(proj.id));
                              if (typeof window !== "undefined" && window.innerWidth < 768) {
                                setIsOpen(false);
                              }
                            }}
                            className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/10 dark:hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            title="New chat in this project"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Nested Content When Project Folder is Open */}
                      {isExpanded && (
                        <div className="pl-4 pr-1 py-0.5 space-y-0.5 border-l-2 border-[var(--card-border)] ml-3 my-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                          <button
                            type="button"
                            onClick={() => handleProjectClick(proj.id)}
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg text-[11px] transition-colors cursor-pointer text-left ${
                              isSelected
                                ? "text-blue-400 font-semibold bg-blue-500/10"
                                : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                            }`}
                          >
                            <LayoutDashboard className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Dashboard & Knowledge</span>
                          </button>

                          {projChats.length === 0 ? (
                            <div className="px-2 py-1 text-[11px] text-[var(--muted)] italic">
                              No chats in project
                            </div>
                          ) : (
                            projChats.map((conv) => {
                              const isChatActive = workspaceView === "chat" && conv.id === activeId;
                              return (
                                <button
                                  key={conv.id}
                                  type="button"
                                  onClick={() => {
                                    handleSelectConv(conv.id);
                                    if (typeof window !== "undefined" && window.innerWidth < 768) {
                                      setIsOpen(false);
                                    }
                                  }}
                                  className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg text-[11px] transition-colors cursor-pointer text-left truncate ${
                                    isChatActive
                                      ? "bg-[var(--sidebar-hover)] text-[var(--foreground)] font-semibold"
                                      : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                                  }`}
                                  title={conv.title}
                                >
                                  <span className="text-[9px] opacity-60 flex-shrink-0 font-mono">○</span>
                                  <span className="truncate">{conv.title}</span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* SECTION: CHATS AND TASKS matching Image 1 */}
          <div className="space-y-1 pt-2 border-t border-[var(--sidebar-border)]">
            <div className="flex items-center justify-between px-3 py-1 text-xs font-semibold text-[var(--muted)] select-none">
              <span>Chats and tasks</span>

              <div className="relative">
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                  title="Sort chats"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>

                {showSortMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-6 w-40 p-1.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-2xl z-50 text-xs space-y-0.5 animate-in fade-in"
                  >
                    {[
                      { id: "recent", label: "Recently Updated" },
                      { id: "created", label: "Date Created" },
                      { id: "title", label: "Alphabetical" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => {
                          setSortBy(opt.id as SortOption);
                          setShowSortMenu(false);
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer ${
                          sortBy === opt.id
                            ? "bg-[var(--sidebar-hover)] text-[var(--foreground)] font-semibold"
                            : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                        }`}
                      >
                        <span>{opt.label}</span>
                        {sortBy === opt.id && <Check className="w-3 h-3 text-emerald-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-0.5">
              {sorted.length === 0 ? (
                <div className="px-3 py-2 text-xs text-[var(--muted)] italic">
                  No conversations yet
                </div>
              ) : (
                sorted.map((conv) => {
                  const isSelected = workspaceView === "chat" && conv.id === activeId;
                  const isEditingThis = editingId === conv.id;

                  return (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectConv(conv.id)}
                      className={`group relative flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[var(--sidebar-hover)] text-[var(--foreground)] font-medium"
                          : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                      }`}
                    >
                      {/* Left: Open circle bullet '○' matching Image 1 */}
                      <div className="flex items-center gap-2 min-w-0 pr-1 flex-1">
                        <span className="text-[var(--muted)] opacity-60 text-[10px] flex-shrink-0 font-mono select-none">
                          ○
                        </span>

                        {isEditingThis ? (
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveRename(conv.id, e as any);
                              if (e.key === "Escape") handleCancelRename(e as any);
                            }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            className="w-full bg-[var(--card-bg)] text-[var(--foreground)] border border-[var(--card-border)] rounded px-1.5 py-0.5 text-xs focus:outline-none"
                          />
                        ) : (
                          <span className="truncate">{conv.title}</span>
                        )}
                      </div>

                      {/* Right action icons on hover */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        {isEditingThis ? (
                          <>
                            <button
                              onClick={(e) => handleSaveRename(conv.id, e)}
                              className="p-1 hover:text-emerald-400"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              onClick={handleCancelRename}
                              className="p-1 hover:text-rose-400"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={(e) => handleStartRename(conv, e)}
                              className="p-1 text-[var(--muted)] hover:text-[var(--foreground)]"
                              title="Rename"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteConversation(conv.id);
                              }}
                              className="p-1 text-[var(--muted)] hover:text-rose-400"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Bottom Footer: "Design" + Profile & Utility Toolbar matching Screenshot */}
        <div className="p-2.5 border-t border-[var(--sidebar-border)] space-y-1.5 flex-shrink-0">
          {/* Design Button */}
          <button
            onClick={() => {
              onOpenSettings();
              if (typeof window !== "undefined" && window.innerWidth < 768) setIsOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
          >
            <Palette className="w-4 h-4 text-[var(--muted)]" />
            <span>Design</span>
          </button>

          {/* User Settings & Icons Row */}
          <div className="flex items-center justify-between gap-1 pt-0.5">
            {/* Left: Direct Settings Button */}
            <button
              onClick={() => {
                onOpenSettings();
                if (typeof window !== "undefined" && window.innerWidth < 768) setIsOpen(false);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>

            {/* Right: Three Icon Actions (Download, Search, Sidebar Collapse) */}
            <div className="flex items-center gap-0.5">
              {/* 1. Download Backup */}
              <button
                onClick={handleQuickExport}
                className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                title="Download / Export Workspace Backup (.json)"
              >
                <Download className="w-4 h-4" />
              </button>

              {/* 2. Quick Search */}
              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className={`p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer ${
                  isSearchOpen ? "text-[var(--foreground)] bg-[var(--sidebar-hover)]" : ""
                }`}
                title="Search Chats"
              >
                <Search className="w-4 h-4" />
              </button>

              {/* 3. Collapse Sidebar */}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                title="Collapse Sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
