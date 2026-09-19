"use client";

import React, { useRef, useEffect, useState } from "react";
import { ArrowUp, Square, Sparkle as Sparkles, Paperclip, Plus, CaretDown as ChevronDown, X, FileText, Globe, Microphone as Mic, MicrophoneSlash as MicOff, CodeSimple as Code2, Brain, Lightning as Zap, Folder, Trash as Trash2, Terminal, Translate as Languages, TextAlignLeft as AlignLeft, Lightbulb, Wrench, GitBranch, Headphones, PhoneCall, Warning as AlertTriangle, ShieldCheck, Clock } from "@phosphor-icons/react";
import { Attachment, ThinkingMode, OllamaModel, ApiKeysConfig, Skill } from "@/lib/types";
import { formatBytes, detectModelProvider, getApiKeyForProvider } from "@/lib/ollama";
import { processSelectedFiles } from "@/lib/fileUtils";
import { ModelSelector } from "./ModelSelector";

interface SlashCommand {
  command: string;
  label: string;
  desc: string;
  icon: any;
  action?: () => void;
}

interface ChatInputProps {
  input: string;
  setInput: (val: string) => void;
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  chatFullWidth?: boolean;
  webSearchActive: boolean;
  setWebSearchActive: (val: boolean) => void;
  diskToolsActive: boolean;
  setDiskToolsActive: (val: boolean) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  queuedMessage?: string | null;
  onQueueMessage?: () => void;
  onCancelQueuedMessage?: () => void;
  disabled?: boolean;
  placeholder?: string;
  models?: OllamaModel[];
  selectedModel?: string;
  onSelectModel?: (modelName: string) => void;
  onRefreshModels?: () => void;
  isLoadingModels?: boolean;
  apiKeys?: ApiKeysConfig;
  onOpenSettings?: () => void;
  thinkingMode?: ThinkingMode;
  setThinkingMode?: (mode: ThinkingMode) => void;
  onOpenSkills?: () => void;
  onOpenArtifacts?: () => void;
  onOpenDiskExplorer?: () => void;
  onClearChat?: () => void;
  onOpenVoiceCall?: () => void;
  skills?: Skill[];
  isConnected?: boolean;
  ollamaUrl?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  attachments,
  setAttachments,
  chatFullWidth = true,
  webSearchActive,
  setWebSearchActive,
  diskToolsActive,
  setDiskToolsActive,
  onSend,
  onStop,
  isStreaming,
  queuedMessage,
  onQueueMessage,
  onCancelQueuedMessage,
  disabled = false,
  placeholder = "Write a message...",
  models,
  selectedModel,
  onSelectModel,
  onRefreshModels,
  isLoadingModels,
  apiKeys,
  onOpenSettings,
  thinkingMode = "default",
  setThinkingMode,
  onOpenSkills,
  onOpenArtifacts,
  onOpenDiskExplorer,
  onClearChat,
  onOpenVoiceCall,
  skills = [],
  isConnected,
  ollamaUrl,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Voice Dictate (STT) State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef(input);
  const baseTextRef = useRef("");

  // Model Health Check: Verify Ollama reachability, local model pulled status, and cloud API keys
  const modelHealth = React.useMemo<{
    isHealthy: boolean;
    warning?: string;
    actionType?: "reconnect" | "pull" | "api_key";
  }>(() => {
    if (!selectedModel) {
      return { isHealthy: false, warning: "Belum ada model yang dipilih. Silakan pilih model." };
    }

    const provider = detectModelProvider(selectedModel);

    if (provider === "ollama") {
      if (isConnected === false) {
        return {
          isHealthy: false,
          warning: `Server Ollama offline/tidak terhubung di ${ollamaUrl || "http://localhost:11434"}. Pastikan Ollama aktif ('ollama serve').`,
          actionType: "reconnect",
        };
      }

      if (models && models.length > 0) {
        const isPulled = models.some(
          (m) =>
            m.name === selectedModel ||
            m.name === `${selectedModel}:latest` ||
            m.name.split(":")[0] === selectedModel.split(":")[0]
        );
        if (!isPulled) {
          return {
            isHealthy: false,
            warning: `Model "${selectedModel}" belum terpasang di mesin lokal. Jalankan "ollama pull ${selectedModel}" atau pilih model lain.`,
            actionType: "pull",
          };
        }
      }
    } else {
      const apiKey = getApiKeyForProvider(provider, apiKeys);
      if (!apiKey && provider !== "custom") {
        return {
          isHealthy: false,
          warning: `API Key untuk provider ${provider.toUpperCase()} belum diisi. Masukkan API Key di Pengaturan.`,
          actionType: "api_key",
        };
      }
    }

    return { isHealthy: true };
  }, [selectedModel, isConnected, models, ollamaUrl, apiKeys]);

