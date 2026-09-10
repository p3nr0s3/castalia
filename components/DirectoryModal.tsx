"use client";

import React, { useState } from "react";
import { apiFetch } from "../lib/apiClient";
import {
  X,
  ScrollText,
  Blocks,
  Plug,
  Search,
  Plus,
  Check,
  Download,
  Settings,
  Globe,
  Code2,
  FileText,
  Palette,
  Layers,
  Wand2,
  Sparkles,
  Sun,
  RotateCcw,
  GraduationCap,
  Megaphone,
  Binary,
  ShieldAlert,
  Terminal,
  CheckSquare,
  Database,
  Mail,
  HardDrive,
  MessageSquare,
  ExternalLink,
  Github,
  Filter,
  ArrowUpDown,
  Sliders,
  Loader2,
  CheckCircle2,
  AlertCircle,
  GitBranch,
  MessageCircle,
  Box,
  Copy,
  Zap,
} from "lucide-react";
import { Skill, ConnectorItem, PluginItem } from "@/lib/types";

interface DirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "skills" | "connectors" | "plugins";
  skills: Skill[];
  onSaveSkills: (updatedSkills: Skill[]) => void;
  connectors?: ConnectorItem[];
  onSaveConnectors?: (updated: ConnectorItem[]) => void;
  plugins?: PluginItem[];
  onSavePlugins?: (updated: PluginItem[]) => void;
}

