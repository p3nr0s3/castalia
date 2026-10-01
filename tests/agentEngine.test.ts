import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AgentTask, PendingApproval } from "../lib/types";

// agentEngine is the autonomous part of the app (scheduled runs that can call disk tools) and had no tests.
// The model and the tool layer are mocked; the state machine around them is what's under test.

const streamMock = vi.fn();
const toolMock = vi.fn();
const apiFetchMock = vi.fn();

vi.mock("../lib/ollama", () => ({ streamChatCompletion: (...a: any[]) => streamMock(...a) }));
vi.mock("../lib/apiClient", () => ({ apiFetch: (...a: any[]) => apiFetchMock(...a) }));
vi.mock("../lib/toolEngine", () => ({
  executeAgentToolCall: (...a: any[]) => toolMock(...a),
  ToolExecutionError: class ToolExecutionError extends Error {},
}));

import { calculateNextRun, executeAgent, resumeAgentAfterApproval } from "../lib/agentEngine";

const agent = (over: Partial<AgentTask> = {}): AgentTask =>
  ({
    id: "agent1", name: "Digest", description: "", prompt: "Summarise the news", model: "llama3", enabled: true,
    scheduleType: "interval", intervalMinutes: 30, status: "idle", createdAt: 1, updatedAt: 1, runCount: 0, logs: [],
    ...over,
  }) as AgentTask;

/** Makes the mocked model "say" these replies, one per call. */
function modelSays(...replies: (string | { text: string; toolCalls?: any[] })[]) {
  let i = 0;
  streamMock.mockImplementation(async (opts: any) => {
    const r = replies[Math.min(i++, replies.length - 1)];
    const text = typeof r === "string" ? r : r.text;
    const toolCalls = typeof r === "string" ? undefined : r.toolCalls;
    opts.onToken(text);
    opts.onFinish(text, { evalCount: 42 }, undefined, toolCalls);
    return text;
  });
}
const baseOpts = { ollamaUrl: "http://localhost:11434", projects: [] as any[] };

beforeEach(() => {
  streamMock.mockReset();
  toolMock.mockReset();
  apiFetchMock.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("calculateNextRun", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1, 10, 0, 0)); // 1 Oct 2026, 10:00 local
  });

  it("is undefined for manual or disabled agents", () => {
    expect(calculateNextRun(agent({ scheduleType: "manual" }))).toBeUndefined();
    expect(calculateNextRun(agent({ enabled: false }))).toBeUndefined();
  });

  it("interval: now + N minutes, defaulting to 60 for missing/zero/negative values", () => {
    const now = Date.now();
    expect(calculateNextRun(agent({ intervalMinutes: 15 }))).toBe(now + 15 * 60_000);
    for (const bad of [0, -5, undefined]) expect(calculateNextRun(agent({ intervalMinutes: bad as any }))).toBe(now + 60 * 60_000);
  });

  it("daily: later today if the time is ahead, tomorrow if it has passed (or is exactly now)", () => {
    const later = new Date(calculateNextRun(agent({ scheduleType: "daily", dailyTime: "18:30" }))!);
    expect([later.getDate(), later.getHours(), later.getMinutes()]).toEqual([1, 18, 30]);
    const earlier = new Date(calculateNextRun(agent({ scheduleType: "daily", dailyTime: "08:00" }))!);
    expect([earlier.getDate(), earlier.getHours()]).toEqual([2, 8]);
    const exactlyNow = new Date(calculateNextRun(agent({ scheduleType: "daily", dailyTime: "10:00" }))!);
    expect(exactlyNow.getDate()).toBe(2);
  });

  it("daily with a malformed time yields undefined — never NaN, which would make the agent silently never run", () => {
    for (const bad of ["8am", "25:99x", "", "ab:cd"]) {
      const next = calculateNextRun(agent({ scheduleType: "daily", dailyTime: bad }));
      expect(next === undefined || Number.isFinite(next), `dailyTime=${JSON.stringify(bad)}`).toBe(true);
    }
  });
});

