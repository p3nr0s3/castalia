"use client";

import React, { useState } from "react";
import { apiFetch } from "../lib/apiClient";
import { Check, Copy, Play, Eye, Code, RotateCcw, Terminal, X, Box, Loader2, AlertCircle } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";

interface CodeBlockProps {
  language?: string;
  value: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language = "text", value }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"code" | "preview">("code");
  const [runLogs, setRunLogs] = useState<string[] | null>(null);
  const [isRunning, setIsRunning] = useState(false);
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

  const detectedLanguage = (language || "text").toLowerCase();

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
    const logs: string[] = [];
    const customConsole = {
      log: (...args: any[]) => {
        logs.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a))).join(" "));
      },
      error: (...args: any[]) => {
        logs.push("[ERROR] " + args.map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a))).join(" "));
      },
      warn: (...args: any[]) => {
        logs.push("[WARN] " + args.map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a))).join(" "));
      },
    };

    try {
      // Execute in isolated function scope
      const runFn = new Function("console", value);
      const result = runFn(customConsole);
      if (result !== undefined) {
        logs.push("[RETURN] " + (typeof result === "object" ? JSON.stringify(result, null, 2) : String(result)));
      }
      if (logs.length === 0) {
        logs.push("(Executed successfully with no output)");
      }
    } catch (err: any) {
      logs.push(`[RUNTIME ERROR] ${err.message || String(err)}`);
    }

    setRunLogs(logs);
    setIsRunning(false);
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
            language={detectedLanguage}
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
