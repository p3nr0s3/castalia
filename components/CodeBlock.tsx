"use client";

import React, { useState, useRef, useEffect } from "react";
import { apiFetch } from "../lib/apiClient";
import { Check, Copy, Download, Play, Eye, Code, ArrowCounterClockwise as RotateCcw, Terminal, X, Package as Box, SpinnerGap as Loader2, WarningCircle as AlertCircle } from "@phosphor-icons/react";
import { PrismAsyncLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

// PrismAsyncLight ships with zero languages registered — it lazy-loads only
// the grammars actually used, instead of the ~250 grammars bundled by the
// default `Prism` export (that used to inflate the / route's first-load JS
// to ~2.85MB). Map every language key CodeBlock can receive (see
// LANGUAGE_EXTENSION_MAP + detectLanguage below) to its dynamic import.
// Anything not in this map (or a language whose registration fails, e.g. an
// unrecognized model-supplied string) falls back to Prism's built-in
// "text"/plain rendering rather than throwing.
const LANGUAGE_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  bash: () => import("react-syntax-highlighter/dist/esm/languages/prism/bash"),
  shell: () => import("react-syntax-highlighter/dist/esm/languages/prism/bash"),
  sh: () => import("react-syntax-highlighter/dist/esm/languages/prism/bash"),
  zsh: () => import("react-syntax-highlighter/dist/esm/languages/prism/bash"),
  cmd: () => import("react-syntax-highlighter/dist/esm/languages/prism/bash"),
  bat: () => import("react-syntax-highlighter/dist/esm/languages/prism/bash"),
  powershell: () => import("react-syntax-highlighter/dist/esm/languages/prism/powershell"),
  ps1: () => import("react-syntax-highlighter/dist/esm/languages/prism/powershell"),
  c: () => import("react-syntax-highlighter/dist/esm/languages/prism/c"),
  cpp: () => import("react-syntax-highlighter/dist/esm/languages/prism/cpp"),
  cs: () => import("react-syntax-highlighter/dist/esm/languages/prism/csharp"),
  csharp: () => import("react-syntax-highlighter/dist/esm/languages/prism/csharp"),
  css: () => import("react-syntax-highlighter/dist/esm/languages/prism/css"),
  scss: () => import("react-syntax-highlighter/dist/esm/languages/prism/scss"),
  // @ts-ignore no bundled type declarations for this language module
  csv: () => import("react-syntax-highlighter/dist/esm/languages/prism/csv"),
  diff: () => import("react-syntax-highlighter/dist/esm/languages/prism/diff"),
  patch: () => import("react-syntax-highlighter/dist/esm/languages/prism/diff"),
  docker: () => import("react-syntax-highlighter/dist/esm/languages/prism/docker"),
  dockerfile: () => import("react-syntax-highlighter/dist/esm/languages/prism/docker"),
  go: () => import("react-syntax-highlighter/dist/esm/languages/prism/go"),
  golang: () => import("react-syntax-highlighter/dist/esm/languages/prism/go"),
  graphql: () => import("react-syntax-highlighter/dist/esm/languages/prism/graphql"),
  html: () => import("react-syntax-highlighter/dist/esm/languages/prism/markup"),
  htm: () => import("react-syntax-highlighter/dist/esm/languages/prism/markup"),
  xml: () => import("react-syntax-highlighter/dist/esm/languages/prism/markup"),
  svg: () => import("react-syntax-highlighter/dist/esm/languages/prism/markup"),
  ini: () => import("react-syntax-highlighter/dist/esm/languages/prism/ini"),
  toml: () => import("react-syntax-highlighter/dist/esm/languages/prism/toml"),
  java: () => import("react-syntax-highlighter/dist/esm/languages/prism/java"),
  javascript: () => import("react-syntax-highlighter/dist/esm/languages/prism/javascript"),
  js: () => import("react-syntax-highlighter/dist/esm/languages/prism/javascript"),
  jsx: () => import("react-syntax-highlighter/dist/esm/languages/prism/jsx"),
  typescript: () => import("react-syntax-highlighter/dist/esm/languages/prism/typescript"),
  ts: () => import("react-syntax-highlighter/dist/esm/languages/prism/typescript"),
  tsx: () => import("react-syntax-highlighter/dist/esm/languages/prism/tsx"),
  json: () => import("react-syntax-highlighter/dist/esm/languages/prism/json"),
  yaml: () => import("react-syntax-highlighter/dist/esm/languages/prism/yaml"),
  yml: () => import("react-syntax-highlighter/dist/esm/languages/prism/yaml"),
  latex: () => import("react-syntax-highlighter/dist/esm/languages/prism/latex"),
  tex: () => import("react-syntax-highlighter/dist/esm/languages/prism/latex"),
  lua: () => import("react-syntax-highlighter/dist/esm/languages/prism/lua"),
  markdown: () => import("react-syntax-highlighter/dist/esm/languages/prism/markdown"),
  md: () => import("react-syntax-highlighter/dist/esm/languages/prism/markdown"),
  php: () => import("react-syntax-highlighter/dist/esm/languages/prism/php"),
  python: () => import("react-syntax-highlighter/dist/esm/languages/prism/python"),
  py: () => import("react-syntax-highlighter/dist/esm/languages/prism/python"),
  rb: () => import("react-syntax-highlighter/dist/esm/languages/prism/ruby"),
  ruby: () => import("react-syntax-highlighter/dist/esm/languages/prism/ruby"),
  rs: () => import("react-syntax-highlighter/dist/esm/languages/prism/rust"),
  rust: () => import("react-syntax-highlighter/dist/esm/languages/prism/rust"),
  sol: () => import("react-syntax-highlighter/dist/esm/languages/prism/solidity"),
  solidity: () => import("react-syntax-highlighter/dist/esm/languages/prism/solidity"),
  sql: () => import("react-syntax-highlighter/dist/esm/languages/prism/sql"),
  asm: () => import("react-syntax-highlighter/dist/esm/languages/prism/nasm"),
  zig: () => import("react-syntax-highlighter/dist/esm/languages/prism/zig"),
};

