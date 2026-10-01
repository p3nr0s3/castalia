"use client";

import { Brain, MagicWand as Wand2, Faders as Sliders, SpinnerGap as Loader2, CheckCircle as CheckCircle2, XCircle, Terminal, HardDrive, Lightning as Zap, Cpu, Check, Copy } from "@phosphor-icons/react";
import { ThinkingMode } from "@/lib/types";
import { CONTEXT_SIZE_PRESETS, KEEP_ALIVE_PRESETS } from "@/lib/constants";
import type { SettingsCtx } from "../SettingsModal";

export function ChatSection({ ctx }: { ctx: SettingsCtx }) {
  const {
    applyParamPreset,
    copiedAccelCmd,
    formData,
    handleCopyAccelCmd,
    handleTestLayaConnection,
    isTestingLaya,
    layaStatus,
    setFormData,
  } = ctx;
  return (
<div className="space-y-4 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">Model Customization & Hyperparameters</h3>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    Fine-tune reasoning, temperature, sampling, and context window limits.
                  </p>
                </div>

                {/* Thinking Mode Default Selector */}
                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--foreground)]">
                    <Brain className="w-4 h-4 text-purple-400" />
                    <span>Default Thinking & Reasoning Mode</span>
                  </div>
                  <select
                    value={formData.thinkingMode || "default"}
                    onChange={(e) =>
                      setFormData({ ...formData, thinkingMode: e.target.value as ThinkingMode })
                    }
                    className="w-full p-2.5 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-purple-500 focus:outline-none cursor-pointer"
                  >
                    <option value="default">Natural Default — Standard model reasoning behavior</option>
                    <option value="think">Think Mode — Forces Chain-of-Thought step-by-step reasoning</option>
                    <option value="nothink">No-Think (Fast) — High-speed direct concise response</option>
                  </select>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)]">
                  <span className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Hyperparameter Presets</span>
                  </span>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        applyParamPreset(e.target.value as any);
                      }
                    }}
                    className="w-full sm:w-72 p-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-amber-500 focus:outline-none cursor-pointer"
                  >
                    <option value="" disabled>Pilih Parameter Preset...</option>
                    <option value="code">Precise Code (Temp 0.2, TopP 0.8, Pen 1.15)</option>
                    <option value="balanced">Balanced Assistant (Temp 0.7, TopP 0.9, Pen 1.1)</option>
                    <option value="creative">Creative Writer (Temp 1.2, TopP 0.95, Pen 1.05)</option>
                  </select>
                </div>

                {/* Auto Task-Adaptive Sampling Toggle */}
                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                        <Sliders className="w-4 h-4" />
                      </div>
                      <div className="pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--foreground)]">
                            Auto Task-Adaptive Sampling
                          </span>
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Akurasi Presisi
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--muted)] leading-relaxed mt-0.5">
                          Secara otomatis menyesuaikan suhu (temperature) dan sampling berdasarkan tipe tugas (0.2 untuk koding/tools, 0.3 untuk dokumen RAG, 0.85 untuk kreativitas). Pilihan manual per-chat tetap diprioritaskan.
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.adaptiveSampling ?? true}
                      onChange={(e) => setFormData({ ...formData, adaptiveSampling: e.target.checked })}
                      className="w-4 h-4 rounded border-[var(--card-border)] text-cyan-500 focus:ring-cyan-500 bg-[var(--card-bg)] cursor-pointer"
                    />
                  </div>
                </div>

                {/* Laya System-1 Decision Engine Card */}
                <div className={`p-3.5 rounded-2xl border transition-all space-y-3 ${
                  formData.layaEnabled
                    ? "bg-[var(--sidebar-bg)] border-cyan-500/40 shadow-xs"
                    : "bg-[var(--sidebar-bg)] border-[var(--card-border)] opacity-90"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-400">
                        <Brain className="w-4 h-4" />
                      </div>
                      <div className="pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--foreground)]">
                            Laya System-1 Decision Engine
                          </span>
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                            ~30ms CPU • ModernBERT
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--muted)] leading-relaxed mt-0.5">
                          Mesin keputusan non-autoregresif multi-bahasa (Indonesia/Inggris). Mengklasifikasikan intent, profil sampling, dan kebutuhan penalaran secara instan di CPU tanpa menghabiskan VRAM GPU.
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.layaEnabled ?? false}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setFormData({ ...formData, layaEnabled: enabled });
                        // Auto-ping on enable so the online/offline badge below
                        // reflects reality immediately, instead of requiring a
                        // manual "Test Ping" click before the user can tell
                        // whether the endpoint they're about to rely on is even
                        // reachable. Only fires on enable (not on every
                        // formData change) — this is a deliberate one-shot
                        // check, not a background poll.
                        if (enabled && !isTestingLaya) {
                          handleTestLayaConnection();
                        }
                      }}
                      className="w-4 h-4 rounded border-[var(--card-border)] text-cyan-500 focus:ring-cyan-500 bg-[var(--card-bg)] cursor-pointer"
                    />
                  </div>

                  {formData.layaEnabled && (
                    <div className="pt-2 border-t border-[var(--card-border)] space-y-2.5">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-medium text-[var(--foreground)]">
                          <span>Laya Server Endpoint (FastAPI)</span>
                          <span className="text-[10px] text-[var(--muted)]">Default: http://127.0.0.1:8000</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={formData.layaEndpoint || "http://127.0.0.1:8000"}
                            onChange={(e) => setFormData({ ...formData, layaEndpoint: e.target.value })}
                            placeholder="http://127.0.0.1:8000"
                            className="flex-1 px-3 py-1.5 text-xs font-mono rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-cyan-500"
                          />
                          <button
                            type="button"
                            onClick={handleTestLayaConnection}
                            disabled={isTestingLaya}
                            className="px-3 py-1.5 text-xs font-medium rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {isTestingLaya ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Testing...</span>
                              </>
                            ) : (
                              <span>Test Ping</span>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Connection Test Result */}
                      {layaStatus && (
                        <div className={`p-2 rounded-xl text-[11px] font-mono flex items-center justify-between border ${
                          layaStatus.online
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-300 border-rose-500/20"
                        }`}>
                          <div className="flex items-center gap-1.5">
                            {layaStatus.online ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-rose-400" />
                            )}
                            <span>{layaStatus.online ? `Laya Online & Responsive (${layaStatus.latencyMs}ms)` : `Offline: ${layaStatus.error}`}</span>
                          </div>
                          {layaStatus.online && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-sans">
                              Active System-1
                            </span>
                          )}
                        </div>
                      )}

                      {/* Quick Command Guide */}
                      <div className="p-2 rounded-xl bg-black/30 border border-[var(--card-border)] text-[10px] text-[var(--muted)] space-y-1">
                        <div className="font-semibold text-cyan-400 flex items-center gap-1">
                          <Terminal className="w-3 h-3" />
                          <span>Cara menjalankan Laya di terminal lokal:</span>
                        </div>
                        <div className="font-mono text-[10px] bg-black/40 p-1.5 rounded text-slate-300 select-all">
                          pip install &quot;laya[serve]&quot; &amp;&amp; python -m laya.serve --port 8000
                        </div>
                        <p className="text-[9px] text-[var(--muted)]">
                          Jika Laya offline atau belum dijalankan, Lyra otomatis fallback ke mode heuristik bawaan tanpa jeda.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Hyperparameter Sliders Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Temperature */}
                  <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-[var(--foreground)]">
                      <span>Temperature (Randomness)</span>
                      <span className="font-mono text-emerald-400">{formData.temperature}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={2.0}
                      step={0.05}
                      value={formData.temperature}
                      onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                      className="w-full accent-emerald-500"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--muted)]">
                      <span>0.0 (Deterministic)</span>
                      <span>2.0 (Wild)</span>
                    </div>
                  </div>

                  {/* Top-P */}
                  <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-[var(--foreground)]">
                      <span>Top-P (Nucleus Sampling)</span>
                      <span className="font-mono text-blue-400">{formData.topP}</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={1.0}
                      step={0.05}
                      value={formData.topP}
                      onChange={(e) => setFormData({ ...formData, topP: parseFloat(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--muted)]">
                      <span>0.1 (Focused)</span>
                      <span>1.0 (Full Pool)</span>
                    </div>
                  </div>

                  {/* Top-K */}
                  <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-[var(--foreground)]">
                      <span>Top-K (Candidate Pool)</span>
                      <span className="font-mono text-purple-400">{formData.topK || 40}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={100}
                      step={1}
                      value={formData.topK || 40}
                      onChange={(e) => setFormData({ ...formData, topK: parseInt(e.target.value) })}
                      className="w-full accent-purple-500"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--muted)]">
                      <span>1</span>
                      <span>100</span>
                    </div>
                  </div>

                  {/* Repeat Penalty */}
                  <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-[var(--foreground)]">
                      <span>Repeat Penalty</span>
                      <span className="font-mono text-amber-400">{formData.repeatPenalty || 1.1}</span>
                    </div>
                    <input
                      type="range"
                      min={1.0}
                      max={2.0}
                      step={0.05}
                      value={formData.repeatPenalty || 1.1}
                      onChange={(e) => setFormData({ ...formData, repeatPenalty: parseFloat(e.target.value) })}
                      className="w-full accent-amber-500"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--muted)]">
                      <span>1.0 (None)</span>
                      <span>2.0 (Strict)</span>
                    </div>
                  </div>
                </div>

                {/* Visual Context Window Size (num_ctx) Selector */}
                <div className="p-4 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-[var(--foreground)]">
                          Context Window Capacity (num_ctx)
                        </label>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                          {formData.numCtx ? (formData.numCtx >= 1024 ? `${formData.numCtx / 1024}K Tokens` : `${formData.numCtx} Tokens`) : "16K Tokens"}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--muted)] mt-0.5">
                        Berapa banyak teks, dokumen, dan riwayat obrolan yang dapat diingat model AI sekaligus.
                      </p>
                    </div>

                    {/* VRAM / Performance Indicator */}
                    <div className="text-[11px] font-mono text-[var(--muted)] flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                      <span>
                        {CONTEXT_SIZE_PRESETS.find((p) => p.value === formData.numCtx)?.vramEst || "Custom"}
                      </span>
                    </div>
                  </div>

                  {/* Context Window Preset Dropdown Selector */}
                  <div className="space-y-2 pt-1">
                    <select
                      value={CONTEXT_SIZE_PRESETS.some((p) => p.value === formData.numCtx) ? formData.numCtx : "custom"}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val !== "custom") {
                          setFormData({ ...formData, numCtx: Number(val) });
                        }
                      }}
                      className="w-full p-2.5 text-xs font-mono rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-cyan-500 focus:outline-none cursor-pointer"
                    >
                      {CONTEXT_SIZE_PRESETS.map((preset) => (
                        <option key={preset.value} value={preset.value}>
                          {preset.name} ({preset.desc}) — {preset.vramEst} [{preset.badge}]
                        </option>
                      ))}
                      <option value="custom">Custom Token Count (Manual)...</option>
                    </select>

                    {!CONTEXT_SIZE_PRESETS.some((p) => p.value === formData.numCtx) && (
                      <div className="flex items-center gap-2 pt-1 animate-in fade-in">
                        <span className="text-xs text-[var(--muted)]">Custom tokens:</span>
                        <input
                          type="number"
                          min={1024}
                          max={131072}
                          step={1024}
                          value={formData.numCtx || 16384}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setFormData({ ...formData, numCtx: isNaN(val) ? 16384 : Math.max(1024, val) });
                          }}
                          className="px-3 py-1.5 text-xs font-mono rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-cyan-500 w-44"
                          placeholder="e.g. 16384"
                        />
                        <span className="text-[10px] text-[var(--muted)]">(1,024 - 131,072)</span>
                      </div>
                    )}
                  </div>

                  {/* Persistent Sync Guarantee Banner */}
                  <div className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs">
                    <Zap className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <div className="text-[11px] leading-relaxed">
                      <strong className="font-semibold text-emerald-300">Penyimpanan Permanen Aktif:</strong> Nilai Context Window disimpan langsung ke file database lokal (<code className="font-mono text-emerald-200">data/db.json</code>) dan disinkronkan ke client. Pengaturan ini akan tetap bertahan dan tidak akan reset ke 4K saat web dimuat ulang atau server npm di-restart.
                    </div>
                  </div>
                </div>

                {/* Smart Context & Static Prompt Cache */}
                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div className="pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--foreground)]">
                            Smart Context & Static Prompt Cache
                          </span>
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            KV-Cache Reuse
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--muted)] leading-relaxed mt-0.5">
                          Menjaga System Prompt statis di VRAM dan menyuntikkan dokumen RAG ke turn aktif. AI tidak perlu membaca ulang seluruh riwayat percakapan dari awal setiap kali pesan baru dikirim.
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.smartContextEnabled ?? true}
                      onChange={(e) => setFormData({ ...formData, smartContextEnabled: e.target.checked })}
                      className="w-4 h-4 rounded border-[var(--card-border)] text-cyan-500 focus:ring-cyan-500 bg-[var(--card-bg)] cursor-pointer"
                    />
                  </div>
                </div>

                {/* Dynamic Context Window Bucketing */}
                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                        <HardDrive className="w-4 h-4" />
                      </div>
                      <div className="pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--foreground)]">
                            Dynamic Context Bucketing (VRAM Saver)
                          </span>
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Power-of-2 Tiers
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--muted)] leading-relaxed mt-0.5">
                          Secara dinamis menyesuaikan alokasi KV-Cache VRAM (2K, 4K, 8K, 16K, 32K) berdasarkan kebutuhan prompt aktif. Menghemat hingga 70% VRAM pada obrolan pendek dan mencegah model tumpah ke CPU.
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.dynamicContextBucketing ?? true}
                      onChange={(e) => setFormData({ ...formData, dynamicContextBucketing: e.target.checked })}
                      className="w-4 h-4 rounded border-[var(--card-border)] text-cyan-500 focus:ring-cyan-500 bg-[var(--card-bg)] cursor-pointer"
                    />
                  </div>
                </div>

                {/* Unload Embedding Model After Retrieval */}
                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div className="pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--foreground)]">
                            Isolasi VRAM: Unload Embedding Pasca-Retrieval
                          </span>
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            Anti-Spill CPU
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--muted)] leading-relaxed mt-0.5">
                          Segera membersihkan model embedding dari memori GPU setelah pencarian dokumen RAG selesai. Memberikan 100% kapasitas VRAM untuk model chat utama pada GPU 6GB–8GB.
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.unloadEmbeddingAfterRetrieval ?? true}
                      onChange={(e) => setFormData({ ...formData, unloadEmbeddingAfterRetrieval: e.target.checked })}
                      className="w-4 h-4 rounded border-[var(--card-border)] text-cyan-500 focus:ring-cyan-500 bg-[var(--card-bg)] cursor-pointer"
                    />
                  </div>
                </div>

                {/* VRAM / RAM Keep-Alive */}
                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                        <HardDrive className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-[var(--foreground)]">
                          VRAM / RAM Model Keep-Alive (Ollama)
                        </span>
                        <p className="text-[10px] text-[var(--muted)] leading-relaxed mt-0.5">
                          Menentukan berapa lama model dan KV-Cache tetap bertahan di memori GPU/RAM sebelum di-unload otomatis.
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-semibold text-amber-400">
                      {KEEP_ALIVE_PRESETS.find((p) => p.value === (formData.ollamaKeepAlive || "60m"))?.label || formData.ollamaKeepAlive || "60m"}
                    </span>
                  </div>
                  <select
                    value={formData.ollamaKeepAlive || "60m"}
                    onChange={(e) => setFormData({ ...formData, ollamaKeepAlive: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    {KEEP_ALIVE_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label} — {preset.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Host GPU Acceleration & VRAM Diagnostic Guide */}
                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-cyan-500/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-400">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--foreground)]">
                            Panduan Akselerasi Host GPU (Ollama)
                          </span>
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                            +30-50% TPS • -50% VRAM
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--muted)] leading-relaxed mt-0.5">
                          Aktifkan Flash Attention-2 dan Kuantisasi KV Cache di level server Ollama untuk mempercepat inferensi dan memangkas VRAM konteks hingga 50-75%.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/40 border border-[var(--card-border)] text-[11px] font-mono text-[var(--muted)] space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-cyan-400 font-sans font-semibold">
                      <span>PowerShell (Jalankan sekali di Windows, lalu restart Ollama):</span>
                      <button
                        type="button"
                        onClick={handleCopyAccelCmd}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 transition-colors cursor-pointer text-[10px] font-mono"
                      >
                        {copiedAccelCmd ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Tersalin!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Salin Perintah</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="p-2 rounded bg-black/60 text-slate-300 overflow-x-auto text-[10px] whitespace-pre-wrap select-all">
                      [System.Environment]::SetEnvironmentVariable(&apos;OLLAMA_FLASH_ATTENTION&apos;, &apos;1&apos;, &apos;User&apos;); [System.Environment]::SetEnvironmentVariable(&apos;OLLAMA_KV_CACHE_TYPE&apos;, &apos;q8_0&apos;, &apos;User&apos;)
                    </div>
                  </div>
                </div>

                {/* Max Output Tokens (num_predict) */}
                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-[var(--foreground)]">
                      Max Output Tokens (num_predict)
                    </label>
                    <span className="text-xs font-mono font-semibold text-blue-400">
                      {formData.numPredict === -1 ? "Unlimited (-1)" : `${formData.numPredict || 2048} tokens`}
                    </span>
                  </div>
                  <select
                    value={formData.numPredict || 2048}
                    onChange={(e) => setFormData({ ...formData, numPredict: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={512}>512 tokens (Jawaban singkat)</option>
                    <option value={1024}>1,024 tokens</option>
                    <option value={2048}>2,048 tokens (Standar)</option>
                    <option value={4096}>4,096 tokens (Kode & artikel panjang)</option>
                    <option value={8192}>8,192 tokens (Laporan lengkap)</option>
                    <option value={-1}>Unlimited (-1) — Model memutuskan sendiri</option>
                  </select>
                </div>

                {/* Default System Instructions */}
                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                  <label className="block text-xs font-bold text-[var(--foreground)]">
                    Default System Instructions
                  </label>
                  <textarea
                    value={formData.defaultSystemPrompt}
                    onChange={(e) => setFormData({ ...formData, defaultSystemPrompt: e.target.value })}
                    rows={3}
                    className="w-full p-2.5 text-xs rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-emerald-500 focus:outline-none resize-y font-mono"
                  />
                </div>

                {/* Behavior Toggles */}
                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[var(--foreground)]">Send on Enter</div>
                    <div className="text-[10px] text-[var(--muted)]">Shift+Enter creates a new line</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.sendOnEnter}
                    onChange={(e) => setFormData({ ...formData, sendOnEnter: e.target.checked })}
                    className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[var(--foreground)]">Full-Width Chat</div>
                    <div className="text-[10px] text-[var(--muted)]">
                      Stretch messages & composer to fill the window instead of a centered reading column
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.chatFullWidth ?? true}
                    onChange={(e) => setFormData({ ...formData, chatFullWidth: e.target.checked })}
                    className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>
  );
}