describe("executeAgent", () => {
  it("runs the prompt and returns a completed agent, a log entry and a conversation holding the report", async () => {
    modelSays("Here is the digest.");
    const { updatedAgent, createdConversation, pendingApproval } = await executeAgent(agent(), baseOpts);
    expect(pendingApproval).toBeUndefined();
    expect(updatedAgent).toMatchObject({ status: "completed", runCount: 1 });
    expect(updatedAgent.logs![0]).toMatchObject({ status: "success", tokensGenerated: 42, conversationId: createdConversation!.id });
    expect(updatedAgent.nextRun).toBeGreaterThan(Date.now());
    expect(createdConversation).toMatchObject({ isAgentGenerated: true, agentId: "agent1" });
    expect(createdConversation!.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(createdConversation!.messages[0].content).toContain("Summarise the news");
    expect(createdConversation!.messages[1].content).toBe("Here is the digest.");
  });

  it("keeps only the 20 most recent log entries", async () => {
    modelSays("ok");
    const old = Array.from({ length: 25 }, (_, i) => ({ id: `l${i}`, agentId: "agent1", runAt: i, status: "success", summary: "" })) as any[];
    const { updatedAgent } = await executeAgent(agent({ logs: old }), baseOpts);
    expect(updatedAgent.logs).toHaveLength(20);
    expect(updatedAgent.logs![0].status).toBe("success");
  });

  it("reports a model failure as a failed run (with the error) instead of throwing", async () => {
    streamMock.mockRejectedValue(new Error("model exploded"));
    const { updatedAgent, createdConversation } = await executeAgent(agent(), baseOpts);
    expect(createdConversation).toBeUndefined();
    expect(updatedAgent.status).toBe("failed");
    expect(updatedAgent.logs![0]).toMatchObject({ status: "failed", error: "model exploded" });
    expect(updatedAgent.nextRun).toBeGreaterThan(Date.now()); // still scheduled for next time
  });

  it("two agents finishing in the same millisecond get DIFFERENT conversation and log ids", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1, 10, 0, 0));
    modelSays("a");
    const [r1, r2] = await Promise.all([executeAgent(agent({ id: "A" }), baseOpts), executeAgent(agent({ id: "B" }), baseOpts)]);
    expect(r1.createdConversation!.id).not.toBe(r2.createdConversation!.id);
    expect(r1.createdConversation!.messages[1].id).not.toBe(r2.createdConversation!.messages[1].id);
    expect(r1.updatedAgent.logs![0].id).not.toBe(r2.updatedAgent.logs![0].id);
  });

  describe("web search", () => {
    it("adds live results (with citations instructions) to the system prompt and keeps the sources", async () => {
      apiFetchMock.mockResolvedValue(new Response(JSON.stringify({ results: [{ title: "T", url: "https://x.test", snippet: "S" }] })));
      modelSays("report [1]");
      const { createdConversation } = await executeAgent(agent({ webSearch: true }), baseOpts);
      const sys = streamMock.mock.calls[0][0].systemPrompt as string;
      expect(sys).toContain("https://x.test");
      expect(sys).toMatch(/citations like \[1\]/);
      expect(createdConversation!.messages[1].sources).toHaveLength(1);
    });

    it("still runs (without results) when the search endpoint fails", async () => {
      apiFetchMock.mockRejectedValue(new Error("offline"));
      modelSays("no search");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { updatedAgent } = await executeAgent(agent({ webSearch: true }), baseOpts);
      warn.mockRestore();
      expect(updatedAgent.status).toBe("completed");
    });
  });

  it("puts project guidelines, files and ENABLED memories into the system prompt", async () => {
    modelSays("ok");
    const projects = [{ id: "p1", name: "Proj", systemPrompt: "Be terse.", files: [{ name: "a.md", textContent: "FILE-BODY" }], memories: [{ enabled: true, title: "tone", content: "formal" }, { enabled: false, title: "hidden", content: "SECRET-OFF" }] }] as any[];
    await executeAgent(agent({ targetProjectId: "p1" }), { ...baseOpts, projects });
    const sys = streamMock.mock.calls[0][0].systemPrompt as string;
    expect(sys).toContain("Be terse.");
    expect(sys).toContain("FILE-BODY");
    expect(sys).toContain("tone: formal");
    expect(sys).not.toContain("SECRET-OFF");
  });
});

