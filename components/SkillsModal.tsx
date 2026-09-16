"use client";

import React, { useState } from "react";
import { X, Lightning as Zap, Sparkle as Sparkles, Plus, Trash as Trash2, Check, Globe, CodeSimple as Code2, ChartBar as BarChart3, FileText, ShieldWarning as ShieldAlert, Translate as Languages, GraduationCap, Palette, Stack as Layers, Question as HelpCircle, ArrowSquareOut as ExternalLink } from "@phosphor-icons/react";
import { Skill } from "@/lib/types";

interface SkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  skills: Skill[];
  onSaveSkills: (updatedSkills: Skill[]) => void;
}

const ICON_MAP: Record<string, any> = {
  Globe,
  Code2,
  BarChart3,
  FileText,
  ShieldAlert,
  Languages,
  GraduationCap,
  Palette,
  Sparkles,
};

export const SkillsModal: React.FC<SkillsModalProps> = ({
  isOpen,
  onClose,
  skills,
  onSaveSkills,
}) => {
  const [skillList, setSkillList] = useState<Skill[]>(skills);
  const [isCreating, setIsCreating] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");
  const [newSkillPrompt, setNewSkillPrompt] = useState("");
  const [newSkillTags, setNewSkillTags] = useState("");

  if (!isOpen) return null;

  const handleToggleSkill = (id: string) => {
    const updated = skillList.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
    setSkillList(updated);
    onSaveSkills(updated);
  };

  const handleAddCustomSkill = () => {
    if (!newSkillName.trim() || !newSkillPrompt.trim()) return;

    const newSkill: Skill = {
      id: `skill_custom_${Date.now()}`,
      name: newSkillName.trim(),
      description: newSkillDesc.trim() || "Custom Internet AI Skill",
      icon: "Sparkles",
      systemPrompt: newSkillPrompt.trim(),
      tags: newSkillTags
        ? newSkillTags.split(",").map((t) => t.trim()).filter(Boolean)
        : ["Custom", "Internet"],
      enabled: true,
      isCustom: true,
    };

    const updated = [newSkill, ...skillList];
    setSkillList(updated);
    onSaveSkills(updated);

    // Reset form
    setNewSkillName("");
    setNewSkillDesc("");
    setNewSkillPrompt("");
    setNewSkillTags("");
    setIsCreating(false);
  };

  const handleDeleteSkill = (id: string) => {
    const updated = skillList.filter((s) => s.id !== id);
    setSkillList(updated);
    onSaveSkills(updated);
  };

  const activeCount = skillList.filter((s) => s.enabled).length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-3xl bg-[var(--card-bg)] text-[var(--foreground)] rounded-t-3xl sm:rounded-2xl border-t sm:border border-[var(--card-border)] shadow-2xl overflow-hidden flex flex-col z-10 max-h-[92dvh] sm:max-h-[85vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--sidebar-border)] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-xs">
              <Zap className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                Agentic Skills & Capabilities Hub
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  {activeCount} Active
                </span>
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Inject specialized Claude & Agent skills into both Local Ollama and Cloud models.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="p-3 bg-[var(--sidebar-bg)] border-b border-[var(--sidebar-border)] flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-[var(--muted)]">
            Active skills are automatically composed into every prompt.
          </span>
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {isCreating ? "Cancel" : "Add Custom Skill"}
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3 touch-scroll">
          {/* Create Custom Skill Form */}
          {isCreating && (
            <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-amber-500/30 shadow-md space-y-3 animate-in fade-in zoom-in-95">
              <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> Add Skill from Internet / Prompt Repository
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  placeholder="Skill Name (e.g. Prompt Optimizer)"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={newSkillTags}
                  onChange={(e) => setNewSkillTags(e.target.value)}
                  placeholder="Tags comma separated (e.g. Writing, SEO)"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
              <input
                type="text"
                value={newSkillDesc}
                onChange={(e) => setNewSkillDesc(e.target.value)}
                placeholder="Short Description..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              <textarea
                value={newSkillPrompt}
                onChange={(e) => setNewSkillPrompt(e.target.value)}
                placeholder="Paste the skill system prompt or Claude instructions here..."
                className="w-full p-3 text-xs font-mono rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-2 focus:ring-amber-500 focus:outline-none resize-y min-h-[90px]"
              />
              <button
                onClick={handleAddCustomSkill}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md transition-all cursor-pointer"
              >
                Save & Enable Skill
              </button>
            </div>
          )}

          {/* Skills Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {skillList.map((skill) => {
              const IconComp = ICON_MAP[skill.icon || "Sparkles"] || Sparkles;
              return (
                <div
                  key={skill.id}
                  onClick={() => handleToggleSkill(skill.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                    skill.enabled
                      ? "bg-amber-500/10 border-amber-500/40 shadow-xs ring-1 ring-amber-500/20"
                      : "bg-[var(--sidebar-bg)] border-[var(--card-border)] hover:border-[var(--card-border)] hover:bg-[var(--sidebar-hover)]"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                            skill.enabled
                              ? "bg-amber-500 text-white shadow-xs"
                              : "bg-[var(--card-bg)] text-[var(--muted)] border border-[var(--card-border)]"
                          }`}
                        >
                          <IconComp className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold text-[var(--foreground)]">{skill.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={skill.enabled}
                          onChange={() => {}}
                          className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                        />
                        {skill.isCustom && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSkill(skill.id);
                            }}
                            className="p-1 text-[var(--muted)] hover:text-rose-400"
                            title="Delete custom skill"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-[var(--muted)] leading-relaxed">{skill.description}</p>
                  </div>

                  {skill.tags && skill.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2.5 pt-2 border-t border-[var(--card-border)]/50">
                      {skill.tags.map((t, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.2 rounded-md bg-[var(--card-bg)] border border-[var(--card-border)] text-[9px] text-[var(--muted)] font-medium"
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
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] flex items-center justify-between flex-shrink-0">
          <span className="text-[11px] text-[var(--muted)] font-mono">
            {activeCount} / {skillList.length} skills active
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
