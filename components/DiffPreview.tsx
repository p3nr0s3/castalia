"use client";

import React, { useState } from "react";
import { CaretDown as ChevronDown, CaretRight as ChevronRight } from "@phosphor-icons/react";
import { diffText } from "@/lib/textDiff";

interface DiffPreviewProps {
  path?: string;
  previousContent?: string;
  newContent: string;
  maxVisibleLines?: number;
}

/**
 * Colored +/- line diff for a pending write_file approval, with a
 * collapsible "show more" for long files. Shared by ApprovalQueueModal
 * (queue view) and ChatMessage (inline approval card in the chat) so both
 * surfaces show the exact same preview instead of drifting apart.
 */
export function DiffPreview({ path, previousContent, newContent, maxVisibleLines = 40 }: DiffPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const diff = diffText(previousContent, newContent);

  const visibleLines = expanded ? diff.lines : diff.lines.slice(0, maxVisibleLines);
  const hiddenCount = diff.lines.length - visibleLines.length;

  return (
    <div className="mt-1.5 rounded-lg border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-black/40 text-[11px]">
        {path && <span className="text-neutral-400 font-mono truncate">{path}</span>}
        <span className="flex items-center gap-2 flex-shrink-0 ml-auto">
          {diff.isNewFile ? (
            <span className="text-blue-400 font-medium">File baru</span>
          ) : (
            <>
              <span className="text-emerald-400 font-medium">+{diff.additions}</span>
              <span className="text-red-400 font-medium">-{diff.deletions}</span>
            </>
          )}
          {diff.truncated && <span className="text-amber-400">(file besar, diff disederhanakan)</span>}
        </span>
      </div>
      <pre className="text-[11px] font-mono leading-5 overflow-x-auto bg-black/20 max-h-64 overflow-y-auto m-0">
        {visibleLines.map((line, idx) => (
          <div
            key={idx}
            className={
              line.type === "added"
                ? "bg-emerald-500/10 text-emerald-300"
                : line.type === "removed"
                ? "bg-red-500/10 text-red-300"
                : "text-neutral-400"
            }
          >
            <span className="inline-block w-4 select-none text-neutral-600">
              {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
            </span>
            <span className="whitespace-pre-wrap break-words">{line.text || " "}</span>
          </div>
        ))}
      </pre>
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] text-neutral-400 hover:text-neutral-200 bg-black/30 border-t border-white/5"
        >
          <ChevronDown className="w-3 h-3" /> Tampilkan {hiddenCount} baris lagi
        </button>
      )}
      {expanded && diff.lines.length > maxVisibleLines && (
        <button
          onClick={() => setExpanded(false)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] text-neutral-400 hover:text-neutral-200 bg-black/30 border-t border-white/5"
        >
          <ChevronRight className="w-3 h-3" /> Ciutkan
        </button>
      )}
    </div>
  );
}
