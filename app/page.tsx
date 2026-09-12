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
} from "@/lib/types";
import { storage } from "@/lib/storage";
import { DEFAULT_SETTINGS, PRESET_PERSONAS, DEFAULT_CUSTOM_THEME } from "@/lib/constants";
import { checkOllamaHealth, fetchOllamaModels, streamChatCompletion } from "@/lib/ollama";
import { buildToolDirectivePrompt, parseToolDirective, MUTATING_TOOLS } from "@/lib/tools";
import { executeToolCall } from "@/lib/toolEngine";
import { executeAgent, calculateNextRun, resumeAgentAfterApproval } from "@/lib/agentEngine";
import { composeSkillsPrompt, skillsRequireDiskTools, DEFAULT_SKILLS } from "@/lib/skills";
import { Sidebar } from "@/components/Sidebar";
import { ChatArea } from "@/components/ChatArea";
import { ProjectsGallery } from "@/components/ProjectsGallery";
import { ProjectDetailView } from "@/components/ProjectDetailView";
import { SettingsModal, SettingsSection } from "@/components/SettingsModal";
import { ParametersDrawer } from "@/components/ParametersDrawer";
import { ProjectModal } from "@/components/ProjectModal";
import { AgentModal } from "@/components/AgentModal";
import { AgentLogsModal } from "@/components/AgentLogsModal";
import { ApprovalQueueModal } from "@/components/ApprovalQueueModal";
import { DiskExplorerModal } from "@/components/DiskExplorerModal";
import { SkillsModal } from "@/components/SkillsModal";
import { ArtifactsModal } from "@/components/ArtifactsModal";
import { DirectoryModal } from "@/components/DirectoryModal";
import { MemoryModal } from "@/components/MemoryModal";
import { VoiceCallModal } from "@/components/VoiceCallModal";
import {
  DEFAULT_DIRECTORY_SKILLS,
  DEFAULT_CONNECTORS,
  DEFAULT_PLUGINS,
  DEFAULT_MEMORY_CONFIG,
} from "@/lib/directoryData";
import { MusicPlayerWidget, NowPlayingInfo } from "@/components/MusicPlayerWidget";
import { CodespaceView } from "@/components/CodespaceView";
import DocumentReaderView from "@/components/DocumentReaderView";
import {
  buildOptimizedKnowledgeContextAsync,
  trimChatHistoryForBudget,
  formatUserEphemeralContext,
} from "@/lib/rag";
import {
  buildMusicPromptDirective,
  executeMusicActionFromResponse,
  dispatchMusicAction,
} from "@/lib/musicBridge";
import { calculateContextBreakdown } from "@/lib/contextVisualizer";
import {
  computePromptCacheKey,
  getCachedPromptResponse,
  setCachedPromptResponse,
} from "@/lib/responseCache";

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
  const [liveStats, setLiveStats] = useState<{ tokenCount: number; liveTps: number } | undefined>(undefined);
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>("default");
  const [mainView, setMainView] = useState<"workspace" | "codespace" | "reader">("workspace");
  const [workspaceView, setWorkspaceView] = useState<"chat" | "projects-gallery" | "project-detail">("chat");
  const [nowPlayingInfo, setNowPlayingInfo] = useState<{ isPlaying: boolean; title: string; onOpenPlayer: () => void } | null>(null);
  const [isArenaMode, setIsArenaMode] = useState<boolean>(false);
  const [arenaModelB, setArenaModelB] = useState<string>("gemini-2.5-flash");
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
        const localSettings = storage.getSettings();

        const res = await apiFetch("/api/db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversations: localConvs,
            projects: localProjects,
            agents: localAgents,
            settings: localSettings,
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

  // Execute Agent Automation
  const handleRunAgentNow = async (agentId: string) => {
    const targetAgent = agents.find((a) => a.id === agentId);
    if (!targetAgent || runningAgentIds.includes(agentId)) return;

    setRunningAgentIds((prev) => [...prev, agentId]);

    try {
      const result = await executeAgent(targetAgent, {
        ollamaUrl: settings.ollamaUrl,
        searxngUrl: settings.searxngUrl,
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

  // Automated Background Agent Scheduler Loop (checks every 25 seconds)
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
          console.log(`⏰ Triggering scheduled Agent: ${agent.name}`);
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
      const knowledgeResult = await buildOptimizedKnowledgeContextAsync(proj.files, userQuery, 3500, {
        ollamaUrl: settings.ollamaUrl,
        embeddingModel: settings.embeddingModel,
        enabled: Boolean(settings.semanticRagEnabled),
      });
      if (knowledgeResult.contextText) {
        dynamicContext = knowledgeResult.contextText;
        retrievedChunks = knowledgeResult.retrievedChunks;
        if (knowledgeResult.isChunked) {
          knowledgeNotice = `⚡ *16K Context Guard: Retrieved ${knowledgeResult.matchedChunksCount} most relevant passages from ${knowledgeResult.matchedFiles.join(", ")} (~${knowledgeResult.totalEstimatedTokens} tokens)*\n\n`;
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
    } else if (currentMode === "nothink") {
      basePrompt += "\n\n=== FAST / DIRECT MODE: ACTIVE ===\nDo NOT output internal thoughts or verbose reasoning. Provide the direct, concise solution immediately.\n";
    }

    // 4. Inject Persistent User Memory & Personalization (Static)
    const memoryConfig = settings.memory || DEFAULT_MEMORY_CONFIG;
    if (memoryConfig && memoryConfig.items && memoryConfig.items.length > 0) {
      const activeMemories = memoryConfig.items.filter((m) => m.enabled);
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

    // 4b. Inject Project-Specific Memories (Static)
    if (proj && proj.memories && proj.memories.length > 0) {
      const activeProjMemories = proj.memories.filter((m) => m.enabled);
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
      connectorsSection += "You can reference these connected capabilities when answering, and remind the user that slash commands like /github, /slack, and /discord are live.\n";
      connectorsSection += "=== END OF CONNECTED SERVICES ===\n\n";
      basePrompt = `${basePrompt}${connectorsSection}`;
    }

    // 7. Inject Live Music Player Awareness & Recall Capability (Static)
    const musicDirective = buildMusicPromptDirective();
    basePrompt = `${basePrompt}${musicDirective}`;

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

  // Send Message Logic
  const handleSendMessage = async () => {
    const trimmedInput = input.trim();
    const currentAttachments = [...attachments];

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

    // Perform real-time web search if enabled
    if (webSearchActive && trimmedInput) {
      try {
        const searchRes = await apiFetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmedInput,
            searxngUrl: settings.searxngUrl,
          }),
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.results && searchData.results.length > 0) {
            searchSources = searchData.results;
            searchContextText = "\n\n=== REAL-TIME WEB SEARCH RESULTS (via SearXNG) ===\n";
            searchSources.forEach((src, idx) => {
              searchContextText += `[${idx + 1}] "${src.title}"\nURL: ${src.url}\nSummary: ${src.snippet}\n\n`;
            });
            searchContextText += "=== INSTRUCTIONS ===\n";
            searchContextText += "Answer the user's prompt using the real-time web search results above. Cite references using [1], [2], etc., when stating specific facts.\n\n";
          }
        }
      } catch (searchErr) {
        console.warn("Web search failed:", searchErr);
      }
    }

    // Process Live Connector Operations (/github, /slack, /discord, /blender)
    let connectorContextText = "";
    let connectorNotice = "";
    let isBlenderCommand = false;
    let blenderBridgeUrl = "http://127.0.0.1:9876";

    if (trimmedInput.startsWith("/github")) {
      const cleanCmd = trimmedInput.replace(/^\/github\s*/, "").trim();
      const parts = cleanCmd.split(/\s+/);
      const ghConn = (settings.connectors || DEFAULT_CONNECTORS).find((c) => c.id === "github");
      
      let targetRepo = ghConn?.repo || "facebook/react";
      let fetchType: "info" | "issues" = "info";

      if (parts[0] === "issues") {
        fetchType = "issues";
        if (parts[1]) targetRepo = parts[1];
      } else if (parts[0]?.includes("/")) {
        targetRepo = parts[0];
        if (parts[1] === "issues") fetchType = "issues";
      }

      try {
        const ghRes = await apiFetch("/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "github_fetch",
            service: "github",
            repo: targetRepo,
            apiKey: ghConn?.apiKey,
            payload: { type: fetchType },
          }),
        });

        if (ghRes.ok) {
          const ghData = await ghRes.json();
          if (ghData.success) {
            if (fetchType === "issues" && ghData.issues) {
              connectorContextText = `\n\n=== LIVE GITHUB ISSUES FOR ${targetRepo} ===\n`;
              ghData.issues.forEach((iss: any) => {
                connectorContextText += `[Issue #${iss.number}] "${iss.title}" by @${iss.user} (${iss.comments} comments)\nURL: ${iss.url}\n${iss.bodySnippet}\n\n`;
              });
              connectorContextText += "=== INSTRUCTIONS ===\nAnalyze these real live GitHub issues and provide actionable insights.\n\n";
              connectorNotice = `🐙 *Fetched ${ghData.issues.length} live issues from GitHub repository \`${targetRepo}\`*\n\n`;
            } else {
              connectorContextText = `\n\n=== LIVE GITHUB REPOSITORY METRICS FOR ${targetRepo} ===\n`;
              connectorContextText += `Repository: ${ghData.repo}\nDescription: ${ghData.description || "None"}\nStars: ⭐ ${ghData.stars} | Forks: 🍴 ${ghData.forks} | Open Issues: 🐛 ${ghData.open_issues}\nLanguage: ${ghData.language || "Unknown"}\nURL: ${ghData.url}\n\n`;
              connectorContextText += "=== INSTRUCTIONS ===\nProvide an insightful summary and analysis of this repository based on these live metrics.\n\n";
              connectorNotice = `🐙 *Connected to GitHub: \`${targetRepo}\` (⭐ ${ghData.stars} stars, 🐛 ${ghData.open_issues} open issues)*\n\n`;
            }
          }
        }
      } catch (ghErr) {
        console.warn("GitHub connector fetch failed:", ghErr);
      }
    } else if (trimmedInput.startsWith("/slack")) {
      const slackMsg = trimmedInput.replace(/^\/slack\s*/, "").trim();
      const slackConn = (settings.connectors || DEFAULT_CONNECTORS).find((c) => c.id === "slack");
      if (slackConn && slackConn.webhookUrl) {
        try {
          await apiFetch("/api/connectors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "webhook_send",
              service: "slack",
              webhookUrl: slackConn.webhookUrl,
              payload: { text: slackMsg || "Notification from Ollama AI Workspace" },
            }),
          });
          connectorNotice = `💬 *Message dispatched to Slack channel via Incoming Webhook.*\n\n`;
        } catch (sErr) {
          console.warn("Slack dispatch failed:", sErr);
        }
      } else {
        connectorNotice = `⚠️ *Slack connector not configured with a Webhook URL. Open Directory > Connectors to configure it.*\n\n`;
      }
    } else if (trimmedInput.startsWith("/discord")) {
      const discordMsg = trimmedInput.replace(/^\/discord\s*/, "").trim();
      const discordConn = (settings.connectors || DEFAULT_CONNECTORS).find((c) => c.id === "discord");
      if (discordConn && discordConn.webhookUrl) {
        try {
          await apiFetch("/api/connectors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "webhook_send",
              service: "discord",
              webhookUrl: discordConn.webhookUrl,
              payload: { content: discordMsg || "Notification from Ollama AI Workspace" },
            }),
          });
          connectorNotice = `🎮 *Message dispatched to Discord channel via Webhook.*\n\n`;
        } catch (dErr) {
          console.warn("Discord dispatch failed:", dErr);
        }
      } else {
        connectorNotice = `⚠️ *Discord connector not configured with a Webhook URL. Open Directory > Connectors to configure it.*\n\n`;
      }
    } else if (trimmedInput.startsWith("/blender")) {
      isBlenderCommand = true;
      const blenderPrompt = trimmedInput.replace(/^\/blender\s*/, "").trim();
      const blenderConn = (settings.connectors || DEFAULT_CONNECTORS).find((c) => c.id === "blender-mcp");
      blenderBridgeUrl = blenderConn?.endpoint || "http://127.0.0.1:9876";

      connectorContextText = `\n\n=== BLENDER 3D MCP SCRIPTING DIRECTIVE ===\n`;
      connectorContextText += `User request: "${blenderPrompt || "Create a procedural 3D scene"}"\n`;
      connectorContextText += `You are an expert 3D Technical Artist and Blender Python (bpy) developer.\n`;
      connectorContextText += `Generate a clean, 100% executable Python script using 'bpy' that fulfills the user's 3D request.\n`;
      connectorContextText += `CRITICAL RULES FOR BLENDER PYTHON (bpy) - FOLLOW STRICTLY:\n`;
      connectorContextText += `1. IMPORTS: Always start with 'import bpy, math, mathutils'.\n`;
      connectorContextText += `2. CLEANUP: To clean scene, use: for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)\n`;
      connectorContextText += `3. OBJECT CREATION: Use standard primitives (e.g. bpy.ops.mesh.primitive_cube_add, primitive_uv_sphere_add, primitive_cylinder_add). Always get active object via 'bpy.context.active_object' right after adding.\n`;
      connectorContextText += `4. RIGID BODY PHYSICS (IMPORTANT):\n`;
      connectorContextText += `   - To add physics: bpy.context.view_layer.objects.active = obj; bpy.ops.rigidbody.object_add()\n`;
      connectorContextText += `   - Set properties on 'obj.rigid_body': obj.rigid_body.type = 'ACTIVE' (or 'PASSIVE' for ground floor), obj.rigid_body.mass = 10, obj.rigid_body.collision_shape = 'BOX' (or 'SPHERE').\n`;
      connectorContextText += `   - NEVER use modifiers.new("RigidBody") or assign obj.rigid_body = ... (these cause fatal TypeErrors).\n`;
      connectorContextText += `5. BOOLEAN MODIFIER: mod = obj.modifiers.new(name="Cut", type='BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.object = cutter_obj. (NEVER use mod.inputs['Solver']).\n`;
      connectorContextText += `6. MATERIALS: Use Principled BSDF. Always check 'bsdf = mat.node_tree.nodes.get("Principled BSDF")' before setting base_color, metallic, roughness.\n`;
      connectorContextText += `7. LIGHTING: For lights, set energy on data: light.data.energy = 1000 (NEVER use 'data_supports').\n`;
      connectorContextText += `8. ALL REQUESTED OBJECTS: Ensure EVERY object requested by the user is created (never crash midway).\n`;
      connectorContextText += `9. OUTPUT: Wrap the complete script in a single \`\`\`python ... \`\`\` code block.\n`;
      connectorContextText += `=== END OF BLENDER DIRECTIVE ===\n\n`;

      connectorNotice = `🧊 *Blender 3D Procedural Engine: Generating & auto-injecting \`bpy\` Python script for: "${blenderPrompt || "3D Scene"}"* (Bridge: \`${blenderBridgeUrl}\`)\n\n`;
    } else if (trimmedInput.startsWith("/music")) {
      const musicArgs = trimmedInput.replace(/^\/music\s*/, "").trim();
      const lowerArgs = musicArgs.toLowerCase();
      if (!lowerArgs || lowerArgs === "toggle") {
        dispatchMusicAction({ type: "toggle" });
        connectorNotice = `🎵 *Toggled Music Player Play/Pause*\n\n`;
      } else if (lowerArgs === "pause" || lowerArgs === "stop") {
        dispatchMusicAction({ type: "pause" });
        connectorNotice = `⏸️ *Music playback paused*\n\n`;
      } else if (lowerArgs === "open" || lowerArgs === "recall" || lowerArgs === "show") {
        dispatchMusicAction({ type: "open" });
        connectorNotice = `🎧 *Music Player widget recalled and opened*\n\n`;
      } else if (lowerArgs === "next") {
        dispatchMusicAction({ type: "next" });
        connectorNotice = `⏭️ *Skipped to next track*\n\n`;
      } else if (lowerArgs === "prev") {
        dispatchMusicAction({ type: "prev" });
        connectorNotice = `⏮️ *Skipped to previous track*\n\n`;
      } else {
        const trackTarget = lowerArgs.replace(/^play\s*/, "").trim();
        dispatchMusicAction({ type: "play", trackId: trackTarget || undefined });
        connectorNotice = `🎶 *Music Player: Playing ${trackTarget ? `"${trackTarget}"` : "track"}*\n\n`;
      }
    }

    const assistantMessageId = `msg_ast_${Date.now() + 1}`;
    const assistantPlaceholder: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: connectorNotice,
      timestamp: Date.now(),
      model: selectedModel,
      sources: searchSources.length > 0 ? searchSources : undefined,
    };

    const modelBMessageId = isArenaMode && arenaModelB ? `msg_ast_b_${Date.now() + 2}` : null;
    const modelBPlaceholder: Message | null = modelBMessageId
      ? {
          id: modelBMessageId,
          role: "assistant",
          content: "",
          timestamp: Date.now() + 1,
          model: arenaModelB,
        }
      : null;

    const newMessages = modelBPlaceholder
      ? [...targetConv.messages, userMessage, assistantPlaceholder, modelBPlaceholder]
      : [...targetConv.messages, userMessage, assistantPlaceholder];

    const isFirstMessage = targetConv.messages.length === 0;
    const newTitle = isFirstMessage
      ? trimmedInput
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
      const {
        prompt: baseEffectivePrompt,
        staticPrompt,
        dynamicContext: ragDynamicContext,
        knowledgeNotice,
        retrievedChunks,
      } = await getEffectiveSystemPrompt(convWithNewMessages, trimmedInput);
      const effectiveDiskToolsActive =
        diskToolsActive || skillsRequireDiskTools(settings.skills || DEFAULT_SKILLS, convWithNewMessages.activeSkillIds);
      let accumulatedText = connectorNotice || knowledgeNotice || "";

      // Dynamic contexts for this turn (RAG + search + connector)
      let combinedDynamicContext = ragDynamicContext || "";
      if (searchContextText) {
        combinedDynamicContext = combinedDynamicContext
          ? `${combinedDynamicContext}\n\n${searchContextText}`
          : searchContextText;
      }
      if (connectorContextText) {
        combinedDynamicContext = combinedDynamicContext
          ? `${combinedDynamicContext}\n\n${connectorContextText}`
          : connectorContextText;
      }

      // Check Smart Context mode (default: true)
      const isSmartContext = settings.smartContextEnabled ?? true;

      // In Smart Context mode:
      // - systemPrompt is pure STATIC (basePrompt + directives + tool directive)
      // - dynamic context is injected into the active user turn
      let effectiveSystemPrompt = baseEffectivePrompt;
      if (isSmartContext) {
        effectiveSystemPrompt = effectiveDiskToolsActive
          ? `${staticPrompt}\n\n${buildToolDirectivePrompt()}`
          : staticPrompt;
      } else {
        if (searchContextText) {
          effectiveSystemPrompt = `${effectiveSystemPrompt}${searchContextText}`;
        }
        if (connectorContextText) {
          effectiveSystemPrompt = `${effectiveSystemPrompt}${connectorContextText}`;
        }
        if (effectiveDiskToolsActive) {
          effectiveSystemPrompt = `${effectiveSystemPrompt}\n\n${buildToolDirectivePrompt()}`;
        }
      }

      // Enforce 16K Context Window Budget: trim chat history so (system + knowledge + history + predict) never overflows
      const targetCtx = targetConv.numCtx ?? proj?.numCtx ?? settings.numCtx ?? 16384;
      const historyBudget = Math.max(2000, Math.floor(targetCtx * 0.45));
      const rawMessagesToSend = newMessages.slice(0, modelBPlaceholder ? -2 : -1);
      const budgetedMessages = trimChatHistoryForBudget(rawMessagesToSend, historyBudget, { smartShift: isSmartContext });

      // If smart context is enabled and there is dynamic context, inject into the active user turn message
      let finalMessagesToSend = budgetedMessages;
      if (isSmartContext && combinedDynamicContext && finalMessagesToSend.length > 0) {
        finalMessagesToSend = finalMessagesToSend.map((m, idx) => {
          if (idx === finalMessagesToSend.length - 1 && m.role === "user") {
            return {
              ...m,
              content: formatUserEphemeralContext(m.content, combinedDynamicContext),
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

      // Skip re-generation if exact identical response is cached
      if (!isBlenderCommand && !searchContextText && !modelBPlaceholder) {
        const cached = getCachedPromptResponse(cacheKey);
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

      let accumulatedReasoning = "";
      await streamChatCompletion({
        hostUrl: settings.ollamaUrl,
        model: selectedModel,
        messages: finalMessagesToSend,
        systemPrompt: effectiveSystemPrompt,
        temperature: targetConv.temperature ?? settings.temperature,
        topP: targetConv.topP ?? settings.topP,
        topK: targetConv.topK ?? proj?.topK ?? settings.topK,
        numCtx: targetConv.numCtx ?? proj?.numCtx ?? settings.numCtx,
        numPredict: targetConv.numPredict ?? proj?.numPredict ?? settings.numPredict,
        repeatPenalty: targetConv.repeatPenalty ?? proj?.repeatPenalty ?? settings.repeatPenalty,
        presencePenalty: targetConv.presencePenalty ?? proj?.presencePenalty,
        frequencyPenalty: targetConv.frequencyPenalty ?? proj?.frequencyPenalty,
        seed: targetConv.seed ?? proj?.seed,
        stop: targetConv.stopSequences ?? proj?.stopSequences,
        keepAlive: settings.ollamaKeepAlive || "60m",
        apiKeys: settings.apiKeys,
        signal: abortController.signal,
        onReasoning: (rChunk) => {
          accumulatedReasoning += rChunk;
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== targetId) return c;
              const msgs = c.messages.map((m) =>
                m.id === assistantMessageId ? { ...m, reasoning: accumulatedReasoning } : m
              );
              return { ...c, messages: msgs };
            })
          );
        },
        onToken: (chunk, stats) => {
          accumulatedText += chunk;
          if (stats) setLiveStats(stats);
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== targetId) return c;
              const msgs = c.messages.map((m) =>
                m.id === assistantMessageId ? { ...m, content: accumulatedText } : m
              );
              return { ...c, messages: msgs };
            })
          );
        },
        onFinish: async (full, metrics, fullReasoning) => {
          let finalFullText = full || accumulatedText;
          const finalReasoning = fullReasoning || accumulatedReasoning || undefined;

          // Automatic injection to live Blender scene if prompt is a /blender command
          if (isBlenderCommand) {
            const codeRegex = /```(?:python|py|bpy)?\s*\n([\s\S]*?)```/i;
            const match = codeRegex.exec(finalFullText);
            const pyCode = match ? match[1].trim() : "";

            if (pyCode && (pyCode.includes("bpy") || pyCode.includes("import"))) {
              try {
                const bRes = await apiFetch("/api/connectors", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "blender_execute",
                    endpoint: blenderBridgeUrl,
                    payload: { code: pyCode },
                  }),
                });
                const bData = await bRes.json().catch(() => ({}));
                if (bData.success) {
                  finalFullText += "\n\n> 🧊 **Blender MCP Live**: 🚀 *Script Python otomatis di-inject & berhasil dieksekusi di viewport Blender kamu!*";
                } else if (bData.isBridgeOffline) {
                  finalFullText += "\n\n> ⚠️ **Blender MCP**: *Bridge Blender (port 9876) belum aktif. Klik tombol **Inject to Blender** di atas kode setelah menyalakan script listener di Blender.*";
                } else {
                  finalFullText += `\n\n> ⚠️ **Blender MCP**: *Eksekusi ke Blender: ${bData.error || bData.message || "Failed"}*`;
                }
              } catch (bErr: any) {
                console.warn("Blender auto-inject error:", bErr);
                finalFullText += `\n\n> ⚠️ **Blender MCP**: *Gagal menghubungi bridge Blender: ${bErr.message}*`;
              }
            }
          }

          // Scan and execute any music player actions from AI response
          const musicResult = executeMusicActionFromResponse(finalFullText);
          finalFullText = musicResult.cleanedText;
          if (musicResult.actionExecuted) {
            finalFullText += "\n\n> 🎶 *Web UI Music Player: Aksi musik berhasil dieksekusi.*";
          }

          // Disk Tools: jalankan directive [TOOL_CALL:...] kalau toggle aktif.
          // Non-native (ReAct fallback) loop: model tulis directive -> kita eksekusi via
          // /api/tools/execute (sudah dijail ke BASE_DIR project) -> hasil disuapkan balik
          // ke model sebagai pesan baru -> ulangi sampai model tidak minta tool lagi
          // atau limit iterasi tercapai. Toggle ini hanya kontrol UX, bukan boundary
          // keamanan — proteksi sebenarnya ada di endpoint.
          let toolExecutions: ToolCallExecution[] = [];
          if (effectiveDiskToolsActive) {
            let loopText = finalFullText;
            let toolHistory: Message[] = [
              ...budgetedMessages,
              { id: assistantMessageId, role: "assistant", content: loopText, timestamp: Date.now() },
            ];
            const maxIterations = 3;

            for (let iteration = 0; iteration < maxIterations; iteration++) {
              const directive = parseToolDirective(loopText);
              if (!directive) break;

              const execId = `tool_${assistantMessageId}_${iteration}`;
              toolExecutions = [
                ...toolExecutions,
                { id: execId, toolName: directive.toolName, args: directive.args, status: "running", timestamp: Date.now() },
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
              const isMutating = MUTATING_TOOLS.includes(directive.toolName);
              let approvalDecision: "approved" | "rejected" = "approved";
              const chatApprovalId = isMutating ? `chatapproval_${execId}` : undefined;

              if (isMutating) {
                let previousContent: string | undefined;
                if (directive.toolName === "write_file" && typeof directive.args.path === "string") {
                  try {
                    const readResult = await executeToolCall("read_file", { path: directive.args.path }, abortController.signal);
                    previousContent = readResult.raw?.content;
                  } catch {
                    // File doesn't exist yet (new file) or isn't readable — previousContent
                    // stays undefined, diff preview shows it as a new file.
                  }
                }

                const approval: PendingApproval = {
                  id: chatApprovalId!,
                  source: "chat",
                  conversationId: targetId,
                  toolName: directive.toolName,
                  args: directive.args,
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
                toolResultText = `DITOLAK oleh user. Tool '${directive.toolName}' tidak dijalankan. Lanjutkan tanpa hasil ini, atau jelaskan ke user kenapa langkah ini diperlukan jika masih relevan.`;
              } else {
                try {
                  const result = await executeToolCall(
                    directive.toolName,
                    directive.args,
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
                  content: `[TOOL_RESULT untuk ${directive.toolName}]:\n${toolResultText}\n\nLanjutkan jawabanmu ke user berdasarkan hasil ini. Jangan panggil tool yang sama dengan argumen sama persis lagi kalau sudah berhasil.`,
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
          if (!isBlenderCommand && !searchContextText && !modelBPlaceholder) {
            setCachedPromptResponse(cacheKey, {
              content: finalFullText,
              reasoning: finalReasoning,
              sources: searchSources.length > 0 ? searchSources : undefined,
              toolExecutions: toolExecutions.length > 0 ? toolExecutions : undefined,
              retrievedChunks: retrievedChunks && retrievedChunks.length > 0 ? retrievedChunks : undefined,
              metrics,
            });
          }

          // If Arena Mode is enabled, now stream Model B
          if (modelBMessageId && arenaModelB) {
            let modelBAccumulated = "";
            let modelBReasoning = "";
            streamChatCompletion({
              hostUrl: settings.ollamaUrl,
              model: arenaModelB,
              messages: newMessages.slice(0, -2),
              systemPrompt: effectiveSystemPrompt,
              temperature: targetConv.temperature ?? settings.temperature,
              topP: targetConv.topP ?? settings.topP,
              apiKeys: settings.apiKeys,
              signal: abortController.signal,
              onReasoning: (bReasoning) => {
                modelBReasoning += bReasoning;
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== targetId) return c;
                    const msgs = c.messages.map((m) =>
                      m.id === modelBMessageId ? { ...m, reasoning: modelBReasoning } : m
                    );
                    return { ...c, messages: msgs };
                  })
                );
              },
              onToken: (bChunk) => {
                modelBAccumulated += bChunk;
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== targetId) return c;
                    const msgs = c.messages.map((m) =>
                      m.id === modelBMessageId ? { ...m, content: modelBAccumulated } : m
                    );
                    return { ...c, messages: msgs };
                  })
                );
              },
              onFinish: (bFull, bMetrics, bFullReasoning) => {
                setConversations((prev) => {
                  const finished = prev.map((c) => {
                    if (c.id !== targetId) return c;
                    const msgs = c.messages.map((m) =>
                      m.id === modelBMessageId
                        ? { ...m, content: bFull || modelBAccumulated, reasoning: bFullReasoning || modelBReasoning || undefined, metrics: bMetrics }
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
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== targetId) return c;
                    const msgs = c.messages.map((m) =>
                      m.id === modelBMessageId
                        ? { ...m, content: `Error from Model B (${arenaModelB}): ${err.message}`, isError: true }
                        : m
                    );
                    return { ...c, messages: msgs };
                  })
                );
                setIsStreaming(false);
                setLiveStats(undefined);
                abortControllerRef.current = null;
              },
            });
          } else {
            setIsStreaming(false);
            setLiveStats(undefined);
            abortControllerRef.current = null;
          }
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
          title: `🎙️ Voice: ${trimmedInput.slice(0, 24)}`,
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
            const { cleanedText } = executeMusicActionFromResponse(finalFull);

            setConversations((prev) => {
              const finished = prev.map((c) => {
                if (c.id !== targetId) return c;
                const msgs = c.messages.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: cleanedText, reasoning: fullReasoning, metrics }
                    : m
                );
                return { ...c, messages: msgs, updatedAt: Date.now() };
              });
              storage.saveConversations(finished);
              return finished;
            });
            resolve(cleanedText);
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

    const isBlenderCmd = lastUserMessage.content.trim().startsWith("/blender");
    const blenderConn = (settings.connectors || DEFAULT_CONNECTORS).find((c) => c.id === "blender-mcp");
    const blenderBridgeUrl = blenderConn?.endpoint || "http://127.0.0.1:9876";

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

      // Enforce 16K Context Window Budget on regenerated chat
      const targetCtx = activeConversation.numCtx ?? currentProject?.numCtx ?? settings.numCtx ?? 16384;
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

      let accumulatedReasoning = "";
      await streamChatCompletion({
        hostUrl: settings.ollamaUrl,
        model: selectedModel,
        messages: finalMessagesToSend,
        systemPrompt: effectiveSystemPrompt,
        temperature: activeConversation.temperature ?? settings.temperature,
        topP: activeConversation.topP ?? settings.topP,
        topK: activeConversation.topK ?? currentProject?.topK ?? settings.topK,
        numCtx: activeConversation.numCtx ?? currentProject?.numCtx ?? settings.numCtx,
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
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== activeId) return c;
              const msgs = c.messages.map((m) =>
                m.id === assistantMessageId ? { ...m, reasoning: accumulatedReasoning } : m
              );
              return { ...c, messages: msgs };
            })
          );
        },
        onToken: (chunk, stats) => {
          accumulatedText += chunk;
          if (stats) setLiveStats(stats);
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== activeId) return c;
              const msgs = c.messages.map((m) =>
                m.id === assistantMessageId ? { ...m, content: accumulatedText } : m
              );
              return { ...c, messages: msgs };
            })
          );
        },
        onFinish: async (full, metrics, fullReasoning) => {
          let finalFullText = full || accumulatedText;
          const finalReasoning = fullReasoning || accumulatedReasoning || undefined;

          // Automatic injection to live Blender scene if prompt was a /blender command
          if (isBlenderCmd) {
            const codeRegex = /```(?:python|py|bpy)?\s*\n([\s\S]*?)```/i;
            const match = codeRegex.exec(finalFullText);
            const pyCode = match ? match[1].trim() : "";

            if (pyCode && (pyCode.includes("bpy") || pyCode.includes("import"))) {
              try {
                const bRes = await apiFetch("/api/connectors", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "blender_execute",
                    endpoint: blenderBridgeUrl,
                    payload: { code: pyCode },
                  }),
                });
                const bData = await bRes.json().catch(() => ({}));
                if (bData.success) {
                  finalFullText += "\n\n> 🧊 **Blender MCP Live**: 🚀 *Script Python otomatis di-inject & berhasil dieksekusi di viewport Blender kamu!*";
                } else if (bData.isBridgeOffline) {
                  finalFullText += "\n\n> ⚠️ **Blender MCP**: *Bridge Blender (port 9876) belum aktif. Klik tombol **Inject to Blender** di atas kode setelah menyalakan script listener di Blender.*";
                } else {
                  finalFullText += `\n\n> ⚠️ **Blender MCP**: *Eksekusi ke Blender: ${bData.error || bData.message || "Failed"}*`;
                }
              } catch (bErr: any) {
                console.warn("Blender auto-inject error:", bErr);
                finalFullText += `\n\n> ⚠️ **Blender MCP**: *Gagal menghubungi bridge Blender: ${bErr.message}*`;
              }
            }
          }

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

    // Enforce 16K Context Window Budget on edited chat
    const targetCtx = activeConversation.numCtx ?? currentProject?.numCtx ?? settings.numCtx ?? 16384;
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

    streamChatCompletion({
      hostUrl: settings.ollamaUrl,
      model: selectedModel,
      messages: finalMessagesToSend,
      systemPrompt: effectiveSystemPrompt,
      temperature: activeConversation.temperature ?? settings.temperature,
      topP: activeConversation.topP ?? settings.topP,
      topK: activeConversation.topK ?? currentProject?.topK ?? settings.topK,
      numCtx: activeConversation.numCtx ?? currentProject?.numCtx ?? settings.numCtx,
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
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== activeId) return c;
            const msgs = c.messages.map((m) =>
              m.id === assistantMessageId ? { ...m, content: accumulatedText } : m
            );
            return { ...c, messages: msgs };
          })
        );
      },
      onFinish: (full, metrics) => {
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
        onOpenCodespace={() => setMainView("codespace")}
        onOpenReader={() => setMainView("reader")}
        onOpenMusic={() => dispatchMusicAction({ type: "open" })}
        nowPlayingInfo={nowPlayingInfo}
        onOpenWorkspace={() => {
          setMainView("workspace");
          setWorkspaceView("chat");
        }}
        mainView={mainView}
      />

      {/* Floating Offline Music Player Action Widget */}
      <MusicPlayerWidget
        musicDirectory={settings.musicDirectory}
        onTrackUpdate={setNowPlayingInfo}
      />

      {/* Main Viewport: Workspace (Chat) vs Projects Gallery vs Project Detail vs Codespace vs Reader */}
      {mainView === "codespace" ? (
        <div className="flex-1 flex flex-col h-[100dvh] overflow-hidden relative">
          <CodespaceView
            models={models}
            selectedModel={selectedModel}
            apiKeys={settings.apiKeys}
            onSendToChat={(text) => {
              setInput(text);
              setMainView("workspace");
              setWorkspaceView("chat");
            }}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />
        </div>
      ) : mainView === "reader" ? (
        <div className="flex-1 flex flex-col h-[100dvh] overflow-hidden relative">
          <DocumentReaderView
            models={models}
            selectedModel={selectedModel}
            apiKeys={settings.apiKeys}
            onSendToChat={(text) => {
              setInput(text);
              setMainView("workspace");
              setWorkspaceView("chat");
            }}
            onBackToChat={() => {
              setMainView("workspace");
              setWorkspaceView("chat");
            }}
          />
        </div>
      ) : workspaceView === "projects-gallery" ? (
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
          nowPlayingInfo={nowPlayingInfo}
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
          onOpenCodespace={() => setMainView("codespace")}
          onForkConversation={handleForkConversation}
          onApproveTool={(approvalId) => handleApprovalDecision(approvalId, "approved")}
          onRejectTool={(approvalId) => handleApprovalDecision(approvalId, "rejected")}
          isArenaMode={isArenaMode}
          onToggleArenaMode={() => setIsArenaMode(!isArenaMode)}
          arenaModelB={arenaModelB}
          onSelectArenaModelB={setArenaModelB}
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

      {/* Live Voice Call Modal (Interactive Indonesian Female Voice Mode) */}
      <VoiceCallModal
        isOpen={isVoiceCallOpen}
        onClose={() => setIsVoiceCallOpen(false)}
        selectedModel={selectedModel}
        onSendMessage={handleVoiceCallSendMessage}
      />
    </div>
  );
}
