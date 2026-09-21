import { describe, it, expect, beforeEach } from "vitest";
import {
  acquireOllamaSlot,
  releaseOllamaSlot,
  resetOllamaQueue,
  getOllamaQueueStats,
} from "../lib/ollamaRateLimit";

describe("Ollama Concurrency & VRAM Queue Semaphore", () => {
  beforeEach(() => {
    resetOllamaQueue();
  });

  it("grants immediate slot when system is idle", async () => {
    const slot = await acquireOllamaSlot("chat");
    expect(slot.allowed).toBe(true);

    const stats = getOllamaQueueStats();
    expect(stats.activeGenerations).toBe(1);
    expect(stats.queueLength).toBe(0);

    releaseOllamaSlot("chat");
    expect(getOllamaQueueStats().activeGenerations).toBe(0);
  });

  it("queues embedding requests while chat generation is active to prevent VRAM swap-thrash", async () => {
    // 1. Chat starts generating
    const chatSlot = await acquireOllamaSlot("chat");
    expect(chatSlot.allowed).toBe(true);

    // 2. Embedding arrives while chat is running
    let embeddingResolved = false;
    const embedPromise = acquireOllamaSlot("embed", { timeoutMs: 5000 }).then((res) => {
      embeddingResolved = true;
      return res;
    });

    // Embedding should be waiting in queue
    expect(embeddingResolved).toBe(false);
    expect(getOllamaQueueStats().queueLength).toBe(1);
    expect(getOllamaQueueStats().activeGenerations).toBe(1);
    expect(getOllamaQueueStats().activeEmbeddings).toBe(0);

    // 3. Chat generation finishes
    releaseOllamaSlot("chat");

    // Embedding slot should now be granted
    const embedSlot = await embedPromise;
    expect(embedSlot.allowed).toBe(true);
    expect(embeddingResolved).toBe(true);
    expect(getOllamaQueueStats().activeEmbeddings).toBe(1);
    expect(getOllamaQueueStats().queueLength).toBe(0);

    releaseOllamaSlot("embed");
    expect(getOllamaQueueStats().activeEmbeddings).toBe(0);
  });

  it("times out cleanly if queued request exceeds queue timeout", async () => {
    // Acquire active generation
    await acquireOllamaSlot("chat");

    // Second chat request with short 50ms timeout
    const secondChat = await acquireOllamaSlot("chat", { timeoutMs: 50 });
    expect(secondChat.allowed).toBe(false);
    expect(secondChat.reason).toContain("queue timeout");

    releaseOllamaSlot("chat");
  });
});
