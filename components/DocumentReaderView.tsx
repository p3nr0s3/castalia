"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  BookOpen,
  FileText,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Brain,
  Send,
  Copy,
  Check,
  Columns,
  Layers,
  ArrowLeft,
  Type,
  Maximize2,
  Minimize2,
  FileUp,
  Download,
  BookMarked,
  MessageSquare,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ParsedDocument,
  DocumentChapter,
  ComicPage,
  parseDocumentFile,
  parseTextDocument,
} from "@/lib/documentParsers";
import { OllamaModel, ApiKeysConfig } from "@/lib/types";
import { apiFetch } from "@/lib/apiClient";

interface DocumentReaderViewProps {
  models: OllamaModel[];
  selectedModel: string;
  apiKeys?: ApiKeysConfig;
  onBackToChat: () => void;
  onSendToChat?: (text: string) => void;
  defaultDocument?: ParsedDocument | null;
}

type ReaderTheme = "default" | "sepia" | "dark" | "light";
type ComicDisplayMode = "single" | "continuous";

const SAMPLE_EPUB_CHAPTERS: DocumentChapter[] = [
  {
    id: "ch_1",
    title: "Bab 1: Awal Mula Kecerdasan Buatan Lokal",
    content: `Perkembangan model bahasa besar (Large Language Models) telah mengubah cara manusia berinteraksi dengan teknologi. Di masa lalu, komputasi AI tingkat tinggi membutuhkan superkomputer terpusat di cloud dengan biaya langganan yang tinggi dan potensi isu privasi data.

Namun, terobosan arsitektur model kuantisasi (seperti GGUF, AWQ, dan EXL2) serta runtime efisien seperti Ollama dan llama.cpp memungkinkan siapa pun menjalankan model canggih langsung di laptop dan workstation lokal secara 100% offline.

Keuntungan utama dari ekosistem lokal ini adalah kedaulatan data (data sovereignty). Dokumen sensitif, karya sastra, catatan medis, maupun kode rahasia perusahaan tidak pernah meninggalkan mesin Anda. Selain itu, latensi menjadi konsisten tanpa ketergantungan pada koneksi internet publik.`,
  },
  {
    id: "ch_2",
    title: "Bab 2: Arsitektur Autonomous Multi-Agent",
    content: `Ketika AI berpindah dari sekadar chatbot satu arah menjadi agen otonom, sistem memerlukan memori berkelanjutan (Persistent Memory), pemanggilan fungsi (Function Calling), dan orkestrasi alat disk (Disk File Operations).

Agen modern dapat membaca dokumen buku tebal, membagi menjadi bab-bab kecil, dan melakukan penalaran mendalam (Chain-of-Thought). Dengan mengintegrasikan sistem RAG (Retrieval-Augmented Generation) berbasis BM25 dan semantic vector embeddings, agen dapat secara akurat mengutip halaman dan kutipan penting dari literatur panjang tanpa tersesat dalam batas konteks token (Context Window Limit).`,
  },
  {
    id: "ch_3",
    title: "Bab 3: Literasi Digital dan Masa Depan Pembaca",
    content: `Membaca buku dan komik bukan lagi kegiatan yang pasif. Dengan adanya pendamping AI interaktif di samping teks dokumen, pembaca dapat langsung mengajukan pertanyaan kritis: 'Apa latar belakang sejarah dari bab ini?', 'Bisakah dijelaskan analogi rumit ini dalam bahasa sederhana?', atau 'Buatkan ringkasan dan kartu flashcard untuk ujian esok hari'.

Sinergi antara pembacaan mendalam manusia dan kecepatan sintesis AI membuka era baru belajar mandiri (self-directed learning) yang jauh lebih cepat dan menyenangkan.`,
  },
];

