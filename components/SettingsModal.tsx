"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Palette,
  Cloud,
  HardDrives as Server,
  Faders as Sliders,
  Database,
  Info,
  CaretRight as ChevronRight,
  CaretLeft as ChevronLeft,
  Headphones,
  Stack as Blocks,
  Plug,
  ArrowCounterClockwise as RotateCcw,
  BookmarkSimple as BookMarked,
  Lightning as Zap,
  Check,
} from "@phosphor-icons/react";
import { AppSettings, OllamaModel } from "@/lib/types";
import { DEFAULT_SKILLS } from "@/lib/skills";
import { DEFAULT_CONNECTORS, DEFAULT_PLUGINS, DEFAULT_MEMORY_CONFIG } from "@/lib/directoryData";

import {
  PersonalizationTab,
  THEME_OPTIONS,
  FONT_OPTIONS,
} from "./settings/PersonalizationTab";
import { ChatTab } from "./settings/ChatTab";
import { VoiceTab } from "./settings/VoiceTab";
import { SkillsTab } from "./settings/SkillsTab";
import { ConnectorsTab } from "./settings/ConnectorsTab";
import { PluginsTab } from "./settings/PluginsTab";
import { MemoryTab } from "./settings/MemoryTab";
import { RetrievalTab } from "./settings/RetrievalTab";
import { CloudTab } from "./settings/CloudTab";
import { ServerTab } from "./settings/ServerTab";
import { DataTab } from "./settings/DataTab";
import { AboutTab } from "./settings/AboutTab";

export { THEME_OPTIONS, FONT_OPTIONS };

export interface SettingsModalProps {
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
  | "data"
  | "about";

interface NavItemDef {
  id: SettingsSection;
  label: string;
  sublabel: string;
  icon: any;
  color: string;
  badgeBg: string;
  group: "preferences" | "customize" | "system";
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  models,
  onDataImported,
  onClearAllChats,
  initialSection = "personalization",
  onOpenDiskExplorer,
}) => {
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [applyFeedback, setApplyFeedback] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData(settings);
    }
  }, [isOpen, settings]);

  useEffect(() => {
    if (isOpen && initialSection) {
      setActiveSection(initialSection);
    }
  }, [isOpen, initialSection]);

  if (!isOpen) return null;

  const handleApply = () => {
    onSaveSettings(formData);
    setApplyFeedback(true);
    setTimeout(() => setApplyFeedback(false), 2500);
  };

  const handleApplyAndExit = () => {
    onSaveSettings(formData);
    onClose();
  };

  const handleExit = () => {
    onSaveSettings(formData);
    onClose();
  };

  const currentSkills = formData.skills || DEFAULT_SKILLS;
  const currentConnectors = formData.connectors || DEFAULT_CONNECTORS;
  const currentPlugins = formData.plugins || DEFAULT_PLUGINS;
  const currentMemory = formData.memory || DEFAULT_MEMORY_CONFIG;
  const memoryItems = currentMemory.items || [];

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

  return (
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

            {/* Customize Group */}
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
            {activeSection === "personalization" && (
              <PersonalizationTab
                formData={formData}
                setFormData={setFormData}
                onSaveSettings={onSaveSettings}
              />
            )}

            {activeSection === "chat" && (
              <ChatTab
                formData={formData}
                setFormData={setFormData}
                models={models}
              />
            )}

            {activeSection === "voice" && (
              <VoiceTab
                formData={formData}
                setFormData={setFormData}
              />
            )}

            {activeSection === "skills" && (
              <SkillsTab
                formData={formData}
                setFormData={setFormData}
              />
            )}

            {activeSection === "connectors" && (
              <ConnectorsTab
                formData={formData}
                setFormData={setFormData}
                onSaveSettings={onSaveSettings}
              />
            )}

            {activeSection === "plugins" && (
              <PluginsTab
                formData={formData}
                setFormData={setFormData}
                onSaveSettings={onSaveSettings}
              />
            )}

            {activeSection === "memory" && (
              <MemoryTab
                formData={formData}
                setFormData={setFormData}
                onSaveSettings={onSaveSettings}
              />
            )}

            {activeSection === "retrieval" && (
              <RetrievalTab
                formData={formData}
                setFormData={setFormData}
                onSaveSettings={onSaveSettings}
              />
            )}

            {activeSection === "cloud" && (
              <CloudTab
                formData={formData}
                setFormData={setFormData}
              />
            )}

            {activeSection === "server" && (
              <ServerTab
                formData={formData}
                setFormData={setFormData}
                models={models}
                onOpenDiskExplorer={onOpenDiskExplorer}
                onClose={onClose}
              />
            )}

            {activeSection === "data" && (
              <DataTab
                onDataImported={onDataImported}
                onClearAllChats={onClearAllChats}
                onClose={onClose}
              />
            )}

            {activeSection === "about" && (
              <AboutTab formData={formData} />
            )}
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
            <button
              type="button"
              onClick={handleExit}
              className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-[var(--foreground)] transition-colors cursor-pointer"
            >
              Exit
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 transition-all active:scale-95 cursor-pointer shadow-2xs"
            >
              Apply
            </button>
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
  );
};
