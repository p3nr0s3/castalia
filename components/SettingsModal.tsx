"use client";

import React, { useState } from "react";
import { apiFetch } from "../lib/apiClient";
import {
  X,
  Palette,
  Cloud,
  Server,
  Sliders,
  Database,
  Info,
  ChevronRight,
  ChevronLeft,
  Sun,
  Moon,
  Sparkles,
  Laptop,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Download,
  Upload,
  Trash2,
  Key,
  Globe,
  Zap,
  Check,
  Brain,
  Wand2,
  Plus,
  Search,
  Folder,
  HardDrive,
  Headphones,
  Volume2,
  Mic,
  Play,
  Square,
} from "lucide-react";
import {
  AppSettings,
  OllamaModel,
  ThemeType,
  FontFamilyType,
  ThinkingMode,
  Skill,
  VoiceSettingsConfig,
} from "@/lib/types";
import { checkOllamaHealth } from "@/lib/ollama";
import { storage } from "@/lib/storage";
import { DEFAULT_SKILLS } from "@/lib/skills";
import { CONTEXT_SIZE_PRESETS, KEEP_ALIVE_PRESETS, DEFAULT_CUSTOM_THEME } from "@/lib/constants";
import {
  VOICE_PRESETS,
  TONE_OPTIONS,
  getAllSystemVoices,
  getIndonesianVoices,
  resolveVoiceForConfig,
  speakUniversal,
  stopSpeaking,
  speakOpenAiTts,
} from "@/lib/voiceEngine";

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
  | "cloud"
  | "server"
  | "data"
  | "about";

const THEME_OPTIONS: { id: ThemeType; name: string; icon: any; previewBg: string; previewAccent: string; desc: string }[] = [
  {
    id: "dark",
    name: "Midnight Dark",
    icon: Moon,
    previewBg: "bg-[#0f172a]",
    previewAccent: "bg-blue-500",
    desc: "Default sleek deep slate",
  },
  {
    id: "claude",
    name: "Claude Warm Amber",
    icon: Sparkles,
    previewBg: "bg-[#1f1e1d]",
    previewAccent: "bg-[#d97706]",
    desc: "Warm dark charcoal with luminous amber",
  },
  {
    id: "oled",
    name: "OLED Black",
    icon: Moon,
    previewBg: "bg-[#000000]",
    previewAccent: "bg-emerald-500",
    desc: "True pitch black for AMOLED displays",
  },
  {
    id: "dracula",
    name: "Dracula Gothic",
    icon: Sparkles,
    previewBg: "bg-[#282a36]",
    previewAccent: "bg-[#bd93f9]",
    desc: "Iconic dark theme with purple & pink accents",
  },
  {
    id: "catppuccin",
    name: "Catppuccin Mocha",
    icon: Sparkles,
    previewBg: "bg-[#1e1e2e]",
    previewAccent: "bg-[#cba6f7]",
    desc: "Soothing pastel palette with mauve & lavender",
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    icon: Sparkles,
    previewBg: "bg-[#1a1b26]",
    previewAccent: "bg-[#7aa2f7]",
    desc: "Clean neon vibes of downtown Tokyo",
  },
  {
    id: "rose-pine",
    name: "Rosé Pine",
    icon: Sparkles,
    previewBg: "bg-[#191724]",
    previewAccent: "bg-[#eb6f92]",
    desc: "Natural pine, warm gold and dusty rose",
  },
  {
    id: "light",
    name: "Clean Light",
    icon: Sun,
    previewBg: "bg-[#ffffff]",
    previewAccent: "bg-blue-600",
    desc: "Crisp modern light mode",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk Neon",
    icon: Sparkles,
    previewBg: "bg-[#0b071e]",
    previewAccent: "bg-pink-500",
    desc: "Neon violet & vibrant magenta",
  },
  {
    id: "forest",
    name: "Forest Emerald",
    icon: Sparkles,
    previewBg: "bg-[#061712]",
    previewAccent: "bg-emerald-400",
    desc: "Deep earthy dark green and mint",
  },
  {
    id: "sunset",
    name: "Sunset Amber",
    icon: Sparkles,
    previewBg: "bg-[#181211]",
    previewAccent: "bg-amber-500",
    desc: "Warm dark charcoal and amber glow",
  },
  {
    id: "nord",
    name: "Nord Arctic",
    icon: Sparkles,
    previewBg: "bg-[#1e222a]",
    previewAccent: "bg-cyan-400",
    desc: "Cool arctic slate & ice cyan",
  },
  {
    id: "system",
    name: "System Auto",
    icon: Laptop,
    previewBg: "bg-gradient-to-r from-slate-200 to-slate-800",
    previewAccent: "bg-blue-500",
    desc: "Matches OS light/dark appearance",
  },
  {
    id: "custom",
    name: "Custom Palette",
    icon: Palette,
    previewBg: "bg-gradient-to-r from-purple-900 to-indigo-900",
    previewAccent: "bg-sky-400",
    desc: "Racik kombinasi warna tema Anda sendiri",
  },
];