export const DocumentReaderView: React.FC<DocumentReaderViewProps> = ({
  models,
  selectedModel,
  apiKeys,
  onBackToChat,
  onSendToChat,
  defaultDocument = null,
}) => {
  // Document state
  const [doc, setDoc] = useState<ParsedDocument | null>(defaultDocument);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Navigation state
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [currentComicPageIndex, setCurrentComicPageIndex] = useState(0);
  const [isTocOpen, setIsTocOpen] = useState(false);

  // Display and Reading Preferences
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>("default");
  const [fontSize, setFontSize] = useState<number>(16); // px
  const [comicMode, setComicMode] = useState<ComicDisplayMode>("single");
  const [zoomLevel, setZoomLevel] = useState<number>(100); // percent
  const [isFullscreen, setIsFullscreen] = useState(false);

  // AI Assistant side panel state
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(true);
  const [aiModel, setAiModel] = useState<string>(selectedModel || models[0]?.name || "llama3.1:latest");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isAiStreaming, setIsAiStreaming] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const readerContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-sync aiModel when selectedModel changes
  useEffect(() => {
    if (selectedModel) setAiModel(selectedModel);
  }, [selectedModel]);

  // Keyboard navigation for comics and chapters
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in textarea or input
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (doc?.format === "comic" && doc.pages && doc.pages.length > 0) {
        if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
          e.preventDefault();
          setCurrentComicPageIndex((prev) => Math.min(prev + 1, (doc.pages?.length || 1) - 1));
        } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
          e.preventDefault();
          setCurrentComicPageIndex((prev) => Math.max(prev - 1, 0));
        }
      } else if (doc?.chapters && doc.chapters.length > 1) {
        if (e.key === "ArrowRight" && e.altKey) {
          e.preventDefault();
          setCurrentChapterIndex((prev) => Math.min(prev + 1, (doc.chapters?.length || 1) - 1));
        } else if (e.key === "ArrowLeft" && e.altKey) {
          e.preventDefault();
          setCurrentChapterIndex((prev) => Math.max(prev - 1, 0));
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [doc]);

  // Handle File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setIsLoadingFile(true);
    setErrorMessage(null);

    try {
      const parsed = await parseDocumentFile(file);
      setDoc(parsed);
      setCurrentChapterIndex(0);
      setCurrentComicPageIndex(0);
      setAiResponse("");
    } catch (err: any) {
      console.error("Document parse failed:", err);
      setErrorMessage(err.message || "Gagal membuka file dokumen.");
    } finally {
      setIsLoadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Load Built-in Demo Sample
  const handleLoadSample = () => {
    setDoc({
      id: "demo_sample",
      title: "Panduan AI Lokal & Era Baru Membaca Cerdas",
      format: "epub",
      filesize: 14200,
      chapters: SAMPLE_EPUB_CHAPTERS,
      totalWords: 345,
    });
    setCurrentChapterIndex(0);
    setErrorMessage(null);
    setAiResponse("");
  };

  // Get current active content for reading and AI context
  const currentChapter = doc?.chapters?.[currentChapterIndex] || null;
  const currentComicPage = doc?.pages?.[currentComicPageIndex] || null;

  // Run AI Assistant completion with streaming
  const handleRunAi = async (customInstruction?: string) => {
    const instruction = customInstruction || aiPrompt;
    if (!instruction.trim()) return;

    setIsAiStreaming(true);
    setAiResponse("");

    // Build context based on current document and position
    let readingContext = `Dokumen: "${doc?.title || "Tanpa Judul"}" (Format: ${doc?.format?.toUpperCase()})\n`;
    if (doc?.format === "comic") {
      readingContext += `Sedang melihat halaman ${currentComicPageIndex + 1} dari ${doc.pages?.length || 0} (${currentComicPage?.filename || ""}).\n`;
    } else if (currentChapter) {
      readingContext += `Sedang membaca: "${currentChapter.title}"\n\nTeks Isi Bab:\n${currentChapter.content.slice(0, 7000)}\n`;
      if (currentChapter.content.length > 7000) {
        readingContext += `\n[... sisa teks bab dipangkas untuk efisiensi token ...]\n`;
      }
    } else if (doc?.rawText) {
      readingContext += `Isi Teks:\n${doc.rawText.slice(0, 7000)}\n`;
    }

    const systemPrompt = `You are a brilliant reading companion, book summarizer, and literary guide.
The user is currently reading the document described below. Help them understand, analyze, or study it clearly in Indonesian (or the language of their question).
Always provide well-structured markdown with bullet points or headers where appropriate.

=== DOKUMEN YANG SEDANG DIBACA ===
${readingContext}
=== SELESAI KONTEKS DOKUMEN ===`;

    const userMessage = instruction.trim();

    try {
      const isCloudModel = !models.some((m) => m.name === aiModel);
      let accumulated = "";

      if (isCloudModel) {
        const res = await apiFetch("/api/cloud/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            model: aiModel,
            apiKeys,
            stream: true,
          }),
        });

        if (!res.ok) throw new Error(`Cloud API HTTP error ${res.status}`);
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            accumulated += decoder.decode(value);
            setAiResponse(accumulated);
          }
        }
      } else {
        const res = await apiFetch("/api/ollama/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: aiModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            stream: true,
          }),
        });

        if (!res.ok) throw new Error(`Ollama model HTTP error ${res.status}`);
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const parsed = JSON.parse(line);
                if (parsed.message?.content) {
                  accumulated += parsed.message.content;
                  setAiResponse(accumulated);
                }
              } catch {
                // partial line
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error("AI Reader error:", err);
      setAiResponse(`❌ Gagal meminta bantuan AI: ${err.message || "Koneksi bermasalah."}`);
    } finally {
      setIsAiStreaming(false);
      setAiPrompt("");
    }
  };

  // Copy AI response
  const handleCopyAiResponse = () => {
    if (!aiResponse) return;
    navigator.clipboard.writeText(aiResponse);
    setCopiedResponse(true);
    setTimeout(() => setCopiedResponse(false), 2000);
  };

  // Send AI response to main chat
  const handleSendResponseToChat = () => {
    if (!aiResponse || !onSendToChat) return;
    const formatted = `> **Kutipan Analisis Reader (${doc?.title || "Dokumen"}):**\n\n${aiResponse}`;
    onSendToChat(formatted);
    onBackToChat();
  };

  // Theme styling helpers
  const getThemeClasses = () => {
    switch (readerTheme) {
      case "sepia":
        return "bg-[#fbf0d9] text-[#433422] border-[#e8d7be]";
      case "dark":
        return "bg-[#141416] text-[#e1e1e6] border-[#26262b]";
      case "light":
        return "bg-[#ffffff] text-[#1a1a1a] border-[#e5e5e5]";
      default:
        return "bg-[var(--background)] text-[var(--foreground)] border-[var(--sidebar-border)]";
    }
  };

  const getThemeContentClasses = () => {
    switch (readerTheme) {
      case "sepia":
        return "text-[#3f3120]";
      case "dark":
        return "text-[#dcdce0]";
      case "light":
        return "text-[#1f1f1f]";
      default:
        return "text-[var(--foreground)]";
    }
  };

  return (
    <div
      ref={readerContainerRef}
      className={`flex flex-col h-[100dvh] w-full overflow-hidden select-text ${getThemeClasses()}`}
    >
      {/* Top Header Toolbar */}
      <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/80 backdrop-blur-md z-20">
        {/* Left: Back & Document Metadata */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBackToChat}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
            title="Kembali ke Workspace Chat"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-400">
              {doc?.format === "comic" ? (
                <ImageIcon className="w-4 h-4" />
              ) : (
                <BookOpen className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-xs md:text-sm font-semibold truncate max-w-[200px] md:max-w-[320px] text-[var(--foreground)]">
                {doc?.title || "Document & Comic Reader"}
              </h2>
              {doc && (
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
                  <span className="uppercase font-bold tracking-wider text-purple-400">
                    {doc.format}
                  </span>
                  <span>•</span>
                  {doc.format === "comic" ? (
                    <span>
                      Hal {currentComicPageIndex + 1} / {doc.pages?.length || 0}
                    </span>
                  ) : (
                    <span>
                      Bab {currentChapterIndex + 1} / {doc.chapters?.length || 1}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Table of Contents Drawer Toggle */}
          {doc && ((doc.chapters && doc.chapters.length > 1) || (doc.pages && doc.pages.length > 1)) && (
            <button
              onClick={() => setIsTocOpen(!isTocOpen)}
              className={`ml-1 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                isTocOpen
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] bg-[var(--card-bg)] border-[var(--card-border)]"
              }`}
              title="Daftar Isi & Navigasi Bab"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {doc.format === "comic" ? "Halaman" : "Daftar Bab"}
              </span>
            </button>
          )}
        </div>

        {/* Center: Pagination & Navigation (if document is open) */}
        {doc && (
          <div className="hidden md:flex items-center gap-2 bg-[var(--card-bg)] border border-[var(--card-border)] px-2 py-1 rounded-xl shadow-2xs">
            {doc.format === "comic" ? (
              <>
                <button
                  onClick={() => setCurrentComicPageIndex((p) => Math.max(p - 1, 0))}
                  disabled={currentComicPageIndex <= 0}
                  className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30 cursor-pointer"
                  title="Halaman Sebelumnya (←)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono font-medium px-1">
                  {currentComicPageIndex + 1} / {doc.pages?.length || 1}
                </span>
                <button
                  onClick={() =>
                    setCurrentComicPageIndex((p) =>
                      Math.min(p + 1, (doc.pages?.length || 1) - 1)
                    )
                  }
                  disabled={currentComicPageIndex >= (doc.pages?.length || 1) - 1}
                  className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30 cursor-pointer"
                  title="Halaman Selanjutnya (→)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setCurrentChapterIndex((c) => Math.max(c - 1, 0))}
                  disabled={currentChapterIndex <= 0}
                  className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30 cursor-pointer"
                  title="Bab Sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium px-1 truncate max-w-[160px]">
                  {currentChapter?.title || `Bab ${currentChapterIndex + 1}`}
                </span>
                <button
                  onClick={() =>
                    setCurrentChapterIndex((c) =>
                      Math.min(c + 1, (doc.chapters?.length || 1) - 1)
                    )
                  }
                  disabled={currentChapterIndex >= (doc.chapters?.length || 1) - 1}
                  className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30 cursor-pointer"
                  title="Bab Selanjutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        )}

        {/* Right: Preferences, Upload, AI Panel Toggle */}
        <div className="flex items-center gap-1.5">
          {/* Theme Dropdown */}
          <div className="flex items-center bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-0.5">
            <button
              onClick={() => setReaderTheme("default")}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                readerTheme === "default"
                  ? "bg-purple-600 text-white"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
              title="Tema Default UI"
            >
              Default
            </button>
            <button
              onClick={() => setReaderTheme("sepia")}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                readerTheme === "sepia"
                  ? "bg-[#e8d7be] text-[#433422] font-bold"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
              title="Tema Sepia Kertas Lembut"
            >
              Sepia
            </button>
            <button
              onClick={() => setReaderTheme("dark")}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                readerTheme === "dark"
                  ? "bg-neutral-800 text-neutral-100 font-bold"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
              title="Tema Gelap OLED"
            >
              Dark
            </button>
          </div>

          {/* Font Size Adjuster (For text / epub) */}
          {doc?.format !== "comic" && (
            <div className="hidden sm:flex items-center gap-1 bg-[var(--card-bg)] border border-[var(--card-border)] px-1.5 py-0.5 rounded-lg text-xs">
              <button
                onClick={() => setFontSize((s) => Math.max(s - 1, 13))}
                className="px-1 text-[var(--muted)] hover:text-[var(--foreground)] font-bold cursor-pointer"
                title="Perkecil Teks"
              >
                A-
              </button>
              <span className="text-[10px] font-mono text-[var(--muted)]">{fontSize}px</span>
              <button
                onClick={() => setFontSize((s) => Math.min(s + 1, 24))}
                className="px-1 text-[var(--muted)] hover:text-[var(--foreground)] font-bold cursor-pointer"
                title="Perbesar Teks"
              >
                A+
              </button>
            </div>
          )}

          {/* Comic Display Mode Toggle */}
          {doc?.format === "comic" && (
            <button
              onClick={() =>
                setComicMode((m) => (m === "single" ? "continuous" : "single"))
              }
              className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
              title={comicMode === "single" ? "Mode Gulir Webtoon" : "Mode Single Page"}
            >
              <Columns className="w-4 h-4" />
            </button>
          )}

          {/* Upload New Document Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoadingFile}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-[var(--foreground)] transition-colors cursor-pointer"
            title="Buka Dokumen atau Komik Lain"
          >
            <Upload className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Buka File</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,.cbz,.cbr,.pdf,.txt,.md,.markdown"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* AI Assistant Toggle Button */}
          <button
            onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              isAiPanelOpen
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30"
            }`}
            title="Toggle AI Reading Assistant"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden md:inline">AI Asisten</span>
          </button>
        </div>
      </header>

      {/* Main Body Area: Left TOC Drawer + Center Viewport + Right AI Assistant */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left TOC Drawer */}
        {isTocOpen && doc && (
          <aside className="w-64 md:w-72 flex-shrink-0 border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] flex flex-col z-10 animate-in slide-in-from-left duration-200">
            <div className="p-3 border-b border-[var(--sidebar-border)] flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--foreground)]">
                <BookMarked className="w-4 h-4 text-purple-400" />
                <span>{doc.format === "comic" ? "Daftar Halaman" : "Daftar Bab"}</span>
              </div>
              <button
                onClick={() => setIsTocOpen(false)}
                className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {doc.format === "comic" ? (
                <div className="grid grid-cols-2 gap-2">
                  {doc.pages?.map((page, idx) => (
                    <button
                      key={page.filename}
                      onClick={() => {
                        setCurrentComicPageIndex(idx);
                        if (window.innerWidth < 768) setIsTocOpen(false);
                      }}
                      className={`p-1.5 rounded-xl border text-center transition-all cursor-pointer ${
                        currentComicPageIndex === idx
                          ? "border-purple-500 bg-purple-500/15 font-bold text-purple-400"
                          : "border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--muted)] hover:border-[var(--muted)]"
                      }`}
                    >
                      <div className="text-[11px] truncate">Hal {page.index}</div>
                      <div className="text-[9px] text-[var(--muted)] truncate">
                        {page.filename}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                doc.chapters?.map((ch, idx) => (
                  <button
                    key={ch.id}
                    onClick={() => {
                      setCurrentChapterIndex(idx);
                      if (window.innerWidth < 768) setIsTocOpen(false);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                      currentChapterIndex === idx
                        ? "bg-purple-600 text-white font-medium shadow-2xs"
                        : "text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                    }`}
                  >
                    <div className="truncate">{ch.title}</div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        currentChapterIndex === idx ? "text-purple-200" : "text-[var(--muted)]"
                      }`}
                    >
                      ~{Math.round((ch.content ? ch.content.split(/\s+/).length : 0))} kata
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>
        )}

        {/* Center Viewport */}
        <main className="flex-1 flex flex-col h-full overflow-y-auto relative">
          {/* Error Banner */}
          {errorMessage && (
            <div className="m-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between">
              <span>{errorMessage}</span>
              <button
                onClick={() => setErrorMessage(null)}
                className="p-1 text-rose-400 hover:text-rose-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Empty State / Welcome Screen */}
          {!doc && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4 shadow-sm">
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-[var(--foreground)] mb-1">
                Document & Comic Reader Terintegrasi
              </h3>
              <p className="text-xs text-[var(--muted)] max-w-md mb-6 leading-relaxed">
                Baca dokumen <strong>EPUB</strong>, komik <strong>CBZ / CBR</strong>, berkas{" "}
                <strong>PDF</strong>, dan catatan <strong>Markdown / TXT</strong> secara instan langsung di
                browser, didampingi Asisten AI cerdas untuk merangkum dan menjelaskan isi bacaan.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoadingFile}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <FileUp className="w-4 h-4" />
                  <span>{isLoadingFile ? "Membuka File..." : "Pilih File dari Komputer"}</span>
                </button>

                <button
                  onClick={handleLoadSample}
                  className="px-4 py-2.5 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-[var(--foreground)] text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>Buka Contoh Demo Buku</span>
                </button>
              </div>

              {/* Supported Badges */}
              <div className="flex items-center gap-2 mt-8 text-[11px] text-[var(--muted)]">
                <span className="px-2 py-0.5 rounded-md bg-[var(--card-bg)] border border-[var(--card-border)]">
                  📚 EPUB
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[var(--card-bg)] border border-[var(--card-border)]">
                  🎨 CBZ / CBR
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[var(--card-bg)] border border-[var(--card-border)]">
                  📄 PDF
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[var(--card-bg)] border border-[var(--card-border)]">
                  📝 TXT & Markdown
                </span>
              </div>
            </div>
          )}

          {/* Active Document Viewer */}
          {doc && (
            <div className="flex-1 flex flex-col h-full overflow-y-auto">
              {/* Comic Viewport */}
              {doc.format === "comic" && (
                <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0 overflow-y-auto">
                  {comicMode === "single" ? (
                    <div className="relative max-w-full flex items-center justify-center">
                      {currentComicPage ? (
                        <img
                          src={currentComicPage.url}
                          alt={currentComicPage.filename}
                          className="max-h-[82vh] object-contain rounded-lg shadow-xl select-none"
                          style={{
                            transform: `scale(${zoomLevel / 100})`,
                            transition: "transform 0.15s ease-out",
                          }}
                        />
                      ) : (
                        <div className="text-xs text-[var(--muted)]">Halaman tidak ditemukan.</div>
                      )}

                      {/* Clickable side tap zones for fast next/prev page */}
                      <div
                        onClick={() => setCurrentComicPageIndex((p) => Math.max(p - 1, 0))}
                        className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize opacity-0 hover:opacity-10 bg-black/10 transition-opacity"
                        title="Klik untuk mundur"
                      />
                      <div
                        onClick={() =>
                          setCurrentComicPageIndex((p) =>
                            Math.min(p + 1, (doc.pages?.length || 1) - 1)
                          )
                        }
                        className="absolute inset-y-0 right-0 w-1/4 cursor-e-resize opacity-0 hover:opacity-10 bg-black/10 transition-opacity"
                        title="Klik untuk maju"
                      />
                    </div>
                  ) : (
                    /* Continuous Webtoon Scroll Mode */
                    <div className="w-full max-w-2xl space-y-2 py-4">
                      {doc.pages?.map((page) => (
                        <img
                          key={page.filename}
                          src={page.url}
                          alt={page.filename}
                          loading="lazy"
                          className="w-full rounded shadow-md"
                        />
                      ))}
                    </div>
                  )}

                  {/* Comic Zoom and Navigation Floating Controls */}
                  <div className="sticky bottom-4 mt-3 flex items-center gap-2 bg-[var(--card-bg)]/90 backdrop-blur-md border border-[var(--card-border)] px-3 py-1.5 rounded-full shadow-lg z-10 text-xs">
                    <button
                      onClick={() => setZoomLevel((z) => Math.max(z - 15, 50))}
                      className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                      title="Perkecil Gambar"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-mono text-[var(--muted)] w-10 text-center">
                      {zoomLevel}%
                    </span>
                    <button
                      onClick={() => setZoomLevel((z) => Math.min(z + 15, 200))}
                      className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                      title="Perbesar Gambar"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setZoomLevel(100)}
                      className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer ml-1"
                      title="Reset Zoom"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* PDF Viewport */}
              {doc.format === "pdf" && doc.pdfUrl && (
                <div className="flex-1 flex flex-col h-full">
                  <iframe
                    src={doc.pdfUrl}
                    className="w-full h-full border-0"
                    title={doc.title}
                  />
                </div>
              )}

              {/* EPUB & Text/Markdown Viewport */}
              {(doc.format === "epub" || doc.format === "text") && currentChapter && (
                <div className="flex-1 overflow-y-auto px-4 py-8 md:px-12 flex justify-center">
                  <article
                    className={`w-full max-w-3xl space-y-6 ${getThemeContentClasses()}`}
                    style={{ fontSize: `${fontSize}px`, lineHeight: 1.75 }}
                  >
                    {/* Chapter Title Header */}
                    <div className="border-b pb-4 mb-6 border-[var(--card-border)]">
                      <div className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-1">
                        {doc.title}
                      </div>
                      <h1 className="text-xl md:text-2xl font-bold font-serif">
                        {currentChapter.title}
                      </h1>
                    </div>

                    {/* Chapter Content */}
                    {doc.format === "text" && doc.title.endsWith(".md") ? (
                      <div className="prose dark:prose-invert max-w-none text-inherit leading-relaxed">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {currentChapter.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap leading-relaxed font-serif">
                        {currentChapter.content}
                      </div>
                    )}

                    {/* Chapter Bottom Navigation */}
                    <div className="pt-10 border-t border-[var(--card-border)] flex items-center justify-between">
                      <button
                        onClick={() => setCurrentChapterIndex((c) => Math.max(c - 1, 0))}
                        disabled={currentChapterIndex <= 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--card-border)] text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Bab Sebelumnya</span>
                      </button>

                      <span className="text-xs font-mono text-[var(--muted)]">
                        {currentChapterIndex + 1} / {doc.chapters?.length || 1}
                      </span>

                      <button
                        onClick={() =>
                          setCurrentChapterIndex((c) =>
                            Math.min(c + 1, (doc.chapters?.length || 1) - 1)
                          )
                        }
                        disabled={currentChapterIndex >= (doc.chapters?.length || 1) - 1}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium disabled:opacity-30 cursor-pointer"
                      >
                        <span>Bab Berikutnya</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </article>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right Collapsible AI Assistant Side Panel */}
        {isAiPanelOpen && (
          <aside className="w-80 md:w-96 flex-shrink-0 border-l border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] flex flex-col z-10 animate-in slide-in-from-right duration-200">
            {/* AI Header */}
            <div className="p-3 border-b border-[var(--sidebar-border)] flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--foreground)]">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Asisten AI Dokumen</span>
              </div>
              <button
                onClick={() => setIsAiPanelOpen(false)}
                className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Model Selector Pill */}
            <div className="px-3 pt-2.5 pb-1">
              <select
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                className="w-full text-[11px] px-2 py-1 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer truncate"
              >
                {models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} (Lokal)
                  </option>
                ))}
                <option value="gemini-2.5-flash">gemini-2.5-flash (Cloud)</option>
                <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (Cloud)</option>
                <option value="gpt-4o">GPT-4o (Cloud)</option>
              </select>
            </div>

            {/* Quick Action Buttons */}
            <div className="p-3 space-y-1.5 border-b border-[var(--sidebar-border)]">
              <div className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
                Aksi Cepat untuk Bab Ini
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleRunAi("Tolong buatkan ringkasan padat, jelas, dan poin-poin utama dari bab ini.")
                  }
                  disabled={isAiStreaming || !doc}
                  className="p-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-purple-500/40 text-left text-xs text-[var(--foreground)] transition-colors disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                >
                  <BookOpen className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                  <span className="truncate">Ringkas Bab</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleRunAi(
                      "Jelaskan konsep-konsep sulit, kosa kata arkais, atau istilah teknis yang muncul di bab ini."
                    )
                  }
                  disabled={isAiStreaming || !doc}
                  className="p-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-purple-500/40 text-left text-xs text-[var(--foreground)] transition-colors disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  <span className="truncate">Jelaskan Konsep</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleRunAi(
                      "Buatkan 3 pertanyaan reflektif / kuis pemahaman materi beserta jawabannya berdasarkan bab ini."
                    )
                  }
                  disabled={isAiStreaming || !doc}
                  className="p-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-purple-500/40 text-left text-xs text-[var(--foreground)] transition-colors disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                >
                  <Brain className="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />
                  <span className="truncate">Kuis Belajar</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleRunAi(
                      "Kutipkan kalimat atau kutipan paling bermakna/berpengaruh dari bab ini beserta alasannya."
                    )
                  }
                  disabled={isAiStreaming || !doc}
                  className="p-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-purple-500/40 text-left text-xs text-[var(--foreground)] transition-colors disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                >
                  <BookMarked className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span className="truncate">Kutipan Terbaik</span>
                </button>
              </div>
            </div>

            {/* AI Response Output Area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {aiResponse ? (
                <div className="p-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)] space-y-2">
                  <div className="flex items-center justify-between border-b pb-1.5 border-[var(--card-border)]">
                    <span className="text-[10px] font-bold text-purple-400 uppercase">
                      Jawaban Asisten
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleCopyAiResponse}
                        className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                        title="Salin Tanggapan"
                      >
                        {copiedResponse ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      {onSendToChat && (
                        <button
                          onClick={handleSendResponseToChat}
                          className="p-1 rounded text-[var(--muted)] hover:text-purple-400 cursor-pointer"
                          title="Kirim ke Chat Utama"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="prose dark:prose-invert prose-xs max-w-none leading-relaxed text-inherit">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiResponse}</ReactMarkdown>
                  </div>
                  {isAiStreaming && (
                    <div className="flex items-center gap-1.5 text-[10px] text-purple-400 font-mono animate-pulse">
                      <span>•</span>
                      <span>Menulis tanggapan...</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-[var(--muted)] text-xs">
                  <MessageSquare className="w-6 h-6 opacity-30 mb-2" />
                  <span>
                    Gunakan tombol aksi cepat di atas atau tanyakan pertanyaan spesifik di bawah.
                  </span>
                </div>
              )}
            </div>

            {/* AI Prompt Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRunAi();
              }}
              className="p-3 border-t border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]"
            >
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Tanyakan sesuatu tentang bab ini..."
                  disabled={isAiStreaming || !doc}
                  className="w-full pl-3 pr-9 py-2 text-xs rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!aiPrompt.trim() || isAiStreaming || !doc}
                  className="absolute right-1.5 p-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <Send className="w-3 h-3" />
                </button>
              </div>
            </form>
          </aside>
        )}
      </div>
    </div>
  );
};

export default DocumentReaderView;
