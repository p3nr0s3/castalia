import { describe, it, expect, vi, beforeEach } from "vitest";

const assertPublicUrl = vi.fn();
const safeFetch = vi.fn();
vi.mock("../lib/ssrfGuard", () => ({ assertPublicUrl: (...a: any[]) => assertPublicUrl(...a), SsrfBlockedError: class extends Error {} }));
vi.mock("../lib/safeFetch", () => ({ safeFetch: (...a: any[]) => safeFetch(...a) }));

import { isDueForServer, runSchedulerTick, sendAgentNotification, STALE_RUNNING_MS, type SchedulerDeps } from "../lib/agentScheduler";
import type { AgentTask } from "../lib/types";

const NOW = 1_800_000_000_000;
const agent = (over: Partial<AgentTask> = {}): AgentTask =>
  ({ id: "a1", name: "Digest", prompt: "p", model: "m", enabled: true, scheduleType: "interval", intervalMinutes: 60, status: "idle", nextRun: NOW - 1000, runCount: 0, logs: [], createdAt: 1, updatedAt: 1, ...over }) as AgentTask;

describe("isDueForServer", () => {
  it("is due when enabled, scheduled, and nextRun has passed", () => {
    expect(isDueForServer(agent(), NOW)).toBe(true);
    expect(isDueForServer(agent({ nextRun: NOW }), NOW)).toBe(true); // exactly now
  });

  it("is not due when disabled, manual, unscheduled, or in the future", () => {
    expect(isDueForServer(agent({ enabled: false }), NOW)).toBe(false);
    expect(isDueForServer(agent({ scheduleType: "manual" }), NOW)).toBe(false);
    expect(isDueForServer(agent({ nextRun: undefined }), NOW)).toBe(false);
    expect(isDueForServer(agent({ nextRun: NOW + 1 }), NOW)).toBe(false);
  });

  it("leaves agents with disk tools to the browser (they need a human to approve writes)", () => {
    expect(isDueForServer(agent({ diskToolsActive: true }), NOW)).toBe(false);
  });

  it("skips agents awaiting approval and runs already claimed, but retries a stale claim", () => {
    expect(isDueForServer(agent({ status: "awaiting_approval" }), NOW)).toBe(false);
    expect(isDueForServer(agent({ status: "running", updatedAt: NOW - 60_000 }), NOW)).toBe(false);
    expect(isDueForServer(agent({ status: "running", updatedAt: NOW - STALE_RUNNING_MS - 1 }), NOW)).toBe(true); // crashed run
  });
});

function makeDeps(agents: AgentTask[], over: Partial<SchedulerDeps> = {}, settings: any = {}) {
  const writes: any[] = [];
  const order: string[] = [];
  const deps: SchedulerDeps = {
    readDb: async () => ({ agents, projects: [], settings: { ollamaUrl: "http://localhost:11434", ...settings }, conversations: [], personas: [], pendingApprovals: [], lastUpdated: 0, version: 1 }) as any,
    writeDb: async (d) => void writes.push(d),
    execute: vi.fn(async (a: AgentTask) => {
      order.push(a.id);
      return {
        updatedAgent: { ...a, status: "completed", runCount: 1, updatedAt: NOW + 5, logs: [{ id: "l", agentId: a.id, runAt: NOW, status: "success", summary: "All done." }] } as any,
        createdConversation: { id: "conv_" + a.id, title: "t", messages: [], createdAt: 1, updatedAt: 1 } as any,
      };
    }) as any,
    notify: vi.fn(async () => true),
    now: () => NOW,
    ...over,
  };
  return { deps, writes, order };
}

