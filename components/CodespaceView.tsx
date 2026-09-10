"use client";

import React, { useState } from "react";
import { apiFetch } from "../lib/apiClient";
import {
  Code2,
  Play,
  Copy,
  Check,
  Download,
  Sparkles,
  Bug,
  Zap,
  FileText,
  FileCode,
  Plus,
  Trash2,
  Maximize2,
  Minimize2,
  Terminal,
  Eye,
  RefreshCw,
  Sliders,
  Send,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import { OllamaModel, ApiKeysConfig } from "@/lib/types";

interface CodeSnippet {
  id: string;
  name: string;
  language: string;
  content: string;
}

const DEFAULT_SNIPPETS: CodeSnippet[] = [
  {
    id: "ts_1",
    name: "server.ts",
    language: "typescript",
    content: `// TypeScript API Route Handler with In-Memory Caching
import { createServer, IncomingMessage, ServerResponse } from "http";

interface CacheItem<T> {
  data: T;
  expiresAt: number;
}

class FastCache<T> {
  private store = new Map<string, CacheItem<T>>();

  set(key: string, data: T, ttlMs = 60000): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  get(key: string): T | null {
    const item = this.store.get(key);
    if (!item || Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.data;
  }
}

const cache = new FastCache<{ status: string; timestamp: number }>();

console.log("🚀 Server initialized with High-Speed LRU Cache!");
`,
  },
  {
    id: "html_1",
    name: "card.html",
    language: "html",
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-white min-h-screen flex items-center justify-center p-6">
  <div class="max-w-sm p-6 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 shadow-2xl space-y-4">
    <div class="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-2xl shadow-lg shadow-indigo-500/30">
      ⚡
    </div>
    <h2 class="text-xl font-bold tracking-tight">Interactive Codespace</h2>
    <p class="text-xs text-slate-400 leading-relaxed">
      Live sandboxed execution with AI code refactoring, performance profiling, and bug fixes.
    </p>
    <button class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md transition-all active:scale-95">
      Deploy to Staging
    </button>
  </div>
</body>
</html>`,
  },
  {
    id: "py_1",
    name: "agent.py",
    language: "python",
    content: `# Python Asynchronous LLM Tool Calling Pipeline
import asyncio
from typing import Dict, Any, List

class AgentWorkflow:
    def __init__(self, model_name: str = "llama3.1:8b"):
        self.model_name = model_name
        self.tools = []

    async def execute_task(self, prompt: str) -> Dict[str, Any]:
        print(f"[Agent] Executing task with {self.model_name}: {prompt}")
        await asyncio.sleep(0.5)
        return {
            "status": "success",
            "prompt": prompt,
            "tokens_processed": 1420,
            "latency_ms": 320
        }

if __name__ == "__main__":
    agent = AgentWorkflow()
    asyncio.run(agent.execute_task("Analyze security logs and extract anomalous IP addresses."))
`,
  },
];

interface CodespaceViewProps {
  models: OllamaModel[];
  selectedModel: string;
  apiKeys?: ApiKeysConfig;
  onSendToChat?: (text: string) => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const CodespaceView: React.FC<CodespaceViewProps> = ({
  models,
  selectedModel,
  apiKeys,
  onSendToChat,
  sidebarOpen,
  onToggleSidebar,
}) => {
  const [snippets, setSnippets] = useState<CodeSnippet[]>(DEFAULT_SNIPPETS);
  const [activeSnippetId, setActiveSnippetId] = useState<string>(DEFAULT_SNIPPETS[0].id);
  const [copied, setCopied] = useState(false);
  const [outputTab, setOutputTab] = useState<"ai" | "console" | "preview">("ai");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    "Codespace Runtime Ready (Node.js & Web Sandbox)",
    "Type or paste code, then click AI Review, Run, or Preview.",
  ]);
  const [aiReviewOutput, setAiReviewOutput] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState("");
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isEnvMenuOpen, setIsEnvMenuOpen] = useState(false);

  const activeSnippet = snippets.find((s) => s.id === activeSnippetId) || snippets[0];

  const updateActiveContent = (newContent: string) => {
    setSnippets((prev) =>
      prev.map((s) => (s.id === activeSnippet.id ? { ...s, content: newContent } : s))
    );
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(activeSnippet.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([activeSnippet.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = activeSnippet.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;

    const name = newFileName.trim();
    let lang = "typescript";
    if (name.endsWith(".py")) lang = "python";
    else if (name.endsWith(".html")) lang = "html";
    else if (name.endsWith(".css")) lang = "css";
    else if (name.endsWith(".sql")) lang = "sql";
    else if (name.endsWith(".json")) lang = "json";
    else if (name.endsWith(".rs")) lang = "rust";
    else if (name.endsWith(".go")) lang = "go";

    const newSnippet: CodeSnippet = {
      id: `snip_${Date.now()}`,
      name,
      language: lang,
      content: `// ${name}\n\n`,
    };

    setSnippets((prev) => [...prev, newSnippet]);
    setActiveSnippetId(newSnippet.id);
    setNewFileName("");
    setIsCreatingFile(false);
  };

  const handleDeleteFile = (id: string) => {
    if (snippets.length <= 1) return;
    const updated = snippets.filter((s) => s.id !== id);
    setSnippets(updated);
    setActiveSnippetId(updated[0].id);
  };

  // Run Code in Client Sandbox
  const handleRunCode = () => {
    setOutputTab("console");
    setConsoleLogs((prev) => [...prev, `\n▶ Running ${activeSnippet.name}...`]);

    if (activeSnippet.language === "html") {
      setOutputTab("preview");
      return;
    }

    if (activeSnippet.language === "javascript" || activeSnippet.language === "typescript") {
      try {
        const captured: string[] = [];
        const customConsole = {
          log: (...args: any[]) => captured.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a))).join(" ")),
          error: (...args: any[]) => captured.push(`[ERROR] ${args.join(" ")}`),
          warn: (...args: any[]) => captured.push(`[WARN] ${args.join(" ")}`),
        };

        // Safe eval simulation
        const runnable = activeSnippet.content.replace(/import\s+.*?from\s+['"].*?['"];?/g, "");
        const runFn = new Function("console", runnable);
        runFn(customConsole);

        if (captured.length > 0) {
          setConsoleLogs((prev) => [...prev, ...captured, "✓ Execution completed successfully."]);
        } else {
          setConsoleLogs((prev) => [...prev, "✓ Code executed (no console output produced)."]);
        }
      } catch (err: any) {
        setConsoleLogs((prev) => [...prev, `❌ Runtime Error: ${err.message}`]);
      }
    } else {
      setConsoleLogs((prev) => [
        ...prev,
        `ℹ️ Direct browser execution is supported for JavaScript/TypeScript and HTML/CSS. For ${activeSnippet.language}, send to AI for simulation.`,
      ]);
    }
  };

  // AI Copilot Actions (Review, Bug Fix, Optimize)
  const handleAiAction = async (actionType: "review" | "fix" | "optimize" | "docs" | "tests") => {
    setIsAiLoading(true);
    setOutputTab("ai");
    setAiReviewOutput(`⏳ Asking AI (${selectedModel || "Local AI"}) to analyze ${activeSnippet.name}...`);

    let prompt = "";
    if (actionType === "review") {
      prompt = `You are a Staff Principal Engineer. Perform a comprehensive code review on the following ${activeSnippet.language} code:\n\n\`\`\`${activeSnippet.language}\n${activeSnippet.content}\n\`\`\`\n\nProvide:
1. Overall Quality Score (1-10)
2. Security & Vulnerability Audit (OWASP)
3. Code Smells & Memory Leak checks
4. Recommended Clean Code Refactoring`;
    } else if (actionType === "fix") {
      prompt = `You are an expert software debugger. Find and fix all bugs, edge-case crashes, and type errors in the following ${activeSnippet.language} code. Output the full corrected code and explain what was fixed:\n\n\`\`\`${activeSnippet.language}\n${activeSnippet.content}\n\`\`\``;
    } else if (actionType === "optimize") {
      prompt = `You are an algorithm performance specialist. Analyze the time and space complexity (Big-O) of this ${activeSnippet.language} code and rewrite it for maximum execution speed and minimum memory footprint:\n\n\`\`\`${activeSnippet.language}\n${activeSnippet.content}\n\`\`\``;
    } else if (actionType === "docs") {
      prompt = `Add clean, comprehensive documentation comments (JSDoc/TSDoc/PyDoc) and type annotations to this code:\n\n\`\`\`${activeSnippet.language}\n${activeSnippet.content}\n\`\`\``;
    } else if (actionType === "tests") {
      prompt = `Write a complete, robust suite of unit tests with 100% branch coverage (covering happy path, error cases, and boundary conditions) for:\n\n\`\`\`${activeSnippet.language}\n${activeSnippet.content}\n\`\`\``;
    }

    try {
      // Call Cloud AI or Local Ollama API
      const isCloudModel = !models.some((m) => m.name === selectedModel);
      let fullResponse = "";

      if (isCloudModel) {
        const res = await apiFetch("/api/cloud/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: prompt }],
            model: selectedModel,
            apiKeys,
            stream: true,
          }),
        });

        if (!res.ok) throw new Error(`Cloud API returned status ${res.status}`);
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullResponse += decoder.decode(value);
            setAiReviewOutput(fullResponse);
          }
        }
      } else {
        const res = await apiFetch("/api/ollama/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: selectedModel || models[0]?.name || "llama3.1:latest",
            messages: [{ role: "user", content: prompt }],
            stream: false,
          }),
        });
        if (!res.ok) throw new Error("Ollama model execution error");
        const data = await res.json();
        fullResponse = data.message?.content || "No response received";
        setAiReviewOutput(fullResponse);
      }
    } catch (err: any) {
      setAiReviewOutput(`❌ AI Analysis Error: ${err.message}. Make sure the selected model or API key is active.`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const lineCount = activeSnippet.content.split("\n").length;

  return (
    <div className="flex-1 flex flex-col h-[100dvh] w-full overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* Top Codespace Toolbar */}
      <header className="flex-shrink-0 h-13 sm:h-14 border-b border-[var(--sidebar-border)] px-2 sm:px-4 flex items-center justify-between bg-[var(--header-bg)] backdrop-blur-md z-30 gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          {/* Sidebar Minimize / Expand Button */}
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-1.5 sm:p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors flex-shrink-0 cursor-pointer"
              title={sidebarOpen ? "Minimize sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
            </button>
          )}

          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0">
              <Code2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-bold text-[var(--foreground)] truncate">Codespace Studio</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-blue-500/15 text-blue-400 font-semibold hidden xs:inline">
                  IDE
                </span>
              </div>
              <span className="text-[10px] text-[var(--muted)] truncate block">
                Active: {activeSnippet.name} ({activeSnippet.language})
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* AI Review Quick Button */}
          <button
            onClick={() => handleAiAction("review")}
            disabled={isAiLoading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-400 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Perform automated Staff AI Code Review"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI Review</span>
          </button>

          {/* Run Code */}
          <button
            onClick={handleRunCode}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-95 cursor-pointer shadow-xs"
            title="Execute Code in Sandbox or Live Preview"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run</span>
          </button>

          {/* Copy Code */}
          <button
            onClick={handleCopyCode}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-medium bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-[var(--foreground)] transition-colors cursor-pointer"
            title="Copy Code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Download File */}
          <button
            onClick={handleDownload}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-medium bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-[var(--foreground)] transition-colors cursor-pointer hidden sm:flex items-center gap-1"
            title="Download File"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Split Layout: Left File Explorer, Center Code Editor, Right AI & Output Sandbox */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Snippet File Tabs / Sidebar */}
        <div className="w-full lg:w-56 border-b lg:border-b-0 lg:border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/40 p-2.5 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-y-auto flex-shrink-0 touch-scroll">
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Files ({snippets.length})
            </span>
            <button
              onClick={() => setIsCreatingFile(!isCreatingFile)}
              className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
              title="Add new code file"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Create File Input */}
          {isCreatingFile && (
            <form onSubmit={handleCreateFile} className="mb-2 space-y-1 animate-in fade-in">
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="filename.ts, .py, .html"
                autoFocus
                className="w-full px-2 py-1 text-xs rounded-lg border border-blue-500 bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none"
              />
            </form>
          )}

          {snippets.map((snip) => {
            const isSelected = snip.id === activeSnippet.id;
            return (
              <div
                key={snip.id}
                onClick={() => setActiveSnippetId(snip.id)}
                className={`group flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs cursor-pointer transition-all ${
                  isSelected
                    ? "bg-[var(--card-bg)] text-blue-400 font-semibold shadow-xs border border-[var(--card-border)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 pr-1">
                  <FileCode className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{snip.name}</span>
                </div>
                {snippets.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(snip.id);
                    }}
                    className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-rose-400 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Center Code Editor Pane */}
        <div className="flex-1 flex flex-col min-w-0 border-b lg:border-b-0 lg:border-r border-[var(--sidebar-border)] bg-[var(--card-bg)]/20">
          {/* Quick AI Action Bar Above Editor */}
          <div className="px-3 py-2 border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/60 flex items-center gap-1.5 overflow-x-auto touch-scroll">
            <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider mr-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" /> Copilot:
            </span>
            <button
              onClick={() => handleAiAction("fix")}
              disabled={isAiLoading}
              className="px-2.5 py-1 rounded-lg text-xs bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-emerald-400 font-medium transition-colors cursor-pointer flex items-center gap-1 flex-shrink-0"
            >
              <Bug className="w-3 h-3" /> Fix Bugs
            </button>
            <button
              onClick={() => handleAiAction("optimize")}
              disabled={isAiLoading}
              className="px-2.5 py-1 rounded-lg text-xs bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-amber-400 font-medium transition-colors cursor-pointer flex items-center gap-1 flex-shrink-0"
            >
              <Zap className="w-3 h-3" /> Optimize Speed
            </button>
            <button
              onClick={() => handleAiAction("docs")}
              disabled={isAiLoading}
              className="px-2.5 py-1 rounded-lg text-xs bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-blue-400 font-medium transition-colors cursor-pointer flex items-center gap-1 flex-shrink-0"
            >
              <FileText className="w-3 h-3" /> Add Comments
            </button>
            <button
              onClick={() => handleAiAction("tests")}
              disabled={isAiLoading}
              className="px-2.5 py-1 rounded-lg text-xs bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-purple-400 font-medium transition-colors cursor-pointer flex items-center gap-1 flex-shrink-0"
            >
              🧪 Unit Tests
            </button>
          </div>

          {/* Monaco-style Code Input with Line Numbers */}
          <div className="flex-1 flex overflow-hidden font-mono text-xs sm:text-sm">
            {/* Line Numbers Column */}
            <div className="w-10 sm:w-12 py-3 bg-[var(--sidebar-bg)]/70 text-right pr-2 select-none text-[var(--muted)] opacity-60 border-r border-[var(--sidebar-border)]/40 space-y-0.5 overflow-hidden">
              {Array.from({ length: lineCount }).map((_, i) => (
                <div key={i} className="leading-relaxed text-[11px] font-mono">
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Code Textarea */}
            <textarea
              value={activeSnippet.content}
              onChange={(e) => updateActiveContent(e.target.value)}
              spellCheck={false}
              className="flex-1 p-3 bg-transparent text-[var(--foreground)] focus:outline-none resize-none overflow-y-auto leading-relaxed font-mono touch-scroll"
              placeholder="// Write or paste your code here..."
            />
          </div>
        </div>

        {/* Right Output, Sandbox & AI Analysis Panel */}
        <div className="w-full lg:w-[420px] flex flex-col bg-[var(--sidebar-bg)]/50 flex-shrink-0 overflow-hidden">
          {/* Tab Switcher */}
          <div className="flex border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] p-1 gap-1">
            <button
              onClick={() => setOutputTab("ai")}
              className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                outputTab === "ai"
                  ? "bg-[var(--card-bg)] text-purple-400 shadow-xs border border-[var(--card-border)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Analysis</span>
            </button>

            <button
              onClick={() => setOutputTab("console")}
              className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                outputTab === "console"
                  ? "bg-[var(--card-bg)] text-emerald-400 shadow-xs border border-[var(--card-border)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Console</span>
            </button>

            <button
              onClick={() => setOutputTab("preview")}
              className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                outputTab === "preview"
                  ? "bg-[var(--card-bg)] text-blue-400 shadow-xs border border-[var(--card-border)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Live Preview</span>
            </button>
          </div>

          {/* Tab 1: AI Code Review & Feedback */}
          {outputTab === "ai" && (
            <div className="flex-1 p-4 overflow-y-auto space-y-3 touch-scroll text-xs">
              <div className="flex items-center justify-between text-xs text-[var(--muted)] pb-2 border-b border-[var(--sidebar-border)]">
                <span className="font-semibold text-[var(--foreground)]">Staff Engineer Intelligence</span>
                {isAiLoading && (
                  <span className="flex items-center gap-1 text-purple-400">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Thinking...
                  </span>
                )}
              </div>

              {aiReviewOutput ? (
                <div className="whitespace-pre-wrap leading-relaxed font-sans text-xs text-[var(--foreground)] bg-[var(--card-bg)]/60 p-3.5 rounded-2xl border border-[var(--card-border)]">
                  {aiReviewOutput}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-[var(--muted)] space-y-2">
                  <Sparkles className="w-8 h-8 text-purple-400/50 mx-auto" />
                  <p className="font-medium">No active analysis yet.</p>
                  <p className="text-[11px] max-w-xs mx-auto">
                    Click <strong>AI Review</strong>, <strong>Fix Bugs</strong>, or <strong>Optimize</strong> above to audit this code.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Console Logs */}
          {outputTab === "console" && (
            <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1.5 bg-black/40 text-emerald-400 touch-scroll">
              <div className="text-[10px] uppercase font-bold text-[var(--muted)] border-b border-[var(--sidebar-border)]/40 pb-1 mb-2">
                Execution Output & Telemetry
              </div>
              {consoleLogs.map((log, idx) => (
                <div key={idx} className="leading-relaxed">
                  {log}
                </div>
              ))}
            </div>
          )}

          {/* Tab 3: Live HTML/CSS Sandboxed IFrame Preview */}
          {outputTab === "preview" && (
            <div className="flex-1 flex flex-col bg-white">
              {activeSnippet.language === "html" ? (
                <iframe
                  title="Codespace Preview"
                  srcDoc={activeSnippet.content}
                  className="w-full h-full border-none"
                  sandbox="allow-scripts allow-modals allow-same-origin"
                />
              ) : (
                <div className="p-6 text-center text-xs text-slate-600">
                  <p className="font-semibold text-slate-800 mb-1">Live HTML Preview</p>
                  <p>Select a <code>.html</code> file or switch to HTML tab to render interactive sandboxed UI.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
