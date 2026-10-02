"use client";

import React, { useState } from "react";
import {
  Plug,
  MagnifyingGlass as Search,
  X,
} from "@phosphor-icons/react";
import { AppSettings, PluginItem } from "@/lib/types";
import { DEFAULT_PLUGINS } from "@/lib/directoryData";

interface PluginsTabProps {
  formData: AppSettings;
  setFormData: React.Dispatch<React.SetStateAction<AppSettings>>;
  onSaveSettings: (newSettings: AppSettings) => void;
}

export const PluginsTab: React.FC<PluginsTabProps> = ({
  formData,
  setFormData,
  onSaveSettings,
}) => {
  const [pluginSearch, setPluginSearch] = useState("");
  const [pluginCategory, setPluginCategory] = useState<"All" | "Anthropic" | "Partners">("All");

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

  const filteredPlugins = currentPlugins.filter((plugin) => {
    const matchesCategory =
      pluginCategory === "All" ||
      (pluginCategory === "Anthropic" && (plugin.category === "Anthropic" || !plugin.category)) ||
      (pluginCategory === "Partners" && plugin.category === "Partners");

    const matchesSearch =
      plugin.name.toLowerCase().includes(pluginSearch.toLowerCase()) ||
      plugin.description.toLowerCase().includes(pluginSearch.toLowerCase()) ||
      plugin.author.toLowerCase().includes(pluginSearch.toLowerCase()) ||
      plugin.skillsIncluded?.some((s) => s.toLowerCase().includes(pluginSearch.toLowerCase()));

    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
            <Plug className="w-4 h-4 text-emerald-400" />
            <span>Plugins & Feature Suites</span>
          </h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Enable specialized capabilities and tool suites injected directly into system prompts and model context.
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--sidebar-bg)] p-1 rounded-xl border border-[var(--card-border)] self-start sm:self-auto">
          {(["All", "Anthropic", "Partners"] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setPluginCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                pluginCategory === cat
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-2xs"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative flex items-center w-full">
        <Search className="absolute left-3 w-4 h-4 text-[var(--muted)] pointer-events-none" />
        <input
          type="text"
          value={pluginSearch}
          onChange={(e) => setPluginSearch(e.target.value)}
          placeholder="Search plugins by name, author, or capabilities..."
          className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all shadow-2xs"
        />
        {pluginSearch && (
          <button
            type="button"
            onClick={() => setPluginSearch("")}
            className="absolute right-2.5 p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Plugins Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredPlugins.map((plugin) => (
          <div
            key={plugin.id}
            className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] flex flex-col justify-between hover:border-[var(--muted)]/40 transition-all shadow-2xs"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-xs text-[var(--foreground)] flex items-center gap-1.5">
                    <span>{plugin.name}</span>
                    {plugin.installed && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--muted)] pt-0.5">
                    By {plugin.author} • {plugin.category || "Anthropic"}
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={plugin.installed}
                    onChange={() => handleTogglePlugin(plugin.id)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-[var(--card-border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              <p className="text-[11px] text-[var(--muted)] line-clamp-3 leading-relaxed">
                {plugin.description}
              </p>
            </div>

            {plugin.skillsIncluded && plugin.skillsIncluded.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-2.5 mt-2 border-t border-[var(--card-border)]/50">
                {plugin.skillsIncluded.map((sk) => (
                  <span
                    key={sk}
                    className="px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--muted)]"
                  >
                    #{sk}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
