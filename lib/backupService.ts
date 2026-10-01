import fs from "fs";
import path from "path";
import { dataDir } from "./dataDir";
import { readServerDb, writeServerDb, type ServerDatabase } from "./serverDb";
import { BACKUP_FORMAT, BACKUP_VERSION, BackupSchema, SnapshotNameSchema, type Backup } from "./schemas";
import type { AgentTask, Conversation, JournalEntry, PersonaPreset, Project } from "./types";

/**
 * Server-side snapshots of the database (data/backups/*.json), plus restore.
 *
 * Manual export/import already exists in Settings → Data (it snapshots the BROWSER's localStorage).
 * This is the complementary piece: the authoritative server copy, taken automatically every day and
 * kept rotated, so a bad sync, a mistaken "clear all chats" or a corrupted database file is
 * recoverable without the user having remembered to click Export.
 *
 * Design rules:
 *  - Secrets (API keys) are NOT written unless explicitly requested.
 *  - Pending approvals are never part of a backup, and restore never touches them — resurrecting an
 *    already-"approved" record would be a way to replay a file write.
 *  - Restore takes a "pre-restore" snapshot of the current state first, so it can itself be undone.
 *  - Snapshot names are validated with a strict pattern; nothing user-supplied reaches the filesystem.
 */

export type SnapshotKind = "auto" | "manual" | "pre-restore";

export interface SnapshotInfo {
  name: string;
  kind: SnapshotKind;
  createdAt: number;
  bytes: number;
  conversations: number | null;
  projects: number | null;
  includesSecrets: boolean | null;
}

const KEEP: Record<SnapshotKind, number> = { auto: 7, "pre-restore": 3, manual: Number.POSITIVE_INFINITY };
const AUTO_INTERVAL_MS = 24 * 60 * 60 * 1000;
const AUTO_CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const PARSE_LIMIT_BYTES = 25 * 1024 * 1024;

/** Resolved per call (not at import) so tests can point it at a temp working directory. */
export const backupDir = () => path.join(dataDir(), "backups");

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
function stamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
const nameKind = (name: string): SnapshotKind => name.split("-").slice(1, name.startsWith("lyra-pre-restore") ? 3 : 2).join("-") as SnapshotKind;

export function createBackup(db: ServerDatabase, opts: { includeSecrets?: boolean } = {}): Backup {
  const includeSecrets = opts.includeSecrets === true;
  const settings: Record<string, unknown> = { ...db.settings };
  if (!includeSecrets) delete settings.apiKeys;
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    includesSecrets: includeSecrets,
    data: {
      conversations: db.conversations as any,
      projects: db.projects as any,
      agents: db.agents as any,
      journalEntries: (db.journalEntries || []) as any,
      personas: db.personas as any,
      settings,
    },
  };
}

async function atomicWrite(file: string, content: string): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, content, { encoding: "utf-8", mode: 0o600 });
  await fs.promises.rename(tmp, file);
}

export async function writeSnapshot(kind: SnapshotKind, opts: { now?: Date; includeSecrets?: boolean } = {}): Promise<SnapshotInfo> {
  const dir = backupDir();
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
  const backup = createBackup(await readServerDb(), { includeSecrets: opts.includeSecrets });
  const base = `lyra-${kind}-${stamp(opts.now ?? new Date())}`;
  let name = `${base}.json`;
  for (let i = 1; fs.existsSync(path.join(dir, name)); i++) name = `${base}-${i}.json`; // same-second collision
  await atomicWrite(path.join(dir, name), JSON.stringify(backup));
  await pruneSnapshots(kind);
  return describe(name);
}

function describe(name: string): SnapshotInfo {
  const file = path.join(backupDir(), name);
  const st = fs.statSync(file);
  let conversations: number | null = null;
  let projects: number | null = null;
  let includesSecrets: boolean | null = null;
  if (st.size <= PARSE_LIMIT_BYTES) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
      conversations = parsed?.data?.conversations?.length ?? null;
      projects = parsed?.data?.projects?.length ?? null;
      includesSecrets = typeof parsed?.includesSecrets === "boolean" ? parsed.includesSecrets : null;
    } catch {
      /* listed, but unreadable: counts stay null */
    }
  }
  return { name, kind: nameKind(name), createdAt: st.mtimeMs, bytes: st.size, conversations, projects, includesSecrets };
}

