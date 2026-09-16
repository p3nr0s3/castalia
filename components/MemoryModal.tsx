"use client";

import React, { useState } from "react";
import { X, ArrowCounterClockwise as RotateCcw, Sparkle as Sparkles, ArrowUp, Download, Trash as Trash2, PencilSimple as Edit2, Check, Plus, Info, ShieldWarning as ShieldAlert, Brain } from "@phosphor-icons/react";
import { MemoryConfig, MemoryItem } from "@/lib/types";

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  memory: MemoryConfig;
  onSaveMemory: (updated: MemoryConfig) => void;
}

export const MemoryModal: React.FC<MemoryModalProps> = ({
  isOpen,
  onClose,
  memory,
  onSaveMemory,
}) => {
  const [generateFromChats, setGenerateFromChats] = useState(memory.generateFromChats ?? true);
  const [includeSensitive, setIncludeSensitive] = useState(memory.includeSensitive ?? false);
  const [items, setItems] = useState<MemoryItem[]>(memory.items || []);

  const [inputCommand, setInputCommand] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState("");

  // Sync state if prop changes
  React.useEffect(() => {
    if (isOpen) {
      setGenerateFromChats(memory.generateFromChats ?? true);
      setIncludeSensitive(memory.includeSensitive ?? false);
      setItems(memory.items || []);
    }
  }, [isOpen, memory]);

  if (!isOpen) return null;

  const saveConfig = (newItems: MemoryItem[], gen = generateFromChats, sens = includeSensitive) => {
    setItems(newItems);
    onSaveMemory({
      generateFromChats: gen,
      includeSensitive: sens,
      items: newItems,
    });
  };

  const handleToggleGenerate = () => {
    const next = !generateFromChats;
    setGenerateFromChats(next);
    saveConfig(items, next, includeSensitive);
  };

  const handleToggleSensitive = () => {
    const next = !includeSensitive;
    setIncludeSensitive(next);
    saveConfig(items, generateFromChats, next);
  };

  const handleDeleteItem = (id: string) => {
    const updated = items.filter((i) => i.id !== id);
    saveConfig(updated);
  };

  const handleStartEdit = (item: MemoryItem) => {
    setEditingItemId(item.id);
    setEditTitle(item.title);
    setEditContent(item.content);
  };

  const handleSaveEdit = (id: string) => {
    const updated = items.map((i) =>
      i.id === id
        ? {
            ...i,
            title: editTitle.trim() || i.title,
            content: editContent.trim() || i.content,
            updatedAt: Date.now(),
          }
        : i
    );
    setEditingItemId(null);
    saveConfig(updated);
  };

  // Natural language conversational command handler matching Screenshot 4
  const handleProcessNaturalLanguageMemory = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const prompt = inputCommand.trim();
    if (!prompt) return;

    const lower = prompt.toLowerCase();

    // Check if delete command
    if (lower.startsWith("hapus") || lower.startsWith("delete") || lower.startsWith("remove")) {
      const target = lower.replace(/^(hapus|delete|remove)\s+/i, "").trim();
      const updated = items.filter(
        (i) => !i.title.toLowerCase().includes(target) && !i.content.toLowerCase().includes(target)
      );
      saveConfig(updated);
      setInputCommand("");
      return;
    }

    // Check if updating preferences
    if (lower.includes("prefer") || lower.includes("respond") || lower.includes("gaya") || lower.includes("bahasa")) {
      const existing = items.find((i) => i.category === "preference");
      if (existing) {
        const updated = items.map((i) =>
          i.id === existing.id
            ? { ...i, content: `${i.content}; ${prompt}`, updatedAt: Date.now() }
            : i
        );
        saveConfig(updated);
      } else {
        const newItem: MemoryItem = {
          id: `mem_${Date.now()}`,
          category: "preference",
          title: "Preferences",
          content: prompt,
          updatedAt: Date.now(),
          enabled: true,
        };
        saveConfig([...items, newItem]);
      }
      setInputCommand("");
      return;
    }

    // Check if updating profile
    if (lower.includes("saya") || lower.includes("pekerjaan") || lower.includes("role") || lower.includes("kerja di")) {
      const existing = items.find((i) => i.category === "profile");
      if (existing) {
        const updated = items.map((i) =>
          i.id === existing.id ? { ...i, content: prompt, updatedAt: Date.now() } : i
        );
        saveConfig(updated);
      } else {
        const newItem: MemoryItem = {
          id: `mem_${Date.now()}`,
          category: "profile",
          title: "Profile",
          content: prompt,
          updatedAt: Date.now(),
          enabled: true,
        };
        saveConfig([...items, newItem]);
      }
      setInputCommand("");
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
    saveConfig([...items, newItem]);
    setInputCommand("");
  };

  const handleExportLegacyMemory = () => {
    const dataStr = JSON.stringify(items, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ollama-memory-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(importText);
      if (Array.isArray(parsed)) {
        saveConfig([...parsed, ...items]);
        setIsImportModalOpen(false);
        setImportText("");
      } else if (parsed.items && Array.isArray(parsed.items)) {
        saveConfig([...parsed.items, ...items]);
        setIsImportModalOpen(false);
        setImportText("");
      }
    } catch {
      alert("Invalid JSON format. Please paste valid memory JSON.");
    }
  };

  const youItems = items.filter((i) => i.category === "preference" || i.category === "profile");
  const topicItems = items.filter((i) => i.category === "topic");

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `Updated ${months[d.getMonth()]} ${d.getDate()}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl h-[88vh] max-h-[750px] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-[var(--foreground)]">
        {/* Header matching Screenshot 4 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            <h2 className="font-serif text-xl font-bold tracking-tight text-[var(--foreground)]">
              Memory
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 touch-scroll">
          {/* Top Toggles Section matching Screenshot 4 */}
          <div className="space-y-4">
            {/* Toggle 1: Generate memory from chats */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <div className="font-semibold text-sm text-[var(--foreground)]">
                  Generate memory from chats
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Allow Ollama to generate and refine persistent memories from your conversations.
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleGenerate}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  generateFromChats ? "bg-blue-600" : "bg-neutral-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    generateFromChats ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Toggle 2: Include sensitive topics */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <div className="font-semibold text-sm text-[var(--foreground)]">
                  Include sensitive topics in memory
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Allow Ollama to save details about sensitive topics like health conditions or personal beliefs to memory.
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleSensitive}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  includeSensitive ? "bg-blue-600" : "bg-neutral-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    includeSensitive ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Row 3: Import memory from other AI providers */}
            <div className="flex items-start justify-between gap-4 pt-1">
              <div className="space-y-0.5">
                <div className="font-semibold text-sm text-[var(--foreground)]">
                  Import memory from other AI providers
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Bring relevant context and memories from ChatGPT, Claude, or Cursor into Ollama.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-[var(--sidebar-hover)] hover:bg-[var(--card-border)] text-xs font-semibold text-[var(--foreground)] transition-colors cursor-pointer flex-shrink-0"
              >
                Start import
              </button>
            </div>
          </div>

          {/* Banner matching Screenshot 4 */}
          <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--muted)] flex items-center justify-between gap-2">
            <span>
              All persistent memories are saved locally in your active workspace and injected into Ollama&apos;s system prompt.
            </span>
            <button
              onClick={handleExportLegacyMemory}
              className="font-semibold text-[var(--foreground)] hover:text-blue-400 underline transition-colors cursor-pointer flex-shrink-0"
            >
              Export memory
            </button>
          </div>

          {/* SECTION: YOU matching Screenshot 4 */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              You
            </div>

            <div className="divide-y divide-[var(--card-border)]/60 rounded-2xl bg-[var(--sidebar-bg)]/40 border border-[var(--card-border)] overflow-hidden">
              {youItems.length === 0 ? (
                <div className="p-4 text-xs text-[var(--muted)] italic">
                  No profile or preferences defined yet. Type below to set your role or response style.
                </div>
              ) : (
                youItems.map((item) => {
                  const isEditing = editingItemId === item.id;
                  return (
                    <div
                      key={item.id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[var(--sidebar-hover)]/30 transition-colors group"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1 pr-2">
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full px-2 py-1 text-xs font-semibold rounded bg-[var(--card-bg)] border border-[var(--card-border)]"
                            />
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={2}
                              className="w-full px-2 py-1 text-xs rounded bg-[var(--card-bg)] border border-[var(--card-border)]"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveEdit(item.id)}
                                className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 text-white rounded-lg cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingItemId(null)}
                                className="px-2.5 py-1 text-[11px] text-[var(--muted)] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="font-semibold text-xs text-[var(--foreground)]">
                              {item.title}
                            </div>
                            <div className="text-xs text-[var(--muted)] line-clamp-2">
                              {item.content}
                            </div>
                          </>
                        )}
                      </div>

                      {!isEditing && (
                        <div className="flex items-center gap-3 flex-shrink-0 text-[11px] text-[var(--muted)]">
                          <span>{formatDate(item.updatedAt)}</span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleStartEdit(item)}
                              className="p-1 hover:text-[var(--foreground)] cursor-pointer"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1 hover:text-rose-400 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* SECTION: TOPICS matching Screenshot 4 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              <span>Topics</span>
              <button
                onClick={() => {
                  const title = prompt("Topic Name (e.g. Infrastructure, Database, Cloud):");
                  if (!title) return;
                  const content = prompt("Topic details / context:") || "";
                  const newItem: MemoryItem = {
                    id: `mem_topic_${Date.now()}`,
                    category: "topic",
                    title: title.trim(),
                    content: content.trim(),
                    updatedAt: Date.now(),
                    enabled: true,
                  };
                  saveConfig([...items, newItem]);
                }}
                className="flex items-center gap-1 font-normal text-blue-400 hover:text-blue-300 cursor-pointer capitalize"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add topic</span>
              </button>
            </div>

            <div className="divide-y divide-[var(--card-border)]/60 rounded-2xl bg-[var(--sidebar-bg)]/40 border border-[var(--card-border)] overflow-hidden">
              {topicItems.length === 0 ? (
                <div className="p-4 text-xs text-[var(--muted)] italic">
                  No topic memories stored yet. Add topics or use the chat bar below.
                </div>
              ) : (
                topicItems.map((item) => {
                  const isEditing = editingItemId === item.id;
                  return (
                    <div
                      key={item.id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[var(--sidebar-hover)]/30 transition-colors group"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1 pr-2">
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full px-2 py-1 text-xs font-semibold rounded bg-[var(--card-bg)] border border-[var(--card-border)]"
                            />
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={2}
                              className="w-full px-2 py-1 text-xs rounded bg-[var(--card-bg)] border border-[var(--card-border)]"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveEdit(item.id)}
                                className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 text-white rounded-lg cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingItemId(null)}
                                className="px-2.5 py-1 text-[11px] text-[var(--muted)] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="font-semibold text-xs text-[var(--foreground)]">
                              {item.title}
                            </div>
                            <div className="text-xs text-[var(--muted)] line-clamp-2">
                              {item.content}
                            </div>
                          </>
                        )}
                      </div>

                      {!isEditing && (
                        <div className="flex items-center gap-3 flex-shrink-0 text-[11px] text-[var(--muted)]">
                          <span>{formatDate(item.updatedAt)}</span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleStartEdit(item)}
                              className="p-1 hover:text-[var(--foreground)] cursor-pointer"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1 hover:text-rose-400 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Bottom Conversational Quick-Input matching Screenshot 4 */}
        <div className="p-4 border-t border-[var(--card-border)] bg-[var(--sidebar-bg)]/70 flex-shrink-0">
          <form
            onSubmit={handleProcessNaturalLanguageMemory}
            className="relative flex items-center"
          >
            <input
              type="text"
              value={inputCommand}
              onChange={(e) => setInputCommand(e.target.value)}
              placeholder="Tell Ollama what to change or remove"
              className="w-full pl-4 pr-12 py-2.5 text-xs sm:text-sm rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted)] transition-colors shadow-xs"
            />
            <button
              type="submit"
              disabled={!inputCommand.trim()}
              className="absolute right-2 p-1.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 text-white transition-colors cursor-pointer"
              title="Apply memory update"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* --- Import Memory Dialog --- */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="relative w-full max-w-lg bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-6 shadow-2xl space-y-4 text-[var(--foreground)]">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
              <h3 className="font-semibold text-base">Import Memory JSON</h3>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--muted)]">
              Paste memory JSON exported from ChatGPT, Claude, or our backup format below:
            </p>

            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={8}
              placeholder='[{"category": "profile", "title": "Role", "content": "Cybersecurity Specialist"}]'
              className="w-full p-3 text-xs font-mono rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] focus:outline-none"
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--card-border)]">
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Cancel
              </button>
              <button
                onClick={handleImportJson}
                disabled={!importText.trim()}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
              >
                Import Memories
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
