"use client";

import React, { useState, useEffect, useMemo } from "react";
import { BookOpenText, Plus, MagnifyingGlass as Search, Funnel as Filter, Trash as Trash2, PencilSimpleLine as Edit3, Check, X, Sparkle as Sparkles, ArrowLeft, CaretRight as ChevronRight, ArrowSquareOut as ExternalLink, Copy, CalendarBlank as Calendar, CheckSquare, Square, Tag, Folder, Faders as Sliders, Columns as Columns3, ListMagnifyingGlass as ListFilter, Eye, FileCode, ListChecks as ListTodo, Smiley as Smile, Palette, Clock, ArrowsDownUp as ArrowUpDown, BookmarkSimple as BookMarked, Lightbulb, Target, Rocket, Coffee, SidebarSimple as PanelLeft, CaretLineLeft as PanelLeftClose, ArrowsOut as Maximize2, ArrowsIn as Minimize2, FileText, LinkSimple as Link2, Printer, Download } from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  JournalEntry,
  JournalCategory,
  JournalStatus,
  JournalPriority,
  JournalChecklistItem,
  Project,
  OllamaModel,
  ApiKeysConfig,
} from "@/lib/types";
import { storage } from "@/lib/storage";
import { apiFetch } from "@/lib/apiClient";

interface JournalViewProps {
  projects: Project[];
  models: OllamaModel[];
  selectedModel: string;
  apiKeys?: ApiKeysConfig;
  onBackToChat: () => void;
  onSendToChat?: (text: string) => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

const CATEGORY_CONFIG: Record<
  JournalCategory,
  { label: string; icon: any; color: string; bg: string; border: string }
> = {
  daily: {
    label: "Catatan Harian",
    icon: BookMarked,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
  task: {
    label: "Target & Tugas",
    icon: Target,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  idea: {
    label: "Ide & Brainstorm",
    icon: Lightbulb,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
  },
  project: {
    label: "Proyek & Riset",
    icon: Rocket,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  quick: {
    label: "Catatan Cepat",
    icon: Coffee,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
  },
};

const STATUS_CONFIG: Record<
  JournalStatus,
  { label: string; color: string; bg: string }
> = {
  draft: { label: "Draft", color: "text-slate-400", bg: "bg-slate-500/15" },
  in_progress: { label: "In Progress", color: "text-blue-400", bg: "bg-blue-500/15" },
  done: { label: "Selesai", color: "text-emerald-400", bg: "bg-emerald-500/15" },
  archived: { label: "Arsip", color: "text-zinc-500", bg: "bg-zinc-500/15" },
};

const PRIORITY_CONFIG: Record<
  JournalPriority,
  { label: string; color: string; dot: string }
> = {
  urgent: { label: "Mendesak", color: "text-rose-400", dot: "bg-rose-500" },
  high: { label: "Tinggi", color: "text-amber-400", dot: "bg-amber-500" },
  medium: { label: "Sedang", color: "text-sky-400", dot: "bg-sky-500" },
  low: { label: "Rendah", color: "text-slate-400", dot: "bg-slate-500" },
};

const COVER_PRESETS = [
  { id: "indigo", name: "Indigo Dusk", gradient: "from-slate-900 via-indigo-950 to-slate-900 border-indigo-500/20" },
  { id: "amber", name: "Sunset Amber", gradient: "from-slate-900 via-amber-950 to-slate-900 border-amber-500/20" },
  { id: "emerald", name: "Forest Emerald", gradient: "from-slate-900 via-emerald-950 to-slate-900 border-emerald-500/20" },
  { id: "purple", name: "Cyberpunk Violet", gradient: "from-slate-900 via-purple-950 to-slate-900 border-purple-500/20" },
  { id: "minimal", name: "Minimal Dark", gradient: "from-zinc-950 via-zinc-900 to-black border-zinc-800" },
];

const EMOJI_PRESETS = ["📓", "🎯", "💡", "🚀", "📝", "⚡", "☕", "🧠", "📅", "🛠️", "🎨", "📊", "🔍", "💻", "🌱", "🔥"];

export const JournalView: React.FC<JournalViewProps> = ({
  projects,
  models,
  selectedModel,
  apiKeys,
  onBackToChat,
  onSendToChat,
  sidebarOpen,
  onToggleSidebar,
}) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"document" | "list" | "board">("document");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Resizable sidebar state with local persistence
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("journal_sidebar_width");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 220 && parsed <= 520) return parsed;
      }
    }
    return 280;
  });

  const handleSidebarWidthChange = (newWidth: number) => {
    setSidebarWidth(newWidth);
    if (typeof window !== "undefined") {
      localStorage.setItem("journal_sidebar_width", newWidth.toString());
    }
  };

  // Full-width canvas fit state with local persistence
  const [isFullWidth, setIsFullWidth] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("journal_full_width") === "true";
    }
    return false;
  });

  const toggleFullWidth = () => {
    setIsFullWidth((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("journal_full_width", String(next));
      }
      return next;
    });
  };

  // Search and Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Document Editor State
  const [previewMode, setPreviewMode] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [newChecklistText, setNewChecklistText] = useState("");
  const [newTagText, setNewTagText] = useState("");

  // Bilateral Linking [[...]] Autocomplete & Export State
  const [linkSearchQuery, setLinkSearchQuery] = useState<string | null>(null);
  const [linkTriggerIndex, setLinkTriggerIndex] = useState<number | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // AI Journal Copilot State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiMode, setAiMode] = useState<"draft" | "todos" | "polish">("draft");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiModel, setAiModel] = useState(selectedModel || "gemma2:9b");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiOutput, setAiOutput] = useState("");

  // Load entries on mount
  useEffect(() => {
    const loaded = storage.getJournalEntries();
    if (loaded.length === 0) {
      const initialEntry: JournalEntry = {
        id: `journal_${Date.now()}`,
        title: "Selamat Datang di Jurnal & Workspace Anda",
        content: `### 📓 Ruang Kerja & Catatan Pribadi Anda

Ini adalah jurnal kerja bergaya Notion terintegrasi 100% lokal. Anda dapat menulis ide, catatan harian, rencana proyek, hingga to-do checklist interaktif.

#### ✨ Fitur Utama:
- **Dokumen Kaya**: Ubah cover banner, ganti ikon emoji sesuka hati, dan tulis dengan format Markdown.
- **To-Do Checklist**: Tambahkan subtask yang dapat dicentang langsung dengan kalkulasi progres visual.
- **Tampilan Multi-View**: Ganti tampilan antara *Halaman Dokumen*, *Tabel Ringkas*, dan *Papan Kanban*.
- **AI Copilot Lokal**: Minta AI merangkum catatan, memecah ide menjadi to-do list, atau membuat draft artikel secara instan.

> [!NOTE]
> Catatan Anda tersimpan aman di mesin lokal (SQLite / localStorage) dan dapat diekspor kapan saja.`,
        icon: "📓",
        coverGradient: COVER_PRESETS[0].gradient,
        category: "daily",
        status: "in_progress",
        priority: "medium",
        tags: ["welcome", "panduan"],
        checklists: [
          { id: "c1", title: "Coba ganti emoji atau cover banner di atas", completed: false },
          { id: "c2", title: "Buat catatan atau ide baru menggunakan tombol +", completed: false },
          { id: "c3", title: "Gunakan AI Copilot untuk menyusun to-do list", completed: false },
        ],
        date: new Date().toISOString().slice(0, 10),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setEntries([initialEntry]);
      setActiveEntryId(initialEntry.id);
      storage.saveJournalEntries([initialEntry]);
    } else {
      setEntries(loaded);
      setActiveEntryId(loaded[0]?.id || null);
    }
  }, []);

  const saveEntries = (updated: JournalEntry[]) => {
    setEntries(updated);
    storage.saveJournalEntries(updated);
  };

  const activeEntry = useMemo(() => {
    return entries.find((e) => e.id === activeEntryId) || entries[0] || null;
  }, [entries, activeEntryId]);

  // Backlinks: Notes referencing the current active entry via [[Title]]
  const backlinks = useMemo(() => {
    if (!activeEntry) return [];
    const currentTitleLower = activeEntry.title.trim().toLowerCase();
    if (!currentTitleLower) return [];

    return entries.filter((other) => {
      if (other.id === activeEntry.id) return false;
      return other.content.toLowerCase().includes(`[[${currentTitleLower}]]`);
    });
  }, [entries, activeEntry]);

  // Bilateral link suggestions matching current query
  const linkSuggestions = useMemo(() => {
    if (linkSearchQuery === null) return [];
    const q = linkSearchQuery.trim().toLowerCase();
    return entries
      .filter((e) => e.id !== activeEntry?.id && (!q || e.title.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [entries, activeEntry?.id, linkSearchQuery]);

  // Pre-process bilateral links [[Title]] into Markdown link tokens
  const processedMarkdown = useMemo(() => {
    if (!activeEntry?.content) return "*Catatan ini masih kosong.*";
    return activeEntry.content.replace(/\[\[(.*?)\]\]/g, (_m, title) => {
      const cleanTitle = title.trim();
      return `[🔗 ${cleanTitle}](#journal-note-${encodeURIComponent(cleanTitle)})`;
    });
  }, [activeEntry?.content]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    updateActiveEntry({ content: val });

    // Check if user recently typed `[[` without a closing `]]`
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastDoubleOpen = textBeforeCursor.lastIndexOf("[[");
    const lastDoubleClose = textBeforeCursor.lastIndexOf("]]");

    if (lastDoubleOpen !== -1 && lastDoubleOpen > lastDoubleClose) {
      const query = textBeforeCursor.slice(lastDoubleOpen + 2);
      if (!query.includes("\n")) {
        setLinkSearchQuery(query);
        setLinkTriggerIndex(lastDoubleOpen);
        return;
      }
    }
    setLinkSearchQuery(null);
    setLinkTriggerIndex(null);
  };

  const handleSelectLinkSuggestion = (targetEntry: JournalEntry) => {
    if (linkTriggerIndex === null || !activeEntry) return;
    const content = activeEntry.content;
    const before = content.slice(0, linkTriggerIndex);
    const afterCursor = content.slice(linkTriggerIndex + 2 + (linkSearchQuery?.length || 0));
    const newContent = `${before}[[${targetEntry.title}]]${afterCursor}`;
    updateActiveEntry({ content: newContent });
    setLinkSearchQuery(null);
    setLinkTriggerIndex(null);
  };

  const handleCreateAndLinkNote = (title: string) => {
    const newEntry: JournalEntry = {
      id: `journ_${Date.now()}`,
      title: title.trim(),
      content: `*Catatan baru dibuat via bilateral link dari [[${activeEntry?.title || "Journal"}]]*\n\n`,
      icon: "📝",
      category: "daily",
      status: "draft",
      priority: "medium",
      tags: [],
      checklists: [],
      date: new Date().toISOString().slice(0, 10),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [newEntry, ...entries];
    saveEntries(updated);
    handleSelectLinkSuggestion(newEntry);
  };

  const handleCreateNoteWithTitle = (title: string) => {
    const newEntry: JournalEntry = {
      id: `journ_${Date.now()}`,
      title: title.trim(),
      content: `*Catatan dibuat otomatis melalui bilateral link dari [[${activeEntry?.title || "Journal"}]]*\n\n`,
      icon: "📓",
      category: "daily",
      status: "draft",
      priority: "medium",
      tags: [],
      checklists: [],
      date: new Date().toISOString().slice(0, 10),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [newEntry, ...entries];
    saveEntries(updated);
    setActiveEntryId(newEntry.id);
  };

  const handleExportSingleMarkdown = () => {
    if (!activeEntry) return;
    const checklistMd = (activeEntry.checklists || [])
      .map((c) => `- [${c.completed ? "x" : " "}] ${c.title}`)
      .join("\n");

    const fileContent = `# ${activeEntry.icon || "📓"} ${activeEntry.title}

- **Kategori:** ${activeEntry.category}
- **Prioritas:** ${activeEntry.priority || "medium"}
- **Status:** ${activeEntry.status}
- **Tags:** ${activeEntry.tags.map((t) => `#${t}`).join(" ") || "-"}
- **Dibuat:** ${new Date(activeEntry.createdAt).toLocaleString("id-ID")}
- **Terakhir Diubah:** ${new Date(activeEntry.updatedAt).toLocaleString("id-ID")}

---

${checklistMd ? `## Checklist & To-Do\n${checklistMd}\n\n---\n\n` : ""}## Catatan
${activeEntry.content}
`;

    const blob = new Blob([fileContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeEntry.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "journal"}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handleExportAllBundle = () => {
    const bundle = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      count: entries.length,
      entries,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workspace-journal-bundle-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  // Create New Journal Entry
  const handleCreateEntry = (category: JournalCategory = "daily") => {
    const newEntry: JournalEntry = {
      id: `journal_${Date.now()}`,
      title: "Catatan Baru Tanpa Judul",
      content: "",
      icon: category === "task" ? "🎯" : category === "idea" ? "💡" : category === "project" ? "🚀" : "📓",
      coverGradient: COVER_PRESETS[Math.floor(Math.random() * COVER_PRESETS.length)].gradient,
      category,
      status: "draft",
      priority: "medium",
      tags: [],
      checklists: [],
      date: new Date().toISOString().slice(0, 10),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = [newEntry, ...entries];
    saveEntries(next);
    setActiveEntryId(newEntry.id);
    setViewMode("document");
    setPreviewMode(false);
  };

  // Update active entry helper
  const updateActiveEntry = (partial: Partial<JournalEntry>) => {
    if (!activeEntry) return;
    const updated = entries.map((e) =>
      e.id === activeEntry.id ? { ...e, ...partial, updatedAt: Date.now() } : e
    );
    saveEntries(updated);
  };

  // Delete entry
  const handleDeleteEntry = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (confirm("Hapus catatan jurnal ini?")) {
      const remaining = entries.filter((item) => item.id !== id);
      saveEntries(remaining);
      if (activeEntryId === id) {
        setActiveEntryId(remaining[0]?.id || null);
      }
    }
  };

  // Duplicate entry
  const handleDuplicateEntry = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const source = entries.find((item) => item.id === id);
    if (!source) return;
    const duplicated: JournalEntry = {
      ...source,
      id: `journal_${Date.now()}`,
      title: `${source.title} (Salinan)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = [duplicated, ...entries];
    saveEntries(next);
    setActiveEntryId(duplicated.id);
  };

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesSearch =
        entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = filterCategory === "all" || entry.category === filterCategory;
      const matchesStatus = filterStatus === "all" || entry.status === filterStatus;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [entries, searchQuery, filterCategory, filterStatus]);

  // Checklist helper
  const handleToggleChecklist = (checklistId: string) => {
    if (!activeEntry) return;
    const updatedChecklists = (activeEntry.checklists || []).map((c) =>
      c.id === checklistId ? { ...c, completed: !c.completed } : c
    );
    updateActiveEntry({ checklists: updatedChecklists });
  };

  const handleAddChecklist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChecklistText.trim() || !activeEntry) return;
    const newItem: JournalChecklistItem = {
      id: `check_${Date.now()}`,
      title: newChecklistText.trim(),
      completed: false,
    };
    updateActiveEntry({ checklists: [...(activeEntry.checklists || []), newItem] });
    setNewChecklistText("");
  };

  const handleDeleteChecklist = (checklistId: string) => {
    if (!activeEntry) return;
    const updated = (activeEntry.checklists || []).filter((c) => c.id !== checklistId);
    updateActiveEntry({ checklists: updated });
  };

  // Tag helper
  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && newTagText.trim() && activeEntry) {
      e.preventDefault();
      const cleanTag = newTagText.trim().replace(/^#/, "");
      if (!activeEntry.tags.includes(cleanTag)) {
        updateActiveEntry({ tags: [...activeEntry.tags, cleanTag] });
      }
      setNewTagText("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!activeEntry) return;
    updateActiveEntry({ tags: activeEntry.tags.filter((t) => t !== tagToRemove) });
  };

  // AI Copilot Execution
  const handleRunAiCopilot = async () => {
    setAiLoading(true);
    setAiOutput("");

    let prompt = "";
    if (aiMode === "draft") {
      prompt = `Anda adalah asisten cerdas Notion. Buat draf dokumen catatan/jurnal komprehensif dalam format Markdown yang rapi berdasarkan topik berikut:
"${aiPrompt || activeEntry?.title || "Perencanaan dan Evaluasi Kerja"}"

Gunakan judul heading (# dan ##), poin-poin terstruktur, kutipan penting (> [!NOTE]), dan berikan juga 3-5 to-do checklist (- [ ] task) yang siap dikerjakan.`;
    } else if (aiMode === "todos") {
      prompt = `Ekstrak dan susunlah action items / to-do checklist yang jelas dan terukur dari catatan berikut:
"${activeEntry?.content || activeEntry?.title}"

Berikan format Markdown checklist to-do:
- [ ] Tugas 1
- [ ] Tugas 2
Dst. Berikan hanya daftar tugas actionable.`;
    } else if (aiMode === "polish") {
      prompt = `Perbaiki tata bahasa, sempurnakan gaya penulisan, dan berikan ringkasan eksekutif 3 poin penting dari tulisan berikut:
"${activeEntry?.content || activeEntry?.title}"`;
    }

    try {
      const res = await apiFetch("/api/ollama/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: aiModel,
          messages: [{ role: "user", content: prompt }],
          stream: false,
        }),
      });

      if (!res.ok) {
        throw new Error(`Gagal menghubungi model (${res.status})`);
      }
      const data = await res.json();
      setAiOutput(data.message?.content || "Tidak ada respons dari AI.");
    } catch (e: any) {
      setAiOutput(`Error AI: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyAiOutput = () => {
    if (!aiOutput || !activeEntry) return;
    if (aiMode === "todos") {
      // Parse checkboxes from output
      const lines = aiOutput.split("\n");
      const extracted: JournalChecklistItem[] = [];
      for (const line of lines) {
        const match = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)$/);
        if (match) {
          extracted.push({
            id: `c_${Date.now()}_${Math.random()}`,
            title: match[2].trim(),
            completed: match[1].toLowerCase() === "x",
          });
        }
      }
      if (extracted.length > 0) {
        updateActiveEntry({ checklists: [...(activeEntry.checklists || []), ...extracted] });
      } else {
        updateActiveEntry({ content: `${activeEntry.content}\n\n### Action Items\n${aiOutput}` });
      }
    } else {
      updateActiveEntry({ content: activeEntry.content ? `${activeEntry.content}\n\n${aiOutput}` : aiOutput });
    }
    setIsAiModalOpen(false);
  };

  // Checklist stats
  const checklistStats = useMemo(() => {
    if (!activeEntry?.checklists || activeEntry.checklists.length === 0) return null;
    const completed = activeEntry.checklists.filter((c) => c.completed).length;
    const total = activeEntry.checklists.length;
    const percent = Math.round((completed / total) * 100);
    return { completed, total, percent };
  }, [activeEntry]);

  return (
    <div className="flex-1 flex flex-col h-[100dvh] w-full bg-[var(--background)] text-[var(--foreground)] overflow-hidden select-text">
      {/* Top Header Bar */}
      <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-1.5 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
              title={sidebarOpen ? "Tutup Sidebar Aplikasi" : "Buka Sidebar Aplikasi"}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onBackToChat}
            className="p-1.5 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
            title="Kembali ke Workspace Chat"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          {!isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-1.5 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer flex items-center gap-1.5 text-xs"
              title="Buka Sidebar Journal"
            >
              <PanelLeft className="w-4 h-4 text-indigo-400" />
              <span className="hidden md:inline font-medium">Sidebar</span>
            </button>
          )}
          <div className="flex items-center gap-2">
            <BookOpenText className="w-5 h-5 text-indigo-400" />
            <h1 className="text-sm font-bold tracking-tight text-[var(--foreground)] hidden sm:inline">
              Workspace Journal
            </h1>
          </div>
        </div>

        {/* View Mode Tabs (Document, List, Kanban Board) */}
        <div className="flex items-center gap-1.5 bg-[var(--card-bg)] p-1 rounded-xl border border-[var(--card-border)]">
          <button
            onClick={() => setViewMode("document")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === "document"
                ? "bg-indigo-600 text-white shadow-2xs"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Halaman</span>
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === "list"
                ? "bg-indigo-600 text-white shadow-2xs"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span>Daftar</span>
          </button>
          <button
            onClick={() => setViewMode("board")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === "board"
                ? "bg-indigo-600 text-white shadow-2xs"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <Columns3 className="w-3.5 h-3.5" />
            <span>Kanban</span>
          </button>
        </div>

        {/* Action Buttons: Full-width toggle, AI Copilot & New Note */}
        <div className="flex items-center gap-2">
          {viewMode === "document" && (
            <button
              onClick={toggleFullWidth}
              className={`p-1.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium ${
                isFullWidth
                  ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-2xs"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
              }`}
              title={isFullWidth ? "Tampilan Tengah (Standar)" : "Tampilan Lebar Penuh (Fit Layar)"}
            >
              {isFullWidth ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Pusat</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Lebar Penuh</span>
                </>
              )}
            </button>
          )}

          {/* PDF / Print Button */}
          {viewMode === "document" && activeEntry && (
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-all cursor-pointer"
              title="Cetak Dokumen atau Simpan PDF"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden md:inline">PDF / Cetak</span>
            </button>
          )}

          {/* Export Menu Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-all cursor-pointer"
              title="Ekspor Dokumen atau Bundle Catatan"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">Ekspor</span>
            </button>
            {showExportMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 mt-1 w-52 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-2xl p-1.5 z-40 space-y-1 text-xs"
              >
                {activeEntry && (
                  <button
                    onClick={handleExportSingleMarkdown}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left hover:bg-[var(--sidebar-hover)] text-[var(--foreground)] transition-colors cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    <div className="truncate">
                      <div className="font-semibold truncate">Catatan Ini (.md)</div>
                      <div className="text-[10px] text-[var(--muted)]">Markdown & Checklist</div>
                    </div>
                  </button>
                )}
                <button
                  onClick={handleExportAllBundle}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left hover:bg-[var(--sidebar-hover)] text-[var(--foreground)] transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <div>
                    <div className="font-semibold">Semua Catatan (.json)</div>
                    <div className="text-[10px] text-[var(--muted)]">Backup {entries.length} Catatan</div>
                  </div>
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => {
              setAiPrompt(activeEntry?.title || "");
              setIsAiModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">AI Copilot</span>
          </button>
          <button
            onClick={() => handleCreateEntry(filterCategory !== "all" ? (filterCategory as JournalCategory) : "daily")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            <span>Catatan Baru</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Area: Internal Sidebar + Active Viewport */}
      <div className="flex-1 flex overflow-hidden">
        {/* Collapsible Left Journal Navigator with Drag Resize (matching Sidebar.tsx structure) */}
        <aside
          className={`relative border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] flex flex-col flex-shrink-0 transition-[width] duration-150 select-none ${
            isSidebarOpen ? "" : "w-0! overflow-hidden border-r-0!"
          }`}
          style={{ width: isSidebarOpen ? `${sidebarWidth}px` : "0px", maxWidth: "85vw" }}
        >
          {/* Draggable resize handle (Desktop) */}
          {isSidebarOpen && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = sidebarWidth;
                const prevCursor = document.body.style.cursor;
                const prevUserSelect = document.body.style.userSelect;
                document.body.style.cursor = "col-resize";
                document.body.style.userSelect = "none";
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const next = Math.min(520, Math.max(220, startWidth + (moveEvent.clientX - startX)));
                  handleSidebarWidthChange(next);
                };
                const handleMouseUp = () => {
                  document.body.style.cursor = prevCursor;
                  document.body.style.userSelect = prevUserSelect;
                  window.removeEventListener("mousemove", handleMouseMove);
                  window.removeEventListener("mouseup", handleMouseUp);
                };
                window.addEventListener("mousemove", handleMouseMove);
                window.addEventListener("mouseup", handleMouseUp);
              }}
              className="hidden md:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500/70 z-20 touch-none translate-x-1/2"
              title="Geser untuk mengatur lebar sidebar"
            />
          )}

          {/* Sidebar Top Brand Header (matching Sidebar.tsx) */}
          <div className="px-4 pt-3.5 pb-2 flex items-center justify-between flex-shrink-0">
            <span className="font-serif text-lg font-bold tracking-tight text-[var(--foreground)] flex items-center gap-2">
              <BookOpenText className="w-4 h-4 text-indigo-400" />
              <span>Journal</span>
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className={`p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer ${
                  isSearchOpen ? "text-[var(--foreground)] bg-[var(--sidebar-hover)]" : ""
                }`}
                title="Cari Catatan"
              >
                <Search className="w-4 h-4" />
              </button>

              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                title="Tutup Sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search Bar (Expandable, matching Sidebar.tsx) */}
          {isSearchOpen && (
            <div className="px-3 pb-2 animate-in fade-in duration-150 flex-shrink-0">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari catatan, tag, ide..."
                  autoFocus
                  className="w-full px-2.5 py-1 text-xs rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Primary Action Button: + Dokumen Baru (matching + New in Sidebar.tsx) */}
          <div className="px-3 py-1 flex-shrink-0">
            <button
              onClick={() => handleCreateEntry(filterCategory !== "all" ? (filterCategory as JournalCategory) : "daily")}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-400 border border-indigo-500/30 transition-all cursor-pointer group shadow-2xs active:scale-98"
              title="Tambah Dokumen Baru"
            >
              <div className="flex items-center gap-2.5">
                <Plus className="w-4 h-4 text-indigo-400 group-hover:rotate-90 transition-transform" />
                <span>+ Dokumen Baru</span>
              </div>
              {filterCategory !== "all" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 capitalize font-medium">
                  {CATEGORY_CONFIG[filterCategory as JournalCategory]?.label.split(" ")[0]}
                </span>
              )}
            </button>
          </div>

          {/* Categories Section (matching Customize / Projects in Sidebar.tsx) */}
          <div className="pt-2 px-2 flex-shrink-0">
            <div className="px-3 py-1 text-[11px] font-semibold text-[var(--muted)] select-none flex items-center justify-between">
              <span>KATEGORI</span>
              <span className="text-[10px] font-mono text-[var(--muted)]">{entries.length} total</span>
            </div>
            <div className="space-y-0.5 mt-0.5">
              {/* All Documents */}
              <button
                onClick={() => setFilterCategory("all")}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer group ${
                  filterCategory === "all"
                    ? "bg-[var(--sidebar-hover)] text-[var(--foreground)] font-semibold"
                    : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <BookOpenText className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Semua Dokumen</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--muted)] font-mono">
                  {entries.length}
                </span>
              </button>

              {/* Categorized Entries with inline '+' button */}
              {(Object.keys(CATEGORY_CONFIG) as JournalCategory[]).map((cat) => {
                const cfg = CATEGORY_CONFIG[cat];
                const IconComp = cfg.icon;
                const count = entries.filter((e) => e.category === cat).length;
                const isSelected = filterCategory === cat;
                return (
                  <div
                    key={cat}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer group ${
                      isSelected
                        ? "bg-[var(--sidebar-hover)] text-[var(--foreground)] font-semibold"
                        : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                    }`}
                    onClick={() => setFilterCategory(cat)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <IconComp className={`w-3.5 h-3.5 ${cfg.color}`} />
                      <span className="truncate">{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreateEntry(cat);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--card-bg)] text-[var(--muted)] hover:text-indigo-400 transition-all"
                        title={`Tambah catatan ${cfg.label}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--muted)] font-mono">
                        {count}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Documents Section Header & List (matching Chats in Sidebar.tsx) */}
          <div className="pt-2 px-2 flex-1 flex flex-col min-h-0">
            <div className="px-3 py-1 text-[11px] font-semibold text-[var(--muted)] select-none flex items-center justify-between flex-shrink-0">
              <span>CATATAN ({filteredEntries.length})</span>
              {filterCategory !== "all" && (
                <button
                  onClick={() => setFilterCategory("all")}
                  className="text-[10px] text-indigo-400 hover:underline cursor-pointer"
                >
                  Lihat Semua
                </button>
              )}
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto space-y-0.5 p-1 touch-scroll">
              {filteredEntries.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-[var(--card-border)] text-center space-y-2 mt-2">
                  <p className="text-xs text-[var(--muted)]">Belum ada dokumen di kategori ini</p>
                  <button
                    onClick={() => handleCreateEntry(filterCategory !== "all" ? (filterCategory as JournalCategory) : "daily")}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 transition-all inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Buat Catatan Baru</span>
                  </button>
                </div>
              ) : (
                filteredEntries.map((entry) => {
                  const isActive = entry.id === activeEntryId;
                  const catCfg = CATEGORY_CONFIG[entry.category] || CATEGORY_CONFIG.daily;
                  const doneCount = (entry.checklists || []).filter((c) => c.completed).length;
                  const totalCount = (entry.checklists || []).length;
                  return (
                    <div
                      key={entry.id}
                      onClick={() => {
                        setActiveEntryId(entry.id);
                        setViewMode("document");
                      }}
                      className={`group p-2 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isActive
                          ? "bg-[var(--sidebar-hover)] text-[var(--foreground)] font-medium border border-indigo-500/30 shadow-2xs"
                          : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="text-sm flex-shrink-0">{entry.icon || "📓"}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs truncate font-medium text-[var(--foreground)]">
                            {entry.title || "Catatan Tanpa Judul"}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[var(--muted)]">
                            <span className="truncate">{catCfg.label.split(" ")[0]}</span>
                            {totalCount > 0 && (
                              <>
                                <span>•</span>
                                <span className={doneCount === totalCount ? "text-emerald-400 font-medium" : ""}>
                                  {doneCount}/{totalCount}
                                </span>
                              </>
                            )}
                            {entry.date && (
                              <>
                                <span>•</span>
                                <span>{entry.date.slice(5)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Hover actions: Duplicate & Delete */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          onClick={(e) => handleDuplicateEntry(entry.id, e)}
                          className="p-1 rounded text-[var(--muted)] hover:text-indigo-400 hover:bg-[var(--card-bg)] transition-colors"
                          title="Duplikasi Catatan"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteEntry(entry.id, e)}
                          className="p-1 rounded text-[var(--muted)] hover:text-rose-400 hover:bg-[var(--card-bg)] transition-colors"
                          title="Hapus Catatan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Bottom append button */}
              <button
                onClick={() => handleCreateEntry(filterCategory !== "all" ? (filterCategory as JournalCategory) : "daily")}
                className="w-full mt-2 py-2 px-3 rounded-xl border border-dashed border-[var(--card-border)] hover:border-indigo-500/50 hover:bg-indigo-500/5 text-[var(--muted)] hover:text-indigo-400 text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Tambah Catatan Baru</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[var(--background)]">
          {/* Document Page View (Notion Canvas) */}
          {viewMode === "document" && activeEntry && (
            <div className="flex-1 overflow-y-auto">
              {/* Cover Banner */}
              <div
                className={`h-36 md:h-44 w-full bg-gradient-to-r ${
                  activeEntry.coverGradient || COVER_PRESETS[0].gradient
                } border-b relative group`}
              >
                <button
                  onClick={() => setShowCoverPicker(!showCoverPicker)}
                  className="absolute bottom-3 right-4 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-black/50 hover:bg-black/70 text-white backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1.5 cursor-pointer"
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span>Ganti Cover</span>
                </button>

                {/* Cover Picker Dropdown */}
                {showCoverPicker && (
                  <div className="absolute bottom-12 right-4 p-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-xl z-20 space-y-2">
                    <div className="text-xs font-bold text-[var(--foreground)]">Pilih Gradien Banner</div>
                    <div className="grid grid-cols-2 gap-2">
                      {COVER_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => {
                            updateActiveEntry({ coverGradient: preset.gradient });
                            setShowCoverPicker(false);
                          }}
                          className={`h-10 w-28 rounded-xl bg-gradient-to-r ${preset.gradient} border text-[10px] font-semibold text-white flex items-center justify-center cursor-pointer hover:scale-105 transition-transform`}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Document Container */}
              <div
                id="journal-printable-doc"
                className={`print-container ${
                  isFullWidth
                    ? "w-full max-w-none px-6 md:px-12 xl:px-16"
                    : "max-w-5xl xl:max-w-6xl w-full mx-auto px-6 md:px-10"
                } py-8 space-y-6 transition-all duration-150`}
              >
                {/* Emoji Icon & Title */}
                <div className="space-y-3">
                  <div className="relative inline-block">
                    <button
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="text-4xl md:text-5xl p-2 rounded-2xl hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                      title="Klik untuk ganti emoji"
                    >
                      {activeEntry.icon || "📓"}
                    </button>

                    {/* Emoji Picker Popover */}
                    {showEmojiPicker && (
                      <div className="absolute top-full left-0 mt-2 p-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-2xl z-30 w-64 space-y-2">
                        <div className="text-xs font-bold text-[var(--foreground)]">Pilih Ikon Emoji</div>
                        <div className="grid grid-cols-6 gap-2">
                          {EMOJI_PRESETS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => {
                                updateActiveEntry({ icon: emoji });
                                setShowEmojiPicker(false);
                              }}
                              className="text-xl p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Title Input */}
                  <input
                    type="text"
                    value={activeEntry.title}
                    onChange={(e) => updateActiveEntry({ title: e.target.value })}
                    placeholder="Judul Catatan..."
                    className="w-full text-2xl md:text-3xl font-bold bg-transparent border-none text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-0"
                  />
                </div>

                {/* Notion Property Metadata Table */}
                <div className="p-4 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  {/* Category */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
                      Kategori
                    </label>
                    <select
                      value={activeEntry.category}
                      onChange={(e) => updateActiveEntry({ category: e.target.value as JournalCategory })}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] font-medium focus:outline-none"
                    >
                      {(Object.keys(CATEGORY_CONFIG) as JournalCategory[]).map((cat) => (
                        <option key={cat} value={cat}>
                          {CATEGORY_CONFIG[cat].label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Status */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
                      Status
                    </label>
                    <select
                      value={activeEntry.status}
                      onChange={(e) => updateActiveEntry({ status: e.target.value as JournalStatus })}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] font-medium focus:outline-none"
                    >
                      {(Object.keys(STATUS_CONFIG) as JournalStatus[]).map((st) => (
                        <option key={st} value={st}>
                          {STATUS_CONFIG[st].label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Priority */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
                      Prioritas
                    </label>
                    <select
                      value={activeEntry.priority || "medium"}
                      onChange={(e) => updateActiveEntry({ priority: e.target.value as JournalPriority })}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] font-medium focus:outline-none"
                    >
                      {(Object.keys(PRIORITY_CONFIG) as JournalPriority[]).map((pri) => (
                        <option key={pri} value={pri}>
                          {PRIORITY_CONFIG[pri].label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
                      Tanggal
                    </label>
                    <input
                      type="date"
                      value={activeEntry.date || ""}
                      onChange={(e) => updateActiveEntry({ date: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] font-medium focus:outline-none"
                    />
                  </div>
                </div>

                {/* Tags & Linked Project */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Linked Project Badge */}
                  {projects.length > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-xs text-[var(--muted)]">
                      <Folder className="w-3.5 h-3.5 text-blue-400" />
                      <select
                        value={activeEntry.projectId || ""}
                        onChange={(e) => updateActiveEntry({ projectId: e.target.value || undefined })}
                        className="bg-transparent border-none text-[var(--foreground)] focus:outline-none text-xs"
                      >
                        <option value="">Tanpa Proyek</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Tags list */}
                  {activeEntry.tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono"
                    >
                      <Tag className="w-3 h-3" />
                      <span>#{tag}</span>
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-rose-400 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}

                  <input
                    type="text"
                    placeholder="+ Tambah tag (Enter)"
                    value={newTagText}
                    onChange={(e) => setNewTagText(e.target.value)}
                    onKeyDown={handleAddTag}
                    className="px-3 py-1 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36"
                  />
                </div>

                {/* Interactive To-Do Checklist Card */}
                <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--foreground)]">
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                      <span>To-Do Checklist & Action Items</span>
                    </div>
                    {checklistStats && (
                      <span className="text-xs text-[var(--muted)] font-mono">
                        {checklistStats.completed}/{checklistStats.total} ({checklistStats.percent}%)
                      </span>
                    )}
                  </div>

                  {/* Progress Bar */}
                  {checklistStats && (
                    <div className="w-full bg-[var(--card-bg)] h-2 rounded-full overflow-hidden border border-[var(--card-border)]">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                        style={{ width: `${checklistStats.percent}%` }}
                      />
                    </div>
                  )}

                  {/* Checklists items */}
                  <div className="space-y-1.5">
                    {(activeEntry.checklists || []).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] group"
                      >
                        <div
                          onClick={() => handleToggleChecklist(item.id)}
                          className="flex items-center gap-2.5 flex-1 cursor-pointer select-none"
                        >
                          {item.completed ? (
                            <CheckSquare className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-[var(--muted)] flex-shrink-0" />
                          )}
                          <span
                            className={`text-xs ${
                              item.completed
                                ? "line-through text-[var(--muted)]"
                                : "text-[var(--foreground)]"
                            }`}
                          >
                            {item.title}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteChecklist(item.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--muted)] hover:text-rose-400 transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add Checklist Form */}
                  <form onSubmit={handleAddChecklist} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Tambah to-do baru..."
                      value={newChecklistText}
                      onChange={(e) => setNewChecklistText(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={!newChecklistText.trim()}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-50"
                    >
                      Tambah
                    </button>
                  </form>
                </div>

                {/* Markdown Editor / Preview Switcher */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between pb-1 border-b border-[var(--card-border)]">
                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
                      <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Konten Dokumen (Markdown)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPreviewMode(!previewMode)}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          previewMode
                            ? "bg-indigo-600 text-white shadow-2xs"
                            : "bg-[var(--card-bg)] text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{previewMode ? "Edit Markdown" : "Pratinjau Hasil"}</span>
                      </button>
                      {onSendToChat && (
                        <button
                          onClick={() => {
                            const formatted = `# ${activeEntry.title}\n\n${activeEntry.content}`;
                            onSendToChat(formatted);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] text-[var(--foreground)] border border-[var(--card-border)] transition-all cursor-pointer"
                          title="Kirim catatan ini ke Chat Workspace"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                          <span>Kirim ke Chat</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Formatting Toolbar */}
                  {!previewMode && (
                    <div className="flex items-center gap-1.5 p-1.5 bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] overflow-x-auto touch-scroll">
                      <button
                        type="button"
                        onClick={() => updateActiveEntry({ content: `${activeEntry.content}\n\n## ` })}
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                      >
                        H2
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveEntry({ content: `${activeEntry.content}\n\n### ` })}
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                      >
                        H3
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveEntry({ content: `${activeEntry.content}\n- [ ] ` })}
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                      >
                        Task
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveEntry({ content: `${activeEntry.content}\n- ` })}
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                      >
                        Poin
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveEntry({ content: `${activeEntry.content}\n> [!NOTE]\n> ` })}
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                      >
                        Quote
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveEntry({ content: `${activeEntry.content}\n\`\`\`ts\n// kode\n\`\`\`\n` })}
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                      >
                        Kode
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveEntry({ content: `${activeEntry.content}\n\n---\n\n` })}
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                      >
                        Garis
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newContent = `${activeEntry.content} [[`;
                          updateActiveEntry({ content: newContent });
                          setLinkSearchQuery("");
                          setLinkTriggerIndex(newContent.length - 2);
                        }}
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/15 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Tautkan ke catatan lain ([[Catatan]])"
                      >
                        <Link2 className="w-3 h-3" />
                        <span>[[ Link ]]</span>
                      </button>
                    </div>
                  )}

                  {/* Body Content */}
                  {previewMode ? (
                    <div className="p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] min-h-[300px] prose dark:prose-invert max-w-none text-xs md:text-sm">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ href, children, ...props }) => {
                            if (href?.startsWith("#journal-note-")) {
                              const rawTitle = decodeURIComponent(href.replace("#journal-note-", ""));
                              return (
                                <span
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const target = entries.find(
                                      (en) => en.title.trim().toLowerCase() === rawTitle.trim().toLowerCase()
                                    );
                                    if (target) {
                                      setActiveEntryId(target.id);
                                    } else {
                                      if (confirm(`Catatan "${rawTitle}" belum dibuat. Buat catatan baru sekarang?`)) {
                                        handleCreateNoteWithTitle(rawTitle);
                                      }
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 mx-1 rounded-lg text-xs font-semibold bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 transition-all cursor-pointer select-none no-underline shadow-2xs"
                                  title={`Buka catatan: ${rawTitle}`}
                                >
                                  <BookMarked className="w-3 h-3 text-indigo-400 inline" />
                                  <span>{children}</span>
                                </span>
                              );
                            }
                            return (
                              <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline" {...props}>
                                {children}
                              </a>
                            );
                          },
                        }}
                      >
                        {processedMarkdown}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="relative">
                      <textarea
                        value={activeEntry.content}
                        onChange={handleContentChange}
                        placeholder="Mulai menulis jurnal atau ketik catatan bebas di sini... Ketik [[ untuk menghubungkan catatan."
                        rows={14}
                        className="w-full p-4 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] text-xs md:text-sm font-mono text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed resize-y"
                      />

                      {/* Bilateral Link Autocomplete Popover */}
                      {linkSearchQuery !== null && (
                        <div className="absolute left-4 top-16 w-72 max-h-60 overflow-y-auto rounded-2xl bg-[var(--card-bg)] border border-indigo-500/40 shadow-2xl p-2 z-40 space-y-1 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
                          <div className="px-2 py-1 text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center justify-between border-b border-[var(--card-border)]/50 pb-1.5 mb-1">
                            <span className="flex items-center gap-1.5">
                              <Link2 className="w-3 h-3" />
                              <span>Tautkan Catatan ([[...]])</span>
                            </span>
                            <button
                              onClick={() => setLinkSearchQuery(null)}
                              className="text-[var(--muted)] hover:text-rose-400"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          {linkSuggestions.length > 0 ? (
                            linkSuggestions.map((sug) => (
                              <button
                                key={sug.id}
                                type="button"
                                onClick={() => handleSelectLinkSuggestion(sug)}
                                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs hover:bg-indigo-500/15 text-[var(--foreground)] transition-colors text-left cursor-pointer"
                              >
                                <span className="flex items-center gap-2 truncate">
                                  <span>{sug.icon || "📓"}</span>
                                  <span className="font-medium truncate">{sug.title}</span>
                                </span>
                                <span className="text-[10px] text-[var(--muted)] font-mono ml-1">
                                  #{sug.category}
                                </span>
                              </button>
                            ))
                          ) : (
                            <div className="px-2.5 py-1 text-[11px] text-[var(--muted)]">
                              Tidak ada catatan yang cocok
                            </div>
                          )}
                          {linkSearchQuery.trim().length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleCreateAndLinkNote(linkSearchQuery.trim())}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-indigo-400 hover:bg-indigo-500/15 border-t border-[var(--card-border)]/50 pt-1.5 transition-colors text-left cursor-pointer font-semibold"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span className="truncate">Buat "{linkSearchQuery.trim()}"</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Backlinks / Referencing Notes Section */}
                  {backlinks.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-[var(--card-border)] space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
                        <Link2 className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Terhubung di {backlinks.length} Catatan Lain (Backlinks)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                        {backlinks.map((b) => (
                          <button
                            key={b.id}
                            onClick={() => setActiveEntryId(b.id)}
                            className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] hover:border-indigo-500/40 text-left transition-all cursor-pointer group shadow-2xs"
                          >
                            <span className="text-lg flex-shrink-0">{b.icon || "📓"}</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-[var(--foreground)] group-hover:text-indigo-400 transition-colors truncate">
                                {b.title}
                              </div>
                              <div className="text-[11px] text-[var(--muted)] line-clamp-1 mt-0.5">
                                {b.content.replace(/[#*`_\[\]]/g, "").slice(0, 60) || "Tanpa konten tambahan"}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Document Page View Empty State */}
          {viewMode === "document" && !activeEntry && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl">
                📓
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[var(--foreground)]">Tidak Ada Catatan Terpilih</h3>
                <p className="text-xs text-[var(--muted)] max-w-sm">
                  Pilih catatan dari sidebar atau buat dokumen baru untuk memulai journaling dan manajemen tugas.
                </p>
              </div>
              <button
                onClick={() => handleCreateEntry(filterCategory !== "all" ? (filterCategory as JournalCategory) : "daily")}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all inline-flex items-center gap-2 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Dokumen Baru</span>
              </button>
            </div>
          )}

          {/* List / Table View */}
          {viewMode === "list" && (
            <div className={`flex-1 overflow-y-auto p-6 ${isFullWidth ? "w-full px-6 xl:px-12" : "max-w-6xl mx-auto w-full px-6"} space-y-4`}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[var(--foreground)]">Daftar Seluruh Catatan & Tugas</h2>
                <span className="text-xs text-[var(--muted)] font-mono">
                  {filteredEntries.length} entri ditemukan
                </span>
              </div>

              <div className="rounded-2xl border border-[var(--card-border)] overflow-hidden bg-[var(--card-bg)]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--sidebar-bg)] border-b border-[var(--card-border)] text-[var(--muted)] font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Judul Dokumen</th>
                      <th className="py-3 px-4">Kategori</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Prioritas</th>
                      <th className="py-3 px-4">Checklist</th>
                      <th className="py-3 px-4">Tanggal</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--card-border)]">
                    {filteredEntries.map((entry) => {
                      const catCfg = CATEGORY_CONFIG[entry.category] || CATEGORY_CONFIG.daily;
                      const priCfg = PRIORITY_CONFIG[entry.priority || "medium"];
                      const stCfg = STATUS_CONFIG[entry.status] || STATUS_CONFIG.draft;
                      const checkCount = entry.checklists?.length || 0;
                      const doneCount = entry.checklists?.filter((c) => c.completed).length || 0;

                      return (
                        <tr
                          key={entry.id}
                          onClick={() => {
                            setActiveEntryId(entry.id);
                            setViewMode("document");
                          }}
                          className="hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                        >
                          <td className="py-3 px-4 flex items-center gap-2 font-semibold text-[var(--foreground)]">
                            <span>{entry.icon || "📓"}</span>
                            <span className="truncate max-w-xs">{entry.title || "Tanpa Judul"}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${catCfg.bg} ${catCfg.color}`}>
                              {catCfg.label}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${stCfg.bg} ${stCfg.color}`}>
                              {stCfg.label}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium ${priCfg.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${priCfg.dot}`} />
                              {priCfg.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-[var(--muted)]">
                            {checkCount > 0 ? `${doneCount}/${checkCount}` : "-"}
                          </td>
                          <td className="py-3 px-4 text-[11px] text-[var(--muted)]">
                            {entry.date || "-"}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={(e) => handleDeleteEntry(entry.id, e)}
                              className="p-1 text-[var(--muted)] hover:text-rose-400 transition-colors"
                              title="Hapus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Kanban Board View */}
          {viewMode === "board" && (
            <div className="flex-1 overflow-x-auto p-6 touch-scroll">
              <div className="flex gap-4 min-w-[900px] h-full">
                {(Object.keys(STATUS_CONFIG) as JournalStatus[]).map((statusKey) => {
                  const columnEntries = filteredEntries.filter((e) => e.status === statusKey);
                  const stCfg = STATUS_CONFIG[statusKey];

                  return (
                    <div
                      key={statusKey}
                      className="flex-1 flex flex-col rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden"
                    >
                      {/* Column Header */}
                      <div className="p-3.5 border-b border-[var(--card-border)] bg-[var(--sidebar-bg)] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${stCfg.color}`}>{stCfg.label}</span>
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-[var(--card-bg)] text-[var(--muted)]">
                            {columnEntries.length}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            const newEntry: JournalEntry = {
                              id: `journal_${Date.now()}`,
                              title: "Catatan Baru",
                              content: "",
                              icon: "🎯",
                              category: "task",
                              status: statusKey,
                              priority: "medium",
                              tags: [],
                              checklists: [],
                              date: new Date().toISOString().slice(0, 10),
                              createdAt: Date.now(),
                              updatedAt: Date.now(),
                            };
                            saveEntries([newEntry, ...entries]);
                            setActiveEntryId(newEntry.id);
                            setViewMode("document");
                          }}
                          className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                          title="Tambah ke kolom ini"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Cards Column */}
                      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 touch-scroll">
                        {columnEntries.map((item) => {
                          const catCfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.daily;
                          const priCfg = PRIORITY_CONFIG[item.priority || "medium"];
                          const checkCount = item.checklists?.length || 0;
                          const doneCount = item.checklists?.filter((c) => c.completed).length || 0;

                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                setActiveEntryId(item.id);
                                setViewMode("document");
                              }}
                              className="p-3.5 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] hover:border-indigo-500/40 hover:shadow-md transition-all cursor-pointer space-y-2.5 group"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-base">{item.icon || "📓"}</span>
                                  <h3 className="text-xs font-bold text-[var(--foreground)] line-clamp-1">
                                    {item.title || "Tanpa Judul"}
                                  </h3>
                                </div>
                                <span className={`w-1.5 h-1.5 rounded-full ${priCfg.dot} mt-1 flex-shrink-0`} />
                              </div>

                              {item.content && (
                                <p className="text-[11px] text-[var(--muted)] line-clamp-2 leading-relaxed">
                                  {item.content.replace(/[#*`_]/g, "")}
                                </p>
                              )}

                              {/* Checklist mini progress */}
                              {checkCount > 0 && (
                                <div className="flex items-center gap-2 text-[10px] text-[var(--muted)] font-mono">
                                  <CheckSquare className="w-3 h-3 text-emerald-400" />
                                  <span>{doneCount}/{checkCount} checklist</span>
                                </div>
                              )}

                              {/* Card Footer: Category & Date */}
                              <div className="flex items-center justify-between pt-1 border-t border-[var(--card-border)] text-[10px]">
                                <span className={`px-1.5 py-0.5 rounded font-medium ${catCfg.bg} ${catCfg.color}`}>
                                  {catCfg.label}
                                </span>
                                {item.date && (
                                  <span className="text-[var(--muted)]">{item.date}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Copilot Modal */}
      {isAiModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-6 max-w-xl w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-bold text-[var(--foreground)]">
                  Notion AI Journal Copilot
                </h3>
              </div>
              <button
                onClick={() => setIsAiModalOpen(false)}
                className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* AI Action Mode Tabs */}
            <div className="grid grid-cols-3 gap-2 p-1 bg-[var(--sidebar-bg)] rounded-xl border border-[var(--card-border)]">
              <button
                onClick={() => setAiMode("draft")}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  aiMode === "draft"
                    ? "bg-purple-600 text-white shadow-2xs"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                Draft Jurnal
              </button>
              <button
                onClick={() => setAiMode("todos")}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  aiMode === "todos"
                    ? "bg-purple-600 text-white shadow-2xs"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                Ekstrak To-Do
              </button>
              <button
                onClick={() => setAiMode("polish")}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  aiMode === "polish"
                    ? "bg-purple-600 text-white shadow-2xs"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                Poles & Ringkas
              </button>
            </div>

            {/* AI Prompt / Instruction Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--foreground)]">
                {aiMode === "draft"
                  ? "Topik Catatan / Rencana Hari Ini:"
                  : aiMode === "todos"
                  ? "Instruksi Ekstraksi:"
                  : "Arahan Penyempurnaan:"}
              </label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={
                  aiMode === "draft"
                    ? "e.g. Evaluasi performa sistem backend, rencana migrasi ke Rust, dan prioritas besok..."
                    : "Instruksi tambahan jika ada..."
                }
                rows={3}
                className="w-full p-3 text-xs rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {/* Model Selector & Run Button */}
            <div className="flex items-center justify-between gap-3">
              <select
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] focus:outline-none"
              >
                {models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>

              <button
                onClick={handleRunAiCopilot}
                disabled={aiLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
              >
                <Sparkles className={`w-3.5 h-3.5 ${aiLoading ? "animate-spin" : ""}`} />
                <span>{aiLoading ? "Memproses..." : "Jalankan Copilot"}</span>
              </button>
            </div>

            {/* AI Generated Output */}
            {aiOutput && (
              <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-purple-500/30 space-y-3 max-h-56 overflow-y-auto touch-scroll">
                <div className="text-xs font-bold text-purple-400">Hasil Rekomendasi AI:</div>
                <div className="text-xs font-mono text-[var(--foreground)] whitespace-pre-wrap leading-relaxed">
                  {aiOutput}
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-[var(--card-border)]">
                  <button
                    onClick={handleApplyAiOutput}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer"
                  >
                    Terapkan ke Catatan
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default JournalView;
