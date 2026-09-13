"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  Bot,
  User,
  Copy,
  Download,
  Check,
  RotateCcw,
  Trash2,
  Pencil,
  Sparkles,
  AlertCircle,
  FileText,
  ExternalLink,
  X,
  Zap,
  Cpu,
  Globe,
  Brain,
  ChevronDown,
  ChevronRight,
  GitFork,
  Volume2,
  Square,
  Wrench,
  CheckCircle2,
  XCircle,
  Loader2,
  FileEdit,
  BookOpen,
  Search,
} from "lucide-react";
import dynamic from "next/dynamic";
import { Message } from "@/lib/types";
import { DiffPreview } from "./DiffPreview";
import { formatBytes } from "@/lib/ollama";
import { speakIndonesianFemale, stopSpeaking } from "@/lib/voiceEngine";

const CodeBlock = dynamic(() => import("./CodeBlock").then((mod) => mod.CodeBlock), {
  ssr: false,
  loading: () => (
    <pre className="my-2 p-3 rounded-2xl bg-[var(--card-bg)]/80 border border-[var(--card-border)] text-[var(--muted)] font-mono text-xs overflow-x-auto">
      <code>Loading code snippet...</code>
    </pre>
  ),
});

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  liveStats?: { tokenCount: number; liveTps: number };
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete?: (messageId: string) => void;
  onForkConversation?: (messageId: string) => void;
  onApproveTool?: (approvalId: string) => void;
  onRejectTool?: (approvalId: string) => void;
  chatFullWidth?: boolean;
}

function formatTimeAgo(timestamp?: number): string {
  if (!timestamp) return "";
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hours ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// Helper to extract <think> ... </think> reasoning tags
function extractReasoning(content: string, preExtractedReasoning?: string) {
  if (preExtractedReasoning) {
    return {
      reasoning: preExtractedReasoning,
      cleanContent: content.replace(/<think>[\s\S]*?<\/think>/g, "").trim(),
    };
  }

  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    const reasoning = thinkMatch[1].trim();
    const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/, "").trim();
    return { reasoning, cleanContent };
  }

  if (content.startsWith("<think>")) {
    const streamThink = content.slice(7);
    return { reasoning: streamThink, cleanContent: "" };
  }

  return { reasoning: null, cleanContent: content };
}

// Helper to render provider icon/badge
function getModelProviderBadge(modelName?: string) {
  if (!modelName) return null;
  const lower = modelName.toLowerCase();

  if (lower.startsWith("gemini")) {
    return { name: "Gemini", color: "from-blue-500 to-indigo-500", text: "text-blue-400" };
  }
  if (lower.startsWith("gpt") || lower.startsWith("o1") || lower.startsWith("o3")) {
    return { name: "OpenAI", color: "from-emerald-600 to-teal-600", text: "text-emerald-400" };
  }
  if (lower.startsWith("claude")) {
    return { name: "Claude", color: "from-purple-600 to-pink-600", text: "text-purple-400" };
  }
  if (lower.startsWith("deepseek")) {
    return { name: "DeepSeek", color: "from-cyan-600 to-blue-600", text: "text-cyan-400" };
  }
  if (lower.includes("groq") || lower.startsWith("llama-3.3")) {
    return { name: "Groq LPU", color: "from-orange-500 to-amber-500", text: "text-amber-400" };
  }

  return { name: "Local Ollama", color: "from-emerald-600 to-teal-500", text: "text-emerald-400" };
}

