"use client";

import React, { useState, useRef, useEffect } from "react";
import { apiFetch } from "../lib/apiClient";
import { X, Palette, Cloud, HardDrives as Server, Faders as Sliders, Database, Info, CaretRight as ChevronRight, CaretLeft as ChevronLeft, CaretDown as ChevronDown, Sun, Moon, Sparkle as Sparkles, Laptop, CheckCircle as CheckCircle2, XCircle, ArrowsClockwise as RefreshCw, Eye, EyeSlash as EyeOff, Download, Upload, Trash as Trash2, Key, Globe, Lightning as Zap, Check, Brain, MagicWand as Wand2, Plus, MagnifyingGlass as Search, Folder, HardDrive, Headphones, SpeakerHigh as Volume2, Microphone as Mic, Play, Square, Stack as Blocks, Plug, ArrowCounterClockwise as RotateCcw, Terminal, PencilSimple as Edit2, SpinnerGap as Loader2, BookmarkSimple as BookMarked, FileText, Copy, Cpu , ChartBar } from "@phosphor-icons/react";
import {
  AppSettings,
  OllamaModel,
  ThemeType,
  FontFamilyType,
  ThinkingMode,
  Skill,
  VoiceSettingsConfig,
  ConnectorItem,
  PluginItem,
  MemoryConfig,
  MemoryItem,
} from "@/lib/types";
import { checkOllamaHealth, formatBytes } from "@/lib/ollama";
import { storage } from "@/lib/storage";
import { DEFAULT_SKILLS } from "@/lib/skills";
import { DEFAULT_CONNECTORS, DEFAULT_PLUGINS, DEFAULT_MEMORY_CONFIG } from "@/lib/directoryData";
import { CONTEXT_SIZE_PRESETS, KEEP_ALIVE_PRESETS, DEFAULT_CUSTOM_THEME } from "@/lib/constants";
import {
  VOICE_PRESETS,
  TONE_OPTIONS,
  getAllSystemVoices,
  getIndonesianVoices,
  resolveVoiceForConfig,
  speakUniversal,
  stopSpeaking,
} from "@/lib/voiceEngine";
import { checkLayaHealth } from "@/lib/layaClient";
import { clearPromptCacheEverywhere } from "@/lib/responseCache";
import dynamic from "next/dynamic";
import { FONT_OPTIONS, THEME_OPTIONS } from "./settings/shared";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
  models: OllamaModel[];
  onDataImported: () => void;
  onClearAllChats: () => void;
  initialSection?: SettingsSection;
  onOpenDiskExplorer?: () => void;
}

export type SettingsSection =
  | "personalization"
  | "chat"
  | "voice"
  | "skills"
  | "connectors"
  | "plugins"
  | "memory"
  | "retrieval"
  | "cloud"
  | "server"
  | "usage"
  | "data"
  | "about";
/**
 * All state and handlers of the settings dialog. The UI of each tab lives in
 * components/settings/<Name>Section.tsx and receives this object as `ctx`; its type is
 * inferred from what this hook returns, so sections stay fully type-checked.
 */
