"use client";

import { BookmarkSimple as BookMarked, Folder, SpinnerGap as Loader2, XCircle, Globe, CheckCircle as CheckCircle2, Download, FileText, Trash as Trash2, Faders as Sliders } from "@phosphor-icons/react";
import { formatBytes } from "@/lib/ollama";
import type { SettingsCtx } from "../SettingsModal";

export function RetrievalSection({ ctx }: { ctx: SettingsCtx }) {
  const {
    formData,
    handleDeleteImportedDoc,
    handleIngestWebDoc,
    handleToggleGlobalWatcher,
    importedDocs,
    isIngestingWebDoc,
    retrievalWatchedPath,
    retrievalWatcherError,
    retrievalWatcherStatus,
    setFormData,
    setRetrievalWatchedPath,
    setWebDocUrl,
    webDocError,
    webDocSuccess,
    webDocUrl,
  } = ctx;
  return (
<div className="space-y-5 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                    <BookMarked className="w-4 h-4 text-indigo-400" />
                    <span>Knowledge & Retrieval (RAG) Architecture</span>
                  </h3>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    Konfigurasi parameter RAG tingkat lanjut, pemantau folder otomatis di latar belakang (Ambient Watcher), dan pengimpor dokumentasi web langsung.
                  </p>
                </div>

                {/* 1. Ambient Folder Watcher */}
                <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4 text-amber-400" />
                        <h4 className="text-xs font-bold text-[var(--foreground)]">
                          Ambient Folder Watcher
                        </h4>
                        <span
                          className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            formData.watchedFolderEnabled
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-[var(--card-bg)] text-[var(--muted)] border border-[var(--card-border)]"
                          }`}
                        >
                          {formData.watchedFolderEnabled ? "Active & Watching" : "Stopped"}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--muted)] mt-1">
                        Memantau folder lokal di sistem kamu secara real-time. Perubahan file secara otomatis diproses dan disinkronkan ke retrieval engine.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleGlobalWatcher}
                      disabled={retrievalWatcherStatus === "starting" || retrievalWatcherStatus === "stopping"}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex-shrink-0 flex items-center gap-1.5 ${
                        formData.watchedFolderEnabled
                          ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
                      }`}
                    >
                      {retrievalWatcherStatus === "starting" || retrievalWatcherStatus === "stopping" ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Memproses...</span>
                        </>
                      ) : formData.watchedFolderEnabled ? (
                        "Hentikan Watcher"
                      ) : (
                        "Aktifkan Watcher"
                      )}
                    </button>
                  </div>

                  {retrievalWatcherError && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs">
                      <XCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{retrievalWatcherError}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-[var(--muted)]">
                      Target Folder Path di Komputer Anda:
                    </label>
                    <input
                      type="text"
                      value={retrievalWatchedPath}
                      onChange={(e) => {
                        setRetrievalWatchedPath(e.target.value);
                        setFormData({ ...formData, watchedFolderPath: e.target.value });
                      }}
                      placeholder="e.g. D:\Projects\MyCodebase atau C:\Users\Documents\Notes"
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* 2. Import Web Documentation */}
                <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-3.5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-sky-400" />
                        <h4 className="text-xs font-bold text-[var(--foreground)]">
                          Import Web Documentation & Articles
                        </h4>
                      </div>
                      <p className="text-[11px] text-[var(--muted)] mt-1">
                        Scrape dan ekstrak dokumentasi API, halaman tutorial, atau artikel teknis dari web untuk dijadikan referensi pengetahuan AI.
                      </p>
                    </div>
                  </div>

                  {webDocError && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs">
                      <XCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{webDocError}</span>
                    </div>
                  )}

                  {webDocSuccess && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      <span>{webDocSuccess}</span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="url"
                      value={webDocUrl}
                      onChange={(e) => setWebDocUrl(e.target.value)}
                      placeholder="https://docs.anthropic.com/en/docs/... atau https://nextjs.org/docs"
                      className="flex-1 px-3 py-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    <button
                      type="button"
                      onClick={handleIngestWebDoc}
                      disabled={isIngestingWebDoc || !webDocUrl.trim()}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white transition-all cursor-pointer flex items-center justify-center gap-1.5 flex-shrink-0"
                    >
                      {isIngestingWebDoc ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Scraping...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Impor Web Docs</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* List of Imported Web Docs */}
                  {importedDocs.length > 0 && (
                    <div className="pt-2 space-y-1.5 border-t border-[var(--card-border)]/60">
                      <div className="text-[11px] font-semibold text-[var(--muted)]">
                        Dokumentasi Web yang Telah Diimpor ({importedDocs.length}):
                      </div>
                      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                        {importedDocs.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between p-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <FileText className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="font-medium text-[var(--foreground)] truncate">
                                  {doc.name}
                                </div>
                                <div className="text-[10px] text-[var(--muted)] font-mono truncate">
                                  {doc.url}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              <span className="text-[10px] font-mono text-[var(--muted)]">
                                {formatBytes(doc.size)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteImportedDoc(doc.id)}
                                className="p-1 rounded-lg text-[var(--muted)] hover:text-rose-400 transition-colors cursor-pointer"
                                title="Hapus dokumentasi"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Advance Retrieval Tuning */}
                <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--foreground)] flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-indigo-400" />
                      <span>Advance Retrieval Hyperparameters</span>
                    </h4>
                    <p className="text-[11px] text-[var(--muted)] mt-0.5">
                      Parameter chunking dan reranking global saat dokumen dipotong menjadi potongan semantik dan diambil oleh AI.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Chunk Size */}
                    <div className="p-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                        <span>Chunk Size</span>
                        <span className="font-mono text-cyan-400 text-xs">
                          {(formData.ragChunkSizeChars || 1800).toLocaleString()} chars
                        </span>
                      </div>
                      <input
                        type="range"
                        min={500}
                        max={4000}
                        step={100}
                        value={formData.ragChunkSizeChars || 1800}
                        onChange={(e) =>
                          setFormData({ ...formData, ragChunkSizeChars: parseInt(e.target.value, 10) })
                        }
                        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                      <div className="flex justify-between text-[10px] text-[var(--muted)]">
                        <span>500 (Presisi)</span>
                        <span>4000 (Luas)</span>
                      </div>
                    </div>

                    {/* Chunk Overlap */}
                    <div className="p-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                        <span>Chunk Overlap</span>
                        <span className="font-mono text-cyan-400 text-xs">
                          {(formData.ragChunkOverlapChars || 200).toLocaleString()} chars
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={Math.min(1000, Math.max(0, (formData.ragChunkSizeChars || 1800) - 100))}
                        step={50}
                        value={Math.min(
                          formData.ragChunkOverlapChars || 200,
                          Math.max(0, (formData.ragChunkSizeChars || 1800) - 100)
                        )}
                        onChange={(e) =>
                          setFormData({ ...formData, ragChunkOverlapChars: parseInt(e.target.value, 10) })
                        }
                        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                      <div className="flex justify-between text-[10px] text-[var(--muted)]">
                        <span>0 (None)</span>
                        <span>Mencegah kehilangan konteks di perbatasan chunk</span>
                      </div>
                    </div>

                    {/* Retrieved Chunks (topK) */}
                    <div className="p-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                        <span>Chunks Retrieved (topK)</span>
                        <span className="font-mono text-purple-400 text-xs">
                          {formData.ragTopK || 8}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={2}
                        max={20}
                        step={1}
                        value={formData.ragTopK || 8}
                        onChange={(e) =>
                          setFormData({ ...formData, ragTopK: parseInt(e.target.value, 10) })
                        }
                        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                      <div className="flex justify-between text-[10px] text-[var(--muted)]">
                        <span>2 (Fokus)</span>
                        <span>20 (Komprehensif)</span>
                      </div>
                    </div>

                    {/* Semantic vs Keyword Blend */}
                    <div className="p-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-[var(--foreground)]">
                        <span>Semantic / Keyword Blend</span>
                        <span className="font-mono text-emerald-400 text-xs">
                          {Math.round((formData.ragSemanticWeight ?? 0.55) * 100)}% /{" "}
                          {Math.round((1 - (formData.ragSemanticWeight ?? 0.55)) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={formData.ragSemanticWeight ?? 0.55}
                        onChange={(e) =>
                          setFormData({ ...formData, ragSemanticWeight: parseFloat(e.target.value) })
                        }
                        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                      <div className="flex justify-between text-[10px] text-[var(--muted)]">
                        <span>Keyword (BM25)</span>
                        <span>Semantic (Vector)</span>
                      </div>
                    </div>
                  </div>

                  {/* Adjacent Chunk Stitching */}
                  <div className="pt-2 border-t border-[var(--card-border)] space-y-2">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="pr-4">
                        <span className="text-xs font-medium text-[var(--foreground)]">
                          Stitch Adjacent Chunks
                        </span>
                        <p className="text-[10px] text-[var(--muted)]">
                          Menggabungkan kembali potongan chunk yang berurutan menjadi satu blok utuh jika keduanya relevan.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.ragStitchChunks ?? true}
                        onChange={(e) =>
                          setFormData({ ...formData, ragStitchChunks: e.target.checked })
                        }
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </label>
                  </div>

                  {/* HyDE Option */}
                  <div className="pt-2 border-t border-[var(--card-border)] space-y-2">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="pr-4">
                        <span className="text-xs font-medium text-[var(--foreground)]">
                          HyDE (Hypothetical Document Embeddings)
                        </span>
                        <p className="text-[10px] text-[var(--muted)]">
                          Menghasilkan hipotesis jawaban sebelum pencarian untuk meningkatkan akurasi retrieval pada pertanyaan konseptual.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.ragHydeEnabled)}
                        onChange={(e) =>
                          setFormData({ ...formData, ragHydeEnabled: e.target.checked })
                        }
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </label>
                  </div>

                  {/* Reranker Option */}
                  <div className="pt-2 border-t border-[var(--card-border)] space-y-2">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="pr-4">
                        <span className="text-xs font-medium text-[var(--foreground)]">
                          Stage-2 Reranker
                        </span>
                        <p className="text-[10px] text-[var(--muted)]">
                          Mengurutkan ulang peringkat potongan dokumen yang diambil — pakai model lokal lewat prompt (kalau Semantic RAG aktif) atau scorer leksikal in-memory (kalau tidak). Bukan cross-encoder yang dilatih khusus.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.ragRerankEnabled ?? true)}
                        onChange={(e) =>
                          setFormData({ ...formData, ragRerankEnabled: e.target.checked })
                        }
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </label>
                  </div>

                  {/* Semantic RAG Option */}
                  <div className="pt-2 border-t border-[var(--card-border)] space-y-2">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="pr-4">
                        <span className="text-xs font-medium text-[var(--foreground)]">
                          Semantic RAG (Vector Similarity)
                        </span>
                        <p className="text-[10px] text-[var(--muted)]">
                          Nambahin pencarian dense-vector (embedding) di atas BM25 keyword search buat hasil retrieval yang lebih paham makna, bukan cuma cocok kata persis. Butuh model embedding ter-pull (misal <code className="text-[9px]">nomic-embed-text</code>) — kalau nggak ada, retrieval otomatis fallback ke BM25 murni. Juga ngaktifin cache respons semantik (bukan cuma exact-match).
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.semanticRagEnabled ?? false)}
                        onChange={(e) =>
                          setFormData({ ...formData, semanticRagEnabled: e.target.checked })
                        }
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </label>
                  </div>

                  {/* Grounding Checker LLM Fallback Option */}
                  <div className="pt-2 border-t border-[var(--card-border)] space-y-2">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="pr-4">
                        <span className="text-xs font-medium text-[var(--foreground)]">
                          Grounding Checker: LLM Fallback
                        </span>
                        <p className="text-[10px] text-[var(--muted)]">
                          Kalau pengecekan grounding pasca-generate nemu kalimat yang ambigu (nggak jelas didukung atau nggak sama konteks yang di-retrieve), minta opini kedua dari model lokal lewat satu prompt singkat. Nambah sedikit latensi per turn RAG — hanya jalan buat kalimat yang beneran ambigu, bukan semua.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.groundingLlmFallbackEnabled ?? false)}
                        onChange={(e) =>
                          setFormData({ ...formData, groundingLlmFallbackEnabled: e.target.checked })
                        }
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              </div>
  );
}