const registeredLanguages = new Set<string>();
async function ensureLanguageRegistered(language: string): Promise<string> {
  const key = language.toLowerCase();
  const loader = LANGUAGE_LOADERS[key];
  if (!loader) return "text";
  if (!registeredLanguages.has(key)) {
    try {
      const mod = await loader();
      SyntaxHighlighter.registerLanguage(key, mod.default);
      registeredLanguages.add(key);
    } catch {
      return "text";
    }
  }
  return key;
}

interface CodeBlockProps {
  language?: string;
  value: string;
}

const LANGUAGE_EXTENSION_MAP: Record<string, { ext: string; mime: string; label: string }> = {
  yara: { ext: "yar", mime: "text/plain", label: "YARA Rule" },
  yar: { ext: "yar", mime: "text/plain", label: "YARA Rule" },
  md: { ext: "md", mime: "text/markdown", label: "Markdown" },
  markdown: { ext: "md", mime: "text/markdown", label: "Markdown" },
  python: { ext: "py", mime: "text/x-python", label: "Python" },
  py: { ext: "py", mime: "text/x-python", label: "Python" },
  javascript: { ext: "js", mime: "application/javascript", label: "JavaScript" },
  js: { ext: "js", mime: "application/javascript", label: "JavaScript" },
  typescript: { ext: "ts", mime: "application/typescript", label: "TypeScript" },
  ts: { ext: "ts", mime: "application/typescript", label: "TypeScript" },
  jsx: { ext: "jsx", mime: "text/jsx", label: "React JSX" },
  tsx: { ext: "tsx", mime: "text/tsx", label: "React TSX" },
  html: { ext: "html", mime: "text/html", label: "HTML" },
  htm: { ext: "html", mime: "text/html", label: "HTML" },
  css: { ext: "css", mime: "text/css", label: "CSS" },
  scss: { ext: "scss", mime: "text/x-scss", label: "SCSS" },
  json: { ext: "json", mime: "application/json", label: "JSON" },
  yaml: { ext: "yaml", mime: "text/yaml", label: "YAML" },
  yml: { ext: "yaml", mime: "text/yaml", label: "YAML" },
  sh: { ext: "sh", mime: "application/x-sh", label: "Shell" },
  bash: { ext: "sh", mime: "application/x-sh", label: "Bash" },
  shell: { ext: "sh", mime: "application/x-sh", label: "Shell" },
  zsh: { ext: "zsh", mime: "application/x-sh", label: "Zsh" },
  powershell: { ext: "ps1", mime: "text/plain", label: "PowerShell" },
  ps1: { ext: "ps1", mime: "text/plain", label: "PowerShell" },
  sql: { ext: "sql", mime: "application/sql", label: "SQL" },
  cpp: { ext: "cpp", mime: "text/x-c++src", label: "C++" },
  "c++": { ext: "cpp", mime: "text/x-c++src", label: "C++" },
  c: { ext: "c", mime: "text/x-csrc", label: "C" },
  csharp: { ext: "cs", mime: "text/plain", label: "C#" },
  cs: { ext: "cs", mime: "text/plain", label: "C#" },
  java: { ext: "java", mime: "text/x-java-source", label: "Java" },
  rust: { ext: "rs", mime: "text/rust", label: "Rust" },
  rs: { ext: "rs", mime: "text/rust", label: "Rust" },
  go: { ext: "go", mime: "text/x-go", label: "Go" },
  golang: { ext: "go", mime: "text/x-go", label: "Go" },
  php: { ext: "php", mime: "application/x-httpd-php", label: "PHP" },
  ruby: { ext: "rb", mime: "application/x-ruby", label: "Ruby" },
  rb: { ext: "rb", mime: "application/x-ruby", label: "Ruby" },
  dockerfile: { ext: "dockerfile", mime: "text/plain", label: "Dockerfile" },
  docker: { ext: "dockerfile", mime: "text/plain", label: "Dockerfile" },
  graphql: { ext: "graphql", mime: "application/graphql", label: "GraphQL" },
  xml: { ext: "xml", mime: "application/xml", label: "XML" },
  svg: { ext: "svg", mime: "image/svg+xml", label: "SVG" },
  toml: { ext: "toml", mime: "text/plain", label: "TOML" },
  ini: { ext: "ini", mime: "text/plain", label: "INI" },
  bat: { ext: "bat", mime: "text/plain", label: "Batch" },
  cmd: { ext: "cmd", mime: "text/plain", label: "Batch" },
  lua: { ext: "lua", mime: "text/x-lua", label: "Lua" },
  zig: { ext: "zig", mime: "text/plain", label: "Zig" },
  sol: { ext: "sol", mime: "text/plain", label: "Solidity" },
  solidity: { ext: "sol", mime: "text/plain", label: "Solidity" },
  asm: { ext: "asm", mime: "text/plain", label: "Assembly" },
  diff: { ext: "diff", mime: "text/x-diff", label: "Diff" },
  patch: { ext: "patch", mime: "text/x-diff", label: "Patch" },
  tex: { ext: "tex", mime: "application/x-tex", label: "LaTeX" },
  latex: { ext: "tex", mime: "application/x-tex", label: "LaTeX" },
  csv: { ext: "csv", mime: "text/csv", label: "CSV" },
  text: { ext: "txt", mime: "text/plain", label: "Text" },
  txt: { ext: "txt", mime: "text/plain", label: "Text" },
};

