// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { storage } from "../lib/storage";
import { DEFAULT_SETTINGS } from "../lib/constants";
import type { Conversation, Project, AppSettings } from "../lib/types";

/**
 * lib/storage.ts is the client half of multi-device sync and had no tests. The first one
 * below reproduces a real data-loss bug: debouncedSyncToServer kept a single timer AND a single
 * payload, so saving two different collections within 400 ms silently dropped the first.
 */

const conv = (id: string): Conversation => ({ id, title: id, messages: [], createdAt: 1, updatedAt: 1 } as any);
const proj = (id: string): Project => ({ id, name: id, createdAt: 1, updatedAt: 1, files: [] } as any);

let fetchMock: ReturnType<typeof vi.fn>;
const posted = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(init.body));

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("debounced server sync", () => {
  it("sends ONE request containing every collection saved inside the debounce window", async () => {
    storage.saveConversations([conv("c1")]);
    storage.saveProjects([proj("p1")]);
    storage.saveAgents([{ id: "a1", name: "a" } as any]);
    await vi.advanceTimersByTimeAsync(450);
    const bodies = posted();
    expect(bodies).toHaveLength(1);
    expect(Object.keys(bodies[0]).sort()).toEqual(["agents", "conversations", "projects"]);
    expect(bodies[0].conversations[0].id).toBe("c1");
  });

  it("keeps the newest value when the same collection is saved repeatedly", async () => {
    storage.saveConversations([conv("old")]);
    storage.saveConversations([conv("new")]);
    await vi.advanceTimersByTimeAsync(450);
    const bodies = posted();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].conversations.map((c: Conversation) => c.id)).toEqual(["new"]);
  });

  it("does not send before the debounce delay, and starts clean afterwards", async () => {
    storage.saveProjects([proj("p1")]);
    await vi.advanceTimersByTimeAsync(300);
    expect(posted()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(posted()).toHaveLength(1);
    storage.saveConversations([conv("c2")]);
    await vi.advanceTimersByTimeAsync(450);
    const bodies = posted();
    expect(bodies).toHaveLength(2);
    expect(Object.keys(bodies[1])).toEqual(["conversations"]); // nothing left over from the first batch
  });

  it("retries a failed push instead of dropping the data, then gives up after a bounded number of tries", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    storage.saveConversations([conv("c1")]);
    await vi.advanceTimersByTimeAsync(450); // attempt 1 fails
    expect(posted()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3100); // retry 1 (after 3s)
    expect(posted()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60000); // remaining retries (6s, 12s) happen, then it stops
    const total = posted().length;
    expect(total).toBe(4); // 1 initial + 3 retries
    await vi.advanceTimersByTimeAsync(120000);
    expect(posted().length).toBe(total); // no infinite retry loop
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("a retry does not clobber newer data saved meanwhile", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    storage.saveConversations([conv("v1")]);
    await vi.advanceTimersByTimeAsync(450); // fails, v1 queued for retry
    storage.saveConversations([conv("v2")]); // newer data arrives
    await vi.advanceTimersByTimeAsync(3500);
    const last = posted().at(-1);
    expect(last.conversations.map((c: Conversation) => c.id)).toEqual(["v2"]);
  });

  it("saveSettings(immediate) bypasses the debounce; syncServer=false never pushes", async () => {
    storage.saveSettings({ ...DEFAULT_SETTINGS }, true, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(posted()).toHaveLength(1);
    storage.saveProjects([proj("p")], false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(posted()).toHaveLength(1);
    expect(storage.getProjects()[0].id).toBe("p"); // still cached locally
  });
});

describe("local cache", () => {
  it("returns empty collections for missing or corrupted localStorage instead of throwing", () => {
    expect(storage.getConversations()).toEqual([]);
    localStorage.setItem("ollama_chat_conversations", "{not json");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(storage.getConversations()).toEqual([]);
    err.mockRestore();
  });

  it("migrates legacy tasks into journal entries once", () => {
    localStorage.setItem("ollama_chat_tasks", JSON.stringify([{ id: "t1", title: "Do it", description: "d", status: "todo", subtasks: [] }]));
    const entries = storage.getJournalEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "t1", category: "task", status: "draft", content: "d" });
    expect(localStorage.getItem("ollama_chat_journal")).toBeTruthy();
  });

  it("getSettings fills gaps from defaults and repairs a missing numCtx", () => {
    localStorage.setItem("ollama_chat_settings", JSON.stringify({ temperature: 0.1, numCtx: 0 }));
    const s = storage.getSettings();
    expect(s.temperature).toBe(0.1);
    expect(s.numCtx).toBe(DEFAULT_SETTINGS.numCtx);
    expect(s.topP).toBe(DEFAULT_SETTINGS.topP);
  });
});

describe("export / import", () => {
  const withKeys = (): AppSettings => ({ ...DEFAULT_SETTINGS, apiKeys: { ...(DEFAULT_SETTINGS as any).apiKeys, openaiApiKey: "sk-secret-value-123" } } as any);

  it("does NOT put API keys in an exported backup by default", () => {
    storage.saveSettings(withKeys(), false);
    const dump = storage.exportData();
    expect(dump).not.toContain("sk-secret-value-123");
    expect(JSON.parse(dump).includesSecrets).toBe(false);
  });

  it("includes them only when explicitly asked", () => {
    storage.saveSettings(withKeys(), false);
    const dump = storage.exportData({ includeSecrets: true });
    expect(dump).toContain("sk-secret-value-123");
    expect(JSON.parse(dump).includesSecrets).toBe(true);
  });

  it("importing a key-less backup keeps the keys already on this machine", () => {
    storage.saveSettings(withKeys(), false);
    const backup = storage.exportData(); // no secrets
    expect(storage.importData(backup)).toBe(true);
    expect((storage.getSettings() as any).apiKeys.openaiApiKey).toBe("sk-secret-value-123");
  });

  it("importing a backup that has keys applies them", () => {
    const backup = JSON.stringify({ conversations: [conv("c")], settings: withKeys(), version: "2.0" });
    expect(storage.importData(backup)).toBe(true);
    expect((storage.getSettings() as any).apiKeys.openaiApiKey).toBe("sk-secret-value-123");
  });

  it("round-trips conversations and projects and pushes them to the server immediately", async () => {
    storage.saveConversations([conv("c1")], false);
    storage.saveProjects([proj("p1")], false);
    const dump = storage.exportData();
    localStorage.clear();
    expect(storage.importData(dump)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(storage.getConversations().map((c) => c.id)).toEqual(["c1"]);
    expect(storage.getProjects().map((p) => p.id)).toEqual(["p1"]);
    expect(posted().some((b) => b.conversations && b.projects)).toBe(true);
  });

  it("rejects malformed JSON without touching existing data", () => {
    storage.saveConversations([conv("keep")], false);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(storage.importData("{oops")).toBe(false);
    err.mockRestore();
    expect(storage.getConversations().map((c) => c.id)).toEqual(["keep"]);
  });
});
