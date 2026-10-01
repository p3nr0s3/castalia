"use client";

import { CaretDown as ChevronDown, Check, Palette } from "@phosphor-icons/react";
import { DEFAULT_CUSTOM_THEME } from "@/lib/constants";
import { CUSTOM_THEME_PRESETS, FONT_OPTIONS, THEME_OPTIONS } from "./shared";
import type { SettingsCtx } from "../SettingsModal";

export function PersonalizationSection({ ctx }: { ctx: SettingsCtx }) {
  const {
    fontDropdownRef,
    formData,
    isFontDropdownOpen,
    isThemeDropdownOpen,
    onSaveSettings,
    setFormData,
    setIsFontDropdownOpen,
    setIsThemeDropdownOpen,
    themeDropdownRef,
  } = ctx;
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
}
