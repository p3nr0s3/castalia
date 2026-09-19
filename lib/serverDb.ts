import fs from "fs";
import path from "path";
import type BetterSqlite3 from "better-sqlite3";
import { AppSettings, Conversation, PersonaPreset, Project, AgentTask, PendingApproval, JournalEntry } from "./types";
import { DEFAULT_SETTINGS, PRESET_PERSONAS } from "./constants";

export interface ServerDatabase {
  conversations: Conversation[];
  projects: Project[];
  agents: AgentTask[];
  journalEntries?: JournalEntry[];
  settings: AppSettings;
  personas: PersonaPreset[];
  pendingApprovals: PendingApproval[];
  lastUpdated: number;
  version: number;
}

const DATA_DIR = path.join(process.cwd(), "data");
const SQLITE_FILE = path.join(DATA_DIR, "db.sqlite3");
const JSON_FILE = path.join(DATA_DIR, "db.json");

const DEFAULT_DB: ServerDatabase = {
  conversations: [],
  projects: [],
  agents: [],
  journalEntries: [],
  settings: DEFAULT_SETTINGS,
  personas: PRESET_PERSONAS,
  pendingApprovals: [],
  lastUpdated: Date.now(),
  version: 1,
};

// --- Merge helpers (shared by both backends) ---