describe("runSchedulerTick", () => {
  it("runs a due agent: claims it, executes with the server's settings, then stores the agent and its report", async () => {
    const { deps, writes } = makeDeps([agent()]);
    expect(await runSchedulerTick(deps)).toEqual(["a1"]);
    expect(writes[0].agents[0]).toMatchObject({ id: "a1", status: "running" }); // claim written BEFORE the run
    expect(deps.execute).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }), expect.objectContaining({ ollamaUrl: "http://localhost:11434" }));
    expect(writes[1].agents[0].status).toBe("completed");
    expect(writes[1].conversations[0].id).toBe("conv_a1");
  });

  it("runs nothing for agents that are not due, use disk tools, or when serverScheduler is off", async () => {
    const list = [agent({ id: "future", nextRun: NOW + 10_000 }), agent({ id: "disk", diskToolsActive: true }), agent({ id: "off", enabled: false })];
    expect(await runSchedulerTick(makeDeps(list).deps)).toEqual([]);
    const off = makeDeps([agent()], {}, { serverScheduler: false });
    expect(await runSchedulerTick(off.deps)).toEqual([]);
    expect(off.deps.execute).not.toHaveBeenCalled();
  });

  it("runs due agents one at a time, in order (a local model shares one GPU)", async () => {
    let active = 0;
    let maxActive = 0;
    const started: string[] = [];
    const { deps } = makeDeps([agent({ id: "a" }), agent({ id: "b" }), agent({ id: "c" })], {
      execute: (async (a: AgentTask) => {
        started.push(a.id);
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return { updatedAgent: { ...a, status: "completed", logs: [] } as any };
      }) as any,
    });
    await runSchedulerTick(deps);
    expect(maxActive).toBe(1);
    expect(started).toEqual(["a", "b", "c"]);
  });

  it("a failing agent is recorded as failed and does not stop the next one", async () => {
    const { deps, writes } = makeDeps([agent({ id: "bad" }), agent({ id: "good" })], {
      execute: vi.fn(async (a: AgentTask) => {
        if (a.id === "bad") throw new Error("model exploded");
        return { updatedAgent: { ...a, status: "completed", logs: [] } as any };
      }) as any,
    });
    expect(await runSchedulerTick(deps)).toEqual(["bad", "good"]);
    const badFinal = writes.find((w) => w.agents?.[0]?.id === "bad" && w.agents[0].status === "failed");
    expect(badFinal.agents[0].logs[0]).toMatchObject({ status: "failed", error: "model exploded" });
    expect(writes.some((w) => w.agents?.[0]?.id === "good" && w.agents[0].status === "completed")).toBe(true);
  });

  it("does not overlap with itself when a run outlasts the tick interval", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { deps } = makeDeps([agent()], { execute: vi.fn(async (a: AgentTask) => { await gate; return { updatedAgent: { ...a, status: "completed", logs: [] } as any }; }) as any });
    const first = runSchedulerTick(deps);
    await new Promise((r) => setTimeout(r, 5));
    expect(await runSchedulerTick(deps)).toEqual([]); // second tick while the first is still running
    release();
    expect(await first).toEqual(["a1"]);
  });

  it("sends a notification with the outcome when the agent has a webhook, and not otherwise", async () => {
    const withHook = makeDeps([agent({ notifyUrl: "https://hooks.example.com/x" })]);
    await runSchedulerTick(withHook.deps);
    expect(withHook.deps.notify).toHaveBeenCalledWith("https://hooks.example.com/x", { agentName: "Digest", status: "completed", summary: "All done.", conversationId: "conv_a1" });
    const without = makeDeps([agent()]);
    await runSchedulerTick(without.deps);
    expect(without.deps.notify).not.toHaveBeenCalled();
  });

  it("notifies about failures too, with the error text", async () => {
    const { deps } = makeDeps([agent({ notifyUrl: "https://hooks.example.com/x" })], { execute: vi.fn(async () => { throw new Error("no GPU"); }) as any });
    await runSchedulerTick(deps);
    expect(deps.notify).toHaveBeenCalledWith("https://hooks.example.com/x", expect.objectContaining({ status: "failed", summary: "no GPU" }));
  });
});

describe("sendAgentNotification", () => {
  beforeEach(() => {
    assertPublicUrl.mockReset().mockResolvedValue(undefined);
    safeFetch.mockReset().mockResolvedValue({ ok: true });
  });

  it("posts a message with both Slack (text) and Discord (content) fields, truncated to Discord's limit", async () => {
    const ok = await sendAgentNotification("https://hooks.example.com/x", { agentName: "Digest", status: "completed", summary: "x".repeat(5000), conversationId: "c1" });
    expect(ok).toBe(true);
    const [url, init] = safeFetch.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/x");
    const body = JSON.parse(init.body);
    expect(body.text).toBe(body.content);
    expect(body.text.length).toBeLessThanOrEqual(1900);
    expect(body.text.startsWith("✅ Digest:")).toBe(true);
    expect(body).toMatchObject({ agent: "Digest", status: "completed", conversationId: "c1" });
  });

  it("refuses private/internal webhook targets without making a request, and never throws", async () => {
    assertPublicUrl.mockRejectedValue(new Error("resolves to a private address"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await sendAgentNotification("http://169.254.169.254/", { agentName: "a", status: "failed", summary: "s" })).toBe(false);
    expect(safeFetch).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns false (not an exception) when the webhook errors or answers non-2xx", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    safeFetch.mockResolvedValueOnce({ ok: false });
    expect(await sendAgentNotification("https://h.example/x", { agentName: "a", status: "completed", summary: "s" })).toBe(false);
    safeFetch.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await sendAgentNotification("https://h.example/x", { agentName: "a", status: "completed", summary: "s" })).toBe(false);
    warn.mockRestore();
  });
});
