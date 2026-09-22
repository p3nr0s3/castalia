"use client";

import React, { useState } from "react";
import { X, Sparkle as Sparkles, Download, Copy, Check, ShareNetwork as Share2, FileCode, Globe, Eye, FileText, Stack as Layers, CodeSimple as Code2, ArrowSquareOut as ExternalLink } from "@phosphor-icons/react";
import { Conversation, ArtifactItem } from "@/lib/types";

interface ArtifactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: Conversation | null;
}

// Helper to extract code blocks and markdown documents from conversation messages
function extractArtifactsFromConversation(conv: Conversation | null): ArtifactItem[] {
  if (!conv) return [];
  const artifacts: ArtifactItem[] = [];
  let counter = 1;

  for (const msg of conv.messages) {
    if (msg.role !== "assistant") continue;

    // Regex to match markdown code blocks ```lang ... ```
    const codeBlockRegex = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(msg.content)) !== null) {
      const language = (match[1] || "text").toLowerCase();
      const content = match[2].trim();
      if (!content) continue;

      let title = `Artifact #${counter} (${language.toUpperCase()})`;
      const firstLine = content.split("\n")[0];
      if (firstLine.startsWith("//") || firstLine.startsWith("#") || firstLine.startsWith("<!--")) {
        title = firstLine.replace(/^[/#<!-]+/, "").replace(/-->$/, "").trim() || title;
      }

      artifacts.push({
        id: `artifact_${msg.id}_${counter}`,
        title,
        type: language === "html" || language === "svg" ? "html" : "code",
        language,
        content,
        createdAt: msg.timestamp,
        messageId: msg.id,
      });
      counter++;
    }
  }

  return artifacts;
}