describe("executeAgent with disk tools", () => {
  const dt = (over = {}) => agent({ diskToolsActive: true, ...over });

  it("runs a read-only tool immediately, feeds the result back, and completes", async () => {
    toolMock.mockResolvedValue({ raw: { entries: ["a.txt"] } });
    modelSays('[TOOL_CALL:list_directory:{"path":"."}]', "The folder has a.txt.");
    const { updatedAgent, createdConversation, pendingApproval } = await executeAgent(dt(), baseOpts);
    expect(pendingApproval).toBeUndefined();
    expect(toolMock).toHaveBeenCalledWith("list_directory", { path: "." });
    expect(updatedAgent.status).toBe("completed");
    expect(createdConversation!.messages[1].content).toBe("The folder has a.txt.");
    // the tool result was fed back to the model
    const followUp = streamMock.mock.calls[1][0].messages.map((m: any) => m.content).join("\n");
    expect(followUp).toContain("a.txt");
  });

  it("a tool error is passed to the model as text, not thrown", async () => {
    toolMock.mockRejectedValue(new Error("ENOENT"));
    modelSays('[TOOL_CALL:read_file:{"path":"missing"}]', "Could not read it.");
    const { updatedAgent } = await executeAgent(dt(), baseOpts);
    expect(updatedAgent.status).toBe("completed");
    expect(streamMock.mock.calls[1][0].messages.map((m: any) => m.content).join("\n")).toContain("ERROR: ENOENT");
  });

  it("PAUSES on write_file: nothing is written, an approval is created with the previous content", async () => {
    toolMock.mockImplementation(async (name: string) => {
      if (name === "read_file") return { raw: { content: "OLD CONTENT" } };
      throw new Error("write_file must not run before approval");
    });
    modelSays('[TOOL_CALL:write_file:{"path":"notes.txt","content":"NEW"}]');
    const r = await executeAgent(dt(), baseOpts);
    expect(r.updatedAgent.status).toBe("awaiting_approval");
    expect(r.pendingApproval).toMatchObject({ source: "agent", agentId: "agent1", toolName: "write_file", status: "pending", previousContent: "OLD CONTENT", args: { path: "notes.txt", content: "NEW" } });
    expect(r.createdConversation).toBeUndefined();
    expect(toolMock.mock.calls.map((c) => c[0])).toEqual(["read_file"]);
    expect(r.pausedContext!.history).toHaveLength(1);
  });

  it("uses a native tool call from the model the same way as a text directive", async () => {
    toolMock.mockResolvedValue({ raw: {} });
    modelSays({ text: "", toolCalls: [{ name: "delete_file", args: { path: "x" } }] });
    const r = await executeAgent(dt(), baseOpts);
    expect(r.pendingApproval?.toolName).toBe("delete_file");
  });

  it("stops after 5 tool rounds instead of looping forever", async () => {
    toolMock.mockResolvedValue({ raw: {} });
    modelSays('[TOOL_CALL:list_directory:{"path":"."}]'); // always asks again
    const { updatedAgent } = await executeAgent(dt(), baseOpts);
    expect(updatedAgent.status).toBe("completed");
    expect(toolMock).toHaveBeenCalledTimes(5);
  });
});

describe("resumeAgentAfterApproval", () => {
  const paused = (over: any = {}) => ({
    history: [{ id: "u", role: "user" as const, content: "[Automated Task Trigger]: go", timestamp: 1 }],
    effectiveSystemPrompt: "SYS",
    userMsg: { id: "u", role: "user" as const, content: "[Automated Task Trigger]: go", timestamp: 1 },
    searchSources: [],
    outputSoFar: '[TOOL_CALL:write_file:{"path":"n.txt","content":"X"}]',
    ...over,
  });
  const approval: PendingApproval = { id: "ap1", source: "agent", agentId: "agent1", toolName: "write_file", args: { path: "n.txt", content: "X" }, status: "approved", createdAt: 1 } as any;

  it("approved: runs the tool WITH the approval id, then continues to completion", async () => {
    toolMock.mockResolvedValue({ raw: { ok: true } });
    modelSays("Done, file written.");
    const r = await resumeAgentAfterApproval(agent({ diskToolsActive: true }), approval, "approved", paused(), { ollamaUrl: "u" });
    expect(toolMock).toHaveBeenCalledWith("write_file", { path: "n.txt", content: "X" }, "ap1");
    expect(r.updatedAgent.status).toBe("completed");
    expect(r.createdConversation!.messages[1].content).toBe("Done, file written.");
  });

  it("rejected: the tool never runs and the model is told the user said no", async () => {
    modelSays("Understood, skipping.");
    const r = await resumeAgentAfterApproval(agent(), approval, "rejected", paused(), { ollamaUrl: "u" });
    expect(toolMock).not.toHaveBeenCalled();
    expect(streamMock.mock.calls[0][0].messages.at(-1).content).toMatch(/DITOLAK/);
    expect(r.updatedAgent.status).toBe("completed");
  });

  it("gives the model back ITS OWN tool request before the result (history is user → assistant → tool result)", async () => {
    toolMock.mockResolvedValue({ raw: {} });
    modelSays("ok");
    await resumeAgentAfterApproval(agent({ diskToolsActive: true }), approval, "approved", paused(), { ollamaUrl: "u" });
    const roles = streamMock.mock.calls[0][0].messages.map((m: any) => m.role);
    expect(roles).toEqual(["user", "assistant", "user"]);
    expect(streamMock.mock.calls[0][0].messages[1].content).toContain("TOOL_CALL:write_file");
  });

  it("can pause again on a second mutating call", async () => {
    toolMock.mockResolvedValue({ raw: {} });
    modelSays('[TOOL_CALL:delete_file:{"path":"old.txt"}]');
    const r = await resumeAgentAfterApproval(agent({ diskToolsActive: true }), approval, "approved", paused(), { ollamaUrl: "u" });
    expect(r.updatedAgent.status).toBe("awaiting_approval");
    expect(r.pendingApproval?.toolName).toBe("delete_file");
    expect(r.pausedContext).toBeTruthy();
  });

  it("a model failure after approval becomes a failed run", async () => {
    toolMock.mockResolvedValue({ raw: {} });
    streamMock.mockRejectedValue(new Error("gone"));
    const r = await resumeAgentAfterApproval(agent(), approval, "approved", paused(), { ollamaUrl: "u" });
    expect(r.updatedAgent.status).toBe("failed");
    expect(r.updatedAgent.logs![0].error).toBe("gone");
  });
});
