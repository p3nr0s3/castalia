"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { apiFetch, withAccessToken } from "../lib/apiClient";
import {
  AppSettings,
  Conversation,
  Message,
  OllamaModel,
  PersonaPreset,
  Attachment,
  Project,
  AgentTask,
  PendingApproval,
  Skill,
  ProjectFile,
  ThinkingMode,
  ToolCallExecution,
  RetrievedChunkInfo,
  SearchStepInfo,
  OwaspScanResult,
} from "@/lib/types";
import { storage } from "@/lib/storage";
import { DEFAULT_SETTINGS, PRESET_PERSONAS, DEFAULT_CUSTOM_THEME } from "@/lib/constants";
import { checkOllamaHealth, fetchOllamaModels, streamChatCompletion, detectModelProvider, checkVramPressure, prewarmModel, resolveEffectiveNumCtxSync, formatBytes } from "@/lib/ollama";
import { getBatterySignal, isBatteryConstrained } from "@/lib/hardwareSignals";
import { buildToolDirectivePrompt, parseToolDirective, getNativeOllamaTools, MUTATING_TOOLS, ToolName } from "@/lib/tools";
import { executeToolCall, revertApproval } from "@/lib/toolEngine";
import { executeAgent, calculateNextRun, resumeAgentAfterApproval } from "@/lib/agentEngine";
import { composeSkillsPrompt, skillsRequireDiskTools, DEFAULT_SKILLS } from "@/lib/skills";
import dynamic from "next/dynamic";
import { Sidebar } from "@/components/Sidebar";
import { ChatArea } from "@/components/ChatArea";
import { ProjectsGallery } from "@/components/ProjectsGallery";
import { ProjectDetailView } from "@/components/ProjectDetailView";
import type { SettingsSection } from "@/components/SettingsModal";

// Modals below are always mounted (each returns null while closed) but only
// actually opened occasionally — code-splitting them keeps their JS out of
// the main page chunk so the chat UI parses/hydrates faster on first load.
// Each still renders in exactly the same place with the same isOpen-gated
// lifecycle as before; only the import mechanism changed.
const SettingsModal = dynamic(() => import("@/components/SettingsModal").then((m) => m.SettingsModal), { ssr: false });
const ParametersDrawer = dynamic(() => import("@/components/ParametersDrawer").then((m) => m.ParametersDrawer), { ssr: false });
const ProjectModal = dynamic(() => import("@/components/ProjectModal").then((m) => m.ProjectModal), { ssr: false });
const AgentModal = dynamic(() => import("@/components/AgentModal").then((m) => m.AgentModal), { ssr: false });
const AgentLogsModal = dynamic(() => import("@/components/AgentLogsModal").then((m) => m.AgentLogsModal), { ssr: false });
const ApprovalQueueModal = dynamic(() => import("@/components/ApprovalQueueModal").then((m) => m.ApprovalQueueModal), { ssr: false });
const DiskExplorerModal = dynamic(() => import("@/components/DiskExplorerModal").then((m) => m.DiskExplorerModal), { ssr: false });
const SkillsModal = dynamic(() => import("@/components/SkillsModal").then((m) => m.SkillsModal), { ssr: false });
const ArtifactsModal = dynamic(() => import("@/components/ArtifactsModal").then((m) => m.ArtifactsModal), { ssr: false });
const DirectoryModal = dynamic(() => import("@/components/DirectoryModal").then((m) => m.DirectoryModal), { ssr: false });
const MemoryModal = dynamic(() => import("@/components/MemoryModal").then((m) => m.MemoryModal), { ssr: false });
const VoiceModeModal = dynamic(() => import("@/components/VoiceModeModal").then((m) => m.VoiceModeModal), { ssr: false });
const CodespaceView = dynamic(() => import("@/components/CodespaceView").then((m) => m.CodespaceView), { ssr: false });
import {
  DEFAULT_DIRECTORY_SKILLS,
  DEFAULT_CONNECTORS,
  DEFAULT_PLUGINS,
  DEFAULT_MEMORY_CONFIG,
} from "@/lib/directoryData";
import {
  buildOptimizedKnowledgeContextAsync,
  buildRetrievalQuery,
  trimChatHistoryForBudget,
  formatUserEphemeralContext,
  calculateDynamicTokenBudgets,
} from "@/lib/rag";
import { calculateContextBreakdown } from "@/lib/contextVisualizer";
import {
  computePromptCacheKey,
  getCachedPromptResponse,
  setCachedPromptResponse,
  findSemanticCachedResponse,
} from "@/lib/responseCache";
import { countTokens } from "@/lib/tokenizer";
import { createStreamThrottler } from "@/lib/streamThrottler";
import { embedOne } from "@/lib/embeddings";
import { reformulateSearchQuery } from "@/lib/webSearchEngine";

