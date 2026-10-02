"use client";

import React, { useState } from "react";
import {
  Download,
  Upload,
  Trash as Trash2,
  SpinnerGap as Loader2,
  CheckCircle as CheckCircle2,
  ArrowsClockwise as RefreshCw,
} from "@phosphor-icons/react";
import { storage } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { clearPromptCacheEverywhere } from "@/lib/responseCache";

interface DataTabProps {
  onDataImported: () => void;
  onClearAllChats: () => void;
  onClose: () => void;
}

export const DataTab: React.FC<DataTabProps> = ({
  onDataImported,
  onClearAllChats,
  onClose,
}) => {
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheClearedAt, setCacheClearedAt] = useState<number | null>(null);

  const handleClearResponseCache = async () => {
    setIsClearingCache(true);
    try {
      await clearPromptCacheEverywhere();
      setCacheClearedAt(Date.now());
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleExport = () => {
    const dataStr = storage.exportData();
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ollama-chat-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const success = storage.importData(content);
        if (success) {
          onDataImported();
          onClose();
        } else {
          toast.error("Invalid backup file format.");
        }
      } catch (err) {
        toast.error("Failed to parse backup JSON file.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      <div>
        <h3 className="text-sm font-bold text-[var(--foreground)]">Backup & Data Management</h3>
        <p className="text-xs text-[var(--muted)] mt-0.5">
          Export full JSON backups, import data, or reset database.
        </p>
      </div>

      {/* Data Overview Stats */}
      <div className="grid grid-cols-3 gap-2 py-1 text-center font-mono">
        <div className="p-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)]">
          <div className="text-[10px] text-[var(--muted)]">Conversations</div>
          <div className="font-bold text-emerald-400 text-sm">{storage.getConversations().length}</div>
        </div>
        <div className="p-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)]">
          <div className="text-[10px] text-[var(--muted)]">Projects</div>
          <div className="font-bold text-blue-400 text-sm">{storage.getProjects().length}</div>
        </div>
        <div className="p-2 rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)]">
          <div className="text-[10px] text-[var(--muted)]">Agents</div>
          <div className="font-bold text-purple-400 text-sm">{storage.getAgents().length}</div>
        </div>
      </div>

      <div className="space-y-2.5">
        <button
          type="button"
          onClick={handleExport}
          className="w-full p-3 rounded-2xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] hover:bg-[var(--sidebar-hover)] text-left flex items-center justify-between transition-colors cursor-pointer"
        >
          <div>
            <div className="text-xs font-bold text-[var(--foreground)]">Export Backup (.json)</div>
            <div className="text-[10px] text-[var(--muted)]">Save all chats, projects, agents, and settings</div>
          </div>
          <Download className="w-4 h-4 text-blue-400" />
        </button>

        <label className="w-full p-3 rounded-2xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] hover:bg-[var(--sidebar-hover)] text-left flex items-center justify-between transition-colors cursor-pointer">
          <div>
            <div className="text-xs font-bold text-[var(--foreground)]">Import Backup (.json)</div>
            <div className="text-[10px] text-[var(--muted)]">Restore conversations and knowledge base</div>
          </div>
          <Upload className="w-4 h-4 text-emerald-400" />
          <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
        </label>

        <button
          type="button"
          onClick={handleClearResponseCache}
          disabled={isClearingCache}
          className="w-full p-3 rounded-2xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] hover:bg-[var(--sidebar-hover)] text-left flex items-center justify-between transition-colors cursor-pointer disabled:opacity-50"
        >
          <div>
            <div className="text-xs font-bold text-[var(--foreground)]">Clear Response Cache</div>
            <div className="text-[10px] text-[var(--muted)]">
              {cacheClearedAt
                ? `Cleared just now — exact & semantic caches wiped, in-memory and on disk`
                : "Removes cached prompt responses (exact + semantic) from this tab and the server"}
            </div>
          </div>
          {isClearingCache ? (
            <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
          ) : cacheClearedAt ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <RefreshCw className="w-4 h-4 text-cyan-400" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            if (confirm("Are you sure you want to delete all conversations? This cannot be undone.")) {
              onClearAllChats();
              onClose();
            }
          }}
          className="w-full p-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-left flex items-center justify-between transition-colors cursor-pointer"
        >
          <div>
            <div className="text-xs font-bold text-rose-400">Clear All Chat History</div>
            <div className="text-[10px] text-rose-300/70">Permanently delete all stored chats</div>
          </div>
          <Trash2 className="w-4 h-4 text-rose-400" />
        </button>
      </div>
    </div>
  );
};
