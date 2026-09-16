"use client";

import React, { useState } from "react";
import { ShieldCheck, ShieldWarning as ShieldAlert, Shield, ArrowSquareOut as ExternalLink, CaretDown as ChevronDown, CaretUp as ChevronUp, CheckCircle as CheckCircle2, Warning as AlertTriangle, XCircle, Lock, Cookie, HardDrives as Server, FileCode } from "@phosphor-icons/react";
import { OwaspFinding, OwaspScanResult } from "@/lib/types";

interface OwaspSecurityCardProps {
  scan: OwaspScanResult;
}

export const OwaspSecurityCard: React.FC<OwaspSecurityCardProps> = ({ scan }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const passCount = scan.findings.filter((f) => f.status === "pass").length;
  const warnCount = scan.findings.filter((f) => f.status === "warn").length;
  const failCount = scan.findings.filter((f) => f.status === "fail").length;

  const getGradeStyle = (grade: string) => {
    switch (grade) {
      case "A+":
      case "A":
        return {
          bg: "bg-emerald-500/10 dark:bg-emerald-500/15",
          border: "border-emerald-500/30",
          text: "text-emerald-400",
          glow: "shadow-[0_0_20px_rgba(16,185,129,0.15)]",
          barColor: "bg-emerald-500",
        };
      case "B":
        return {
          bg: "bg-blue-500/10 dark:bg-blue-500/15",
          border: "border-blue-500/30",
          text: "text-blue-400",
          glow: "shadow-[0_0_20px_rgba(59,130,246,0.15)]",
          barColor: "bg-blue-500",
        };
      case "C":
        return {
          bg: "bg-amber-500/10 dark:bg-amber-500/15",
          border: "border-amber-500/30",
          text: "text-amber-400",
          glow: "shadow-[0_0_20px_rgba(245,158,11,0.15)]",
          barColor: "bg-amber-500",
        };
      case "D":
        return {
          bg: "bg-orange-500/10 dark:bg-orange-500/15",
          border: "border-orange-500/30",
          text: "text-orange-400",
          glow: "shadow-[0_0_20px_rgba(249,115,22,0.15)]",
          barColor: "bg-orange-500",
        };
      default:
        return {
          bg: "bg-rose-500/10 dark:bg-rose-500/15",
          border: "border-rose-500/30",
          text: "text-rose-400",
          glow: "shadow-[0_0_20px_rgba(244,63,94,0.15)]",
          barColor: "bg-rose-500",
        };
    }
  };

  const gradeStyle = getGradeStyle(scan.grade);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-rose-500/20 text-rose-300 border-rose-500/40";
      case "high":
        return "bg-orange-500/20 text-orange-300 border-orange-500/40";
      case "medium":
        return "bg-amber-500/20 text-amber-300 border-amber-500/40";
      case "low":
        return "bg-blue-500/20 text-blue-300 border-blue-500/40";
      default:
        return "bg-slate-500/20 text-slate-300 border-slate-500/40";
    }
  };

  const categories = Array.from(new Set(scan.findings.map((f) => f.category)));

  const filteredFindings =
    selectedCategory === "all"
      ? scan.findings
      : scan.findings.filter((f) => f.category === selectedCategory);

  return (
    <div className={`my-3.5 rounded-2xl border ${gradeStyle.border} ${gradeStyle.bg} ${gradeStyle.glow} p-4 transition-all duration-200`}>
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--card-border)]/50 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--foreground)] tracking-wide uppercase">
                OWASP Top 10 Security Audit
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--muted)]">
                WSTG v4.2
              </span>
            </div>
            <a
              href={scan.targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:underline mt-0.5 truncate max-w-[280px] sm:max-w-md"
            >
              <span>{scan.targetUrl}</span>
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Grade Display */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
            <div className="text-right">
              <div className="text-[10px] text-[var(--muted)] font-medium">SECURITY GRADE</div>
              <div className="text-xs font-mono font-bold text-[var(--foreground)]">{scan.score}/100</div>
            </div>
            <div className={`text-2xl font-black ${gradeStyle.text} px-2 py-0.5 rounded-lg bg-black/20`}>
              {scan.grade}
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar & Counters */}
      <div className="mt-3.5">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-[var(--muted)] text-[11px]">Compliance Score</span>
          <div className="flex items-center gap-3 text-[11px] font-medium">
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3 h-3" /> {passCount} Pass
            </span>
            <span className="inline-flex items-center gap-1 text-amber-400">
              <AlertTriangle className="w-3 h-3" /> {warnCount} Warn
            </span>
            <span className="inline-flex items-center gap-1 text-rose-400">
              <XCircle className="w-3 h-3" /> {failCount} Fail
            </span>
          </div>
        </div>

        <div className="w-full h-2 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden">
          <div
            className={`h-full ${gradeStyle.barColor} transition-all duration-500 rounded-full`}
            style={{ width: `${Math.max(5, scan.score)}%` }}
          />
        </div>
      </div>

      {/* Quick Security Headers Indicators */}
      <div className="mt-3.5 pt-3 border-t border-[var(--card-border)]/40 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--card-bg)]/80 border border-[var(--card-border)] text-xs">
          <span className="text-[var(--muted)] text-[11px]">HSTS</span>
          {scan.headersSummary.hsts ? (
            <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Enforced
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-rose-400 flex items-center gap-1">
              <XCircle className="w-3 h-3" /> Missing
            </span>
          )}
        </div>

        <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--card-bg)]/80 border border-[var(--card-border)] text-xs">
          <span className="text-[var(--muted)] text-[11px]">CSP</span>
          {scan.headersSummary.csp ? (
            <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Active
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-rose-400 flex items-center gap-1">
              <XCircle className="w-3 h-3" /> Missing
            </span>
          )}
        </div>

        <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--card-bg)]/80 border border-[var(--card-border)] text-xs">
          <span className="text-[var(--muted)] text-[11px]">X-Frame</span>
          {scan.headersSummary.xFrameOptions ? (
            <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Protected
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Risk
            </span>
          )}
        </div>

        <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--card-bg)]/80 border border-[var(--card-border)] text-xs">
          <span className="text-[var(--muted)] text-[11px]">NoSniff</span>
          {scan.headersSummary.xContentTypeOptions ? (
            <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Enabled
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-rose-400 flex items-center gap-1">
              <XCircle className="w-3 h-3" /> Disabled
            </span>
          )}
        </div>
      </div>

      {/* Tech & Cookies Badges */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
        {scan.cookiesSummary.total > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--muted)]">
            <Cookie className="w-3 h-3 text-amber-400" />
            {scan.cookiesSummary.total} Cookie(s)
            {scan.cookiesSummary.missingHttpOnly > 0 && (
              <span className="text-rose-400">({scan.cookiesSummary.missingHttpOnly} no-HttpOnly)</span>
            )}
          </span>
        )}

        {scan.securityTxtPresent && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            security.txt (RFC 9116)
          </span>
        )}

        {scan.headersSummary.serverBannerExposed && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 truncate max-w-[220px]">
            <Server className="w-3 h-3 flex-shrink-0" />
            {scan.headersSummary.serverBannerExposed}
          </span>
        )}

        {scan.techDetected.map((tech) => (
          <span
            key={tech}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)]"
          >
            <FileCode className="w-3 h-3 text-blue-400" />
            {tech}
          </span>
        ))}
      </div>

      {/* Expand / Collapse Button */}
      <div className="mt-3.5 pt-2.5 border-t border-[var(--card-border)]/40 flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <span>{isExpanded ? "Hide Detailed Findings" : `View ${scan.findings.length} Detailed Findings`}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        <span className="text-[10px] text-[var(--muted)]">
          Passive Non-Destructive Scan
        </span>
      </div>

      {/* Expanded Findings Drawer */}
      {isExpanded && (
        <div className="mt-3.5 pt-3 border-t border-[var(--card-border)]/40 space-y-3">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none text-[11px]">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`px-2.5 py-1 rounded-lg border transition-all whitespace-nowrap ${
                selectedCategory === "all"
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-semibold"
                  : "bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              All ({scan.findings.length})
            </button>
            {categories.map((cat) => {
              const count = scan.findings.filter((f) => f.category === cat).length;
              const shortName = cat.replace(/:2021/g, "");
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg border transition-all whitespace-nowrap ${
                    selectedCategory === cat
                      ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-semibold"
                      : "bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {shortName} ({count})
                </button>
              );
            })}
          </div>

          {/* Findings List */}
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {filteredFindings.map((finding) => (
              <div
                key={finding.id}
                className="p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-xs space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 font-medium text-[var(--foreground)]">
                    {finding.status === "pass" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                    {finding.status === "warn" && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                    {finding.status === "fail" && <XCircle className="w-3.5 h-3.5 text-rose-400" />}
                    <span>{finding.title}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {finding.cwe && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/20 text-[var(--muted)]">
                        {finding.cwe}
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${getSeverityBadge(
                        finding.severity
                      )}`}
                    >
                      {finding.severity}
                    </span>
                  </div>
                </div>

                <p className="text-[11.5px] text-[var(--muted)] leading-relaxed">
                  {finding.description}
                </p>

                {finding.evidence && (
                  <div className="p-1.5 rounded-lg bg-black/25 font-mono text-[10.5px] text-slate-300 break-all border border-white/5">
                    <span className="text-[var(--muted)] font-sans">Evidence: </span>
                    {finding.evidence}
                  </div>
                )}

                <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-emerald-300/90 leading-relaxed">
                  <span className="font-semibold text-emerald-400">Remediation: </span>
                  {finding.recommendation}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
