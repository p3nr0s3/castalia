"use client";

import React from "react";
import { X, ShieldWarning as ShieldAlert, Check, XCircle, NotePencil as FileEdit, Trash as Trash2, Clock } from "@phosphor-icons/react";
import { PendingApproval } from "@/lib/types";
import { DiffPreview } from "./DiffPreview";

interface ApprovalQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  approvals: PendingApproval[];
  onDecision: (approvalId: string, decision: "approved" | "rejected") => void;
  resolvingIds: string[];
}

function ToolIcon({ toolName }: { toolName: string }) {
  if (toolName === "delete_file") return <Trash2 className="w-4 h-4 text-red-400" />;
  return <FileEdit className="w-4 h-4 text-amber-400" />;
}

export function ApprovalQueueModal({ isOpen, onClose, approvals, onDecision, resolvingIds }: ApprovalQueueModalProps) {
  if (!isOpen) return null;

  const pending = approvals.filter((a) => a.status === "pending");
  const resolved = approvals.filter((a) => a.status !== "pending").slice(0, 10);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[85vh] bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h2 className="font-semibold text-white">Persetujuan</h2>
            {pending.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-medium">
                {pending.length} menunggu
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {pending.length === 0 && resolved.length === 0 && (
            <div className="text-center py-12 text-neutral-500 text-sm">
              Tidak ada permintaan persetujuan saat ini.
            </div>
          )}

          {pending.map((approval) => {
            const isResolving = resolvingIds.includes(approval.id);
            return (
              <div key={approval.id} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <ToolIcon toolName={approval.toolName} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">
                        {approval.source === "chat" ? "Chat" : approval.agentName} ingin menjalankan{" "}
                        <code className="text-amber-300">{approval.toolName}</code>
                      </p>
                      {approval.toolName === "write_file" ? (
                        <DiffPreview
                          path={approval.args?.path}
                          previousContent={approval.previousContent}
                          newContent={typeof approval.args?.content === "string" ? approval.args.content : ""}
                        />
                      ) : (
                        <pre className="mt-1.5 text-xs text-neutral-400 bg-black/30 rounded-lg p-2 overflow-x-auto max-h-32">
                          {JSON.stringify(approval.args, null, 2)}
                        </pre>
                      )}
                      <p className="mt-1 text-[11px] text-neutral-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {new Date(approval.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => onDecision(approval.id, "approved")}
                    disabled={isResolving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => onDecision(approval.id, "rejected")}
                    disabled={isResolving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>
            );
          })}

          {resolved.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-neutral-500 mb-2 font-medium uppercase tracking-wide">Riwayat</p>
              <div className="space-y-2">
                {resolved.map((approval) => (
                  <div key={approval.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <ToolIcon toolName={approval.toolName} />
                      <span className="text-xs text-neutral-400 truncate">
                        {approval.source === "chat" ? "Chat" : approval.agentName} — {approval.toolName}
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        approval.status === "approved"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {approval.status === "approved" ? "Disetujui" : "Ditolak"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
