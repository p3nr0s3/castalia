"use client";

import React, { useState, useEffect } from "react";
import {
  CheckSquare,
  ListTodo,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  Check,
  X,
  Clock,
  AlertCircle,
  Tag,
  Folder,
  Sparkles,
  ArrowLeft,
  ChevronRight,
  MoreVertical,
  Kanban,
  List,
  ExternalLink,
  Copy,
  Calendar,
  CheckCircle2,
  Circle,
  Brain,
  Layers,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TaskItem, TaskPriority, TaskStatus, Project, OllamaModel, ApiKeysConfig } from "@/lib/types";
import { storage } from "@/lib/storage";
import { apiFetch } from "@/lib/apiClient";

interface TaskManagerViewProps {
  projects: Project[];
  models: OllamaModel[];
  selectedModel: string;
  apiKeys?: ApiKeysConfig;
  onBackToChat: () => void;
  onSendToChat?: (text: string) => void;
}

const DEFAULT_COLUMNS: Array<{ id: TaskStatus; title: string; color: string; badge: string }> = [
  { id: "todo", title: "To Do", color: "border-slate-500/30", badge: "bg-slate-500/15 text-slate-400" },
  { id: "in_progress", title: "In Progress", color: "border-blue-500/30", badge: "bg-blue-500/15 text-blue-400" },
  { id: "review", title: "Review", color: "border-purple-500/30", badge: "bg-purple-500/15 text-purple-400" },
  { id: "done", title: "Done", color: "border-emerald-500/30", badge: "bg-emerald-500/15 text-emerald-400" },
];

