"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  AppSettings,
  Conversation,
  Message,
  OllamaModel,
  PersonaPreset,
  Attachment,
  Project,
  AgentTask,
  Skill,
  ProjectFile,
  ThinkingMode,
} from "@/lib/types";
import { storage } from "@/lib/storage";
import { checkOllamaHealth, fetchOllamaModels, streamChatCompletion } from "@/lib/ollama";
import { executeAgent, calculateNextRun } from "@/lib/agentEngine";
import { composeSkillsPrompt, DEFAULT_SKILLS } from "@/lib/skills";
import { Sidebar } from "@/components/Sidebar";
import { ChatArea } from "@/components/ChatArea";
import { ProjectsGallery } from "@/components/ProjectsGallery";
import { ProjectDetailView } from "@/components/ProjectDetailView";
import { SettingsModal, SettingsSection } from "@/components/SettingsModal";
import { ParametersDrawer } from "@/components/ParametersDrawer";
import { ProjectModal } from "@/components/ProjectModal";
import { AgentModal } from "@/components/AgentModal";
import { AgentLogsModal } from "@/components/AgentLogsModal";
import { DiskExplorerModal } from "@/components/DiskExplorerModal";
import { SkillsModal } from "@/components/SkillsModal";
import { ArtifactsModal } from "@/components/ArtifactsModal";
import { DirectoryModal } from "@/components/DirectoryModal";
import { MemoryModal } from "@/components/MemoryModal";
import {
  DEFAULT_DIRECTORY_SKILLS,
  DEFAULT_CONNECTORS,
  DEFAULT_PLUGINS,
  DEFAULT_MEMORY_CONFIG,
} from "@/lib/directoryData";
import { MusicPlayerWidget, NowPlayingInfo } from "@/components/MusicPlayerWidget";
import { CodespaceView } from "@/components/CodespaceView";
import { buildOptimizedKnowledgeContext, trimChatHistoryForBudget } from "@/lib/rag";

