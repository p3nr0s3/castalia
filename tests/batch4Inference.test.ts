import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getFamilyContextLimit,
  resolveEffectiveNumCtxSync,
  resolveEffectiveNumCtx,
} from "../lib/ollama";
import {
  cosineSimilarity,
  findSemanticCachedResponseSync,
  setCachedPromptResponse,
  clearPromptCache,
} from "../lib/responseCache";
import { createStreamThrottler } from "../lib/streamThrottler";

describe("Batch 4: Model Context Resolution & Sizing", () => {
  it("determines correct architecture context limits from model names", () => {
    expect(getFamilyContextLimit("llama3.1:8b")).toBe(131072);
    expect(getFamilyContextLimit("qwen2.5-coder:14b")).toBe(131072);
    expect(getFamilyContextLimit("qwq:32b")).toBe(131072);
    expect(getFamilyContextLimit("deepseek-r1:14b")).toBe(65536);
    expect(getFamilyContextLimit("mistral:7b")).toBe(32768);
    expect(getFamilyContextLimit("gemma2:9b")).toBe(8192);
    expect(getFamilyContextLimit("unknown-experimental-model")).toBe(16384);
  });

  it("prioritizes explicit user numCtx setting over family defaults", async () => {
    const syncRes = resolveEffectiveNumCtxSync("llama3.1:8b", 8192);
    expect(syncRes).toBe(8192);

    const asyncRes = await resolveEffectiveNumCtx("qwen2.5:7b", 4096);
    expect(asyncRes).toBe(4096);
  });

  it("bounds context window to safe VRAM ceiling when no explicit override is provided", async () => {
    // 131072 native capability bounded by 32768 safe local VRAM ceiling
    const syncRes = resolveEffectiveNumCtxSync("llama3.1:8b", undefined, "http://localhost:11434", 32768);
    expect(syncRes).toBe(32768);

    const gemmaRes = resolveEffectiveNumCtxSync("gemma2:2b", undefined, "http://localhost:11434", 32768);
    expect(gemmaRes).toBe(8192);
  });
});

describe("Batch 4: Semantic Response Caching", () => {
  beforeEach(() => {
    clearPromptCache();
  });

  it("calculates exact cosine similarity between numeric vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1.0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
  });

  it("finds cached responses via semantic vector similarity above threshold", () => {
    setCachedPromptResponse("key_test_1", {
      content: "Docker installation instructions on Ubuntu...",
      model: "llama3.1:8b",
      embedding: [0.95, 0.05, 0.1],
    });

    // Query with nearly identical embedding (similarity > 0.99)
    const match = findSemanticCachedResponseSync({
      model: "llama3.1:8b",
      queryEmbedding: [0.94, 0.06, 0.11],
      similarityThreshold: 0.96,
    });

    expect(match).not.toBeNull();
    expect(match?.content).toContain("Docker installation");
  });

  it("misses semantic cache when similarity is below threshold or model differs", () => {
    setCachedPromptResponse("key_test_2", {
      content: "Python QuickSort algorithm...",
      model: "llama3.1:8b",
      embedding: [1, 0, 0],
    });

    // Orthogonal query (similarity ~ 0)
    const lowSimMatch = findSemanticCachedResponseSync({
      model: "llama3.1:8b",
      queryEmbedding: [0, 1, 0],
      similarityThreshold: 0.96,
    });
    expect(lowSimMatch).toBeNull();

    // Matching embedding but different model
    const diffModelMatch = findSemanticCachedResponseSync({
      model: "qwen2.5:7b",
      queryEmbedding: [1, 0, 0],
      similarityThreshold: 0.96,
    });
    expect(diffModelMatch).toBeNull();
  });
});

describe("Batch 4: Stream Render Throttling", () => {
  it("batches high-frequency token updates and flushes immediately on finish", () => {
    vi.useFakeTimers();
    try {
      const emitted: string[] = [];
      const throttler = createStreamThrottler((text) => {
        emitted.push(text);
      }, 20);

      throttler.push("H");
      throttler.push("He");
      throttler.push("Hel");
      throttler.push("Hell");
      throttler.push("Hello");

      // Before timer fires, callback not yet invoked
      expect(emitted.length).toBe(0);

      // Fast-forward timer by 25ms
      vi.advanceTimersByTime(25);
      expect(emitted).toEqual(["Hello"]);

      // Next chunk with explicit flush (stream onFinish)
      throttler.push("Hello World!");
      throttler.flush();
      expect(emitted).toEqual(["Hello", "Hello World!"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
