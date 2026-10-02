import { AppSettings, Conversation, PersonaPreset, Project, AgentTask, PendingApproval, JournalEntry } from "./types";
import { apiFetch } from "./apiClient";
import { DEFAULT_SETTINGS, PRESET_PERSONAS } from "./constants";
import { DEFAULT_CONNECTORS } from "./directoryData";
import { idbGet, idbSet, idbDelete } from "./idbStorage";

const STORAGE_KEYS = {
  CONVERSATIONS: "ollama_chat_conversations",
  ACTIVE_ID: "ollama_chat_active_id",
  SETTINGS: "ollama_chat_settings",
  PERSONAS: "ollama_chat_custom_personas",
  PROJECTS: "ollama_chat_projects",
  AGENTS: "ollama_chat_agents",
  JOURNAL: "ollama_chat_journal",
  PENDING_APPROVALS: "ollama_chat_pending_approvals",
  LAST_SYNC: "ollama_chat_last_sync",
};

let syncTimeout: NodeJS.Timeout | null = null;

export const storage = {
  // --- Server Synchronization API ---
  async fetchServerDb(): Promise<{
    conversations: Conversation[];
    projects: Project[];
    agents: AgentTask[];
    journalEntries?: JournalEntry[];
    settings: AppSettings;
    personas: PersonaPreset[];
    lastUpdated: number;
  } | null> {
    try {
      const res = await apiFetch("/api/db", { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn("Failed to fetch database from server:", e);
      return null;
    }
  },

  async pushToServer(payload: {
    conversations?: Conversation[];
    projects?: Project[];
    agents?: AgentTask[];
    journalEntries?: JournalEntry[];
    settings?: AppSettings;
    personas?: PersonaPreset[];
    pendingApprovals?: PendingApproval[];
  }): Promise<boolean> {
    try {
      const res = await apiFetch("/api/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch (e) {
      console.warn("Failed to push updates to server:", e);
      return false;
    }
  },

  debouncedSyncToServer(payload: {
    conversations?: Conversation[];
    projects?: Project[];
    agents?: AgentTask[];
    journalEntries?: JournalEntry[];
    settings?: AppSettings;
    personas?: PersonaPreset[];
    pendingApprovals?: PendingApproval[];
  }) {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      this.pushToServer(payload);
    }, 400);
  },

  // --- IndexedDB Async Hydration Helper ---
  async loadClientDbAsync(): Promise<{
    conversations?: Conversation[];
    projects?: Project[];
    agents?: AgentTask[];
    journalEntries?: JournalEntry[];
    settings?: AppSettings;
    personas?: PersonaPreset[];
    pendingApprovals?: PendingApproval[];
  }> {
    if (typeof window === "undefined") return {};
    try {
      const [
        conversations,
        projects,
        agents,
        journalEntries,
        settings,
        personas,
        pendingApprovals,
      ] = await Promise.all([
        idbGet<Conversation[]>(STORAGE_KEYS.CONVERSATIONS),
        idbGet<Project[]>(STORAGE_KEYS.PROJECTS),
        idbGet<AgentTask[]>(STORAGE_KEYS.AGENTS),
        idbGet<JournalEntry[]>(STORAGE_KEYS.JOURNAL),
        idbGet<AppSettings>(STORAGE_KEYS.SETTINGS),
        idbGet<PersonaPreset[]>(STORAGE_KEYS.PERSONAS),
        idbGet<PendingApproval[]>(STORAGE_KEYS.PENDING_APPROVALS),
      ]);

      return {
        conversations: conversations || undefined,
        projects: projects || undefined,
        agents: agents || undefined,
        journalEntries: journalEntries || undefined,
        settings: settings || undefined,
        personas: personas || undefined,
        pendingApprovals: pendingApprovals || undefined,
      };
    } catch (e) {
      console.warn("[storage] IndexedDB loadClientDbAsync failed:", e);
      return {};
    }
  },

  // --- Local Storage Cache & Helpers ---
  getConversations(): Conversation[] {
    if (typeof window === "undefined") return [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("Failed to load conversations from localStorage:", e);
      return [];
    }
  },

  saveConversations(conversations: Conversation[], syncServer = true): void {
    if (typeof window === "undefined") return;

    // 1. Asynchronously persist full data to IndexedDB (virtually unlimited quota)
    idbSet(STORAGE_KEYS.CONVERSATIONS, conversations).catch((err) => {
      console.warn("[storage] IndexedDB saveConversations error:", err);
    });

    // 2. Cache in localStorage for fast synchronous reads, with quota protection
    try {
      localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
    } catch (e: any) {
      if (e?.name === "QuotaExceededError" || e?.code === 22) {
        console.warn("[storage] localStorage quota exceeded; preserving full conversation history in IndexedDB and server database.");
      } else {
        console.error("Failed to save conversations to localStorage:", e);
      }
    }

    // 3. Synchronize to server database
    if (syncServer) {
      this.debouncedSyncToServer({ conversations });
    }
  },

  getActiveConversationId(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_ID);
  },

  saveActiveConversationId(id: string | null): void {
    if (typeof window === "undefined") return;
    if (id) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_ID, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_ID);
    }
  },

  getProjects(): Project[] {
    if (typeof window === "undefined") return [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("Failed to load projects:", e);
      return [];
    }
  },

  saveProjects(projects: Project[], syncServer = true): void {
    if (typeof window === "undefined") return;
    idbSet(STORAGE_KEYS.PROJECTS, projects).catch(() => {});
    try {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    } catch (e: any) {
      if (e?.name !== "QuotaExceededError" && e?.code !== 22) {
        console.error("Failed to save projects to localStorage:", e);
      }
    }
    if (syncServer) {
      this.debouncedSyncToServer({ projects });
    }
  },

  getAgents(): AgentTask[] {
    if (typeof window === "undefined") return [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AGENTS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("Failed to load agents:", e);
      return [];
    }
  },

  saveAgents(agents: AgentTask[], syncServer = true): void {
    if (typeof window === "undefined") return;
    idbSet(STORAGE_KEYS.AGENTS, agents).catch(() => {});
    try {
      localStorage.setItem(STORAGE_KEYS.AGENTS, JSON.stringify(agents));
    } catch (e: any) {
      if (e?.name !== "QuotaExceededError" && e?.code !== 22) {
        console.error("Failed to save agents to localStorage:", e);
      }
    }
    if (syncServer) {
      this.debouncedSyncToServer({ agents });
    }
  },

  getJournalEntries(): JournalEntry[] {
    if (typeof window === "undefined") return [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.JOURNAL);
      if (data) return JSON.parse(data);
      // Migrate legacy tasks if journal is empty
      const legacyTasks = localStorage.getItem("ollama_chat_tasks");
      if (legacyTasks) {
        const parsed = JSON.parse(legacyTasks);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const migrated: JournalEntry[] = parsed.map((t: any) => ({
            id: t.id,
            title: t.title,
            content: t.description || "",
            icon: "",
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
          this.saveJournalEntries(migrated);
          return migrated;
        }
      }
      return [];
    } catch (e) {
      console.error("Failed to load journal entries:", e);
      return [];
    }
  },

  saveJournalEntries(entries: JournalEntry[], syncServer = true): void {
    if (typeof window === "undefined") return;
    idbSet(STORAGE_KEYS.JOURNAL, entries).catch(() => {});
    try {
      localStorage.setItem(STORAGE_KEYS.JOURNAL, JSON.stringify(entries));
    } catch (e: any) {
      if (e?.name !== "QuotaExceededError" && e?.code !== 22) {
        console.error("Failed to save journal entries to localStorage:", e);
      }
    }
    if (syncServer) {
      this.debouncedSyncToServer({ journalEntries: entries });
    }
  },

  getPendingApprovals(): PendingApproval[] {
    if (typeof window === "undefined") return [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PENDING_APPROVALS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("Failed to load pending approvals:", e);
      return [];
    }
  },

  savePendingApprovals(approvals: PendingApproval[], syncServer = true): void {
    if (typeof window === "undefined") return;
    idbSet(STORAGE_KEYS.PENDING_APPROVALS, approvals).catch(() => {});
    try {
      localStorage.setItem(STORAGE_KEYS.PENDING_APPROVALS, JSON.stringify(approvals));
    } catch (e: any) {
      if (e?.name !== "QuotaExceededError" && e?.code !== 22) {
        console.error("Failed to save pending approvals to localStorage:", e);
      }
    }
    if (syncServer) {
      this.debouncedSyncToServer({ pendingApprovals: approvals });
    }
  },

  /**
   * Like savePendingApprovals, but pushes to the server immediately and
   * awaits completion instead of debouncing. Use this when a caller is about
   * to hand an approval id to a server route as proof of approval (e.g.
   * resuming a paused tool-call loop right after the user clicks Approve) —
   * the server checks readServerDb() for that approval, so the write must
   * actually land before that check happens, not up to 400ms later.
   */
  async savePendingApprovalsSync(approvals: PendingApproval[]): Promise<void> {
    if (typeof window === "undefined") return;
    idbSet(STORAGE_KEYS.PENDING_APPROVALS, approvals).catch(() => {});
    try {
      localStorage.setItem(STORAGE_KEYS.PENDING_APPROVALS, JSON.stringify(approvals));
    } catch (e) {
      console.error("Failed to save pending approvals to localStorage:", e);
    }
    try {
      await this.pushToServer({ pendingApprovals: approvals });
    } catch (e) {
      console.error("Failed to push pending approvals to server:", e);
    }
  },

  getSettings(): AppSettings {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!data) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(data);
      const existingConnIds = new Set(parsed.connectors?.map((c: any) => c.id) || []);
      const mergedConnectors = [
        ...(parsed.connectors || []),
        ...DEFAULT_CONNECTORS.filter((c) => !existingConnIds.has(c.id)),
      ];
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        numCtx: parsed.numCtx || DEFAULT_SETTINGS.numCtx,
        connectors: mergedConnectors,
      };
    } catch (e) {
      console.error("Failed to load settings from localStorage:", e);
      return DEFAULT_SETTINGS;
    }
  },

  saveSettings(settings: AppSettings, syncServer = true, immediate = false): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      if (immediate) {
        this.pushToServer({ settings });
      } else if (syncServer) {
        this.debouncedSyncToServer({ settings });
      }
    } catch (e) {
      console.error("Failed to save settings to localStorage:", e);
    }
  },

  getPersonas(): PersonaPreset[] {
    if (typeof window === "undefined") return PRESET_PERSONAS;
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PERSONAS);
      if (!data) return PRESET_PERSONAS;
      const custom: PersonaPreset[] = JSON.parse(data);
      const customIds = new Set(custom.map((p) => p.id));
      const filteredDefaults = PRESET_PERSONAS.filter((p) => !customIds.has(p.id));
      return [...filteredDefaults, ...custom];
    } catch (e) {
      console.error("Failed to load personas:", e);
      return PRESET_PERSONAS;
    }
  },

  savePersonas(personas: PersonaPreset[], syncServer = true): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEYS.PERSONAS, JSON.stringify(personas));
      if (syncServer) {
        this.debouncedSyncToServer({ personas });
      }
    } catch (e) {
      console.error("Failed to save personas:", e);
    }
  },

  exportData(): string {
    const data = {
      conversations: this.getConversations(),
      projects: this.getProjects(),
      agents: this.getAgents(),
      journalEntries: this.getJournalEntries(),
      settings: this.getSettings(),
      personas: this.getPersonas(),
      exportDate: new Date().toISOString(),
      version: "2.0",
    };
    return JSON.stringify(data, null, 2);
  },

  importData(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (data.conversations && Array.isArray(data.conversations)) {
        this.saveConversations(data.conversations);
      }
      if (data.projects && Array.isArray(data.projects)) {
        this.saveProjects(data.projects);
      }
      if (data.agents && Array.isArray(data.agents)) {
        this.saveAgents(data.agents);
      }
      if (data.journalEntries && Array.isArray(data.journalEntries)) {
        this.saveJournalEntries(data.journalEntries);
      } else if (data.tasks && Array.isArray(data.tasks)) {
        const migrated: JournalEntry[] = data.tasks.map((t: any) => ({
          id: t.id,
          title: t.title,
          content: t.description || "",
          icon: "",
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
        this.saveJournalEntries(migrated);
      }
      if (data.settings) {
        this.saveSettings(data.settings);
      }
      if (data.personas && Array.isArray(data.personas)) {
        this.savePersonas(data.personas);
      }
      // Also push imported data to central server
      this.pushToServer({
        conversations: data.conversations,
        projects: data.projects,
        agents: data.agents,
        journalEntries: data.journalEntries,
        settings: data.settings,
        personas: data.personas,
      });
      return true;
    } catch (e) {
      console.error("Failed to import data:", e);
      return false;
    }
  },
};
