"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Palette,
  Sun,
  Moon,
  Sparkle as Sparkles,
  Laptop,
  Check,
  CaretDown as ChevronDown,
} from "@phosphor-icons/react";
import { AppSettings, ThemeType, FontFamilyType } from "@/lib/types";
import { DEFAULT_CUSTOM_THEME } from "@/lib/constants";

export const THEME_OPTIONS: {
  id: ThemeType;
  name: string;
  icon: any;
  previewBg: string;
  previewAccent: string;
  desc: string;
}[] = [
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

export const FONT_OPTIONS: { id: FontFamilyType; name: string; desc: string; sample: string }[] = [
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

export const CUSTOM_THEME_PRESETS = [
  { name: "Cyberpunk Pink", bg: "#0d0221", fg: "#f3f4f6", sb: "#05010e", card: "#19053b", acc: "#ff007f" },
  { name: "Matcha Minimal", bg: "#0f1711", fg: "#e2e8f0", sb: "#080e0a", card: "#18261c", acc: "#10b981" },
  { name: "Solarized Ember", bg: "#1a1614", fg: "#fef3c7", sb: "#110e0c", card: "#29221d", acc: "#f59e0b" },
  { name: "Royal Purple", bg: "#0f0c20", fg: "#ede9fe", sb: "#080614", card: "#1c173b", acc: "#a855f7" },
  { name: "Deep Ocean", bg: "#0a192f", fg: "#e6f1ff", sb: "#020c1b", card: "#112240", acc: "#64ffda" },
];

interface PersonalizationTabProps {
  formData: AppSettings;
  setFormData: React.Dispatch<React.SetStateAction<AppSettings>>;
  onSaveSettings: (newSettings: AppSettings) => void;
}

export const PersonalizationTab: React.FC<PersonalizationTabProps> = ({
  formData,
  setFormData,
  onSaveSettings,
}) => {
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

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div>
        <h3 className="text-sm font-bold text-[var(--foreground)]">Theme & Color Palette</h3>
        <p className="text-xs text-[var(--muted)] mt-0.5">
          Select your preferred interface aesthetic and canvas styling.
        </p>
      </div>

      {/* Theme Dropdown Selector */}
      <div className="relative" ref={themeDropdownRef}>
        <button
          type="button"
          onClick={() => {
            setIsThemeDropdownOpen(!isThemeDropdownOpen);
            setIsFontDropdownOpen(false);
          }}
          className="w-full p-3.5 rounded-2xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] hover:border-purple-500/50 flex items-center justify-between transition-all cursor-pointer shadow-xs"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-4 h-4 rounded-full ${THEME_OPTIONS.find((t) => t.id === formData.theme)?.previewAccent || "bg-blue-500"} shadow-xs flex-shrink-0`} />
            <div className="text-left min-w-0">
              <div className="text-xs font-bold text-[var(--foreground)] truncate flex items-center gap-2">
                <span>{THEME_OPTIONS.find((t) => t.id === formData.theme)?.name || "Midnight Dark"}</span>
                <span className="text-[10px] text-purple-400 font-mono font-normal">
                  ({THEME_OPTIONS.find((t) => t.id === formData.theme)?.id})
                </span>
              </div>
              <div className="text-[11px] text-[var(--muted)] truncate">
                {THEME_OPTIONS.find((t) => t.id === formData.theme)?.desc}
              </div>
            </div>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-[var(--muted)] flex-shrink-0 transition-transform duration-200 ${
              isThemeDropdownOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {isThemeDropdownOpen && (
          <div className="absolute left-0 right-0 top-full mt-1.5 max-h-72 overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl z-50 p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-100">
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
                    setIsThemeDropdownOpen(false);
                  }}
                  className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? "bg-purple-500/15 text-purple-300 font-semibold"
                      : "text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-3.5 h-3.5 rounded-full ${th.previewAccent} flex-shrink-0 shadow-xs`} />
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{th.name}</div>
                      <div className="text-[10px] text-[var(--muted)] truncate">{th.desc}</div>
                    </div>
                  </div>
                  {isSelected ? (
                    <Check className="w-4 h-4 text-purple-400 flex-shrink-0 ml-2" />
                  ) : (
                    <IconComp className="w-3.5 h-3.5 text-[var(--muted)] flex-shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>
        )}
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
            <select
              value={CUSTOM_THEME_PRESETS.find((p) => p.name === formData.customTheme?.name)?.name || ""}
              onChange={(e) => {
                const preset = CUSTOM_THEME_PRESETS.find((p) => p.name === e.target.value);
                if (preset) {
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
                }
              }}
              className="w-full p-2.5 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-purple-500 focus:outline-none cursor-pointer"
            >
              <option value="" disabled>Pilih Quick Preset Inspirasi...</option>
              {CUSTOM_THEME_PRESETS.map((preset) => (
                <option key={preset.name} value={preset.name}>
                  {preset.name} (Accent: {preset.acc})
                </option>
              ))}
            </select>
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

        {/* Font Dropdown Selector */}
        <div className="relative" ref={fontDropdownRef}>
          <button
            type="button"
            onClick={() => {
              setIsFontDropdownOpen(!isFontDropdownOpen);
              setIsThemeDropdownOpen(false);
            }}
            className="w-full p-3.5 rounded-2xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] hover:border-blue-500/50 flex items-center justify-between transition-all cursor-pointer shadow-xs"
          >
            <div className="text-left min-w-0">
              <div className="text-xs font-bold text-[var(--foreground)] truncate flex items-center gap-2">
                <span>{FONT_OPTIONS.find((f) => f.id === (formData.fontFamily || "inter"))?.name || "Inter"}</span>
                <span className="text-[10px] text-blue-400 font-mono font-normal">
                  ({FONT_OPTIONS.find((f) => f.id === (formData.fontFamily || "inter"))?.id})
                </span>
              </div>
              <div className="text-[11px] text-[var(--muted)] truncate">
                {FONT_OPTIONS.find((f) => f.id === (formData.fontFamily || "inter"))?.desc} —{" "}
                <span className="font-mono text-blue-400">
                  {FONT_OPTIONS.find((f) => f.id === (formData.fontFamily || "inter"))?.sample}
                </span>
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-[var(--muted)] flex-shrink-0 transition-transform duration-200 ${
                isFontDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {isFontDropdownOpen && (
            <div className="absolute left-0 right-0 top-full mt-1.5 max-h-72 overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl z-50 p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-100">
              {FONT_OPTIONS.map((font) => {
                const isSelected = (formData.fontFamily || "inter") === font.id;
                return (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => {
                      const updated = { ...formData, fontFamily: font.id };
                      setFormData(updated);
                      onSaveSettings(updated);
                      setIsFontDropdownOpen(false);
                    }}
                    className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? "bg-blue-500/15 text-blue-300 font-semibold"
                        : "text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{font.name}</div>
                      <div className="text-[10px] text-[var(--muted)] truncate flex items-center gap-2">
                        <span>{font.desc}</span>
                        <span className="text-blue-400 font-mono hidden xs:inline">{font.sample}</span>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-400 flex-shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
