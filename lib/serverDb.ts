import fs from "fs/promises";
import path from "path";
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
const DB_FILE = path.join(DATA_DIR, "db.json");

const DEFAULT_DB: ServerDatabase = {
  conversations: [],
  projects: [],
  agents: [],
  settings: DEFAULT_SETTINGS,
  personas: PRESET_PERSONAS,
  pendingApprovals: [],
  lastUpdated: Date.now(),
  version: 1,
};

// Global in-memory cache to prevent repeated disk I/O lag
let cachedDb: ServerDatabase | null = null;
let isSaving = false;
let pendingSave = false;

// Helper to merge conversations
function mergeConversations(serverList: Conversation[], clientList: Conversation[]): Conversation[] {
  const map = new Map<string, Conversation>();

  for (const c of serverList) {
    map.set(c.id, c);
  }

  for (const clientConv of clientList) {
    const existing = map.get(clientConv.id);
    if (!existing) {
      map.set(clientConv.id, clientConv);
    } else {
      if (
        (clientConv.updatedAt || 0) >= (existing.updatedAt || 0) ||
        (clientConv.messages?.length || 0) >= (existing.messages?.length || 0)
      ) {
        map.set(clientConv.id, {
          ...existing,
          ...clientConv,
          messages: (clientConv.messages?.length || 0) >= (existing.messages?.length || 0)
            ? clientConv.messages
            : existing.messages,
        });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function mergeProjects(serverList: Project[], clientList: Project[]): Project[] {
  const map = new Map<string, Project>();
  for (const p of serverList) map.set(p.id, p);
  for (const p of clientList) {
    const existing = map.get(p.id);
    if (!existing || (p.updatedAt || 0) >= (existing.updatedAt || 0)) {
      map.set(p.id, p);
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function mergeAgents(serverList: AgentTask[], clientList: AgentTask[]): AgentTask[] {
  const map = new Map<string, AgentTask>();
  for (const a of serverList) map.set(a.id, a);
  for (const a of clientList) {
    const existing = map.get(a.id);
    if (!existing || (a.updatedAt || 0) >= (existing.updatedAt || 0)) {
      map.set(a.id, a);
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function mergePendingApprovals(serverList: PendingApproval[], clientList: PendingApproval[]): PendingApproval[] {
  const map = new Map<string, PendingApproval>();
  for (const a of serverList) map.set(a.id, a);
  for (const a of clientList) {
    const existing = map.get(a.id);
    // resolvedAt is only set once a decision is made — a resolved record always wins over a pending one.
    if (!existing || (a.resolvedAt || a.createdAt) >= (existing.resolvedAt || existing.createdAt)) {
      map.set(a.id, a);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}

async function persistToDisk(db: ServerDatabase) {
  if (isSaving) {
    pendingSave = true;
    return;
  }
  isSaving = true;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to persist database to disk:", err);
  } finally {
    isSaving = false;
    if (pendingSave) {
      pendingSave = false;
      if (cachedDb) persistToDisk(cachedDb);
    }
  }
}

export async function readServerDb(): Promise<ServerDatabase> {
  if (cachedDb) {
    return cachedDb;
  }

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const content = await fs.readFile(DB_FILE, "utf-8");
    const parsed = JSON.parse(content);
    cachedDb = {
      conversations: parsed.conversations || [],
      projects: parsed.projects || [],
      agents: parsed.agents || [],
      settings: parsed.settings ? { ...DEFAULT_SETTINGS, ...parsed.settings } : DEFAULT_SETTINGS,
      personas: parsed.personas || PRESET_PERSONAS,
      pendingApprovals: parsed.pendingApprovals || [],
      lastUpdated: parsed.lastUpdated || Date.now(),
      version: parsed.version || 1,
    };
    return cachedDb;
  } catch (err: any) {
    cachedDb = { ...DEFAULT_DB, lastUpdated: Date.now() };
    persistToDisk(cachedDb);
    return cachedDb;
  }
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

  let mergedConversations = current.conversations;
  if (data.conversations !== undefined) {
    mergedConversations = data.overwrite
      ? data.conversations
      : mergeConversations(current.conversations, data.conversations);
  }

  let mergedProjects = current.projects;
  if (data.projects !== undefined) {
    mergedProjects = data.overwrite
      ? data.projects
      : mergeProjects(current.projects, data.projects);
  }

  let mergedAgents = current.agents;
  if (data.agents !== undefined) {
    mergedAgents = data.overwrite
      ? data.agents
      : mergeAgents(current.agents, data.agents);
  }

  let mergedPendingApprovals = current.pendingApprovals;
  if (data.pendingApprovals !== undefined) {
    mergedPendingApprovals = data.overwrite
      ? data.pendingApprovals
      : mergePendingApprovals(current.pendingApprovals, data.pendingApprovals);
  }

  cachedDb = {
    conversations: mergedConversations,
    projects: mergedProjects,
    agents: mergedAgents,
    settings: data.settings ? { ...current.settings, ...data.settings } : current.settings,
    personas: data.personas || current.personas,
    pendingApprovals: mergedPendingApprovals,
    lastUpdated: Date.now(),
    version: (current.version || 1) + 1,
  };

  persistToDisk(cachedDb);
  return cachedDb;
}
