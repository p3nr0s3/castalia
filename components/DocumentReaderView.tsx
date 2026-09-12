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
  Folder,
  FolderOpen,
  Search,
  Clock,
  Trash2,
  Play,
  Library,
  Flame,
  CheckCircle,
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
import { OllamaModel, ApiKeysConfig, ReadingItem } from "@/lib/types";
import { apiFetch } from "@/lib/apiClient";
import { storage } from "@/lib/storage";

interface DocumentReaderViewProps {
  models: OllamaModel[];
  selectedModel: string;
  apiKeys?: ApiKeysConfig;
  onBackToChat: () => void;
  onSendToChat?: (text: string) => void;
  defaultDocument?: ParsedDocument | null;
  initialBooksDirectory?: string;
  onSaveBooksDirectory?: (dir: string) => void;
}

type ReaderTheme = "default" | "sepia" | "dark" | "light";
type ComicDisplayMode = "single" | "continuous";
type ViewMode = "library" | "reader";

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
  initialBooksDirectory = "",
  onSaveBooksDirectory,
}) => {
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState<ViewMode>(defaultDocument ? "reader" : "library");
  const [doc, setDoc] = useState<ParsedDocument | null>(defaultDocument);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reader positioning
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [currentComicPageIndex, setCurrentComicPageIndex] = useState(0);
  const [isTocOpen, setIsTocOpen] = useState(false);

  // Display & Typography Preferences
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>("default");
  const [fontSize, setFontSize] = useState<number>(16);
  const [comicMode, setComicMode] = useState<ComicDisplayMode>("single");
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Resizable AI Assistant Panel
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(true);
  const [aiPanelWidth, setAiPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 380;
    const saved = Number(window.localStorage.getItem("reader_ai_panel_width"));
    return saved >= 280 && saved <= 760 ? saved : 380;
  });
  const [aiModel, setAiModel] = useState<string>(selectedModel || models[0]?.name || "llama3.1:latest");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isAiStreaming, setIsAiStreaming] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);

  // Library & Reading History State
  const [readingHistory, setReadingHistory] = useState<ReadingItem[]>(() => storage.getReadingItems());
  const [booksDirectory, setBooksDirectory] = useState<string>(() => {
    if (initialBooksDirectory) return initialBooksDirectory;
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("reader_books_dir") || "";
    }
    return "";
  });
  const [scannedBooks, setScannedBooks] = useState<Array<{
    name: string;
    path: string;
    format: "epub" | "comic" | "pdf" | "text";
    size: number;
    updatedAt: number;
  }>>([]);
  const [isScanningBooks, setIsScanningBooks] = useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [libraryFilterFormat, setLibraryFilterFormat] = useState<"all" | "epub" | "comic" | "pdf" | "text">("all");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const readerContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-sync aiModel when selectedModel changes
  useEffect(() => {
    if (selectedModel) setAiModel(selectedModel);
  }, [selectedModel]);

  // Initial scan if booksDirectory exists
  useEffect(() => {
    if (booksDirectory && booksDirectory.trim()) {
      handleScanBooksDirectory(booksDirectory.trim());
    }
  }, []);

  // Update reading progress in storage
  const recordReadingProgress = (
    currentDoc: ParsedDocument,
    chIdx: number,
    pageIdx: number
  ) => {
    const totalCh = currentDoc.chapters?.length || 1;
    const totalPg = currentDoc.pages?.length || 1;
    const progressPercent =
      currentDoc.format === "comic"
        ? Math.round(((pageIdx + 1) / totalPg) * 100)
        : Math.round(((chIdx + 1) / totalCh) * 100);

    const item: ReadingItem = {
      id: currentDoc.id,
      title: currentDoc.title,
      format: currentDoc.format as any,
      filesize: currentDoc.filesize || 0,
      lastReadAt: Date.now(),
      currentChapterIndex: chIdx,
      currentComicPageIndex: pageIdx,
      totalChapters: totalCh,
      totalPages: totalPg,
      progressPercent,
    };

    setReadingHistory((prev) => {
      const filtered = prev.filter((p) => p.title !== currentDoc.title && p.id !== currentDoc.id);
      const next = [item, ...filtered];
      storage.saveReadingItems(next);
      return next;
    });
  };

  // Keyboard navigation for comics and chapters
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (viewMode === "reader" && doc) {
        if (doc.format === "comic" && doc.pages && doc.pages.length > 0) {
          if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
            e.preventDefault();
            setCurrentComicPageIndex((prev) => {
              const next = Math.min(prev + 1, (doc.pages?.length || 1) - 1);
              recordReadingProgress(doc, currentChapterIndex, next);
              return next;
            });
          } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
            e.preventDefault();
            setCurrentComicPageIndex((prev) => {
              const next = Math.max(prev - 1, 0);
              recordReadingProgress(doc, currentChapterIndex, next);
              return next;
            });
          }
        } else if (doc.chapters && doc.chapters.length > 1) {
          if (e.key === "ArrowRight" && e.altKey) {
            e.preventDefault();
            setCurrentChapterIndex((prev) => {
              const next = Math.min(prev + 1, (doc.chapters?.length || 1) - 1);
              recordReadingProgress(doc, next, currentComicPageIndex);
              return next;
            });
          } else if (e.key === "ArrowLeft" && e.altKey) {
            e.preventDefault();
            setCurrentChapterIndex((prev) => {
              const next = Math.max(prev - 1, 0);
              recordReadingProgress(doc, next, currentComicPageIndex);
              return next;
            });
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [doc, viewMode, currentChapterIndex, currentComicPageIndex]);

  // Resizable AI Assistant Panel Handler
  const handleMouseDownAiResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = aiPanelWidth;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const diff = startX - moveEvent.clientX;
      const nextWidth = Math.min(760, Math.max(280, startWidth + diff));
      setAiPanelWidth(nextWidth);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("reader_ai_panel_width", String(nextWidth));
      }
    };

    const handleMouseUp = () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Scan local directory for books & comics
  const handleScanBooksDirectory = async (dirPath?: string) => {
    const targetDir = (dirPath || booksDirectory).trim();
    if (!targetDir) return;

    setIsScanningBooks(true);
    setErrorMessage(null);

    try {
      const res = await apiFetch(`/api/books?scanDir=${encodeURIComponent(targetDir)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Gagal memindai folder "${targetDir}".`);
      }
      const data = await res.json();
      setScannedBooks(data.books || []);
      setBooksDirectory(targetDir);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("reader_books_dir", targetDir);
      }
      onSaveBooksDirectory?.(targetDir);
    } catch (err: any) {
      console.error("Scan books error:", err);
      setErrorMessage(err.message || "Gagal memindai direktori buku lokal.");
    } finally {
      setIsScanningBooks(false);
    }
  };

  // Open a scanned book from local directory
  const handleOpenScannedBook = async (book: { name: string; path: string; format: string }) => {
    setIsLoadingFile(true);
    setErrorMessage(null);

    try {
      const res = await apiFetch(`/api/books?readPath=${encodeURIComponent(book.path)}`);
      if (!res.ok) {
        throw new Error("Gagal mengunduh berkas buku dari direktori lokal.");
      }
      const blob = await res.blob();
      const file = new File([blob], book.name, { type: blob.type });
      const parsed = await parseDocumentFile(file);
      setDoc(parsed);

      // Restore reading position if available in history
      const existing = readingHistory.find((h) => h.title === parsed.title);
      const startChapter = existing?.currentChapterIndex || 0;
      const startPage = existing?.currentComicPageIndex || 0;
      setCurrentChapterIndex(startChapter);
      setCurrentComicPageIndex(startPage);

      recordReadingProgress(parsed, startChapter, startPage);
      setViewMode("reader");
    } catch (err: any) {
      console.error("Failed to open scanned book:", err);
      setErrorMessage(err.message || "Gagal membuka buku lokal.");
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Handle Manual File Upload
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
      recordReadingProgress(parsed, 0, 0);
      setViewMode("reader");
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
    const sampleDoc: ParsedDocument = {
      id: "demo_sample",
      title: "Panduan AI Lokal & Era Baru Membaca Cerdas",
      format: "epub",
      filesize: 14200,
      chapters: SAMPLE_EPUB_CHAPTERS,
      totalWords: 345,
    };
    setDoc(sampleDoc);
    setCurrentChapterIndex(0);
    setCurrentComicPageIndex(0);
    setErrorMessage(null);
    setAiResponse("");
    recordReadingProgress(sampleDoc, 0, 0);
    setViewMode("reader");
  };

  // Delete history item
  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = readingHistory.filter((h) => h.id !== id);
    setReadingHistory(updated);
    storage.saveReadingItems(updated);
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
              } catch {}
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

  const handleCopyAiResponse = () => {
    if (!aiResponse) return;
    navigator.clipboard.writeText(aiResponse);
    setCopiedResponse(true);
    setTimeout(() => setCopiedResponse(false), 2000);
  };

  const handleSendResponseToChat = () => {
    if (!aiResponse || !onSendToChat) return;
    const formatted = `> **Kutipan Analisis Reader (${doc?.title || "Dokumen"}):**\n\n${aiResponse}`;
    onSendToChat(formatted);
    onBackToChat();
  };

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

  // Filtered lists for Library View
  const filteredHistory = readingHistory.filter((item) => {
    const matchesSearch = item.title.toLowerCase().includes(librarySearchQuery.toLowerCase());
    const matchesFormat = libraryFilterFormat === "all" || item.format === libraryFilterFormat;
    return matchesSearch && matchesFormat;
  });

  const filteredScannedBooks = scannedBooks.filter((book) => {
    const matchesSearch = book.name.toLowerCase().includes(librarySearchQuery.toLowerCase());
    const matchesFormat = libraryFilterFormat === "all" || book.format === libraryFilterFormat;
    return matchesSearch && matchesFormat;
  });

  return (
    <div
      ref={readerContainerRef}
      className={`flex flex-col h-[100dvh] w-full overflow-hidden select-text ${getThemeClasses()}`}
    >
      {/* Top Header Toolbar */}
      <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/85 backdrop-blur-md z-20">
        {/* Left: Back / View Mode Toggle & Title */}
        <div className="flex items-center gap-3 min-w-0">
          {viewMode === "reader" ? (
            <button
              onClick={() => setViewMode("library")}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-purple-400 transition-colors cursor-pointer"
              title="Kembali ke Rak Buku"
            >
              <Library className="w-3.5 h-3.5" />
              <span>Rak Buku</span>
            </button>
          ) : (
            <button
              onClick={onBackToChat}
              className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
              title="Kembali ke Chat Utama"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-400">
              {viewMode === "library" ? (
                <Library className="w-4 h-4" />
              ) : doc?.format === "comic" ? (
                <ImageIcon className="w-4 h-4" />
              ) : (
                <BookOpen className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-xs md:text-sm font-semibold truncate max-w-[180px] md:max-w-[280px] text-[var(--foreground)]">
                {viewMode === "library" ? "Perpustakaan & Komik" : doc?.title || "Document Reader"}
              </h2>
              {viewMode === "reader" && doc && (
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

          {/* Table of Contents Drawer Toggle (Only in reader view) */}
          {viewMode === "reader" && doc && ((doc.chapters && doc.chapters.length > 1) || (doc.pages && doc.pages.length > 1)) && (
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

        {/* Center: Pagination & Navigation (when in reader view) */}
        {viewMode === "reader" && doc && (
          <div className="hidden md:flex items-center gap-2 bg-[var(--card-bg)] border border-[var(--card-border)] px-2 py-1 rounded-xl shadow-2xs">
            {doc.format === "comic" ? (
              <>
                <button
                  onClick={() => {
                    const next = Math.max(currentComicPageIndex - 1, 0);
                    setCurrentComicPageIndex(next);
                    recordReadingProgress(doc, currentChapterIndex, next);
                  }}
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
                  onClick={() => {
                    const next = Math.min(currentComicPageIndex + 1, (doc.pages?.length || 1) - 1);
                    setCurrentComicPageIndex(next);
                    recordReadingProgress(doc, currentChapterIndex, next);
                  }}
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
                  onClick={() => {
                    const next = Math.max(currentChapterIndex - 1, 0);
                    setCurrentChapterIndex(next);
                    recordReadingProgress(doc, next, currentComicPageIndex);
                  }}
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
                  onClick={() => {
                    const next = Math.min(currentChapterIndex + 1, (doc.chapters?.length || 1) - 1);
                    setCurrentChapterIndex(next);
                    recordReadingProgress(doc, next, currentComicPageIndex);
                  }}
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

        {/* Right: Actions, Theme, Resizable AI Panel Toggle */}
        <div className="flex items-center gap-1.5">
          {viewMode === "reader" && (
            <>
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

              {/* Font Size Adjuster */}
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

              {/* Comic Display Mode */}
              {doc?.format === "comic" && (
                <button
                  onClick={() => setComicMode((m) => (m === "single" ? "continuous" : "single"))}
                  className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
                  title={comicMode === "single" ? "Mode Gulir Webtoon" : "Mode Single Page"}
                >
                  <Columns className="w-4 h-4" />
                </button>
              )}

              {/* AI Assistant Toggle Button */}
              <button
                onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  isAiPanelOpen
                    ? "bg-purple-600 text-white shadow-xs"
                    : "bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30"
                }`}
                title="Toggle AI Reading Assistant (Resizable)"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden md:inline">AI Asisten</span>
              </button>
            </>
          )}

          {/* Upload New Document Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoadingFile}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-[var(--foreground)] transition-colors cursor-pointer"
            title="Buka File Manual"
          >
            <Upload className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Unggah File</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,.cbz,.cbr,.pdf,.txt,.md,.markdown"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </header>

      {/* Main Body Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ============================================================= */}
        {/* VIEW 1: LIBRARY / SHELF MODE                                  */}
        {/* ============================================================= */}
        {viewMode === "library" ? (
          <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
            {/* Top Banner & Folder Setup */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-purple-900/20 via-indigo-900/15 to-transparent border border-purple-500/20 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Library className="w-5 h-5 text-purple-400" />
                  <h1 className="text-base md:text-lg font-bold text-[var(--foreground)]">
                    Rak Buku & Komik Digital
                  </h1>
                </div>
                <p className="text-xs text-[var(--muted)] max-w-xl leading-relaxed">
                  Buka novel EPUB, komik manga CBZ/CBR, dokumen PDF, dan catatan Markdown dengan pelacakan progres baca otomatis dan asisten AI pembaca cerdas.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleLoadSample}
                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Buka Contoh Demo</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--sidebar-hover)] border border-[var(--card-border)] text-xs font-semibold text-[var(--foreground)] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <FileUp className="w-3.5 h-3.5 text-purple-400" />
                  <span>Pilih File</span>
                </button>
              </div>
            </div>

            {/* Local Books Directory Scanner Bar */}
            <div className="p-3.5 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-xs flex flex-col sm:flex-row items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)] flex-shrink-0">
                <FolderOpen className="w-4 h-4 text-purple-400" />
                <span>Direktori Buku Lokal:</span>
              </div>
              <div className="flex-1 w-full flex items-center gap-2">
                <input
                  type="text"
                  value={booksDirectory}
                  onChange={(e) => setBooksDirectory(e.target.value)}
                  placeholder="Masukkan path folder: C:\Books atau /home/.../Documents"
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <button
                  onClick={() => handleScanBooksDirectory()}
                  disabled={isScanningBooks || !booksDirectory.trim()}
                  className="px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-500 disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer flex-shrink-0"
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span>{isScanningBooks ? "Memindai..." : "Pindai Folder"}</span>
                </button>
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between">
                <span>{errorMessage}</span>
                <button onClick={() => setErrorMessage(null)} className="p-1 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Search and Format Filter Tabs */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[var(--card-border)] pb-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                {(["all", "epub", "comic", "pdf", "text"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setLibraryFilterFormat(fmt)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      libraryFilterFormat === fmt
                        ? "bg-purple-600 text-white font-semibold shadow-2xs"
                        : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                    }`}
                  >
                    {fmt === "all"
                      ? "Semua Koleksi"
                      : fmt === "epub"
                      ? "📚 EPUB"
                      : fmt === "comic"
                      ? "🎨 Komik (CBZ/CBR)"
                      : fmt === "pdf"
                      ? "📄 PDF"
                      : "📝 Dokumen/TXT"}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  type="text"
                  value={librarySearchQuery}
                  onChange={(e) => setLibrarySearchQuery(e.target.value)}
                  placeholder="Cari judul buku atau komik..."
                  className="w-full pl-8 pr-3 py-1 text-xs rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* Section A: Reading History (Sedang Dibaca) */}
            {filteredHistory.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                    <Clock className="w-3.5 h-3.5 text-purple-400" />
                    <span>Lanjutkan Membaca (Riwayat)</span>
                  </div>
                  <span className="text-[11px] text-[var(--muted)]">
                    {filteredHistory.length} bacaan aktif
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredHistory.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        if (doc && doc.title === item.title) {
                          setCurrentChapterIndex(item.currentChapterIndex || 0);
                          setCurrentComicPageIndex(item.currentComicPageIndex || 0);
                          setViewMode("reader");
                        } else if (item.filePath) {
                          handleOpenScannedBook({ name: item.title, path: item.filePath, format: item.format });
                        } else {
                          // Try demo sample if demo id
                          handleLoadSample();
                        }
                      }}
                      className="group relative p-3.5 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-purple-500/50 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                    >
                      <button
                        onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                        className="absolute top-2 right-2 p-1 rounded-lg text-[var(--muted)] hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Hapus dari riwayat"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="space-y-2">
                        {/* Cover Placeholder with Gradient */}
                        <div className="h-28 rounded-xl bg-gradient-to-br from-purple-700/30 via-indigo-600/20 to-purple-900/40 border border-purple-500/20 flex flex-col items-center justify-center p-3 text-center relative overflow-hidden">
                          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-black/40 text-purple-300 border border-purple-400/20">
                            {item.format}
                          </div>
                          {item.format === "comic" ? (
                            <ImageIcon className="w-8 h-8 text-purple-400 mb-1 opacity-80" />
                          ) : (
                            <BookOpen className="w-8 h-8 text-purple-400 mb-1 opacity-80" />
                          )}
                          <span className="text-[10px] text-[var(--foreground)] font-semibold line-clamp-2">
                            {item.title}
                          </span>
                        </div>

                        <div>
                          <h4 className="text-xs font-bold text-[var(--foreground)] line-clamp-1">
                            {item.title}
                          </h4>
                          <div className="text-[10px] text-[var(--muted)] mt-0.5">
                            {item.format === "comic"
                              ? `Halaman ${item.currentComicPageIndex + 1} dari ${item.totalPages}`
                              : `Bab ${item.currentChapterIndex + 1} dari ${item.totalChapters}`}
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar & Resume Button */}
                      <div className="pt-3 space-y-2">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-[var(--muted)]">
                            <span>Progres</span>
                            <span className="font-semibold text-purple-400">
                              {item.progressPercent}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-[var(--sidebar-bg)] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-purple-500 transition-all"
                              style={{ width: `${Math.max(item.progressPercent, 5)}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[9px] text-[var(--muted)]">
                            {new Date(item.lastReadAt).toLocaleDateString()}
                          </span>
                          <span className="text-xs font-semibold text-purple-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                            <span>Baca</span>
                            <Play className="w-3 h-3 fill-purple-400" />
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section B: Scanned Books from Local Directory */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                  <FolderOpen className="w-3.5 h-3.5 text-purple-400" />
                  <span>Koleksi Buku & Komik dari Folder</span>
                </div>
                <span className="text-[11px] text-[var(--muted)]">
                  {filteredScannedBooks.length} file terdeteksi
                </span>
              </div>

              {filteredScannedBooks.length === 0 ? (
                <div className="p-8 rounded-2xl border border-dashed border-[var(--card-border)] text-center space-y-2">
                  <BookOpen className="w-8 h-8 text-[var(--muted)]/40 mx-auto" />
                  <p className="text-xs text-[var(--muted)]">
                    {booksDirectory
                      ? "Tidak ada file buku atau komik yang ditemukan pada folder ini. Masukkan folder lain atau unggah manual."
                      : "Masukkan path direktori lokal di atas (misal C:\\Books) untuk memindai koleksi secara otomatis."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredScannedBooks.map((book) => (
                    <div
                      key={book.path}
                      onClick={() => handleOpenScannedBook(book)}
                      className="group p-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-purple-500/50 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        {/* Cover Card */}
                        <div className="h-24 rounded-xl bg-gradient-to-br from-neutral-800/40 via-purple-950/20 to-neutral-900 border border-[var(--card-border)] flex flex-col items-center justify-center p-2 text-center relative overflow-hidden">
                          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-black/40 text-purple-300 border border-purple-400/20">
                            {book.format}
                          </div>
                          {book.format === "comic" ? (
                            <ImageIcon className="w-6 h-6 text-purple-400 mb-1 opacity-70" />
                          ) : (
                            <BookOpen className="w-6 h-6 text-purple-400 mb-1 opacity-70" />
                          )}
                          <span className="text-[9px] text-[var(--muted)] line-clamp-1">
                            {book.name}
                          </span>
                        </div>

                        <div>
                          <h4 className="text-xs font-semibold text-[var(--foreground)] line-clamp-2">
                            {book.name}
                          </h4>
                          <div className="text-[10px] text-[var(--muted)] mt-1 flex items-center justify-between">
                            <span>{Math.round(book.size / 1024)} KB</span>
                            <span>{new Date(book.updatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 text-right">
                        <span className="text-xs font-semibold text-purple-400 group-hover:underline flex items-center justify-end gap-1">
                          <span>Buka Bacaan</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ============================================================= */
          /* VIEW 2: ACTIVE READING VIEWPORT                               */
          /* ============================================================= */
          <>
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
                            recordReadingProgress(doc, currentChapterIndex, idx);
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
                          recordReadingProgress(doc, idx, currentComicPageIndex);
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
                          ~{Math.round(ch.content ? ch.content.split(/\s+/).length : 0)} kata
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </aside>
            )}

            {/* Center Viewport */}
            <main className="flex-1 flex flex-col h-full overflow-y-auto relative">
              {errorMessage && (
                <div className="m-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between">
                  <span>{errorMessage}</span>
                  <button onClick={() => setErrorMessage(null)} className="p-1 cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Active Document View */}
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

                          <div
                            onClick={() => {
                              const next = Math.max(currentComicPageIndex - 1, 0);
                              setCurrentComicPageIndex(next);
                              recordReadingProgress(doc, currentChapterIndex, next);
                            }}
                            className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize opacity-0 hover:opacity-10 bg-black/10 transition-opacity"
                            title="Klik untuk mundur"
                          />
                          <div
                            onClick={() => {
                              const next = Math.min(
                                currentComicPageIndex + 1,
                                (doc.pages?.length || 1) - 1
                              );
                              setCurrentComicPageIndex(next);
                              recordReadingProgress(doc, currentChapterIndex, next);
                            }}
                            className="absolute inset-y-0 right-0 w-1/4 cursor-e-resize opacity-0 hover:opacity-10 bg-black/10 transition-opacity"
                            title="Klik untuk maju"
                          />
                        </div>
                      ) : (
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

                      {/* Floating Zoom Bar */}
                      <div className="sticky bottom-4 mt-3 flex items-center gap-2 bg-[var(--card-bg)]/90 backdrop-blur-md border border-[var(--card-border)] px-3 py-1.5 rounded-full shadow-lg z-10 text-xs">
                        <button
                          onClick={() => setZoomLevel((z) => Math.max(z - 15, 50))}
                          className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                          title="Perkecil"
                        >
                          <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[11px] font-mono text-[var(--muted)] w-10 text-center">
                          {zoomLevel}%
                        </span>
                        <button
                          onClick={() => setZoomLevel((z) => Math.min(z + 15, 200))}
                          className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                          title="Perbesar"
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
                      <iframe src={doc.pdfUrl} className="w-full h-full border-0" title={doc.title} />
                    </div>
                  )}

                  {/* EPUB & Text Viewport */}
                  {(doc.format === "epub" || doc.format === "text") && currentChapter && (
                    <div className="flex-1 overflow-y-auto px-4 py-8 md:px-12 flex justify-center">
                      <article
                        className={`w-full max-w-3xl space-y-6 ${getThemeContentClasses()}`}
                        style={{ fontSize: `${fontSize}px`, lineHeight: 1.75 }}
                      >
                        <div className="border-b pb-4 mb-6 border-[var(--card-border)]">
                          <div className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-1">
                            {doc.title}
                          </div>
                          <h1 className="text-xl md:text-2xl font-bold font-serif">
                            {currentChapter.title}
                          </h1>
                        </div>

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

                        <div className="pt-10 border-t border-[var(--card-border)] flex items-center justify-between">
                          <button
                            onClick={() => {
                              const next = Math.max(currentChapterIndex - 1, 0);
                              setCurrentChapterIndex(next);
                              recordReadingProgress(doc, next, currentComicPageIndex);
                            }}
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
                            onClick={() => {
                              const next = Math.min(
                                currentChapterIndex + 1,
                                (doc.chapters?.length || 1) - 1
                              );
                              setCurrentChapterIndex(next);
                              recordReadingProgress(doc, next, currentComicPageIndex);
                            }}
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

            {/* Right Resizable AI Assistant Side Panel */}
            {isAiPanelOpen && (
              <aside
                className="flex-shrink-0 border-l border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] flex flex-col z-10 relative animate-in slide-in-from-right duration-150"
                style={{ width: `${aiPanelWidth}px` }}
              >
                {/* Drag Handle to Resize Left/Right */}
                <div
                  onMouseDown={handleMouseDownAiResize}
                  className="w-2 h-full cursor-col-resize hover:bg-purple-500/60 active:bg-purple-500 absolute top-0 left-0 z-20 touch-none -translate-x-1/2 transition-colors"
                  title="Geser untuk mengatur lebar panel Asisten AI"
                />

                {/* AI Header */}
                <div className="p-3 border-b border-[var(--sidebar-border)] flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--foreground)]">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span>Asisten AI Dokumen</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono text-[var(--muted)] hidden sm:inline">
                      {aiPanelWidth}px
                    </span>
                    <button
                      onClick={() => setIsAiPanelOpen(false)}
                      className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                      title="Tutup Panel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Model Selector */}
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
          </>
        )}
      </div>
    </div>
  );
};

export default DocumentReaderView;
