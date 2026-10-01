"use client";

import { ArrowsClockwise as RefreshCw, CheckCircle as CheckCircle2, XCircle, Globe, Folder } from "@phosphor-icons/react";
import type { SettingsCtx } from "../SettingsModal";

export function ServerSection({ ctx }: { ctx: SettingsCtx }) {
  const {
    formData,
    handleTestConnection,
    models,
    onClose,
    onOpenDiskExplorer,
    setFormData,
    testStatus,
  } = ctx;
  return (
<div className="space-y-4 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">Local Server Connections</h3>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    Configure local endpoint for Ollama engine.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-2">
                    <label className="block text-xs font-bold text-[var(--foreground)]">
                      Ollama Host Endpoint
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={formData.ollamaUrl}
                        onChange={(e) => setFormData({ ...formData, ollamaUrl: e.target.value })}
                        className="flex-1 px-3 py-2 text-xs font-mono rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={testStatus === "testing"}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--card-bg)] border border-[var(--card-border)] hover:bg-[var(--sidebar-hover)] text-[var(--foreground)] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${testStatus === "testing" ? "animate-spin" : ""}`} />
                        <span>Test</span>
                      </button>
                    </div>

                    {testStatus === "success" && (
                      <div className="text-xs text-emerald-400 flex items-center gap-1 pt-1 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Connected ({models.length} models installed)
                      </div>
                    )}
                    {testStatus === "failed" && (
                      <div className="text-xs text-rose-400 flex items-center gap-1 pt-1 font-medium">
                        <XCircle className="w-3.5 h-3.5" /> Cannot connect to Ollama. Ensure service is running.
                      </div>
                    )}
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-4 h-4 text-blue-400" />
                        <label className="block text-xs font-bold text-[var(--foreground)]">
                          Web Search & Deep Page Scraper
                        </label>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        Built-in Zero Config
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-xs text-[var(--muted)] space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-[var(--foreground)]">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Native Google News & Precision Organic Search</span>
                      </div>
                      <p className="text-[11px]">
                        Mesin pencari built-in aktif dengan dukungan Google News RSS real-time, deteksi intent cerdas, dan deep scraper tanpa perlu Docker atau konfigurasi eksternal.
                      </p>
                    </div>

                    <label className="flex items-center gap-2.5 p-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={formData.deepScrapeEnabled !== false}
                        onChange={(e) =>
                          setFormData({ ...formData, deepScrapeEnabled: e.target.checked })
                        }
                        className="rounded border-[var(--card-border)] text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      <div className="flex-1">
                        <span className="font-semibold text-[var(--foreground)] block">
                          Deep Webpage Reader Mode
                        </span>
                        <span className="text-[11px] text-[var(--muted)] block">
                          Automatically visits and scrapes full readable article content so local models can read the whole page.
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Local Disk Explorer Launcher */}
                  {onOpenDiskExplorer && (
                    <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-[var(--foreground)] flex items-center gap-1.5">
                          <Folder className="w-4 h-4 text-emerald-400" />
                          <span>Local Disk Explorer</span>
                        </div>
                        <p className="text-[11px] text-[var(--muted)] mt-0.5">
                          Explore your hard drive folders, read local files, and attach context directly.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenDiskExplorer();
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer flex-shrink-0 shadow-xs"
                      >
                        Open Disk
                      </button>
                    </div>
                  )}
                </div>

                <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-[var(--sidebar-bg)] border border-[var(--card-border)] cursor-pointer">
                  <input
                    type="checkbox"
                    aria-label="Jalankan agen terjadwal dari server"
                    checked={formData.serverScheduler !== false}
                    onChange={(e) => setFormData({ ...formData, serverScheduler: e.target.checked })}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-xs font-bold text-[var(--foreground)]">Jalankan agen terjadwal dari server</span>
                    <span className="block text-[11px] text-[var(--muted)] mt-0.5">
                      Agen tanpa disk tools tetap berjalan sesuai jadwal walau tab browser ditutup, dan tidak berjalan dobel bila beberapa tab terbuka. Agen dengan disk tools tetap dijalankan browser karena butuh Anda untuk menyetujui penulisan file. Matikan jika ingin semuanya dijalankan browser (atau set <code>LYRA_SERVER_SCHEDULER=0</code>).
                    </span>
                  </span>
                </label>
              </div>
  );
}
