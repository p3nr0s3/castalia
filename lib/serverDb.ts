import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { AppSettings, Conversation, PersonaPreset, Project, AgentTask, PendingApproval } from "./types";
import { DEFAULT_SETTINGS, PRESET_PERSONAS } from "./constants";

export interface ServerDatabase {
  conversations: Conversation[];
  projects: Project[];
  agents: AgentTask[];
  settings: AppSettings;
  personas: PersonaPreset[];
  pendingApprovals: PendingApproval[];
  lastUpdated: number;
  version: number;
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.sqlite3");
// Previous storage format (flat JSON file, fully rewritten on every save).
// Migrated once into SQLite below, then renamed to *.migrated.bak so it's
// never silently out of sync with the real (SQLite) data going forward.
const LEGACY_JSON_FILE = path.join(DATA_DIR, "db.json");

let dbInstance: Database.Database | null = null;

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const isNewDatabase = !fs.existsSync(DB_FILE);

  const database = new Database(DB_FILE);
  // WAL = readers don't block writers and vice versa; also far more
  // crash-resistant than "rewrite the whole JSON file" was.
  database.pragma("journal_mode = WAL");

  database.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      updatedAt INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      updatedAt INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      updatedAt INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pending_approvals (
      id TEXT PRIMARY KEY,
      createdAt INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  dbInstance = database;

  if (isNewDatabase && fs.existsSync(LEGACY_JSON_FILE)) {
    migrateFromLegacyJson(database);
  }

  return database;
}

function migrateFromLegacyJson(database: Database.Database) {
  try {
    const parsed = JSON.parse(fs.readFileSync(LEGACY_JSON_FILE, "utf-8"));

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

    const kv = database.prepare(`INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`);
    kv.run("settings", JSON.stringify(parsed.settings || DEFAULT_SETTINGS));
    kv.run("personas", JSON.stringify(parsed.personas || PRESET_PERSONAS));
    kv.run("version", JSON.stringify(parsed.version || 1));
    kv.run("lastUpdated", JSON.stringify(parsed.lastUpdated || Date.now()));

    fs.renameSync(LEGACY_JSON_FILE, `${LEGACY_JSON_FILE}.migrated.bak`);
    console.log(
      "[serverDb] Migrated data/db.json into data/db.sqlite3. The old file was kept as data/db.json.migrated.bak — safe to delete once you've confirmed everything looks right."
    );
  } catch (err) {
    console.error(
      "[serverDb] Failed to migrate data/db.json into SQLite — starting with an empty database. The original file was left untouched at data/db.json.",
      err
    );
  }
}

function readAll<T>(table: string): T[] {
  const rows = getDb().prepare(`SELECT data FROM ${table}`).all() as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as T);
}

function getKv<T>(key: string, fallback: T): T {
  const row = getDb().prepare(`SELECT value FROM kv WHERE key = ?`).get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

function setKv(key: string, value: unknown) {
  getDb().prepare(`INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`).run(key, JSON.stringify(value));
}

function replaceCollection(table: string, keyField: "updatedAt" | "createdAt", items: any[]) {
  const database = getDb();
  const del = database.prepare(`DELETE FROM ${table}`);
  const insert = database.prepare(`INSERT OR REPLACE INTO ${table} (id, ${keyField}, data) VALUES (?, ?, ?)`);
  const txn = database.transaction((rows: any[]) => {
    del.run();
    for (const item of rows) insert.run(item.id, item[keyField] || 0, JSON.stringify(item));
  });
  txn(items);
}

function upsertCollection(table: string, keyField: "updatedAt" | "createdAt", items: any[]) {
  const database = getDb();
  const insert = database.prepare(`INSERT OR REPLACE INTO ${table} (id, ${keyField}, data) VALUES (?, ?, ?)`);
  const txn = database.transaction((rows: any[]) => {
    for (const item of rows) insert.run(item.id, item[keyField] || 0, JSON.stringify(item));
  });
  txn(items);
}

// --- Merge helpers (unchanged logic from the old flat-file implementation) ---

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

// --- Public API (unchanged signatures — app/api/db/route.ts needs no changes) ---

export async function readServerDb(): Promise<ServerDatabase> {
  const conversations = readAll<Conversation>("conversations").sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const projects = readAll<Project>("projects").sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const agents = readAll<AgentTask>("agents").sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const pendingApprovals = readAll<PendingApproval>("pending_approvals").sort((a, b) => b.createdAt - a.createdAt);

  const settings = { ...DEFAULT_SETTINGS, ...getKv<Partial<AppSettings>>("settings", DEFAULT_SETTINGS) };
  const personas = getKv<PersonaPreset[]>("personas", PRESET_PERSONAS);
  const version = getKv<number>("version", 1);
  const lastUpdated = getKv<number>("lastUpdated", Date.now());

  return { conversations, projects, agents, settings, personas, pendingApprovals, lastUpdated, version };
}

export async function writeServerDb(data: {
  conversations?: Conversation[];
  projects?: Project[];
  agents?: AgentTask[];
  settings?: AppSettings;
  personas?: PersonaPreset[];
  pendingApprovals?: PendingApproval[];
  overwrite?: boolean;
}): Promise<ServerDatabase> {
  const current = await readServerDb();

  if (data.conversations !== undefined) {
    const merged = data.overwrite
      ? data.conversations
      : mergeConversations(current.conversations, data.conversations);
    if (data.overwrite) replaceCollection("conversations", "updatedAt", merged);
    else upsertCollection("conversations", "updatedAt", merged);
  }

  if (data.projects !== undefined) {
    const merged = data.overwrite ? data.projects : mergeProjects(current.projects, data.projects);
    if (data.overwrite) replaceCollection("projects", "updatedAt", merged);
    else upsertCollection("projects", "updatedAt", merged);
  }

  if (data.agents !== undefined) {
    const merged = data.overwrite ? data.agents : mergeAgents(current.agents, data.agents);
    if (data.overwrite) replaceCollection("agents", "updatedAt", merged);
    else upsertCollection("agents", "updatedAt", merged);
  }

  if (data.pendingApprovals !== undefined) {
    const merged = data.overwrite
      ? data.pendingApprovals
      : mergePendingApprovals(current.pendingApprovals, data.pendingApprovals);
    if (data.overwrite) replaceCollection("pending_approvals", "createdAt", merged);
    else upsertCollection("pending_approvals", "createdAt", merged);
  }

  if (data.settings) setKv("settings", { ...current.settings, ...data.settings });
  if (data.personas) setKv("personas", data.personas);

  setKv("version", (current.version || 1) + 1);
  setKv("lastUpdated", Date.now());

  return readServerDb();
}