const getSmartDownloadFilename = (lang: string, code: string): { filename: string; mime: string } => {
  const normLang = (lang || "").toLowerCase().trim();
  const mapping = LANGUAGE_EXTENSION_MAP[normLang] || { ext: normLang || "txt", mime: "text/plain", label: "File" };
  const ext = mapping.ext;

  // 1. Check if YARA rule name is in code: rule <RuleName>
  if (normLang === "yara" || normLang === "yar" || code.includes("rule ")) {
    const matchRule = code.match(/^\s*rule\s+([a-zA-Z0-9_]+)/m);
    if (matchRule && matchRule[1]) {
      return { filename: `${matchRule[1]}.${ext}`, mime: mapping.mime };
    }
  }

  // 2. Check if first few lines contain a filename comment (e.g. // app.tsx, # script.py)
  const lines = code.slice(0, 500).split("\n").slice(0, 5);
  for (const line of lines) {
    const trimmed = line.trim();
    const fileMatch = trimmed.match(/^(?:\/{2,3}|#|\/\*|<!--|;\s*)\s*([\w\-./\\]+\.[a-zA-Z0-9]{1,10})\b/);
    if (fileMatch && fileMatch[1]) {
      const detected = fileMatch[1].split(/[/\\]/).pop();
      if (detected && detected.includes(".")) {
        return { filename: detected, mime: mapping.mime };
      }
    }
  }

  // 3. Fallback to descriptive name based on language
  if (normLang === "dockerfile" || normLang === "docker") {
    return { filename: "Dockerfile", mime: mapping.mime };
  }

  const defaultBaseName =
    normLang === "yara" || normLang === "yar"
      ? "rule"
      : normLang === "md" || normLang === "markdown"
      ? "document"
      : normLang === "python" || normLang === "py"
      ? "script"
      : normLang === "sh" || normLang === "bash"
      ? "script"
      : "code";

  return { filename: `${defaultBaseName}.${ext}`, mime: mapping.mime };
};

export const CodeBlock: React.FC<CodeBlockProps> = ({ language = "text", value }) => {
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [activeTab, setActiveTab] = useState<"code" | "preview">("code");
  const [runLogs, setRunLogs] = useState<string[] | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Sandboxed iframe runner for the "Run" button below — same isolation
  // pattern as CodespaceView.tsx's runner: code from chat (AI-generated,
  // possibly influenced by web content/RAG) must never execute with this
  // page's own window/localStorage/cookies/fetch access. A distinct
  // __codeBlockRunner message tag keeps this isolated from any
  // CodespaceView runner that might be mounted elsewhere on the page.
  const runnerIframeRef = useRef<HTMLIFrameElement>(null);
  const runIdRef = useRef(0);
  const [runnerDoc, setRunnerDoc] = useState<string | null>(null);

  useEffect(() => {
    function handleRunnerMessage(event: MessageEvent) {
      if (runnerIframeRef.current && event.source !== runnerIframeRef.current.contentWindow) return;
      const data = event.data;
      if (!data || data.__codeBlockRunner !== true || data.runId !== runIdRef.current) return;

      if (data.type === "log") {
        setRunLogs((prev) => [...(prev || []), data.text]);
      } else if (data.type === "done") {
        setIsRunning(false);
        setRunLogs((prev) => (prev && prev.length > 0 ? prev : ["(Executed successfully with no output)"]));
      }
    }
    window.addEventListener("message", handleRunnerMessage);
    return () => window.removeEventListener("message", handleRunnerMessage);
  }, []);
  const [isInjecting, setIsInjecting] = useState(false);
  const [injectStatus, setInjectStatus] = useState<"success" | "error" | null>(null);
  const [injectMessage, setInjectMessage] = useState<string>("");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  const handleDownload = () => {
    try {
      const { filename, mime } = getSmartDownloadFilename(detectedLanguage, value);
      const blob = new Blob([value], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    } catch (err) {
      console.error("Failed to download file:", err);
    }
  };

  const detectedLanguage = (language || "text").toLowerCase();
  // PrismAsyncLight starts with no grammars registered; resolve and lazy-load
  // the one this block needs, falling back to "text" until it's ready (and
  // permanently for languages with no loader / a failed dynamic import).
  const [highlightLanguage, setHighlightLanguage] = useState("text");
  useEffect(() => {
    let cancelled = false;
    ensureLanguageRegistered(detectedLanguage).then((resolved) => {
      if (!cancelled) setHighlightLanguage(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [detectedLanguage]);

  const isHtmlOrWeb =
    detectedLanguage === "html" ||
    detectedLanguage === "svg" ||
    detectedLanguage === "xml" ||
    (detectedLanguage === "javascript" && value.includes("<html")) ||
    (detectedLanguage === "jsx" && value.includes("<"));

  const isJavaScript =
    detectedLanguage === "javascript" ||
    detectedLanguage === "js" ||
    detectedLanguage === "typescript" ||
    detectedLanguage === "ts";

  const isBlenderBpy =
    (detectedLanguage === "python" ||
      detectedLanguage === "py" ||
      detectedLanguage === "bpy" ||
      detectedLanguage === "text") &&
    (value.includes("bpy.") || value.includes("import bpy") || value.includes("mathutils"));

  const handleInjectBlender = async () => {
    setIsInjecting(true);
    setInjectStatus(null);
    setInjectMessage("");
    try {
      const res = await apiFetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "blender_execute",
          payload: { code: value },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setInjectStatus("success");
        setInjectMessage("Injected to Blender!");
        setTimeout(() => setInjectStatus(null), 3500);
      } else {
        setInjectStatus("error");
        setInjectMessage(data.isBridgeOffline ? "Bridge Offline (port 9876)" : data.message || "Failed to inject");
        setTimeout(() => setInjectStatus(null), 4000);
      }
    } catch (err: any) {
      setInjectStatus("error");
      setInjectMessage(err.message || "Network error");
      setTimeout(() => setInjectStatus(null), 4000);
    } finally {
      setIsInjecting(false);
    }
  };

  const handleRunJs = () => {
    setIsRunning(true);
    setRunLogs([]);
    runIdRef.current += 1;
    const runId = runIdRef.current;
    const escaped = JSON.stringify(value);

    // Runs in a sandboxed iframe (allow-scripts only, no allow-same-origin)
    // instead of this page's own scope — the code here comes from chat
    // messages, which can be influenced by web search results or RAG'd
    // documents (prompt injection), so it must not get access to this
    // app's window, localStorage, cookies, or authenticated fetch.
    const doc = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body>
<script>
(function() {
  var runId = ${runId};
  function send(type, text) {
    try { parent.postMessage({ __codeBlockRunner: true, runId: runId, type: type, text: text }, "*"); } catch (e) {}
  }
  function fmt(a) {
    try { return typeof a === "object" ? JSON.stringify(a, null, 2) : String(a); } catch (e) { return String(a); }
  }
  var customConsole = {
    log: function() { send("log", Array.prototype.slice.call(arguments).map(fmt).join(" ")); },
    error: function() { send("log", "[ERROR] " + Array.prototype.slice.call(arguments).map(fmt).join(" ")); },
    warn: function() { send("log", "[WARN] " + Array.prototype.slice.call(arguments).map(fmt).join(" ")); }
  };
  try {
    var code = ${escaped};
    var runFn = new Function("console", code);
    var result = runFn(customConsole);
    if (result !== undefined) send("log", "[RETURN] " + fmt(result));
    send("done");
  } catch (err) {
    send("log", "[RUNTIME ERROR] " + (err && err.message ? err.message : String(err)));
    send("done");
  }
})();
</script>
</body>
</html>`;

    setRunnerDoc(doc);
  };

  return (
    <div className="relative my-3 w-full max-w-full min-w-0 rounded-2xl overflow-hidden border border-[var(--card-border)] bg-[#1e1e1e] shadow-md">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#282828] text-slate-300 text-xs font-mono select-none">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
            {detectedLanguage}
          </span>

          {/* Toggle Code / Live Preview if HTML */}
          {isHtmlOrWeb && (
            <div className="flex items-center rounded-lg bg-black/40 p-0.5 border border-white/10 font-sans">
              <button
                type="button"
                onClick={() => setActiveTab("code")}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  activeTab === "code" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                <Code className="w-3 h-3" />
                <span>Code</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  activeTab === "preview" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>Live Preview</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 font-sans">
          {/* Inject to Blender Button for Python bpy scripts */}
          {isBlenderBpy && (
            <button
              type="button"
              onClick={handleInjectBlender}
              disabled={isInjecting}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                injectStatus === "success"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : injectStatus === "error"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                  : "bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 hover:text-orange-300 border border-orange-500/30"
              }`}
              title="Inject & execute this script directly in your live Blender scene (Port 9876)"
            >
              {isInjecting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400" />
                  <span>Injecting...</span>
                </>
              ) : injectStatus === "success" ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Injected!</span>
                </>
              ) : injectStatus === "error" ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>{injectMessage}</span>
                </>
              ) : (
                <>
                  <Box className="w-3.5 h-3.5 text-orange-400" />
                  <span>Inject to Blender</span>
                </>
              )}
            </button>
          )}

          {/* Run Code Button for JS/TS */}
          {isJavaScript && (
            <button
              type="button"
              onClick={handleRunJs}
              disabled={isRunning}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold transition-colors cursor-pointer"
              title="Execute JavaScript in Browser Sandbox"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Run</span>
            </button>
          )}

          {/* Download File Button */}
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer text-xs"
            title={`Download as ${getSmartDownloadFilename(detectedLanguage, value).filename}`}
          >
            {downloaded ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Downloaded!</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </>
            )}
          </button>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer text-xs"
            title="Copy code"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === "preview" && isHtmlOrWeb ? (
        <div className="w-full bg-white h-[280px] sm:h-[340px] overflow-hidden">
          <iframe
            srcDoc={value}
            sandbox="allow-scripts allow-modals"
            className="w-full h-full border-none"
            title="Code Preview Sandbox"
          />
        </div>
      ) : (
        <div className="overflow-x-auto text-[13px] leading-relaxed">
          <SyntaxHighlighter
            language={highlightLanguage}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              padding: "1rem",
              background: "#1e1e1e",
              fontSize: "13px",
              lineHeight: "1.5",
            }}
            showLineNumbers={value.split("\n").length > 3}
            wrapLongLines={false}
          >
            {value.trimEnd()}
          </SyntaxHighlighter>
        </div>
      )}

      {/* Hidden sandboxed runner iframe for the JS "Run" button */}
      {runnerDoc !== null && (
        <iframe
          ref={runnerIframeRef}
          key={runIdRef.current}
          title="Code Execution Sandbox"
          srcDoc={runnerDoc}
          sandbox="allow-scripts"
          style={{ display: "none" }}
        />
      )}

      {/* JavaScript Execution Console Output Drawer */}
      {runLogs && (
        <div className="border-t border-white/10 bg-[#141414] p-3 text-xs font-mono animate-in fade-in">
          <div className="flex items-center justify-between text-slate-400 pb-1.5 border-b border-white/10 mb-2">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <Terminal className="w-3.5 h-3.5" />
              <span>Console Output</span>
            </div>
            <button
              onClick={() => setRunLogs(null)}
              className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {runLogs.map((log, idx) => (
              <div
                key={idx}
                className={`whitespace-pre-wrap leading-relaxed ${
                  log.startsWith("[ERROR]") || log.startsWith("[RUNTIME ERROR]")
                    ? "text-rose-400"
                    : log.startsWith("[WARN]")
                    ? "text-amber-400"
                    : log.startsWith("[RETURN]")
                    ? "text-cyan-400"
                    : "text-slate-200"
                }`}
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeBlock;
