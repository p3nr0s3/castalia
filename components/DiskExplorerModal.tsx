"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Folder,
  FolderOpen,
  FileText,
  HardDrive,
  ArrowUp,
  Search,
  Check,
  Plus,
  RefreshCw,
  Sparkles,
  Download,
  AlertCircle,
  FileCode,
  FileSpreadsheet,
  CornerDownRight,
} from "lucide-react";
import { formatBytes } from "@/lib/ollama";
import { Attachment, Project, ProjectFile } from "@/lib/types";

interface DiskItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  updatedAt: number;
  isReadableText: boolean;
}

interface DiskExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAttachFileToChat: (attachment: Attachment) => void;
  onAddFileToProject?: (projectFile: ProjectFile) => void;
  activeProject?: Project | null;
  onAskAboutFile?: (fileName: string, fileContent: string) => void;
}

export const DiskExplorerModal: React.FC<DiskExplorerModalProps> = ({
  isOpen,
  onClose,
  onAttachFileToChat,
  onAddFileToProject,
  activeProject,
  onAskAboutFile,
}) => {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [items, setItems] = useState<DiskItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<DiskItem | null>(null);
  const [readingFile, setReadingFile] = useState<boolean>(false);
  const [addedFilePaths, setAddedFilePaths] = useState<Set<string>>(new Set());

  // Load directory items
  const loadDirectory = async (targetPath?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = targetPath ? `/api/fs?path=${encodeURIComponent(targetPath)}` : `/api/fs`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to read directory");
      }

      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      setItems(data.items || []);
      setSelectedItem(null);
    } catch (err: any) {
      setError(err.message || "Failed to load directory");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDirectory(currentPath || undefined);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleItemClick = (item: DiskItem) => {
    if (item.isDirectory) {
      loadDirectory(item.path);
    } else {
      setSelectedItem(item);
    }
  };

  const handleAttachToChat = async (item: DiskItem) => {
    setReadingFile(true);
    try {
      const res = await fetch("/api/fs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", filePath: item.path }),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(`Failed to read file: ${data.error}`);
        return;
      }

      const attachment: Attachment = {
        id: `disk_${Date.now()}`,
        name: data.name,
        type: "document",
        mimeType: "text/plain",
        size: data.size,
        textContent: data.content,
      };

      onAttachFileToChat(attachment);
      setAddedFilePaths((prev) => new Set(prev).add(item.path));
    } catch (err: any) {
      alert(`Error reading file: ${err.message}`);
    } finally {
      setReadingFile(false);
    }
  };

  const handleAddToProject = async (item: DiskItem) => {
    if (!onAddFileToProject) return;
    setReadingFile(true);
    try {
      const res = await fetch("/api/fs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", filePath: item.path }),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(`Failed to read file: ${data.error}`);
        return;
      }

      const projFile: ProjectFile = {
        id: `pfile_${Date.now()}`,
        name: data.name,
        size: data.size,
        type: "document",
        textContent: data.content,
        uploadedAt: Date.now(),
      };

      onAddFileToProject(projFile);
      setAddedFilePaths((prev) => new Set(prev).add(item.path));
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setReadingFile(false);
    }
  };

  const handleAskAboutFile = async (item: DiskItem) => {
    if (!onAskAboutFile) return;
    setReadingFile(true);
    try {
      const res = await fetch("/api/fs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", filePath: item.path }),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(`Failed to read file: ${data.error}`);
        return;
      }

      onAskAboutFile(data.name, data.content);
      onClose();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setReadingFile(false);
    }
  };

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-3xl bg-[var(--card-bg)] text-[var(--foreground)] rounded-t-3xl sm:rounded-2xl border-t sm:border border-[var(--card-border)] shadow-2xl overflow-hidden flex flex-col z-10 max-h-[92dvh] sm:max-h-[88vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--sidebar-border)] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-xs">
              <HardDrive className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-semibold flex items-center gap-2">
                Local Disk & Filesystem Explorer
              </h2>
              <p className="text-[11px] text-[var(--muted)]">
                Directly connect local disk files and folders to your Ollama AI models.
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

        {/* Path Bar & Search */}
        <div className="p-3.5 bg-[var(--sidebar-bg)] border-b border-[var(--sidebar-border)] space-y-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            {parentPath && (
              <button
                onClick={() => loadDirectory(parentPath)}
                disabled={isLoading}
                className="p-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer disabled:opacity-50"
                title="Go up to parent folder"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}

            <div className="flex-1 relative flex items-center">
              <input
                type="text"
                value={currentPath}
                onChange={(e) => setCurrentPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadDirectory(currentPath)}
                placeholder="Enter folder path (e.g. C:\Users\Rei\Projects)..."
                className="w-full pl-3 pr-8 py-2 text-xs font-mono rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <button
                onClick={() => loadDirectory(currentPath)}
                disabled={isLoading}
                className="absolute right-2 p-1 text-[var(--muted)] hover:text-[var(--foreground)]"
                title="Refresh folder"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[var(--muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter files in this folder..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {activeProject && (
              <div className="px-2.5 py-1 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[11px] font-medium truncate max-w-[200px]">
                📁 Sync Target: {activeProject.name}
              </div>
            )}
          </div>
        </div>

        {/* Directory Items List */}
        <div className="p-3.5 flex-1 overflow-y-auto touch-scroll">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs mb-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--muted)] space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
              <p className="text-xs">Reading local disk directory...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--muted)]">
              <Folder className="w-8 h-8 mx-auto opacity-30 text-emerald-500 mb-1" />
              <p>No files found in this directory</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {filteredItems.map((item) => {
                const isAdded = addedFilePaths.has(item.path);
                const isSelected = selectedItem?.path === item.path;

                return (
                  <div
                    key={item.path}
                    onClick={() => handleItemClick(item)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                      item.isDirectory
                        ? "bg-[var(--sidebar-bg)] border-[var(--card-border)] hover:border-emerald-500/50 hover:bg-[var(--sidebar-hover)]"
                        : isSelected
                        ? "bg-emerald-500/10 border-emerald-500/40 text-[var(--foreground)]"
                        : "bg-[var(--card-bg)] border-[var(--card-border)] hover:border-[var(--card-border)] hover:bg-[var(--sidebar-hover)]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      {item.isDirectory ? (
                        <Folder className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      ) : (
                        <FileCode className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[var(--foreground)] truncate">
                          {item.name}
                        </div>
                        <div className="text-[10px] text-[var(--muted)] font-mono">
                          {item.isDirectory ? "Folder" : formatBytes(item.size)}
                        </div>
                      </div>
                    </div>

                    {!item.isDirectory && (
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleAttachToChat(item)}
                          disabled={readingFile}
                          className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                            isAdded
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-[var(--sidebar-hover)] hover:bg-emerald-600 hover:text-white text-[var(--muted)]"
                          }`}
                          title="Attach file to chat"
                        >
                          {isAdded ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          onClick={() => handleAskAboutFile(item)}
                          disabled={readingFile}
                          className="p-1.5 rounded-lg text-purple-400 hover:bg-purple-500/15 transition-colors cursor-pointer"
                          title="Ask AI about this file directly"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Item Quick Action Drawer */}
        {selectedItem && !selectedItem.isDirectory && (
          <div className="p-3 bg-[var(--sidebar-bg)] border-t border-[var(--sidebar-border)] flex items-center justify-between gap-2 flex-shrink-0">
            <div className="min-w-0 pr-2">
              <span className="text-xs font-semibold text-[var(--foreground)] truncate block">
                {selectedItem.name}
              </span>
              <span className="text-[10px] font-mono text-[var(--muted)] truncate block">
                {selectedItem.path}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleAttachToChat(selectedItem)}
                disabled={readingFile}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer"
              >
                + Attach to Chat
              </button>

              {activeProject && onAddFileToProject && (
                <button
                  onClick={() => handleAddToProject(selectedItem)}
                  disabled={readingFile}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer"
                >
                  + Add to {activeProject.name}
                </button>
              )}

              <button
                onClick={() => handleAskAboutFile(selectedItem)}
                disabled={readingFile}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 text-white shadow-xs transition-colors cursor-pointer"
              >
                ⚡ Ask AI
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