export default function HomePage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentTask[]>([]);
  const [runningAgentIds, setRunningAgentIds] = useState<string[]>([]);

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [personas, setPersonas] = useState<PersonaPreset[]>(PRESET_PERSONAS);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);

  // Chat State
  const [input, setInput] = useState<string>("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [webSearchActive, setWebSearchActive] = useState<boolean>(false);
  const [diskToolsActive, setDiskToolsActive] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  // Single-slot message queue: lets the user type and submit a follow-up
  // while the current response is still streaming, instead of the input
  // being fully locked. Only one message can be queued at a time (v1
  // scope) — text only, no attachments, since an attachment queued
  // mid-stream would need its own upload/preview lifecycle held open
  // across the wait, which is real added complexity for a rare case.
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const [liveStats, setLiveStats] = useState<{ tokenCount: number; liveTps: number } | undefined>(undefined);
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>("default");
  const [mainView, setMainView] = useState<"workspace" | "codespace">("workspace");
  const [isCodespaceOpen, setIsCodespaceOpen] = useState<boolean>(false);
  const [isCodespaceMaximized, setIsCodespaceMaximized] = useState<boolean>(false);
  const [workspaceView, setWorkspaceView] = useState<"chat" | "projects-gallery" | "project-detail">("chat");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Modals and Drawers
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("personalization");
  const [isParametersOpen, setIsParametersOpen] = useState<boolean>(false);

  const handleOpenSettings = (section?: SettingsSection) => {
    if (section) setSettingsSection(section);
    setIsSettingsOpen(true);
  };
  const [isProjectModalOpen, setIsProjectModalOpen] = useState<boolean>(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectModalTab, setProjectModalTab] = useState<"general" | "parameters" | "knowledge">("general");
  const [isAgentModalOpen, setIsAgentModalOpen] = useState<boolean>(false);
  const [editingAgent, setEditingAgent] = useState<AgentTask | null>(null);
  const [isAgentLogsModalOpen, setIsAgentLogsModalOpen] = useState<boolean>(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState<boolean>(false);
  const [resolvingApprovalIds, setResolvingApprovalIds] = useState<string[]>([]);
  const [revertingApprovalIds, setRevertingApprovalIds] = useState<string[]>([]);
  const [hardwareHint, setHardwareHint] = useState<{ modelName: string; vramRatio: number; batteryLow: boolean } | null>(null);
  const [selectedAgentForLogs, setSelectedAgentForLogs] = useState<AgentTask | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  // Paused agent context (message history, effective system prompt) needed to resume
  // after an approval decision. Kept in memory only — too large/volatile to persist,
  // and only meaningful while this tab session is alive (matches the agreed constraint
  // that agents/approvals require the app to stay open).
  const pausedContextsRef = useRef<
    Record<string, { history: Message[]; effectiveSystemPrompt: string; userMsg: Message; searchSources: any[] }>
  >({});
  // Resolver functions for chat-sourced (non-agent) tool approvals. The manual-chat
  // disk-tool loop `await`s a Promise stored here while a write_file/delete_file
  // card sits in the UI; handleApprovalDecision resolves it when the user clicks
  // Approve/Reject. Unlike agent approvals this is NOT resumable across a tab
  // reload — the loop is a live in-memory async function tied to this page
  // session, same as any other in-flight generation.
  const chatApprovalResolversRef = useRef<Map<string, (decision: "approved" | "rejected") => void>>(new Map());
  const [isDiskExplorerOpen, setIsDiskExplorerOpen] = useState<boolean>(false);
  const [isSkillsModalOpen, setIsSkillsModalOpen] = useState<boolean>(false);
  const [isDirectoryModalOpen, setIsDirectoryModalOpen] = useState<boolean>(false);
  const [directoryTab, setDirectoryTab] = useState<"skills" | "connectors" | "plugins">("skills");
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState<boolean>(false);
  const [isArtifactsModalOpen, setIsArtifactsModalOpen] = useState<boolean>(false);
  const [isVoiceCallOpen, setIsVoiceCallOpen] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 256;
    const saved = Number(window.localStorage.getItem("sidebarWidth"));
    return saved >= 200 && saved <= 480 ? saved : 256;
  });
  const handleSidebarWidthChange = (width: number) => {
    setSidebarWidth(width);
    if (typeof window !== "undefined") window.localStorage.setItem("sidebarWidth", String(width));
  };

  // Set sidebar open on larger screens and auto-hide/minimize on half-screen / small screens (<1150px)
  useEffect(() => {
    let lastWidth = typeof window !== "undefined" ? window.innerWidth : 1200;

    const handleResize = () => {
      if (typeof window !== "undefined") {
        const currentWidth = window.innerWidth;
        if (currentWidth < 768) {
          // If resized into mobile width, auto hide sidebar
          if (lastWidth >= 768) {
            setSidebarOpen(false);
          }
        } else {
          // If resized into desktop / half-screen width, auto expand sidebar if it was mobile
          if (lastWidth < 768) {
            setSidebarOpen(true);
          }
        }
        lastWidth = currentWidth;
      }
    };

    // Initial check
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    } else {
      setSidebarOpen(true);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Request browser notification permission for scheduled agents
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Active helpers
  const activeConversation = conversations.find((c) => c.id === activeId) || null;
  // Prioritize activeProjectId if set (e.g. when viewing/selecting a project), then fallback to conversation's projectId
  const currentProject =
    (activeProjectId ? projects.find((p) => p.id === activeProjectId) : null) ||
    (activeConversation?.projectId ? projects.find((p) => p.id === activeConversation.projectId) : null) ||
    (projects.length > 0 && workspaceView === "project-detail" ? projects[0] : null);

  // Live Token & Context Window Breakdown
  const contextBreakdown = useMemo(() => {
    return calculateContextBreakdown({
      conversation: activeConversation,
      project: currentProject,
      settings,
      currentInput: input,
      diskToolsActive: Boolean(activeConversation?.diskToolsActive ?? diskToolsActive),
    });
  }, [activeConversation, currentProject, settings, input, diskToolsActive]);

  // Initialize theme & typography font
  useEffect(() => {
    const root = document.documentElement;
    const customProps = [
      "--background",
      "--foreground",
      "--sidebar-bg",
      "--sidebar-hover",
      "--sidebar-border",
      "--card-bg",
      "--card-border",
      "--accent",
      "--accent-hover",
      "--user-bubble",
      "--input-bg",
      "--input-border",
      "--muted",
      "--header-bg",
    ];

    if (settings.theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.removeAttribute("data-theme");
      if (prefersDark) root.classList.add("dark");
      else root.classList.remove("dark");
      customProps.forEach((p) => root.style.removeProperty(p));
    } else if (settings.theme === "light") {
      root.setAttribute("data-theme", "light");
      root.classList.remove("dark");
      customProps.forEach((p) => root.style.removeProperty(p));
    } else if (settings.theme === "custom") {
      root.setAttribute("data-theme", "custom");
      root.classList.add("dark");
      const ct = settings.customTheme || DEFAULT_CUSTOM_THEME;
      root.style.setProperty("--background", ct.background);
      root.style.setProperty("--foreground", ct.foreground);
      root.style.setProperty("--sidebar-bg", ct.sidebarBg);
      root.style.setProperty("--sidebar-hover", `${ct.sidebarBg}ee`);
      root.style.setProperty("--sidebar-border", `${ct.cardBg}`);
      root.style.setProperty("--card-bg", ct.cardBg);
      root.style.setProperty("--card-border", `${ct.sidebarBg}`);
      root.style.setProperty("--accent", ct.accent);
      root.style.setProperty("--accent-hover", ct.accent);
      root.style.setProperty("--user-bubble", ct.cardBg);
      root.style.setProperty("--input-bg", ct.cardBg);
      root.style.setProperty("--input-border", `${ct.sidebarBg}`);
      root.style.setProperty("--muted", ct.muted || "#9ca3af");
      root.style.setProperty("--header-bg", `${ct.background}d9`);
    } else {
      root.setAttribute("data-theme", settings.theme);
      root.classList.add("dark");
      customProps.forEach((p) => root.style.removeProperty(p));
    }

    // Apply custom typography font
    root.setAttribute("data-font", settings.fontFamily || "inter");
  }, [settings.theme, settings.fontFamily, settings.customTheme]);

  // Load models and health check
  const refreshOllama = useCallback(async () => {
    setIsLoadingModels(true);
    const healthy = await checkOllamaHealth(settings.ollamaUrl);
    setIsConnected(healthy);

    if (healthy) {
      const fetchedModels = await fetchOllamaModels(settings.ollamaUrl);
      setModels(fetchedModels);
      if (fetchedModels.length > 0) {
        setSelectedModel((prev) => {
          if (prev && fetchedModels.some((m) => m.name === prev)) return prev;
          if (settings.defaultModel && fetchedModels.some((m) => m.name === settings.defaultModel)) {
            return settings.defaultModel;
          }
          return fetchedModels[0].name;
        });
      }
    } else {
      setModels([]);
    }
    setIsLoadingModels(false);
  }, [settings.ollamaUrl, settings.defaultModel]);

  const currentDbVersionRef = useRef<number>(0);

  // Sync with central server database (smart-merge & high-speed version checking)
  const syncWithServer = useCallback(async (forceFull = false) => {
    try {
      if (forceFull) {
        const localConvs = storage.getConversations();
        const localProjects = storage.getProjects();
        const localAgents = storage.getAgents();
        const res = await apiFetch("/api/db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversations: localConvs,
            projects: localProjects,
            agents: localAgents,
          }),
        });

        if (!res.ok) return;
        const data = await res.json();

        if (data.version) currentDbVersionRef.current = data.version;

        if (data.settings) {
          setSettings(data.settings);
          storage.saveSettings(data.settings, false);
          if (data.settings.thinkingMode) {
            setThinkingMode(data.settings.thinkingMode);
          }
        }

        if (data.conversations && Array.isArray(data.conversations)) {
          setConversations(data.conversations);
          storage.saveConversations(data.conversations, false);

          setActiveId((currentActiveId) => {
            if (currentActiveId && data.conversations.some((c: Conversation) => c.id === currentActiveId)) {
              return currentActiveId;
            }
            const savedActiveId = storage.getActiveConversationId();
            if (savedActiveId && data.conversations.some((c: Conversation) => c.id === savedActiveId)) {
              return savedActiveId;
            }
            return data.conversations.length > 0 ? data.conversations[0].id : null;
          });
        }

        if (data.projects && Array.isArray(data.projects)) {
          setProjects(data.projects);
          storage.saveProjects(data.projects, false);
        }

        if (data.agents && Array.isArray(data.agents)) {
          setAgents(data.agents);
          storage.saveAgents(data.agents, false);
        }
        return;
      }

      // Fast version check (<1ms in-memory query)
      const res = await apiFetch(`/api/db?v=${currentDbVersionRef.current}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();

      // If nothing changed on server, do nothing
      if (!data.changed) return;

      if (data.version) currentDbVersionRef.current = data.version;

      if (data.settings) {
        setSettings(data.settings);
        storage.saveSettings(data.settings, false);
        if (data.settings.thinkingMode) {
          setThinkingMode(data.settings.thinkingMode);
        }
      }

      if (data.conversations && Array.isArray(data.conversations)) {
        setConversations(data.conversations);
        storage.saveConversations(data.conversations, false);

        setActiveId((currentActiveId) => {
          if (currentActiveId && data.conversations.some((c: Conversation) => c.id === currentActiveId)) {
            return currentActiveId;
          }
          const savedActiveId = storage.getActiveConversationId();
          if (savedActiveId && data.conversations.some((c: Conversation) => c.id === savedActiveId)) {
            return savedActiveId;
          }
          return data.conversations.length > 0 ? data.conversations[0].id : null;
        });
      }

      if (data.projects && Array.isArray(data.projects)) {
        setProjects(data.projects);
        storage.saveProjects(data.projects, false);
      }

      if (data.agents && Array.isArray(data.agents)) {
        setAgents(data.agents);
        storage.saveAgents(data.agents, false);
      }
    } catch (e) {
      console.warn("Server sync exception:", e);
    }
  }, []);

  // Initial Load & Health Check
  useEffect(() => {
    // 0. Safe client-side hydration for localStorage settings & personas
    const clientSettings = storage.getSettings();
    setSettings(clientSettings);
    setPersonas(storage.getPersonas());
    if (clientSettings.thinkingMode) {
      setThinkingMode(clientSettings.thinkingMode);
    }

    // 1. Instant load from local cache
    setConversations(storage.getConversations());
    setProjects(storage.getProjects());
    setAgents(storage.getAgents());
    setActiveId(storage.getActiveConversationId());

    // Pending approvals survive a reload as records (so the badge stays visible),
    // but their pausedContext (message history) lives only in memory and is lost
    // on reload — mark any restored approval as stale so the UI can tell the user
    // "context lost" instead of silently failing to resume when they approve it.
    const restoredApprovals = storage.getPendingApprovals();
    setPendingApprovals(restoredApprovals);

    // 2. Initial Full Merge with Central Server DB
    syncWithServer(true);

    // 3. Connect Ollama
    refreshOllama();

    // 4. Live change notifications via SSE (replaces the old 3s polling
    // interval — see app/api/db/stream/route.ts). syncWithServer(false) is
    // still what actually fetches and merges data; this just tells us WHEN
    // to call it instead of calling it on a fixed timer regardless of
    // whether anything changed.
    let eventSource: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let reconnectDelay = 2000;

    const connectSse = () => {
      if (typeof window === "undefined" || typeof EventSource === "undefined") return;

      eventSource = new EventSource(withAccessToken(`/api/db/stream?v=${currentDbVersionRef.current}`));

      eventSource.addEventListener("changed", () => {
        reconnectDelay = 2000; // reset backoff on any successful message
        syncWithServer(false);
      });

      eventSource.onerror = () => {
        // EventSource auto-reconnects on its own for transient network
        // blips, but if the connection is fully closed (e.g. server
        // restarted), fall back to a manual reconnect with backoff so we
        // don't hammer the server if it's actually down.
        if (eventSource?.readyState === EventSource.CLOSED) {
          eventSource?.close();
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
            connectSse();
          }, reconnectDelay);
        }
      };
    };

    connectSse();
    const healthInterval = setInterval(refreshOllama, 30000);

    // 5. Sync immediately when window/tab is focused (covers the gap right
    // after waking from sleep/background-tab-throttling before SSE catches up)
    const handleWindowFocus = () => {
      syncWithServer(false);
    };
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      eventSource?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(healthInterval);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [syncWithServer, refreshOllama]);

  // Sync active conversation model to selectedModel
  useEffect(() => {
    if (activeConversation?.model) {
      setSelectedModel(activeConversation.model);
    }
  }, [activeId]);

  // Save conversations helper
  const updateConversations = (newConvs: Conversation[]) => {
    setConversations(newConvs);
    storage.saveConversations(newConvs);
  };

  // Save projects helper
  const updateProjects = (newProjects: Project[]) => {
    setProjects(newProjects);
    storage.saveProjects(newProjects);
  };

  // Save agents helper
  const updateAgents = (newAgents: AgentTask[]) => {
    setAgents(newAgents);
    storage.saveAgents(newAgents);
  };

  // Update settings helper
  const handleUpdateSettings = (partial: Partial<AppSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    storage.saveSettings(next, true, true);
  };

  // Execute Agent Automation
  const handleRunAgentNow = async (agentId: string) => {
    const targetAgent = agents.find((a) => a.id === agentId);
    if (!targetAgent || runningAgentIds.includes(agentId)) return;

    setRunningAgentIds((prev) => [...prev, agentId]);

    try {
      const result = await executeAgent(targetAgent, {
        ollamaUrl: settings.ollamaUrl,
        projects,
        apiKeys: settings.apiKeys,
      });

      const { updatedAgent, createdConversation, pendingApproval, pausedContext } = result;

      const nextAgents = agents.map((a) => (a.id === agentId ? updatedAgent : a));
      updateAgents(nextAgents);

      if (selectedAgentForLogs?.id === agentId) {
        setSelectedAgentForLogs(updatedAgent);
      }

      if (createdConversation) {
        const nextConvs = [createdConversation, ...conversations];
        updateConversations(nextConvs);
        setActiveId(createdConversation.id);
        storage.saveActiveConversationId(createdConversation.id);
      }

      if (pendingApproval && pausedContext) {
        pausedContextsRef.current[pendingApproval.id] = pausedContext;
        const nextApprovals = [pendingApproval, ...pendingApprovals];
        setPendingApprovals(nextApprovals);
        storage.savePendingApprovals(nextApprovals);
      }
    } finally {
      setRunningAgentIds((prev) => prev.filter((id) => id !== agentId));
    }
  };

  // Resolve a pending agent tool approval (approve runs the tool and resumes
  // generation; reject tells the model the tool was refused and resumes too).
  const handleApprovalDecision = async (approvalId: string, decision: "approved" | "rejected") => {
    const approval = pendingApprovals.find((a) => a.id === approvalId);
    if (!approval || approval.status !== "pending") return;

    // Chat-sourced approval (manual "Disk Tools" toggle, not an Autonomous Agent):
    // just mark it resolved and wake up the waiting tool loop. No agent resume
    // plumbing needed — the loop that's `await`-ing this is still alive in this
    // same page session.
    if (approval.source === "chat") {
      const resolvedChatApproval: PendingApproval = { ...approval, status: decision, resolvedAt: Date.now() };
      const nextApprovals = pendingApprovals.map((a) => (a.id === approvalId ? resolvedChatApproval : a));
      setPendingApprovals(nextApprovals);
      // Chat approvals need the server write to land BEFORE the waiting tool
      // loop resumes and calls executeToolCall with this approval id as proof
      // — the server verifies it against readServerDb(), so the usual
      // 400ms-debounced sync would race a legitimately-approved write into
      // being wrongly rejected. savePendingApprovalsSync persists to
      // localStorage and awaits the server push in one step.
      await storage.savePendingApprovalsSync(nextApprovals);

      const resolver = chatApprovalResolversRef.current.get(approvalId);
      if (resolver) {
        resolver(decision);
        chatApprovalResolversRef.current.delete(approvalId);
      }
      return;
    }

    const pausedContext = pausedContextsRef.current[approvalId];

    // Mark resolved immediately so the badge/list updates without waiting on the model.
    const resolvedApproval: PendingApproval = { ...approval, status: decision, resolvedAt: Date.now() };
    const markResolved = (approvals: PendingApproval[]) =>
      approvals.map((a) => (a.id === approvalId ? resolvedApproval : a));
    setPendingApprovals((prev) => {
      const next = markResolved(prev);
      storage.savePendingApprovals(next);
      return next;
    });

    if (!pausedContext) {
      // Tab was reloaded since this agent paused — the message history needed to
      // resume generation only ever lived in memory and is gone. Nothing more to
      // do than record the decision; the agent run itself cannot be continued.
      console.warn(`Cannot resume agent run for approval ${approvalId}: pausedContext lost (tab reload).`);
      return;
    }

    const targetAgent = agents.find((a) => a.id === approval.agentId);
    if (!targetAgent) return;

    setRunningAgentIds((prev) => [...prev, targetAgent.id]);
    setResolvingApprovalIds((prev) => [...prev, approvalId]);
    try {
      const result = await resumeAgentAfterApproval(targetAgent, resolvedApproval, decision, pausedContext, {
        ollamaUrl: settings.ollamaUrl,
        apiKeys: settings.apiKeys,
      });

      const { updatedAgent, createdConversation, pendingApproval: nextPending, pausedContext: nextPausedContext } = result;

      const nextAgents = agents.map((a) => (a.id === approval.agentId ? updatedAgent : a));
      updateAgents(nextAgents);

      if (selectedAgentForLogs?.id === approval.agentId) {
        setSelectedAgentForLogs(updatedAgent);
      }

      if (createdConversation) {
        const nextConvs = [createdConversation, ...conversations];
        updateConversations(nextConvs);
        setActiveId(createdConversation.id);
        storage.saveActiveConversationId(createdConversation.id);
      }

      delete pausedContextsRef.current[approvalId];

      if (nextPending && nextPausedContext) {
        pausedContextsRef.current[nextPending.id] = nextPausedContext;
        setPendingApprovals((prev) => {
          const next = [nextPending, ...prev];
          storage.savePendingApprovals(next);
          return next;
        });
      }
    } finally {
      setRunningAgentIds((prev) => prev.filter((id) => id !== approval.agentId));
      setResolvingApprovalIds((prev) => prev.filter((id) => id !== approvalId));
    }
  };

  // Undo an already-executed write_file/delete_file approval. The server
  // independently re-checks eligibility (approved, revertible tool, not
  // already reverted) and refuses if the file has changed again since —
  // this handler just relays that outcome, it doesn't decide it.
  const handleRevertApproval = async (approvalId: string) => {
    setRevertingApprovalIds((prev) => [...prev, approvalId]);
    try {
      await revertApproval(approvalId);
      setPendingApprovals((prev) => {
        const next = prev.map((a) => (a.id === approvalId ? { ...a, reverted: true, revertedAt: Date.now() } : a));
        storage.savePendingApprovals(next);
        return next;
      });
    } catch (err: any) {
      // No toast system in this app yet — a blocking alert is the simplest
      // way to make sure a refused revert (e.g. "file changed since") isn't
      // silently missed, since it means the file is NOT in the state the
      // user just asked for.
      window.alert(err?.message || "Gagal melakukan revert.");
    } finally {
      setRevertingApprovalIds((prev) => prev.filter((id) => id !== approvalId));
    }
  };

  // Scheduled Agent Checker — runs on a client-side timer (checks every 25
  // seconds) while this tab is open. This is NOT a persistent server-side
  // scheduler: if the tab is closed when a run was due, nothing fires until
  // it's reopened, at which point overdue agents run once immediately
  // (see the `now >= agent.nextRun` check below) rather than at their
  // originally scheduled time. See the caveat shown in AgentModal's
  // schedule picker for the user-facing version of this.
  useEffect(() => {
    const schedulerInterval = setInterval(() => {
      const now = Date.now();
      agents.forEach((agent) => {
        if (
          agent.enabled &&
          agent.scheduleType !== "manual" &&
          agent.nextRun &&
          now >= agent.nextRun &&
          !runningAgentIds.includes(agent.id)
        ) {
          console.log(`Triggering scheduled Agent: ${agent.name}`);
          handleRunAgentNow(agent.id);
        }
      });
    }, 25000);

    return () => clearInterval(schedulerInterval);
  }, [agents, runningAgentIds, projects, settings]);

  // Agent Management
  const handleSaveAgent = (savedAgent: AgentTask) => {
    const existingIndex = agents.findIndex((a) => a.id === savedAgent.id);
    let updated: AgentTask[];
    if (existingIndex >= 0) {
      updated = agents.map((a) => (a.id === savedAgent.id ? savedAgent : a));
    } else {
      updated = [savedAgent, ...agents];
    }
    updateAgents(updated);
  };

  const handleDeleteAgent = async (agentId: string) => {
    const updated = agents.filter((a) => a.id !== agentId);
    setAgents(updated);
    storage.saveAgents(updated, false);
    await apiFetch("/api/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agents: updated, overwrite: true }),
    });
  };

  const handleToggleAgentStatus = (agentId: string) => {
    const updated = agents.map((a) => {
      if (a.id !== agentId) return a;
      const nextEnabled = !a.enabled;
      const tempAgent = { ...a, enabled: nextEnabled };
      return {
        ...tempAgent,
        nextRun: calculateNextRun(tempAgent),
      };
    });
    updateAgents(updated);
  };

  // Disk Explorer Handlers
  const handleAttachDiskFile = (attachment: Attachment) => {
    setAttachments((prev) => [...prev, attachment]);
  };

  const handleAddDiskFileToProject = (projectFile: ProjectFile) => {
    if (!currentProject) return;
    const existingIndex = currentProject.files.findIndex((f) => f.name === projectFile.name);
    let updatedFiles: ProjectFile[];
    if (existingIndex >= 0) {
      updatedFiles = currentProject.files.map((f) => (f.name === projectFile.name ? projectFile : f));
    } else {
      updatedFiles = [...currentProject.files, projectFile];
    }
    const updatedProj = { ...currentProject, files: updatedFiles, updatedAt: Date.now() };
    handleSaveProject(updatedProj);
  };

  const handleAskAboutDiskFile = (fileName: string, fileContent: string) => {
    const attachment: Attachment = {
      id: `disk_${Date.now()}`,
      name: fileName,
      type: "document",
      mimeType: "text/plain",
      size: fileContent.length,
      textContent: fileContent,
    };
    setAttachments((prev) => [...prev, attachment]);
    setInput(`Explain and summarize the contents of ${fileName}`);
  };

  // Delete Conversation
  const handleDeleteConversation = async (id: string) => {
    const filtered = conversations.filter((c) => c.id !== id);
    setConversations(filtered);
    storage.saveConversations(filtered, false);
    await apiFetch("/api/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversations: filtered, overwrite: true }),
    });
    if (activeId === id) {
      const nextId = filtered.length > 0 ? filtered[0].id : null;
      setActiveId(nextId);
      storage.saveActiveConversationId(nextId);
    }
  };

  // Delete Project
  const handleDeleteProject = async (projectId: string) => {
    const updated = projects.filter((p) => p.id !== projectId);
    setProjects(updated);
    storage.saveProjects(updated, false);
    await apiFetch("/api/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projects: updated, overwrite: true }),
    });
    if (activeProjectId === projectId) {
      setActiveProjectId(null);
    }
  };

  // Create New Chat
  const handleNewChat = (projId?: string) => {
    // If projId is undefined/null, start pure General Chat without project attachment
    const targetProjId = projId;
    const proj = targetProjId ? projects.find((p) => p.id === targetProjId) : null;
    setActiveProjectId(targetProjId || null);

    const newId = `conv_${Date.now()}`;
    const newConv: Conversation = {
      id: newId,
      title: proj ? `${proj.name} Chat` : "New Chat",
      projectId: targetProjId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: proj?.defaultModel || selectedModel || (models[0]?.name ?? ""),
      systemPrompt: proj?.systemPrompt || settings.defaultSystemPrompt,
      temperature: proj?.temperature ?? settings.temperature,
      topP: proj?.topP ?? settings.topP,
      topK: proj?.topK,
      numCtx: proj?.numCtx,
      numPredict: proj?.numPredict,
      repeatPenalty: proj?.repeatPenalty,
      thinkingMode: proj?.thinkingMode,
      seed: proj?.seed,
      stopSequences: proj?.stopSequences,
      messages: [],
    };

    const updated = [newConv, ...conversations];
    updateConversations(updated);
    setActiveId(newId);
    storage.saveActiveConversationId(newId);
    setInput("");
    setAttachments([]);
    setWorkspaceView("chat");
    setMainView("workspace");
  };

  // Select Conversation
  const handleSelectConversation = (id: string) => {
    setActiveId(id);
    storage.saveActiveConversationId(id);
    const conv = conversations.find((c) => c.id === id);
    setActiveProjectId(conv?.projectId || null);
    setWorkspaceView("chat");
    setMainView("workspace");
  };

  // Open Projects Overview Gallery (Image 2)
  const handleOpenProjectsGallery = () => {
    setWorkspaceView("projects-gallery");
    setMainView("workspace");
  };

  // Select Project to View Dashboard (Image 3)
  const handleSelectProject = (projectId: string | null) => {
    setActiveProjectId(projectId);
    if (projectId) {
      setWorkspaceView("project-detail");
    } else {
      setWorkspaceView("projects-gallery");
    }
    setMainView("workspace");
  };

  // Start Chat directly from Project Dashboard Prompt Box
  const handleStartChatInProject = (promptText: string) => {
    if (!activeProjectId) return;
    const proj = projects.find((p) => p.id === activeProjectId);
    const newId = `conv_${Date.now()}`;
    const initialTitle = promptText.slice(0, 32).replace(/\n/g, " ");

    const newConv: Conversation = {
      id: newId,
      title: initialTitle || `${proj?.name || "Project"} Chat`,
      projectId: activeProjectId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: proj?.defaultModel || selectedModel || (models[0]?.name ?? ""),
      systemPrompt: proj?.systemPrompt || settings.defaultSystemPrompt,
      temperature: proj?.temperature ?? settings.temperature,
      topP: proj?.topP ?? settings.topP,
      topK: proj?.topK,
      numCtx: proj?.numCtx,
      numPredict: proj?.numPredict,
      repeatPenalty: proj?.repeatPenalty,
      thinkingMode: proj?.thinkingMode,
      seed: proj?.seed,
      stopSequences: proj?.stopSequences,
      messages: [],
    };

    const updated = [newConv, ...conversations];
    updateConversations(updated);
    setActiveId(newId);
    storage.saveActiveConversationId(newId);
    setInput(promptText);
    setWorkspaceView("chat");
    setMainView("workspace");

    // Automatically trigger completion
    setTimeout(() => {
      handleSendMessage();
    }, 80);
  };

  // Rename Conversation
  const handleRenameConversation = (id: string, newTitle: string) => {
    const updated = conversations.map((c) =>
      c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c
    );
    updateConversations(updated);
  };

  // Pin Toggle
  const handleTogglePin = (id: string) => {
    const updated = conversations.map((c) =>
      c.id === id ? { ...c, pinned: !c.pinned } : c
    );
    updateConversations(updated);
  };

  // Unread Toggle
  const handleToggleUnread = (id: string) => {
    const updated = conversations.map((c) =>
      c.id === id ? { ...c, unread: !c.unread } : c
    );
    updateConversations(updated);
  };

  // Move conversation to another project or general
  const handleMoveConversationToProject = (convId: string, targetProjectId?: string) => {
    const updated = conversations.map((c) =>
      c.id === convId ? { ...c, projectId: targetProjectId, updatedAt: Date.now() } : c
    );
    updateConversations(updated);
    if (activeId === convId) {
      setActiveProjectId(targetProjectId || null);
    }
  };

  // Fork / Branch Conversation from a specific message
  const handleForkConversation = (messageId: string) => {
    if (!activeConversation) return;
    const msgIndex = activeConversation.messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const forkedMessages = activeConversation.messages.slice(0, msgIndex + 1);
    const newConvId = `conv_${Date.now()}`;
    const baseTitle = activeConversation.title.replace(/^\[Branch\]\s*/, "");
    const newTitle = `[Branch] ${baseTitle}`;

    const forkedConversation: Conversation = {
      ...activeConversation,
      id: newConvId,
      title: newTitle,
      messages: forkedMessages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updated = [forkedConversation, ...conversations];
    updateConversations(updated);
    setActiveId(newConvId);
    storage.saveActiveConversationId(newConvId);
  };

  // Change Model
  const handleSelectModel = (modelName: string) => {
    setSelectedModel(modelName);
    if (activeId) {
      const updated = conversations.map((c) =>
        c.id === activeId ? { ...c, model: modelName, updatedAt: Date.now() } : c
      );
      updateConversations(updated);
    }
    // Predictive pre-warming: pre-load newly selected model into VRAM immediately
    void prewarmModel(modelName, settings.ollamaUrl);
  };

  // Stop Streaming
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Any disk-tool approval card still waiting on this generation would
    // otherwise hang forever (its Promise never resolves) since the loop
    // that's awaiting it just got aborted. Auto-reject so the UI doesn't
    // leave a dead "waiting for approval" card behind.
    if (chatApprovalResolversRef.current.size > 0) {
      chatApprovalResolversRef.current.forEach((resolve) => resolve("rejected"));
      chatApprovalResolversRef.current.clear();
      setPendingApprovals((prev) => {
        const next = prev.map((a) => (a.source === "chat" && a.status === "pending" ? { ...a, status: "rejected" as const, resolvedAt: Date.now() } : a));
        storage.savePendingApprovals(next);
        return next;
      });
    }
    setIsStreaming(false);
  };

  // Project Management
  const handleSaveProject = (savedProject: Project) => {
    const existingIndex = projects.findIndex((p) => p.id === savedProject.id);
    let updated: Project[];
    if (existingIndex >= 0) {
      updated = projects.map((p) => (p.id === savedProject.id ? savedProject : p));
    } else {
      updated = [savedProject, ...projects];
    }
    updateProjects(updated);
    setActiveProjectId(savedProject.id);
  };

  // Helper to construct effective system prompt including project knowledge and skills
  const getEffectiveSystemPrompt = async (
    conv: Conversation,
    userQuery = ""
  ): Promise<{
    prompt: string;
    staticPrompt: string;
    dynamicContext: string;
    knowledgeNotice?: string;
    retrievedChunks?: RetrievedChunkInfo[];
  }> => {
    const proj = conv.projectId ? projects.find((p) => p.id === conv.projectId) : null;
    let basePrompt = conv.systemPrompt || proj?.systemPrompt || settings.defaultSystemPrompt;
    let knowledgeNotice = "";
    let retrievedChunks: RetrievedChunkInfo[] | undefined = undefined;
    let dynamicContext = "";

    // 1. Inject Project Knowledge Base (BM25, or hybrid BM25+embeddings when
    // Settings > semanticRagEnabled is on) with 16K Context Guard budgeting.
    if (proj && proj.files && proj.files.length > 0) {
      // Expand the retrieval query with recent turns so follow-up/pronoun
      // questions ("gimana cara pakainya?") retrieve against the actual
      // topic being discussed, not just their own few, often-generic
      // words. Only affects what's used for ranking — the model still
      // sees the real conversation history separately, unchanged.
      const retrievalQuery = buildRetrievalQuery(userQuery, conv.messages);
      const targetCtx = conv.numCtx ?? proj.numCtx ?? settings.numCtx ?? 16384;
      const dynamicBudgets = calculateDynamicTokenBudgets(targetCtx);
      const knowledgeResult = await buildOptimizedKnowledgeContextAsync(
        proj.files,
        retrievalQuery,
        dynamicBudgets.knowledgeBudget,
        {
          ollamaUrl: settings.ollamaUrl,
          embeddingModel: settings.embeddingModel,
          enabled: Boolean(settings.semanticRagEnabled),
          semanticWeight: proj.ragSemanticWeight,
          rrfK: proj.ragRrfK,
          hyde: {
            enabled: Boolean(proj.ragHydeEnabled),
            model: proj.ragHydeModel || proj.defaultModel || settings.defaultModel,
          },
        },
        {
          chunkSizeChars: proj.ragChunkSizeChars,
          chunkOverlapChars: proj.ragChunkOverlapChars,
          topK: proj.ragTopK,
          rrfK: proj.ragRrfK,
          stitchAdjacent: proj.ragStitchChunks ?? true,
          rerank: {
            enabled: proj.ragRerankEnabled ?? true,
            model: proj.ragRerankModel || proj.defaultModel || settings.defaultModel,
            minScore: proj.ragRerankMinScore,
          },
        }
      );
      if (knowledgeResult.contextText) {
        dynamicContext = knowledgeResult.contextText;
        retrievedChunks = knowledgeResult.retrievedChunks;
        if (knowledgeResult.isChunked) {
          knowledgeNotice = `*Retrieved ${knowledgeResult.matchedChunksCount} most relevant passages from ${knowledgeResult.matchedFiles.join(", ")} (~${knowledgeResult.totalEstimatedTokens} tokens)*\n\n`;
        }
      }
    }

    // 2. Inject Active Agentic Skills (Static)
    const activeSkills = settings.skills || DEFAULT_SKILLS;
    const skillsPrompt = composeSkillsPrompt(activeSkills, conv.activeSkillIds);
    if (skillsPrompt) {
      basePrompt = `${basePrompt}${skillsPrompt}`;
    }

    // 3. Inject Thinking / Reasoning Mode Directive (Static)
    const currentMode = conv.thinkingMode || thinkingMode || settings.thinkingMode || "default";
    if (currentMode === "think") {
      basePrompt += "\n\n=== DEEP THINKING & REASONING MODE: ACTIVE ===\nYou MUST think through this step-by-step and write out your detailed analytical reasoning before providing your final answer. Wrap your internal thoughts in <think>...</think> tags.\n";
    }

    // 4. Inject Persistent User Memory & Personalization (Static & Prefix-Stable)
    const memoryConfig = settings.memory || DEFAULT_MEMORY_CONFIG;
    if (memoryConfig && memoryConfig.items && memoryConfig.items.length > 0) {
      const activeMemories = memoryConfig.items
        .filter((m) => m.enabled)
        .sort((a, b) => a.id.localeCompare(b.id));
      if (activeMemories.length > 0) {
        let memorySection = "\n\n=== PERSISTENT USER MEMORY & CONTEXT ===\n";
        memorySection += "The following are persistent facts, preferences, and background about the user. Always respect these across all answers:\n";
        for (const mem of activeMemories) {
          memorySection += `- ${mem.title}: ${mem.content}\n`;
        }
        memorySection += "=== END OF USER MEMORY ===\n\n";
        basePrompt = `${basePrompt}${memorySection}`;
      }
    }

    // 4b. Inject Project-Specific Memories (Static & Prefix-Stable)
    if (proj && proj.memories && proj.memories.length > 0) {
      const activeProjMemories = proj.memories
        .filter((m) => m.enabled)
        .sort((a, b) => a.id.localeCompare(b.id));
      if (activeProjMemories.length > 0) {
        let projMemSection = `\n\n=== PROJECT MEMORIES: ${proj.name.toUpperCase()} ===\n`;
        projMemSection += "The following are key facts, constraints, and project rules specific to this project. Always respect them in this workspace:\n";
        for (const mem of activeProjMemories) {
          projMemSection += `- ${mem.title}: ${mem.content}\n`;
        }
        projMemSection += "=== END OF PROJECT MEMORIES ===\n\n";
        basePrompt = `${basePrompt}${projMemSection}`;
      }
    }

    // 5. Inject Active Suite Plugins (Static)
    const activePlugins = (settings.plugins || DEFAULT_PLUGINS).filter((p) => p.installed);
    if (activePlugins.length > 0) {
      let pluginsSection = "\n\n=== ACTIVE WORKSPACE SUITE PLUGINS ===\n";
      pluginsSection += "The user has activated the following specialized workspace plugins. Adopt their standards, workflows, and expertise:\n";
      for (const pl of activePlugins) {
        if (pl.systemPrompt) {
          pluginsSection += `\n[Plugin: ${pl.name}]\n${pl.systemPrompt}\n`;
        }
      }
      pluginsSection += "=== END OF SUITE PLUGINS ===\n\n";
      basePrompt = `${basePrompt}${pluginsSection}`;
    }

    // 6. Inject Connected Live Services & Tools (Static)
    const activeConnectors = (settings.connectors || DEFAULT_CONNECTORS).filter((c) => c.installed);
    if (activeConnectors.length > 0) {
      let connectorsSection = "\n\n=== CONNECTED WORKSPACE SERVICES & TOOLS ===\n";
      connectorsSection += "The following external services and live tools are connected and available in this workspace:\n";
      for (const conn of activeConnectors) {
        connectorsSection += `- ${conn.name}: ${conn.description} (${conn.isLiveConnected ? "LIVE CONNECTED" : "CONFIGURED"}${conn.repo ? `, Default Repo: ${conn.repo}` : ""})\n`;
      }
      connectorsSection += "You can reference these connected capabilities when answering. The user can trigger any of them with `/bridge <bridge-id> <message>`.\n";
      connectorsSection += "=== END OF CONNECTED SERVICES ===\n\n";
      basePrompt = `${basePrompt}${connectorsSection}`;
    }

    const staticPrompt = basePrompt;
    const legacyCombinedPrompt = dynamicContext ? `${basePrompt}${dynamicContext}` : basePrompt;

    return {
      prompt: legacyCombinedPrompt,
      staticPrompt,
      dynamicContext,
      knowledgeNotice,
      retrievedChunks,
    };
  };

  /**
   * Advisory-only hardware signal check, after a local Ollama response
   * finishes. Never auto-switches anything — this app is approval-gated by
   * design (see the revert/approval-queue code), so silently swapping which
   * model answers the user's next message would be the one place that
   * philosophy got quietly abandoned. It only ever surfaces a dismissible
   * hint the user can act on themselves.
   *
   * Fire-and-forget like runMemoryExtraction above: every failure path is
   * swallowed, because a hint about hardware pressure must never be able to
   * disturb a conversation that already succeeded.
   */
  const checkHardwareSignals = async (modelName: string) => {
    if (detectModelProvider(modelName) !== "ollama") return; // cloud models: not applicable

    try {
      const [vram, battery] = await Promise.all([
        checkVramPressure(settings.ollamaUrl, modelName),
        getBatterySignal(),
      ]);

      const batteryLow = isBatteryConstrained(battery);
      if (vram?.constrained || batteryLow) {
        setHardwareHint({ modelName, vramRatio: vram?.vramRatio ?? 1, batteryLow });
      }
    } catch {
      // Best-effort only — never surface this failure to the user.
    }
  };

  // Send Message Logic
  /**
   * Extracts durable memories from a completed exchange, if the user has
   * auto-memory enabled. Fully fire-and-forget: every failure path is
   * swallowed, because nothing about learning a fact should be able to
   * disturb a conversation that already succeeded.
   */
  const runMemoryExtraction = async (userMessage: string, assistantMessage: string) => {
    const memoryConfig = settings.memory || DEFAULT_MEMORY_CONFIG;
    if (!memoryConfig.generateFromChats) return;
    if (!userMessage?.trim() || !assistantMessage?.trim()) return;
    // Very short exchanges ("ok", "thanks") carry nothing durable and
    // aren't worth a model call.
    if (assistantMessage.trim().length < 80) return;

    const extractionModel = settings.defaultModel || selectedModel;
    if (!extractionModel) return;

    try {
      const res = await apiFetch("/api/memory/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage,
          assistantMessage,
          existingMemories: memoryConfig.items || [],
          includeSensitive: Boolean(memoryConfig.includeSensitive),
          ollamaUrl: settings.ollamaUrl,
          model: extractionModel,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.success || !data.changed || !Array.isArray(data.items)) return;

      setSettings((prev) => {
        const next = {
          ...prev,
          memory: { ...(prev.memory || DEFAULT_MEMORY_CONFIG), items: data.items },
        };
        storage.saveSettings(next);
        return next;
      });
    } catch {
      // Intentionally silent — see the doc comment above.
    }
  };

  // Fires the queued message the moment the current stream finishes.
  // Watches the isStreaming transition rather than being called from
  // each of the ~10 individual setIsStreaming(false) call sites (regular
  // send, regenerate, edit-resend, agent runs, error paths, etc.) — a
  // single watcher here can't be missed by a future call site that
  // forgets to also trigger the queue.
  useEffect(() => {
    if (!isStreaming && queuedMessage) {
      const text = queuedMessage;
      setQueuedMessage(null);
      handleSendMessage(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  const handleSendMessage = async (overrideText?: string) => {
    // Defense-in-depth against a real bug that shipped: a bare
    // `onClick={onSend}` in ChatInput.tsx (fixed there too) let React pass
    // the raw MouseEvent as this function's first argument instead of
    // undefined, since a function whose only parameter is optional is
    // structurally assignable to `() => void` — TypeScript never caught
    // it. `overrideText ?? input` then kept the (truthy, non-string) event
    // instead of falling back to `input`, and `.trim()` threw. Normalizing
    // here means any future accidental bare-reference callback (in this
    // file or elsewhere) fails safe — falls back to the real input —
    // instead of crashing the whole page.
    const safeOverrideText = typeof overrideText === "string" ? overrideText : undefined;
    const trimmedInput = (safeOverrideText ?? input).trim();
    const currentAttachments = safeOverrideText ? [] : [...attachments];

    if ((!trimmedInput && currentAttachments.length === 0) || isStreaming || !selectedModel) return;

    let targetConv = activeConversation;
    let targetId = activeId;

    const proj = activeProjectId ? projects.find((p) => p.id === activeProjectId) : null;
    const initialTitle = trimmedInput
      ? trimmedInput.slice(0, 30)
      : currentAttachments[0]?.name || (proj ? `${proj.name} Chat` : "New Chat");

    if (!targetConv || !targetId) {
      targetId = `conv_${Date.now()}`;
      targetConv = {
        id: targetId,
        title: initialTitle,
        projectId: activeProjectId || undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: proj?.defaultModel || selectedModel,
        systemPrompt: proj?.systemPrompt || settings.defaultSystemPrompt,
        temperature: proj?.temperature ?? settings.temperature,
        topP: proj?.topP ?? settings.topP,
        topK: proj?.topK,
        numCtx: proj?.numCtx,
        numPredict: proj?.numPredict,
        repeatPenalty: proj?.repeatPenalty,
        thinkingMode: proj?.thinkingMode,
        seed: proj?.seed,
        stopSequences: proj?.stopSequences,
        messages: [],
      };
      const updated = [targetConv, ...conversations];
      updateConversations(updated);
      setActiveId(targetId);
      storage.saveActiveConversationId(targetId);
    }

    const userMessage: Message = {
      id: `msg_user_${Date.now()}`,
      role: "user",
      content: trimmedInput,
      attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
      timestamp: Date.now(),
    };

    let searchSources: any[] = [];
    let searchContextText = "";

    // Check for OWASP Security Audit Scan Intent (/scan <url> or "scan security <url>")
    const isScanCommand =
      trimmedInput.startsWith("/scan") ||
      /^(scan|audit|cek keamanan|uji keamanan|security scan)\s+(web|website|security\s+)?/i.test(trimmedInput);

    let scanTargetUrl = "";
    if (isScanCommand) {
      const urlCandidate = trimmedInput
        .replace(/^\/scan\s*/i, "")
        .replace(/^(scan|audit|cek keamanan|uji keamanan|security scan)\s+(web|website|security\s+)?/i, "")
        .trim();
      const match = urlCandidate.match(/(?:https?:\/\/|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s]*)/i);
      if (match) {
        scanTargetUrl = match[0].replace(/[>)"']+$/, "");
      }
    }

    // Strict Mode: Real-time web search and live scraping ONLY execute when the user explicitly enables the Web Search toggle or uses /search
    const isExplicitSearchCommand = /^\/search\s+/i.test(trimmedInput);
    const searchInput = isExplicitSearchCommand
      ? trimmedInput.replace(/^\/search\s+/i, "").trim()
      : trimmedInput;

    // Check for URL Ingestion Intent (/url <url> [question...])
    const isUrlCommand = /^\/url(\s+|$)/i.test(trimmedInput);
    let urlCommandTarget = "";
    let urlCommandQuestion = "";
    if (isUrlCommand) {
      const remainder = trimmedInput.replace(/^\/url\s*/i, "").trim();
      if (remainder) {
        const parts = remainder.split(/\s+/);
        urlCommandTarget = parts[0];
        urlCommandQuestion = parts.slice(1).join(" ").trim();
        if (urlCommandTarget && !/^https?:\/\//i.test(urlCommandTarget)) {
          urlCommandTarget = `https://${urlCommandTarget}`;
        }
      }
    }

    const shouldRunSearch = Boolean(
      !isScanCommand && !isUrlCommand && (webSearchActive || isExplicitSearchCommand) && searchInput
    );

    // Multi-turn context resolution: resolve anaphoric follow-up references using previous conversation turn
    const lastUserMsg = [...targetConv.messages].reverse().find((m) => m.role === "user");
    const lastAssistantMsg = [...targetConv.messages].reverse().find((m) => m.role === "assistant");

    const { cleanQuery: cleanSearchQueryStr } = shouldRunSearch
      ? reformulateSearchQuery(searchInput, {
          previousQuery: lastUserMsg?.content,
          lastAssistantContent: lastAssistantMsg?.content,
        })
      : { cleanQuery: "" };

    // Live connector operations moved to a generic bridge model: a user
    // adds their own custom bridge (webhook or local-http) via Directory
    // > Connectors, then triggers it with `/bridge <bridge-id> <message>`.
    // The old /github, /slack, /discord, /blender slash-commands and
    // their per-service hardcoded logic (GitHub API calls, Blender's bpy
    // auto-inject, etc.) are gone — those were tied to specific
    // pre-built templates that no longer exist (see lib/directoryData.ts's
    // now-empty DEFAULT_CONNECTORS).
    let connectorContextText = "";
    let connectorNotice = "";

    if (trimmedInput.startsWith("/bridge")) {
      const cleanCmd = trimmedInput.replace(/^\/bridge\s*/, "").trim();
      const [bridgeId, ...messageParts] = cleanCmd.split(/\s+/);
      const message = messageParts.join(" ");
      const bridge = (settings.connectors || []).find((c) => c.id === bridgeId);

      if (!bridge) {
        connectorNotice = `*No bridge found with id \`${bridgeId || "(none given)"}\`. Usage: \`/bridge <bridge-id> <message>\`. Add one in Directory > Connectors.*\n\n`;
      } else if (bridge.customBridgeType === "webhook") {
        try {
          let payload: any = { text: message || "Notification from Castalia Workspace" };
          if (bridge.defaultPayload) {
            try {
              payload = JSON.parse(bridge.defaultPayload.replace(/\{\{message\}\}/g, message || ""));
            } catch {
              // Malformed saved payload template — fall back to the
              // plain-text default rather than failing the whole command.
            }
          }
          const res = await apiFetch("/api/connectors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "webhook_send",
              webhookUrl: bridge.webhookUrl,
              payload,
            }),
          });
          const data = await res.json().catch(() => ({}));
          connectorNotice = data.success
            ? `*Dispatched to bridge \`${bridge.name}\`.*\n\n`
            : `*Bridge \`${bridge.name}\` error: ${data.error || "unknown"}*\n\n`;
        } catch (err: any) {
          connectorNotice = `*Failed to reach bridge \`${bridge.name}\`: ${err.message}*\n\n`;
        }
      } else if (bridge.customBridgeType === "local-http") {
        try {
          const res = await apiFetch("/api/connectors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "local_bridge_execute",
              endpoint: bridge.endpoint,
              apiKey: bridge.apiKey,
              payload: { message },
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (data.success) {
            connectorNotice = `*Bridge \`${bridge.name}\` executed: ${data.message || "OK"}*\n\n`;
          } else if (data.isBridgeOffline) {
            connectorNotice = `*Bridge \`${bridge.name}\` is offline. Make sure the app is running at \`${bridge.endpoint}\`.*\n\n`;
          } else {
            connectorNotice = `*Bridge \`${bridge.name}\` error: ${data.error || data.message || "unknown"}*\n\n`;
          }
        } catch (err: any) {
          connectorNotice = `*Failed to reach bridge \`${bridge.name}\`: ${err.message}*\n\n`;
        }
      } else {
        connectorNotice = `*Bridge \`${bridge.name}\` has no configured type. Re-save it in Directory > Connectors.*\n\n`;
      }
    }

    const assistantMessageId = `msg_ast_${Date.now() + 1}`;
    const assistantPlaceholder: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: connectorNotice,
      timestamp: Date.now(),
      model: selectedModel,
      sources: undefined,
      searchSteps: shouldRunSearch
        ? {
            step: "searching",
            query: cleanSearchQueryStr,
          }
        : undefined,
    };

    const newMessages = [...targetConv.messages, userMessage, assistantPlaceholder];

    const isFirstMessage = targetConv.messages.length === 0;
    const newTitle = isFirstMessage
      ? isUrlCommand && urlCommandTarget
        ? `Docs: ${urlCommandTarget.replace(/^https?:\/\//i, "").slice(0, 26)}`
        : trimmedInput
        ? trimmedInput.slice(0, 32).replace(/\n/g, " ") + (trimmedInput.length > 32 ? "..." : "")
        : `File: ${currentAttachments[0]?.name || "Attachment"}`
      : targetConv.title;

    const convWithNewMessages = {
      ...targetConv,
      title: newTitle,
      updatedAt: Date.now(),
      model: selectedModel,
      messages: newMessages,
    };

    const nextConversations = conversations.map((c) =>
      c.id === targetId ? convWithNewMessages : c
    );
    if (!conversations.some((c) => c.id === targetId)) {
      nextConversations.unshift(convWithNewMessages);
    }
    updateConversations(nextConversations);

    setInput("");
    setAttachments([]);
    setIsStreaming(true);
    setLiveStats(undefined);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Execute OWASP Security Audit Scan if requested
      let owaspScanResult: OwaspScanResult | undefined = undefined;
      let owaspContextText = "";

      if (isScanCommand && scanTargetUrl) {
        try {
          const scanRes = await apiFetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: scanTargetUrl }),
          });

          if (scanRes.ok) {
            const scanData = await scanRes.json();
            if (scanData.scan) {
              const scan: OwaspScanResult = scanData.scan;
              owaspScanResult = scan;
              assistantPlaceholder.owaspScan = scan;

              // Format structured auditor directive context for LLM
              owaspContextText = `\n\n=== OWASP TOP 10 PASSIVE WEB SECURITY SCAN REPORT ===\n`;
              owaspContextText += `Target URL: ${scan.targetUrl}\n`;
              owaspContextText += `Security Grade: ${scan.grade} (Score: ${scan.score}/100)\n`;
              owaspContextText += `Headers Summary: CSP=${scan.headersSummary.csp ? "YES" : "MISSING"}, HSTS=${scan.headersSummary.hsts ? "YES" : "MISSING"}, X-Frame-Options=${scan.headersSummary.xFrameOptions ? "YES" : "MISSING"}, X-Content-Type-Options=${scan.headersSummary.xContentTypeOptions ? "YES" : "MISSING"}, Referrer-Policy=${scan.headersSummary.referrerPolicy ? "YES" : "MISSING"}, Permissions-Policy=${scan.headersSummary.permissionsPolicy ? "YES" : "MISSING"}\n`;
              if (scan.headersSummary.serverBannerExposed) {
                owaspContextText += `Exposed Server Banner: ${scan.headersSummary.serverBannerExposed}\n`;
              }
              owaspContextText += `Cookies: Total=${scan.cookiesSummary.total}, Missing HttpOnly=${scan.cookiesSummary.missingHttpOnly}, Missing Secure=${scan.cookiesSummary.missingSecure}, Missing SameSite=${scan.cookiesSummary.missingSameSite}\n`;
              owaspContextText += `Passive Files: security.txt=${scan.securityTxtPresent ? "Present" : "Missing"}, robots.txt=${scan.robotsTxtPresent ? "Present" : "Missing"}\n`;
              if (scan.techDetected && scan.techDetected.length > 0) {
                owaspContextText += `Technologies Detected: ${scan.techDetected.join(", ")}\n`;
              }

              owaspContextText += `\nFindings (${scan.findings.length} total):\n`;
              scan.findings.forEach((f, idx) => {
                owaspContextText += `[${idx + 1}] [${f.status.toUpperCase()}] [Severity: ${f.severity.toUpperCase()}] [${f.category}]\n`;
                owaspContextText += `    Title: ${f.title}\n`;
                owaspContextText += `    Description: ${f.description}\n`;
                if (f.evidence) owaspContextText += `    Evidence: ${f.evidence}\n`;
                owaspContextText += `    Recommendation: ${f.recommendation}\n`;
                if (f.cwe) owaspContextText += `    Reference: ${f.cwe}\n`;
              });

              owaspContextText += `\n=== INSTRUCTIONS FOR OWASP SECURITY AUDITOR ===\n`;
              owaspContextText += `You are an elite Application Security Engineer & Penetration Testing Auditor.\n`;
              owaspContextText += `Provide a professional, executive-grade penetration audit report in Indonesian / English matching the user's prompt based strictly on the scan findings above:\n`;
              owaspContextText += `1. **Ringkasan Eksekutif & Skor Keamanan**: Evaluasi grade (${scan.grade}) dan postur risiko target saat ini.\n`;
              owaspContextText += `2. **Analisis Temuan OWASP Top 10**: Jelaskan dampak praktis dari kelemahan yang ditemukan (misal: MITM risk akibat ketiadaan HSTS, XSS blast radius akibat CSP kosong, CSRF/session hijack akibat cookie flags).\n`;
              owaspContextText += `3. **Langkah Remediasi Konkret**: Berikan snippet konfigurasi server (Nginx/Apache/Cloudflare) dan kode implementasi untuk menambal kelemahan tersebut.\n\n`;

              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== targetId) return c;
                  return {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === assistantMessageId
                        ? { ...m, owaspScan: scan }
                        : m
                    ),
                  };
                })
              );
            }
          }
        } catch (scanErr) {
          console.warn("OWASP scan failed:", scanErr);
        }
      }

      // Execute live web search & scraping with step updates if requested
      if (shouldRunSearch) {
        try {
          const searchRes = await apiFetch("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: cleanSearchQueryStr,
              deepScrape: settings.deepScrapeEnabled !== false,
            }),
          });

          if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (searchData.results && searchData.results.length > 0) {
              searchSources = searchData.results;
              const domains = searchData.results
                .map((r: any) => {
                  try {
                    return new URL(r.url).hostname.replace(/^www\./, "");
                  } catch {
                    return "";
                  }
                })
                .filter(Boolean);
              const scrapedCount = searchData.results.filter((r: any) => r.scraped).length;

              const now = new Date();
              const formattedDate = now.toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              });

              searchContextText = `\n\n=== TEMPORAL GROUNDING & CURRENT REAL-TIME ===\n`;
              searchContextText += `Current Date: ${formattedDate} (${now.toISOString().split("T")[0]}).\n`;
              searchContextText += `Current Year: ${now.getFullYear()}.\n`;
              searchContextText += `CRITICAL TEMPORAL DIRECTIVE: You are an AI assistant operating in ${now.getFullYear()}. The real-time web search and news results below reflect current events. Do NOT state that your knowledge is cut off in 2023 or 2024. Use the live real-time information below to answer accurately.\n\n`;
              searchContextText += "=== REAL-TIME WEB & SCRAPED PAGE CONTENT ===\n";
              searchSources.forEach((src: any, idx: number) => {
                searchContextText += `[${idx + 1}] "${src.title}"\nURL: ${src.url}\nSummary: ${src.snippet}\n`;
                if (src.deepContent) {
                  searchContextText += `Scraped Content:\n${src.deepContent}\n`;
                }
                searchContextText += "\n";
              });
              searchContextText += "=== INSTRUCTIONS ===\n";
              searchContextText += "Answer the user's prompt using the real-time web search and scraped web page results above. You have actual full access to the scraped webpage content. Cite references using [1], [2], etc., when stating specific facts.\n\n";

              const doneStepInfo: SearchStepInfo = {
                step: "done",
                query: cleanSearchQueryStr,
                sourceCount: searchSources.length,
                scrapedCount,
                scrapedDomains: domains,
              };
              assistantPlaceholder.searchSteps = doneStepInfo;
              assistantPlaceholder.sources = searchSources;

              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== targetId) return c;
                  return {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === assistantMessageId
                        ? {
                            ...m,
                            sources: searchSources,
                            searchSteps: doneStepInfo,
                          }
                        : m
                    ),
                  };
                })
              );
            }
          }
        } catch (searchErr) {
          console.warn("Web search failed:", searchErr);
        }
      }

      // Execute URL / Web Documentation Ingestion if requested (/url <url> [question])
      let urlIngestContextText = "";
      let urlNotice = "";

      if (isUrlCommand) {
        if (!urlCommandTarget) {
          const usageNotice = "*Usage: `/url <url> [question]` — Ingest a web documentation page or article into context or project knowledge.*\n\n*Example:* `/url https://docs.rs/tokio/latest/tokio/ Explain the runtime architecture*";
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== targetId) return c;
              const msgs = c.messages.map((m) =>
                m.id === assistantMessageId ? { ...m, content: usageNotice } : m
              );
              return { ...c, messages: msgs };
            })
          );
          setIsStreaming(false);
          return;
        }

        try {
          const ingestRes = await apiFetch("/api/projects/ingest-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: urlCommandTarget }),
          });

          const ingestData = await ingestRes.json().catch(() => ({}));
          if (ingestRes.ok && ingestData.success && ingestData.file) {
            const ingestedFile: ProjectFile = ingestData.file;
            const docTitle = ingestData.title || urlCommandTarget;
            const docUrl = ingestData.url || urlCommandTarget;

            // If an active project is selected, persist file into project knowledge
            if (proj) {
              const existingIdx = proj.files.findIndex((f) => f.name === ingestedFile.name);
              const nextFiles = existingIdx >= 0
                ? proj.files.map((f) => (f.name === ingestedFile.name ? ingestedFile : f))
                : [...proj.files, ingestedFile];
              const updatedProj = { ...proj, files: nextFiles, updatedAt: Date.now() };
              handleSaveProject(updatedProj);
            }

            urlNotice = `*Ingested documentation from [${docTitle}](${docUrl}) (${formatBytes(ingestedFile.size)}) into ${proj ? `project "${proj.name}" & ` : ""}context.*\n\n`;

            urlIngestContextText = `\n\n=== INGESTED DOCUMENTATION (${docTitle}) ===\nSource URL: ${docUrl}\n\n${ingestedFile.textContent}\n=== END OF INGESTED DOCUMENTATION ===\n\n`;

            const docSnippet = (ingestedFile.textContent || "").slice(0, 300).replace(/\s+/g, " ");
            const urlSource = {
              title: docTitle,
              url: docUrl,
              snippet: docSnippet,
            };
            searchSources = [urlSource];

            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== targetId) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          sources: [urlSource],
                        }
                      : m
                  ),
                };
              })
            );
          } else {
            const failNotice = `*Failed to ingest URL [${urlCommandTarget}](${urlCommandTarget}): ${ingestData.error || "Unknown error"}*\n\n`;
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== targetId) return c;
                const msgs = c.messages.map((m) =>
                  m.id === assistantMessageId ? { ...m, content: failNotice } : m
                );
                return { ...c, messages: msgs };
              })
            );
            setIsStreaming(false);
            return;
          }
        } catch (ingestErr: any) {
          const failNotice = `*Failed to fetch URL [${urlCommandTarget}](${urlCommandTarget}): ${ingestErr?.message || "Network error"}*\n\n`;
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== targetId) return c;
              const msgs = c.messages.map((m) =>
                m.id === assistantMessageId ? { ...m, content: failNotice } : m
              );
              return { ...c, messages: msgs };
            })
          );
          setIsStreaming(false);
          return;
        }
      }

      const {
        prompt: baseEffectivePrompt,
        staticPrompt,
        dynamicContext: ragDynamicContext,
        knowledgeNotice,
        retrievedChunks,
      } = await getEffectiveSystemPrompt(convWithNewMessages, trimmedInput);
      const effectiveDiskToolsActive =
        diskToolsActive || skillsRequireDiskTools(settings.skills || DEFAULT_SKILLS, convWithNewMessages.activeSkillIds);
      let accumulatedText = `${urlNotice}${connectorNotice}${knowledgeNotice}`;

      // Dynamic contexts for this turn (RAG + search + OWASP + connector + url)
      let combinedDynamicContext = ragDynamicContext || "";
      if (searchContextText) {
        combinedDynamicContext = combinedDynamicContext
          ? `${combinedDynamicContext}\n\n${searchContextText}`
          : searchContextText;
      }
      if (owaspContextText) {
        combinedDynamicContext = combinedDynamicContext
          ? `${combinedDynamicContext}\n\n${owaspContextText}`
          : owaspContextText;
      }
      if (connectorContextText) {
        combinedDynamicContext = combinedDynamicContext
          ? `${combinedDynamicContext}\n\n${connectorContextText}`
          : connectorContextText;
      }
      if (urlIngestContextText) {
        combinedDynamicContext = combinedDynamicContext
          ? `${combinedDynamicContext}\n\n${urlIngestContextText}`
          : urlIngestContextText;
      }

      // Check Smart Context mode (default: true)
      const isSmartContext = settings.smartContextEnabled ?? true;

      // In Smart Context mode:
      // - systemPrompt is pure STATIC (basePrompt + directives + tool directive)
      // - dynamic context is injected into the active user turn
      let effectiveSystemPrompt = baseEffectivePrompt;
      const isOllamaProvider = detectModelProvider(selectedModel) === "ollama";

      if (isSmartContext) {
        effectiveSystemPrompt = effectiveDiskToolsActive && !isOllamaProvider
          ? `${staticPrompt}\n\n${buildToolDirectivePrompt()}`
          : staticPrompt;
      } else {
        if (searchContextText) {
          effectiveSystemPrompt = `${effectiveSystemPrompt}${searchContextText}`;
        }
        if (owaspContextText) {
          effectiveSystemPrompt = `${effectiveSystemPrompt}${owaspContextText}`;
        }
        if (connectorContextText) {
          effectiveSystemPrompt = `${effectiveSystemPrompt}${connectorContextText}`;
        }
        if (urlIngestContextText) {
          effectiveSystemPrompt = `${effectiveSystemPrompt}${urlIngestContextText}`;
        }
        if (effectiveDiskToolsActive && !isOllamaProvider) {
          effectiveSystemPrompt = `${effectiveSystemPrompt}\n\n${buildToolDirectivePrompt()}`;
        }
      }

      // Enforce Context Window Budget dynamically
      const targetCtx = targetConv.numCtx ?? proj?.numCtx ?? settings.numCtx ?? resolveEffectiveNumCtxSync(selectedModel);
      const dynamicBudgets = calculateDynamicTokenBudgets(targetCtx);
      const historyBudget = dynamicBudgets.historyBudget;
      const rawMessagesToSend = newMessages.slice(0, -1);
      const budgetedMessages = trimChatHistoryForBudget(rawMessagesToSend, historyBudget, {
        smartShift: isSmartContext,
        condensedSummary: targetConv.condensedSummary,
      });

      // If smart context is enabled and there is dynamic context, inject into the active user turn message
      let finalMessagesToSend = budgetedMessages;
      if (isSmartContext && combinedDynamicContext && finalMessagesToSend.length > 0) {
        finalMessagesToSend = finalMessagesToSend.map((m, idx) => {
          if (idx === finalMessagesToSend.length - 1 && m.role === "user") {
            const effectiveUserContent = isUrlCommand
              ? (urlCommandQuestion || "Please provide a comprehensive summary and key takeaways of this documentation page.")
              : m.content;
            return {
              ...m,
              content: formatUserEphemeralContext(effectiveUserContent, combinedDynamicContext),
            };
          }
          return m;
        });
      } else if (isUrlCommand && finalMessagesToSend.length > 0) {
        finalMessagesToSend = finalMessagesToSend.map((m, idx) => {
          if (idx === finalMessagesToSend.length - 1 && m.role === "user") {
            const effectiveUserContent = urlCommandQuestion || "Please provide a comprehensive summary and key takeaways of this documentation page.";
            return {
              ...m,
              content: effectiveUserContent,
            };
          }
          return m;
        });
      }

      // Compute deterministic cache key for identical prompt detection
      const cacheKey = computePromptCacheKey({
        model: selectedModel,
        prompt: trimmedInput,
        systemPrompt: effectiveSystemPrompt,
        temperature: targetConv.temperature ?? settings.temperature,
        topP: targetConv.topP ?? settings.topP,
        numCtx: targetCtx,
        seed: targetConv.seed ?? proj?.seed,
        diskToolsActive: effectiveDiskToolsActive,
      });

      // Skip re-generation if exact or semantically identical response is cached
      let queryEmbedding: number[] | undefined = undefined;
      if (!searchContextText) {
        let cached = await getCachedPromptResponse(cacheKey);

        // Try semantic response cache if exact hash missed and embeddings are enabled
        if (!cached && settings.semanticRagEnabled && settings.ollamaUrl) {
          try {
            const emb = await embedOne(trimmedInput, {
              ollamaUrl: settings.ollamaUrl,
              model: settings.embeddingModel,
              timeoutMs: 1200,
            });
            if (emb) {
              queryEmbedding = emb;
              cached = await findSemanticCachedResponse({
                model: selectedModel,
                queryEmbedding: emb,
                similarityThreshold: 0.96,
              });
            }
          } catch {}
        }

        if (cached) {
          setConversations((prev) => {
            const finished = prev.map((c) => {
              if (c.id !== targetId) return c;
              const msgs = c.messages.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content: cached.content,
                      reasoning: cached.reasoning,
                      metrics: cached.metrics,
                      servedFromCache: true,
                      sources: cached.sources,
                      retrievedChunks: cached.retrievedChunks || retrievedChunks,
                      toolExecutions: cached.toolExecutions,
                    }
                  : m
              );
              return { ...c, messages: msgs, updatedAt: Date.now() };
            });
            storage.saveConversations(finished);
            return finished;
          });
          setIsStreaming(false);
          return;
        }
      }

      const tokenThrottler = createStreamThrottler((latestText) => {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== targetId) return c;
            const msgs = c.messages.map((m) =>
              m.id === assistantMessageId ? { ...m, content: latestText } : m
            );
            return { ...c, messages: msgs };
          })
        );
      });

      const reasoningThrottler = createStreamThrottler((latestReasoning) => {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== targetId) return c;
            const msgs = c.messages.map((m) =>
              m.id === assistantMessageId ? { ...m, reasoning: latestReasoning } : m
            );
            return { ...c, messages: msgs };
          })
        );
      });

      let accumulatedReasoning = "";
      await streamChatCompletion({
        hostUrl: settings.ollamaUrl,
        model: selectedModel,
        messages: finalMessagesToSend,
        systemPrompt: effectiveSystemPrompt,
        temperature: targetConv.temperature ?? settings.temperature,
        topP: targetConv.topP ?? settings.topP,
        topK: targetConv.topK ?? proj?.topK ?? settings.topK,
        minP: targetConv.minP ?? proj?.minP ?? settings.minP ?? 0.05,
        numCtx: targetCtx,
        numKeep: countTokens(effectiveSystemPrompt),
        numPredict: targetConv.numPredict ?? proj?.numPredict ?? settings.numPredict,
        repeatPenalty: targetConv.repeatPenalty ?? proj?.repeatPenalty ?? settings.repeatPenalty,
        presencePenalty: targetConv.presencePenalty ?? proj?.presencePenalty,
        frequencyPenalty: targetConv.frequencyPenalty ?? proj?.frequencyPenalty,
        seed: targetConv.seed ?? proj?.seed,
        stop: targetConv.stopSequences ?? proj?.stopSequences,
        keepAlive: settings.ollamaKeepAlive || "60m",
        apiKeys: settings.apiKeys,
        tools: effectiveDiskToolsActive ? getNativeOllamaTools() : undefined,
        signal: abortController.signal,
        onReasoning: (rChunk) => {
          accumulatedReasoning += rChunk;
          reasoningThrottler.push(accumulatedReasoning);
        },
        onToken: (chunk, stats) => {
          accumulatedText += chunk;
          if (stats) setLiveStats(stats);
          tokenThrottler.push(accumulatedText);
        },
        onFinish: async (full, metrics, fullReasoning, nativeToolCalls) => {
          tokenThrottler.flush();
          reasoningThrottler.flush();
          let finalFullText = full || accumulatedText;
          const finalReasoning = fullReasoning || accumulatedReasoning || undefined;

          // Disk Tools: primary path uses native tool_calls, falling back to directive parsing
          let toolExecutions: ToolCallExecution[] = [];
          if (effectiveDiskToolsActive) {
            let loopText = finalFullText;
            let toolHistory: Message[] = [
              ...budgetedMessages,
              { id: assistantMessageId, role: "assistant", content: loopText, timestamp: Date.now() },
            ];
            const maxIterations = 3;
            let pendingNativeCalls = nativeToolCalls ? [...nativeToolCalls] : [];

            for (let iteration = 0; iteration < maxIterations; iteration++) {
              let toolName: ToolName | null = null;
              let args: Record<string, any> = {};

              if (pendingNativeCalls.length > 0) {
                const nextCall = pendingNativeCalls.shift()!;
                toolName = nextCall.name as ToolName;
                args = nextCall.args;
              } else {
                const directive = parseToolDirective(loopText);
                if (directive) {
                  toolName = directive.toolName;
                  args = directive.args;
                }
              }

              if (!toolName) break;

              const execId = `tool_${assistantMessageId}_${iteration}`;
              toolExecutions = [
                ...toolExecutions,
                { id: execId, toolName, args, status: "running", timestamp: Date.now() },
              ];
              // Bersihkan baris directive dari teks yang ditampilkan ke user.
              loopText = loopText.replace(/\[TOOL_CALL:[a-z_]+:\{[\s\S]*?\}\]/, "").trim();
              setConversations((prev) =>
                prev.map((c) =>
                  c.id !== targetId
                    ? c
                    : {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === assistantMessageId ? { ...m, content: loopText, toolExecutions } : m
                        ),
                      }
                )
              );

              let toolResultText: string;
              const isMutating = MUTATING_TOOLS.includes(toolName);
              let approvalDecision: "approved" | "rejected" = "approved";
              const chatApprovalId = isMutating ? `chatapproval_${execId}` : undefined;

              if (isMutating) {
                let previousContent: string | undefined;
                if (
                  (toolName === "write_file" || toolName === "delete_file") &&
                  typeof args.path === "string"
                ) {
                  try {
                    const readResult = await executeToolCall("read_file", { path: args.path }, abortController.signal);
                    previousContent = readResult.raw?.content;
                  } catch {
                    // write_file: file doesn't exist yet (new file) or isn't readable —
                    // previousContent stays undefined, diff preview shows it as a new
                    // file. delete_file: same undefined-on-failure, but it also means
                    // this deletion can't be reverted later (nothing to restore).
                  }
                }

                const approval: PendingApproval = {
                  id: chatApprovalId!,
                  source: "chat",
                  conversationId: targetId,
                  toolName,
                  args,
                  status: "pending",
                  createdAt: Date.now(),
                  previousContent,
                };
                setPendingApprovals((prev) => {
                  const next = [approval, ...prev];
                  storage.savePendingApprovals(next);
                  return next;
                });
                toolExecutions = toolExecutions.map((t) =>
                  t.id === execId ? { ...t, status: "awaiting_approval", approvalId: chatApprovalId, previousContent } : t
                );
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id !== targetId
                      ? c
                      : {
                          ...c,
                          messages: c.messages.map((m) =>
                            m.id === assistantMessageId ? { ...m, toolExecutions } : m
                          ),
                        }
                  )
                );

                approvalDecision = await new Promise<"approved" | "rejected">((resolve) => {
                  chatApprovalResolversRef.current.set(chatApprovalId!, resolve);
                });
              }

              if (isMutating && approvalDecision === "rejected") {
                toolExecutions = toolExecutions.map((t) =>
                  t.id === execId ? { ...t, status: "error", error: "Ditolak oleh user." } : t
                );
                toolResultText = `DITOLAK oleh user. Tool '${toolName}' tidak dijalankan. Lanjutkan tanpa hasil ini, atau jelaskan ke user kenapa langkah ini diperlukan jika masih relevan.`;
              } else {
                try {
                  const result = await executeToolCall(
                    toolName,
                    args,
                    abortController.signal,
                    chatApprovalId
                  );
                  toolExecutions = toolExecutions.map((t) =>
                    t.id === execId ? { ...t, status: "success", result: result.raw } : t
                  );
                  toolResultText = JSON.stringify(result.raw).slice(0, 4000);
                } catch (toolErr: any) {
                  toolExecutions = toolExecutions.map((t) =>
                    t.id === execId ? { ...t, status: "error", error: toolErr.message || String(toolErr) } : t
                  );
                  toolResultText = `ERROR: ${toolErr.message || toolErr}`;
                }
              }

              toolHistory = [
                ...toolHistory,
                {
                  id: `${execId}_result`,
                  role: "user",
                  content: `[TOOL_RESULT untuk ${toolName}]:\n${toolResultText}\n\nLanjutkan jawabanmu ke user berdasarkan hasil ini. Jangan panggil tool yang sama dengan argumen sama persis lagi kalau sudah berhasil.`,
                  timestamp: Date.now(),
                },
              ];

              let continuation = "";
              await streamChatCompletion({
                hostUrl: settings.ollamaUrl,
                model: selectedModel,
                messages: toolHistory,
                systemPrompt: effectiveSystemPrompt,
                temperature: targetConv.temperature ?? settings.temperature,
                topP: targetConv.topP ?? settings.topP,
                apiKeys: settings.apiKeys,
                signal: abortController.signal,
                onToken: (chunk) => {
                  continuation += chunk;
                  setConversations((prev) =>
                    prev.map((c) =>
                      c.id !== targetId
                        ? c
                        : {
                            ...c,
                            messages: c.messages.map((m) =>
                              m.id === assistantMessageId
                                ? { ...m, content: `${loopText}\n\n${continuation}`.trim(), toolExecutions }
                                : m
                            ),
                          }
                    )
                  );
                },
                onFinish: (full2) => {
                  continuation = full2 || continuation;
                },
                onError: () => {
                  /* biarkan continuation kosong, loop tetap lanjut/berhenti wajar */
                },
              });

              loopText = `${loopText}\n\n${continuation}`.trim();
              toolHistory = [...toolHistory, { id: `${execId}_continuation`, role: "assistant", content: continuation, timestamp: Date.now() }];
            }

            finalFullText = loopText;
          }

          setConversations((prev) => {
            const finished = prev.map((c) => {
              if (c.id !== targetId) return c;
              const msgs = c.messages.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content: finalFullText,
                      reasoning: finalReasoning,
                      metrics,
                      sources: searchSources.length > 0 ? searchSources : undefined,
                      toolExecutions: toolExecutions.length > 0 ? toolExecutions : undefined,
                      retrievedChunks: retrievedChunks && retrievedChunks.length > 0 ? retrievedChunks : undefined,
                    }
                  : m
              );
              return { ...c, messages: msgs, updatedAt: Date.now() };
            });
            storage.saveConversations(finished);
            return finished;
          });

          // Cache successful response for identical prompt repeats
          if (!searchContextText) {
            setCachedPromptResponse(cacheKey, {
              content: finalFullText,
              reasoning: finalReasoning,
              sources: searchSources.length > 0 ? searchSources : undefined,
              toolExecutions: toolExecutions.length > 0 ? toolExecutions : undefined,
              retrievedChunks: retrievedChunks && retrievedChunks.length > 0 ? retrievedChunks : undefined,
              metrics,
              model: selectedModel,
              embedding: queryEmbedding,
            });
          }

          setIsStreaming(false);
          setLiveStats(undefined);
          abortControllerRef.current = null;

          // Auto-memory: learn durable facts from this exchange. Fired
          // after the answer is fully delivered and never awaited — the
          // user's reply must not wait on extraction, and a failure here
          // must stay invisible. Honors MemoryConfig.generateFromChats,
          // which until now was a persisted setting nothing ever read.
          void runMemoryExtraction(trimmedInput, finalFullText);
          void checkHardwareSignals(selectedModel);
        },
        onError: (err) => {
          setConversations((prev) => {
            const errorState = prev.map((c) => {
              if (c.id !== targetId) return c;
              const msgs = c.messages.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content: `Error: ${err.message || "Failed to generate response."}`,
                      isError: true,
                    }
                  : m
              );
              return { ...c, messages: msgs };
            });
            storage.saveConversations(errorState);
            return errorState;
          });
          setIsStreaming(false);
          setLiveStats(undefined);
          abortControllerRef.current = null;
        },
      });
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Chat completion exception:", err);
      }
      setIsStreaming(false);
      setLiveStats(undefined);
      abortControllerRef.current = null;
    }
  };

  // Interactive Live Voice Call Message Handler
  const handleVoiceCallSendMessage = async (
    spokenText: string,
    tone: string = "casual"
  ): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      const trimmedInput = spokenText.trim();
      if (!trimmedInput || !selectedModel) {
        resolve("Silakan ulangi perkataan kamu ya.");
        return;
      }

      let targetConv = activeConversation;
      let targetId = activeId;
      const proj = activeProjectId ? projects.find((p) => p.id === activeProjectId) : null;

      if (!targetConv || !targetId) {
        targetId = `conv_${Date.now()}`;
        targetConv = {
          id: targetId,
          title: `Voice: ${trimmedInput.slice(0, 24)}`,
          projectId: activeProjectId || undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          model: proj?.defaultModel || selectedModel,
          systemPrompt: proj?.systemPrompt || settings.defaultSystemPrompt,
          temperature: proj?.temperature ?? settings.temperature,
          topP: proj?.topP ?? settings.topP,
          messages: [],
        };
        const updated = [targetConv, ...conversations];
        updateConversations(updated);
        setActiveId(targetId);
        storage.saveActiveConversationId(targetId);
      }

      const userMessage: Message = {
        id: `msg_user_${Date.now()}`,
        role: "user",
        content: trimmedInput,
        timestamp: Date.now(),
      };

      const assistantMessageId = `msg_ast_${Date.now() + 1}`;
      const assistantPlaceholder: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        model: selectedModel,
      };

      const newMessages = [...targetConv.messages, userMessage, assistantPlaceholder];
      const convWithNewMessages = {
        ...targetConv,
        updatedAt: Date.now(),
        messages: newMessages,
      };

      setConversations((prev) =>
        prev.map((c) => (c.id === targetId ? convWithNewMessages : c))
      );

      const { prompt: baseEffectivePrompt } = await getEffectiveSystemPrompt(convWithNewMessages, trimmedInput);

      let toneDirective = "";
      if (tone === "casual") {
        toneDirective = `
[PANDUAN KHUSUS: OBROLAN SUARA SANTAI & AKRAB DALAM BAHASA INDONESIA]
Kamu sedang berbicara langsung dengan pengguna melalui obrolan suara interaktif (Interactive Voice Chat).
ATURAN GAYA BAHASA (WAJIB DIIKUTI):
1. SANGAT SANTAI & AKRAB: Bicaralah dengan gaya bahasa santai, asik, luwes, dan akrab seperti mengobrol santai dengan sahabat atau teman dekat (bukan robot kaku atau CS formal).
2. SAPAAN KASUAL: Gunakan kata ganti "aku" dan "kamu". JANGAN gunakan kata "Anda" karena terlalu kaku dan formal.
3. KATA & PARTIKEL PERCAKAPAN ALAMI: Gunakan kosa kata percakapan santai sehari-hari yang natural: "nih", "deh", "dong", "kan", "loh", "yuk", "aja", "banget", "nggak" / "gak" (bukan "tidak"), "udah" (bukan "sudah"), "gitu", "gimana", "bisa kok", "santai aja", "oke siap".
4. RINGKAS & ENAK DIDENGAR: Karena jawabanmu akan dibacakan langsung melalui suara (Text-to-Speech), buat jawaban SINGKAT, padat, dan to the point (maksimal 1 sampai 3 kalimat pendek). Jangan bertele-tele atau membuat paragraf panjang.
5. HINDARI FORMAT TULISAN: JANGAN gunakan markdown formatting, simbol tebal (* / **), poin-poin/bullet, tabel, atau baris kode program kecuali pengguna secara spesifik memintanya.
6. TANPA BASA-BASI BIROKRATIS: Jangan gunakan pembuka kaku seperti "Tentu saja, apakah ada yang bisa saya bantu?", "Sebagai sebuah AI...", atau kalimat klise lainnya. Langsung jawab dengan asik dan solutif.`;
      } else if (tone === "warm") {
        toneDirective = `
[PANDUAN KHUSUS: OBROLAN SUARA RAMAH & HANGAT]
Kamu sedang berbicara langsung dalam obrolan suara interaktif. Bicaralah dalam Bahasa Indonesia yang ramah, hangat, santai namun tetap sopan dan komunikatif. Gunakan "aku" dan "kamu", buat jawaban ringkas (1-3 kalimat) yang nyaman didengar di telinga tanpa format tulisan markdown atau simbol tebal.`;
      } else {
        toneDirective = `
[PANDUAN KHUSUS: OBROLAN SUARA SINGKAT & CEPAT]
Kamu sedang berbicara langsung dalam obrolan suara interaktif. Jawab langsung to the point dengan super singkat dan santai (1-2 kalimat). Tanpa basa-basi pembuka atau penutup, tanpa format tulisan markdown.`;
      }

      const voiceSystemDirective = `${baseEffectivePrompt}\n\n${toneDirective}`;

      const targetCtx = targetConv.numCtx ?? proj?.numCtx ?? settings.numCtx ?? 16384;
      const historyBudget = Math.max(2000, Math.floor(targetCtx * 0.45));
      const budgetedMessages = trimChatHistoryForBudget(newMessages.slice(0, -1), historyBudget);

      let accumulated = "";
      try {
        await streamChatCompletion({
          hostUrl: settings.ollamaUrl,
          model: selectedModel,
          messages: budgetedMessages,
          systemPrompt: voiceSystemDirective,
          temperature: targetConv.temperature ?? settings.temperature,
          topP: targetConv.topP ?? settings.topP,
          keepAlive: settings.ollamaKeepAlive || "60m",
          apiKeys: settings.apiKeys,
          onToken: (chunk) => {
            accumulated += chunk;
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== targetId) return c;
                const msgs = c.messages.map((m) =>
                  m.id === assistantMessageId ? { ...m, content: accumulated } : m
                );
                return { ...c, messages: msgs };
              })
            );
          },
          onFinish: (full, metrics, fullReasoning) => {
            const finalFull = full || accumulated;

            setConversations((prev) => {
              const finished = prev.map((c) => {
                if (c.id !== targetId) return c;
                const msgs = c.messages.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: finalFull, reasoning: fullReasoning, metrics }
                    : m
                );
                return { ...c, messages: msgs, updatedAt: Date.now() };
              });
              storage.saveConversations(finished);
              return finished;
            });
            resolve(finalFull);
          },
          onError: (err) => {
            reject(err);
          },
        });
      } catch (e) {
        reject(e);
      }
    });
  };

  // Regenerate Response
  const handleRegenerate = async (messageId: string) => {
    if (!activeConversation || isStreaming) return;
    const msgIndex = activeConversation.messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const trimmedHistory = activeConversation.messages.slice(0, msgIndex);
    const lastUserMessage = trimmedHistory.filter((m) => m.role === "user").pop();
    if (!lastUserMessage) return;

    const assistantMessageId = `msg_ast_${Date.now()}`;
    const assistantPlaceholder: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      model: selectedModel,
    };

    const newMessages = [...trimmedHistory, assistantPlaceholder];
    const updatedConv = {
      ...activeConversation,
      messages: newMessages,
      updatedAt: Date.now(),
    };

    const nextConvs = conversations.map((c) => (c.id === activeId ? updatedConv : c));
    updateConversations(nextConvs);
    setIsStreaming(true);
    setLiveStats(undefined);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      let accumulatedText = "";
      const {
        prompt: baseEffectivePrompt,
        staticPrompt,
        dynamicContext,
      } = await getEffectiveSystemPrompt(updatedConv, lastUserMessage.content);

      const isSmartContext = settings.smartContextEnabled ?? true;
      const effectiveSystemPrompt = isSmartContext ? staticPrompt : baseEffectivePrompt;

      // Enforce Dynamic Context Window Budget on regenerated chat
      const targetCtx = activeConversation.numCtx ?? currentProject?.numCtx ?? settings.numCtx ?? resolveEffectiveNumCtxSync(selectedModel);
      const historyBudget = Math.max(2000, Math.floor(targetCtx * 0.45));
      const budgetedMessages = trimChatHistoryForBudget(trimmedHistory, historyBudget, { smartShift: isSmartContext });

      let finalMessagesToSend = budgetedMessages;
      if (isSmartContext && dynamicContext && finalMessagesToSend.length > 0) {
        finalMessagesToSend = finalMessagesToSend.map((m, idx) => {
          if (idx === finalMessagesToSend.length - 1 && m.role === "user") {
            return {
              ...m,
              content: formatUserEphemeralContext(m.content, dynamicContext),
            };
          }
          return m;
        });
      }

      const tokenThrottler = createStreamThrottler((latestText) => {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== activeId) return c;
            const msgs = c.messages.map((m) =>
              m.id === assistantMessageId ? { ...m, content: latestText } : m
            );
            return { ...c, messages: msgs };
          })
        );
      });

      const reasoningThrottler = createStreamThrottler((latestReasoning) => {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== activeId) return c;
            const msgs = c.messages.map((m) =>
              m.id === assistantMessageId ? { ...m, reasoning: latestReasoning } : m
            );
            return { ...c, messages: msgs };
          })
        );
      });

      let accumulatedReasoning = "";
      await streamChatCompletion({
        hostUrl: settings.ollamaUrl,
        model: selectedModel,
        messages: finalMessagesToSend,
        systemPrompt: effectiveSystemPrompt,
        temperature: activeConversation.temperature ?? settings.temperature,
        topP: activeConversation.topP ?? settings.topP,
        topK: activeConversation.topK ?? currentProject?.topK ?? settings.topK,
        numCtx: targetCtx,
        numKeep: countTokens(effectiveSystemPrompt),
        numPredict: activeConversation.numPredict ?? currentProject?.numPredict ?? settings.numPredict,
        repeatPenalty: activeConversation.repeatPenalty ?? currentProject?.repeatPenalty ?? settings.repeatPenalty,
        presencePenalty: activeConversation.presencePenalty ?? currentProject?.presencePenalty,
        frequencyPenalty: activeConversation.frequencyPenalty ?? currentProject?.frequencyPenalty,
        seed: activeConversation.seed ?? currentProject?.seed,
        stop: activeConversation.stopSequences ?? currentProject?.stopSequences,
        keepAlive: settings.ollamaKeepAlive || "60m",
        apiKeys: settings.apiKeys,
        signal: abortController.signal,
        onReasoning: (rChunk) => {
          accumulatedReasoning += rChunk;
          reasoningThrottler.push(accumulatedReasoning);
        },
        onToken: (chunk, stats) => {
          accumulatedText += chunk;
          if (stats) setLiveStats(stats);
          tokenThrottler.push(accumulatedText);
        },
        onFinish: async (full, metrics, fullReasoning) => {
          tokenThrottler.flush();
          reasoningThrottler.flush();
          let finalFullText = full || accumulatedText;
          const finalReasoning = fullReasoning || accumulatedReasoning || undefined;

          setConversations((prev) => {
            const finished = prev.map((c) => {
              if (c.id !== activeId) return c;
              const msgs = c.messages.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: finalFullText, reasoning: finalReasoning, metrics }
                  : m
              );
              return { ...c, messages: msgs, updatedAt: Date.now() };
            });
            storage.saveConversations(finished);
            return finished;
          });
          setIsStreaming(false);
          setLiveStats(undefined);
          abortControllerRef.current = null;
        },
        onError: (err) => {
          setConversations((prev) => {
            const errorState = prev.map((c) => {
              if (c.id !== activeId) return c;
              const msgs = c.messages.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: `Error: ${err.message}`, isError: true }
                  : m
              );
              return { ...c, messages: msgs };
            });
            storage.saveConversations(errorState);
            return errorState;
          });
          setIsStreaming(false);
          setLiveStats(undefined);
          abortControllerRef.current = null;
        },
      });
    } catch {
      setIsStreaming(false);
      setLiveStats(undefined);
      abortControllerRef.current = null;
    }
  };

  // Edit Message
  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!activeConversation) return;
    const msgIndex = activeConversation.messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const updatedMessages = activeConversation.messages
      .slice(0, msgIndex + 1)
      .map((m) => (m.id === messageId ? { ...m, content: newContent } : m));

    const updatedConv = {
      ...activeConversation,
      messages: updatedMessages,
      updatedAt: Date.now(),
    };

    const nextConvs = conversations.map((c) => (c.id === activeId ? updatedConv : c));
    updateConversations(nextConvs);

    const assistantMessageId = `msg_ast_${Date.now()}`;
    const assistantPlaceholder: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      model: selectedModel,
    };

    const convWithPlaceholder = {
      ...updatedConv,
      messages: [...updatedMessages, assistantPlaceholder],
    };

    const finalConvs = conversations.map((c) => (c.id === activeId ? convWithPlaceholder : c));
    updateConversations(finalConvs);
    setIsStreaming(true);
    setLiveStats(undefined);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let accumulatedText = "";
    const {
      prompt: baseEffectivePrompt,
      staticPrompt,
      dynamicContext,
    } = await getEffectiveSystemPrompt(convWithPlaceholder, newContent);

    const isSmartContext = settings.smartContextEnabled ?? true;
    const effectiveSystemPrompt = isSmartContext ? staticPrompt : baseEffectivePrompt;

    // Enforce Dynamic Context Window Budget on edited chat
    const targetCtx = activeConversation.numCtx ?? currentProject?.numCtx ?? settings.numCtx ?? resolveEffectiveNumCtxSync(selectedModel);
    const historyBudget = Math.max(2000, Math.floor(targetCtx * 0.45));
    const budgetedMessages = trimChatHistoryForBudget(updatedMessages, historyBudget, { smartShift: isSmartContext });

    let finalMessagesToSend = budgetedMessages;
    if (isSmartContext && dynamicContext && finalMessagesToSend.length > 0) {
      finalMessagesToSend = finalMessagesToSend.map((m, idx) => {
        if (idx === finalMessagesToSend.length - 1 && m.role === "user") {
          return {
            ...m,
            content: formatUserEphemeralContext(m.content, dynamicContext),
          };
        }
        return m;
      });
    }

    const tokenThrottler = createStreamThrottler((latestText) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== activeId) return c;
          const msgs = c.messages.map((m) =>
            m.id === assistantMessageId ? { ...m, content: latestText } : m
          );
          return { ...c, messages: msgs };
        })
      );
    });

    streamChatCompletion({
      hostUrl: settings.ollamaUrl,
      model: selectedModel,
      messages: finalMessagesToSend,
      systemPrompt: effectiveSystemPrompt,
      temperature: activeConversation.temperature ?? settings.temperature,
      topP: activeConversation.topP ?? settings.topP,
      topK: activeConversation.topK ?? currentProject?.topK ?? settings.topK,
      numCtx: targetCtx,
      numKeep: countTokens(effectiveSystemPrompt),
      numPredict: activeConversation.numPredict ?? currentProject?.numPredict ?? settings.numPredict,
      repeatPenalty: activeConversation.repeatPenalty ?? currentProject?.repeatPenalty ?? settings.repeatPenalty,
      presencePenalty: activeConversation.presencePenalty ?? currentProject?.presencePenalty,
      frequencyPenalty: activeConversation.frequencyPenalty ?? currentProject?.frequencyPenalty,
      seed: activeConversation.seed ?? currentProject?.seed,
      stop: activeConversation.stopSequences ?? currentProject?.stopSequences,
      keepAlive: settings.ollamaKeepAlive || "60m",
      apiKeys: settings.apiKeys,
      signal: abortController.signal,
      onToken: (chunk, stats) => {
        accumulatedText += chunk;
        if (stats) setLiveStats(stats);
        tokenThrottler.push(accumulatedText);
      },
      onFinish: (full, metrics) => {
        tokenThrottler.flush();
        setConversations((prev) => {
          const finished = prev.map((c) => {
            if (c.id !== activeId) return c;
            const msgs = c.messages.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: full || accumulatedText, metrics }
                : m
            );
            return { ...c, messages: msgs };
          });
          storage.saveConversations(finished);
          return finished;
        });
        setIsStreaming(false);
        setLiveStats(undefined);
      },
    }).catch(() => {
      setIsStreaming(false);
      setLiveStats(undefined);
    });
  };

  // Delete Message
  const handleDeleteMessage = (messageId: string) => {
    if (!activeConversation) return;
    const updated = activeConversation.messages.filter((m) => m.id !== messageId);
    const updatedConv = { ...activeConversation, messages: updated, updatedAt: Date.now() };
    const nextConvs = conversations.map((c) => (c.id === activeId ? updatedConv : c));
    updateConversations(nextConvs);
  };

  // Update Parameters
  const handleUpdateSessionParameters = (updates: Partial<Conversation>) => {
    if (!activeId) return;
    const updated = conversations.map((c) =>
      c.id === activeId ? { ...c, ...updates, updatedAt: Date.now() } : c
    );
    updateConversations(updated);
  };

  return (
    <div className="flex h-[100dvh] w-full max-w-full overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* Left Sidebar */}
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onTogglePin={handleTogglePin}
        onOpenSettings={handleOpenSettings}
        onOpenSkills={() => {
          setDirectoryTab("skills");
          setIsDirectoryModalOpen(true);
        }}
        onOpenDirectory={(tab) => {
          setDirectoryTab(tab || "skills");
          setIsDirectoryModalOpen(true);
        }}
        onOpenMemory={() => setIsMemoryModalOpen(true)}
        isConnected={isConnected}
        ollamaUrl={settings.ollamaUrl}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        width={sidebarWidth}
        onWidthChange={handleSidebarWidthChange}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onOpenProjectsGallery={handleOpenProjectsGallery}
        workspaceView={workspaceView}
        onOpenNewProjectModal={() => {
          setEditingProject(null);
          setProjectModalTab("general");
          setIsProjectModalOpen(true);
        }}
        onOpenEditProjectModal={(proj) => {
          setEditingProject(proj);
          setProjectModalTab("general");
          setIsProjectModalOpen(true);
        }}
        agents={agents}
        onOpenNewAgentModal={() => {
          setEditingAgent(null);
          setIsAgentModalOpen(true);
        }}
        onOpenAgentLogs={(agent) => {
          setSelectedAgentForLogs(agent);
          setIsAgentLogsModalOpen(true);
        }}
        onToggleAgentStatus={handleToggleAgentStatus}
        onRunAgentNow={handleRunAgentNow}
        runningAgentIds={runningAgentIds}
        onOpenDiskExplorer={() => setIsDiskExplorerOpen(true)}
        onOpenApprovals={() => setIsApprovalModalOpen(true)}
        pendingApprovalCount={pendingApprovals.filter((a) => a.status === "pending").length}
        onOpenArtifacts={() => setIsArtifactsModalOpen(true)}
        onOpenCodespace={() => setIsCodespaceOpen(true)}
        onOpenWorkspace={() => {
          setMainView("workspace");
          setWorkspaceView("chat");
        }}
        mainView={mainView}
      />

      {/* Main Viewport: Workspace (Chat) vs Projects Gallery vs Project Detail */}
      {workspaceView === "projects-gallery" ? (
        <ProjectsGallery
          projects={projects}
          onSelectProject={handleSelectProject}
          onOpenNewProjectModal={() => {
            setEditingProject(null);
            setProjectModalTab("general");
            setIsProjectModalOpen(true);
          }}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
      ) : workspaceView === "project-detail" && (projects.find((p) => p.id === activeProjectId) || currentProject) ? (
        <ProjectDetailView
          project={projects.find((p) => p.id === activeProjectId) || currentProject!}
          conversations={conversations}
          onSelectConversation={handleSelectConversation}
          onStartChatInProject={handleStartChatInProject}
          onBackToGallery={handleOpenProjectsGallery}
          onSaveProject={handleSaveProject}
          onOpenProjectSettings={(proj, tab) => {
            setEditingProject(proj);
            setProjectModalTab(tab || "parameters");
            setIsProjectModalOpen(true);
          }}
          selectedModel={selectedModel}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
      ) : (
        <ChatArea
          conversation={activeConversation}
          currentProject={currentProject}
          onSelectProject={handleSelectProject}
          projects={projects}
          chatFullWidth={settings.chatFullWidth}
          onOpenProjectSettings={() => {
            if (currentProject) {
              setEditingProject(currentProject);
              setProjectModalTab("parameters");
              setIsProjectModalOpen(true);
            }
          }}
          onOpenDiskExplorer={() => setIsDiskExplorerOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenArtifacts={() => setIsArtifactsModalOpen(true)}
          onOpenSkills={() => {
            setDirectoryTab("skills");
            setIsDirectoryModalOpen(true);
          }}
          skills={settings.skills || DEFAULT_DIRECTORY_SKILLS}
          activeSkillsCount={(settings.skills || DEFAULT_SKILLS).filter((s) => s.enabled).length}
          apiKeys={settings.apiKeys}
          models={models}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
          onRefreshModels={refreshOllama}
          isLoadingModels={isLoadingModels}
          input={input}
          setInput={setInput}
          attachments={attachments}
          setAttachments={setAttachments}
          webSearchActive={webSearchActive}
          setWebSearchActive={setWebSearchActive}
          diskToolsActive={diskToolsActive}
          setDiskToolsActive={setDiskToolsActive}
          onSendMessage={handleSendMessage}
          onStopStreaming={handleStopStreaming}
          isStreaming={isStreaming}
          queuedMessage={queuedMessage}
          onQueueMessage={() => {
            const text = input.trim();
            if (!text) return;
            setQueuedMessage(text);
            setInput("");
          }}
          onCancelQueuedMessage={() => setQueuedMessage(null)}
          hardwareHint={hardwareHint}
          onDismissHardwareHint={() => setHardwareHint(null)}
          liveStats={liveStats}
          onRegenerate={handleRegenerate}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onRenameConversation={handleRenameConversation}
          onTogglePin={handleTogglePin}
          onToggleUnread={handleToggleUnread}
          onMoveConversationToProject={handleMoveConversationToProject}
          onOpenParameters={() => setIsParametersOpen(true)}
          onNewChat={() => handleNewChat(undefined)}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          thinkingMode={thinkingMode}
          setThinkingMode={setThinkingMode}
          onOpenCodespace={() => setIsCodespaceOpen(true)}
          onOpenApprovals={() => setIsApprovalModalOpen(true)}
          pendingApprovalCount={pendingApprovals.filter((a) => a.status === "pending").length}
          onForkConversation={handleForkConversation}
          onApproveTool={(approvalId) => handleApprovalDecision(approvalId, "approved")}
          onRejectTool={(approvalId) => handleApprovalDecision(approvalId, "rejected")}
          onOpenVoiceCall={() => setIsVoiceCallOpen(true)}
          contextBreakdown={contextBreakdown}
          onSelectNumCtx={(val) => handleUpdateSessionParameters({ numCtx: val })}
          isConnected={isConnected}
          ollamaUrl={settings.ollamaUrl}
        />
      )}

      {/* Skills Hub Modal */}
      <SkillsModal
        isOpen={isSkillsModalOpen}
        onClose={() => setIsSkillsModalOpen(false)}
        skills={settings.skills || DEFAULT_SKILLS}
        onSaveSkills={(updatedSkills) => {
          const updated = { ...settings, skills: updatedSkills };
          setSettings(updated);
          storage.saveSettings(updated);
        }}
      />

      {/* Artifacts & Share Hub Modal */}
      <ArtifactsModal
        isOpen={isArtifactsModalOpen}
        onClose={() => setIsArtifactsModalOpen(false)}
        conversation={activeConversation}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialSection={settingsSection}
        onOpenDiskExplorer={() => setIsDiskExplorerOpen(true)}
        settings={settings}
        onSaveSettings={(newSet) => {
          setSettings(newSet);
          storage.saveSettings(newSet, true, true);
          refreshOllama();
        }}
        models={models}
        onDataImported={() => {
          setConversations(storage.getConversations());
          setProjects(storage.getProjects());
          setAgents(storage.getAgents());
          setSettings(storage.getSettings());
          setPersonas(storage.getPersonas());
        }}
        onClearAllChats={() => {
          updateConversations([]);
          setActiveId(null);
          storage.saveActiveConversationId(null);
        }}
      />

      {/* Project Modal */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => {
          setIsProjectModalOpen(false);
          setEditingProject(null);
        }}
        project={editingProject}
        onSaveProject={handleSaveProject}
        onDeleteProject={handleDeleteProject}
        models={models}
        initialTab={projectModalTab}
      />

      {/* Agent Modal (Create / Edit Scheduled AI Agent) */}
      <AgentModal
        isOpen={isAgentModalOpen}
        onClose={() => {
          setIsAgentModalOpen(false);
          setEditingAgent(null);
        }}
        agent={editingAgent}
        onSaveAgent={handleSaveAgent}
        onDeleteAgent={handleDeleteAgent}
        models={models}
        projects={projects}
      />

      {/* Agent Logs & Immediate Execution Modal */}
      <AgentLogsModal
        isOpen={isAgentLogsModalOpen}
        onClose={() => {
          setIsAgentLogsModalOpen(false);
          setSelectedAgentForLogs(null);
        }}
        agent={selectedAgentForLogs}
        onRunNow={handleRunAgentNow}
        onOpenConversation={(convId) => {
          setActiveId(convId);
          storage.saveActiveConversationId(convId);
        }}
        onEditAgent={(agent) => {
          setIsAgentLogsModalOpen(false);
          setEditingAgent(agent);
          setIsAgentModalOpen(true);
        }}
        isRunning={selectedAgentForLogs ? runningAgentIds.includes(selectedAgentForLogs.id) : false}
      />

      <ApprovalQueueModal
        isOpen={isApprovalModalOpen}
        onClose={() => setIsApprovalModalOpen(false)}
        approvals={pendingApprovals}
        onDecision={handleApprovalDecision}
        resolvingIds={resolvingApprovalIds}
        onRevert={handleRevertApproval}
        revertingIds={revertingApprovalIds}
      />

      {/* Local Disk Explorer Modal */}
      <DiskExplorerModal
        isOpen={isDiskExplorerOpen}
        onClose={() => setIsDiskExplorerOpen(false)}
        onAttachFileToChat={handleAttachDiskFile}
        onAddFileToProject={handleAddDiskFileToProject}
        activeProject={currentProject}
        onAskAboutFile={handleAskAboutDiskFile}
      />

      {/* Session Parameters Drawer */}
      <ParametersDrawer
        isOpen={isParametersOpen}
        onClose={() => setIsParametersOpen(false)}
        systemPrompt={activeConversation?.systemPrompt ?? settings.defaultSystemPrompt}
        setSystemPrompt={(val) => handleUpdateSessionParameters({ systemPrompt: val })}
        temperature={activeConversation?.temperature ?? settings.temperature}
        setTemperature={(val) => handleUpdateSessionParameters({ temperature: val })}
        topP={activeConversation?.topP ?? settings.topP}
        setTopP={(val) => handleUpdateSessionParameters({ topP: val })}
        minP={activeConversation?.minP ?? currentProject?.minP ?? settings.minP ?? 0.05}
        setMinP={(val) => handleUpdateSessionParameters({ minP: val })}
        numCtx={activeConversation?.numCtx ?? currentProject?.numCtx ?? settings.numCtx}
        setNumCtx={(val) => handleUpdateSessionParameters({ numCtx: val })}
        personas={personas}
        onSelectPersona={(p) =>
          handleUpdateSessionParameters({
            systemPrompt: p.systemPrompt,
            temperature: p.temperature ?? settings.temperature,
            topP: p.topP ?? settings.topP,
          })
        }
        onReset={() =>
          handleUpdateSessionParameters({
            systemPrompt: currentProject?.systemPrompt || settings.defaultSystemPrompt,
            temperature: currentProject?.temperature ?? settings.temperature,
            topP: currentProject?.topP ?? settings.topP,
            numCtx: currentProject?.numCtx ?? settings.numCtx,
          })
        }
        contextBreakdown={contextBreakdown}
      />

      {/* Directory Modal (Skills, Connectors, Plugins & GitHub Importer) */}
      <DirectoryModal
        isOpen={isDirectoryModalOpen}
        onClose={() => setIsDirectoryModalOpen(false)}
        initialTab={directoryTab}
        skills={settings.skills || DEFAULT_DIRECTORY_SKILLS}
        onSaveSkills={(updated) => {
          const next = { ...settings, skills: updated };
          setSettings(next);
          storage.saveSettings(next);
        }}
        connectors={(() => {
          const existing = settings.connectors || [];
          const existingIds = new Set(existing.map((c) => c.id));
          return [
            ...existing,
            ...DEFAULT_CONNECTORS.filter((c) => !existingIds.has(c.id)),
          ];
        })()}
        onSaveConnectors={(updated) => {
          const next = { ...settings, connectors: updated };
          setSettings(next);
          storage.saveSettings(next);
        }}
        plugins={(() => {
          const existing = settings.plugins || [];
          const existingIds = new Set(existing.map((p) => p.id));
          return [
            ...existing,
            ...DEFAULT_PLUGINS.filter((p) => !existingIds.has(p.id)),
          ];
        })()}
        onSavePlugins={(updated) => {
          const next = { ...settings, plugins: updated };
          setSettings(next);
          storage.saveSettings(next);
        }}
      />

      {/* Memory Modal (Profile, Preferences & Topical Knowledge) */}
      <MemoryModal
        isOpen={isMemoryModalOpen}
        onClose={() => setIsMemoryModalOpen(false)}
        memory={settings.memory || DEFAULT_MEMORY_CONFIG}
        onSaveMemory={(updated) => {
          const next = { ...settings, memory: updated };
          setSettings(next);
          storage.saveSettings(next);
        }}
      />

      {/* Hands-Free Voice Mode Modal (Dynamic Audio Orb Visualizer & Web Audio API) */}
      <VoiceModeModal
        isOpen={isVoiceCallOpen}
        onClose={() => setIsVoiceCallOpen(false)}
        selectedModel={selectedModel}
        models={models}
        apiKeys={settings.apiKeys}
        voiceSettings={settings.voice}
        onOpenSettings={() => {
          setIsVoiceCallOpen(false);
          setSettingsSection("voice");
          setIsSettingsOpen(true);
        }}
        onSendMessage={handleVoiceCallSendMessage}
      />

      {/* Codespace Fullscreen Workspace */}
      {isCodespaceOpen && (
        <div className="fixed inset-0 z-50 w-full h-full bg-[var(--background)] overflow-hidden flex flex-col animate-in fade-in duration-150">
          <CodespaceView
            models={models}
            selectedModel={selectedModel}
            apiKeys={settings.apiKeys}
            onSendToChat={(text) => {
              setInput(text);
              setIsCodespaceOpen(false);
            }}
            onClose={() => setIsCodespaceOpen(false)}
            onPopout={() => {
              window.open("/codespace", "CodespaceWindow", "width=1200,height=800,menubar=no,toolbar=no,location=no,status=no");
            }}
          />
        </div>
      )}
    </div>
  );
}