function useSettingsState({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  models,
  onDataImported,
  onClearAllChats,
  initialSection = "personalization",
  onOpenDiskExplorer,
}: SettingsModalProps) {

  const [formData, setFormData] = useState<AppSettings>(settings);
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);

  React.useEffect(() => {
    if (isOpen) {
      setFormData(settings);
    }
  }, [isOpen, settings]);

  React.useEffect(() => {
    if (isOpen && initialSection) {
      setActiveSection(initialSection);
    }
  }, [isOpen, initialSection]);

  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "failed">("idle");
  const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({});
  const [applyFeedback, setApplyFeedback] = useState(false);
  const [copiedAccelCmd, setCopiedAccelCmd] = useState(false);

  const handleCopyAccelCmd = () => {
    const cmd = `[System.Environment]::SetEnvironmentVariable('OLLAMA_FLASH_ATTENTION', '1', 'User'); [System.Environment]::SetEnvironmentVariable('OLLAMA_KV_CACHE_TYPE', 'q8_0', 'User')`;
    navigator.clipboard.writeText(cmd);
    setCopiedAccelCmd(true);
    setTimeout(() => setCopiedAccelCmd(false), 2500);
  };

  // Dropdown states for personalization
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);
  const themeDropdownRef = useRef<HTMLDivElement>(null);
  const fontDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(e.target as Node)) {
        setIsThemeDropdownOpen(false);
      }
      if (fontDropdownRef.current && !fontDropdownRef.current.contains(e.target as Node)) {
        setIsFontDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Skills state in settings
  const [skillSearch, setSkillSearch] = useState("");
  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");
  const [newSkillPrompt, setNewSkillPrompt] = useState("");

  // Connectors state in settings
  const [connectorSearch, setConnectorSearch] = useState("");
  const [configuringConnector, setConfiguringConnector] = useState<ConnectorItem | null>(null);
  const [connName, setConnName] = useState("");
  const [connDescription, setConnDescription] = useState("");
  const [connBridgeType, setConnBridgeType] = useState<"webhook" | "local-http">("webhook");
  const [connApiKey, setConnApiKey] = useState("");
  const [connWebhookUrl, setConnWebhookUrl] = useState("");
  const [connEndpoint, setConnEndpoint] = useState("");
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Laya System-1 state in settings
  const [isTestingLaya, setIsTestingLaya] = useState(false);
  const [layaStatus, setLayaStatus] = useState<{ online: boolean; latencyMs?: number; error?: string } | null>(null);

  // Response cache clear state
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheClearedAt, setCacheClearedAt] = useState<number | null>(null);

  const handleClearResponseCache = async () => {
    setIsClearingCache(true);
    try {
      await clearPromptCacheEverywhere();
      setCacheClearedAt(Date.now());
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleTestLayaConnection = async () => {
    setIsTestingLaya(true);
    setLayaStatus(null);
    try {
      const res = await checkLayaHealth(formData.layaEndpoint || "http://127.0.0.1:8000", formData.layaTimeoutMs || 1500);
      setLayaStatus(res);
    } catch (err: any) {
      setLayaStatus({ online: false, error: err.message || "Failed to reach Laya server" });
    } finally {
      setIsTestingLaya(false);
    }
  };

  // Plugins state in settings
  const [pluginSearch, setPluginSearch] = useState("");
  const [pluginCategory, setPluginCategory] = useState<"All" | "Anthropic" | "Partners">("All");

  // Memory state in settings
  const [memoryInput, setMemoryInput] = useState("");
  const [editingMemoryItem, setEditingMemoryItem] = useState<MemoryItem | null>(null);
  const [editMemTitle, setEditMemTitle] = useState("");
  const [editMemContent, setEditMemContent] = useState("");
  const [isImportMemOpen, setIsImportMemOpen] = useState(false);
  const [importMemText, setImportMemText] = useState("");
  const [isAddingCustomMem, setIsAddingCustomMem] = useState(false);
  const [newMemCategory, setNewMemCategory] = useState<"preference" | "profile" | "topic">("topic");
  const [newMemTitle, setNewMemTitle] = useState("");
  const [newMemContent, setNewMemContent] = useState("");

  // Retrieval & Knowledge Hub state in settings
  const [retrievalWatchedPath, setRetrievalWatchedPath] = useState(settings.watchedFolderPath || "");
  const [retrievalWatcherStatus, setRetrievalWatcherStatus] = useState<"idle" | "starting" | "stopping" | "error">("idle");
  const [retrievalWatcherError, setRetrievalWatcherError] = useState<string | null>(null);
  const [webDocUrl, setWebDocUrl] = useState("");
  const [isIngestingWebDoc, setIsIngestingWebDoc] = useState(false);
  const [webDocError, setWebDocError] = useState<string | null>(null);
  const [webDocSuccess, setWebDocSuccess] = useState<string | null>(null);
  const [importedDocs, setImportedDocs] = useState<Array<{ id: string; name: string; size: number; url: string; timestamp: number }>>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem("castalia_imported_web_docs");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleToggleGlobalWatcher = async () => {
    setRetrievalWatcherError(null);
    const targetPath = retrievalWatchedPath.trim() || formData.watchedFolderPath?.trim();
    if (!targetPath) {
      setRetrievalWatcherError("Masukkan folder path terlebih dahulu.");
      return;
    }

    if (formData.watchedFolderEnabled) {
      setRetrievalWatcherStatus("stopping");
      try {
        await apiFetch("/api/projects/watcher", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: "global_workspace", action: "stop" }),
        });
        setFormData((prev) => ({ ...prev, watchedFolderEnabled: false }));
      } catch (err: any) {
        setRetrievalWatcherError(err.message || "Gagal menghentikan watcher.");
      } finally {
        setRetrievalWatcherStatus("idle");
      }
      return;
    }

    setRetrievalWatcherStatus("starting");
    try {
      const res = await apiFetch("/api/projects/watcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "global_workspace", action: "start", folderPath: targetPath }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRetrievalWatcherError(data.error || "Gagal mengaktifkan folder watcher.");
        setRetrievalWatcherStatus("error");
        return;
      }
      setFormData((prev) => ({ ...prev, watchedFolderPath: targetPath, watchedFolderEnabled: true }));
      setRetrievalWatcherStatus("idle");
    } catch (err: any) {
      setRetrievalWatcherError(err.message || "Gagal mengaktifkan folder watcher.");
      setRetrievalWatcherStatus("error");
    }
  };

  const handleIngestWebDoc = async () => {
    const trimmed = webDocUrl.trim();
    if (!trimmed) return;
    setIsIngestingWebDoc(true);
    setWebDocError(null);
    setWebDocSuccess(null);
    try {
      const res = await apiFetch("/api/projects/ingest-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.file) {
        setWebDocError(data.error || "Gagal mengimpor dokumentasi web.");
        return;
      }
      const newDoc = {
        id: data.file.id,
        name: data.file.name,
        size: data.file.size,
        url: trimmed,
        timestamp: Date.now(),
      };
      const updated = [newDoc, ...importedDocs];
      setImportedDocs(updated);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("castalia_imported_web_docs", JSON.stringify(updated));
      }
      setWebDocUrl("");
      setWebDocSuccess(`Berhasil mengimpor: ${data.file.name} (${data.file.size} bytes)`);
    } catch (err: any) {
      setWebDocError(err.message || "Gagal mengimpor dokumentasi web.");
    } finally {
      setIsIngestingWebDoc(false);
    }
  };

  const handleDeleteImportedDoc = (id: string) => {
    const updated = importedDocs.filter((d) => d.id !== id);
    setImportedDocs(updated);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("castalia_imported_web_docs", JSON.stringify(updated));
    }
  };

  // Voice Preview State in Settings
  const [previewVoicePlaying, setPreviewVoicePlaying] = useState(false);
  const [allSystemVoices, setAllSystemVoices] = useState<SpeechSynthesisVoice[]>([]);

  React.useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const updateVoices = () => {
        setAllSystemVoices(getAllSystemVoices());
      };
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
      return () => {
        if (window.speechSynthesis) {
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
    }
  }, []);

  const handleTestVoice = async () => {
    if (previewVoicePlaying) {
      stopSpeaking();
      setPreviewVoicePlaying(false);
      return;
    }

    setPreviewVoicePlaying(true);
    const voiceCfg = formData.voice || {
      presetId: "female_gadis",
      pitch: 1.05,
      rate: 1.05,
      tone: "casual",
      engine: "natural",
      autoSilenceMs: 1400,
    };

    const sample =
      voiceCfg.tone === "casual"
        ? "Halo! Aku asisten AI kamu. Suaraku sekarang jauh lebih natural, komunikatif, dan fasih kan?"
        : voiceCfg.tone === "concise"
        ? "Siap. Menjawab langsung dengan cepat, ringkas, dan akurat."
        : "Halo! Senang bisa membantu Anda hari ini. Ada hal yang ingin Anda tanyakan?";

    const target = resolveVoiceForConfig(
      {
        presetId: voiceCfg.presetId as any,
        voiceName: voiceCfg.voiceName,
        pitch: voiceCfg.pitch,
        rate: voiceCfg.rate,
      },
      allSystemVoices
    );
    speakUniversal({
      text: sample,
      voice: target,
      pitch: voiceCfg.pitch,
      rate: voiceCfg.rate,
      onEnd: () => setPreviewVoicePlaying(false),
      onError: () => setPreviewVoicePlaying(false),
    });
  };

  const updateVoice = (updates: Partial<VoiceSettingsConfig>) => {
    const current: VoiceSettingsConfig = formData.voice || {
      presetId: "female_gadis",
      pitch: 1.05,
      rate: 1.05,
      tone: "casual",
      engine: "natural",
      autoSilenceMs: 1400,
    };
    setFormData({
      ...formData,
      voice: { ...current, ...updates },
    });
  };

  const toggleKeyVisibility = (provider: string) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const handleTestConnection = async () => {
    setTestStatus("testing");
    const ok = await checkOllamaHealth(formData.ollamaUrl);
    setTestStatus(ok ? "success" : "failed");
  };

  // 1. Apply changes (stays in settings modal)
  const handleApply = () => {
    onSaveSettings(formData);
    setApplyFeedback(true);
    setTimeout(() => setApplyFeedback(false), 2500);
  };

  // 2. Apply & Exit (saves and closes)
  const handleApplyAndExit = () => {
    onSaveSettings(formData);
    onClose();
  };

  // 3. Exit (always saves current changes so user never loses their edits)
  const handleExit = () => {
    onSaveSettings(formData);
    onClose();
  };

  const handleExport = (opts: { includeSecrets?: boolean } = {}) => {
    // `opts` may be a click event when used directly as onClick; only an explicit boolean counts.
    const dataStr = storage.exportData({ includeSecrets: opts?.includeSecrets === true });
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ollama-chat-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const success = storage.importData(content);
        if (success) {
          onDataImported();
          onClose();
        } else {
          alert("Invalid backup file format.");
        }
      } catch (err) {
        alert("Failed to parse backup JSON file.");
      }
    };
    reader.readAsText(file);
  };

  const currentSkills: Skill[] = formData.skills || DEFAULT_SKILLS;

  const toggleSkill = (skillId: string) => {
    const updated = currentSkills.map((s) => (s.id === skillId ? { ...s, enabled: !s.enabled } : s));
    setFormData({ ...formData, skills: updated });
  };

  const handleCreateCustomSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim() || !newSkillPrompt.trim()) return;

    const newSkill: Skill = {
      id: `custom_${Date.now()}`,
      name: newSkillName.trim(),
      description: newSkillDesc.trim() || "Custom Agentic Skill",
      systemPrompt: newSkillPrompt.trim(),
      enabled: true,
      isCustom: true,
      author: "User Created",
      tags: ["Custom", "Prompt"],
    };

    setFormData({ ...formData, skills: [newSkill, ...currentSkills] });
    setNewSkillName("");
    setNewSkillDesc("");
    setNewSkillPrompt("");
    setIsAddingSkill(false);
  };

  const handleDeleteSkill = (skillId: string) => {
    const updated = currentSkills.filter((s) => s.id !== skillId);
    setFormData({ ...formData, skills: updated });
  };

  // Connectors logic & handlers
  const currentConnectors: ConnectorItem[] = formData.connectors || DEFAULT_CONNECTORS;

  const handleToggleConnector = (connId: string) => {
    const updated = currentConnectors.map((c) =>
      c.id === connId ? { ...c, installed: !c.installed } : c
    );
    const newSettings = { ...formData, connectors: updated };
    setFormData(newSettings);
    onSaveSettings(newSettings);
  };

  const handleTestConnectorConnection = async () => {
    if (!configuringConnector) return;
    setIsTestingConn(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          customBridgeType: connBridgeType,
          apiKey: connApiKey,
          webhookUrl: connWebhookUrl,
          endpoint: connEndpoint,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: data.message || "Connection test succeeded!",
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || "Connection test failed.",
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "Network error while testing connection.",
      });
    } finally {
      setIsTestingConn(false);
    }
  };

  const openAddBridgeModal = () => {
    setConfiguringConnector({
      id: "",
      name: "",
      description: "",
      category: "custom",
      installed: false,
      customBridgeType: "webhook",
    });
    setConnName("");
    setConnDescription("");
    setConnApiKey("");
    setConnWebhookUrl("");
    setConnEndpoint("");
    setConnBridgeType("webhook");
    setTestResult(null);
  };

  const openEditBridgeModal = (conn: ConnectorItem) => {
    setConfiguringConnector(conn);
    setConnName(conn.name);
    setConnDescription(conn.description);
    setConnApiKey(conn.apiKey || "");
    setConnWebhookUrl(conn.webhookUrl || "");
    setConnEndpoint(conn.endpoint || "");
    setConnBridgeType(conn.customBridgeType || "webhook");
    setTestResult(null);
  };

  const handleSaveConnectorConfig = () => {
    if (!configuringConnector) return;
    const isLive = testResult ? testResult.success : !!(connApiKey || connWebhookUrl || connEndpoint);
    const isNew = !configuringConnector.id || !currentConnectors.some((c) => c.id === configuringConnector.id);

    const savedConnector: ConnectorItem = {
      id: isNew ? `bridge_${Date.now()}` : configuringConnector.id,
      name: connName.trim() || "Untitled Bridge",
      description: connDescription.trim() || "Custom bridge",
      category: "custom",
      installed: true,
      customBridgeType: connBridgeType,
      apiKey: connApiKey.trim() || undefined,
      webhookUrl: connWebhookUrl.trim() || undefined,
      endpoint: connEndpoint.trim() || undefined,
      isLiveConnected: isLive,
      statusMessage: testResult?.message || (isLive ? "Connection configured & active" : undefined),
    };

    const updated = isNew
      ? [...currentConnectors, savedConnector]
      : currentConnectors.map((c) => (c.id === savedConnector.id ? savedConnector : c));

    const newSettings = { ...formData, connectors: updated };
    setFormData(newSettings);
    onSaveSettings(newSettings);
    setConfiguringConnector(null);
  };

  const handleDeleteConnector = (id: string) => {
    const updated = currentConnectors.filter((c) => c.id !== id);
    const newSettings = { ...formData, connectors: updated };
    setFormData(newSettings);
    onSaveSettings(newSettings);
    if (configuringConnector?.id === id) {
      setConfiguringConnector(null);
    }
  };

  // Plugins logic & handlers
  const currentPlugins: PluginItem[] = formData.plugins || DEFAULT_PLUGINS;

  const handleTogglePlugin = (pluginId: string) => {
    const target = currentPlugins.find((p) => p.id === pluginId);
    const newInstalled = !target?.installed;
    const updated = currentPlugins.map((p) =>
      p.id === pluginId ? { ...p, installed: newInstalled } : p
    );
    const newSettings = { ...formData, plugins: updated };
    setFormData(newSettings);
    onSaveSettings(newSettings);
  };

  // Memory logic & handlers
  const currentMemory: MemoryConfig = formData.memory || DEFAULT_MEMORY_CONFIG;
  const memoryItems: MemoryItem[] = currentMemory.items || [];

  const saveMemoryConfig = (
    newItems: MemoryItem[],
    gen = currentMemory.generateFromChats ?? true,
    sens = currentMemory.includeSensitive ?? false
  ) => {
    const newConfig: MemoryConfig = {
      generateFromChats: gen,
      includeSensitive: sens,
      items: newItems,
    };
    const newSettings = { ...formData, memory: newConfig };
    setFormData(newSettings);
    onSaveSettings(newSettings);
  };

  const handleToggleGenerateMemory = () => {
    const next = !(currentMemory.generateFromChats ?? true);
    saveMemoryConfig(memoryItems, next, currentMemory.includeSensitive ?? false);
  };

  const handleToggleSensitiveMemory = () => {
    const next = !(currentMemory.includeSensitive ?? false);
    saveMemoryConfig(memoryItems, currentMemory.generateFromChats ?? true, next);
  };

  const handleDeleteMemoryItem = (id: string) => {
    const updated = memoryItems.filter((i) => i.id !== id);
    saveMemoryConfig(updated);
  };

  const handleToggleMemoryItem = (id: string) => {
    const updated = memoryItems.map((i) => (i.id === id ? { ...i, enabled: !i.enabled } : i));
    saveMemoryConfig(updated);
  };

  const handleProcessNaturalLanguageMemory = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const prompt = memoryInput.trim();
    if (!prompt) return;

    const lower = prompt.toLowerCase();

    // Check if delete command
    if (lower.startsWith("hapus") || lower.startsWith("delete") || lower.startsWith("remove")) {
      const target = lower.replace(/^(hapus|delete|remove)\s+/i, "").trim();
      const updated = memoryItems.filter(
        (i) => !i.title.toLowerCase().includes(target) && !i.content.toLowerCase().includes(target)
      );
      saveMemoryConfig(updated);
      setMemoryInput("");
      return;
    }

    // Check if updating preferences
    if (lower.includes("prefer") || lower.includes("respond") || lower.includes("gaya") || lower.includes("bahasa")) {
      const existing = memoryItems.find((i) => i.category === "preference");
      if (existing) {
        const updated = memoryItems.map((i) =>
          i.id === existing.id
            ? { ...i, content: `${i.content}; ${prompt}`, updatedAt: Date.now() }
            : i
        );
        saveMemoryConfig(updated);
      } else {
        const newItem: MemoryItem = {
          id: `mem_${Date.now()}`,
          category: "preference",
          title: "Preferences",
          content: prompt,
          updatedAt: Date.now(),
          enabled: true,
        };
        saveMemoryConfig([...memoryItems, newItem]);
      }
      setMemoryInput("");
      return;
    }

    // Check if updating profile
    if (lower.includes("saya") || lower.includes("pekerjaan") || lower.includes("role") || lower.includes("kerja di")) {
      const existing = memoryItems.find((i) => i.category === "profile");
      if (existing) {
        const updated = memoryItems.map((i) =>
          i.id === existing.id ? { ...i, content: prompt, updatedAt: Date.now() } : i
        );
        saveMemoryConfig(updated);
      } else {
        const newItem: MemoryItem = {
          id: `mem_${Date.now()}`,
          category: "profile",
          title: "Profile",
          content: prompt,
          updatedAt: Date.now(),
          enabled: true,
        };
        saveMemoryConfig([...memoryItems, newItem]);
      }
      setMemoryInput("");
      return;
    }

    // Default: Add as new contextual Topic memory
    const newItem: MemoryItem = {
      id: `mem_topic_${Date.now()}`,
      category: "topic",
      title: prompt.slice(0, 24).replace(/[^a-zA-Z0-9 ]/g, "").trim() || "Topic Memory",
      content: prompt,
      updatedAt: Date.now(),
      enabled: true,
    };
    saveMemoryConfig([...memoryItems, newItem]);
    setMemoryInput("");
  };

  const handleStartEditMemory = (item: MemoryItem) => {
    setEditingMemoryItem(item);
    setEditMemTitle(item.title);
    setEditMemContent(item.content);
  };

  const handleSaveEditMemory = () => {
    if (!editingMemoryItem) return;
    const updated = memoryItems.map((i) =>
      i.id === editingMemoryItem.id
        ? {
            ...i,
            title: editMemTitle.trim() || i.title,
            content: editMemContent.trim() || i.content,
            updatedAt: Date.now(),
          }
        : i
    );
    setEditingMemoryItem(null);
    saveMemoryConfig(updated);
  };

  const handleCreateCustomMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemTitle.trim() || !newMemContent.trim()) return;
    const newItem: MemoryItem = {
      id: `mem_${Date.now()}`,
      category: newMemCategory,
      title: newMemTitle.trim(),
      content: newMemContent.trim(),
      updatedAt: Date.now(),
      enabled: true,
    };
    saveMemoryConfig([...memoryItems, newItem]);
    setNewMemTitle("");
    setNewMemContent("");
    setIsAddingCustomMem(false);
  };

  const handleExportMemory = () => {
    const dataStr = JSON.stringify(memoryItems, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ollama-memory-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportMemoryJson = () => {
    try {
      const parsed = JSON.parse(importMemText);
      const toAdd = Array.isArray(parsed) ? parsed : (parsed.items && Array.isArray(parsed.items) ? parsed.items : null);
      if (toAdd) {
        saveMemoryConfig([...toAdd, ...memoryItems]);
        setIsImportMemOpen(false);
        setImportMemText("");
      } else {
        alert("Invalid JSON format. Please paste valid memory JSON.");
      }
    } catch {
      alert("Invalid JSON format. Please paste valid memory JSON.");
    }
  };

  const filteredConnectors = currentConnectors.filter(
    (c) =>
      c.name.toLowerCase().includes(connectorSearch.toLowerCase()) ||
      c.description.toLowerCase().includes(connectorSearch.toLowerCase()) ||
      (c.endpoint && c.endpoint.toLowerCase().includes(connectorSearch.toLowerCase())) ||
      (c.webhookUrl && c.webhookUrl.toLowerCase().includes(connectorSearch.toLowerCase()))
  );

  const filteredPlugins = currentPlugins.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(pluginSearch.toLowerCase()) ||
      p.description.toLowerCase().includes(pluginSearch.toLowerCase()) ||
      p.author.toLowerCase().includes(pluginSearch.toLowerCase());
    const matchesCategory =
      pluginCategory === "All" ||
      (p.category || "Anthropic").toLowerCase() === pluginCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  interface NavItemDef {
    id: SettingsSection;
    label: string;
    sublabel: string;
    icon: any;
    color: string;
    badgeBg: string;
    group: "preferences" | "customize" | "system";
  }

  const PREFERENCES_NAV: NavItemDef[] = [
    {
      id: "personalization",
      label: "Personalization",
      sublabel: `${THEME_OPTIONS.find((t) => t.id === formData.theme)?.name || "Dark"} • ${
        FONT_OPTIONS.find((f) => f.id === formData.fontFamily)?.name || "Inter"
      }`,
      icon: Palette,
      color: "text-purple-400",
      badgeBg: "bg-purple-500/15 text-purple-400",
      group: "preferences",
    },
    {
      id: "chat",
      label: "Chat & Generation",
      sublabel: `T: ${formData.temperature} • TopP: ${formData.topP} • ${formData.thinkingMode || "default"}`,
      icon: Sliders,
      color: "text-amber-400",
      badgeBg: "bg-amber-500/15 text-amber-400",
      group: "preferences",
    },
    {
      id: "voice",
      label: "Voice & Speech Engine",
      sublabel: `${(formData.voice?.presetId || "female_gadis").replace("female_", "").replace("male_", "")} • Natural Voice`,
      icon: Headphones,
      color: "text-purple-400",
      badgeBg: "bg-purple-500/15 text-purple-400",
      group: "preferences",
    },
  ];

  const CUSTOMIZE_NAV: NavItemDef[] = [
    {
      id: "skills",
      label: "Agentic Skills Hub",
      sublabel: `${currentSkills.filter((s) => s.enabled).length} of ${currentSkills.length} active`,
      icon: Zap,
      color: "text-amber-400",
      badgeBg: "bg-amber-500/15 text-amber-400",
      group: "customize",
    },
    {
      id: "connectors",
      label: "Custom Connectors",
      sublabel: `${currentConnectors.filter((c) => c.installed).length} of ${currentConnectors.length} connected`,
      icon: Blocks,
      color: "text-blue-400",
      badgeBg: "bg-blue-500/15 text-blue-400",
      group: "customize",
    },
    {
      id: "plugins",
      label: "Plugins & Extensions",
      sublabel: `${currentPlugins.filter((p) => p.installed).length} installed`,
      icon: Plug,
      color: "text-emerald-400",
      badgeBg: "bg-emerald-500/15 text-emerald-400",
      group: "customize",
    },
    {
      id: "memory",
      label: "Memory & Context",
      sublabel: `${memoryItems.length} memories stored`,
      icon: RotateCcw,
      color: "text-purple-400",
      badgeBg: "bg-purple-500/15 text-purple-400",
      group: "customize",
    },
    {
      id: "retrieval",
      label: "Knowledge & Retrieval (RAG)",
      sublabel: "Advance Tuning, Watcher, Web Docs",
      icon: BookMarked,
      color: "text-indigo-400",
      badgeBg: "bg-indigo-500/15 text-indigo-400",
      group: "customize",
    },
  ];

  const SYSTEM_NAV: NavItemDef[] = [
    {
      id: "cloud",
      label: "Cloud AI Models",
      sublabel: "Gemini, Claude, GPT, DeepSeek, Groq",
      icon: Cloud,
      color: "text-sky-400",
      badgeBg: "bg-sky-500/15 text-sky-400",
      group: "system",
    },
    {
      id: "server",
      label: "Local Ollama & Search",
      sublabel: formData.ollamaUrl.replace(/^https?:\/\//, ""),
      icon: Server,
      color: "text-emerald-400",
      badgeBg: "bg-emerald-500/15 text-emerald-400",
      group: "system",
    },
    {
      id: "usage",
      label: "Usage & Cost",
      sublabel: "Token dan perkiraan biaya",
      icon: ChartBar,
      color: "text-amber-400",
      badgeBg: "bg-amber-500/15 text-amber-400",
      group: "system",
    },
    {
      id: "data",
      label: "Data, Backup & Export",
      sublabel: "Sync, Backup, Reset",
      icon: Database,
      color: "text-rose-400",
      badgeBg: "bg-rose-500/15 text-rose-400",
      group: "system",
    },
    {
      id: "about",
      label: "About & Diagnostics",
      sublabel: "v2.5 Local AI Workspace",
      icon: Info,
      color: "text-slate-400",
      badgeBg: "bg-slate-500/15 text-slate-400",
      group: "system",
    },
  ];

  const NAV_ITEMS: NavItemDef[] = [...PREFERENCES_NAV, ...CUSTOMIZE_NAV, ...SYSTEM_NAV];

  const applyParamPreset = (type: "code" | "balanced" | "creative") => {
    if (type === "code") {
      setFormData((prev) => ({
        ...prev,
        temperature: 0.2,
        topP: 0.85,
        topK: 30,
        repeatPenalty: 1.15,
      }));
    } else if (type === "balanced") {
      setFormData((prev) => ({
        ...prev,
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        repeatPenalty: 1.1,
      }));
    } else if (type === "creative") {
      setFormData((prev) => ({
        ...prev,
        temperature: 1.2,
        topP: 0.95,
        topK: 60,
        repeatPenalty: 1.05,
      }));
    }
  };
  return {
    CUSTOMIZE_NAV,
    NAV_ITEMS,
    PREFERENCES_NAV,
    SYSTEM_NAV,
    activeSection,
    allSystemVoices,
    applyFeedback,
    applyParamPreset,
    cacheClearedAt,
    configuringConnector,
    connApiKey,
    connBridgeType,
    connDescription,
    connEndpoint,
    connName,
    connWebhookUrl,
    connectorSearch,
    copiedAccelCmd,
    currentMemory,
    currentSkills,
    editMemContent,
    editMemTitle,
    editingMemoryItem,
    filteredConnectors,
    filteredPlugins,
    fontDropdownRef,
    formData,
    handleApply,
    handleApplyAndExit,
    handleClearResponseCache,
    handleCopyAccelCmd,
    handleCreateCustomMemory,
    handleCreateCustomSkill,
    handleDeleteConnector,
    handleDeleteImportedDoc,
    handleDeleteMemoryItem,
    handleDeleteSkill,
    handleExit,
    handleExport,
    handleExportMemory,
    handleImportFile,
    handleImportMemoryJson,
    handleIngestWebDoc,
    handleProcessNaturalLanguageMemory,
    handleSaveConnectorConfig,
    handleSaveEditMemory,
    handleStartEditMemory,
    handleTestConnection,
    handleTestConnectorConnection,
    handleTestLayaConnection,
    handleTestVoice,
    handleToggleConnector,
    handleToggleGenerateMemory,
    handleToggleGlobalWatcher,
    handleTogglePlugin,
    handleToggleSensitiveMemory,
    importMemText,
    importedDocs,
    isAddingCustomMem,
    isAddingSkill,
    isClearingCache,
    isFontDropdownOpen,
    isImportMemOpen,
    isIngestingWebDoc,
    isOpen,
    isTestingConn,
    isTestingLaya,
    isThemeDropdownOpen,
    layaStatus,
    memoryInput,
    memoryItems,
    mobileShowDetail,
    models,
    newMemCategory,
    newMemContent,
    newMemTitle,
    newSkillDesc,
    newSkillName,
    newSkillPrompt,
    onClearAllChats,
    onClose,
    onOpenDiskExplorer,
    onSaveSettings,
    openAddBridgeModal,
    openEditBridgeModal,
    pluginCategory,
    pluginSearch,
    previewVoicePlaying,
    retrievalWatchedPath,
    retrievalWatcherError,
    retrievalWatcherStatus,
    setActiveSection,
    setConfiguringConnector,
    setConnApiKey,
    setConnBridgeType,
    setConnDescription,
    setConnEndpoint,
    setConnName,
    setConnWebhookUrl,
    setConnectorSearch,
    setEditMemContent,
    setEditMemTitle,
    setEditingMemoryItem,
    setFormData,
    setImportMemText,
    setIsAddingCustomMem,
    setIsAddingSkill,
    setIsFontDropdownOpen,
    setIsImportMemOpen,
    setIsThemeDropdownOpen,
    setMemoryInput,
    setMobileShowDetail,
    setNewMemCategory,
    setNewMemContent,
    setNewMemTitle,
    setNewSkillDesc,
    setNewSkillName,
    setNewSkillPrompt,
    setPluginCategory,
    setPluginSearch,
    setRetrievalWatchedPath,
    setSkillSearch,
    setWebDocUrl,
    showKeys,
    skillSearch,
    testResult,
    testStatus,
    themeDropdownRef,
    toggleKeyVisibility,
    toggleSkill,
    updateVoice,
    webDocError,
    webDocSuccess,
    webDocUrl,
  };
}

export type SettingsCtx = ReturnType<typeof useSettingsState>;

// Tabs are loaded on demand: only the open section's code is fetched.
const PersonalizationSection = dynamic<{ ctx: SettingsCtx }>(() => import("./settings/PersonalizationSection").then((m) => m.PersonalizationSection), { ssr: false });
const ChatSection = dynamic<{ ctx: SettingsCtx }>(() => import("./settings/ChatSection").then((m) => m.ChatSection), { ssr: false });
const VoiceSection = dynamic<{ ctx: SettingsCtx }>(() => import("./settings/VoiceSection").then((m) => m.VoiceSection), { ssr: false });
const SkillsSection = dynamic<{ ctx: SettingsCtx }>(() => import("./settings/SkillsSection").then((m) => m.SkillsSection), { ssr: false });
const ConnectorsSection = dynamic<{ ctx: SettingsCtx }>(() => import("./settings/ConnectorsSection").then((m) => m.ConnectorsSection), { ssr: false });
const PluginsSection = dynamic<{ ctx: SettingsCtx }>(() => import("./settings/PluginsSection").then((m) => m.PluginsSection), { ssr: false });
const MemorySection = dynamic<{ ctx: SettingsCtx }>(() => import("./settings/MemorySection").then((m) => m.MemorySection), { ssr: false });
const RetrievalSection = dynamic<{ ctx: SettingsCtx }>(() => import("./settings/RetrievalSection").then((m) => m.RetrievalSection), { ssr: false });
const CloudSection = dynamic<{ ctx: SettingsCtx }>(() => import("./settings/CloudSection").then((m) => m.CloudSection), { ssr: false });
const ServerSection = dynamic<{ ctx: SettingsCtx }>(() => import("./settings/ServerSection").then((m) => m.ServerSection), { ssr: false });
const UsageSection = dynamic<{ ctx: SettingsCtx }>(() => import("./settings/UsageSection").then((m) => m.UsageSection), { ssr: false });
const DataSection = dynamic<{ ctx: SettingsCtx }>(() => import("./settings/DataSection").then((m) => m.DataSection), { ssr: false });
const AboutSection = dynamic<{ ctx: SettingsCtx }>(() => import("./settings/AboutSection").then((m) => m.AboutSection), { ssr: false });

export const SettingsModal: React.FC<SettingsModalProps> = (props) => {
  const ctx = useSettingsState(props);
  const {
    CUSTOMIZE_NAV,
    NAV_ITEMS,
    PREFERENCES_NAV,
    SYSTEM_NAV,
    activeSection,
    applyFeedback,
    handleApply,
    handleApplyAndExit,
    handleExit,
    isOpen,
    mobileShowDetail,
    setActiveSection,
    setMobileShowDetail,
  } = ctx;
  if (!isOpen) return null;

  return (
    (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-0 sm:p-1.5 md:p-2">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={handleExit}
      />

      {/* Full-Fit Desktop Window Container */}
      <div className="relative w-full sm:w-[99vw] md:w-[98vw] max-w-[2200px] bg-[var(--card-bg)] text-[var(--foreground)] rounded-none sm:rounded-3xl border-0 sm:border border-[var(--card-border)] shadow-2xl overflow-hidden flex flex-col z-10 h-[100dvh] sm:h-[98vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        {/* Top Header Bar */}
        <div className="px-5 py-3.5 border-b border-[var(--sidebar-border)] flex items-center justify-between flex-shrink-0 bg-[var(--sidebar-bg)]">
          <div className="flex items-center gap-2">
            {mobileShowDetail && (
              <button
                onClick={() => setMobileShowDetail(false)}
                className="md:hidden flex items-center gap-1 text-xs font-semibold text-emerald-400 mr-2 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Settings
              </button>
            )}
            <h2 className="text-sm sm:text-base font-bold tracking-tight text-[var(--foreground)]">
              {mobileShowDetail
                ? NAV_ITEMS.find((n) => n.id === activeSection)?.label
                : "Settings & Preferences"}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleApply}
              type="button"
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Simpan Pengaturan Sekarang"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Simpan</span>
            </button>
            <button
              onClick={handleExit}
              className="p-1.5 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
              title="Tutup (Simpan otomatis)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Master-Detail Body Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Master List Column (Left on Desktop / Main on Mobile) */}
          <div
            className={`w-full md:w-80 border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/40 p-3 overflow-y-auto space-y-1 flex-shrink-0 touch-scroll ${
              mobileShowDetail ? "hidden md:block" : "block"
            }`}
          >
            {/* Preferences Group */}
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] px-3 py-1.5">
              Preferences
            </div>
            <div className="space-y-0.5">
              {PREFERENCES_NAV.map((item) => {
                const isSelected = activeSection === item.id;
                const IconComp = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveSection(item.id);
                      setMobileShowDetail(true);
                    }}
                    className={`w-full text-left p-2.5 rounded-2xl flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[var(--card-bg)] text-[var(--foreground)] font-semibold shadow-xs border border-[var(--card-border)]"
                        : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${item.badgeBg}`}
                      >
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs truncate text-[var(--foreground)] font-medium">
                          {item.label}
                        </div>
                        <div className="text-[10px] text-[var(--muted)] truncate">
                          {item.sublabel}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--muted)] opacity-50 flex-shrink-0" />
                  </button>
                );
              })}
            </div>

            {/* Customize Group (Moved from Side Menu to Settings) */}
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] px-3 pt-3.5 pb-1.5 flex items-center justify-between">
              <span>Customize</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20">
                Extensions
              </span>
            </div>
            <div className="space-y-0.5">
              {CUSTOMIZE_NAV.map((item) => {
                const isSelected = activeSection === item.id;
                const IconComp = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveSection(item.id);
                      setMobileShowDetail(true);
                    }}
                    className={`w-full text-left p-2.5 rounded-2xl flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[var(--card-bg)] text-[var(--foreground)] font-semibold shadow-xs border border-[var(--card-border)]"
                        : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${item.badgeBg}`}
                      >
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs truncate text-[var(--foreground)] font-medium">
                          {item.label}
                        </div>
                        <div className="text-[10px] text-[var(--muted)] truncate">
                          {item.sublabel}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--muted)] opacity-50 flex-shrink-0" />
                  </button>
                );
              })}
            </div>

            {/* System Group */}
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] px-3 pt-3.5 pb-1.5">
              System & Platform
            </div>
            <div className="space-y-0.5">
              {SYSTEM_NAV.map((item) => {
                const isSelected = activeSection === item.id;
                const IconComp = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveSection(item.id);
                      setMobileShowDetail(true);
                    }}
                    className={`w-full text-left p-2.5 rounded-2xl flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[var(--card-bg)] text-[var(--foreground)] font-semibold shadow-xs border border-[var(--card-border)]"
                        : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${item.badgeBg}`}
                      >
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs truncate text-[var(--foreground)] font-medium">
                          {item.label}
                        </div>
                        <div className="text-[10px] text-[var(--muted)] truncate">
                          {item.sublabel}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--muted)] opacity-50 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail Content Panel (Right on Desktop / Pushed on Mobile) */}
          <div
            className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 touch-scroll bg-[var(--card-bg)] ${
              !mobileShowDetail ? "hidden md:block" : "block"
            }`}
          >
            {/* 1. PERSONALIZATION (THEMES + TYPOGRAPHY CONSOLIDATED) */}
            {activeSection === "personalization" && <PersonalizationSection ctx={ctx} />}

            {/* 2. CHAT & GENERATION (GRANULAR MODEL CUSTOMIZATION) */}
            {activeSection === "chat" && <ChatSection ctx={ctx} />}

            {/* VOICE & SPEECH ENGINE SECTION */}
            {activeSection === "voice" && <VoiceSection ctx={ctx} />}

            {/* 3. AGENTIC SKILLS HUB SECTION (MOVED TO SETTINGS) */}
            {activeSection === "skills" && <SkillsSection ctx={ctx} />}

            {/* 4. CUSTOM CONNECTORS SECTION (MOVED FROM SIDEBAR TO SETTINGS) */}
            {activeSection === "connectors" && <ConnectorsSection ctx={ctx} />}

            {/* 5. PLUGINS & EXTENSIONS SECTION (MOVED FROM SIDEBAR TO SETTINGS) */}
            {activeSection === "plugins" && <PluginsSection ctx={ctx} />}

            {/* 6. MEMORY & CONTEXT SECTION (MOVED FROM SIDEBAR TO SETTINGS) */}
            {activeSection === "memory" && <MemorySection ctx={ctx} />}

            {/* 6.5. KNOWLEDGE & RETRIEVAL (RAG) ARCHITECTURE */}
            {activeSection === "retrieval" && <RetrievalSection ctx={ctx} />}

            {/* 7. CLOUD AI MODELS SECTION */}
            {activeSection === "cloud" && <CloudSection ctx={ctx} />}

            {/* 5. LOCAL OLLAMA & SEARCH SECTION */}
            {activeSection === "server" && <ServerSection ctx={ctx} />}

            {/* 6. DATA, BACKUP & EXPORT */}
            {activeSection === "usage" && <UsageSection ctx={ctx} />}
            {activeSection === "data" && <DataSection ctx={ctx} />}

            {/* 7. ABOUT & DIAGNOSTICS */}
            {activeSection === "about" && <AboutSection ctx={ctx} />}
          </div>
        </div>

        {/* Bottom Action Bar with Apply, Apply & Exit, and Exit Buttons */}
        <div className="px-5 py-3 border-t border-[var(--sidebar-border)] flex items-center justify-between flex-shrink-0 bg-[var(--sidebar-bg)]">
          <div className="flex items-center gap-2">
            {applyFeedback && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold animate-in fade-in duration-150">
                <Check className="w-4 h-4" />
                <span>Settings applied successfully!</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* 1. Exit / Cancel */}
            <button
              type="button"
              onClick={handleExit}
              className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-[var(--foreground)] transition-colors cursor-pointer"
            >
              Exit
            </button>

            {/* 2. Apply (Stay in Settings) */}
            <button
              type="button"
              onClick={handleApply}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 transition-all active:scale-95 cursor-pointer shadow-2xs"
            >
              Apply
            </button>

            {/* 3. Apply & Exit */}
            <button
              type="button"
              onClick={handleApplyAndExit}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer"
            >
              Apply & Exit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
  );
};