const ChatMessageComponent: React.FC<ChatMessageProps> = ({
  message,
  isStreaming = false,
  liveStats,
  onRegenerate,
  onEdit,
  onDelete,
  onForkConversation,
  onApproveTool,
  onRejectTool,
  chatFullWidth = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showMetricsDetail, setShowMetricsDetail] = useState(false);
  const [showSources, setShowSources] = useState(true);
  const [isReasoningOpen, setIsReasoningOpen] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isUser = message.role === "user";
  const { reasoning, cleanContent } = extractReasoning(message.content, message.reasoning);

  // Web Speech Synthesis Text-to-Speech (TTS) using Indonesian female voice
  const handleToggleSpeech = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Text-to-Speech is not supported in this browser.");
      return;
    }

    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }

    const textToRead = cleanContent || message.content;
    if (!textToRead.trim()) return;

    setIsSpeaking(true);
    speakIndonesianFemale({
      text: textToRead,
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanContent || message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy message:", err);
    }
  };

  const handleDownloadMessage = () => {
    try {
      const textToDownload = cleanContent || message.content;
      const blob = new Blob([textToDownload], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const timeStr = new Date(message.timestamp || Date.now()).toISOString().slice(0, 10);
      link.download = `${isUser ? "user-prompt" : "ai-response"}-${timeStr}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    } catch (err) {
      console.error("Failed to download message:", err);
    }
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && onEdit) {
      onEdit(message.id, editContent);
      setIsEditing(false);
    }
  };

  const formattedTime = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const imageAttachments = message.attachments?.filter((a) => a.type === "image") || [];
  const docAttachments = message.attachments?.filter((a) => a.type === "document") || [];
  const metrics = message.metrics;
  const sources = message.sources || [];
  const toolExecutions = message.toolExecutions || [];
  const providerBadge = getModelProviderBadge(message.model);

  if (isUser) {
    return (
      <div className={`w-full mx-auto px-2.5 sm:px-4 py-2 flex justify-end min-w-0 ${chatFullWidth ? "max-w-none sm:px-6 xl:px-10" : "max-w-4xl"}`}>
        <div className={`flex flex-col items-end gap-1.5 min-w-0 group ${chatFullWidth ? "max-w-[92%] sm:max-w-[85%] md:max-w-[80%]" : "max-w-[85%] sm:max-w-[72%] md:max-w-[65%]"}`}>
          {/* User Message Bubble fitted to content */}
          <div className="w-fit max-w-full min-w-0 self-end px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl bg-[var(--user-bubble)] text-[var(--foreground)] text-[14px] leading-relaxed shadow-none select-text border-none break-words [overflow-wrap:anywhere] [word-break:break-word] overflow-hidden">
            {/* Image Attachments */}
            {imageAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 pb-2">
                {imageAttachments.map((img) => (
                  <div
                    key={img.id}
                    onClick={() => setPreviewImage(img.dataUrl || null)}
                    className="relative group/img cursor-pointer rounded-xl overflow-hidden bg-black/20 max-w-[220px] max-h-[160px]"
                  >
                    <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover rounded-xl" />
                  </div>
                ))}
              </div>
            )}

            {/* Document Attachments */}
            {docAttachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-2">
                {docAttachments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 text-xs font-mono"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    <span className="truncate max-w-[140px]">{doc.name}</span>
                    <span className="text-[10px] text-[var(--muted)]">({formatBytes(doc.size)})</span>
                  </div>
                ))}
              </div>
            )}

            {/* Content or Edit Mode */}
            {isEditing ? (
              <div className="space-y-2 min-w-[240px]">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={3}
                  className="w-full p-2.5 text-xs rounded-xl bg-black/25 border border-white/10 text-[var(--foreground)] focus:outline-none"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg font-medium cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (cleanContent || message.content).includes("```") ? (
              <div className="prose prose-neutral dark:prose-invert max-w-none text-[13.5px] sm:text-sm leading-relaxed break-words [overflow-wrap:anywhere] [word-break:break-word]">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p({ children }) {
                      return <p className="mb-2 last:mb-0 break-words [overflow-wrap:anywhere] [word-break:break-word]">{children}</p>;
                    },
                    pre({ children }) {
                      return <>{children}</>;
                    },
                    code({ node, inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || "");
                      const language = match ? match[1] : "";
                      const codeText = String(children).replace(/\n$/, "");

                      if (!inline && (language || codeText.includes("\n"))) {
                        return <CodeBlock value={codeText} language={language || "text"} />;
                      }

                      return (
                        <code className="px-1.5 py-0.5 rounded-md bg-black/25 font-mono text-[12.5px] text-emerald-300" {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {cleanContent || message.content}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word] text-[13.5px] sm:text-sm leading-relaxed select-text font-normal">
                {cleanContent || message.content}
              </div>
            )}
          </div>

          {/* Under-bubble Action Toolbar on right matching Image 1 */}
          {!isEditing && (
            <div className="flex items-center gap-2 text-xs text-[var(--muted)] pr-1">
              <span suppressHydrationWarning className="text-[11px] opacity-75">{formatTimeAgo(message.timestamp)}</span>

              {onRegenerate && (
                <button
                  onClick={() => onRegenerate(message.id)}
                  className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                  title="Resend"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}

              {onEdit && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                  title="Edit prompt"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={handleCopy}
                className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                title="Copy prompt"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={handleDownloadMessage}
                className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                title="Download prompt as .md"
              >
                {downloaded ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>

        {/* Lightbox Modal */}
        {previewImage && (
          <div
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setPreviewImage(null)}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[90vh] rounded-2xl object-contain shadow-2xl"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`w-full mx-auto px-2.5 sm:px-4 py-2 transition-all duration-150 flex justify-start min-w-0 ${chatFullWidth ? "max-w-none sm:px-6 xl:px-10" : "max-w-4xl"}`}>
      <div className="w-full min-w-0 px-1 py-1 sm:px-2 sm:py-2 bg-transparent text-[var(--foreground)] border-none shadow-none group relative">
        {/* Message Content */}
        <div className="w-full min-w-0 space-y-2">
          {/* Optional Web Sources Badge on top if web search was used */}
          {!isUser && sources.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--muted)] mb-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Globe className="w-2.5 h-2.5 text-blue-400" />
                <span>Web Sources ({sources.length})</span>
              </span>
            </div>
          )}

          {/* Thought Process & Reasoning Accordion */}
          {reasoning && !isUser && (
            <div className="my-2 rounded-2xl bg-[var(--card-bg)]/40 backdrop-blur-md border border-[var(--card-border)]/60 overflow-hidden">
              <button
                onClick={() => setIsReasoningOpen(!isReasoningOpen)}
                className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]/40 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Brain className={`w-3.5 h-3.5 text-purple-400 ${isStreaming ? "animate-pulse" : ""}`} />
                  <span>Thought Process & Reasoning</span>
                  {isStreaming && !cleanContent && (
                    <span className="text-[10px] text-purple-400 font-mono animate-pulse font-normal">Thinking...</span>
                  )}
                </div>
                {isReasoningOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {isReasoningOpen && (
                <div className="px-3.5 py-2.5 border-t border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/30 text-xs font-mono text-[var(--muted)] whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                  {reasoning}
                </div>
              )}
            </div>
          )}

          {/* Image Attachments */}
          {imageAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1 pb-1.5">
              {imageAttachments.map((img) => (
                <div
                  key={img.id}
                  onClick={() => setPreviewImage(img.dataUrl || null)}
                  className="relative group/img cursor-pointer rounded-2xl overflow-hidden border border-[var(--card-border)] bg-[var(--card-bg)] max-w-[220px] max-h-[160px] shadow-xs hover:border-emerald-500/50 transition-colors"
                >
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="w-full h-full object-cover rounded-2xl group-hover/img:scale-105 transition-transform duration-200"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Document Attachments */}
          {docAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1 pb-1.5">
              {docAttachments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--card-bg)]/60 border border-[var(--card-border)] text-xs text-[var(--foreground)]"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  <span className="font-medium truncate max-w-[180px]">{doc.name}</span>
                  <span className="text-[10px] text-[var(--muted)] font-mono">({formatBytes(doc.size)})</span>
                </div>
              ))}
            </div>
          )}

          {/* Disk Tools: Tool Call Execution Cards */}
          {!isUser && toolExecutions.length > 0 && (
            <div className="mt-2 mb-2 space-y-1.5">
              {toolExecutions.map((exec) => {
                const isRunning = exec.status === "running";
                const isError = exec.status === "error";
                const isAwaitingApproval = exec.status === "awaiting_approval";
                const pathArg = exec.args?.path || exec.args?.directoryPath || "";

                if (isAwaitingApproval) {
                  return (
                    <div
                      key={exec.id}
                      className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs overflow-hidden"
                    >
                      <div className="flex items-start gap-2 px-3 py-2.5">
                        {exec.toolName === "delete_file" ? (
                          <Trash2 className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <FileEdit className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-[var(--foreground)]">
                            AI minta izin menjalankan <span className="font-mono text-amber-400">{exec.toolName}</span>
                          </p>
                          {pathArg && <p className="text-[var(--muted)] font-mono truncate mt-0.5">{pathArg}</p>}
                          {exec.toolName === "write_file" && typeof exec.args?.content === "string" && (
                            <DiffPreview previousContent={exec.previousContent} newContent={exec.args.content} />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-3 pb-2.5">
                        <button
                          onClick={() => exec.approvalId && onApproveTool?.(exec.approvalId)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-medium transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => exec.approvalId && onRejectTool?.(exec.approvalId)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-medium transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <details
                    key={exec.id}
                    className={`rounded-xl border text-xs overflow-hidden ${
                      isError
                        ? "border-rose-500/30 bg-rose-500/5"
                        : isRunning
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-emerald-500/25 bg-emerald-500/5"
                    }`}
                  >
                    <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none list-none">
                      {isRunning ? (
                        <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin flex-shrink-0" />
                      ) : isError ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      )}
                      <Wrench className="w-3.5 h-3.5 text-[var(--muted)] flex-shrink-0" />
                      <span className="font-mono font-semibold text-[var(--foreground)]">{exec.toolName}</span>
                      {pathArg && (
                        <span className="text-[var(--muted)] truncate font-mono">{pathArg}</span>
                      )}
                    </summary>
                    <div className="px-3 pb-2.5 pt-0.5 border-t border-[var(--sidebar-border)]/40 text-[11px] text-[var(--muted)] font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                      {isError
                        ? exec.error
                        : isRunning
                        ? "Menjalankan tool..."
                        : JSON.stringify(exec.result, null, 2).slice(0, 2000)}
                    </div>
                  </details>
                );
              })}
            </div>
          )}

          {/* RAG Knowledge Retrieval Transparency Panel */}
          {!isUser && message.retrievedChunks && message.retrievedChunks.length > 0 && (
            <div className="mt-2 mb-2">
              <details className="rounded-xl border border-blue-500/25 bg-blue-500/5 text-xs overflow-hidden">
                <summary className="flex items-center justify-between px-3 py-2 cursor-pointer select-none list-none">
                  <div className="flex items-center gap-2 min-w-0">
                    <BookOpen className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    <span className="font-semibold text-blue-300">Project Knowledge Retrieved</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/30 font-mono">
                      {message.retrievedChunks.length} chunk{message.retrievedChunks.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-[var(--muted)] flex-shrink-0" />
                </summary>
                <div className="p-2.5 border-t border-blue-500/20 space-y-2 max-h-60 overflow-y-auto">
                  {message.retrievedChunks.map((chunk, idx) => (
                    <div
                      key={chunk.id || idx}
                      className="p-2 rounded-lg bg-[var(--card-bg)]/80 border border-[var(--card-border)] space-y-1 text-[11px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-blue-400 truncate flex items-center gap-1">
                          <FileText className="w-3 h-3 text-blue-400 flex-shrink-0" />
                          <span className="truncate">{chunk.fileName}</span>
                          {chunk.totalChunks > 1 && (
                            <span className="text-[10px] text-[var(--muted)] font-mono">
                              (Part {chunk.chunkIndex + 1}/{chunk.totalChunks})
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--muted)] flex-shrink-0">
                          {chunk.score !== undefined && (
                            <span className="text-emerald-400 font-semibold">
                              Score: {Math.round(chunk.score * 100)}%
                            </span>
                          )}
                          <span>~{chunk.estimatedTokens} tok</span>
                        </div>
                      </div>
                      <p className="text-[var(--muted)] font-mono whitespace-pre-wrap line-clamp-3 hover:line-clamp-none transition-all text-[10.5px]">
                        {chunk.textSnippet}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* Clean Transparent Text & Markdown Flow */}
          {isEditing ? (
            <div className="space-y-2 mt-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full p-3 text-sm rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-y min-h-[100px]"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer"
                >
                  Save & Resend
                </button>
                <button
                  onClick={() => {
                    setEditContent(message.content);
                    setIsEditing(false);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-[var(--sidebar-hover)] hover:bg-[var(--card-border)] text-[var(--foreground)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm sm:text-[15px] leading-relaxed text-[var(--foreground)] select-text break-words [overflow-wrap:anywhere] [word-break:break-word] pt-0.5">
              {/* Perplexity-style Live Search & Scraping Step Pill */}
              {!isUser && message.searchSteps && (
                <div className="mb-2.5">
                  {message.searchSteps.step === "searching" && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/25 text-xs text-blue-400 font-medium animate-pulse">
                      <Search className="w-3.5 h-3.5 animate-spin-slow text-blue-400 flex-shrink-0" />
                      <span>
                        Searching web for{" "}
                        <strong className="text-blue-300 font-semibold">
                          &quot;{message.searchSteps.query}&quot;
                        </strong>
                        ...
                      </span>
                    </div>
                  )}
                  {message.searchSteps.step === "scraping" && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-400 font-medium animate-pulse">
                      <Globe className="w-3.5 h-3.5 animate-spin-slow text-emerald-400 flex-shrink-0" />
                      <span>
                        Reading & scraping {message.searchSteps.sourceCount || "web"} pages
                        {message.searchSteps.scrapedDomains && message.searchSteps.scrapedDomains.length > 0
                          ? ` (${message.searchSteps.scrapedDomains.slice(0, 3).join(", ")})`
                          : ""}
                        ...
                      </span>
                    </div>
                  )}
                  {message.searchSteps.step === "done" && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span>
                        Researched web across {message.searchSteps.sourceCount || sources.length} sources
                        {message.searchSteps.scrapedCount
                          ? ` (${message.searchSteps.scrapedCount} scraped & read)`
                          : ""}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {message.isError ? (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs sm:text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              ) : (
                <div className="prose prose-neutral dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:my-2 prose-pre:p-0 prose-pre:bg-transparent">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      p({ children }) {
                        return <p className="mb-2.5 last:mb-0 text-[13.5px] sm:text-sm leading-relaxed text-[var(--foreground)]">{children}</p>;
                      },
                      pre({ children }) {
                        return <>{children}</>;
                      },
                      ul({ children }) {
                        return <ul className="list-disc list-outside ml-5 my-2 space-y-1 text-[13.5px] sm:text-sm text-[var(--foreground)]">{children}</ul>;
                      },
                      ol({ children }) {
                        return <ol className="list-decimal list-outside ml-5 my-2 space-y-1 text-[13.5px] sm:text-sm text-[var(--foreground)]">{children}</ol>;
                      },
                      li({ children }) {
                        return <li className="leading-relaxed pl-0.5 my-0.5">{children}</li>;
                      },
                      h1({ children }) {
                        return <h1 className="text-lg sm:text-xl font-bold mt-4 mb-2 text-[var(--foreground)] pb-1 border-b border-[var(--sidebar-border)]/50">{children}</h1>;
                      },
                      h2({ children }) {
                        return <h2 className="text-base sm:text-lg font-bold mt-3.5 mb-1.5 text-[var(--foreground)] pb-0.5 border-b border-[var(--sidebar-border)]/30">{children}</h2>;
                      },
                      h3({ children }) {
                        return <h3 className="text-sm sm:text-base font-semibold mt-3 mb-1 text-[var(--foreground)]">{children}</h3>;
                      },
                      h4({ children }) {
                        return <h4 className="text-xs sm:text-sm font-semibold mt-2.5 mb-1 text-[var(--foreground)]">{children}</h4>;
                      },
                      blockquote({ children }) {
                        return (
                          <blockquote className="border-l-4 border-emerald-500/60 bg-[var(--sidebar-bg)]/40 pl-3.5 py-2 my-3 rounded-r-xl italic text-[var(--muted)]">
                            {children}
                          </blockquote>
                        );
                      },
                      hr() {
                        return <hr className="my-4 border-[var(--sidebar-border)]" />;
                      },
                      a({ href, children }) {
                        return (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors inline-flex items-center gap-0.5"
                          >
                            <span>{children}</span>
                            <ExternalLink className="w-3 h-3 inline-block" />
                          </a>
                        );
                      },
                      strong({ children }) {
                        return <strong className="font-semibold text-[var(--foreground)]">{children}</strong>;
                      },
                      em({ children }) {
                        return <em className="italic">{children}</em>;
                      },
                      code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || "");
                        const language = match ? match[1] : "";
                        const codeText = String(children).replace(/\n$/, "");

                        if (!inline && language) {
                          return <CodeBlock value={codeText} language={language} />;
                        }

                        if (!inline && codeText.includes("\n")) {
                          return <CodeBlock value={codeText} language="text" />;
                        }

                        return (
                          <code
                            className="px-1.5 py-0.5 rounded-md font-mono text-[13px] bg-[var(--card-bg)]/70 border border-[var(--card-border)] text-emerald-400 font-medium"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      },
                      table({ children }) {
                        return (
                          <div className="my-3 overflow-x-auto rounded-2xl border border-[var(--card-border)] shadow-xs">
                            <table className="min-w-full divide-y divide-[var(--card-border)] text-xs sm:text-sm">
                              {children}
                            </table>
                          </div>
                        );
                      },
                      th({ children }) {
                        return (
                          <th className="px-3.5 py-2.5 bg-[var(--card-bg)]/80 text-left font-semibold text-[var(--foreground)]">
                            {children}
                          </th>
                        );
                      },
                      td({ children }) {
                        return (
                          <td className="px-3.5 py-2 border-t border-[var(--card-border)] text-[var(--foreground)]">
                            {children}
                          </td>
                        );
                      },
                    }}
                  >
                    {cleanContent || (isStreaming ? "▋" : "")}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {/* Web Search Sources */}
          {sources.length > 0 && !isUser && (
            <div className="mt-3 pt-2 border-t border-[var(--sidebar-border)]/50 space-y-2">
              <button
                onClick={() => setShowSources(!showSources)}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Citations & Sources ({sources.length})</span>
              </button>

              {showSources && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {sources.map((src, idx) => (
                    <a
                      key={idx}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-xl bg-[var(--card-bg)]/50 backdrop-blur-xs border border-[var(--card-border)] hover:border-blue-500/40 hover:bg-[var(--sidebar-hover)] transition-all flex items-start gap-2 group/card text-xs shadow-2xs"
                    >
                      <div className="w-4 h-4 rounded-md bg-blue-500/10 text-blue-400 flex items-center justify-center font-mono font-bold text-[10px] flex-shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-[var(--foreground)] truncate group-hover/card:text-blue-400 transition-colors flex items-center gap-1.5">
                          <span className="truncate">{src.title}</span>
                          {src.scraped && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex-shrink-0 leading-none">
                              Scraped
                            </span>
                          )}
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover/card:opacity-100 transition-opacity flex-shrink-0 ml-auto" />
                        </div>
                        {src.snippet && (
                          <p className="text-[11px] text-[var(--muted)] line-clamp-2 mt-0.5">
                            {src.snippet}
                          </p>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Bottom Action & Performance Toolbar */}
          {!isEditing && (
            <div className="pt-1.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5 min-w-0">
                {/* Left: Performance Metrics & Token Engine (Assistant only) */}
                <div className="flex items-center gap-1.5 min-w-0">
                  {/* Live Streaming TPS & Tokens */}
                  {!isUser && isStreaming && liveStats && liveStats.liveTps > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse shadow-2xs">
                      <Zap className="w-2.5 h-2.5 fill-current text-emerald-400" />
                      <span>{liveStats.liveTps.toFixed(1)} t/s • {liveStats.tokenCount} tokens</span>
                    </span>
                  )}

                  {/* Finished Performance Metrics & Tokens Engine Badge */}
                  {!isUser && !isStreaming && metrics && (metrics.evalTps || metrics.evalCount) && (
                    <button
                      type="button"
                      onClick={() => setShowMetricsDetail(!showMetricsDetail)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium transition-all cursor-pointer shadow-2xs ${
                        showMetricsDetail
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/40 shadow-xs"
                          : "bg-[var(--sidebar-bg)] hover:bg-[var(--sidebar-hover)] text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--card-border)]"
                      }`}
                      title="Click to view Token Engine & Performance breakdown"
                    >
                      <Zap className="w-2.5 h-2.5 text-blue-400" />
                      <span>
                        {metrics.evalTps === 999 ? (
                          <span className="text-amber-400 font-semibold">⚡ Instant Cached</span>
                        ) : metrics.evalTps ? (
                          `${metrics.evalTps.toFixed(1)} t/s`
                        ) : (
                          "Tokens Engine"
                        )}
                        {metrics.evalCount ? ` • ${metrics.evalCount} tok` : ""}
                        {metrics.evalTps !== 999 && metrics.totalSeconds
                          ? ` • ${metrics.totalSeconds}s`
                          : metrics.evalDuration
                          ? ` • ${(metrics.evalDuration / 1e9).toFixed(1)}s`
                          : ""}
                      </span>
                      <ChevronDown className={`w-2.5 h-2.5 text-[var(--muted)] transition-transform duration-150 ${showMetricsDetail ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </div>

                {/* Right: Actions (Copy, Edit, Regenerate, Delete, Time) */}
                <div className="flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                    title="Copy message text"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>

                  {/* Download Message as Markdown */}
                  <button
                    type="button"
                    onClick={handleDownloadMessage}
                    className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                    title="Download message as .md file"
                  >
                    {downloaded ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5" />}
                  </button>

                  {isUser && onEdit && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                      title="Edit message"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {!isUser && onRegenerate && (
                    <button
                      onClick={() => onRegenerate(message.id)}
                      disabled={isStreaming}
                      className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer disabled:opacity-50"
                      title="Regenerate response"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Text-to-Speech (TTS Read Aloud) */}
                  {!isUser && !isStreaming && (
                    <button
                      type="button"
                      onClick={handleToggleSpeech}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        isSpeaking
                          ? "text-emerald-400 bg-emerald-500/20 shadow-xs ring-1 ring-emerald-500/40"
                          : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                      }`}
                      title={isSpeaking ? "Stop read aloud" : "Read aloud (Text-to-Speech)"}
                    >
                      {isSpeaking ? (
                        <Square className="w-3.5 h-3.5 fill-current animate-pulse" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}

                  {/* Fork / Branch Conversation */}
                  {!isUser && onForkConversation && (
                    <button
                      type="button"
                      onClick={() => onForkConversation(message.id)}
                      className="p-1.5 rounded-lg text-[var(--muted)] hover:text-purple-400 hover:bg-purple-500/10 transition-colors cursor-pointer"
                      title="Fork / Branch chat from this message"
                    >
                      <GitFork className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Delete */}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(message.id)}
                      className="p-1.5 rounded-lg text-[var(--muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Delete message"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {formattedTime && (
                    <span className="text-[10px] text-[var(--muted)] opacity-60 ml-1">
                      {formattedTime}
                    </span>
                  )}
                </div>
              </div>

              {/* Expandable Performance Metrics & Token Engine Breakdown Card */}
              {showMetricsDetail && metrics && !isUser && (
                <div className="p-3 rounded-2xl bg-[var(--card-bg)]/80 backdrop-blur-md border border-[var(--card-border)] text-xs text-[var(--foreground)] space-y-2 shadow-xs animate-in fade-in zoom-in-95">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--muted)] pb-1.5 border-b border-[var(--sidebar-border)]">
                    <span className="flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-blue-400" />
                      Performance Metrics & Token Engine
                    </span>
                    <button
                      onClick={() => setShowMetricsDetail(false)}
                      className="text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1 font-mono text-[11px]">
                    <div className="p-2 rounded-xl bg-[var(--sidebar-bg)]/60 border border-[var(--card-border)]">
                      <div className="text-[10px] text-[var(--muted)]">Generation Speed</div>
                      <div className="font-bold text-emerald-400 text-sm mt-0.5">
                        {metrics.evalTps?.toFixed(1) || "0"} <span className="text-[10px]">t/s</span>
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-[var(--sidebar-bg)]/60 border border-[var(--card-border)]">
                      <div className="text-[10px] text-[var(--muted)]">Generated Tokens</div>
                      <div className="font-bold text-[var(--foreground)] text-sm mt-0.5">
                        {metrics.evalCount || 0}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-[var(--sidebar-bg)]/60 border border-[var(--card-border)]">
                      <div className="text-[10px] text-[var(--muted)]">Prompt Processing</div>
                      <div className="font-bold text-cyan-400 text-sm mt-0.5">
                        {metrics.promptEvalTps ? `${metrics.promptEvalTps.toFixed(1)} t/s` : `${metrics.promptEvalCount || 0} tok`}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-[var(--sidebar-bg)]/60 border border-[var(--card-border)]">
                      <div className="text-[10px] text-[var(--muted)]">Total Latency</div>
                      <div className="font-bold text-purple-400 text-sm mt-0.5">
                        {metrics.totalSeconds ? `${metrics.totalSeconds}s` : `${metrics.evalDuration ? (metrics.evalDuration / 1e9).toFixed(2) : 0}s`}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-full max-h-[90vh] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};

export const ChatMessage = React.memo(ChatMessageComponent, (prevProps, nextProps) => {
  if (prevProps.message.id !== nextProps.message.id) return false;
  if (prevProps.message.content !== nextProps.message.content) return false;
  if (prevProps.isStreaming !== nextProps.isStreaming) return false;
  if (prevProps.liveStats?.tokenCount !== nextProps.liveStats?.tokenCount) return false;
  if (prevProps.liveStats?.liveTps !== nextProps.liveStats?.liveTps) return false;
  if (prevProps.message.isError !== nextProps.message.isError) return false;
  if (prevProps.message.attachments?.length !== nextProps.message.attachments?.length) return false;
  if (prevProps.message.toolExecutions?.length !== nextProps.message.toolExecutions?.length) return false;
  if (
    prevProps.message.toolExecutions?.some(
      (t, i) => t.status !== nextProps.message.toolExecutions?.[i]?.status
    )
  )
    return false;
  return true;
});
