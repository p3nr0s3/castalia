"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
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
  Terminal,
  Eye,
  RefreshCw,
  Sliders,
  Send,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  Search,
  X,
  ChevronRight,
  Edit2,
  FilePlus,
  GripVertical,
  RotateCcw,
  Clock,
  CheckCircle2,
  AlertCircle,
  FolderCode,
  FileArchive,
  Maximize2,
  Minimize2,
  HelpCircle,
  Cpu,
} from "lucide-react";
import { OllamaModel, ApiKeysConfig } from "@/lib/types";

export interface CodeSnippet {
  id: string;
  name: string;
  language: string;
  content: string;
  updatedAt?: number;
}

const DEFAULT_SNIPPETS: CodeSnippet[] = [
  {
    id: "py_1",
    name: "agent.py",
    language: "python",
    content: `# Python Asynchronous LLM Tool Calling Pipeline
import asyncio
import time
from typing import Dict, Any, List

class AgentWorkflow:
    def __init__(self, model_name: str = "llama3.1:8b"):
        self.model_name = model_name
        self.steps = []

    async def execute_task(self, prompt: str) -> Dict[str, Any]:
        print(f"[Agent] Starting task with model: {self.model_name}")
        print(f"[Agent] Prompt: '{prompt}'")
        
        # Simulate multi-step tool reasoning
        for i in range(1, 4):
            await asyncio.sleep(0.3)
            step_msg = f"Step {i}: Analyzing semantic tokens & retrieving local context..."
            print(f"  -> {step_msg}")
            self.steps.append(step_msg)
        
        result = {
            "status": "success",
            "prompt": prompt,
            "total_steps": len(self.steps),
            "tokens_processed": 1420,
            "latency_ms": 910
        }
        print(f"[Agent] Finished successfully: {result}")
        return result

if __name__ == "__main__":
    start = time.time()
    agent = AgentWorkflow()
    asyncio.run(agent.execute_task("Analyze security logs and extract anomalous IP addresses."))
    print(f"[System] Total runtime: {round((time.time() - start) * 1000, 2)} ms")
`,
  },
  {
    id: "ts_1",
    name: "server.ts",
    language: "typescript",
    content: `// TypeScript API Route Handler with In-Memory Caching
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
cache.set("health", { status: "operational", timestamp: Date.now() });

console.log("🚀 Server initialized with High-Speed LRU Cache!");
console.log("Cache lookup ('health'):", cache.get("health"));
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
<body class="bg-slate-950 text-white min-h-screen flex items-center justify-center p-6 font-sans">
  <div class="max-w-sm p-6 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 shadow-2xl space-y-4 text-center">
    <div class="w-14 h-14 rounded-2xl bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-3xl shadow-lg shadow-indigo-500/30 mx-auto">
      ⚡
    </div>
    <h2 class="text-xl font-bold tracking-tight text-indigo-200">Interactive Codespace Studio</h2>
    <p class="text-xs text-slate-400 leading-relaxed">
      Full Web IDE with live Python interpreter, Node.js runner, resizable sidebars, and Staff AI Copilot.
    </p>
    <div class="pt-2">
      <button onclick="alert('⚡ Codespace runtime is active!')" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md transition-all active:scale-95 cursor-pointer">
        Click for Test Event
      </button>
    </div>
  </div>
</body>
</html>`,
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

interface LogEntry {
  id: string;
  text: string;
  type: "stdout" | "stderr" | "info" | "success" | "warn";
  timestamp: string;
}

interface RunTelemetry {
  status: "idle" | "running" | "success" | "error";
  exitCode: number | null;
  durationMs: number | null;
  runner: string;
}

function detectLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs")) return "javascript";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".sql")) return "sql";
  if (lower.endsWith(".sh") || lower.endsWith(".bash")) return "shell";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".yar") || lower.endsWith(".yara")) return "yara";
  return "plaintext";
}

