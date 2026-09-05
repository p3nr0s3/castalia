"use client";

import React, { useState } from "react";
import { Check, Copy, Play, Eye, Code, RotateCcw, Terminal, X } from "lucide-react";
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
