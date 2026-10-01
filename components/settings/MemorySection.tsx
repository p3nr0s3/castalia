"use client";

import { Brain, Upload, Download, Plus, Sparkle as Sparkles, PencilSimple as Edit2, X, Trash as Trash2 } from "@phosphor-icons/react";
import type { SettingsCtx } from "../SettingsModal";

export function MemorySection({ ctx }: { ctx: SettingsCtx }) {
  const {
    currentMemory,
    editMemContent,
    editMemTitle,
    editingMemoryItem,
    handleCreateCustomMemory,
    handleDeleteMemoryItem,
    handleExportMemory,
    handleImportMemoryJson,
    handleProcessNaturalLanguageMemory,
    handleSaveEditMemory,
    handleStartEditMemory,
    handleToggleGenerateMemory,
    handleToggleSensitiveMemory,
    importMemText,
    isAddingCustomMem,
    isImportMemOpen,
    memoryInput,
    memoryItems,
    newMemCategory,
    newMemContent,
    newMemTitle,
    setEditMemContent,
    setEditMemTitle,
    setEditingMemoryItem,
    setImportMemText,
    setIsAddingCustomMem,
    setIsImportMemOpen,
    setMemoryInput,
    setNewMemCategory,
    setNewMemContent,
    setNewMemTitle,
  } = ctx;
  return (
<div className="space-y-5 animate-in fade-in duration-150">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                      <Brain className="w-4 h-4 text-purple-400" />
                      <span>Persistent Memory & Context</span>
                    </h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      Manage user profile facts, preferences, and topic knowledge preserved across chat sessions.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setIsImportMemOpen(true)}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[var(--sidebar-bg)] border border-[var(--card-border)] hover:bg-[var(--sidebar-hover)] text-[var(--foreground)] transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[var(--muted)]" />
                      <span>Import</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportMemory}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[var(--sidebar-bg)] border border-[var(--card-border)] hover:bg-[var(--sidebar-hover)] text-[var(--foreground)] transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-[var(--muted)]" />
                      <span>Export</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingCustomMem(!isAddingCustomMem)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-500/15 hover:bg-purple-500/25 text-purple-400 border border-purple-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Memory</span>
                    </button>
                  </div>
                </div>

                {/* Global Memory Behavior Toggles */}
                <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-[var(--foreground)]">
                        Generate Memory from Chats
                      </div>
                      <div className="text-[11px] text-[var(--muted)]">
                        Allow models to automatically synthesize and refine persistent context from conversations.
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={currentMemory.generateFromChats ?? true}
                        onChange={handleToggleGenerateMemory}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[var(--card-border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
                    </label>
                  </div>

                  <div className="border-t border-[var(--card-border)]/50 pt-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-[var(--foreground)]">
                        Include Sensitive Context
                      </div>
                      <div className="text-[11px] text-[var(--muted)]">
                        Retain confidential user identifiers, keys, and workspace paths in memory.
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={currentMemory.includeSensitive ?? false}
                        onChange={handleToggleSensitiveMemory}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[var(--card-border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
                    </label>
                  </div>
                </div>

                {/* Natural Language Memory Input Form */}
                <form
                  onSubmit={handleProcessNaturalLanguageMemory}
                  className="relative flex items-center w-full"
                >
                  <Sparkles className="absolute left-3 w-4 h-4 text-purple-400 pointer-events-none" />
                  <input
                    type="text"
                    value={memoryInput}
                    onChange={(e) => setMemoryInput(e.target.value)}
                    placeholder="Tell Ollama what to remember (e.g. 'Saya seorang software engineer', 'Prefer jawaban ringkas', 'Hapus <topik>')..."
                    className="w-full pl-9 pr-24 py-2.5 text-xs rounded-xl border border-purple-500/30 bg-[var(--sidebar-bg)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all shadow-2xs"
                  />
                  <button
                    type="submit"
                    disabled={!memoryInput.trim()}
                    className="absolute right-1.5 px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
                  >
                    Remember
                  </button>
                </form>

                {/* Manual Add Memory Item Form */}
                {isAddingCustomMem && (
                  <form
                    onSubmit={handleCreateCustomMemory}
                    className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-purple-500/30 space-y-3 animate-in fade-in duration-150"
                  >
                    <div className="text-xs font-bold text-purple-400">Add Manual Memory Item</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Memory Title (e.g. Work Background or Coding Style)"
                        value={newMemTitle}
                        onChange={(e) => setNewMemTitle(e.target.value)}
                        required
                        className="px-3 py-1.5 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none"
                      />
                      <select
                        value={newMemCategory}
                        onChange={(e) => setNewMemCategory(e.target.value as any)}
                        className="px-3 py-1.5 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none"
                      >
                        <option value="profile">Category: Profile (Who you are)</option>
                        <option value="preference">Category: Preference (How AI responds)</option>
                        <option value="topic">Category: Topic (Project or Domain fact)</option>
                      </select>
                    </div>
                    <textarea
                      placeholder="Memory content or instructions to remember..."
                      value={newMemContent}
                      onChange={(e) => setNewMemContent(e.target.value)}
                      required
                      rows={2}
                      className="w-full p-2.5 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsAddingCustomMem(false)}
                        className="px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3.5 py-1 text-xs font-semibold rounded-xl bg-purple-500 text-white hover:bg-purple-400 transition-colors cursor-pointer"
                      >
                        Save Memory Item
                      </button>
                    </div>
                  </form>
                )}

                {/* Edit Memory Modal */}
                {editingMemoryItem && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 animate-in fade-in duration-150">
                    <div className="relative w-full max-w-md bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl p-5 space-y-3 text-[var(--foreground)]">
                      <div className="flex items-center justify-between pb-2 border-b border-[var(--card-border)]">
                        <div className="font-bold text-xs flex items-center gap-1.5">
                          <Edit2 className="w-3.5 h-3.5 text-purple-400" />
                          <span>Edit Memory Item</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingMemoryItem(null)}
                          className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)]"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">Title</label>
                          <input
                            type="text"
                            value={editMemTitle}
                            onChange={(e) => setEditMemTitle(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--foreground)] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">Content</label>
                          <textarea
                            rows={3}
                            value={editMemContent}
                            onChange={(e) => setEditMemContent(e.target.value)}
                            className="w-full p-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--foreground)] focus:outline-none text-xs"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--card-border)]">
                        <button
                          type="button"
                          onClick={() => setEditingMemoryItem(null)}
                          className="px-3 py-1.5 rounded-xl text-xs text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveEditMemory}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-xs"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Import Memory JSON Modal */}
                {isImportMemOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 animate-in fade-in duration-150">
                    <div className="relative w-full max-w-md bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl p-5 space-y-3 text-[var(--foreground)]">
                      <div className="flex items-center justify-between pb-2 border-b border-[var(--card-border)]">
                        <div className="font-bold text-xs flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5 text-purple-400" />
                          <span>Import Memory JSON</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsImportMemOpen(false)}
                          className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)]"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-2 text-xs">
                        <p className="text-[11px] text-[var(--muted)]">
                          Paste an exported memory JSON array or object to append items to your memory store.
                        </p>
                        <textarea
                          rows={6}
                          value={importMemText}
                          onChange={(e) => setImportMemText(e.target.value)}
                          placeholder='[{"category":"profile","title":"Profile","content":"..."}, ...]'
                          className="w-full p-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] text-[var(--foreground)] font-mono text-[11px] focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--card-border)]">
                        <button
                          type="button"
                          onClick={() => setIsImportMemOpen(false)}
                          className="px-3 py-1.5 rounded-xl text-xs text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleImportMemoryJson}
                          disabled={!importMemText.trim()}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white cursor-pointer shadow-xs"
                        >
                          Import Memory
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Memory Items: You (Profile & Preferences) */}
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] px-1">
                    Profile & Preferences (You)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {memoryItems
                      .filter((i) => i.category === "profile" || i.category === "preference")
                      .map((item) => (
                        <div
                          key={item.id}
                          className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] flex flex-col justify-between hover:border-[var(--muted)]/40 transition-all shadow-2xs"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-xs text-[var(--foreground)]">
                                {item.title}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditMemory(item)}
                                  className="p-1 rounded-lg text-[var(--muted)] hover:text-purple-400 transition-colors cursor-pointer"
                                  title="Edit"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMemoryItem(item.id)}
                                  className="p-1 rounded-lg text-[var(--muted)] hover:text-rose-400 transition-colors cursor-pointer"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-[var(--muted)] leading-relaxed">
                              {item.content}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Memory Items: Topics & Knowledge Contexts */}
                <div className="space-y-2 pt-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] px-1">
                    Topic Contexts & Facts
                  </div>
                  {memoryItems.filter((i) => i.category === "topic").length === 0 ? (
                    <div className="p-4 text-center text-xs text-[var(--muted)] italic rounded-2xl border border-dashed border-[var(--card-border)]">
                      No topic memories saved yet. Use the prompt box above or talk to Ollama to add topics.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {memoryItems
                        .filter((i) => i.category === "topic")
                        .map((item) => (
                          <div
                            key={item.id}
                            className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] flex flex-col justify-between hover:border-[var(--muted)]/40 transition-all shadow-2xs"
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-xs text-[var(--foreground)]">
                                  {item.title}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditMemory(item)}
                                    className="p-1 rounded-lg text-[var(--muted)] hover:text-purple-400 transition-colors cursor-pointer"
                                    title="Edit"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMemoryItem(item.id)}
                                    className="p-1 rounded-lg text-[var(--muted)] hover:text-rose-400 transition-colors cursor-pointer"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-[var(--muted)] leading-relaxed">
                                {item.content}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
  );
}