export const TaskManagerView: React.FC<TaskManagerViewProps> = ({
  projects,
  models,
  selectedModel,
  apiKeys,
  onBackToChat,
  onSendToChat,
}) => {
  const [tasks, setTasks] = useState<TaskItem[]>(() => storage.getTasks());
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState<"all" | TaskPriority>("all");
  const [filterProjectId, setFilterProjectId] = useState<"all" | string>("all");

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriority, setFormPriority] = useState<TaskPriority>("medium");
  const [formStatus, setFormStatus] = useState<TaskStatus>("todo");
  const [formProjectId, setFormProjectId] = useState<string>("");
  const [formDueDate, setFormDueDate] = useState<string>("");
  const [formTags, setFormTags] = useState<string>("");

  // AI Copilot Modal State
  const [aiTaskModal, setAiTaskModal] = useState<TaskItem | null>(null);
  const [aiModel, setAiModel] = useState<string>(selectedModel || models[0]?.name || "llama3.1:latest");
  const [aiResponse, setAiResponse] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [copiedAi, setCopiedAi] = useState(false);

  useEffect(() => {
    if (selectedModel) setAiModel(selectedModel);
  }, [selectedModel]);

  const saveTasksState = (updated: TaskItem[]) => {
    setTasks(updated);
    storage.saveTasks(updated);
  };

  // Open Create Modal
  const handleOpenCreateModal = (initialStatus: TaskStatus = "todo") => {
    setEditingTask(null);
    setFormTitle("");
    setFormDescription("");
    setFormPriority("medium");
    setFormStatus(initialStatus);
    setFormProjectId("");
    setFormDueDate("");
    setFormTags("");
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (task: TaskItem) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDescription(task.description || "");
    setFormPriority(task.priority);
    setFormStatus(task.status);
    setFormProjectId(task.projectId || "");
    setFormDueDate(task.dueDate || "");
    setFormTags(task.tags ? task.tags.join(", ") : "");
    setIsModalOpen(true);
  };

  // Save Task Form
  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const parsedTags = formTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingTask) {
      const updated: TaskItem[] = tasks.map((t) =>
        t.id === editingTask.id
          ? {
              ...t,
              title: formTitle.trim(),
              description: formDescription.trim(),
              priority: formPriority,
              status: formStatus,
              projectId: formProjectId || undefined,
              dueDate: formDueDate || undefined,
              tags: parsedTags,
              updatedAt: Date.now(),
            }
          : t
      );
      saveTasksState(updated);
    } else {
      const newTask: TaskItem = {
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: formTitle.trim(),
        description: formDescription.trim(),
        priority: formPriority,
        status: formStatus,
        projectId: formProjectId || undefined,
        dueDate: formDueDate || undefined,
        tags: parsedTags,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subtasks: [],
      };
      saveTasksState([newTask, ...tasks]);
    }

    setIsModalOpen(false);
  };

  // Delete Task
  const handleDeleteTask = (taskId: string) => {
    const updated = tasks.filter((t) => t.id !== taskId);
    saveTasksState(updated);
  };

  // Move Task Status
  const handleMoveStatus = (taskId: string, newStatus: TaskStatus) => {
    const updated = tasks.map((t) =>
      t.id === taskId ? { ...t, status: newStatus, updatedAt: Date.now() } : t
    );
    saveTasksState(updated);
  };

  // Toggle Subtask Completion
  const handleToggleSubtask = (taskId: string, subtaskId: string) => {
    const updated = tasks.map((t) => {
      if (t.id !== taskId) return t;
      const subs = (t.subtasks || []).map((s) =>
        s.id === subtaskId ? { ...s, completed: !s.completed } : s
      );
      return { ...t, subtasks: subs, updatedAt: Date.now() };
    });
    saveTasksState(updated);
  };

  // AI Task Copilot Action
  const handleRunAiCopilot = async (task: TaskItem, mode: "subtasks" | "solve") => {
    setAiTaskModal(task);
    setIsAiLoading(true);
    setAiResponse("");

    const project = projects.find((p) => p.id === task.projectId);
    let prompt = "";

    if (mode === "subtasks") {
      prompt = `Pecah tugas berikut menjadi 3 sampai 6 subtask checklist yang konkret, jelas, dan siap dieksekusi:
Judul Tugas: "${task.title}"
Deskripsi: "${task.description || "Tidak ada"}"
Prioritas: ${task.priority.toUpperCase()}
${project ? `Proyek Terkait: "${project.name}"` : ""}

Format respon: Berikan checklist bullet points dalam bahasa Indonesia yang ringkas dan padat.`;
    } else {
      prompt = `Anda adalah seorang staf insinyur dan ahli produktivitas senior. Selesaikan dan buatkan draf solusi teknis lengkap atau rencana aksi mendalam untuk tugas berikut:
Judul Tugas: "${task.title}"
Deskripsi: "${task.description || "Tidak ada"}"
Prioritas: ${task.priority.toUpperCase()}
${project ? `Konteks Proyek: "${project.name}" - ${project.systemPrompt || ""}` : ""}

Berikan solusi arsitektur, kode, atau langkah-langkah implementasi terperinci dengan markdown yang rapi.`;
    }

    try {
      const isCloudModel = !models.some((m) => m.name === aiModel);
      let accumulated = "";

      if (isCloudModel) {
        const res = await apiFetch("/api/cloud/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: prompt }],
            model: aiModel,
            apiKeys,
            stream: true,
          }),
        });

        if (!res.ok) throw new Error("Cloud AI error");
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            accumulated += decoder.decode(value);
            setAiResponse(accumulated);
          }
        }
      } else {
        const res = await apiFetch("/api/ollama/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: aiModel,
            messages: [{ role: "user", content: prompt }],
            stream: false,
          }),
        });
        if (!res.ok) throw new Error("Ollama error");
        const data = await res.json();
        accumulated = data.message?.content || "Tidak ada respon dari model.";
        setAiResponse(accumulated);
      }
    } catch (e: any) {
      console.error("AI Task Copilot failed:", e);
      setAiResponse(`❌ Gagal meminta bantuan AI: ${e.message || "Koneksi bermasalah."}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Convert AI generated checklist into task subtasks
  const handleApplyAiSubtasks = (taskId: string) => {
    if (!aiResponse) return;
    const lines = aiResponse
      .split("\n")
      .map((l) => l.replace(/^[-*•\d.)\]\s]+/, "").trim())
      .filter((l) => l.length > 2 && !l.toLowerCase().includes("checklist") && !l.startsWith("#"));

    const newSubtasks = lines.slice(0, 8).map((title, idx) => ({
      id: `sub_${Date.now()}_${idx}`,
      title,
      completed: false,
    }));

    const updated = tasks.map((t) =>
      t.id === taskId ? { ...t, subtasks: [...(t.subtasks || []), ...newSubtasks], updatedAt: Date.now() } : t
    );
    saveTasksState(updated);
    setAiTaskModal(null);
  };

  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case "urgent":
        return "bg-rose-500/15 text-rose-400 border-rose-500/30";
      case "high":
        return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      case "medium":
        return "bg-blue-500/15 text-blue-400 border-blue-500/30";
      default:
        return "bg-slate-500/15 text-slate-400 border-slate-500/30";
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesPriority = filterPriority === "all" || t.priority === filterPriority;
    const matchesProject = filterProjectId === "all" || t.projectId === filterProjectId;
    return matchesSearch && matchesPriority && matchesProject;
  });

  return (
    <div className="flex-1 flex flex-col h-[100dvh] w-full bg-[var(--background)] text-[var(--foreground)] overflow-hidden select-text">
      {/* Top Header */}
      <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBackToChat}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
            title="Kembali ke Chat Utama"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-400">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xs md:text-sm font-bold text-[var(--foreground)] truncate">
                Manajemen Tugas & Proyek
              </h1>
              <span className="text-[10px] text-[var(--muted)]">
                {tasks.filter((t) => t.status === "done").length} selesai dari {tasks.length} tugas
              </span>
            </div>
          </div>
        </div>

        {/* View Mode Toggle & Add Task Button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-0.5">
            <button
              onClick={() => setViewMode("kanban")}
              className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                viewMode === "kanban"
                  ? "bg-purple-600 text-white shadow-2xs"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
              title="Tampilan Papan Kanban"
            >
              <Kanban className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                viewMode === "list"
                  ? "bg-purple-600 text-white shadow-2xs"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
              title="Tampilan Tabel / List"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => handleOpenCreateModal("todo")}
            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tambah Tugas</span>
          </button>
        </div>
      </header>

      {/* Filter and Search Sub-bar */}
      <div className="px-4 py-2.5 border-b border-[var(--sidebar-border)] bg-[var(--card-bg)]/40 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          {/* Search */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari tugas..."
              className="w-full pl-8 pr-3 py-1 text-xs rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Priority Filter */}
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as any)}
            className="text-xs px-2.5 py-1 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
          >
            <option value="all">Semua Prioritas</option>
            <option value="urgent">Urgent</option>
            <option value="high">Tinggi (High)</option>
            <option value="medium">Sedang (Medium)</option>
            <option value="low">Rendah (Low)</option>
          </select>

          {/* Project Filter */}
          {projects.length > 0 && (
            <select
              value={filterProjectId}
              onChange={(e) => setFilterProjectId(e.target.value)}
              className="text-xs px-2.5 py-1 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
            >
              <option value="all">Semua Proyek</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main Viewport */}
      <div className="flex-1 overflow-x-auto overflow-y-auto p-4 md:p-6">
        {/* KANBAN BOARD VIEW */}
        {viewMode === "kanban" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-w-[700px] h-full items-start">
            {DEFAULT_COLUMNS.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.status === col.id);

              return (
                <div
                  key={col.id}
                  className={`flex flex-col rounded-2xl bg-[var(--card-bg)]/60 border ${col.color} p-3 min-h-[300px] max-h-[calc(100vh-140px)] shadow-xs`}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--card-border)]">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${col.badge}`}>
                        {colTasks.length}
                      </span>
                      <h3 className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                        {col.title}
                      </h3>
                    </div>
                    <button
                      onClick={() => handleOpenCreateModal(col.id)}
                      className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] cursor-pointer"
                      title={`Tambah tugas ke ${col.title}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Task Cards List */}
                  <div className="flex-1 overflow-y-auto pt-3 space-y-3">
                    {colTasks.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-[var(--card-border)] text-center text-xs text-[var(--muted)]">
                        Belum ada tugas di kolom ini.
                      </div>
                    ) : (
                      colTasks.map((task) => {
                        const project = projects.find((p) => p.id === task.projectId);
                        const completedSubs = (task.subtasks || []).filter((s) => s.completed).length;
                        const totalSubs = task.subtasks?.length || 0;

                        return (
                          <div
                            key={task.id}
                            className="group p-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-purple-500/40 hover:shadow-md transition-all space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${getPriorityBadge(
                                  task.priority
                                )}`}
                              >
                                {task.priority}
                              </span>

                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleOpenEditModal(task)}
                                  className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                                  title="Edit tugas"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTask(task.id)}
                                  className="p-1 rounded text-[var(--muted)] hover:text-rose-400 cursor-pointer"
                                  title="Hapus tugas"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-xs font-bold text-[var(--foreground)] leading-snug">
                                {task.title}
                              </h4>
                              {task.description && (
                                <p className="text-[11px] text-[var(--muted)] line-clamp-2 mt-1 whitespace-pre-wrap">
                                  {task.description}
                                </p>
                              )}
                            </div>

                            {/* Subtasks checklist preview */}
                            {totalSubs > 0 && (
                              <div className="space-y-1.5 pt-1 border-t border-[var(--card-border)]">
                                <div className="flex items-center justify-between text-[10px] text-[var(--muted)]">
                                  <span>Subtasks</span>
                                  <span className="font-mono">
                                    {completedSubs}/{totalSubs}
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  {task.subtasks?.map((sub) => (
                                    <div
                                      key={sub.id}
                                      onClick={() => handleToggleSubtask(task.id, sub.id)}
                                      className="flex items-center gap-1.5 text-[11px] text-[var(--foreground)] cursor-pointer hover:opacity-80"
                                    >
                                      {sub.completed ? (
                                        <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                      ) : (
                                        <Circle className="w-3 h-3 text-[var(--muted)] flex-shrink-0" />
                                      )}
                                      <span
                                        className={`truncate ${
                                          sub.completed ? "line-through text-[var(--muted)]" : ""
                                        }`}
                                      >
                                        {sub.title}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Metadata Footer & Quick Actions */}
                            <div className="pt-2 flex items-center justify-between text-[10px] text-[var(--muted)] border-t border-[var(--card-border)]">
                              <div className="flex items-center gap-2">
                                {project && (
                                  <span className="flex items-center gap-1 text-purple-400">
                                    <Folder className="w-2.5 h-2.5" />
                                    <span className="truncate max-w-[80px]">{project.name}</span>
                                  </span>
                                )}
                                {task.dueDate && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-2.5 h-2.5" />
                                    <span>{task.dueDate}</span>
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                {/* AI Copilot Action */}
                                <button
                                  onClick={() => handleRunAiCopilot(task, "subtasks")}
                                  className="p-1 rounded-md text-purple-400 hover:bg-purple-500/10 cursor-pointer"
                                  title="AI Copilot: Pecah Subtasks"
                                >
                                  <Sparkles className="w-3 h-3" />
                                </button>

                                {/* Next Status Arrow */}
                                {col.id !== "done" && (
                                  <button
                                    onClick={() => {
                                      const nextStatus =
                                        col.id === "todo"
                                          ? "in_progress"
                                          : col.id === "in_progress"
                                          ? "review"
                                          : "done";
                                      handleMoveStatus(task.id, nextStatus);
                                    }}
                                    className="p-1 rounded-md text-[var(--muted)] hover:text-emerald-400 hover:bg-[var(--sidebar-hover)] cursor-pointer"
                                    title="Pindahkan status ke tahap berikutnya"
                                  >
                                    <ChevronRight className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* LIST VIEW */
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--sidebar-bg)] border-b border-[var(--card-border)] text-[var(--muted)] text-[10px] font-bold uppercase">
                <tr>
                  <th className="p-3">Tugas</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Prioritas</th>
                  <th className="p-3">Proyek</th>
                  <th className="p-3">Deadline</th>
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-[var(--muted)]">
                      Tidak ada tugas yang cocok dengan pencarian.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task) => {
                    const project = projects.find((p) => p.id === task.projectId);

                    return (
                      <tr key={task.id} className="hover:bg-[var(--sidebar-hover)] transition-colors">
                        <td className="p-3">
                          <div className="font-semibold text-[var(--foreground)]">{task.title}</div>
                          {task.description && (
                            <div className="text-[11px] text-[var(--muted)] line-clamp-1">
                              {task.description}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <select
                            value={task.status}
                            onChange={(e) => handleMoveStatus(task.id, e.target.value as TaskStatus)}
                            className="text-[11px] px-2 py-0.5 rounded-lg bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] cursor-pointer"
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="review">Review</option>
                            <option value="done">Done</option>
                          </select>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${getPriorityBadge(
                              task.priority
                            )}`}
                          >
                            {task.priority}
                          </span>
                        </td>
                        <td className="p-3 text-[var(--muted)]">
                          {project ? project.name : "-"}
                        </td>
                        <td className="p-3 text-[var(--muted)]">{task.dueDate || "-"}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleRunAiCopilot(task, "solve")}
                              className="p-1 text-purple-400 hover:bg-purple-500/10 rounded cursor-pointer"
                              title="Draft Solusi AI"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenEditModal(task)}
                              className="p-1 text-[var(--muted)] hover:text-[var(--foreground)] rounded cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="p-1 text-[var(--muted)] hover:text-rose-400 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE / EDIT TASK MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[var(--card-bg)] text-[var(--foreground)] border border-[var(--card-border)] rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-[var(--sidebar-border)] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--foreground)]">
                {editingTask ? "Edit Tugas" : "Buat Tugas Baru"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--foreground)]">Judul Tugas *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Implementasi Autentikasi OAuth2..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--foreground)]">Deskripsi / Spesifikasi</label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Detail yang harus diselesaikan atau catatan penting..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-purple-500 resize-y"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--foreground)]">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as TaskStatus)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="done">Done</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--foreground)]">Prioritas</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as TaskPriority)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                  >
                    <option value="low">Rendah (Low)</option>
                    <option value="medium">Sedang (Medium)</option>
                    <option value="high">Tinggi (High)</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--foreground)]">Kaitkan ke Proyek</label>
                  <select
                    value={formProjectId}
                    onChange={(e) => setFormProjectId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                  >
                    <option value="">Tanpa Proyek</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--foreground)]">Tenggat Waktu (Due Date)</label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--foreground)]">Tagar (Dipisah koma)</label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="e.g. backend, security, sprint-1"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md cursor-pointer"
                >
                  Simpan Tugas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI TASK COPILOT MODAL */}
      {aiTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[var(--card-bg)] text-[var(--foreground)] border border-[var(--card-border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-[var(--sidebar-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-bold text-[var(--foreground)]">
                  AI Copilot: {aiTaskModal.title}
                </h3>
              </div>
              <button
                onClick={() => setAiTaskModal(null)}
                className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRunAiCopilot(aiTaskModal, "subtasks")}
                  disabled={isAiLoading}
                  className="px-3 py-1 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-2xs disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <ListTodo className="w-3.5 h-3.5" />
                  <span>Pecah Subtasks Checklist</span>
                </button>
                <button
                  onClick={() => handleRunAiCopilot(aiTaskModal, "solve")}
                  disabled={isAiLoading}
                  className="px-3 py-1 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-[var(--foreground)] text-xs font-semibold disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Brain className="w-3.5 h-3.5 text-purple-400" />
                  <span>Draft Solusi & Kode</span>
                </button>
              </div>

              <select
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                className="text-xs px-2.5 py-1 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] focus:outline-none cursor-pointer"
              >
                {models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                <option value="gpt-4o">GPT-4o</option>
              </select>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {isAiLoading ? (
                <div className="p-8 text-center space-y-2 text-xs text-[var(--muted)]">
                  <Sparkles className="w-6 h-6 text-purple-400 animate-spin mx-auto" />
                  <p>AI sedang menganalisis tugas dan menyusun rencana implementasi...</p>
                </div>
              ) : aiResponse ? (
                <div className="prose dark:prose-invert text-xs leading-relaxed max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiResponse}</ReactMarkdown>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-[var(--muted)]">
                  Klik salah satu tombol di atas untuk memecah subtask atau membuat solusi AI.
                </div>
              )}
            </div>

            {aiResponse && !isAiLoading && (
              <div className="p-3.5 border-t border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] flex items-center justify-between">
                <button
                  onClick={() => handleApplyAiSubtasks(aiTaskModal.id)}
                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Terapkan sebagai Subtask Checklist</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(aiResponse);
                      setCopiedAi(true);
                      setTimeout(() => setCopiedAi(false), 2000);
                    }}
                    className="p-1.5 rounded-lg border border-[var(--card-border)] text-xs text-[var(--muted)] hover:text-[var(--foreground)] flex items-center gap-1 cursor-pointer"
                  >
                    {copiedAi ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedAi ? "Tersalin" : "Salin"}</span>
                  </button>

                  {onSendToChat && (
                    <button
                      onClick={() => {
                        onSendToChat(`> **Rencana Penyelesaian Tugas (${aiTaskModal.title}):**\n\n${aiResponse}`);
                        setAiTaskModal(null);
                        onBackToChat();
                      }}
                      className="px-3 py-1.5 rounded-xl border border-[var(--card-border)] text-xs text-purple-400 hover:bg-purple-500/10 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Kirim ke Chat</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskManagerView;