export default function HomePage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentTask[]>([]);
  const [runningAgentIds, setRunningAgentIds] = useState<string[]>([]);

  const [settings, setSettings] = useState<AppSettings>(storage.getSettings());
  const [personas, setPersonas] = useState<PersonaPreset[]>(storage.getPersonas());
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);

  // Chat State
  const [input, setInput] = useState<string>("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [webSearchActive, setWebSearchActive] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [liveStats, setLiveStats] = useState<{ tokenCount: number; liveTps: number } | undefined>(undefined);
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>(settings.thinkingMode || "default");
  const [mainView, setMainView] = useState<"workspace" | "codespace">("workspace");
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
  const [selectedAgentForLogs, setSelectedAgentForLogs] = useState<AgentTask | null>(null);
  const [isDiskExplorerOpen, setIsDiskExplorerOpen] = useState<boolean>(false);
  const [isSkillsModalOpen, setIsSkillsModalOpen] = useState<boolean>(false);
  const [isDirectoryModalOpen, setIsDirectoryModalOpen] = useState<boolean>(false);
  const [directoryTab, setDirectoryTab] = useState<"skills" | "connectors" | "plugins">("skills");
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState<boolean>(false);
  const [isArtifactsModalOpen, setIsArtifactsModalOpen] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

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
  const currentProject = projects.find((p) => p.id === (activeConversation?.projectId || activeProjectId)) || null;

  // Initialize theme & typography font
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.removeAttribute("data-theme");
      if (prefersDark) root.classList.add("dark");
      else root.classList.remove("dark");
    } else if (settings.theme === "light") {
      root.setAttribute("data-theme", "light");
      root.classList.remove("dark");
    } else {
      root.setAttribute("data-theme", settings.theme);
      root.classList.add("dark");
    }

    // Apply custom typography font
    root.setAttribute("data-font", settings.fontFamily || "inter");
  }, [settings.theme, settings.fontFamily]);

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

        const res = await fetch("/api/db", {
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
      const res = await fetch(`/api/db?v=${currentDbVersionRef.current}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();

      // If nothing changed on server, do nothing
      if (!data.changed) return;

      if (data.version) currentDbVersionRef.current = data.version;

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
    // 1. Instant load from local cache
    setConversations(storage.getConversations());
    setProjects(storage.getProjects());
    setAgents(storage.getAgents());
    setActiveId(storage.getActiveConversationId());

    // 2. Initial Full Merge with Central Server DB
    syncWithServer(true);

    // 3. Connect Ollama
    refreshOllama();

    // 4. Background lightweight version poll (every 3 seconds) & health check
    const syncInterval = setInterval(() => syncWithServer(false), 3000);
    const healthInterval = setInterval(refreshOllama, 30000);

    // 5. Sync immediately when window/tab is focused
    const handleWindowFocus = () => {
      syncWithServer(false);
    };
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      clearInterval(syncInterval);
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
      const { updatedAgent, createdConversation } = await executeAgent(targetAgent, {
        ollamaUrl: settings.ollamaUrl,
        searxngUrl: settings.searxngUrl,
        projects,
      });

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
    } finally {
      setRunningAgentIds((prev) => prev.filter((id) => id !== agentId));
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
    await fetch("/api/db", {
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
    await fetch("/api/db", {
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
    await fetch("/api/db", {
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
  const getEffectiveSystemPrompt = (
    conv: Conversation,
    userQuery = ""
  ): { prompt: string; knowledgeNotice?: string } => {
    const proj = conv.projectId ? projects.find((p) => p.id === conv.projectId) : null;
    let basePrompt = conv.systemPrompt || proj?.systemPrompt || settings.defaultSystemPrompt;
    let knowledgeNotice = "";

    // 1. Inject Project Knowledge Base (Optimized with Smart BM25 Chunking & 16K Context Guard)
    if (proj && proj.files && proj.files.length > 0) {
      // Safe context window budgeting: limit knowledge chunks to ~3,500 tokens
      const knowledgeResult = buildOptimizedKnowledgeContext(proj.files, userQuery, 3500);
      if (knowledgeResult.contextText) {
        basePrompt = `${basePrompt}${knowledgeResult.contextText}`;
        if (knowledgeResult.isChunked) {
          knowledgeNotice = `⚡ *16K Context Guard: Retrieved ${knowledgeResult.matchedChunksCount} most relevant passages from ${knowledgeResult.matchedFiles.join(", ")} (~${knowledgeResult.totalEstimatedTokens} tokens)*\n\n`;
        }
      }
    }

    // 2. Inject Active Agentic Skills
    const activeSkills = settings.skills || DEFAULT_SKILLS;
    const skillsPrompt = composeSkillsPrompt(activeSkills, conv.activeSkillIds);
    if (skillsPrompt) {
      basePrompt = `${basePrompt}${skillsPrompt}`;
    }

    // 3. Inject Thinking / Reasoning Mode Directive
    const currentMode = conv.thinkingMode || thinkingMode || settings.thinkingMode || "default";
    if (currentMode === "think") {
      basePrompt += "\n\n=== DEEP THINKING & REASONING MODE: ACTIVE ===\nYou MUST think through this step-by-step and write out your detailed analytical reasoning before providing your final answer. Wrap your internal thoughts in <think>...</think> tags.\n";
    } else if (currentMode === "nothink") {
      basePrompt += "\n\n=== FAST / DIRECT MODE: ACTIVE ===\nDo NOT output internal thoughts or verbose reasoning. Provide the direct, concise solution immediately.\n";
    }

    // 4. Inject Persistent User Memory & Personalization
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

    // 5. Inject Active Suite Plugins
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

    // 6. Inject Connected Live Services & Tools
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

    return { prompt: basePrompt, knowledgeNotice };
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
        const searchRes = await fetch("/api/search", {
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

    // Process Live Connector Operations (/github, /slack, /discord)
    let connectorContextText = "";
    let connectorNotice = "";

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
        const ghRes = await fetch("/api/connectors", {
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
          await fetch("/api/connectors", {
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
          await fetch("/api/connectors", {
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
      const blenderPrompt = trimmedInput.replace(/^\/blender\s*/, "").trim();
      const blenderConn = (settings.connectors || DEFAULT_CONNECTORS).find((c) => c.id === "blender-mcp");
      const bridgeUrl = blenderConn?.endpoint || "http://127.0.0.1:9876";

      connectorContextText = `\n\n=== BLENDER 3D MCP SCRIPTING DIRECTIVE ===\n`;
      connectorContextText += `User request: "${blenderPrompt || "Create a procedural 3D scene"}"\n`;
      connectorContextText += `You are an expert 3D Technical Artist and Blender Python (bpy) developer.\n`;
      connectorContextText += `Generate a clean, robust, and complete Python script using 'bpy' that fulfills the user's 3D request.\n`;
      connectorContextText += `Guidelines:\n`;
      connectorContextText += `1. Import bpy and math.\n`;
      connectorContextText += `2. Create geometry (meshes, primitives, curves, or bmesh).\n`;
      connectorContextText += `3. Create Principled BSDF materials with vibrant base colors, roughness, and metallic properties.\n`;
      connectorContextText += `4. Setup three-point lighting (Sun/Area/Point) and frame the camera.\n`;
      connectorContextText += `5. Wrap the code in a \`\`\`python ... \`\`\` code block so it can be run or pasted directly into Blender's Scripting tab.\n`;
      connectorContextText += `=== END OF BLENDER DIRECTIVE ===\n\n`;

      connectorNotice = `🧊 *Blender 3D Procedural Engine: Generating \`bpy\` Python script for: "${blenderPrompt || "3D Scene"}"* (Bridge: \`${bridgeUrl}\`)\n\n`;
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
      const { prompt: baseEffectivePrompt, knowledgeNotice } = getEffectiveSystemPrompt(convWithNewMessages, trimmedInput);
      let accumulatedText = connectorNotice || knowledgeNotice || "";
      let effectiveSystemPrompt = baseEffectivePrompt;
      if (searchContextText) {
        effectiveSystemPrompt = `${effectiveSystemPrompt}${searchContextText}`;
      }
      if (connectorContextText) {
        effectiveSystemPrompt = `${effectiveSystemPrompt}${connectorContextText}`;
      }

      // Enforce 16K Context Window Budget: trim chat history so (system + knowledge + history + predict) never overflows
      const targetCtx = targetConv.numCtx ?? proj?.numCtx ?? settings.numCtx ?? 16384;
      const historyBudget = Math.max(2000, Math.floor(targetCtx * 0.45));
      const rawMessagesToSend = newMessages.slice(0, modelBPlaceholder ? -2 : -1);
      const budgetedMessages = trimChatHistoryForBudget(rawMessagesToSend, historyBudget);

      await streamChatCompletion({
        hostUrl: settings.ollamaUrl,
        model: selectedModel,
        messages: budgetedMessages,
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
        apiKeys: settings.apiKeys,
        signal: abortController.signal,
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
        onFinish: (full, metrics) => {
          setConversations((prev) => {
            const finished = prev.map((c) => {
              if (c.id !== targetId) return c;
              const msgs = c.messages.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: full || accumulatedText, metrics, sources: searchSources.length > 0 ? searchSources : undefined }
                  : m
              );
              return { ...c, messages: msgs, updatedAt: Date.now() };
            });
            storage.saveConversations(finished);
            return finished;
          });

          // If Arena Mode is enabled, now stream Model B
          if (modelBMessageId && arenaModelB) {
            let modelBAccumulated = "";
            streamChatCompletion({
              hostUrl: settings.ollamaUrl,
              model: arenaModelB,
              messages: newMessages.slice(0, -2),
              systemPrompt: effectiveSystemPrompt,
              temperature: targetConv.temperature ?? settings.temperature,
              topP: targetConv.topP ?? settings.topP,
              apiKeys: settings.apiKeys,
              signal: abortController.signal,
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
              onFinish: (bFull, bMetrics) => {
                setConversations((prev) => {
                  const finished = prev.map((c) => {
                    if (c.id !== targetId) return c;
                    const msgs = c.messages.map((m) =>
                      m.id === modelBMessageId
                        ? { ...m, content: bFull || modelBAccumulated, metrics: bMetrics }
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
      const { prompt: effectiveSystemPrompt } = getEffectiveSystemPrompt(updatedConv, lastUserMessage.content);

      // Enforce 16K Context Window Budget on regenerated chat
      const targetCtx = activeConversation.numCtx ?? currentProject?.numCtx ?? settings.numCtx ?? 16384;
      const historyBudget = Math.max(2000, Math.floor(targetCtx * 0.45));
      const budgetedMessages = trimChatHistoryForBudget(trimmedHistory, historyBudget);

      await streamChatCompletion({
        hostUrl: settings.ollamaUrl,
        model: selectedModel,
        messages: budgetedMessages,
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
  const handleEditMessage = (messageId: string, newContent: string) => {
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
    const { prompt: effectiveSystemPrompt } = getEffectiveSystemPrompt(convWithPlaceholder, newContent);

    // Enforce 16K Context Window Budget on edited chat
    const targetCtx = activeConversation.numCtx ?? currentProject?.numCtx ?? settings.numCtx ?? 16384;
    const historyBudget = Math.max(2000, Math.floor(targetCtx * 0.45));
    const budgetedMessages = trimChatHistoryForBudget(updatedMessages, historyBudget);

    streamChatCompletion({
      hostUrl: settings.ollamaUrl,
      model: selectedModel,
      messages: budgetedMessages,
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
        onOpenArtifacts={() => setIsArtifactsModalOpen(true)}
        onOpenCodespace={() => setMainView("codespace")}
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

      {/* Main Viewport: Workspace (Chat) vs Projects Gallery vs Project Detail vs Codespace */}
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
      ) : workspaceView === "project-detail" && currentProject ? (
        <ProjectDetailView
          project={currentProject}
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
          projects={projects}
          nowPlayingInfo={nowPlayingInfo}
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
          isArenaMode={isArenaMode}
          onToggleArenaMode={() => setIsArenaMode(!isArenaMode)}
          arenaModelB={arenaModelB}
          onSelectArenaModelB={setArenaModelB}
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
          storage.saveSettings(newSet);
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
          })
        }
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
    </div>
  );
}