  useEffect(() => {
    inputRef.current = input;
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  // Slash Command Menu State
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  const SLASH_COMMANDS: SlashCommand[] = [
    {
      command: "/search",
      label: "Web Search & Scraper",
      desc: "Retrieve live factual search results & scrape page content (built-in, zero setup)",
      icon: Globe,
      action: () => {
        setWebSearchActive(true);
        setInput("");
      },
    },
    {
      command: "/scan",
      label: "OWASP Top 10 Security Audit",
      desc: "Run passive web security scan on any URL (e.g. /scan https://target.com)",
      icon: ShieldCheck,
      action: () => {
        setInput("/scan ");
      },
    },
    {
      command: "/think",
      label: "Deep Reasoning",
      desc: "Ask model to produce step-by-step chain-of-thought",
      icon: Brain,
      action: () => {
        setInput("Think step-by-step and show your reasoning process:\n");
      },
    },
    {
      command: "/code",
      label: "Software Architect",
      desc: "Generate production-ready code with clean typing",
      icon: Code2,
      action: () => {
        setInput("Write production-grade, modular, well-typed code for:\n");
      },
    },
    {
      command: "/summarize",
      label: "Summarize Text",
      desc: "Distill the provided text into clear key bullet points",
      icon: AlignLeft,
      action: () => {
        setInput("Summarize the following content concisely with clear bullet points:\n\n");
      },
    },
    {
      command: "/explain",
      label: "Explain Simply (ELI5)",
      desc: "Break down complex technical concepts for anyone to understand",
      icon: Lightbulb,
      action: () => {
        setInput("Explain the following concept simply and intuitively, using clear analogies:\n\n");
      },
    },
    {
      command: "/refactor",
      label: "Refactor & Optimize Code",
      desc: "Improve readability, runtime performance, and clean patterns",
      icon: Wrench,
      action: () => {
        setInput("Refactor and optimize the following code for better performance, clean syntax, and error safety:\n\n```\n\n```");
      },
    },
    {
      command: "/translate",
      label: "Accurate Translation",
      desc: "Translate text naturally while preserving idioms and context",
      icon: Languages,
      action: () => {
        setInput("Translate the following text into Indonesian / English with natural context:\n\n");
      },
    },
    {
      command: "/skills",
      label: "Agentic Skills Hub",
      desc: "Open and configure Claude & Agent skills",
      icon: Zap,
      action: () => {
        if (onOpenSkills) onOpenSkills();
        setInput("");
      },
    },
    {
      command: "/artifacts",
      label: "Artifacts & Share Hub",
      desc: "View, live-preview, or export generated code files",
      icon: Sparkles,
      action: () => {
        if (onOpenArtifacts) onOpenArtifacts();
        setInput("");
      },
    },
    {
      command: "/disk",
      label: "Local Disk Explorer",
      desc: "Browse and attach local files from your hard drive",
      icon: Folder,
      action: () => {
        if (onOpenDiskExplorer) onOpenDiskExplorer();
        setInput("");
      },
    },
    {
      command: "/clear",
      label: "Clear / New Conversation",
      desc: "Start a fresh new conversation",
      icon: Trash2,
      action: () => {
        if (onClearChat) onClearChat();
        setInput("");
      },
    },
    {
      command: "/bridge",
      label: "Custom Bridge",
      desc: "Send a message through one of your saved connectors (e.g. /bridge my-webhook Hello)",
      icon: GitBranch,
      action: () => {
        setInput("/bridge ");
      },
    },
    ...skills
      .filter((s) => s.enabled && s.slashCommand)
      .map((s) => ({
        command: s.slashCommand as string,
        label: s.name,
        desc: s.description,
        icon: Zap,
        action: () => {
          setInput(`${s.slashCommand}: `);
        },
      })),
  ];

  // Filter commands based on input
  const filteredCommands = input.startsWith("/")
    ? SLASH_COMMANDS.filter((cmd) => cmd.command.toLowerCase().includes(input.toLowerCase()))
    : [];

  useEffect(() => {
    if (input.startsWith("/") && filteredCommands.length > 0) {
      setShowSlashMenu(true);
      setSelectedCommandIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  }, [input, filteredCommands.length]);

  // Initialize Web Speech API for voice dictation
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "id-ID"; // Supports Indonesian and English automatically

        recognition.onresult = (event: any) => {
          let finalTranscript = "";
          let interimTranscript = "";

          for (let i = 0; i < event.results.length; i++) {
            const item = event.results[i];
            if (item.isFinal) {
              finalTranscript += item[0].transcript + " ";
            } else {
              interimTranscript += item[0].transcript;
            }
          }

          const spoken = (finalTranscript + interimTranscript).trim();
          const base = baseTextRef.current;
          if (spoken) {
            setInput(base ? `${base} ${spoken}` : spoken);
          }
        };

        recognition.onerror = (event: any) => {
          console.warn("Speech recognition error:", event.error);
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, [setInput]);

  const toggleVoiceDictation = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        baseTextRef.current = input.trim();
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error("Error starting speech recognition:", err);
      }
    }
  };

