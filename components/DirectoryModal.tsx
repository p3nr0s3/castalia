"use client";

import React, { useState } from "react";
import { apiFetch } from "../lib/apiClient";
import { X, Scroll as ScrollText, Stack as Blocks, Plug, MagnifyingGlass as Search, Plus, Check, Download, Gear as Settings, Globe, CodeSimple as Code2, FileText, Palette, Stack as Layers, MagicWand as Wand2, Sparkle as Sparkles, Sun, ArrowCounterClockwise as RotateCcw, GraduationCap, Megaphone, Binary, ShieldWarning as ShieldAlert, Terminal, CheckSquare, ChatText as MessageSquare, ArrowSquareOut as ExternalLink, GithubLogo as Github, Funnel as Filter, ArrowsDownUp as ArrowUpDown, Faders as Sliders, SpinnerGap as Loader2, CheckCircle as CheckCircle2, WarningCircle as AlertCircle } from "@phosphor-icons/react";
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

  // Connector Configuration Modal — now purely user-defined custom bridges
  // (webhook or local-http). See ConnectorItem.customBridgeType in
  // lib/types.ts and app/api/connectors/route.ts's generic actions.
  const [configuringConnector, setConfiguringConnector] = useState<ConnectorItem | null>(null);
  const [connName, setConnName] = useState("");
  const [connDescription, setConnDescription] = useState("");
  const [connBridgeType, setConnBridgeType] = useState<"webhook" | "local-http">("webhook");
  const [connApiKey, setConnApiKey] = useState("");
  const [connWebhookUrl, setConnWebhookUrl] = useState("");
  const [connEndpoint, setConnEndpoint] = useState("");
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

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

  const handleSaveConnectorConfig = () => {
    if (!onSaveConnectors) return;
    const isLive = testResult ? testResult.success : !!(connApiKey || connWebhookUrl || connEndpoint);
    const isNew = !configuringConnector?.id || !connectors.some((c) => c.id === configuringConnector.id);

    const savedConnector: ConnectorItem = {
      id: isNew ? `bridge_${Date.now()}` : configuringConnector!.id,
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
      ? [...connectors, savedConnector]
      : connectors.map((c) => (c.id === savedConnector.id ? savedConnector : c));

    onSaveConnectors(updated);
    setConfiguringConnector(null);
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

  const handleDeleteConnector = (id: string) => {
    if (!onSaveConnectors) return;
    onSaveConnectors(connectors.filter((c) => c.id !== id));
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
                              {s.author || "Community"}
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
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    YOUR CUSTOM BRIDGES
                  </div>
                  <button
                    type="button"
                    onClick={openAddBridgeModal}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Custom Bridge</span>
                  </button>
                </div>

                {filteredConnectors.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 px-6 text-center rounded-2xl border border-dashed border-[var(--card-border)] bg-[var(--card-bg)]/50">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] flex items-center justify-center mb-3">
                      <Blocks className="w-6 h-6 text-[var(--muted)]" />
                    </div>
                    <p className="text-sm font-semibold text-[var(--foreground)] mb-1">No bridges yet</p>
                    <p className="text-xs text-[var(--muted)] max-w-sm leading-relaxed mb-4">
                      Connect this app to anything — a webhook (Slack, Discord, a custom endpoint) or a local app running on this machine (like Blender or OBS Studio) — by adding your own bridge.
                    </p>
                    <button
                      type="button"
                      onClick={openAddBridgeModal}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Your First Bridge</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {filteredConnectors.map((conn) => (
                      <div
                        key={conn.id}
                        className="p-4 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex flex-col justify-between hover:border-[var(--muted)]/40 transition-all shadow-xs"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] flex items-center justify-center flex-shrink-0 text-blue-400">
                                {conn.customBridgeType === "local-http" ? (
                                  <Terminal className="w-4 h-4 text-purple-400" />
                                ) : (
                                  <Globe className="w-4 h-4 text-blue-400" />
                                )}
                              </div>
                              <div>
                                <div className="font-semibold text-sm text-[var(--foreground)] flex items-center gap-1.5">
                                  <span>{conn.name}</span>
                                  {conn.isLiveConnected && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                      Live
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">
                                  {conn.customBridgeType === "local-http" ? "Local App Bridge" : "Webhook Bridge"}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditBridgeModal(conn)}
                                className="p-1.5 rounded-xl hover:bg-[var(--sidebar-hover)] text-[var(--muted)] hover:text-blue-400 border border-transparent hover:border-[var(--card-border)] transition-colors cursor-pointer"
                                title="Configure & Test"
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
                                title={conn.installed ? "Enabled" : "Disabled"}
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

                          <p className="text-[10px] text-[var(--muted)] font-mono truncate">
                            {conn.customBridgeType === "local-http" ? conn.endpoint : conn.webhookUrl}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15 text-[11px] text-[var(--muted)] leading-relaxed">
                  Trigger a bridge from chat with <code className="px-1 py-0.5 rounded bg-black/20 text-blue-300">/bridge &lt;bridge-id&gt; &lt;message&gt;</code>. Find the bridge id by opening its settings.
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
                            {plugin.author}
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
                  <Blocks className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">
                    {connectors.some((c) => c.id === configuringConnector.id) ? "Edit" : "Add"} Custom Bridge
                  </h3>
                  <p className="text-[11px] text-[var(--muted)]">Connect to any webhook or local app via HTTP</p>
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
              <div>
                <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">Name</label>
                <input
                  type="text"
                  value={connName}
                  onChange={(e) => setConnName(e.target.value)}
                  placeholder="e.g. My Home Server, Team Alerts"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={connDescription}
                  onChange={(e) => setConnDescription(e.target.value)}
                  placeholder="What does this bridge do?"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--muted)] mb-2">Bridge Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConnBridgeType("webhook")}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all text-left ${
                      connBridgeType === "webhook"
                        ? "bg-blue-500/15 border-blue-500/40 text-blue-300"
                        : "bg-[var(--sidebar-bg)] border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Globe className="w-3.5 h-3.5" />
                      <span>Webhook</span>
                    </div>
                    <span className="block text-[10px] font-normal opacity-80">Any public URL (Slack, Discord, custom API)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConnBridgeType("local-http")}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all text-left ${
                      connBridgeType === "local-http"
                        ? "bg-purple-500/15 border-purple-500/40 text-purple-300"
                        : "bg-[var(--sidebar-bg)] border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Local App</span>
                    </div>
                    <span className="block text-[10px] font-normal opacity-80">Loopback-only bridge (e.g. Blender, OBS)</span>
                  </button>
                </div>
              </div>

              {connBridgeType === "webhook" && (
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">Webhook URL</label>
                  <input
                    type="text"
                    value={connWebhookUrl}
                    onChange={(e) => setConnWebhookUrl(e.target.value)}
                    placeholder="https://hooks.slack.com/services/... or any public POST endpoint"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] font-mono focus:outline-none"
                  />
                  <p className="text-[10px] text-[var(--muted)] mt-1">
                    Must be a public URL (not localhost/LAN) — used for the built-in Slack/Discord webhook style, or any other service that accepts a POST with a JSON body.
                  </p>
                </div>
              )}

              {connBridgeType === "local-http" && (
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">Bridge Endpoint</label>
                  <input
                    type="text"
                    value={connEndpoint}
                    onChange={(e) => setConnEndpoint(e.target.value)}
                    placeholder="http://127.0.0.1:PORT"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] font-mono focus:outline-none"
                  />
                  <p className="text-[10px] text-[var(--muted)] mt-1">
                    Must resolve to 127.0.0.1/::1 — a loopback HTTP bridge to an app running on this machine (e.g. a local script listening on a port).
                  </p>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">API Key / Bearer Token (optional)</label>
                <input
                  type="password"
                  value={connApiKey}
                  onChange={(e) => setConnApiKey(e.target.value)}
                  placeholder="Sent as Authorization: Bearer ... if provided"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] font-mono focus:outline-none"
                />
              </div>

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
                {connectors.some((c) => c.id === configuringConnector.id) && (
                  <button
                    type="button"
                    onClick={() => {
                      handleDeleteConnector(configuringConnector.id);
                      setConfiguringConnector(null);
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    Delete
                  </button>
                )}
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
