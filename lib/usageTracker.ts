import type { Conversation, ModelPricing } from "./types";
import { detectModelProvider } from "./ollama";

/**
 * Token and cost accounting derived from data the app already stores: every assistant message keeps
 * `metrics.promptEvalCount` (input tokens) and `metrics.evalCount` (output tokens), for Ollama and —
 * via the cloud proxy's final chunk — for OpenAI-compatible and Gemini models. Nothing new is
 * persisted; this only aggregates.
 *
 * Cost is computed ONLY for models the user entered a price for. Prices change and differ per plan,
 * so none are built in: an unpriced model shows tokens but no dollar figure, and the totals say how
 * many tokens were left out of the cost.
 */

export interface UsageRow {
  model: string;
  provider: string;
  /** Local Ollama models cost nothing to call. */
  isLocal: boolean;
  messages: number;
  promptTokens: number;
  completionTokens: number;
  /** null = no price entered for this model (and it is not local). */
  costUsd: number | null;
}

export interface UsageDay {
  day: string; // YYYY-MM-DD, local time
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface UsageReport {
  totals: {
    messages: number;
    promptTokens: number;
    completionTokens: number;
    /** Sum over models that have a price (and local models, which are 0). */
    costUsd: number;
    /** Cloud tokens that could not be priced. */
    unpricedTokens: number;
  };
  byModel: UsageRow[];
  byDay: UsageDay[];
}

export interface UsageOptions {
  sinceMs?: number;
  untilMs?: number;
  pricing?: Record<string, ModelPricing>;
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const validPrice = (p?: ModelPricing): p is ModelPricing =>
  !!p && Number.isFinite(p.inputPerMTok) && Number.isFinite(p.outputPerMTok) && p.inputPerMTok >= 0 && p.outputPerMTok >= 0;

export function aggregateUsage(conversations: Conversation[], opts: UsageOptions = {}): UsageReport {
  const pricing = opts.pricing ?? {};
  const rows = new Map<string, UsageRow>();
  const days = new Map<string, UsageDay>();
  const totals = { messages: 0, promptTokens: 0, completionTokens: 0, costUsd: 0, unpricedTokens: 0 };

  for (const conv of conversations) {
    for (const msg of conv.messages || []) {
      if (msg.role !== "assistant") continue;
      const prompt = Math.max(0, Number(msg.metrics?.promptEvalCount) || 0);
      const completion = Math.max(0, Number(msg.metrics?.evalCount) || 0);
      if (prompt === 0 && completion === 0) continue;
      const ts = msg.timestamp || conv.updatedAt || 0;
      if (opts.sinceMs !== undefined && ts < opts.sinceMs) continue;
      if (opts.untilMs !== undefined && ts > opts.untilMs) continue;

      const model = msg.model || conv.model || "unknown";
      const provider = detectModelProvider(model);
      const isLocal = provider === "ollama";
      const price = pricing[model];
      const priced = isLocal || validPrice(price);
      const cost = isLocal ? 0 : validPrice(price) ? (prompt * price.inputPerMTok + completion * price.outputPerMTok) / 1_000_000 : 0;

      let row = rows.get(model);
      if (!row) {
        row = { model, provider, isLocal, messages: 0, promptTokens: 0, completionTokens: 0, costUsd: priced ? 0 : null };
        rows.set(model, row);
      }
      row.messages++;
      row.promptTokens += prompt;
      row.completionTokens += completion;
      if (row.costUsd !== null) row.costUsd += cost;

      const key = dayKey(ts);
      const day = days.get(key) ?? { day: key, promptTokens: 0, completionTokens: 0, costUsd: 0 };
      day.promptTokens += prompt;
      day.completionTokens += completion;
      day.costUsd += cost;
      days.set(key, day);

      totals.messages++;
      totals.promptTokens += prompt;
      totals.completionTokens += completion;
      totals.costUsd += cost;
      if (!priced) totals.unpricedTokens += prompt + completion;
    }
  }

  return {
    totals,
    byModel: [...rows.values()].sort((a, b) => b.promptTokens + b.completionTokens - (a.promptTokens + a.completionTokens)),
    byDay: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function formatUsd(n: number): string {
  if (n === 0) return "$0.00";
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}
