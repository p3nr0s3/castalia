"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { parseSnippet, type HistoryHit } from "@/lib/historySearch";

interface HistorySearchModalProps {
  isOpen: boolean;
  initialQuery?: string;
  onClose: () => void;
  onSelect: (conversationId: string, messageId: string) => void;
}

/** Ctrl/Cmd+K: search the text of every message in every conversation (server-side FTS). */
export const HistorySearchModal: React.FC<HistorySearchModalProps> = ({ isOpen, initialQuery = "", onClose, onSelect }) => {
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<HistoryHit[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (!isOpen) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setState("idle");
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const res = await apiFetch(`/api/history/search?q=${encodeURIComponent(q)}&limit=30`, { signal: controller.signal, cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        setHits(data.hits || []);
        setCursor(0);
        setState("idle");
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message || "Pencarian gagal");
        setState("error");
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen]);

  const choose = useCallback(
    (hit: HistoryHit | undefined) => {
      if (hit) onSelect(hit.conversationId, hit.messageId);
    },
    [onSelect]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(hits[cursor]); }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center pt-[12vh] px-3" role="dialog" aria-modal="true" aria-label="Cari di riwayat chat" onKeyDown={onKeyDown}>
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl overflow-hidden">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari di semua percakapan…"
          aria-label="Kata kunci"
          className="w-full px-4 py-3 text-sm bg-transparent text-[var(--foreground)] placeholder-[var(--muted)] border-b border-[var(--card-border)] focus:outline-none"
        />
        <div className="max-h-[55vh] overflow-y-auto" role="listbox">
          {query.trim().length < 2 && <p className="p-4 text-xs text-[var(--muted)]">Ketik minimal 2 huruf. ↑↓ untuk memilih, Enter untuk membuka, Esc untuk menutup.</p>}
          {state === "loading" && <p className="p-4 text-xs text-[var(--muted)]">Mencari…</p>}
          {state === "error" && <p className="p-4 text-xs text-red-400">{error}</p>}
          {state === "idle" && query.trim().length >= 2 && hits.length === 0 && <p className="p-4 text-xs text-[var(--muted)]">Tidak ada hasil.</p>}
          {hits.map((h, i) => (
            <button
              key={`${h.conversationId}:${h.messageId}`}
              role="option"
              aria-selected={i === cursor}
              onMouseEnter={() => setCursor(i)}
              onClick={() => choose(h)}
              className={`w-full text-left px-4 py-2.5 border-b border-[var(--card-border)] last:border-b-0 ${i === cursor ? "bg-[var(--sidebar-hover)]" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--foreground)] truncate">{h.title || "Tanpa judul"}</span>
                <span className="text-[10px] text-[var(--muted)] flex-shrink-0">{h.role === "user" ? "Anda" : "AI"}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-[var(--muted)] break-words">
                {parseSnippet(h.snippet).map((seg, j) =>
                  seg.match ? <mark key={j} className="bg-yellow-400/30 text-[var(--foreground)] rounded px-0.5">{seg.text}</mark> : <React.Fragment key={j}>{seg.text}</React.Fragment>
                )}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