export function listSnapshots(): SnapshotInfo[] {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => SnapshotNameSchema.safeParse(n).success)
    .map(describe)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function pruneSnapshots(kind: SnapshotKind): Promise<number> {
  const keep = KEEP[kind];
  if (!Number.isFinite(keep)) return 0;
  const old = listSnapshots().filter((s) => s.kind === kind).slice(keep);
  for (const s of old) await fs.promises.rm(path.join(backupDir(), s.name), { force: true });
  return old.length;
}

export function snapshotPath(name: string): string {
  const parsed = SnapshotNameSchema.safeParse(name);
  if (!parsed.success) throw new Error("Invalid snapshot name.");
  return path.join(backupDir(), parsed.data);
}

export function readSnapshot(name: string): Backup {
  const file = snapshotPath(name);
  if (!fs.existsSync(file)) throw new Error("Snapshot not found.");
  const parsed = BackupSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf-8")));
  if (!parsed.success) throw new Error(`Snapshot is not a valid backup: ${parsed.error.issues[0].message}`);
  return parsed.data;
}

export async function deleteSnapshot(name: string): Promise<boolean> {
  const file = snapshotPath(name);
  if (!fs.existsSync(file)) return false;
  await fs.promises.rm(file);
  return true;
}

export interface RestoreResult {
  preRestore: SnapshotInfo;
  mode: "merge" | "replace";
  counts: { conversations: number; projects: number; agents: number; journalEntries: number };
}

/**
 * Union of two lists by id where the backup copy replaces a local one ONLY if it is strictly newer.
 * The database's own sync merge (mergeConversations) also accepts an incoming copy whose message count
 * is >= the existing one — right for syncing tabs whose history only grows, wrong here: restoring an
 * OLD backup would overwrite newer local edits whenever the message counts happen to match.
 */
function mergeKeepingNewer<T extends { id: string; updatedAt?: number }>(local: T[], fromBackup: T[]): T[] {
  const map = new Map<string, T>(local.map((x) => [x.id, x]));
  for (const item of fromBackup) {
    const existing = map.get(item.id);
    if (!existing || (item.updatedAt || 0) > (existing.updatedAt || 0)) map.set(item.id, item);
  }
  return [...map.values()];
}

export async function restoreBackup(backup: Backup, mode: "merge" | "replace"): Promise<RestoreResult> {
  // Undo point first: if anything below goes wrong (or the user picked the wrong file) the state from a
  // moment ago is one click away.
  const preRestore = await writeSnapshot("pre-restore");
  const d = backup.data;
  const incoming = {
    conversations: d.conversations as unknown as Conversation[],
    projects: d.projects as unknown as Project[],
    agents: d.agents as unknown as AgentTask[],
    journalEntries: d.journalEntries as unknown as JournalEntry[],
  };
  const current = mode === "merge" ? await readServerDb() : null;
  await writeServerDb({
    conversations: current ? mergeKeepingNewer(current.conversations, incoming.conversations) : incoming.conversations,
    projects: current ? mergeKeepingNewer(current.projects, incoming.projects) : incoming.projects,
    agents: current ? mergeKeepingNewer(current.agents, incoming.agents) : incoming.agents,
    journalEntries: current ? mergeKeepingNewer(current.journalEntries || [], incoming.journalEntries) : incoming.journalEntries,
    personas: d.personas as unknown as PersonaPreset[],
    // Merged over the current settings; a backup without secrets therefore leaves the API keys alone.
    settings: d.settings as any,
    // Both modes hand over the FINAL lists, so overwrite the collections with them.
    overwrite: true,
  });
  return {
    preRestore,
    mode,
    counts: {
      conversations: d.conversations.length,
      projects: d.projects.length,
      agents: d.agents.length,
      journalEntries: d.journalEntries.length,
    },
  };
}

export async function runAutoBackupIfDue(now: Date = new Date()): Promise<SnapshotInfo | null> {
  const latest = listSnapshots().find((s) => s.kind === "auto");
  if (latest && now.getTime() - latest.createdAt < AUTO_INTERVAL_MS) return null;
  return writeSnapshot("auto", { now });
}

/** Called once from instrumentation.ts. Disable with LYRA_AUTO_BACKUP=0. */
export function startAutoBackup(): void {
  if (process.env.LYRA_AUTO_BACKUP === "0") return;
  const g = globalThis as any;
  if (g.__lyraAutoBackup) return; // dev-mode HMR re-runs register()
  g.__lyraAutoBackup = true;
  const tick = () =>
    runAutoBackupIfDue().catch((err) => console.error("[backup] automatic snapshot failed:", err));
  setTimeout(tick, 30_000).unref?.();
  setInterval(tick, AUTO_CHECK_EVERY_MS).unref?.();
}
