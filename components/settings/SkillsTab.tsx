"use client";

import React, { useState } from "react";
import {
  Plus,
  Trash as Trash2,
  MagnifyingGlass as Search,
  X,
} from "@phosphor-icons/react";
import { AppSettings, Skill } from "@/lib/types";
import { DEFAULT_SKILLS } from "@/lib/skills";

interface SkillsTabProps {
  formData: AppSettings;
  setFormData: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const SkillsTab: React.FC<SkillsTabProps> = ({
  formData,
  setFormData,
}) => {
  const [skillSearch, setSkillSearch] = useState("");
  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");
  const [newSkillPrompt, setNewSkillPrompt] = useState("");

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

  return (
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
        >
        </input>
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
      <div className="space-y-2 pr-1">
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
  );
};
