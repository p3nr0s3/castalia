import { describe, it, expect } from "vitest";
import { aggregateUsage, formatTokens, formatUsd } from "../lib/usageTracker";
import type { Conversation, Message } from "../lib/types";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const asst = (model: string, p: number | undefined, c: number | undefined, ts: number): Message =>
  ({ id: Math.random().toString(36), role: "assistant", content: "x", timestamp: ts, model, metrics: { promptEvalCount: p, evalCount: c } }) as any;
const conv = (messages: Message[], model = "llama3.1:8b"): Conversation => ({ id: "c", title: "t", messages, createdAt: 0, updatedAt: 0, model }) as any;

describe("aggregateUsage", () => {
  it("sums tokens per model and splits local (free) from cloud", () => {
    const r = aggregateUsage([conv([asst("llama3.1:8b", 100, 50, at(2026, 10, 1)), asst("gpt-4o", 1000, 500, at(2026, 10, 1)), asst("gpt-4o", 2000, 100, at(2026, 10, 2))])]);
    expect(r.totals).toMatchObject({ messages: 3, promptTokens: 3100, completionTokens: 650 });
    const gpt = r.byModel.find((m) => m.model === "gpt-4o")!;
    expect(gpt).toMatchObject({ messages: 2, promptTokens: 3000, completionTokens: 600, isLocal: false, costUsd: null });
    expect(r.byModel.find((m) => m.model === "llama3.1:8b")).toMatchObject({ isLocal: true, costUsd: 0 });
    expect(r.byModel[0].model).toBe("gpt-4o"); // biggest first
  });

  it("prices only models the user gave a price for, and reports what could not be priced", () => {
    const msgs = [asst("gpt-4o", 1_000_000, 500_000, at(2026, 10, 1)), asst("claude-sonnet-5-5", 1000, 1000, at(2026, 10, 1))];
    const r = aggregateUsage([conv(msgs)], { pricing: { "gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10 } } });
    expect(r.byModel.find((m) => m.model === "gpt-4o")!.costUsd).toBeCloseTo(2.5 + 5, 6);
    expect(r.byModel.find((m) => m.model === "claude-sonnet-5-5")!.costUsd).toBeNull();
    expect(r.totals.costUsd).toBeCloseTo(7.5, 6);
    expect(r.totals.unpricedTokens).toBe(2000);
  });

  it("ignores user messages, messages without metrics, and garbage prices", () => {
    const user = { id: "u", role: "user", content: "hi", timestamp: 1, metrics: { evalCount: 999 } } as any;
    const r = aggregateUsage([conv([user, asst("gpt-4o", undefined, undefined, 1), asst("gpt-4o", 10, 10, 1)])], {
      pricing: { "gpt-4o": { inputPerMTok: NaN, outputPerMTok: -1 } as any },
    });
    expect(r.totals.messages).toBe(1);
    expect(r.byModel[0].costUsd).toBeNull();
  });

  it("filters by date range and groups by local day in order", () => {
    const msgs = [asst("gpt-4o", 10, 10, at(2026, 9, 30)), asst("gpt-4o", 20, 20, at(2026, 10, 2)), asst("gpt-4o", 30, 30, at(2026, 10, 1))];
    const all = aggregateUsage([conv(msgs)]);
    expect(all.byDay.map((d) => d.day)).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
    const recent = aggregateUsage([conv(msgs)], { sinceMs: at(2026, 10, 1, 0), untilMs: at(2026, 10, 1, 23) });
    expect(recent.totals.promptTokens).toBe(30);
  });

  it("falls back to the conversation model and to 'unknown'", () => {
    const noModel = { id: "m", role: "assistant", content: "", timestamp: 1, metrics: { evalCount: 5 } } as any;
    expect(aggregateUsage([conv([noModel], "gemini-2.5-flash")]).byModel[0].model).toBe("gemini-2.5-flash");
    expect(aggregateUsage([{ ...conv([noModel]), model: undefined } as any]).byModel[0].model).toBe("unknown");
  });

  it("handles empty input", () => {
    expect(aggregateUsage([])).toEqual({ totals: { messages: 0, promptTokens: 0, completionTokens: 0, costUsd: 0, unpricedTokens: 0 }, byModel: [], byDay: [] });
  });
});

describe("formatting", () => {
  it("formats tokens and dollars compactly", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(12_400)).toBe("12.4k");
    expect(formatTokens(2_500_000)).toBe("2.50M");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(12.3456)).toBe("$12.35");
  });
});

// UI: the tab renders real stored usage and saves typed prices into the settings form.