export const DirectoryModal: React.FC<DirectoryModalProps> = ({
  isOpen,
  onClose,
  initialTab = "skills",
  skills,
  onSaveSkills,
  connectors = [],
  onSaveConnectors,
  plugins = [],
  onSavePlugins,
}) => {
  const [activeTab, setActiveTab] = useState<"skills" | "connectors" | "plugins">(initialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [pluginCategory, setPluginCategory] = useState<"Anthropic" | "Partners">("Anthropic");
  const [skillCategory, setSkillCategory] = useState<"All" | "Anthropic" | "Community">("All");

  // GitHub / Custom Skill Import Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importName, setImportName] = useState("");
  const [importSlashCommand, setImportSlashCommand] = useState("");
  const [importPrompt, setImportPrompt] = useState("");
  const [importDesc, setImportDesc] = useState("");
  const [isFetchingGithub, setIsFetchingGithub] = useState(false);
  const [importError, setImportError] = useState("");

  // Connector Configuration Modal
  const [configuringConnector, setConfiguringConnector] = useState<ConnectorItem | null>(null);
  const [connApiKey, setConnApiKey] = useState("");
  const [connWebhookUrl, setConnWebhookUrl] = useState("");
  const [connRepo, setConnRepo] = useState("");
  const [connEndpoint, setConnEndpoint] = useState("");
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [blenderStartupInstalled, setBlenderStartupInstalled] = useState<boolean | null>(null);
  const [blenderStartupVersions, setBlenderStartupVersions] = useState<any[]>([]);
  const [isManagingStartup, setIsManagingStartup] = useState(false);
  const [startupNotice, setStartupNotice] = useState<string | null>(null);

  const checkBlenderStartup = async () => {
    try {
      const res = await apiFetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "blender_check_startup" }),
      });
      const data = await res.json();
      if (data.success) {
        setBlenderStartupInstalled(data.installed);
        setBlenderStartupVersions(data.versions || []);
      }
    } catch (e) {}
  };

  const handleInstallStartup = async () => {
    setIsManagingStartup(true);
    setStartupNotice(null);
    try {
      const res = await apiFetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "blender_install_startup" }),
      });
      const data = await res.json();
      if (data.success) {
        setBlenderStartupInstalled(true);
        setBlenderStartupVersions(data.versions || []);
        setStartupNotice("✓ Berhasil dipasang ke Blender Startup! Setiap kali membuka Blender, bridge langsung aktif otomatis.");
      } else {
        setStartupNotice("Gagal memasang ke startup: " + (data.error || "Unknown error"));
      }
    } catch (err: any) {
      setStartupNotice("Error: " + err.message);
    } finally {
      setIsManagingStartup(false);
    }
  };

  const handleUninstallStartup = async () => {
    setIsManagingStartup(true);
    setStartupNotice(null);
    try {
      const res = await apiFetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "blender_uninstall_startup" }),
      });
      const data = await res.json();
      if (data.success) {
        setBlenderStartupInstalled(false);
        setBlenderStartupVersions(data.versions || []);
        setStartupNotice("Auto-start berhasil dicopot dari Blender startup.");
      }
    } catch (err: any) {
      setStartupNotice("Error: " + err.message);
    } finally {
      setIsManagingStartup(false);
    }
  };

  // Sync initialTab if prop changes
  React.useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  // --- Skill Handlers ---
  const handleToggleSkill = (skillId: string) => {
    const updated = skills.map((s) => (s.id === skillId ? { ...s, enabled: !s.enabled } : s));
    onSaveSkills(updated);
  };

  // --- Connector Handlers ---
  const handleToggleConnector = (connId: string) => {
    if (!onSaveConnectors) return;
    const updated = connectors.map((c) => (c.id === connId ? { ...c, installed: !c.installed } : c));
    onSaveConnectors(updated);
  };

  const handleOpenConfigure = (conn: ConnectorItem) => {
    setConfiguringConnector(conn);
    setConnApiKey(conn.apiKey || "");
    setConnWebhookUrl(conn.webhookUrl || "");
    setConnRepo(conn.repo || "");
    setConnEndpoint(conn.endpoint || "");
    setTestResult(
      conn.statusMessage
        ? { success: !!conn.isLiveConnected, message: conn.statusMessage }
        : null
    );
    setStartupNotice(null);
    if (conn.id === "blender-mcp") {
      checkBlenderStartup();
    }
  };

  const handleTestConnection = async () => {
    if (!configuringConnector) return;
    setIsTestingConn(true);
    setTestResult(null);

    try {
      const res = await apiFetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          service: configuringConnector.id,
          apiKey: connApiKey,
          webhookUrl: connWebhookUrl,
          repo: connRepo,
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

  const handleSaveConnectorConfig = () => {
    if (!configuringConnector || !onSaveConnectors) return;
    const isLive = testResult ? testResult.success : !!(connApiKey || connWebhookUrl || connEndpoint);
    const updated = connectors.map((c) => {
      if (c.id === configuringConnector.id) {
        return {
          ...c,
          apiKey: connApiKey.trim(),
          webhookUrl: connWebhookUrl.trim(),
          repo: connRepo.trim(),
          endpoint: connEndpoint.trim(),
          installed: true,
          isLiveConnected: isLive,
          statusMessage: testResult?.message || (isLive ? "Connection configured & active" : undefined),
          lastTested: Date.now(),
        };
      }
      return c;
    });

    onSaveConnectors(updated);
    setConfiguringConnector(null);
  };

  // --- Plugin Handlers ---
  const handleTogglePlugin = (pluginId: string) => {
    if (!onSavePlugins) return;
    const target = plugins.find((p) => p.id === pluginId);
    if (!target) return;
    const newInstalled = !target.installed;
    const updated = plugins.map((p) => (p.id === pluginId ? { ...p, installed: newInstalled } : p));
    onSavePlugins(updated);

    // If plugin includes specific skills, toggle those skills too
    if (target.skillsIncluded && target.skillsIncluded.length > 0) {
      const updatedSkills = skills.map((s) => {
        if (target.skillsIncluded?.includes(s.id)) {
          return { ...s, enabled: newInstalled };
        }
        return s;
      });
      onSaveSkills(updatedSkills);
    }
  };

  // --- GitHub Skill Importer ---
  const handleFetchGithubSkill = async () => {
    if (!importUrl.trim()) return;
    setIsFetchingGithub(true);
    setImportError("");

    try {
      let rawUrl = importUrl.trim();
      // Transform standard GitHub file view URL to raw URL
      if (rawUrl.includes("github.com") && rawUrl.includes("/blob/")) {
        rawUrl = rawUrl.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
      }

      const res = await fetch(rawUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch (${res.status} ${res.statusText}). Ensure the repository file is public.`);
      }
      const text = await res.text();

      // Extract title from first markdown header or filename
      const firstH1 = text.match(/^#\s+(.+)$/m);
      const detectedName = firstH1 ? firstH1[1].trim() : "Imported Claude Skill";
      const detectedSlug = detectedName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

      setImportName(detectedName);
      setImportSlashCommand(`/${detectedSlug}`);
      setImportDesc(`Imported from ${importUrl.slice(0, 50)}...`);
      setImportPrompt(text);
    } catch (err: any) {
      setImportError(err.message || "Failed to fetch skill from URL. You can paste the markdown prompt manually below.");
    } finally {
      setIsFetchingGithub(false);
    }
  };

  const handleSaveImportedSkill = () => {
    if (!importName.trim() || !importPrompt.trim()) {
      setImportError("Please enter a name and skill instructions.");
      return;
    }

    const command = importSlashCommand.trim().startsWith("/")
      ? importSlashCommand.trim()
      : `/${importSlashCommand.trim() || importName.toLowerCase().replace(/\s+/g, "-")}`;

    const newSkill: Skill = {
      id: `skill_imported_${Date.now()}`,
      name: importName.trim(),
      slashCommand: command,
      description: importDesc.trim() || "Imported community skill from GitHub repository.",
      systemPrompt: importPrompt.trim(),
      author: "GitHub (claude-skills)",
      downloads: "1K+",
      category: "Community",
      sourceUrl: importUrl.trim() || "https://github.com/alirezarezvani/claude-skills",
      enabled: true,
      isCustom: true,
      tags: ["Imported", "Community", "GitHub"],
    };

    onSaveSkills([newSkill, ...skills]);
    setIsImportModalOpen(false);
    setImportUrl("");
    setImportName("");
    setImportSlashCommand("");
    setImportPrompt("");
    setImportDesc("");
    setImportError("");
  };

  // --- Filtering ---
  const filteredSkills = skills.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.slashCommand && s.slashCommand.toLowerCase().includes(searchQuery.toLowerCase())) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat =
      skillCategory === "All"
        ? true
        : skillCategory === "Anthropic"
        ? s.category === "Anthropic" || !s.category
        : s.category === "Community" || s.isCustom;
    return matchesSearch && matchesCat;
  });

  const filteredConnectors = connectors.filter((c) => {
    return (
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const filteredPlugins = plugins.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = pluginCategory === "Anthropic" ? p.author === "Anthropic" : p.author !== "Anthropic";
    return matchesSearch && matchesCat;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl h-[90vh] max-h-[850px] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-[var(--foreground)]">
        {/* Top Header matching Images 1, 2, 3 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)] flex-shrink-0">
          <h2 className="font-serif text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Directory
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Left Sidebar + Right Main Explorer */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Navigation Sidebar matching Images 1, 2, 3 */}
          <div className="w-48 sm:w-56 border-r border-[var(--card-border)] bg-[var(--sidebar-bg)]/50 p-3 space-y-1 flex-shrink-0">
            <button
              onClick={() => {
                setActiveTab("skills");
                setSearchQuery("");
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                activeTab === "skills"
                  ? "bg-[var(--sidebar-hover)] text-[var(--foreground)] font-semibold"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
              }`}
            >
              <ScrollText className="w-4 h-4" />
              <span>Skills</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("connectors");
                setSearchQuery("");
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                activeTab === "connectors"
                  ? "bg-[var(--sidebar-hover)] text-[var(--foreground)] font-semibold"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
              }`}
            >
              <Blocks className="w-4 h-4" />
              <span>Connectors</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("plugins");
                setSearchQuery("");
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                activeTab === "plugins"
                  ? "bg-[var(--sidebar-hover)] text-[var(--foreground)] font-semibold"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
              }`}
            >
              <Plug className="w-4 h-4" />
              <span>Plugins</span>
            </button>

            {/* Quick Helper Note */}
            <div className="pt-6 px-3 text-[11px] text-[var(--muted)] leading-relaxed hidden sm:block">
              <p className="font-semibold text-[var(--foreground)] mb-1">Ollama Integration</p>
              Enabled skills and plugins are injected directly into your local model&apos;s system prompt.
            </div>
          </div>

          {/* Right Main Content Explorer */}
          <div className="flex-1 flex flex-col min-w-0 bg-[var(--background)] overflow-y-auto p-4 sm:p-6 space-y-5">
            {/* Search Input matching Images */}
            <div className="relative flex items-center flex-shrink-0">
              <Search className="w-4 h-4 absolute left-3.5 text-[var(--muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeTab === "skills"
                    ? "Search skills..."
                    : activeTab === "connectors"
                    ? "Search connectors..."
                    : "Search plugins..."
                }
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] text-xs sm:text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted)] transition-all"
              />
            </div>

            {/* Sub-header Controls Bar (Tabs / Categories & Action Buttons) */}
            <div className="flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
              {/* Left: Category Pills */}
              <div className="flex items-center gap-1.5 text-xs">
                {activeTab === "plugins" ? (
                  <>
                    <button
                      onClick={() => setPluginCategory("Anthropic")}
                      className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
                        pluginCategory === "Anthropic"
                          ? "bg-[var(--card-bg)] text-[var(--foreground)] shadow-xs border border-[var(--card-border)]"
                          : "text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      Anthropic
                    </button>
                    <button
                      onClick={() => setPluginCategory("Partners")}
                      className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
                        pluginCategory === "Partners"
                          ? "bg-[var(--card-bg)] text-[var(--foreground)] shadow-xs border border-[var(--card-border)]"
                          : "text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      Partners
                    </button>
                  </>
                ) : activeTab === "skills" ? (
                  <>
                    {(["All", "Anthropic", "Community"] as const).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSkillCategory(cat)}
                        className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
                          skillCategory === cat
                            ? "bg-[var(--card-bg)] text-[var(--foreground)] shadow-xs border border-[var(--card-border)]"
                            : "text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </>
                ) : (
                  <span className="font-semibold text-xs text-[var(--foreground)]">
                    Anthropic & Partners
                  </span>
                )}
              </div>

              {/* Right: Actions (Filter, Sort, and Add / GitHub Import) */}
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
                >
                  <span>Filter by</span>
                  <span className="text-[10px] opacity-60">⌄</span>
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
                >
                  <span>Sort by</span>
                  <span className="text-[10px] opacity-60">⌄</span>
                </button>

                {activeTab === "skills" && (
                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all shadow-xs cursor-pointer"
                    title="Import Claude Skill from GitHub (e.g. alirezarezvani/claude-skills)"
                  >
                    <Github className="w-3.5 h-3.5" />
                    <span>Import from GitHub</span>
                  </button>
                )}
              </div>
            </div>

            {/* ========================================================================= */}
            {/* TAB 1: SKILLS (Matching Screenshot 3) */}
            {/* ========================================================================= */}
            {activeTab === "skills" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredSkills.map((s) => {
                  const isEnabled = s.enabled;
                  return (
                    <div
                      key={s.id}
                      className="p-4 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex flex-col justify-between hover:border-[var(--muted)]/40 transition-all shadow-xs group"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-mono text-sm font-bold text-[var(--foreground)] flex items-center gap-1.5">
                              <span>{s.slashCommand || `/${s.id}`}</span>
                              {s.category === "Community" && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-sans font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  Community
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[var(--muted)] pt-0.5">
                              {s.author || "Anthropic"} • {s.downloads || "100K"}
                            </div>
                          </div>

                          {/* Action Button: Gear icon when installed/active, or + to add */}
                          <button
                            onClick={() => handleToggleSkill(s.id)}
                            className={`p-2 rounded-xl transition-all cursor-pointer ${
                              isEnabled
                                ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30"
                                : "hover:bg-[var(--sidebar-hover)] text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--card-border)]"
                            }`}
                            title={isEnabled ? "Active (Click to disable)" : "Click to activate skill"}
                          >
                            {isEnabled ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </button>
                        </div>

                        <p className="text-xs text-[var(--muted)] line-clamp-3 leading-relaxed pt-1">
                          {s.description}
                        </p>
                      </div>

                      {s.tags && s.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-3">
                          {s.tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="px-2 py-0.5 rounded-lg text-[10px] bg-[var(--sidebar-bg)] text-[var(--muted)] border border-[var(--card-border)] font-mono"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: CONNECTORS (Matching Screenshot 2) */}
            {/* ========================================================================= */}
            {activeTab === "connectors" && (
              <div className="space-y-6">
                {/* POPULAR Section */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      POPULAR CONNECTORS
                    </div>
                    <div className="text-[11px] text-[var(--muted)]">
                      Click <Sliders className="w-3 h-3 inline mx-0.5 text-blue-400" /> to configure API tokens & webhooks
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredConnectors
                      .filter((c) => c.category === "popular")
                      .map((conn) => (
                        <div
                          key={conn.id}
                          className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-xs hover:border-[var(--muted)]/40 transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] flex items-center justify-center flex-shrink-0 text-blue-400">
                              {conn.id === "gmail" ? (
                                <Mail className="w-4 h-4 text-rose-400" />
                              ) : conn.id === "google-drive" ? (
                                <HardDrive className="w-4 h-4 text-amber-400" />
                              ) : conn.id === "github" ? (
                                <Github className="w-4 h-4 text-slate-200" />
                              ) : conn.id === "discord" ? (
                                <MessageCircle className="w-4 h-4 text-indigo-400" />
                              ) : conn.id === "blender-mcp" ? (
                                <Box className="w-4 h-4 text-orange-400" />
                              ) : (
                                <MessageSquare className="w-4 h-4 text-emerald-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-xs text-[var(--foreground)] truncate flex items-center gap-1.5">
                                <span>{conn.name}</span>
                                {conn.isLiveConnected && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" title="Live Connected" />
                                )}
                              </div>
                              <div className="text-[10px] text-[var(--muted)] truncate">
                                {conn.isLiveConnected ? "Live Connected" : conn.installed ? "Enabled" : "Available"}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenConfigure(conn)}
                              className="p-1.5 rounded-xl hover:bg-[var(--sidebar-hover)] text-[var(--muted)] hover:text-blue-400 border border-transparent hover:border-[var(--card-border)] transition-colors cursor-pointer"
                              title="Configure Connector & Test API"
                            >
                              <Sliders className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleConnector(conn.id)}
                              className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                                conn.installed
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                  : "hover:bg-[var(--sidebar-hover)] text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--card-border)]"
                              }`}
                              title={conn.installed ? "Connected (Click to disconnect)" : "Connect"}
                            >
                              {conn.installed ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Community Connectors Grid */}
                <div className="space-y-2.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    COMMUNITY MCP & INTEGRATIONS
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {filteredConnectors
                      .filter((c) => c.category === "community")
                      .map((conn) => (
                        <div
                          key={conn.id}
                          className="p-4 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex flex-col justify-between hover:border-[var(--muted)]/40 transition-all shadow-xs"
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] flex items-center justify-center flex-shrink-0 text-blue-400">
                                  {conn.id === "nocodb" ? (
                                    <Database className="w-4 h-4 text-emerald-400" />
                                  ) : conn.id === "blender-mcp" ? (
                                    <Box className="w-4 h-4 text-orange-400" />
                                  ) : (
                                    <Blocks className="w-4 h-4 text-indigo-400" />
                                  )}
                                </div>
                                <div>
                                  <div className="font-semibold text-sm text-[var(--foreground)] flex items-center gap-1.5">
                                    <span>{conn.name}</span>
                                    {conn.badge && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                        {conn.badge}
                                      </span>
                                    )}
                                    {conn.isLiveConnected && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                        Live
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenConfigure(conn)}
                                  className="p-1.5 rounded-xl hover:bg-[var(--sidebar-hover)] text-[var(--muted)] hover:text-blue-400 border border-transparent hover:border-[var(--card-border)] transition-colors cursor-pointer"
                                  title="Configure & Test API"
                                >
                                  <Sliders className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleConnector(conn.id)}
                                  className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                                    conn.installed
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                      : "hover:bg-[var(--sidebar-hover)] text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--card-border)]"
                                  }`}
                                  title={conn.installed ? "Installed" : "Install"}
                                >
                                  {conn.installed ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            <p className="text-xs text-[var(--muted)] line-clamp-2 leading-relaxed">
                              {conn.description}
                            </p>

                            {conn.statusMessage && (
                              <div className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1 truncate">
                                {conn.statusMessage}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: PLUGINS (Matching Screenshot 1) */}
            {/* ========================================================================= */}
            {activeTab === "plugins" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredPlugins.map((plugin) => (
                  <div
                    key={plugin.id}
                    className="p-4 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex flex-col justify-between hover:border-[var(--muted)]/40 transition-all shadow-xs"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-sm text-[var(--foreground)] flex items-center gap-1.5">
                            <span>{plugin.name}</span>
                          </div>
                          <div className="text-[11px] text-[var(--muted)] pt-0.5">
                            {plugin.author} • {plugin.downloads}
                          </div>
                        </div>

                        <button
                          onClick={() => handleTogglePlugin(plugin.id)}
                          className={`p-2 rounded-xl transition-all cursor-pointer ${
                            plugin.installed
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                              : "hover:bg-[var(--sidebar-hover)] text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--card-border)]"
                          }`}
                          title={plugin.installed ? "Active (Click to deactivate)" : "Install Plugin Suite"}
                        >
                          {plugin.installed ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        </button>
                      </div>

                      <p className="text-xs text-[var(--muted)] line-clamp-3 leading-relaxed pt-1">
                        {plugin.description}
                      </p>
                    </div>

                    {plugin.skillsIncluded && plugin.skillsIncluded.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-3">
                        {plugin.skillsIncluded.map((sk) => (
                          <span
                            key={sk}
                            className="px-2 py-0.5 rounded-lg text-[10px] bg-[var(--sidebar-bg)] text-blue-400 border border-[var(--card-border)] font-mono"
                          >
                            /{sk}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- GitHub Skill Import Modal --- */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="relative w-full max-w-xl bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-6 shadow-2xl space-y-4 text-[var(--foreground)]">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
              <div className="flex items-center gap-2">
                <Github className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold text-base">Import Skill from GitHub</h3>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-[var(--muted)] leading-relaxed">
                Enter any public GitHub skill URL (e.g. from{" "}
                <span className="text-blue-400 font-mono font-semibold">
                  alirezarezvani/claude-skills
                </span>
                ) or raw markdown to parse and register it into your local Ollama assistant.
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                  GitHub File URL / Raw Markdown Link
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://github.com/alirezarezvani/claude-skills/blob/main/..."
                    className="flex-1 px-3 py-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleFetchGithubSkill}
                    disabled={isFetchingGithub || !importUrl.trim()}
                    className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium cursor-pointer"
                  >
                    {isFetchingGithub ? "Fetching..." : "Fetch"}
                  </button>
                </div>
              </div>

              {importError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                  {importError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                    Skill Name
                  </label>
                  <input
                    type="text"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    placeholder="e.g. Security Log Auditor"
                    className="w-full px-3 py-1.5 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                    Slash Command
                  </label>
                  <input
                    type="text"
                    value={importSlashCommand}
                    onChange={(e) => setImportSlashCommand(e.target.value)}
                    placeholder="/security-audit"
                    className="w-full px-3 py-1.5 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] font-mono focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                  Short Description
                </label>
                <input
                  type="text"
                  value={importDesc}
                  onChange={(e) => setImportDesc(e.target.value)}
                  placeholder="What this skill does..."
                  className="w-full px-3 py-1.5 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                  System Prompt Instructions / Markdown
                </label>
                <textarea
                  value={importPrompt}
                  onChange={(e) => setImportPrompt(e.target.value)}
                  rows={6}
                  placeholder="You are an expert... Guidelines: 1. ... 2. ..."
                  className="w-full px-3 py-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] font-mono focus:outline-none resize-y"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--card-border)]">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveImportedSkill}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs cursor-pointer"
              >
                Register & Save Skill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Configure Connector Modal --- */}
      {configuringConnector && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="relative w-full max-w-lg bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-6 shadow-2xl space-y-4 text-[var(--foreground)]">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] flex items-center justify-center text-blue-400">
                  {configuringConnector.id === "github" ? (
                    <Github className="w-4 h-4 text-slate-200" />
                  ) : configuringConnector.id === "slack" ? (
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                  ) : configuringConnector.id === "discord" ? (
                    <MessageCircle className="w-4 h-4 text-indigo-400" />
                  ) : configuringConnector.id === "gmail" ? (
                    <Mail className="w-4 h-4 text-rose-400" />
                  ) : configuringConnector.id === "google-drive" ? (
                    <HardDrive className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Blocks className="w-4 h-4 text-indigo-400" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-base">{configuringConnector.name} Integration</h3>
                  <p className="text-[11px] text-[var(--muted)]">Configure authentication credentials & test live connection</p>
                </div>
              </div>
              <button
                onClick={() => setConfiguringConnector(null)}
                className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {configuringConnector.id === "github" && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                      GitHub Personal Access Token (PAT)
                    </label>
                    <input
                      type="password"
                      value={connApiKey}
                      onChange={(e) => setConnApiKey(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx (Optional for public repos)"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] font-mono focus:outline-none"
                    />
                    <p className="text-[10px] text-[var(--muted)] mt-1">
                      Enables private repo inspection, issue creation, and higher rate limits.
                    </p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                      Default Repository
                    </label>
                    <input
                      type="text"
                      value={connRepo}
                      onChange={(e) => setConnRepo(e.target.value)}
                      placeholder="owner/repo (e.g. facebook/react or vercel/next.js)"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] font-mono focus:outline-none"
                    />
                  </div>
                </>
              )}

              {(configuringConnector.id === "slack" || configuringConnector.id === "discord") && (
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                    Incoming Webhook URL
                  </label>
                  <input
                    type="text"
                    value={connWebhookUrl}
                    onChange={(e) => setConnWebhookUrl(e.target.value)}
                    placeholder={
                      configuringConnector.id === "slack"
                        ? "https://hooks.slack.com/services/T000/B000/XXXX"
                        : "https://discord.com/api/webhooks/000/XXXX"
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] font-mono focus:outline-none"
                  />
                  <p className="text-[10px] text-[var(--muted)] mt-1">
                    {configuringConnector.id === "slack"
                      ? "Create an Incoming Webhook in your Slack App settings to dispatch AI messages to a channel."
                      : "Go to Discord Channel Settings > Integrations > Webhooks > New Webhook and paste the URL here."}
                  </p>
                </div>
              )}

              {configuringConnector.id === "blender-mcp" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                      Blender MCP Bridge Endpoint
                    </label>
                    <input
                      type="text"
                      value={connEndpoint || "http://127.0.0.1:9876"}
                      onChange={(e) => setConnEndpoint(e.target.value)}
                      placeholder="http://127.0.0.1:9876"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] font-mono focus:outline-none"
                    />
                    <p className="text-[10px] text-[var(--muted)] mt-1">
                      Default local bridge port: <code>http://127.0.0.1:9876</code>
                    </p>
                  </div>

                  {/* 1-CLICK AUTO-START CARD */}
                  <div className="p-3.5 rounded-2xl bg-orange-500/10 border border-orange-500/25 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-orange-400" />
                        <span className="text-xs font-semibold text-[var(--foreground)]">
                          Auto-Start Otomatis Saat Blender Dibuka
                        </span>
                      </div>
                      {blenderStartupInstalled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <Check className="w-3 h-3" />
                          Aktif di Startup
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          Belum Terpasang
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                      {blenderStartupInstalled
                        ? `Bridge telah terpasang di startup folder Blender (${blenderStartupVersions.map((v) => v.version).join(", ") || "5.2"}). Setiap kali kamu membuka Blender, bridge port 9876 otomatis langsung aktif di background!`
                        : "Pasang bridge sekali klik ke folder startup Blender. Kamu tidak perlu lagi copy-paste atau klik Run Script manual setiap kali membuka Blender!"}
                    </p>

                    {startupNotice && (
                      <div className="text-[11px] p-2 rounded-lg bg-black/20 text-orange-300 border border-orange-500/20 font-medium">
                        {startupNotice}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      {blenderStartupInstalled ? (
                        <button
                          type="button"
                          onClick={handleUninstallStartup}
                          disabled={isManagingStartup}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isManagingStartup ? "Memproses..." : "Copot dari Startup"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleInstallStartup}
                          disabled={isManagingStartup}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                        >
                          <Zap className="w-3.5 h-3.5 fill-current" />
                          <span>{isManagingStartup ? "Memasang..." : "⚡ Pasang Auto-Start (1-Klik)"}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* MANUAL SCRIPT CARD (FALLBACK) */}
                  <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                        <Box className="w-3.5 h-3.5 text-orange-400" />
                        Script Python Manual (Cadangan)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const script = `import bpy, threading, json\nfrom http.server import HTTPServer, BaseHTTPRequestHandler\n\n# Stop previous server if active to prevent address collision\nif 'mcp_server' in bpy.app.driver_namespace:\n    try:\n        bpy.app.driver_namespace['mcp_server'].shutdown()\n        bpy.app.driver_namespace['mcp_server'].server_close()\n        print('Previous Blender MCP Bridge stopped.')\n    except Exception:\n        pass\n\nclass MCPHandler(BaseHTTPRequestHandler):\n    def address_string(self):\n        return str(self.client_address[0])\n\n    def log_message(self, format, *args):\n        pass\n\n    def _cors(self):\n        self.send_header('Access-Control-Allow-Origin', '*')\n        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')\n        self.send_header('Access-Control-Allow-Headers', 'Content-Type')\n\n    def do_OPTIONS(self):\n        self.send_response(200)\n        self._cors()\n        self.end_headers()\n\n    def do_GET(self):\n        self.send_response(200)\n        self.send_header('Content-Type', 'application/json')\n        self._cors()\n        self.end_headers()\n        ver = bpy.app.version_string\n        self.wfile.write(json.dumps({'status': 'ready', 'blender': True, 'version': ver}).encode('utf-8'))\n\n    def do_POST(self):\n        try:\n            length = int(self.headers.get('Content-Length', 0))\n            body = self.rfile.read(length).decode('utf-8')\n            data = json.loads(body) if body else {}\n            code = data.get('code', '')\n            def run_bpy():\n                try:\n                    exec(code, {'bpy': bpy})\n                except Exception as ex:\n                    print('Blender execution error:', ex)\n            if code:\n                bpy.app.timers.register(run_bpy)\n            self.send_response(200)\n            self.send_header('Content-Type', 'application/json')\n            self._cors()\n            self.end_headers()\n            self.wfile.write(b'{\"success\": true}')\n        except Exception as e:\n            self.send_response(500)\n            self.send_header('Content-Type', 'application/json')\n            self._cors()\n            self.end_headers()\n            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))\n\nclass ReusableServer(HTTPServer):\n    allow_reuse_address = True\n\nserver = ReusableServer(('127.0.0.1', 9876), MCPHandler)\nbpy.app.driver_namespace['mcp_server'] = server\nthreading.Thread(target=server.serve_forever, daemon=True).start()\nprint('>>> Blender MCP Bridge LIVE on port 9876 (Blender ' + bpy.app.version_string + ') <<<')`;
                          navigator.clipboard.writeText(script);
                          setCopySuccess(true);
                          setTimeout(() => setCopySuccess(false), 2000);
                        }}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-all flex items-center gap-1 cursor-pointer"
                      >
                        {copySuccess ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copySuccess ? "Copied Script!" : "Copy Python Bridge"}</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                      Jika tidak memakai auto-start, kamu bisa copy script ini dan jalankan di tab <strong>Scripting</strong> Blender.
                    </p>
                  </div>
                </div>
              )}

              {configuringConnector.id !== "github" &&
                configuringConnector.id !== "slack" &&
                configuringConnector.id !== "discord" &&
                configuringConnector.id !== "blender-mcp" && (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                        Endpoint URL / API Base URL
                      </label>
                      <input
                        type="text"
                        value={connEndpoint}
                        onChange={(e) => setConnEndpoint(e.target.value)}
                        placeholder="https://your-service.com/api/v1"
                        className="w-full px-3 py-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] font-mono focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                        API Key / Access Token
                      </label>
                      <input
                        type="password"
                        value={connApiKey}
                        onChange={(e) => setConnApiKey(e.target.value)}
                        placeholder="API Key or Bearer Token..."
                        className="w-full px-3 py-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] font-mono focus:outline-none"
                      />
                    </div>
                  </>
                )}

              {/* Live Test Feedback Banner */}
              {testResult && (
                <div
                  className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                    testResult.success
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                  )}
                  <span className="leading-relaxed">{testResult.message}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[var(--card-border)]">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingConn}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isTestingConn ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Testing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Test Connection</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfiguringConnector(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveConnectorConfig}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs cursor-pointer"
                >
                  Save & Enable
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
