import { AppSettings, Conversation, PersonaPreset, Project, AgentTask, PendingApproval } from "./types";
import { apiFetch } from "./apiClient";
import { DEFAULT_SETTINGS, PRESET_PERSONAS } from "./constants";
import { DEFAULT_CONNECTORS } from "./directoryData";

const STORAGE_KEYS = {
  CONVERSATIONS: "ollama_chat_conversations",
  ACTIVE_ID: "ollama_chat_active_id",
  SETTINGS: "ollama_chat_settings",
  PERSONAS: "ollama_chat_custom_personas",
  PROJECTS: "ollama_chat_projects",
  AGENTS: "ollama_chat_agents",
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
    settings?: AppSettings;
    personas?: PersonaPreset[];
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
    settings?: AppSettings;
    personas?: PersonaPreset[];
  }) {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      this.pushToServer(payload);
    }, 400);
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
    try {
      localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
      if (syncServer) {
        this.debouncedSyncToServer({ conversations });
      }
    } catch (e) {
      console.error("Failed to save conversations to localStorage:", e);
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
    try {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
      if (syncServer) {
        this.debouncedSyncToServer({ projects });
      }
    } catch (e) {
      console.error("Failed to save projects:", e);
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
    try {
      localStorage.setItem(STORAGE_KEYS.AGENTS, JSON.stringify(agents));
      if (syncServer) {
        this.debouncedSyncToServer({ agents });
      }
    } catch (e) {
      console.error("Failed to save agents:", e);
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
    try {
      localStorage.setItem(STORAGE_KEYS.PENDING_APPROVALS, JSON.stringify(approvals));
      if (syncServer) {
        this.debouncedSyncToServer({ pendingApprovals: approvals });
      }
    } catch (e) {
      console.error("Failed to save pending approvals:", e);
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