  const handleToggleThinkingMode = () => {
    if (!setThinkingMode) return;
    const nextMode: ThinkingMode =
      thinkingMode === "default"
        ? "think"
        : thinkingMode === "think"
        ? "nothink"
        : "default";
    setThinkingMode(nextMode);
  };

  const handleSelectCommand = (cmd: SlashCommand) => {
    if (cmd.action) {
      cmd.action();
    } else {
      setInput(`${cmd.command} `);
    }
    setShowSlashMenu(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Navigate slash command popover
    if (showSlashMenu && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleSelectCommand(filteredCommands[selectedCommandIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowSlashMenu(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      if (typeof window !== "undefined" && window.innerWidth < 768) {
        return;
      }
      e.preventDefault();
      if (!isStreaming && (input.trim() || attachments.length > 0) && !disabled) {
        onSend();
      } else if (isStreaming && input.trim() && attachments.length === 0 && !queuedMessage && onQueueMessage) {
        onQueueMessage();
      }
    }
  };

  // Handle file input change
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newAttachments = await processSelectedFiles(files);
    setAttachments((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Handle clipboard paste
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const filesToProcess: File[] = [];

    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const file = items[i].getAsFile();
        if (file) filesToProcess.push(file);
      }
    }

    if (filesToProcess.length > 0) {
      e.preventDefault();
      const newAttachments = await processSelectedFiles(filesToProcess);
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const canSend =
    (input.trim().length > 0 || attachments.length > 0) &&
    !isStreaming &&
    !disabled &&
    modelHealth.isHealthy;

  // Queuing is scoped to text-only (see the prop comment upstream) and to
  // one slot at a time — if something's already queued, the input stays
  // usable for editing but won't queue a second message until the first
  // one sends or is canceled.
  const canQueue =
    isStreaming &&
    input.trim().length > 0 &&
    attachments.length === 0 &&
    !queuedMessage &&
    !disabled &&
    !!onQueueMessage;

  return (
    <div className={`flex-shrink-0 p-2 sm:p-3 mx-auto w-full relative ${chatFullWidth ? "max-w-none sm:px-4" : "max-w-4xl"}`}>
      {/* Slash Commands Dropdown Menu */}
      {showSlashMenu && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 sm:left-4 sm:right-4 mb-2 max-h-64 overflow-y-auto rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-2xl z-50 p-1.5 space-y-0.5 animate-in slide-in-from-bottom-2 duration-150 touch-scroll">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1">
            <Terminal className="w-3 h-3 text-emerald-400" />
            Slash Commands & Tools ({filteredCommands.length})
          </div>
          {filteredCommands.map((cmd, idx) => {
            const isSelected = idx === selectedCommandIndex;
            const IconComp = cmd.icon;
            return (
              <button
                key={cmd.command}
                type="button"
                onClick={() => handleSelectCommand(cmd)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-emerald-500/15 text-[var(--foreground)] font-semibold"
                    : "hover:bg-[var(--sidebar-hover)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                      isSelected ? "bg-emerald-500 text-white" : "bg-[var(--sidebar-bg)] text-[var(--muted)]"
                    }`}
                  >
                    <IconComp className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-emerald-400">{cmd.command}</div>
                    <div className="text-[10px] text-[var(--muted)] truncate">{cmd.desc}</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-[var(--muted)] opacity-60">Tab ↵</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Input Container (Sleek Glassmorphic Card) */}
      <div
        className={`relative rounded-2xl sm:rounded-3xl border transition-all bg-[var(--card-bg)] shadow-md ${
          isDragging
            ? "border-blue-500 bg-blue-500/5 ring-2 ring-blue-500/20"
            : "border-[var(--card-border)] focus-within:border-emerald-500/60 focus-within:ring-2 focus-within:ring-emerald-500/20"
        }`}
      >
        {/* Attachment Previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 p-2 sm:p-2.5 border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/30">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative group/att flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] shadow-xs"
              >
                {att.type === "image" && att.dataUrl ? (
                  <img src={att.dataUrl} alt={att.name} className="w-4 h-4 rounded object-cover" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                )}
                <span className="truncate max-w-[120px] font-medium text-[11px]">{att.name}</span>
                <span className="text-[9px] text-[var(--muted)] font-mono">({formatBytes(att.size)})</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="p-0.5 rounded-full hover:bg-rose-500/20 hover:text-rose-400 text-[var(--muted)] transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Queued Message — will auto-send once the current stream finishes */}
        {queuedMessage && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--sidebar-border)] bg-blue-500/5">
            <Clock className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <span className="text-[11px] text-[var(--muted)] flex-shrink-0">Queued:</span>
            <span className="truncate flex-1 text-xs text-[var(--foreground)]">{queuedMessage}</span>
            {onCancelQueuedMessage && (
              <button
                type="button"
                onClick={onCancelQueuedMessage}
                className="p-0.5 rounded-full hover:bg-rose-500/20 hover:text-rose-400 text-[var(--muted)] transition-colors flex-shrink-0"
                title="Cancel queued message"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Model Health Inline Warning Banner */}
        {!modelHealth.isHealthy && modelHealth.warning && (
          <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-300">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span className="truncate">{modelHealth.warning}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {modelHealth.actionType === "reconnect" && onRefreshModels && (
                <button
                  type="button"
                  onClick={onRefreshModels}
                  className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[11px] font-semibold border border-amber-500/30 cursor-pointer transition-colors"
                >
                  Coba Hubungkan
                </button>
              )}
              {modelHealth.actionType === "api_key" && onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[11px] font-semibold border border-amber-500/30 cursor-pointer transition-colors"
                >
                  Buka Pengaturan
                </button>
              )}
            </div>
          </div>
        )}

        {/* Text Area */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            !modelHealth.isHealthy
              ? `⚠️ ${modelHealth.warning}`
              : isListening
              ? "🎙️ Listening to your voice..."
              : webSearchActive
              ? "Ask with live Web Search & Scraper..."
              : disabled
              ? "Please select a model..."
              : isStreaming && queuedMessage
              ? "One message already queued..."
              : isStreaming
              ? "Type a follow-up — it'll send once this reply finishes..."
              : placeholder
          }
          disabled={disabled || (isStreaming && !!queuedMessage)}
          rows={1}
          className="w-full resize-none bg-transparent px-3.5 sm:px-4 pt-3 pb-2 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none max-h-[180px] leading-relaxed block"
        />

        {/* Input Footer Toolbar */}
        <div className="flex items-center justify-between px-2 sm:px-3 py-1.5 sm:py-2 border-t border-[var(--sidebar-border)]/40">
          <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 pr-1 overflow-x-auto no-scrollbar">
            {/* Attachment Button matching Image 2 with Plus icon */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isStreaming}
              className="p-1.5 sm:p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors flex-shrink-0 cursor-pointer disabled:opacity-50"
              title="Add attachments or documents"
            >
              <Plus className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.md,.json,.csv,.py,.js,.ts,.html,.css,.java,.cpp,.c,.rs,.go,.sql,.sh,.yml,.yaml,.xml,.log,.env,.docx,.xlsx"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Voice Dictate (STT) Button matching Image 2 */}
            <button
              type="button"
              onClick={toggleVoiceDictation}
              disabled={disabled || isStreaming}
              className={`flex items-center gap-0.5 p-1.5 sm:p-2 rounded-xl transition-all cursor-pointer flex-shrink-0 ${
                isListening
                  ? "bg-rose-500 text-white shadow-md shadow-rose-500/30 animate-pulse ring-2 ring-rose-500/40"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
              }`}
              title={isListening ? "Stop voice dictation" : "Voice dictation"}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <ChevronDown className="w-3 h-3 opacity-60 -ml-0.5" />
            </button>

            {/* Live Interactive Chat (Indonesian Female Voice Mode) */}
            {onOpenVoiceCall && (
              <button
                type="button"
                onClick={onOpenVoiceCall}
                disabled={disabled || isStreaming}
                className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 shadow-2xs transition-all cursor-pointer flex-shrink-0"
                title="Interactive Chat (Percakapan Suara Real-Time)"
              >
                <Headphones className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline text-[11px] font-semibold">Interactive Chat</span>
              </button>
            )}

            {/* Web Search Toggle Button */}
            <button
              type="button"
              onClick={() => setWebSearchActive(!webSearchActive)}
              disabled={disabled || isStreaming}
              className={`flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer flex-shrink-0 ${
                webSearchActive
                  ? "bg-blue-600 text-white font-semibold shadow-xs shadow-blue-500/30"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
              }`}
              title={
                webSearchActive
                  ? "Web Search & Page Scraper Active"
                  : "Enable Web Search & Scraper (Built-in, No Docker required)"
              }
            >
              <Globe className={`w-3.5 h-3.5 ${webSearchActive ? "animate-spin-slow text-white" : ""}`} />
              <span className="hidden sm:inline text-[11px]">
                {webSearchActive ? "Search ON" : "Search"}
              </span>
            </button>

            {/* Disk Tools Toggle Button */}
            <button
              type="button"
              onClick={() => setDiskToolsActive(!diskToolsActive)}
              disabled={disabled || isStreaming}
              className={`flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer flex-shrink-0 ${
                diskToolsActive
                  ? "bg-emerald-600 text-white font-semibold shadow-xs shadow-emerald-500/30"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
              }`}
              title={
                diskToolsActive
                  ? "Disk Tools Active — AI bisa baca/tulis file di dalam project ini"
                  : "Aktifkan Disk Tools (AI bisa baca/tulis file project)"
              }
            >
              <Wrench className={`w-3.5 h-3.5 ${diskToolsActive ? "text-white" : ""}`} />
              <span className="hidden sm:inline text-[11px]">
                {diskToolsActive ? "Disk ON" : "Disk Tools"}
              </span>
            </button>

            {/* Thinking Mode Toggle Button */}
            {setThinkingMode && (
              <button
                type="button"
                onClick={handleToggleThinkingMode}
                disabled={disabled || isStreaming}
                className={`flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer flex-shrink-0 ${
                  thinkingMode === "think"
                    ? "bg-purple-600 text-white font-semibold shadow-xs shadow-purple-500/30"
                    : thinkingMode === "nothink"
                    ? "bg-amber-500/15 text-amber-400 font-semibold"
                    : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                }`}
                title={`Thinking Mode: ${thinkingMode.toUpperCase()}`}
              >
                {thinkingMode === "think" ? (
                  <>
                    <Brain className="w-3.5 h-3.5 text-white" />
                    <span className="hidden sm:inline text-[11px]">Think ON</span>
                  </>
                ) : thinkingMode === "nothink" ? (
                  <>
                    <Zap className="w-3.5 h-3.5 text-amber-400 fill-current" />
                    <span className="hidden sm:inline text-[11px]">Fast</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-[var(--muted)]" />
                    <span className="hidden sm:inline text-[11px]">Mode</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isStreaming ? (
              <>
                <button
                  type="button"
                  onClick={onStop}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 border border-rose-500/30 transition-all active:scale-95 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
                {canQueue && (
                  <button
                    type="button"
                    onClick={onQueueMessage}
                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 active:scale-90 cursor-pointer transition-all"
                    title="Queue — sends automatically once this reply finishes"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!canSend}
                className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all ${
                  canSend
                    ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 active:scale-90 cursor-pointer"
                    : "bg-[var(--sidebar-hover)] text-[var(--muted)] opacity-40 cursor-not-allowed"
                }`}
                title="Send message"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Disclaimer on Left + Borderless Model Selector on Right matching Image 2 */}
      <div className="flex items-center justify-between mt-2 px-1 text-xs text-[var(--muted)] select-none">
        <span className="text-[11px] opacity-75 truncate max-w-[55%] sm:max-w-none">
          Ollama is AI and can make mistakes. Please double-check responses.
        </span>
        {models && onSelectModel && (
          <div className="flex-shrink-0">
            <ModelSelector
              models={models}
              selectedModel={selectedModel || ""}
              onSelectModel={onSelectModel}
              onRefresh={onRefreshModels || (() => {})}
              isLoading={isLoadingModels}
              apiKeys={apiKeys}
              onOpenSettings={onOpenSettings}
              direction="up"
              textOnly={true}
            />
          </div>
        )}
      </div>
    </div>
  );
};
