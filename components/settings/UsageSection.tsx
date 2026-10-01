"use client";

import React, { useMemo, useState } from "react";
import { storage } from "@/lib/storage";
import { aggregateUsage, formatTokens, formatUsd } from "@/lib/usageTracker";
import type { ModelPricing } from "@/lib/types";
import type { SettingsCtx } from "../SettingsModal";

type Range = "7d" | "30d" | "all";
const RANGE_MS: Record<Range, number | undefined> = { "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, all: undefined };

/**
 * Token and (user-priced) cost overview, computed from the conversations already stored locally.
 * Prices are typed in here and saved with the rest of the settings; nothing is sent anywhere.
 */
export function UsageSection({ ctx }: { ctx: SettingsCtx }) {
  const { formData, setFormData } = ctx;
  const [range, setRange] = useState<Range>("30d");
  const [refreshKey, setRefreshKey] = useState(0);
  const pricing = formData.modelPricing ?? {};

  const report = useMemo(() => {
    const since = RANGE_MS[range];
    return aggregateUsage(storage.getConversations(), { sinceMs: since === undefined ? undefined : Date.now() - since, pricing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, refreshKey, formData.modelPricing]);

  const setPrice = (model: string, field: keyof ModelPricing, raw: string) => {
    const value = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    const current = pricing[model] ?? { inputPerMTok: 0, outputPerMTok: 0 };
    setFormData({ ...formData, modelPricing: { ...pricing, [model]: { ...current, [field]: value } } });
  };

  const maxDay = Math.max(1, ...report.byDay.map((d) => d.promptTokens + d.completionTokens));
  const cloudRows = report.byModel.filter((r) => !r.isLocal);

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--foreground)]">Usage & Cost</h3>
          <p className="text-[11px] text-[var(--muted)]">
            Dihitung dari riwayat chat di perangkat ini. Model lokal (Ollama) gratis; biaya cloud hanya muncul untuk model yang harganya Anda isi.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            aria-label="Rentang waktu"
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="text-xs rounded-lg border border-[var(--card-border)] bg-[var(--sidebar-bg)] px-2 py-1 text-[var(--foreground)]"
          >
            <option value="7d">7 hari</option>
            <option value="30d">30 hari</option>
            <option value="all">Semua</option>
          </select>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="text-xs rounded-lg border border-[var(--card-border)] px-2 py-1 hover:bg-[var(--sidebar-hover)] text-[var(--foreground)]"
          >
            Segarkan
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="usage-totals">
        {[
          ["Balasan", String(report.totals.messages)],
          ["Token masuk", formatTokens(report.totals.promptTokens)],
          ["Token keluar", formatTokens(report.totals.completionTokens)],
          ["Perkiraan biaya", formatUsd(report.totals.costUsd)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] p-3">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
            <div className="text-lg font-bold text-[var(--foreground)]">{value}</div>
          </div>
        ))}
      </div>
      {report.totals.unpricedTokens > 0 && (
        <p className="text-[11px] text-amber-400">
          {formatTokens(report.totals.unpricedTokens)} token cloud belum punya harga, jadi tidak termasuk perkiraan biaya. Isi harga di tabel di bawah.
        </p>
      )}

      {report.byModel.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--card-border)] p-6 text-center text-xs text-[var(--muted)]">
          Belum ada data penggunaan pada rentang ini.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-[var(--card-border)] overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[var(--sidebar-bg)] text-[var(--muted)]">
                <tr>
                  <th className="text-left p-2">Model</th>
                  <th className="text-right p-2">Balasan</th>
                  <th className="text-right p-2">Masuk</th>
                  <th className="text-right p-2">Keluar</th>
                  <th className="text-right p-2">Biaya</th>
                </tr>
              </thead>
              <tbody>
                {report.byModel.map((r) => (
                  <tr key={r.model} className="border-t border-[var(--card-border)] text-[var(--foreground)]">
                    <td className="p-2 font-mono break-all">
                      {r.model} {r.isLocal && <span className="ml-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-400">lokal</span>}
                    </td>
                    <td className="p-2 text-right">{r.messages}</td>
                    <td className="p-2 text-right">{formatTokens(r.promptTokens)}</td>
                    <td className="p-2 text-right">{formatTokens(r.completionTokens)}</td>
                    <td className="p-2 text-right">{r.costUsd === null ? "—" : formatUsd(r.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">Token per hari</div>
            <div className="flex items-end gap-1 h-20" aria-label="Grafik token per hari">
              {report.byDay.map((d) => {
                const total = d.promptTokens + d.completionTokens;
                return (
                  <div key={d.day} className="flex-1 min-w-[6px] bg-blue-500/60 hover:bg-blue-400 rounded-t" style={{ height: `${Math.max(4, (total / maxDay) * 100)}%` }} title={`${d.day}: ${formatTokens(total)} token`} />
                );
              })}
            </div>
          </div>
        </>
      )}

      {cloudRows.length > 0 && (
        <div className="space-y-2">
          <div>
            <h4 className="text-xs font-bold text-[var(--foreground)]">Harga per juta token (USD)</h4>
            <p className="text-[11px] text-[var(--muted)]">Lihat halaman harga provider. Disimpan bersama pengaturan (tekan Simpan).</p>
          </div>
          {cloudRows.map((r) => (
            <div key={r.model} className="grid grid-cols-[1fr_90px_90px] gap-2 items-center">
              <div className="text-xs font-mono break-all text-[var(--foreground)]">{r.model}</div>
              {(["inputPerMTok", "outputPerMTok"] as const).map((field) => (
                <label key={field} className="text-[10px] text-[var(--muted)]">
                  {field === "inputPerMTok" ? "Masuk" : "Keluar"}
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={pricing[r.model]?.[field] ?? ""}
                    onChange={(e) => setPrice(r.model, field, e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--sidebar-bg)] px-2 py-1 text-xs text-[var(--foreground)]"
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