function getFileBadgeColor(lang: string): { bg: string; text: string; border: string; label: string } {
  switch (lang) {
    case "python":
      return { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30", label: "PY" };
    case "typescript":
      return { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30", label: "TS" };
    case "javascript":
      return { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/30", label: "JS" };
    case "html":
      return { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30", label: "HTML" };
    case "css":
      return { bg: "bg-sky-500/10", text: "text-sky-400", border: "border-sky-500/30", label: "CSS" };
    case "json":
      return { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30", label: "JSON" };
    case "sql":
      return { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30", label: "SQL" };
    case "shell":
      return { bg: "bg-lime-500/10", text: "text-lime-400", border: "border-lime-500/30", label: "SH" };
    case "markdown":
      return { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/30", label: "MD" };
    default:
      return { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/30", label: "TXT" };
  }
}

export const CodespaceView: React.FC<CodespaceViewProps> = ({
  models,
  selectedModel,
  apiKeys,
  onSendToChat,
  sidebarOpen,
  onToggleSidebar,
}) => {
  // Load snippets from localStorage or fallback
  const [snippets, setSnippets] = useState<CodeSnippet[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("codespace_snippets_v3");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return DEFAULT_SNIPPETS;
  });

  const [activeSnippetId, setActiveSnippetId] = useState<string>(() => {
    return snippets[0]?.id || DEFAULT_SNIPPETS[0].id;
  });

  // Open tabs
  const [openTabIds, setOpenTabIds] = useState<string[]>(() => {
    return snippets.slice(0, 3).map((s) => s.id);
  });

  // Persist snippets to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("codespace_snippets_v3", JSON.stringify(snippets));
    } catch {}
  }, [snippets]);

  // Slideable Panels Width & Collapse State
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("codespace_left_width");
      if (saved) return Math.min(Math.max(parseInt(saved, 10), 180), 450);
    }
    return 240;
  });

  const [rightWidth, setRightWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("codespace_right_width");
      if (saved) return Math.min(Math.max(parseInt(saved, 10), 280), 750);
    }
    return 420;
  });

  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  // Editor states
  const [copied, setCopied] = useState(false);
  const [outputTab, setOutputTab] = useState<"ai" | "console" | "preview">("console");
  const [fontSize, setFontSize] = useState<number>(13);
  const [wordWrap, setWordWrap] = useState<boolean>(false);
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({ line: 1, col: 1 });

  // Find & Replace
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");

  // Terminal & Execution
  const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([
    {
      id: "init_1",
      text: "Codespace Web IDE initialized with Python & Node.js interpreters.",
      type: "info",
      timestamp: new Date().toLocaleTimeString(),
    },
    {
      id: "init_2",
      text: "Click 'Run' or press Ctrl+Enter to execute. Draggable splitters can resize sidebars.",
      type: "info",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);

  const [telemetry, setTelemetry] = useState<RunTelemetry>({
    status: "idle",
    exitCode: null,
    durationMs: null,
    runner: "Ready",
  });

  // AI states
  const [aiReviewOutput, setAiReviewOutput] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiPromptInput, setAiPromptInput] = useState<string>("");

  // File explorer states
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");

  // Refs
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const consoleBottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Active Snippet
  const activeSnippet = useMemo(() => {
    return snippets.find((s) => s.id === activeSnippetId) || snippets[0] || DEFAULT_SNIPPETS[0];
  }, [snippets, activeSnippetId]);

  // Ensure active snippet is always in open tabs
  useEffect(() => {
    if (activeSnippet && !openTabIds.includes(activeSnippet.id)) {
      setOpenTabIds((prev) => [...prev, activeSnippet.id]);
    }
  }, [activeSnippet, openTabIds]);

  // Update content helper
  const updateActiveContent = (newContent: string) => {
    setSnippets((prev) =>
      prev.map((s) => (s.id === activeSnippet.id ? { ...s, content: newContent, updatedAt: Date.now() } : s))
    );
  };

  // Sync scroll between textarea and line numbers
  const handleEditorScroll = () => {
    if (editorRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = editorRef.current.scrollTop;
    }
  };

  // Cursor position tracking
  const handleCursorTracking = () => {
    if (!editorRef.current) return;
    const text = editorRef.current.value.slice(0, editorRef.current.selectionStart);
    const lines = text.split("\n");
    setCursorPos({
      line: lines.length,
      col: lines[lines.length - 1].length + 1,
    });
  };

  // Tab Key & Keyboard shortcuts
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter or Cmd+Enter: Run code
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleRunCode();
      return;
    }

    // Ctrl+F: Open Find
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      setIsSearchOpen((prev) => !prev);
      return;
    }

    // Tab key: Insert 2 spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = editorRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;

      const indent = "  ";
      const newValue = value.substring(0, start) + indent + value.substring(end);
      updateActiveContent(newValue);

      // Restore cursor
      setTimeout(() => {
        if (textarea) {
          textarea.selectionStart = textarea.selectionEnd = start + indent.length;
        }
      }, 0);
    }
  };

  // Resizing Logic: Pointer drag for Left and Right sidebars
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      if (isDraggingLeft) {
        const newW = Math.min(Math.max(e.clientX - rect.left, 180), 450);
        setLeftWidth(newW);
        try {
          localStorage.setItem("codespace_left_width", String(newW));
        } catch {}
      } else if (isDraggingRight) {
        const newW = Math.min(Math.max(rect.right - e.clientX, 280), 750);
        setRightWidth(newW);
        try {
          localStorage.setItem("codespace_right_width", String(newW));
        } catch {}
      }
    };

    const handlePointerUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
    };

    if (isDraggingLeft || isDraggingRight) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    }

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDraggingLeft, isDraggingRight]);

  // Sandboxed Iframe Runner for Pyodide & JS
  const runnerIframeRef = useRef<HTMLIFrameElement>(null);
  const currentRunIdRef = useRef(0);
  const [runnerDoc, setRunnerDoc] = useState<string | null>(null);

  useEffect(() => {
    function handleRunnerMessage(event: MessageEvent) {
      if (runnerIframeRef.current && event.source !== runnerIframeRef.current.contentWindow) return;
      const data = event.data;
      if (!data || data.__codespaceRunner !== true || data.runId !== currentRunIdRef.current) return;

      const timestamp = new Date().toLocaleTimeString();

      if (data.type === "log") {
        setConsoleLogs((prev) => [
          ...prev,
          { id: `log_${Date.now()}_${Math.random()}`, text: data.args.join(" "), type: "stdout", timestamp },
        ]);
      } else if (data.type === "warn") {
        setConsoleLogs((prev) => [
          ...prev,
          { id: `warn_${Date.now()}_${Math.random()}`, text: data.args.join(" "), type: "warn", timestamp },
        ]);
      } else if (data.type === "error") {
        setConsoleLogs((prev) => [
          ...prev,
          { id: `err_${Date.now()}_${Math.random()}`, text: data.args.join(" "), type: "stderr", timestamp },
        ]);
        setTelemetry((prev) => ({ ...prev, status: "error", exitCode: 1 }));
      } else if (data.type === "done") {
        setConsoleLogs((prev) => [
          ...prev,
          {
            id: `done_${Date.now()}_${Math.random()}`,
            text: "✓ Execution completed successfully.",
            type: "success",
            timestamp,
          },
        ]);
        setTelemetry((prev) => ({
          ...prev,
          status: "success",
          exitCode: 0,
          durationMs: data.durationMs || prev.durationMs,
        }));
      }
    }

    window.addEventListener("message", handleRunnerMessage);
    return () => window.removeEventListener("message", handleRunnerMessage);
  }, []);

  // Build sandboxed runner iframe document supporting Pyodide WebAssembly & JS
  const buildPyodideRunnerDoc = (code: string, runId: number): string => {
    const escaped = JSON.stringify(code);
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js"></script>
</head>
<body>
<script>
(async function() {
  var runId = ${runId};
  var startTime = Date.now();

  function send(type, args, durationMs) {
    try {
      parent.postMessage({
        __codespaceRunner: true,
        runId: runId,
        type: type,
        args: args.map(function(a) {
          try { return typeof a === "object" ? JSON.stringify(a, null, 2) : String(a); } catch (e) { return String(a); }
        }),
        durationMs: durationMs
      }, "*");
    } catch (e) {}
  }

  send("log", ["[Pyodide] Initializing Python 3.12 WebAssembly runtime..."]);

  try {
    if (!window.pyodideInstance) {
      window.pyodideInstance = await loadPyodide({
        stdout: function(text) { send("log", [text]); },
        stderr: function(text) { send("error", [text]); }
      });
      send("log", ["✓ Pyodide Python 3.12 WASM Engine Ready."]);
    }

    var code = ${escaped};
    await window.pyodideInstance.runPythonAsync(code);
    var duration = Date.now() - startTime;
    send("done", [], duration);
  } catch (err) {
    var duration = Date.now() - startTime;
    send("error", [err && err.message ? err.message : String(err)], duration);
  }
})();
</script>
</body>
</html>`;
  };

  const buildJsRunnerDoc = (code: string, runId: number): string => {
    const escaped = JSON.stringify(code);
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body>
<script>
(function() {
  var runId = ${runId};
  var startTime = Date.now();

  function send(type, args, durationMs) {
    try {
      parent.postMessage({
        __codespaceRunner: true,
        runId: runId,
        type: type,
        args: args.map(function(a) {
          try { return typeof a === "object" ? JSON.stringify(a, null, 2) : String(a); } catch (e) { return String(a); }
        }),
        durationMs: durationMs
      }, "*");
    } catch (e) {}
  }

  console.log = function() { send("log", Array.prototype.slice.call(arguments)); };
  console.warn = function() { send("warn", Array.prototype.slice.call(arguments)); };
  console.error = function() { send("error", Array.prototype.slice.call(arguments)); };
  window.onerror = function(msg) { send("error", [String(msg)]); return true; };

  try {
    var code = ${escaped};
    (new Function(code))();
    var duration = Date.now() - startTime;
    send("done", [], duration);
  } catch (err) {
    var duration = Date.now() - startTime;
    send("error", [err && err.message ? err.message : String(err)], duration);
  }
})();
</script>
</body>
</html>`;
  };

  // Run Code logic (Smart fallback: Native server runner -> Pyodide WASM / Client sandbox)
  const handleRunCode = async () => {
    setOutputTab("console");
    const timestamp = new Date().toLocaleTimeString();
    const runHeader = `▶ Running ${activeSnippet.name} (${activeSnippet.language.toUpperCase()})...`;

    setConsoleLogs((prev) => [
      ...prev,
      { id: `hdr_${Date.now()}`, text: `\n${runHeader}`, type: "info", timestamp },
    ]);

    setTelemetry({
      status: "running",
      exitCode: null,
      durationMs: null,
      runner: activeSnippet.language === "python" ? "Python Runner" : "Node.js Runner",
    });

    // HTML / CSS direct preview
    if (activeSnippet.language === "html") {
      setOutputTab("preview");
      setTelemetry({ status: "success", exitCode: 0, durationMs: 12, runner: "Live Browser Preview" });
      return;
    }

    // Python Execution
    if (activeSnippet.language === "python") {
      try {
        // Step 1: Attempt native server runner
        const res = await apiFetch("/api/codespace/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: activeSnippet.content,
            language: "python",
          }),
        });

        const data = await res.json();

        // If native python was found and ran
        if (!data.notFound && res.ok) {
          if (data.output) {
            setConsoleLogs((prev) => [
              ...prev,
              { id: `out_${Date.now()}`, text: data.output.trimEnd(), type: "stdout", timestamp },
            ]);
          }
          if (data.stderr) {
            setConsoleLogs((prev) => [
              ...prev,
              { id: `err_${Date.now()}`, text: data.stderr.trimEnd(), type: "stderr", timestamp },
            ]);
          }

          setTelemetry({
            status: data.success ? "success" : "error",
            exitCode: data.exitCode,
            durationMs: data.executionTimeMs,
            runner: data.runner || "Python 3 Native",
          });

          setConsoleLogs((prev) => [
            ...prev,
            {
              id: `done_${Date.now()}`,
              text: data.success
                ? `✓ Process finished successfully (exit: ${data.exitCode}, time: ${data.executionTimeMs}ms)`
                : `❌ Process exited with error code ${data.exitCode}`,
              type: data.success ? "success" : "stderr",
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);
          return;
        }

        // Step 2: Fallback to Pyodide WebAssembly runner
        setConsoleLogs((prev) => [
          ...prev,
          {
            id: `wasm_info_${Date.now()}`,
            text: "ℹ️ Native Python not detected on host. Executing via In-Browser WebAssembly (Pyodide Python 3.12)...",
            type: "warn",
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);

        const runId = ++currentRunIdRef.current;
        setRunnerDoc(buildPyodideRunnerDoc(activeSnippet.content, runId));
        setTelemetry({ status: "running", exitCode: null, durationMs: null, runner: "Pyodide Python 3.12 WASM" });
      } catch (err: any) {
        // Fallback to Pyodide WASM on server network failure
        const runId = ++currentRunIdRef.current;
        setRunnerDoc(buildPyodideRunnerDoc(activeSnippet.content, runId));
        setTelemetry({ status: "running", exitCode: null, durationMs: null, runner: "Pyodide Python 3.12 WASM" });
      }
      return;
    }

    // JavaScript / TypeScript: Run via Node.js backend (with native TS stripping)
    if (activeSnippet.language === "javascript" || activeSnippet.language === "typescript") {
      try {
        const res = await apiFetch("/api/codespace/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: activeSnippet.content,
            language: activeSnippet.language,
          }),
        });

        const data = await res.json();
        if (res.ok && !data.notFound) {
          if (data.output) {
            setConsoleLogs((prev) => [
              ...prev,
              { id: `out_${Date.now()}`, text: data.output.trimEnd(), type: "stdout", timestamp },
            ]);
          }
          if (data.stderr) {
            setConsoleLogs((prev) => [
              ...prev,
              { id: `err_${Date.now()}`, text: data.stderr.trimEnd(), type: "stderr", timestamp },
            ]);
          }

          setTelemetry({
            status: data.success ? "success" : "error",
            exitCode: data.exitCode,
            durationMs: data.executionTimeMs,
            runner: data.runner || "Node.js v24",
          });

          setConsoleLogs((prev) => [
            ...prev,
            {
              id: `done_${Date.now()}`,
              text: data.success
                ? `✓ Execution completed in ${data.executionTimeMs}ms`
                : `❌ Process exited with error code ${data.exitCode}`,
              type: data.success ? "success" : "stderr",
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);
          return;
        }
      } catch {}

      // Fallback to Sandboxed Iframe Runner
      const runnable = activeSnippet.content.replace(/import\s+.*?from\s+['"].*?['"];?/g, "");
      const runId = ++currentRunIdRef.current;
      setRunnerDoc(buildJsRunnerDoc(runnable, runId));
      setTelemetry({ status: "running", exitCode: null, durationMs: null, runner: "Browser Sandbox" });
      return;
    }

    // Other languages
    setConsoleLogs((prev) => [
      ...prev,
      {
        id: `other_${Date.now()}`,
        text: `ℹ️ Direct execution for ${activeSnippet.language.toUpperCase()} is not available locally. Use AI Review for simulation.`,
        type: "warn",
        timestamp,
      },
    ]);
    setTelemetry({ status: "idle", exitCode: null, durationMs: null, runner: "Ready" });
  };

  // AI Copilot Actions
  const handleAiAction = async (actionType: "review" | "fix" | "optimize" | "docs" | "tests" | "explain") => {
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
      prompt = `You are an expert software debugger. Find and fix all bugs, edge-case crashes, and type errors in the following ${activeSnippet.language} code. Output the full corrected code in a code block and explain what was fixed:\n\n\`\`\`${activeSnippet.language}\n${activeSnippet.content}\n\`\`\``;
    } else if (actionType === "optimize") {
      prompt = `You are an algorithm performance specialist. Analyze the time and space complexity (Big-O) of this ${activeSnippet.language} code and rewrite it for maximum execution speed and minimum memory footprint:\n\n\`\`\`${activeSnippet.language}\n${activeSnippet.content}\n\`\`\``;
    } else if (actionType === "docs") {
      prompt = `Add clean, comprehensive documentation comments (JSDoc/PyDoc) and type annotations to this code:\n\n\`\`\`${activeSnippet.language}\n${activeSnippet.content}\n\`\`\``;
    } else if (actionType === "tests") {
      prompt = `Write a complete, robust suite of unit tests with 100% branch coverage (covering happy path, error cases, and boundary conditions) for:\n\n\`\`\`${activeSnippet.language}\n${activeSnippet.content}\n\`\`\``;
    } else if (actionType === "explain") {
      prompt = `Explain the following ${activeSnippet.language} code step-by-step in clear, plain language:\n\n\`\`\`${activeSnippet.language}\n${activeSnippet.content}\n\`\`\``;
    }

    await executeAiPrompt(prompt);
  };

  // Custom AI Interactive Chat
  const handleAiCustomPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPromptInput.trim() || isAiLoading) return;

    const userQuery = aiPromptInput.trim();
    setAiPromptInput("");
    setIsAiLoading(true);
    setOutputTab("ai");

    const prompt = `Context: Active file '${activeSnippet.name}' (${activeSnippet.language}):\n\`\`\`${activeSnippet.language}\n${activeSnippet.content}\n\`\`\`\n\nUser Question: ${userQuery}\n\nPlease provide precise, actionable code advice and answers.`;
    await executeAiPrompt(prompt);
  };

  const executeAiPrompt = async (prompt: string) => {
    try {
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

        if (!res.ok) throw new Error(`Cloud API error (status ${res.status})`);
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
      setAiReviewOutput(`❌ AI Error: ${err.message}. Check model availability or API key settings.`);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Apply AI Generated Code back into Editor
  const handleApplyAiCode = () => {
    const codeBlockMatch = aiReviewOutput.match(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      updateActiveContent(codeBlockMatch[1]);
      setConsoleLogs((prev) => [
        ...prev,
        {
          id: `applied_${Date.now()}`,
          text: `✓ Applied AI generated code to ${activeSnippet.name}`,
          type: "success",
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } else {
      alert("No distinct code block found in the AI response to apply.");
    }
  };

  // File Explorer Operations
  const handleCreateFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;

    const name = newFileName.trim();
    const lang = detectLanguage(name);

    let starterCode = `// ${name}\n\n`;
    if (lang === "python") starterCode = `# ${name}\n\ndef main():\n    print("Hello from ${name}")\n\nif __name__ == "__main__":\n    main()\n`;
    else if (lang === "html") starterCode = `<!DOCTYPE html>\n<html>\n<head>\n  <title>${name}</title>\n</head>\n<body>\n  <h1>${name}</h1>\n</body>\n</html>\n`;

    const newSnippet: CodeSnippet = {
      id: `snip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      language: lang,
      content: starterCode,
      updatedAt: Date.now(),
    };

    setSnippets((prev) => [...prev, newSnippet]);
    setActiveSnippetId(newSnippet.id);
    setOpenTabIds((prev) => [...prev, newSnippet.id]);
    setNewFileName("");
    setIsCreatingFile(false);
  };

  const handleRenameFile = (id: string) => {
    if (!editNameValue.trim()) {
      setEditingFileId(null);
      return;
    }
    const newName = editNameValue.trim();
    const newLang = detectLanguage(newName);
    setSnippets((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name: newName, language: newLang, updatedAt: Date.now() } : s))
    );
    setEditingFileId(null);
  };

  const handleDeleteFile = (id: string) => {
    if (snippets.length <= 1) {
      alert("You must keep at least one file in Codespace.");
      return;
    }
    const updated = snippets.filter((s) => s.id !== id);
    setSnippets(updated);
    setOpenTabIds((prev) => prev.filter((tabId) => tabId !== id));
    if (activeSnippetId === id) {
      setActiveSnippetId(updated[0].id);
    }
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedTabs = openTabIds.filter((tabId) => tabId !== id);
    if (updatedTabs.length === 0) {
      // If closing last tab, keep it open
      return;
    }
    setOpenTabIds(updatedTabs);
    if (activeSnippetId === id) {
      setActiveSnippetId(updatedTabs[updatedTabs.length - 1]);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(activeSnippet.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadActiveFile = () => {
    const blob = new Blob([activeSnippet.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = activeSnippet.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Find & Replace actions
  const handleFindNext = () => {
    if (!searchQuery || !editorRef.current) return;
    const text = activeSnippet.content;
    const fromIndex = editorRef.current.selectionEnd || 0;
    let nextIndex = text.indexOf(searchQuery, fromIndex);
    if (nextIndex === -1) nextIndex = text.indexOf(searchQuery, 0); // Loop back

    if (nextIndex !== -1) {
      editorRef.current.focus();
      editorRef.current.setSelectionRange(nextIndex, nextIndex + searchQuery.length);
    }
  };

  const handleReplaceCurrent = () => {
    if (!searchQuery || !editorRef.current) return;
    const textarea = editorRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);

    if (selected === searchQuery) {
      const newValue = textarea.value.substring(0, start) + replaceQuery + textarea.value.substring(end);
      updateActiveContent(newValue);
      setTimeout(() => {
        if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(start, start + replaceQuery.length);
        }
      }, 0);
    } else {
      handleFindNext();
    }
  };

  const handleReplaceAll = () => {
    if (!searchQuery) return;
    const updated = activeSnippet.content.replaceAll(searchQuery, replaceQuery);
    updateActiveContent(updated);
  };

  const lineCount = activeSnippet.content.split("\n").length;
  const activeBadge = getFileBadgeColor(activeSnippet.language);

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col h-[100dvh] w-full overflow-hidden bg-[var(--background)] text-[var(--foreground)] select-none"
    >
      {/* Invisible overlay while dragging to prevent iframe mouse trapping */}
      {(isDraggingLeft || isDraggingRight) && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none bg-transparent" />
      )}

      {/* Hidden runner iframe for Pyodide and JS */}
      {runnerDoc !== null && (
        <iframe
          ref={runnerIframeRef}
          key={currentRunIdRef.current}
          title="Codespace Execution Sandbox"
          srcDoc={runnerDoc}
          sandbox="allow-scripts"
          style={{ display: "none" }}
        />
      )}

      {/* Top IDE Toolbar */}
      <header className="flex-shrink-0 h-13 sm:h-14 border-b border-[var(--sidebar-border)] px-3 flex items-center justify-between bg-[var(--header-bg)] backdrop-blur-md z-30 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Main App Sidebar Toggle */}
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-1.5 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors flex-shrink-0 cursor-pointer"
              title={sidebarOpen ? "Minimize sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
            </button>
          )}

          {/* IDE Logo & Active File Info */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0 shadow-xs">
              <Code2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-bold text-[var(--foreground)] truncate">Codespace IDE</span>
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded-md border font-semibold ${activeBadge.bg} ${activeBadge.text} ${activeBadge.border}`}
                >
                  {activeBadge.label}
                </span>
              </div>
              <div className="text-[10px] text-[var(--muted)] truncate flex items-center gap-1.5">
                <span>{activeSnippet.name}</span>
                <span>•</span>
                <span>{lineCount} lines</span>
              </div>
            </div>
          </div>
        </div>

        {/* IDE Center Toolbar Controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Quick Find Button */}
          <button
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1 ${
              isSearchOpen
                ? "bg-blue-600/20 text-blue-400 border-blue-500/40"
                : "bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border-[var(--card-border)] text-[var(--foreground)]"
            }`}
            title="Find & Replace (Ctrl+F)"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Find</span>
          </button>

          {/* AI Code Review Quick Action */}
          <button
            onClick={() => handleAiAction("review")}
            disabled={isAiLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-400 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Staff AI Code Review"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI Review</span>
          </button>

          {/* Run Code Button */}
          <button
            onClick={handleRunCode}
            disabled={telemetry.status === "running"}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white transition-all cursor-pointer shadow-md disabled:opacity-60"
            title="Execute Code (Ctrl+Enter)"
          >
            {telemetry.status === "running" ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>Run</span>
          </button>

          {/* Copy Button */}
          <button
            onClick={handleCopyCode}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-medium bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-[var(--foreground)] transition-colors cursor-pointer"
            title="Copy Code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Download File */}
          <button
            onClick={handleDownloadActiveFile}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-medium bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-[var(--foreground)] transition-colors cursor-pointer hidden sm:flex items-center gap-1"
            title="Download active file"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Panel Toggle Shortcuts */}
          <div className="hidden lg:flex items-center border-l border-[var(--sidebar-border)] pl-1.5 ml-1 gap-1">
            <button
              onClick={() => setIsLeftCollapsed(!isLeftCollapsed)}
              className={`p-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                isLeftCollapsed
                  ? "text-blue-400 bg-blue-500/10"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
              }`}
              title={isLeftCollapsed ? "Show File Explorer" : "Hide File Explorer"}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsRightCollapsed(!isRightCollapsed)}
              className={`p-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                isRightCollapsed
                  ? "text-purple-400 bg-purple-500/10"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
              }`}
              title={isRightCollapsed ? "Show AI & Output Panel" : "Hide AI & Output Panel"}
            >
              <PanelRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Find & Replace Floating Toolbar */}
      {isSearchOpen && (
        <div className="flex-shrink-0 px-4 py-2 bg-[var(--card-bg)] border-b border-[var(--sidebar-border)] flex flex-wrap items-center gap-2 text-xs animate-in slide-in-from-top-2 duration-150 z-20">
          <div className="flex items-center gap-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-2 py-1">
            <Search className="w-3.5 h-3.5 text-[var(--muted)]" />
            <input
              type="text"
              placeholder="Find in file..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFindNext()}
              autoFocus
              className="bg-transparent text-[var(--foreground)] focus:outline-none text-xs w-36 sm:w-48"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-2 py-1">
            <input
              type="text"
              placeholder="Replace with..."
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleReplaceCurrent()}
              className="bg-transparent text-[var(--foreground)] focus:outline-none text-xs w-36 sm:w-48"
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleFindNext}
              className="px-2 py-1 rounded-md bg-[var(--sidebar-hover)] hover:bg-[var(--card-border)] text-[var(--foreground)] font-medium transition-colors cursor-pointer"
            >
              Find Next
            </button>
            <button
              onClick={handleReplaceCurrent}
              className="px-2 py-1 rounded-md bg-[var(--sidebar-hover)] hover:bg-[var(--card-border)] text-[var(--foreground)] font-medium transition-colors cursor-pointer"
            >
              Replace
            </button>
            <button
              onClick={handleReplaceAll}
              className="px-2 py-1 rounded-md bg-[var(--sidebar-hover)] hover:bg-[var(--card-border)] text-[var(--foreground)] font-medium transition-colors cursor-pointer"
            >
              Replace All
            </button>
            <button
              onClick={() => setIsSearchOpen(false)}
              className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              title="Close search"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main IDE Layout: Left File Explorer -> Center Editor -> Right AI & Output Panel */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* ================= LEFT FILE EXPLORER ================= */}
        {!isLeftCollapsed && (
          <div
            style={{ width: `${leftWidth}px` }}
            className="flex-shrink-0 flex flex-col border-b lg:border-b-0 bg-[var(--sidebar-bg)]/60 select-none overflow-hidden"
          >
            {/* Explorer Header */}
            <div className="h-10 px-3 border-b border-[var(--sidebar-border)] flex items-center justify-between bg-[var(--card-bg)]/40">
              <div className="flex items-center gap-1.5">
                <FolderCode className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground)]">
                  Files ({snippets.length})
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsCreatingFile(!isCreatingFile)}
                  className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                  title="Create new file"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsLeftCollapsed(true)}
                  className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer hidden lg:block"
                  title="Collapse panel"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* New File Inline Form */}
            {isCreatingFile && (
              <form onSubmit={handleCreateFile} className="p-2 border-b border-[var(--sidebar-border)] bg-[var(--card-bg)]">
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="name.py, app.ts, index.html"
                  autoFocus
                  className="w-full px-2.5 py-1 text-xs rounded-lg border border-blue-500 bg-[var(--background)] text-[var(--foreground)] focus:outline-none font-mono"
                />
                <div className="flex items-center justify-end gap-1 mt-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setIsCreatingFile(false)}
                    className="px-2 py-0.5 rounded text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium cursor-pointer"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            {/* Files List */}
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 touch-scroll">
              {snippets.map((snip) => {
                const isSelected = snip.id === activeSnippet.id;
                const badge = getFileBadgeColor(snip.language);
                const isEditing = editingFileId === snip.id;

                return (
                  <div
                    key={snip.id}
                    onClick={() => {
                      setActiveSnippetId(snip.id);
                      if (!openTabIds.includes(snip.id)) {
                        setOpenTabIds((prev) => [...prev, snip.id]);
                      }
                    }}
                    className={`group flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs cursor-pointer transition-all ${
                      isSelected
                        ? "bg-[var(--card-bg)] text-blue-400 font-semibold shadow-xs border border-[var(--card-border)]"
                        : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] border border-transparent"
                    }`}
                  >
                    {isEditing ? (
                      <div
                        className="flex-1 flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          onBlur={() => handleRenameFile(snip.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameFile(snip.id);
                            if (e.key === "Escape") setEditingFileId(null);
                          }}
                          autoFocus
                          className="w-full px-1.5 py-0.5 text-xs rounded border border-blue-500 bg-[var(--background)] text-[var(--foreground)] font-mono focus:outline-none"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                          <span
                            className={`text-[9px] font-mono px-1 py-0.2 rounded border font-semibold ${badge.bg} ${badge.text} ${badge.border}`}
                          >
                            {badge.label}
                          </span>
                          <span className="truncate font-mono text-[11px]">{snip.name}</span>
                        </div>

                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingFileId(snip.id);
                              setEditNameValue(snip.name);
                            }}
                            className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                            title="Rename file"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          {snippets.length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFile(snip.id);
                              }}
                              className="p-1 rounded text-[var(--muted)] hover:text-rose-400 hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                              title="Delete file"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Explorer Footer Telemetry */}
            <div className="p-2.5 border-t border-[var(--sidebar-border)] bg-[var(--card-bg)]/20 text-[10px] text-[var(--muted)] flex items-center justify-between">
              <span className="truncate">Active: {activeSnippet.name}</span>
              <button
                onClick={() => {
                  setSnippets(DEFAULT_SNIPPETS);
                  setActiveSnippetId(DEFAULT_SNIPPETS[0].id);
                  setOpenTabIds(DEFAULT_SNIPPETS.map((s) => s.id));
                }}
                className="hover:text-[var(--foreground)] transition-colors flex items-center gap-1 cursor-pointer"
                title="Reset sample files"
              >
                <RotateCcw className="w-2.5 h-2.5" /> Reset
              </button>
            </div>
          </div>
        )}

        {/* LEFT RESIZER DRAG HANDLE */}
        {!isLeftCollapsed && (
          <div
            onPointerDown={(e) => {
              e.preventDefault();
              setIsDraggingLeft(true);
            }}
            onDoubleClick={() => setLeftWidth(240)}
            className="hidden lg:flex w-1.5 hover:w-2 hover:bg-blue-500/60 active:bg-blue-500 cursor-col-resize transition-all items-center justify-center bg-[var(--sidebar-border)]/50 group select-none relative z-10"
            title="Drag to resize file sidebar (Double click to reset)"
          >
            <div className="w-0.5 h-6 rounded-full bg-[var(--muted)] group-hover:bg-blue-300 opacity-50 group-hover:opacity-100" />
          </div>
        )}

        {/* ================= CENTER CODE EDITOR ================= */}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--card-bg)]/10 overflow-hidden">
          {/* Top Multi-File Tab Bar */}
          <div className="h-9 border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/70 flex items-center justify-between overflow-x-auto touch-scroll px-1">
            <div className="flex items-center gap-1 min-w-0">
              {openTabIds.map((tabId) => {
                const snip = snippets.find((s) => s.id === tabId);
                if (!snip) return null;
                const isActive = snip.id === activeSnippet.id;
                const badge = getFileBadgeColor(snip.language);

                return (
                  <div
                    key={snip.id}
                    onClick={() => setActiveSnippetId(snip.id)}
                    className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-mono cursor-pointer transition-all border-t-2 ${
                      isActive
                        ? "bg-[var(--card-bg)] text-[var(--foreground)] border-blue-500 font-semibold shadow-xs"
                        : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] border-transparent"
                    }`}
                  >
                    <span className={`text-[9px] font-bold ${badge.text}`}>{badge.label}</span>
                    <span className="truncate max-w-[120px]">{snip.name}</span>
                    <button
                      onClick={(e) => handleCloseTab(snip.id, e)}
                      className="p-0.5 rounded-full hover:bg-[var(--card-border)] hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Close tab"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}

              <button
                onClick={() => setIsCreatingFile(true)}
                className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer ml-1"
                title="New file"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Copilot Snippet Action Bar */}
            <div className="flex items-center gap-1 pr-2 flex-shrink-0 text-[10px]">
              <span className="text-[var(--muted)] hidden xl:inline">AI:</span>
              <button
                onClick={() => handleAiAction("fix")}
                disabled={isAiLoading}
                className="px-2 py-0.5 rounded-md bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-emerald-400 font-medium transition-colors cursor-pointer flex items-center gap-1"
                title="Fix bugs & errors in active code"
              >
                <Bug className="w-3 h-3" />
                <span className="hidden md:inline">Fix</span>
              </button>
              <button
                onClick={() => handleAiAction("optimize")}
                disabled={isAiLoading}
                className="px-2 py-0.5 rounded-md bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-amber-400 font-medium transition-colors cursor-pointer flex items-center gap-1"
                title="Optimize execution speed & Big-O"
              >
                <Zap className="w-3 h-3" />
                <span className="hidden md:inline">Optimize</span>
              </button>
              <button
                onClick={() => handleAiAction("tests")}
                disabled={isAiLoading}
                className="px-2 py-0.5 rounded-md bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-purple-400 font-medium transition-colors cursor-pointer hidden sm:flex items-center gap-1"
                title="Generate Unit Tests"
              >
                <Sparkles className="w-3 h-3" />
                <span>Tests</span>
              </button>
            </div>
          </div>

          {/* Code Textarea with Line Numbers */}
          <div className="flex-1 flex overflow-hidden font-mono text-xs sm:text-sm relative">
            {/* Line Numbers Column */}
            <div
              ref={lineNumbersRef}
              style={{ fontSize: `${fontSize}px` }}
              className="w-10 sm:w-12 py-3 bg-[var(--sidebar-bg)]/70 text-right pr-2 select-none text-[var(--muted)] opacity-50 border-r border-[var(--sidebar-border)]/40 overflow-hidden space-y-0.5"
            >
              {Array.from({ length: lineCount }).map((_, i) => (
                <div key={i} className="leading-relaxed">
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Code Input Area */}
            <textarea
              ref={editorRef}
              value={activeSnippet.content}
              onChange={(e) => updateActiveContent(e.target.value)}
              onScroll={handleEditorScroll}
              onKeyDown={handleEditorKeyDown}
              onKeyUp={handleCursorTracking}
              onClick={handleCursorTracking}
              style={{
                fontSize: `${fontSize}px`,
                whiteSpace: wordWrap ? "pre-wrap" : "pre",
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              className="flex-1 p-3 bg-transparent text-[var(--foreground)] focus:outline-none resize-none overflow-auto leading-relaxed font-mono touch-scroll select-text"
              placeholder="// Write or paste your code here..."
            />
          </div>

          {/* Bottom Editor Status Bar */}
          <footer className="h-6 border-t border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/80 px-3 flex items-center justify-between text-[10px] text-[var(--muted)] font-mono select-none flex-shrink-0">
            <div className="flex items-center gap-3">
              <span>
                Ln {cursorPos.line}, Col {cursorPos.col}
              </span>
              <span>•</span>
              <span>{activeSnippet.content.length} chars</span>
              <span>•</span>
              <span className="uppercase">{activeSnippet.language}</span>
              <span className="hidden sm:inline">• UTF-8</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setWordWrap(!wordWrap)}
                className={`hover:text-[var(--foreground)] transition-colors cursor-pointer ${
                  wordWrap ? "text-blue-400 font-semibold" : ""
                }`}
                title="Toggle Word Wrap"
              >
                Wrap
              </button>
              <span>•</span>
              <button
                onClick={() => setFontSize((prev) => Math.max(prev - 1, 10))}
                className="hover:text-[var(--foreground)] transition-colors cursor-pointer"
                title="Decrease font size"
              >
                A-
              </button>
              <button
                onClick={() => setFontSize((prev) => Math.min(prev + 1, 18))}
                className="hover:text-[var(--foreground)] transition-colors cursor-pointer"
                title="Increase font size"
              >
                A+
              </button>
              <span className="hidden md:inline">•</span>
              <span className="hidden md:inline">Ctrl+Enter to Run</span>
            </div>
          </footer>
        </div>

        {/* RIGHT RESIZER DRAG HANDLE */}
        {!isRightCollapsed && (
          <div
            onPointerDown={(e) => {
              e.preventDefault();
              setIsDraggingRight(true);
            }}
            onDoubleClick={() => setRightWidth(420)}
            className="hidden lg:flex w-1.5 hover:w-2 hover:bg-purple-500/60 active:bg-purple-500 cursor-col-resize transition-all items-center justify-center bg-[var(--sidebar-border)]/50 group select-none relative z-10"
            title="Drag to resize AI & Console panel (Double click to reset)"
          >
            <div className="w-0.5 h-6 rounded-full bg-[var(--muted)] group-hover:bg-purple-300 opacity-50 group-hover:opacity-100" />
          </div>
        )}

        {/* ================= RIGHT AI & OUTPUT PANEL ================= */}
        {!isRightCollapsed && (
          <div
            style={{ width: `${rightWidth}px` }}
            className="flex-shrink-0 flex flex-col bg-[var(--sidebar-bg)]/50 border-t lg:border-t-0 select-none overflow-hidden"
          >
            {/* Tab Switcher Header */}
            <div className="h-10 px-2 border-b border-[var(--sidebar-border)] bg-[var(--card-bg)]/50 flex items-center justify-between gap-1 flex-shrink-0">
              <div className="flex items-center gap-1 flex-1">
                <button
                  onClick={() => setOutputTab("console")}
                  className={`flex-1 py-1 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    outputTab === "console"
                      ? "bg-[var(--card-bg)] text-emerald-400 shadow-xs border border-[var(--card-border)]"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Console</span>
                </button>

                <button
                  onClick={() => setOutputTab("ai")}
                  className={`flex-1 py-1 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    outputTab === "ai"
                      ? "bg-[var(--card-bg)] text-purple-400 shadow-xs border border-[var(--card-border)]"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Copilot</span>
                </button>

                <button
                  onClick={() => setOutputTab("preview")}
                  className={`flex-1 py-1 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    outputTab === "preview"
                      ? "bg-[var(--card-bg)] text-blue-400 shadow-xs border border-[var(--card-border)]"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </button>
              </div>

              <button
                onClick={() => setIsRightCollapsed(true)}
                className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer hidden lg:block"
                title="Collapse panel"
              >
                <PanelRightClose className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* TAB 1: CONSOLE / TERMINAL OUTPUT */}
            {outputTab === "console" && (
              <div className="flex-1 flex flex-col bg-black/50 text-emerald-400 overflow-hidden font-mono text-xs">
                {/* Terminal Toolbar */}
                <div className="px-3 py-2 border-b border-[var(--sidebar-border)]/40 bg-black/40 flex items-center justify-between text-[11px] text-slate-400 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        telemetry.status === "running"
                          ? "bg-amber-500/20 text-amber-300"
                          : telemetry.status === "success"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : telemetry.status === "error"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-slate-500/20 text-slate-300"
                      }`}
                    >
                      {telemetry.status === "running" && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
                      {telemetry.runner}
                    </span>
                    {telemetry.durationMs !== null && (
                      <span className="text-[10px] flex items-center gap-0.5 text-slate-400">
                        <Clock className="w-2.5 h-2.5" /> {telemetry.durationMs}ms
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(consoleLogs.map((l) => `[${l.timestamp}] ${l.text}`).join("\n"))
                      }
                      className="p-1 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="Copy Console Output"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setConsoleLogs([])}
                      className="p-1 rounded text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Clear Console"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Console Stream Output */}
                <div className="flex-1 p-3 overflow-y-auto space-y-1.5 touch-scroll select-text">
                  {consoleLogs.map((log) => {
                    let colorClass = "text-emerald-300";
                    if (log.type === "stderr") colorClass = "text-rose-400 font-semibold";
                    else if (log.type === "warn") colorClass = "text-amber-300";
                    else if (log.type === "info") colorClass = "text-slate-400";
                    else if (log.type === "success") colorClass = "text-emerald-400 font-semibold";

                    return (
                      <div key={log.id} className="leading-relaxed whitespace-pre-wrap break-all">
                        <span className="text-slate-600 text-[10px] mr-1.5 select-none">[{log.timestamp}]</span>
                        <span className={colorClass}>{log.text}</span>
                      </div>
                    );
                  })}
                  <div ref={consoleBottomRef} />
                </div>
              </div>
            )}

            {/* TAB 2: AI COPILOT & CODE REVIEW */}
            {outputTab === "ai" && (
              <div className="flex-1 flex flex-col overflow-hidden text-xs">
                {/* AI Header & Quick Actions */}
                <div className="p-3 border-b border-[var(--sidebar-border)] bg-[var(--card-bg)]/30 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="font-bold text-[var(--foreground)]">Staff Engineer Intelligence</span>
                  </div>
                  {isAiLoading && (
                    <span className="flex items-center gap-1 text-purple-400 text-[11px] animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Thinking...
                    </span>
                  )}
                </div>

                {/* AI Review Content */}
                <div className="flex-1 p-3.5 overflow-y-auto space-y-3 touch-scroll select-text">
                  {aiReviewOutput ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between pb-1 border-b border-[var(--sidebar-border)] text-[11px] text-[var(--muted)]">
                        <span>Analysis Result</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleApplyAiCode}
                            className="px-2 py-0.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-semibold transition-colors cursor-pointer flex items-center gap-1"
                            title="Replace editor content with AI generated code block"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Apply Code
                          </button>
                          <button
                            onClick={() => navigator.clipboard.writeText(aiReviewOutput)}
                            className="p-1 rounded hover:text-[var(--foreground)] transition-colors cursor-pointer"
                            title="Copy analysis"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="whitespace-pre-wrap leading-relaxed font-sans text-xs text-[var(--foreground)] bg-[var(--card-bg)]/80 p-3 rounded-xl border border-[var(--card-border)]">
                        {aiReviewOutput}
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 text-center text-xs text-[var(--muted)] space-y-2">
                      <Sparkles className="w-8 h-8 text-purple-400/50 mx-auto" />
                      <p className="font-semibold text-[var(--foreground)]">No active analysis yet.</p>
                      <p className="text-[11px] max-w-xs mx-auto text-[var(--muted)]">
                        Click <strong>Review</strong>, <strong>Fix Bugs</strong>, or ask any coding question below to analyze this code.
                      </p>
                    </div>
                  )}
                </div>

                {/* AI Interactive Chat Input */}
                <form
                  onSubmit={handleAiCustomPrompt}
                  className="p-2.5 border-t border-[var(--sidebar-border)] bg-[var(--card-bg)]/60 flex items-center gap-1.5 flex-shrink-0"
                >
                  <input
                    type="text"
                    value={aiPromptInput}
                    onChange={(e) => setAiPromptInput(e.target.value)}
                    placeholder={`Ask AI about ${activeSnippet.name}...`}
                    disabled={isAiLoading}
                    className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="submit"
                    disabled={isAiLoading || !aiPromptInput.trim()}
                    className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white transition-all cursor-pointer disabled:opacity-50"
                    title="Send prompt to AI"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            )}

            {/* TAB 3: LIVE WEB / HTML PREVIEW */}
            {outputTab === "preview" && (
              <div className="flex-1 flex flex-col bg-white overflow-hidden">
                {activeSnippet.language === "html" ? (
                  <iframe
                    title="Codespace Preview"
                    srcDoc={activeSnippet.content}
                    className="w-full h-full border-none"
                    sandbox="allow-scripts allow-modals"
                  />
                ) : (
                  <div className="p-8 text-center text-xs text-slate-600 space-y-2">
                    <Eye className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="font-bold text-slate-800">Live HTML Sandbox</p>
                    <p className="text-slate-500 text-[11px] max-w-xs mx-auto">
                      Select or create a <code>.html</code> file to render interactive UI components live in this sandbox.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
