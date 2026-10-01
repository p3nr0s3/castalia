import { executeAgent } from "./agentEngine";
import { configureServerApi } from "./apiClient";
import { readServerDb, writeServerDb, type ServerDatabase } from "./serverDb";
import { assertPublicUrl } from "./ssrfGuard";
import { safeFetch } from "./safeFetch";
import type { AgentTask, Conversation } from "./types";

/**
 * Runs scheduled agents from the SERVER, so they fire whether or not a browser tab is open.
 *
 * Before this, the only scheduler was a setInterval inside app/page.tsx: close the tab and every
 * "daily at 08:00" agent silently stopped; open two tabs and each one triggered the same run.
 *
 * Scope is deliberate:
 *  - Only agents WITHOUT disk tools. Those pause for approval on write/delete, which needs a person;
 *    they remain browser-scheduled (the page still runs them).
 *  - One agent at a time. A local model shares one GPU; parallel runs only slow each other down.
 *  - An agent is claimed by persisting status "running" before it starts; a claim older than
 *    STALE_RUNNING_MS is treated as a crashed run and may be retried.
 */

export const TICK_MS = 30_000;
export const STALE_RUNNING_MS = 30 * 60_000;
export const RUN_TIMEOUT_MS = 15 * 60_000;

export function isDueForServer(agent: AgentTask, now: number): boolean {
  if (!agent.enabled || agent.scheduleType === "manual") return false;
  if (agent.diskToolsActive) return false; // needs human approval → browser-scheduled
  if (!agent.nextRun || agent.nextRun > now) return false;
  if (agent.status === "awaiting_approval") return false;
  if (agent.status === "running" && now - (agent.updatedAt || 0) < STALE_RUNNING_MS) return false;
  return true;
}

export interface NotifyPayload {
  agentName: string;
  status: "completed" | "failed";
  summary: string;
  conversationId?: string;
}

/** Sends the run result to the agent's webhook. Never throws: a dead webhook must not fail the run. */
export async function sendAgentNotification(url: string, payload: NotifyPayload): Promise<boolean> {
  try {
    await assertPublicUrl(url);
    const icon = payload.status === "completed" ? "✅" : "❌";
    const text = `${icon} ${payload.agentName}: ${payload.summary}`.slice(0, 1900); // Discord caps at 2000
    const res = await safeFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `text` for Slack/Telegram, `content` for Discord; the rest is for generic receivers.
      body: JSON.stringify({ text, content: text, agent: payload.agentName, status: payload.status, conversationId: payload.conversationId }),
      signal: AbortSignal.timeout(10_000),
      maxBodyBytes: 64 * 1024,
    });
    return res.ok;
  } catch (err) {
    console.warn(`[scheduler] notification failed for "${payload.agentName}":`, (err as Error).message);
    return false;
  }
}

export interface SchedulerDeps {
  readDb: () => Promise<ServerDatabase>;
  writeDb: (data: { agents?: AgentTask[]; conversations?: Conversation[] }) => Promise<unknown>;
  execute: typeof executeAgent;
  notify: (url: string, payload: NotifyPayload) => Promise<boolean>;
  now: () => number;
}

const realDeps: SchedulerDeps = {
  readDb: readServerDb,
  writeDb: (d) => writeServerDb(d),
  execute: executeAgent,
  notify: sendAgentNotification,
  now: Date.now,
};

let ticking = false;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 60000)} min`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** One pass: runs every due agent, one after another. Returns the ids it ran. */
export async function runSchedulerTick(deps: SchedulerDeps = realDeps): Promise<string[]> {
  if (ticking) return []; // a long run must not overlap with the next tick
  ticking = true;
  const ran: string[] = [];
  try {
    const db = await deps.readDb();
    if (db.settings.serverScheduler === false) return ran;
    const due = db.agents.filter((a) => isDueForServer(a, deps.now()));

    for (const agent of due) {
      ran.push(agent.id);
      // Claim: other tabs and the next tick see "running" and leave it alone.
      await deps.writeDb({ agents: [{ ...agent, status: "running", updatedAt: deps.now() }] });

      let updated: AgentTask;
      let conversation: Conversation | undefined;
      try {
        const result = await withTimeout(
          deps.execute(agent, { ollamaUrl: db.settings.ollamaUrl, projects: db.projects, apiKeys: db.settings.apiKeys }),
          RUN_TIMEOUT_MS,
          `Agent "${agent.name}"`
        );
        updated = result.updatedAgent;
        conversation = result.createdConversation;
      } catch (err) {
        const message = (err as Error).message || "Unknown error";
        updated = {
          ...agent,
          status: "failed",
          lastRun: deps.now(),
          updatedAt: deps.now(),
          logs: [{ id: `log_sched_${deps.now()}`, agentId: agent.id, runAt: deps.now(), status: "failed", summary: "Execution failed", error: message, durationSeconds: 0 }, ...(agent.logs || []).slice(0, 19)],
        } as AgentTask;
      }

      await deps.writeDb({ agents: [updated], conversations: conversation ? [conversation] : undefined });

      if (agent.notifyUrl) {
        const lastLog = updated.logs?.[0];
        await deps.notify(agent.notifyUrl, {
          agentName: agent.name,
          status: updated.status === "completed" ? "completed" : "failed",
          summary: lastLog?.error || lastLog?.summary || "Run finished.",
          conversationId: conversation?.id,
        });
      }
    }
  } finally {
    ticking = false;
  }
  return ran;
}

/** Called once from instrumentation.ts. Disable with LYRA_SERVER_SCHEDULER=0. */
export function startAgentScheduler(): void {
  if (process.env.LYRA_SERVER_SCHEDULER === "0") return;
  const g = globalThis as any;
  if (g.__lyraAgentScheduler) return; // dev-mode HMR re-runs register()
  g.__lyraAgentScheduler = true;

  // The agent engine talks to this app's own routes (/api/ollama, /api/search, …) over HTTP.
  configureServerApi(process.env.LYRA_INTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 3000}`, process.env.APP_ACCESS_TOKEN || "");

  const tick = () => runSchedulerTick().catch((err) => console.error("[scheduler] tick failed:", err));
  setTimeout(tick, 20_000).unref?.();
  setInterval(tick, TICK_MS).unref?.();
}