const FONT_OPTIONS: { id: FontFamilyType; name: string; desc: string; sample: string }[] = [
  { id: "inter", name: "Inter", desc: "Clean UI Sans-Serif", sample: "The quick brown fox jumps" },
  { id: "jakarta", name: "Plus Jakarta Sans", desc: "Geometric Typography", sample: "The quick brown fox jumps" },
  { id: "geist", name: "Geist Sans", desc: "Vercel / Tech Clean", sample: "The quick brown fox jumps" },
  { id: "outfit", name: "Outfit", desc: "Modern Display Geometric", sample: "The quick brown fox jumps" },
  { id: "poppins", name: "Poppins", desc: "Friendly Geometric Sans", sample: "The quick brown fox jumps" },
  { id: "roboto", name: "Roboto", desc: "Classic Neo-Grotesque", sample: "The quick brown fox jumps" },
  { id: "jetbrains", name: "JetBrains Mono", desc: "Developer Monospace", sample: "const answer = 42;" },
  { id: "fira-code", name: "Fira Code", desc: "Programmer Ligatures", sample: "const [x, y] = fn();" },
  { id: "merriweather", name: "Merriweather", desc: "Editorial Serif", sample: "The quick brown fox jumps" },
  { id: "lora", name: "Lora", desc: "Contemporary Book Serif", sample: "The quick brown fox jumps" },
  { id: "space", name: "Space Grotesk", desc: "Futuristic Grotesque", sample: "The quick brown fox jumps" },
];

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

  // Skills state in settings
  const [skillSearch, setSkillSearch] = useState("");
  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");
  const [newSkillPrompt, setNewSkillPrompt] = useState("");

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
      openaiVoice: "nova",
    };

    const sample =
      voiceCfg.tone === "casual"
        ? "Halo! Aku asisten AI kamu. Suaraku sekarang jauh lebih natural, komunikatif, dan fasih kan?"
        : voiceCfg.tone === "concise"
        ? "Siap. Menjawab langsung dengan cepat, ringkas, dan akurat."
        : "Halo! Senang bisa membantu Anda hari ini. Ada hal yang ingin Anda tanyakan?";

    if (voiceCfg.engine === "openai" && formData.apiKeys?.openaiApiKey) {
      await speakOpenAiTts({
        text: sample,
        apiKey: formData.apiKeys.openaiApiKey,
        voice: voiceCfg.openaiVoice || "nova",
        speed: voiceCfg.rate,
        onEnd: () => setPreviewVoicePlaying(false),
        onError: () => setPreviewVoicePlaying(false),
      });
    } else {
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
    }
  };

  const updateVoice = (updates: Partial<VoiceSettingsConfig>) => {
    const current: VoiceSettingsConfig = formData.voice || {
      presetId: "female_gadis",
      pitch: 1.05,
      rate: 1.05,
      tone: "casual",
      engine: "natural",
      autoSilenceMs: 1400,
      openaiVoice: "nova",
    };
    setFormData({
      ...formData,
      voice: { ...current, ...updates },
    });
  };

  if (!isOpen) return null;

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

  const handleExport = () => {
    const dataStr = storage.exportData();
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

  const NAV_ITEMS: {
    id: SettingsSection;
    label: string;
    sublabel: string;
    icon: any;
    color: string;
    badgeBg: string;
  }[] = [
    {
      id: "personalization",
      label: "Personalization",
      sublabel: `${THEME_OPTIONS.find((t) => t.id === formData.theme)?.name || "Dark"} • ${
        FONT_OPTIONS.find((f) => f.id === formData.fontFamily)?.name || "Inter"
      }`,
      icon: Palette,
      color: "text-purple-400",
      badgeBg: "bg-purple-500/15 text-purple-400",
    },
    {
      id: "chat",
      label: "Chat & Generation",
      sublabel: `T: ${formData.temperature} • TopP: ${formData.topP} • ${formData.thinkingMode || "default"}`,
      icon: Sliders,
      color: "text-amber-400",
      badgeBg: "bg-amber-500/15 text-amber-400",
    },
    {
      id: "voice",
      label: "Voice & Speech Engine",
      sublabel: `${(formData.voice?.presetId || "female_gadis").replace("female_", "").replace("male_", "")} • ${formData.voice?.engine === "openai" ? "OpenAI TTS" : "Natural Voice"}`,
      icon: Headphones,
      color: "text-purple-400",
      badgeBg: "bg-purple-500/15 text-purple-400",
    },
    {
      id: "skills",
      label: "Agentic Skills Hub",
      sublabel: `${currentSkills.filter((s) => s.enabled).length} of ${currentSkills.length} active`,
      icon: Zap,
      color: "text-amber-400",
      badgeBg: "bg-amber-500/15 text-amber-400",
    },
    {
      id: "cloud",
      label: "Cloud AI Models",
      sublabel: "Gemini, Claude, GPT, DeepSeek, Groq",
      icon: Cloud,
      color: "text-sky-400",
      badgeBg: "bg-sky-500/15 text-sky-400",
    },
    {
      id: "server",
      label: "Local Ollama & Search",
      sublabel: formData.ollamaUrl.replace(/^https?:\/\//, ""),
      icon: Server,
      color: "text-emerald-400",
      badgeBg: "bg-emerald-500/15 text-emerald-400",
    },
    {
      id: "data",
      label: "Data, Backup & Export",
      sublabel: "Sync, Backup, Reset",
      icon: Database,
      color: "text-rose-400",
      badgeBg: "bg-rose-500/15 text-rose-400",
    },
    {
      id: "about",
      label: "About & Diagnostics",
      sublabel: "v2.5 Local AI Workspace",
      icon: Info,
      color: "text-slate-400",
      badgeBg: "bg-slate-500/15 text-slate-400",
    },
  ];

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

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-0 sm:p-2 md:p-3">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={handleExit}
      />

      {/* Full-Fit Desktop Window Container */}
      <div className="relative w-full sm:w-[98vw] md:w-[97vw] max-w-[1720px] bg-[var(--card-bg)] text-[var(--foreground)] rounded-none sm:rounded-3xl border-0 sm:border border-[var(--card-border)] shadow-2xl overflow-hidden flex flex-col z-10 h-[100dvh] sm:h-[96vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
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
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] px-3 py-1.5">
              Preferences
            </div>

            <div className="space-y-0.5">
              {NAV_ITEMS.map((item) => {
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
            {activeSection === "personalization" && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">Theme & Color Palette</h3>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    Select your preferred interface aesthetic and canvas styling.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {THEME_OPTIONS.map((th) => {
                    const isSelected = formData.theme === th.id;
                    const IconComp = th.icon;
                    return (
                      <button
                        key={th.id}
                        type="button"
                        onClick={() => {
                          const updated = { ...formData, theme: th.id };
                          setFormData(updated);
                          onSaveSettings(updated);
                        }}
                        className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                          isSelected
                            ? "border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/20"
                            : "border-[var(--card-border)] bg-[var(--sidebar-bg)] hover:border-[var(--muted)]"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded-full ${th.previewAccent} shadow-xs`} />
                            <span className="text-xs font-bold text-[var(--foreground)]">{th.name}</span>
                          </div>
                          {isSelected ? (
                            <Check className="w-4 h-4 text-purple-400" />
                          ) : (
                            <IconComp className="w-3.5 h-3.5 text-[var(--muted)]" />
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--muted)] leading-snug">{th.desc}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Palette Editor (When theme is custom) */}
                {formData.theme === "custom" && (
                  <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-purple-500/30 space-y-4 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Palette className="w-4 h-4 text-purple-400" />
                        <h4 className="text-xs font-bold text-[var(--foreground)]">Custom Color Palette Editor</h4>
                      </div>
                      <span className="text-[10px] text-purple-400 font-medium bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                        Live Preview
                      </span>
                    </div>

                    {/* Quick presets */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">
                        Quick Preset Inspirations
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { name: "Cyberpunk Pink", bg: "#0d0221", fg: "#f3f4f6", sb: "#05010e", card: "#19053b", acc: "#ff007f" },
                          { name: "Matcha Minimal", bg: "#0f1711", fg: "#e2e8f0", sb: "#080e0a", card: "#18261c", acc: "#10b981" },
                          { name: "Solarized Ember", bg: "#1a1614", fg: "#fef3c7", sb: "#110e0c", card: "#29221d", acc: "#f59e0b" },
                          { name: "Royal Purple", bg: "#0f0c20", fg: "#ede9fe", sb: "#080614", card: "#1c173b", acc: "#a855f7" },
                          { name: "Deep Ocean", bg: "#0a192f", fg: "#e6f1ff", sb: "#020c1b", card: "#112240", acc: "#64ffda" },
                        ].map((preset) => (
                          <button
                            key={preset.name}
                            type="button"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                customTheme: {
                                  name: preset.name,
                                  background: preset.bg,
                                  foreground: preset.fg,
                                  sidebarBg: preset.sb,
                                  cardBg: preset.card,
                                  accent: preset.acc,
                                  muted: "#94a3b8",
                                },
                              });
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-medium border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-purple-400 text-[var(--foreground)] transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: preset.acc }} />
                            <span>{preset.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Color inputs grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div>
                        <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                          Canvas Background
                        </label>
                        <div className="flex items-center gap-2 p-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                          <input
                            type="color"
                            value={formData.customTheme?.background || "#12141a"}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                customTheme: {
                                  ...(formData.customTheme || DEFAULT_CUSTOM_THEME),
                                  background: e.target.value,
                                },
                              })
                            }
                            className="w-7 h-7 rounded-lg border-0 cursor-pointer bg-transparent"
                          />
                          <input
                            type="text"
                            value={formData.customTheme?.background || "#12141a"}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                customTheme: {
                                  ...(formData.customTheme || DEFAULT_CUSTOM_THEME),
                                  background: e.target.value,
                                },
                              })
                            }
                            className="text-xs font-mono bg-transparent text-[var(--foreground)] focus:outline-none flex-1"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                          Accent / Highlight
                        </label>
                        <div className="flex items-center gap-2 p-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                          <input
                            type="color"
                            value={formData.customTheme?.accent || "#38bdf8"}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                customTheme: {
                                  ...(formData.customTheme || DEFAULT_CUSTOM_THEME),
                                  accent: e.target.value,
                                },
                              })
                            }
                            className="w-7 h-7 rounded-lg border-0 cursor-pointer bg-transparent"
                          />
                          <input
                            type="text"
                            value={formData.customTheme?.accent || "#38bdf8"}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                customTheme: {
                                  ...(formData.customTheme || DEFAULT_CUSTOM_THEME),
                                  accent: e.target.value,
                                },
                              })
                            }
                            className="text-xs font-mono bg-transparent text-[var(--foreground)] focus:outline-none flex-1"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                          Sidebar Background
                        </label>
                        <div className="flex items-center gap-2 p-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                          <input
                            type="color"
                            value={formData.customTheme?.sidebarBg || "#0c0e12"}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                customTheme: {
                                  ...(formData.customTheme || DEFAULT_CUSTOM_THEME),
                                  sidebarBg: e.target.value,
                                },
                              })
                            }
                            className="w-7 h-7 rounded-lg border-0 cursor-pointer bg-transparent"
                          />
                          <input
                            type="text"
                            value={formData.customTheme?.sidebarBg || "#0c0e12"}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                customTheme: {
                                  ...(formData.customTheme || DEFAULT_CUSTOM_THEME),
                                  sidebarBg: e.target.value,
                                },
                              })
                            }
                            className="text-xs font-mono bg-transparent text-[var(--foreground)] focus:outline-none flex-1"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                          Card & Bubble Background
                        </label>
                        <div className="flex items-center gap-2 p-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                          <input
                            type="color"
                            value={formData.customTheme?.cardBg || "#1a1d24"}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                customTheme: {
                                  ...(formData.customTheme || DEFAULT_CUSTOM_THEME),
                                  cardBg: e.target.value,
                                },
                              })
                            }
                            className="w-7 h-7 rounded-lg border-0 cursor-pointer bg-transparent"
                          />
                          <input
                            type="text"
                            value={formData.customTheme?.cardBg || "#1a1d24"}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                customTheme: {
                                  ...(formData.customTheme || DEFAULT_CUSTOM_THEME),
                                  cardBg: e.target.value,
                                },
                              })
                            }
                            className="text-xs font-mono bg-transparent text-[var(--foreground)] focus:outline-none flex-1"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                          Text / Foreground Color
                        </label>
                        <div className="flex items-center gap-2 p-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                          <input
                            type="color"
                            value={formData.customTheme?.foreground || "#f3f4f6"}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                customTheme: {
                                  ...(formData.customTheme || DEFAULT_CUSTOM_THEME),
                                  foreground: e.target.value,
                                },
                              })
                            }
                            className="w-7 h-7 rounded-lg border-0 cursor-pointer bg-transparent"
                          />
                          <input
                            type="text"
                            value={formData.customTheme?.foreground || "#f3f4f6"}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                customTheme: {
                                  ...(formData.customTheme || DEFAULT_CUSTOM_THEME),
                                  foreground: e.target.value,
                                },
                              })
                            }
                            className="text-xs font-mono bg-transparent text-[var(--foreground)] focus:outline-none flex-1"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-[var(--sidebar-border)] space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--foreground)]">Display Typography</h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      Font family applied instantly across all chats, codeblocks, and UI elements.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {FONT_OPTIONS.map((font) => {
                      const isSelected = (formData.fontFamily || "inter") === font.id;
                      return (
                        <div
                          key={font.id}
                          onClick={() => {
                            const updated = { ...formData, fontFamily: font.id };
                            setFormData(updated);
                            onSaveSettings(updated);
                          }}
                          className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                            isSelected
                              ? "border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/20"
                              : "border-[var(--card-border)] bg-[var(--sidebar-bg)] hover:border-[var(--muted)]"
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="text-xs font-bold text-[var(--foreground)] truncate">
                              {font.name}
                            </div>
                            <div className="text-[10px] text-blue-400 truncate mt-0.5 font-medium">
                              {font.sample}
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 2. CHAT & GENERATION (GRANULAR MODEL CUSTOMIZATION) */}
            {activeSection === "chat" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">Model Customization & Hyperparameters</h3>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    Fine-tune reasoning, temperature, sampling, and context window limits.
                  </p>
                </div>

                {/* Thinking Mode Default Selector */}
                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--foreground)]">
                    <Brain className="w-4 h-4 text-purple-400" />
                    <span>Default Thinking & Reasoning Mode</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "think", label: "🧠 Think Mode", desc: "Step-by-step reasoning" },
                      { id: "nothink", label: "⚡ No-Think (Fast)", desc: "Direct concise response" },
                      { id: "default", label: "✨ Natural Default", desc: "Standard model behavior" },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, thinkingMode: mode.id as ThinkingMode })
                        }
                        className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                          formData.thinkingMode === mode.id
                            ? "border-purple-500 bg-purple-500/15 text-[var(--foreground)] font-bold ring-1 ring-purple-500"
                            : "border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        <div className="text-xs">{mode.label}</div>
                        <div className="text-[9px] opacity-75">{mode.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)]">
                  <span className="text-xs font-semibold text-[var(--muted)] flex items-center gap-1">
                    <Wand2 className="w-3.5 h-3.5 text-amber-400" /> Presets:
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyParamPreset("code")}
                      className="px-2.5 py-1 rounded-lg text-xs bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-blue-400 font-medium cursor-pointer"
                    >
                      Precise Code (0.2)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyParamPreset("balanced")}
                      className="px-2.5 py-1 rounded-lg text-xs bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-emerald-400 font-medium cursor-pointer"
                    >
                      Balanced (0.7)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyParamPreset("creative")}
                      className="px-2.5 py-1 rounded-lg text-xs bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-pink-400 font-medium cursor-pointer"
                    >
                      Creative (1.2)
                    </button>
                  </div>
                </div>

                {/* Hyperparameter Sliders Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Temperature */}
                  <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-[var(--foreground)]">
                      <span>Temperature (Randomness)</span>
                      <span className="font-mono text-emerald-400">{formData.temperature}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={2.0}
                      step={0.05}
                      value={formData.temperature}
                      onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                      className="w-full accent-emerald-500"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--muted)]">
                      <span>0.0 (Deterministic)</span>
                      <span>2.0 (Wild)</span>
                    </div>
                  </div>

                  {/* Top-P */}
                  <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-[var(--foreground)]">
                      <span>Top-P (Nucleus Sampling)</span>
                      <span className="font-mono text-blue-400">{formData.topP}</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={1.0}
                      step={0.05}
                      value={formData.topP}
                      onChange={(e) => setFormData({ ...formData, topP: parseFloat(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--muted)]">
                      <span>0.1 (Focused)</span>
                      <span>1.0 (Full Pool)</span>
                    </div>
                  </div>

                  {/* Top-K */}
                  <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-[var(--foreground)]">
                      <span>Top-K (Candidate Pool)</span>
                      <span className="font-mono text-purple-400">{formData.topK || 40}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={100}
                      step={1}
                      value={formData.topK || 40}
                      onChange={(e) => setFormData({ ...formData, topK: parseInt(e.target.value) })}
                      className="w-full accent-purple-500"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--muted)]">
                      <span>1</span>
                      <span>100</span>
                    </div>
                  </div>

                  {/* Repeat Penalty */}
                  <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-[var(--foreground)]">
                      <span>Repeat Penalty</span>
                      <span className="font-mono text-amber-400">{formData.repeatPenalty || 1.1}</span>
                    </div>
                    <input
                      type="range"
                      min={1.0}
                      max={2.0}
                      step={0.05}
                      value={formData.repeatPenalty || 1.1}
                      onChange={(e) => setFormData({ ...formData, repeatPenalty: parseFloat(e.target.value) })}
                      className="w-full accent-amber-500"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--muted)]">
                      <span>1.0 (None)</span>
                      <span>2.0 (Strict)</span>
                    </div>
                  </div>
                </div>

                {/* Visual Context Window Size (num_ctx) Selector */}
                <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-[var(--foreground)]">
                          Context Window Capacity (num_ctx)
                        </label>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                          {formData.numCtx ? (formData.numCtx >= 1024 ? `${formData.numCtx / 1024}K Tokens` : `${formData.numCtx} Tokens`) : "16K Tokens"}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--muted)] mt-0.5">
                        Berapa banyak teks, dokumen, dan riwayat obrolan yang dapat diingat model AI sekaligus.
                      </p>
                    </div>

                    {/* VRAM / Performance Indicator */}
                    <div className="text-[11px] font-mono text-[var(--muted)] flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                      <span>
                        {CONTEXT_SIZE_PRESETS.find((p) => p.value === formData.numCtx)?.vramEst || "Custom"}
                      </span>
                    </div>
                  </div>

                  {/* Preset Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                    {CONTEXT_SIZE_PRESETS.map((preset) => {
                      const isSelected = (formData.numCtx || 16384) === preset.value;
                      return (
                        <div
                          key={preset.value}
                          onClick={() => setFormData({ ...formData, numCtx: preset.value })}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 select-none ${
                            isSelected
                              ? "bg-cyan-500/10 border-cyan-500 shadow-sm shadow-cyan-500/10 text-[var(--foreground)]"
                              : "bg-[var(--card-bg)] border-[var(--card-border)] hover:border-[var(--muted)]/50 hover:bg-[var(--sidebar-hover)]"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold font-mono text-[var(--foreground)] flex items-center gap-1.5">
                              {preset.name}
                            </span>
                            <span
                              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                                preset.badge === "Recommended"
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                                  : preset.badge === "Lightweight"
                                  ? "bg-blue-500/15 text-blue-400"
                                  : preset.badge === "Massive"
                                  ? "bg-purple-500/15 text-purple-400"
                                  : "bg-[var(--sidebar-bg)] text-[var(--muted)]"
                              }`}
                            >
                              {preset.badge}
                            </span>
                          </div>

                          <p className="text-[10px] text-[var(--muted)] leading-relaxed">
                            {preset.desc}
                          </p>

                          <div className="flex items-center justify-between text-[10px] font-mono text-[var(--muted)] pt-1 border-t border-[var(--card-border)]/50">
                            <span>{preset.vramEst}</span>
                            {isSelected && (
                              <span className="flex items-center gap-1 text-cyan-400 font-bold">
                                <Check className="w-3 h-3" />
                                Aktif
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Custom Value Option */}
                    <div
                      className={`p-3 rounded-xl border transition-all flex flex-col justify-between space-y-1.5 ${
                        !CONTEXT_SIZE_PRESETS.some((p) => p.value === formData.numCtx)
                          ? "bg-cyan-500/10 border-cyan-500 text-[var(--foreground)]"
                          : "bg-[var(--card-bg)] border-[var(--card-border)]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--foreground)]">Custom Tokens</span>
                        <span className="text-[9px] font-mono bg-[var(--sidebar-bg)] px-1.5 py-0.5 rounded text-[var(--muted)]">
                          Manual
                        </span>
                      </div>
                      <input
                        type="number"
                        min={1024}
                        max={131072}
                        step={1024}
                        value={formData.numCtx || 16384}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setFormData({ ...formData, numCtx: isNaN(val) ? 16384 : Math.max(1024, val) });
                        }}
                        className="w-full px-2.5 py-1 text-xs font-mono rounded-lg border border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        placeholder="e.g. 16384"
                      />
                      <span className="text-[9px] text-[var(--muted)]">1,024 - 131,072 tokens</span>
                    </div>
                  </div>

                  {/* Persistent Sync Guarantee Banner */}
                  <div className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs">
                    <Zap className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <div className="text-[11px] leading-relaxed">
                      <strong className="font-semibold text-emerald-300">Penyimpanan Permanen Aktif:</strong> Nilai Context Window disimpan langsung ke file database lokal (<code className="font-mono text-emerald-200">data/db.json</code>) dan disinkronkan ke client. Pengaturan ini akan tetap bertahan dan tidak akan reset ke 4K saat web dimuat ulang atau server npm di-restart.
                    </div>
                  </div>
                </div>

                {/* Smart Context & Static Prompt Cache */}
                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div className="pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--foreground)]">
                            Smart Context & Static Prompt Cache
                          </span>
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            KV-Cache Reuse
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--muted)] leading-relaxed mt-0.5">
                          Menjaga System Prompt statis di VRAM dan menyuntikkan dokumen RAG ke turn aktif. AI tidak perlu membaca ulang seluruh riwayat percakapan dari awal setiap kali pesan baru dikirim.
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.smartContextEnabled ?? true}
                      onChange={(e) => setFormData({ ...formData, smartContextEnabled: e.target.checked })}
                      className="w-4 h-4 rounded border-[var(--card-border)] text-cyan-500 focus:ring-cyan-500 bg-[var(--card-bg)] cursor-pointer"
                    />
                  </div>
                </div>

                {/* VRAM / RAM Keep-Alive */}
                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                        <HardDrive className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-[var(--foreground)]">
                          VRAM / RAM Model Keep-Alive (Ollama)
                        </span>
                        <p className="text-[10px] text-[var(--muted)] leading-relaxed mt-0.5">
                          Menentukan berapa lama model dan KV-Cache tetap bertahan di memori GPU/RAM sebelum di-unload otomatis.
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-semibold text-amber-400">
                      {KEEP_ALIVE_PRESETS.find((p) => p.value === (formData.ollamaKeepAlive || "60m"))?.label || formData.ollamaKeepAlive || "60m"}
                    </span>
                  </div>
                  <select
                    value={formData.ollamaKeepAlive || "60m"}
                    onChange={(e) => setFormData({ ...formData, ollamaKeepAlive: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    {KEEP_ALIVE_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label} — {preset.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Max Output Tokens (num_predict) */}
                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-[var(--foreground)]">
                      Max Output Tokens (num_predict)
                    </label>
                    <span className="text-xs font-mono font-semibold text-blue-400">
                      {formData.numPredict === -1 ? "Unlimited (-1)" : `${formData.numPredict || 2048} tokens`}
                    </span>
                  </div>
                  <select
                    value={formData.numPredict || 2048}
                    onChange={(e) => setFormData({ ...formData, numPredict: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={512}>512 tokens (Jawaban singkat)</option>
                    <option value={1024}>1,024 tokens</option>
                    <option value={2048}>2,048 tokens (Standar)</option>
                    <option value={4096}>4,096 tokens (Kode & artikel panjang)</option>
                    <option value={8192}>8,192 tokens (Laporan lengkap)</option>
                    <option value={-1}>Unlimited (-1) — Model memutuskan sendiri</option>
                  </select>
                </div>

                {/* Default System Instructions */}
                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                  <label className="block text-xs font-bold text-[var(--foreground)]">
                    Default System Instructions
                  </label>
                  <textarea
                    value={formData.defaultSystemPrompt}
                    onChange={(e) => setFormData({ ...formData, defaultSystemPrompt: e.target.value })}
                    rows={3}
                    className="w-full p-2.5 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-emerald-500 focus:outline-none resize-y font-mono"
                  />
                </div>

                {/* Behavior Toggles */}
                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[var(--foreground)]">Send on Enter</div>
                    <div className="text-[10px] text-[var(--muted)]">Shift+Enter creates a new line</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.sendOnEnter}
                    onChange={(e) => setFormData({ ...formData, sendOnEnter: e.target.checked })}
                    className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[var(--foreground)]">Full-Width Chat</div>
                    <div className="text-[10px] text-[var(--muted)]">
                      Stretch messages & composer to fill the window instead of a centered reading column
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.chatFullWidth ?? true}
                    onChange={(e) => setFormData({ ...formData, chatFullWidth: e.target.checked })}
                    className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* VOICE & SPEECH ENGINE SECTION */}
            {activeSection === "voice" && (
              <div className="space-y-5 animate-in fade-in duration-150">
                {/* Header Banner */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-blue-500/10 border border-purple-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Headphones className="w-5 h-5 text-purple-400" />
                      <h3 className="text-sm font-bold text-[var(--foreground)]">Voice Call & Speech Synthesis Studio</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/20 text-purple-300">
                        Ultra-Fluent Speech
                      </span>
                    </div>
                    <p className="text-xs text-[var(--muted)]">
                      Pilihan suara manusia alami (Microsoft Natural, Google Neural, OpenAI TTS), gaya bicara santai/akrab, dan kontrol artikulasi.
                    </p>
                  </div>

                  {/* Quick Test Audio Button */}
                  <button
                    type="button"
                    onClick={handleTestVoice}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-md shrink-0 cursor-pointer ${
                      previewVoicePlaying
                        ? "bg-rose-600 hover:bg-rose-700 text-white animate-pulse"
                        : "bg-purple-600 hover:bg-purple-700 text-white"
                    }`}
                  >
                    {previewVoicePlaying ? (
                      <>
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>Hentikan Suara</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Tes Suara Sekarang</span>
                      </>
                    )}
                  </button>
                </div>

                {/* 1. Speech Engine Architecture */}
                <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-[var(--foreground)]">Voice Engine Provider</div>
                      <div className="text-[11px] text-[var(--muted)]">
                        Pilih modul sintesis suara untuk percakapan lisan
                      </div>
                    </div>
                    <span className="text-[11px] font-mono font-medium text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md">
                      {formData.voice?.engine === "openai"
                        ? "OpenAI Neural Audio"
                        : formData.voice?.engine === "browser"
                        ? "Browser Standard"
                        : "Microsoft / Google Natural"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                    {/* Engine 1: Natural Neural */}
                    <button
                      type="button"
                      onClick={() => updateVoice({ engine: "natural" })}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        (formData.voice?.engine || "natural") === "natural"
                          ? "border-purple-500 bg-purple-500/10 text-[var(--foreground)] shadow-sm"
                          : "border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                          Natural Neural (Rekomendasi)
                        </span>
                        {(formData.voice?.engine || "natural") === "natural" && (
                          <Check className="w-3.5 h-3.5 text-purple-400" />
                        )}
                      </div>
                      <p className="text-[10px] leading-relaxed text-[var(--muted)]">
                        Memprioritaskan suara modern Microsoft Online Natural & Google Neural tanpa robotik. 100% Gratis & tanpa kuota API.
                      </p>
                    </button>

                    {/* Engine 2: OpenAI TTS */}
                    <button
                      type="button"
                      onClick={() => updateVoice({ engine: "openai" })}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        formData.voice?.engine === "openai"
                          ? "border-emerald-500 bg-emerald-500/10 text-[var(--foreground)] shadow-sm"
                          : "border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-emerald-400" />
                          OpenAI Ultra-Fluent TTS
                        </span>
                        {formData.voice?.engine === "openai" && (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                      </div>
                      <p className="text-[10px] leading-relaxed text-[var(--muted)]">
                        Model tts-1 super fasih setara manusia sungguhan.{" "}
                        {formData.apiKeys?.openaiApiKey ? (
                          <span className="text-emerald-400 font-semibold">API Key Aktif ✓</span>
                        ) : (
                          <span className="text-amber-400 font-semibold">Perlu OpenAI Key di Cloud</span>
                        )}
                      </p>
                    </button>

                    {/* Engine 3: Standard Browser */}
                    <button
                      type="button"
                      onClick={() => updateVoice({ engine: "browser" })}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        formData.voice?.engine === "browser"
                          ? "border-blue-500 bg-blue-500/10 text-[var(--foreground)] shadow-sm"
                          : "border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                          <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                          Browser Offline Default
                        </span>
                        {formData.voice?.engine === "browser" && (
                          <Check className="w-3.5 h-3.5 text-blue-400" />
                        )}
                      </div>
                      <p className="text-[10px] leading-relaxed text-[var(--muted)]">
                        Menggunakan suara bawaan SpeechSynthesis OS/browser lokal secara langsung.
                      </p>
                    </button>
                  </div>

                  {/* OpenAI Voice Persona Selection if OpenAI engine active */}
                  {formData.voice?.engine === "openai" && (
                    <div className="mt-3 p-3 rounded-xl bg-[var(--card-bg)] border border-emerald-500/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400">OpenAI Voice Persona:</span>
                        <span className="text-[10px] text-[var(--muted)]">Model tts-1</span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {[
                          { id: "nova", name: "Nova", desc: "Perempuan ceria" },
                          { id: "shimmer", name: "Shimmer", desc: "Perempuan lembut" },
                          { id: "alloy", name: "Alloy", desc: "Netral seimbang" },
                          { id: "echo", name: "Echo", desc: "Pria hangat" },
                          { id: "fable", name: "Fable", desc: "Ekspresif" },
                          { id: "onyx", name: "Onyx", desc: "Pria wibawa" },
                        ].map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => updateVoice({ openaiVoice: v.id })}
                            className={`p-2 rounded-lg text-center border transition-all cursor-pointer ${
                              (formData.voice?.openaiVoice || "nova") === v.id
                                ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 font-bold"
                                : "border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--muted)] hover:text-[var(--foreground)]"
                            }`}
                          >
                            <div className="text-xs">{v.name}</div>
                            <div className="text-[9px] opacity-75">{v.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Character Persona Grid (Moved from Voice Call screen) */}
                <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-[var(--foreground)]">Karakter & Profil Suara</div>
                      <div className="text-[11px] text-[var(--muted)]">
                        Pilih kepribadian suara AI untuk panggilan suara dan text-to-speech
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-purple-400">
                      {VOICE_PRESETS.find((p) => p.id === (formData.voice?.presetId || "female_gadis"))?.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {VOICE_PRESETS.filter((p) => p.id !== "system_custom").map((preset) => {
                      const isSelected = (formData.voice?.presetId || "female_gadis") === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            updateVoice({
                              presetId: preset.id,
                              pitch: preset.defaultPitch,
                              rate: preset.defaultRate,
                            })
                          }
                          className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden cursor-pointer ${
                            isSelected
                              ? "border-purple-500 bg-purple-500/10 shadow-sm"
                              : "border-[var(--card-border)] bg-[var(--card-bg)] hover:border-purple-500/40"
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute top-2 right-2">
                              <Check className="w-4 h-4 text-purple-400" />
                            </div>
                          )}
                          <div className="flex items-center gap-2.5 mb-2">
                            <span className="text-2xl">{preset.icon}</span>
                            <div>
                              <div className="text-xs font-bold text-[var(--foreground)]">{preset.name}</div>
                              <div className="text-[10px] text-[var(--muted)]">{preset.gender === "female" ? "Perempuan" : preset.gender === "male" ? "Laki-laki" : "Robot"}</div>
                            </div>
                          </div>
                          <p className="text-[11px] text-[var(--muted)] line-clamp-2 leading-relaxed">
                            {preset.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {/* System Voice Picker Dropdown */}
                  <div className="pt-2 border-t border-[var(--card-border)]">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-indigo-400" />
                        Pilih Spesifik dari Suara Sistem Browser ({allSystemVoices.length} suara terdeteksi)
                      </label>
                      {formData.voice?.voiceName && (
                        <button
                          type="button"
                          onClick={() => updateVoice({ voiceName: "" })}
                          className="text-[10px] text-purple-400 hover:underline cursor-pointer"
                        >
                          Gunakan Suara Rekomendasi Otomatis
                        </button>
                      )}
                    </div>
                    <select
                      value={formData.voice?.voiceName || ""}
                      onChange={(e) => updateVoice({ voiceName: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      <option value="">-- Otomatis Pilih Suara Paling Natural (Neural / Online) --</option>
                      {allSystemVoices.map((v) => {
                        const isNatural =
                          v.name.toLowerCase().includes("natural") ||
                          v.name.toLowerCase().includes("online") ||
                          v.name.toLowerCase().includes("neural") ||
                          v.name.toLowerCase().includes("google");
                        const isId = v.lang.toLowerCase().startsWith("id");
                        return (
                          <option key={v.name} value={v.name}>
                            {isNatural ? "⭐ " : ""}{v.name} ({v.lang}) {isId ? "• Bahasa Indonesia" : ""}
                          </option>
                        );
                      })}
                    </select>
                    <p className="text-[10px] text-[var(--muted)] mt-1">
                      Tip: Suara bertanda ⭐ memiliki artikulasi neural berkualitas tinggi yang tidak terdengar kaku.
                    </p>
                  </div>
                </div>

                {/* 3. Conversational Tone Mode */}
                <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-3">
                  <div>
                    <div className="text-xs font-bold text-[var(--foreground)]">Gaya Percakapan (Tone)</div>
                    <div className="text-[11px] text-[var(--muted)]">
                      Mengatur bagaimana AI merangkai kata dan intonasi saat menjawab suara
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {TONE_OPTIONS.map((t) => {
                      const isSelected = (formData.voice?.tone || "casual") === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => updateVoice({ tone: t.id })}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? "border-purple-500 bg-purple-500/10 shadow-sm"
                              : "border-[var(--card-border)] bg-[var(--card-bg)] hover:border-purple-500/30"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-base">{t.icon}</span>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${
                                isSelected
                                  ? "bg-purple-500/20 text-purple-300"
                                  : "bg-[var(--sidebar-bg)] text-[var(--muted)]"
                              }`}
                            >
                              {t.badge}
                            </span>
                          </div>
                          <div className="text-xs font-bold text-[var(--foreground)]">{t.label}</div>
                          <p className="text-[10px] text-[var(--muted)] mt-1 leading-relaxed">{t.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Fine-Tuning: Pitch, Speed & Silence Sensitivity */}
                <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-4">
                  <div className="text-xs font-bold text-[var(--foreground)]">Kontrol Artikulasi & Deteksi Suara</div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Pitch */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="text-[var(--foreground)] font-semibold">Pitch (Tinggi-Rendah)</label>
                        <span className="font-mono text-purple-400 font-semibold">
                          {(formData.voice?.pitch ?? 1.05).toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.75"
                        max="1.4"
                        step="0.05"
                        value={formData.voice?.pitch ?? 1.05}
                        onChange={(e) => updateVoice({ pitch: parseFloat(e.target.value) })}
                        className="w-full h-1.5 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                      <div className="flex justify-between text-[9px] text-[var(--muted)]">
                        <span>Bass (0.75x)</span>
                        <span>Normal (1.0x)</span>
                        <span>Tinggi (1.40x)</span>
                      </div>
                    </div>

                    {/* Speed / Rate */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="text-[var(--foreground)] font-semibold">Kecepatan Bicara</label>
                        <span className="font-mono text-purple-400 font-semibold">
                          {(formData.voice?.rate ?? 1.05).toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.8"
                        max="1.5"
                        step="0.05"
                        value={formData.voice?.rate ?? 1.05}
                        onChange={(e) => updateVoice({ rate: parseFloat(e.target.value) })}
                        className="w-full h-1.5 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                      <div className="flex justify-between text-[9px] text-[var(--muted)]">
                        <span>Santai (0.8x)</span>
                        <span>Normal (1.0x)</span>
                        <span>Cepat (1.5x)</span>
                      </div>
                    </div>

                    {/* Auto-Silence Sensitivity */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="text-[var(--foreground)] font-semibold">Jeda Hening Deteksi Bicara</label>
                        <span className="font-mono text-purple-400 font-semibold">
                          {(formData.voice?.autoSilenceMs ?? 1400)} ms
                        </span>
                      </div>
                      <input
                        type="range"
                        min="800"
                        max="3000"
                        step="100"
                        value={formData.voice?.autoSilenceMs ?? 1400}
                        onChange={(e) => updateVoice({ autoSilenceMs: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                      <div className="flex justify-between text-[9px] text-[var(--muted)]">
                        <span>Responsif (0.8s)</span>
                        <span>Standar (1.4s)</span>
                        <span>Tenang (3.0s)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. AGENTIC SKILLS HUB SECTION (MOVED TO SETTINGS) */}
            {activeSection === "skills" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--foreground)]">Agentic Skills & Capabilities</h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      Toggle skills to automatically equip local and cloud models with specialized roles.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddingSkill(!isAddingSkill)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAddingSkill ? "Cancel" : "Add Custom Skill"}</span>
                  </button>
                </div>

                {/* Create Custom Skill Form */}
                {isAddingSkill && (
                  <form
                    onSubmit={handleCreateCustomSkill}
                    className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-amber-500/30 space-y-3 animate-in fade-in duration-150"
                  >
                    <div className="text-xs font-bold text-amber-400">Create Custom Internet / System Skill</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Skill Name (e.g. Legal Contract Auditor)"
                        value={newSkillName}
                        onChange={(e) => setNewSkillName(e.target.value)}
                        required
                        className="px-3 py-1.5 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Short Description"
                        value={newSkillDesc}
                        onChange={(e) => setNewSkillDesc(e.target.value)}
                        className="px-3 py-1.5 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none"
                      />
                    </div>
                    <textarea
                      placeholder="System Prompt / Specialized Instructions (e.g. You are an expert attorney specializing in NDA reviews...)"
                      value={newSkillPrompt}
                      onChange={(e) => setNewSkillPrompt(e.target.value)}
                      required
                      rows={3}
                      className="w-full p-2.5 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none font-mono"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="submit"
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-amber-500 text-black hover:bg-amber-400 transition-colors cursor-pointer"
                      >
                        Save & Enable Skill
                      </button>
                    </div>
                  </form>
                )}

                {/* Skills Search Filter */}
                <div className="relative flex items-center w-full">
                  <Search className="absolute left-3 w-4 h-4 text-[var(--muted)] pointer-events-none" />
                  <input
                    type="text"
                    value={skillSearch}
                    onChange={(e) => setSkillSearch(e.target.value)}
                    placeholder="Search skills by name, tag, or role..."
                    className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all shadow-2xs"
                  />
                  {skillSearch && (
                    <button
                      type="button"
                      onClick={() => setSkillSearch("")}
                      className="absolute right-2.5 p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Skills List Cards */}
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1 touch-scroll">
                  {currentSkills
                    .filter(
                      (s) =>
                        s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
                        s.description.toLowerCase().includes(skillSearch.toLowerCase()) ||
                        s.tags?.some((t) => t.toLowerCase().includes(skillSearch.toLowerCase()))
                    )
                    .map((skill) => (
                      <div
                        key={skill.id}
                        className={`p-3.5 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                          skill.enabled
                            ? "bg-amber-500/10 border-amber-500/30 shadow-2xs"
                            : "bg-[var(--sidebar-bg)] border-[var(--card-border)] opacity-70"
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[var(--foreground)]">{skill.name}</span>
                            {skill.isCustom && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400">
                                Custom
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--muted)] leading-relaxed">{skill.description}</p>
                          {skill.tags && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {skill.tags.map((t, idx) => (
                                <span
                                  key={idx}
                                  className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--card-bg)] text-[var(--muted)] border border-[var(--card-border)]/50"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                          {skill.isCustom && (
                            <button
                              type="button"
                              onClick={() => handleDeleteSkill(skill.id)}
                              className="p-1 text-[var(--muted)] hover:text-rose-400 transition-colors"
                              title="Delete custom skill"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={skill.enabled}
                              onChange={() => toggleSkill(skill.id)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-[var(--card-border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                          </label>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* 5. CLOUD AI MODELS SECTION */}
            {activeSection === "cloud" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">Cloud Model API Keys</h3>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    Connect Google Gemini, Anthropic Claude, OpenAI, DeepSeek, and Groq.
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Google Gemini */}
                  <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                      <span className="flex items-center gap-1.5 text-blue-400">
                        🔷 Google Gemini API Key
                      </span>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-blue-400 hover:underline"
                      >
                        Get Free Key ↗
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={showKeys["gemini"] ? "text" : "password"}
                        value={formData.apiKeys?.geminiApiKey || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            apiKeys: { ...formData.apiKeys, geminiApiKey: e.target.value },
                          })
                        }
                        placeholder="AIzaSy..."
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 focus:outline-none pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility("gemini")}
                        className="absolute right-2.5 top-2.5 text-[var(--muted)] hover:text-[var(--foreground)]"
                      >
                        {showKeys["gemini"] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* OpenAI */}
                  <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        🟢 OpenAI API Key
                      </span>
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-emerald-400 hover:underline"
                      >
                        Get Key ↗
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={showKeys["openai"] ? "text" : "password"}
                        value={formData.apiKeys?.openaiApiKey || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            apiKeys: { ...formData.apiKeys, openaiApiKey: e.target.value },
                          })
                        }
                        placeholder="sk-proj-..."
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-emerald-500 focus:outline-none pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility("openai")}
                        className="absolute right-2.5 top-2.5 text-[var(--muted)] hover:text-[var(--foreground)]"
                      >
                        {showKeys["openai"] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Anthropic Claude */}
                  <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                      <span className="flex items-center gap-1.5 text-purple-400">
                        🟣 Anthropic Claude API Key
                      </span>
                      <a
                        href="https://console.anthropic.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-purple-400 hover:underline"
                      >
                        Get Key ↗
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={showKeys["anthropic"] ? "text" : "password"}
                        value={formData.apiKeys?.anthropicApiKey || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            apiKeys: { ...formData.apiKeys, anthropicApiKey: e.target.value },
                          })
                        }
                        placeholder="sk-ant-..."
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-purple-500 focus:outline-none pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility("anthropic")}
                        className="absolute right-2.5 top-2.5 text-[var(--muted)] hover:text-[var(--foreground)]"
                      >
                        {showKeys["anthropic"] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* DeepSeek API */}
                  <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                      <span className="flex items-center gap-1.5 text-cyan-400">
                        🐋 DeepSeek API Key
                      </span>
                      <a
                        href="https://platform.deepseek.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-cyan-400 hover:underline"
                      >
                        Get Key ↗
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={showKeys["deepseek"] ? "text" : "password"}
                        value={formData.apiKeys?.deepseekApiKey || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            apiKeys: { ...formData.apiKeys, deepseekApiKey: e.target.value },
                          })
                        }
                        placeholder="sk-..."
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-cyan-500 focus:outline-none pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility("deepseek")}
                        className="absolute right-2.5 top-2.5 text-[var(--muted)] hover:text-[var(--foreground)]"
                      >
                        {showKeys["deepseek"] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Groq LPU */}
                  <div className="p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                      <span className="flex items-center gap-1.5 text-amber-400">
                        ⚡ Groq LPU API Key (300+ tok/s)
                      </span>
                      <a
                        href="https://console.groq.com/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-amber-400 hover:underline"
                      >
                        Get Free Key ↗
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={showKeys["groq"] ? "text" : "password"}
                        value={formData.apiKeys?.groqApiKey || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            apiKeys: { ...formData.apiKeys, groqApiKey: e.target.value },
                          })
                        }
                        placeholder="gsk_..."
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-amber-500 focus:outline-none pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility("groq")}
                        className="absolute right-2.5 top-2.5 text-[var(--muted)] hover:text-[var(--foreground)]"
                      >
                        {showKeys["groq"] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 5. LOCAL OLLAMA & SEARCH SECTION */}
            {activeSection === "server" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">Local Server Connections</h3>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    Configure local endpoints for Ollama engine and SearXNG web search.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                    <label className="block text-xs font-bold text-[var(--foreground)]">
                      Ollama Host Endpoint
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={formData.ollamaUrl}
                        onChange={(e) => setFormData({ ...formData, ollamaUrl: e.target.value })}
                        className="flex-1 px-3 py-2 text-xs font-mono rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={testStatus === "testing"}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--card-bg)] border border-[var(--card-border)] hover:bg-[var(--sidebar-hover)] text-[var(--foreground)] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${testStatus === "testing" ? "animate-spin" : ""}`} />
                        <span>Test</span>
                      </button>
                    </div>

                    {testStatus === "success" && (
                      <div className="text-xs text-emerald-400 flex items-center gap-1 pt-1 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Connected ({models.length} models installed)
                      </div>
                    )}
                    {testStatus === "failed" && (
                      <div className="text-xs text-rose-400 flex items-center gap-1 pt-1 font-medium">
                        <XCircle className="w-3.5 h-3.5" /> Cannot connect to Ollama. Ensure service is running.
                      </div>
                    )}
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-4 h-4 text-blue-400" />
                        <label className="block text-xs font-bold text-[var(--foreground)]">
                          Web Search & Deep Page Scraper
                        </label>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        Zero Docker Required
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-[var(--muted)]">
                        Search Engine Provider
                      </label>
                      <select
                        value={formData.searchProvider || "auto"}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            searchProvider: e.target.value as any,
                          })
                        }
                        className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                      >
                        <option value="auto">Auto (Built-in Web Scraper + SearXNG fallback)</option>
                        <option value="builtin">Built-in Web Scraper & Reader Only (Zero Setup)</option>
                        <option value="searxng">SearXNG Docker Only</option>
                      </select>
                    </div>

                    <label className="flex items-center gap-2.5 p-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={formData.deepScrapeEnabled !== false}
                        onChange={(e) =>
                          setFormData({ ...formData, deepScrapeEnabled: e.target.checked })
                        }
                        className="rounded border-[var(--card-border)] text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      <div className="flex-1">
                        <span className="font-semibold text-[var(--foreground)] block">
                          Deep Webpage Reader Mode
                        </span>
                        <span className="text-[11px] text-[var(--muted)] block">
                          Automatically visits and scrapes full readable article content so local models can read the whole page.
                        </span>
                      </div>
                    </label>

                    {(formData.searchProvider === "searxng" || formData.searchProvider === "auto" || !formData.searchProvider) && (
                      <div className="space-y-1 pt-1">
                        <label className="block text-[11px] font-medium text-[var(--muted)]">
                          SearXNG Endpoint URL (Optional)
                        </label>
                        <input
                          type="text"
                          value={formData.searxngUrl}
                          onChange={(e) => setFormData({ ...formData, searxngUrl: e.target.value })}
                          placeholder="http://localhost:8080"
                          className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                        />
                        <p className="text-[10px] text-[var(--muted)]">
                          If SearXNG is not running, the built-in search engine & page scraper seamlessly takes over.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Local Disk Explorer Launcher */}
                  {onOpenDiskExplorer && (
                    <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-[var(--foreground)] flex items-center gap-1.5">
                          <Folder className="w-4 h-4 text-emerald-400" />
                          <span>Local Disk Explorer</span>
                        </div>
                        <p className="text-[11px] text-[var(--muted)] mt-0.5">
                          Explore your hard drive folders, read local files, and attach context directly.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenDiskExplorer();
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer flex-shrink-0 shadow-xs"
                      >
                        Open Disk
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 6. DATA, BACKUP & EXPORT */}
            {activeSection === "data" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">Backup & Data Management</h3>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    Export full JSON backups, import data, or reset database.
                  </p>
                </div>

                {/* Data Overview Stats */}
                <div className="grid grid-cols-3 gap-2 py-1 text-center font-mono">
                  <div className="p-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)]">
                    <div className="text-[10px] text-[var(--muted)]">Conversations</div>
                    <div className="font-bold text-emerald-400 text-sm">{storage.getConversations().length}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)]">
                    <div className="text-[10px] text-[var(--muted)]">Projects</div>
                    <div className="font-bold text-blue-400 text-sm">{storage.getProjects().length}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)]">
                    <div className="text-[10px] text-[var(--muted)]">Agents</div>
                    <div className="font-bold text-purple-400 text-sm">{storage.getAgents().length}</div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={handleExport}
                    className="w-full p-3 rounded-2xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] hover:bg-[var(--sidebar-hover)] text-left flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div>
                      <div className="text-xs font-bold text-[var(--foreground)]">Export Backup (.json)</div>
                      <div className="text-[10px] text-[var(--muted)]">Save all chats, projects, agents, and settings</div>
                    </div>
                    <Download className="w-4 h-4 text-blue-400" />
                  </button>

                  <label className="w-full p-3 rounded-2xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] hover:bg-[var(--sidebar-hover)] text-left flex items-center justify-between transition-colors cursor-pointer">
                    <div>
                      <div className="text-xs font-bold text-[var(--foreground)]">Import Backup (.json)</div>
                      <div className="text-[10px] text-[var(--muted)]">Restore conversations and knowledge base</div>
                    </div>
                    <Upload className="w-4 h-4 text-emerald-400" />
                    <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Are you sure you want to delete all conversations? This cannot be undone.")) {
                        onClearAllChats();
                        onClose();
                      }
                    }}
                    className="w-full p-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-left flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div>
                      <div className="text-xs font-bold text-rose-400">Clear All Chat History</div>
                      <div className="text-[10px] text-rose-300/70">Permanently delete all stored chats</div>
                    </div>
                    <Trash2 className="w-4 h-4 text-rose-400" />
                  </button>
                </div>
              </div>
            )}

            {/* 7. ABOUT & DIAGNOSTICS */}
            {activeSection === "about" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">About & System Diagnostics</h3>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    Application build information and active environment status.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-[var(--sidebar-border)]/50">
                    <span className="text-[var(--muted)]">Application Version</span>
                    <span className="font-mono font-bold text-[var(--foreground)]">v2.5.0 Hybrid AI</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[var(--sidebar-border)]/50">
                    <span className="text-[var(--muted)]">Database Storage</span>
                    <span className="font-mono text-emerald-400">Server Disk (data/db.json)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[var(--sidebar-border)]/50">
                    <span className="text-[var(--muted)]">Active Model</span>
                    <span className="font-mono text-blue-400">{formData.defaultModel || "Auto-Selected"}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-[var(--muted)]">Environment</span>
                    <span className="font-mono text-[var(--foreground)]">Localhost + Mobile Tunnel Sync</span>
                  </div>
                </div>
              </div>
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
  );
};
