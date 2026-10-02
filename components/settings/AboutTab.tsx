"use client";

import React from "react";
import { AppSettings } from "@/lib/types";

interface AboutTabProps {
  formData: AppSettings;
}

export const AboutTab: React.FC<AboutTabProps> = ({ formData }) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      <div>
        <h3 className="text-sm font-bold text-[var(--foreground)]">About & System Diagnostics</h3>
        <p className="text-xs text-[var(--muted)] mt-0.5">
          Application build information and active environment status.
        </p>
      </div>

      <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2 text-xs">
        <div className="flex justify-between py-1 border-b border-[var(--sidebar-border)]/50">
          <span className="text-[var(--muted)]">Application Version</span>
          <span className="font-mono font-bold text-[var(--foreground)]">v2.5.0 Hybrid AI</span>
        </div>
        <div className="flex justify-between py-1 border-b border-[var(--sidebar-border)]/50">
          <span className="text-[var(--muted)]">Database Storage</span>
          <span className="font-mono text-emerald-400">Server Disk (data/db.json)</span>
        </div>
        <div className="flex justify-between py-1 border-b border-[var(--sidebar-border)]/50">
          <span className="text-[var(--muted)]">Active Model</span>
          <span className="font-mono text-blue-400">{formData.defaultModel || "Auto-Selected"}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-[var(--muted)]">Environment</span>
          <span className="font-mono text-[var(--foreground)]">Localhost + Mobile Tunnel Sync</span>
        </div>
      </div>
    </div>
  );
};
