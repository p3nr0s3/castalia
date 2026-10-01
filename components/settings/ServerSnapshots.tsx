"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiClient";

interface SnapshotInfo {
  name: string;
  kind: "auto" | "manual" | "pre-restore";
  createdAt: number;
  bytes: number;
  conversations: number | null;
  projects: number | null;
  includesSecrets: boolean | null;
}

const KIND_LABEL: Record<SnapshotInfo["kind"], string> = { auto: "Otomatis", manual: "Manual", "pre-restore": "Sebelum pemulihan" };
const fmtBytes = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function saveResponseAsFile(res: Response, fallbackName: string) {
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Server-side database snapshots (data/backups/): automatic daily, plus on-demand. Restoring first
 * takes a "pre-restore" snapshot, so a restore can itself be undone from this same list.
 */
export function ServerSnapshots({ includeSecrets }: { includeSecrets: boolean }) {
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [backend, setBackend] = useState<string>("");
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/backup", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSnapshots(data.snapshots || []);
      setBackend(data.backend || "");
      setAuto(data.autoBackup !== false);
    } catch (e: any) {
      setNote({ kind: "error", text: `Gagal memuat snapshot: ${e.message}` });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setNote(null);
    try {
      const text = await fn();
      if (text) setNote({ kind: "ok", text });
      await load();
    } catch (e: any) {
      setNote({ kind: "error", text: e.message || "Gagal" });
    } finally {
      setBusy(false);
    }
  };

  const post = async (body: unknown) => {
    const res = await apiFetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };

  const createSnapshot = () => run(async () => { await post({ action: "snapshot" }); return "Snapshot dibuat."; });

  const download = (name: string) =>
    run(async () => {
      const res = await apiFetch(`/api/backup?download=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await saveResponseAsFile(res, name);
    });

  const downloadLive = () =>
    run(async () => {
      const res = await apiFetch(`/api/backup?download=live${includeSecrets ? "&secrets=1" : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await saveResponseAsFile(res, "lyra-backup.json");
    });

  const restore = (s: SnapshotInfo) => {
    const ok = window.confirm(
      `Ganti SEMUA percakapan, project, agen, dan jurnal dengan snapshot "${s.name}"?\n\nKondisi saat ini disimpan dulu sebagai snapshot "Sebelum pemulihan", jadi ini bisa dibatalkan. API key di perangkat ini tidak diubah.`
    );
    if (!ok) return;
    run(async () => {
      const data = await post({ action: "restore", snapshot: s.name, mode: "replace" });
      return `Dipulihkan (${data.restored.counts.conversations} percakapan). Kondisi sebelumnya disimpan sebagai ${data.restored.preRestore.name}. Tab yang terbuka akan memuat data baru otomatis.`;
    });
  };

  const remove = (s: SnapshotInfo) => {
    if (!window.confirm(`Hapus snapshot "${s.name}"?`)) return;
    run(async () => {
      const res = await apiFetch(`/api/backup?name=${encodeURIComponent(s.name)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return "Snapshot dihapus.";
    });
  };

  const restoreFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm(`Gabungkan isi "${file.name}" ke data saat ini? Hanya item yang lebih baru dari yang ada sekarang yang menimpa. Kondisi saat ini disimpan dulu sebagai snapshot.`)) return;
    run(async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error("Berkas bukan JSON yang valid.");
      }
      const data = await post({ action: "restore", backup: parsed, mode: "merge" });
      return `Digabungkan (${data.restored.counts.conversations} percakapan di berkas).`;
    });
  };

  return (
    <div className="space-y-2.5 rounded-2xl border border-[var(--card-border)] bg-[var(--sidebar-bg)] p-3" data-testid="server-snapshots">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-[var(--foreground)]">Snapshot server</div>
          <div className="text-[10px] text-[var(--muted)]">
            {auto ? "Otomatis tiap 24 jam, 7 terakhir disimpan" : "Snapshot otomatis nonaktif (LYRA_AUTO_BACKUP=0)"}
            {backend ? ` · penyimpanan: ${backend}` : ""} · folder data/backups
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <button type="button" disabled={busy} onClick={createSnapshot} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-[var(--card-border)] hover:bg-[var(--sidebar-hover)] disabled:opacity-50 text-[var(--foreground)]">
            Buat snapshot
          </button>
          <button type="button" disabled={busy} onClick={downloadLive} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-[var(--card-border)] hover:bg-[var(--sidebar-hover)] disabled:opacity-50 text-[var(--foreground)]">
            Unduh backup{includeSecrets ? " + key" : ""}
          </button>
        </div>
      </div>

      {note && <p role="status" className={`text-[11px] ${note.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{note.text}</p>}

      {snapshots.length === 0 ? (
        <p className="text-[11px] text-[var(--muted)]">Belum ada snapshot.</p>
      ) : (
        <ul className="divide-y divide-[var(--card-border)]">
          {snapshots.map((s) => (
            <li key={s.name} className="py-1.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-mono text-[var(--foreground)] truncate">{s.name}</div>
                <div className="text-[10px] text-[var(--muted)]">
                  {KIND_LABEL[s.kind]} · {new Date(s.createdAt).toLocaleString()} · {fmtBytes(s.bytes)}
                  {s.conversations !== null ? ` · ${s.conversations} chat, ${s.projects ?? 0} project` : ""}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button type="button" disabled={busy} onClick={() => restore(s)} className="px-2 py-0.5 rounded-md text-[10px] border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50">Pulihkan</button>
                <button type="button" disabled={busy} onClick={() => download(s.name)} className="px-2 py-0.5 rounded-md text-[10px] border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] disabled:opacity-50">Unduh</button>
                <button type="button" disabled={busy} onClick={() => remove(s)} className="px-2 py-0.5 rounded-md text-[10px] border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-50">Hapus</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={restoreFromFile} aria-label="Berkas backup server" />
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] underline disabled:opacity-50">
          Gabungkan dari berkas backup server…
        </button>
      </div>
    </div>
  );
}