function mergeConversations(serverList: Conversation[], clientList: Conversation[]): Conversation[] {
  const map = new Map<string, Conversation>();
  for (const c of serverList) map.set(c.id, c);
  for (const clientConv of clientList) {
    const existing = map.get(clientConv.id);
    if (!existing) {
      map.set(clientConv.id, clientConv);
    } else if (
      (clientConv.updatedAt || 0) >= (existing.updatedAt || 0) ||
      (clientConv.messages?.length || 0) >= (existing.messages?.length || 0)
    ) {
      map.set(clientConv.id, {
        ...existing,
        ...clientConv,
        messages:
          (clientConv.messages?.length || 0) >= (existing.messages?.length || 0)
            ? clientConv.messages
            : existing.messages,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function mergeProjects(serverList: Project[], clientList: Project[]): Project[] {
  const map = new Map<string, Project>();
  for (const p of serverList) map.set(p.id, p);
  for (const p of clientList) {
    const existing = map.get(p.id);
    if (!existing || (p.updatedAt || 0) >= (existing.updatedAt || 0)) map.set(p.id, p);
  }
  return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function mergeAgents(serverList: AgentTask[], clientList: AgentTask[]): AgentTask[] {
  const map = new Map<string, AgentTask>();
  for (const a of serverList) map.set(a.id, a);
  for (const a of clientList) {
    const existing = map.get(a.id);
    if (!existing || (a.updatedAt || 0) >= (existing.updatedAt || 0)) map.set(a.id, a);
  }
  return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function mergePendingApprovals(serverList: PendingApproval[], clientList: PendingApproval[]): PendingApproval[] {
  const map = new Map<string, PendingApproval>();
  for (const a of serverList) map.set(a.id, a);
  for (const a of clientList) {
    const existing = map.get(a.id);
    if (!existing || (a.resolvedAt || a.createdAt) >= (existing.resolvedAt || existing.createdAt)) {
      map.set(a.id, a);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function mergeJournalEntries(serverList: JournalEntry[] = [], clientList: JournalEntry[] = []): JournalEntry[] {
  const map = new Map<string, JournalEntry>();
  for (const j of serverList) map.set(j.id, j);
  for (const j of clientList) {
    const existing = map.get(j.id);
    if (!existing || (j.updatedAt || 0) >= (existing.updatedAt || 0)) map.set(j.id, j);
  }
  return Array.from(map.values()).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
}

export function mergeSettings(serverSettings: AppSettings, clientSettings?: Partial<AppSettings>): AppSettings {
  if (!clientSettings) return serverSettings;
  return {
    ...serverSettings,
    ...clientSettings,
    apiKeys: {
      ...serverSettings.apiKeys,
      ...(clientSettings.apiKeys || {}),
    },
    customTheme: clientSettings.customTheme || serverSettings.customTheme,
    skills: clientSettings.skills || serverSettings.skills,
    connectors: clientSettings.connectors || serverSettings.connectors,
    plugins: clientSettings.plugins || serverSettings.plugins,
    memory: clientSettings.memory
      ? { ...serverSettings.memory, ...clientSettings.memory }
      : serverSettings.memory,
  };
}

// =====================================================================
// Backend 1: SQLite (better-sqlite3). Preferred when the native module is
// available. Indexed, transactional, WAL-mode — no full-file rewrite on
// every save.
// =====================================================================

function loadBetterSqlite3(): typeof BetterSqlite3 | null {
  try {
    // Loaded via require (not `import`) so a missing/broken native binding
    // — e.g. no prebuilt binary for this Node version, and no Python/MSVC
    // build tools to compile from source — never crashes module load. This
    // is an optionalDependency in package.json for the same reason.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("better-sqlite3");
  } catch {
    return null;
  }
}

const SqliteCtor = loadBetterSqlite3();

let sqliteInstance: BetterSqlite3.Database | null = null;

function getSqliteDb(): BetterSqlite3.Database {
  if (sqliteInstance) return sqliteInstance;
  if (!SqliteCtor) throw new Error("better-sqlite3 is not available");

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const isNewDatabase = !fs.existsSync(SQLITE_FILE);

  const database = new SqliteCtor(SQLITE_FILE);
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY, updatedAt INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, updatedAt INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY, updatedAt INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pending_approvals (
      id TEXT PRIMARY KEY, createdAt INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY, updatedAt INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  sqliteInstance = database;

  if (isNewDatabase && fs.existsSync(JSON_FILE)) {
    migrateJsonIntoSqlite(database);
  }

  return database;
}

function migrateJsonIntoSqlite(database: BetterSqlite3.Database) {
  try {
    const parsed = JSON.parse(fs.readFileSync(JSON_FILE, "utf-8"));

    const insertRows = (table: string, keyField: "updatedAt" | "createdAt", items: any[]) => {
      const stmt = database.prepare(`INSERT OR REPLACE INTO ${table} (id, ${keyField}, data) VALUES (?, ?, ?)`);
      const txn = database.transaction((rows: any[]) => {
        for (const item of rows) {
          if (!item?.id) continue;
          stmt.run(item.id, item[keyField] || 0, JSON.stringify(item));
        }
      });
      txn(items);
    };

    insertRows("conversations", "updatedAt", parsed.conversations || []);
    insertRows("projects", "updatedAt", parsed.projects || []);
    insertRows("agents", "updatedAt", parsed.agents || []);
    insertRows("pending_approvals", "createdAt", parsed.pendingApprovals || []);
    insertRows("journal_entries", "updatedAt", parsed.journalEntries || []);

    const kv = database.prepare(`INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`);
    kv.run("settings", JSON.stringify(parsed.settings || DEFAULT_SETTINGS));
    kv.run("personas", JSON.stringify(parsed.personas || PRESET_PERSONAS));
    kv.run("version", JSON.stringify(parsed.version || 1));
    kv.run("lastUpdated", JSON.stringify(parsed.lastUpdated || Date.now()));

    fs.renameSync(JSON_FILE, `${JSON_FILE}.migrated.bak`);
    console.log(
      "[serverDb] Migrated data/db.json into data/db.sqlite3. Old file kept as data/db.json.migrated.bak."
    );
  } catch (err) {
    console.error("[serverDb] Failed to migrate data/db.json into SQLite — starting empty in SQLite.", err);
  }
}

function sqliteReadAll<T>(table: string): T[] {
  const rows = getSqliteDb().prepare(`SELECT data FROM ${table}`).all() as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as T);
}

function sqliteGetKv<T>(key: string, fallback: T): T {
  const row = getSqliteDb().prepare(`SELECT value FROM kv WHERE key = ?`).get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

function sqliteSetKv(key: string, value: unknown) {
  getSqliteDb().prepare(`INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`).run(key, JSON.stringify(value));
}

function sqliteReplaceCollection(table: string, keyField: "updatedAt" | "createdAt", items: any[]) {
  const database = getSqliteDb();
  const del = database.prepare(`DELETE FROM ${table}`);
  const insert = database.prepare(`INSERT OR REPLACE INTO ${table} (id, ${keyField}, data) VALUES (?, ?, ?)`);
  const txn = database.transaction((rows: any[]) => {
    del.run();
    for (const item of rows) insert.run(item.id, item[keyField] || 0, JSON.stringify(item));
  });
  txn(items);
}

function sqliteUpsertCollection(table: string, keyField: "updatedAt" | "createdAt", items: any[]) {
  const database = getSqliteDb();
  const insert = database.prepare(`INSERT OR REPLACE INTO ${table} (id, ${keyField}, data) VALUES (?, ?, ?)`);
  const txn = database.transaction((rows: any[]) => {
    for (const item of rows) insert.run(item.id, item[keyField] || 0, JSON.stringify(item));
  });
  txn(items);
}

async function readServerDbSqlite(): Promise<ServerDatabase> {
  const conversations = sqliteReadAll<Conversation>("conversations").sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const projects = sqliteReadAll<Project>("projects").sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const agents = sqliteReadAll<AgentTask>("agents").sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const pendingApprovals = sqliteReadAll<PendingApproval>("pending_approvals").sort((a, b) => b.createdAt - a.createdAt);
  const journalEntries = sqliteReadAll<JournalEntry>("journal_entries").sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

  const settings = { ...DEFAULT_SETTINGS, ...sqliteGetKv<Partial<AppSettings>>("settings", DEFAULT_SETTINGS) };
  const personas = sqliteGetKv<PersonaPreset[]>("personas", PRESET_PERSONAS);
  const version = sqliteGetKv<number>("version", 1);
  const lastUpdated = sqliteGetKv<number>("lastUpdated", Date.now());

  return { conversations, projects, agents, journalEntries, settings, personas, pendingApprovals, lastUpdated, version };
}

async function writeServerDbSqlite(data: WriteServerDbInput): Promise<ServerDatabase> {
  const current = await readServerDbSqlite();

  if (data.conversations !== undefined) {
    const merged = data.overwrite ? data.conversations : mergeConversations(current.conversations, data.conversations);
    (data.overwrite ? sqliteReplaceCollection : sqliteUpsertCollection)("conversations", "updatedAt", merged);
  }
  if (data.projects !== undefined) {
    const merged = data.overwrite ? data.projects : mergeProjects(current.projects, data.projects);
    (data.overwrite ? sqliteReplaceCollection : sqliteUpsertCollection)("projects", "updatedAt", merged);
  }
  if (data.agents !== undefined) {
    const merged = data.overwrite ? data.agents : mergeAgents(current.agents, data.agents);
    (data.overwrite ? sqliteReplaceCollection : sqliteUpsertCollection)("agents", "updatedAt", merged);
  }
  if (data.pendingApprovals !== undefined) {
    const merged = data.overwrite ? data.pendingApprovals : mergePendingApprovals(current.pendingApprovals, data.pendingApprovals);
    (data.overwrite ? sqliteReplaceCollection : sqliteUpsertCollection)("pending_approvals", "createdAt", merged);
  }
  if (data.journalEntries !== undefined) {
    const merged = data.overwrite ? data.journalEntries : mergeJournalEntries(current.journalEntries || [], data.journalEntries);
    (data.overwrite ? sqliteReplaceCollection : sqliteUpsertCollection)("journal_entries", "updatedAt", merged);
  }

  if (data.settings) sqliteSetKv("settings", mergeSettings(current.settings, data.settings));
  if (data.personas) sqliteSetKv("personas", data.personas);
  sqliteSetKv("version", (current.version || 1) + 1);
  sqliteSetKv("lastUpdated", Date.now());

  return readServerDbSqlite();
}

// =====================================================================
// Backend 2: flat JSON file. Used automatically when better-sqlite3's
// native module isn't available (no prebuilt binary for this Node
// version, and no Python/MSVC build tools to compile from source). This
// is the original storage implementation — kept so the app always works
// even on a machine that can't build native modules.
// =====================================================================

let jsonCache: ServerDatabase | null = null;
let jsonIsSaving = false;
let jsonPendingSave = false;

async function persistJsonToDisk(db: ServerDatabase) {
  if (jsonIsSaving) {
    jsonPendingSave = true;
    return;
  }
  jsonIsSaving = true;
  try {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await fs.promises.writeFile(JSON_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("[serverDb] Failed to persist data/db.json:", err);
  } finally {
    jsonIsSaving = false;
    if (jsonPendingSave) {
      jsonPendingSave = false;
      if (jsonCache) persistJsonToDisk(jsonCache);
    }
  }
}

async function readServerDbJson(): Promise<ServerDatabase> {
  if (jsonCache) return jsonCache;

  try {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const content = await fs.promises.readFile(JSON_FILE, "utf-8");
    const parsed = JSON.parse(content);
    const rawJournal: JournalEntry[] = parsed.journalEntries || [];
    const journalEntries: JournalEntry[] =
      rawJournal.length > 0
        ? rawJournal
        : (parsed.tasks || []).map((t: any) => ({
            id: t.id,
            title: t.title,
            content: t.description || "",
            icon: "🎯",
            category: "task" as const,
            status: t.status === "todo" ? "draft" : t.status === "in_progress" ? "in_progress" : t.status === "done" ? "done" : "draft",
            priority: t.priority || "medium",
            projectId: t.projectId,
            tags: t.tags || [],
            checklists: t.subtasks || [],
            date: t.dueDate,
            createdAt: t.createdAt || Date.now(),
            updatedAt: t.updatedAt || Date.now(),
          }));

    jsonCache = {
      conversations: parsed.conversations || [],
      projects: parsed.projects || [],
      agents: parsed.agents || [],
      journalEntries,
      settings: parsed.settings ? { ...DEFAULT_SETTINGS, ...parsed.settings } : DEFAULT_SETTINGS,
      personas: parsed.personas || PRESET_PERSONAS,
      pendingApprovals: parsed.pendingApprovals || [],
      lastUpdated: parsed.lastUpdated || Date.now(),
      version: parsed.version || 1,
    };
    return jsonCache;
  } catch {
    jsonCache = { ...DEFAULT_DB, lastUpdated: Date.now() };
    persistJsonToDisk(jsonCache);
    return jsonCache;
  }
}

async function writeServerDbJson(data: WriteServerDbInput): Promise<ServerDatabase> {
  const current = await readServerDbJson();

  const mergedConversations =
    data.conversations !== undefined
      ? data.overwrite
        ? data.conversations
        : mergeConversations(current.conversations, data.conversations)
      : current.conversations;

  const mergedProjects =
    data.projects !== undefined
      ? data.overwrite
        ? data.projects
        : mergeProjects(current.projects, data.projects)
      : current.projects;

  const mergedAgents =
    data.agents !== undefined
      ? data.overwrite
        ? data.agents
        : mergeAgents(current.agents, data.agents)
      : current.agents;

  const mergedJournalEntries =
    data.journalEntries !== undefined
      ? data.overwrite
        ? data.journalEntries
        : mergeJournalEntries(current.journalEntries, data.journalEntries)
      : current.journalEntries || [];

  const mergedPendingApprovals =
    data.pendingApprovals !== undefined
      ? data.overwrite
        ? data.pendingApprovals
        : mergePendingApprovals(current.pendingApprovals, data.pendingApprovals)
      : current.pendingApprovals;

  jsonCache = {
    conversations: mergedConversations,
    projects: mergedProjects,
    agents: mergedAgents,
    journalEntries: mergedJournalEntries,
    settings: data.settings ? mergeSettings(current.settings, data.settings) : current.settings,
    personas: data.personas || current.personas,
    pendingApprovals: mergedPendingApprovals,
    lastUpdated: Date.now(),
    version: (current.version || 1) + 1,
  };

  persistJsonToDisk(jsonCache);
  return jsonCache;
}

// =====================================================================
// Public API — picks a backend once, then dispatches every call to it.
// Signatures are unchanged from before, so app/api/db/route.ts needs no
// changes regardless of which backend is active.
// =====================================================================

interface WriteServerDbInput {
  conversations?: Conversation[];
  projects?: Project[];
  agents?: AgentTask[];
  journalEntries?: JournalEntry[];
  settings?: AppSettings;
  personas?: PersonaPreset[];
  pendingApprovals?: PendingApproval[];
  overwrite?: boolean;
}

let hasWarnedFallback = false;
function usingSqlite(): boolean {
  const available = SqliteCtor !== null;
  if (!available && !hasWarnedFallback) {
    hasWarnedFallback = true;
    console.warn(
      "[serverDb] better-sqlite3 native module unavailable (no prebuilt binary for this Node version, and/or no Python + " +
        "C++ build tools to compile it) — falling back to data/db.json. Everything still works; you just don't get " +
        "SQLite's crash-safety and indexing. To enable it: install Python 3 and a C++ toolchain " +
        "(Windows: 'Desktop development with C++' in Visual Studio Installer; or use a Node LTS version, which is " +
        "more likely to have a prebuilt binary already), then reinstall with `npm install`."
    );
  }
  return available;
}

export async function readServerDb(): Promise<ServerDatabase> {
  return usingSqlite() ? readServerDbSqlite() : readServerDbJson();
}

export async function writeServerDb(data: WriteServerDbInput): Promise<ServerDatabase> {
  return usingSqlite() ? writeServerDbSqlite(data) : writeServerDbJson(data);
}

/**
 * Targeted lookup for exactly one PendingApproval by id — used by
 * /api/tools/execute, /api/tools/execute-agent, and /api/tools/revert,
 * which each only ever need to check ONE approval record before acting.
 *
 * Why this exists: readServerDb() composes the FULL ServerDatabase —
 * every conversation (with every message's full content), every project,
 * every agent, every journal entry — via sqliteReadAll, which SELECTs and
 * JSON.parses every row in each of those tables. A tool-execution or
 * revert call has nothing to do with conversation history; it was paying
 * that cost anyway just to search db.pendingApprovals for one id.
 * Benchmarked on a synthetic 300-conversation/15-message-each history
 * (~3MB of JSON): ~3.3ms per readServerDb() call vs ~0.0013ms for this
 * targeted lookup — about 2500x, and it scales with total history size,
 * so it gets worse the longer this app has been used, on a machine that's
 * also running local model inference.
 *
 * Only the SQLite path benefits (a real indexed single-row SELECT). The
 * JSON-file fallback (see readServerDbJson) has no per-row indexing —
 * everything lives in one file — so there's no way to read less than the
 * whole thing there; it falls back to the exact same lookup the old code
 * did, no regression, just no speedup for that path.
 */
export async function getPendingApprovalById(id: string): Promise<PendingApproval | null> {
  if (usingSqlite()) {
    const row = getSqliteDb().prepare(`SELECT data FROM pending_approvals WHERE id = ?`).get(id) as
      | { data: string }
      | undefined;
    return row ? (JSON.parse(row.data) as PendingApproval) : null;
  }

  const db = await readServerDbJson();
  return db.pendingApprovals.find((a) => a.id === id) || null;
}