export const ArtifactsModal: React.FC<ArtifactsModalProps> = ({
  isOpen,
  onClose,
  conversation,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactItem | null>(null);
  const [previewMode, setPreviewMode] = useState<"code" | "preview">("code");

  if (!isOpen) return null;

  const artifacts = extractArtifactsFromConversation(conversation);
  const activeArt = selectedArtifact || (artifacts.length > 0 ? artifacts[0] : null);

  const handleCopyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleDownloadFile = (filename: string, content: string, mimeType = "text/plain") => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export full conversation as standalone HTML webpage
  const handleExportFullHTML = () => {
    if (!conversation) return;

    let htmlBody = "";
    for (const msg of conversation.messages) {
      const isUser = msg.role === "user";
      htmlBody += `
        <div style="margin-bottom: 24px; padding: 18px; border-radius: 16px; background: ${
          isUser ? "#1e293b" : "#0f172a"
        }; border: 1px solid #334155;">
          <div style="font-size: 12px; font-weight: bold; color: ${
            isUser ? "#60a5fa" : "#a855f7"
          }; margin-bottom: 8px;">
            ${isUser ? "You" : "AI Assistant (" + (msg.model || "Ollama") + ")"}
          </div>
          <div style="font-size: 14px; line-height: 1.6; color: #f8fafc; white-space: pre-wrap; font-family: sans-serif;">
            ${msg.content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
          </div>
        </div>
      `;
    }

    const fullDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${conversation.title} - AI Conversation Artifact</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #030712; color: #f9fafb; margin: 0; padding: 40px 20px; display: flex; justify-content: center; }
    .container { max-width: 800px; width: 100%; }
    .header { margin-bottom: 30px; border-bottom: 1px solid #1f2937; padding-bottom: 20px; }
    h1 { font-size: 24px; margin: 0 0 8px 0; color: #ffffff; }
    .meta { font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${conversation.title}</h1>
      <div class="meta">Exported on ${new Date().toLocaleString()} | Model: ${conversation.model}</div>
    </div>
    ${htmlBody}
  </div>
</body>
</html>`;

    handleDownloadFile(
      `${conversation.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}-artifact.html`,
      fullDoc,
      "text/html"
    );
  };

  const handleExportFullMarkdown = () => {
    if (!conversation) return;
    let md = `# ${conversation.title}\n\n`;
    md += `*Exported on ${new Date().toLocaleString()} | Model: ${conversation.model}*\n\n---\n\n`;
    for (const msg of conversation.messages) {
      md += `### ${msg.role === "user" ? "You" : "Assistant"}\n\n${msg.content}\n\n---\n\n`;
    }
    handleDownloadFile(
      `${conversation.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.md`,
      md,
      "text/markdown"
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-4xl bg-[var(--card-bg)] text-[var(--foreground)] rounded-t-3xl sm:rounded-2xl border-t sm:border border-[var(--card-border)] shadow-2xl overflow-hidden flex flex-col z-10 max-h-[92dvh] sm:max-h-[88vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--sidebar-border)] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                Artifacts & Export Hub
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                  {artifacts.length} Extracted
                </span>
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Inspect, live-preview, and export generated code artifacts & shareable web documents.
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

        {/* Global Export Bar */}
        <div className="px-5 py-2.5 bg-[var(--sidebar-bg)] border-b border-[var(--sidebar-border)] flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
          <span className="text-xs font-medium text-[var(--muted)]">Full Conversation Bundle:</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportFullHTML}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              Export as Standalone HTML (.html)
            </button>
            <button
              onClick={handleExportFullMarkdown}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:bg-[var(--sidebar-hover)] text-[var(--foreground)] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Markdown (.md)
            </button>
          </div>
        </div>

        {/* Body Layout */}
        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
          {/* Left: Artifacts List */}
          <div className="w-full sm:w-72 border-b sm:border-b-0 sm:border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/50 p-3 overflow-y-auto space-y-1.5 flex-shrink-0 max-h-48 sm:max-h-none">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] px-1 mb-1">
              Extracted Artifacts
            </div>

            {artifacts.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--muted)]">
                <FileCode className="w-6 h-6 mx-auto opacity-40 mb-1" />
                <p>No code snippets found in this chat yet</p>
              </div>
            ) : (
              artifacts.map((art) => {
                const isSelected = activeArt?.id === art.id;
                return (
                  <button
                    key={art.id}
                    onClick={() => {
                      setSelectedArtifact(art);
                      setPreviewMode(art.type === "html" ? "preview" : "code");
                    }}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start gap-2 cursor-pointer ${
                      isSelected
                        ? "bg-purple-500/15 border-purple-500/40 text-[var(--foreground)] font-semibold shadow-xs"
                        : "bg-[var(--card-bg)] border-[var(--card-border)] hover:border-[var(--muted)] text-[var(--muted)]"
                    }`}
                  >
                    <FileCode className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs truncate text-[var(--foreground)]">{art.title}</div>
                      <div className="text-[10px] text-[var(--muted)] uppercase font-mono mt-0.5">
                        {art.language} • {art.content.split("\n").length} lines
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right: Artifact Inspector & Preview */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[var(--card-bg)]">
            {activeArt ? (
              <>
                {/* Artifact Header */}
                <div className="px-4 py-2.5 border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] flex items-center justify-between flex-shrink-0">
                  <div className="min-w-0 pr-2">
                    <span className="text-xs font-bold text-[var(--foreground)] truncate block">
                      {activeArt.title}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--muted)]">
                      Language: {activeArt.language}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {activeArt.type === "html" && (
                      <div className="flex bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-0.5 text-xs">
                        <button
                          onClick={() => setPreviewMode("code")}
                          className={`px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer ${
                            previewMode === "code" ? "bg-purple-600 text-white" : "text-[var(--muted)]"
                          }`}
                        >
                          Code
                        </button>
                        <button
                          onClick={() => setPreviewMode("preview")}
                          className={`px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer ${
                            previewMode === "preview" ? "bg-purple-600 text-white" : "text-[var(--muted)]"
                          }`}
                        >
                          Preview
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => handleCopyText(activeArt.content, activeArt.id)}
                      className="p-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
                      title="Copy artifact content"
                    >
                      {copiedId === activeArt.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      onClick={() =>
                        handleDownloadFile(
                          `artifact.${activeArt.language || "txt"}`,
                          activeArt.content
                        )
                      }
                      className="p-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
                      title="Download this artifact"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Content / Preview Body */}
                <div className="flex-1 overflow-auto p-4 font-mono text-xs text-[var(--foreground)] leading-relaxed">
                  {previewMode === "preview" && activeArt.type === "html" ? (
                    <iframe
                      srcDoc={activeArt.content}
                      title="Live Preview"
                      className="w-full h-full min-h-[300px] rounded-xl border border-[var(--card-border)] bg-white"
                      sandbox="allow-scripts"
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap select-text">{activeArt.content}</pre>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-[var(--muted)]">
                <FileCode className="w-8 h-8 opacity-30 text-purple-400 mb-2" />
                <p>Select an artifact on the left to view or export</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
