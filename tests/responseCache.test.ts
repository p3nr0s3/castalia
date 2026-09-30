import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  computePromptCacheKey,
  fnv1a64Hex,
  getCachedPromptResponse,
  getCachedPromptResponseSync,
  findSemanticCachedResponse,
  setCachedPromptResponse,
  clearPromptCache,
} from "../lib/responseCache";

describe("fnv1a64Hex (Tier-1 cache key hash)", () => {
  // Published FNV-1a 64-bit test vectors — these prove the implementation is
  // really 64-bit FNV-1a rather than something that merely looks long.
  it("matches the published FNV-1a 64-bit reference vectors", () => {
    expect(fnv1a64Hex("")).toBe("cbf29ce484222325");
    expect(fnv1a64Hex("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64Hex("foobar")).toBe("85944171f73967e8");
  });

  it("always returns exactly 16 hex characters, including for values with leading zeros", () => {
    for (const input of ["", "a", "hello world", "x".repeat(1000), "日本語のプロンプト"]) {
      expect(fnv1a64Hex(input)).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it("is deterministic and sensitive to a single-character change", () => {
    expect(fnv1a64Hex("same input")).toBe(fnv1a64Hex("same input"));
    expect(fnv1a64Hex("same input")).not.toBe(fnv1a64Hex("same inpuT"));
  });
});

describe("responseCache", () => {
  beforeEach(() => {
    clearPromptCache();
  });

  it("produces deterministic keys for identical parameters", () => {
    const key1 = computePromptCacheKey({
      model: "llama3.1",
      prompt: "Explain quantum computing in simple terms",
      systemPrompt: "You are a helpful assistant.",
      temperature: 0.7,
      topP: 0.9,
      numCtx: 16384,
    });

    const key2 = computePromptCacheKey({
      model: "llama3.1",
      prompt: "Explain quantum computing in simple terms",
      systemPrompt: "You are a helpful assistant.",
      temperature: 0.7,
      topP: 0.9,
      numCtx: 16384,
    });

    expect(key1).toBe(key2);
  });

  it("produces different keys when temperature or system prompt changes (cache invalidation)", () => {
    const baseKey = computePromptCacheKey({
      model: "llama3.1",
      prompt: "Explain quantum computing in simple terms",
      systemPrompt: "You are a helpful assistant.",
      temperature: 0.7,
    });

    const differentTempKey = computePromptCacheKey({
      model: "llama3.1",
      prompt: "Explain quantum computing in simple terms",
      systemPrompt: "You are a helpful assistant.",
      temperature: 0.2, // Changed temperature
    });

    const differentSystemKey = computePromptCacheKey({
      model: "llama3.1",
      prompt: "Explain quantum computing in simple terms",
      systemPrompt: "You are a strict physics professor.", // Changed system prompt
      temperature: 0.7,
    });

    expect(baseKey).not.toBe(differentTempKey);
    expect(baseKey).not.toBe(differentSystemKey);
  });

  it("produces a fixed-shape key: pc_ + 16 hex chars", () => {
    const key = computePromptCacheKey({ model: "llama3.1", prompt: "hello" });
    expect(key).toMatch(/^pc_[0-9a-f]{16}$/);
  });

  it("stores, retrieves, and clears cached responses (in-memory fast path)", async () => {
    const key = computePromptCacheKey({
      model: "qwen2.5",
      prompt: "Write a hello world in Rust",
    });

    expect(getCachedPromptResponseSync(key)).toBeNull();
    expect(await getCachedPromptResponse(key)).toBeNull();

    setCachedPromptResponse(key, {
      content: "fn main() { println!(\"Hello, world!\"); }",
      reasoning: "Simple hello world",
      metrics: { evalCount: 15, evalDuration: 500000000, evalTps: 30 },
    });

    // Sync path: the in-memory Map is populated synchronously by
    // setCachedPromptResponse; the fire-and-forget server persist happens
    // independently and is never required for this to pass.
    const cachedSync = getCachedPromptResponseSync(key);
    expect(cachedSync).not.toBeNull();
    expect(cachedSync?.content).toContain("Hello, world!");
    expect(cachedSync?.reasoning).toBe("Simple hello world");
    expect(cachedSync?.servedFromCache).toBe(true);
    expect(cachedSync?.metrics?.evalTps).toBe(30); // NOT fabricated 999
    expect(cachedSync?.metrics?.evalCount).toBe(15);

    // Async path: same entry, served from the in-memory Map (no network
    // call needed since the sync fast path already has it).
    const cachedAsync = await getCachedPromptResponse(key);
    expect(cachedAsync?.content).toContain("Hello, world!");

    clearPromptCache();
    expect(getCachedPromptResponseSync(key)).toBeNull();
    expect(await getCachedPromptResponse(key)).toBeNull();
  });

  describe("server-fallback tier (in-memory Map miss)", () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("getCachedPromptResponse falls back to the server on a memory miss", async () => {
      const key = computePromptCacheKey({ model: "llama3.1", prompt: "server-only entry" });
      const serverTimestamp = Date.now();
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          entry: { key, timestamp: serverTimestamp, data: { content: "from server", model: "llama3.1" } },
        }),
      }) as any;

      const result = await getCachedPromptResponse(key);
      expect(result?.content).toBe("from server");
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/cache?key=${encodeURIComponent(key)}`),
        expect.anything()
      );

      // A hit from the server repopulates the in-memory Map, so a second
      // lookup for the same key doesn't need another network call.
      (global.fetch as any).mockClear();
      const second = getCachedPromptResponseSync(key);
      expect(second?.content).toBe("from server");
    });

    it("getCachedPromptResponse returns null (not a throw) when the server is unreachable", async () => {
      const key = computePromptCacheKey({ model: "llama3.1", prompt: "offline lookup" });
      global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as any;

      await expect(getCachedPromptResponse(key)).resolves.toBeNull();
    });

    it("findSemanticCachedResponse falls back to the server on a memory miss", async () => {
      const embedding = [1, 0, 0];
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          entry: {
            key: "pc_serverhit",
            timestamp: Date.now(),
            data: { content: "semantic server hit", model: "llama3.1" },
          },
        }),
      }) as any;

      const result = await findSemanticCachedResponse({ model: "llama3.1", queryEmbedding: embedding });
      expect(result?.content).toBe("semantic server hit");
      // Must be a POST with the embedding in the BODY: in a query string a real
      // 768-dim vector exceeds the server's header limit (HTTP 431).
      const [url, init] = (global.fetch as any).mock.calls[0];
      expect(String(url)).toContain("/api/cache");
      expect(String(url)).not.toContain("embedding=");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toMatchObject({ action: "semantic-lookup", model: "llama3.1", embedding });
    });

    it("ignores an expired entry returned by the server", async () => {
      const key = computePromptCacheKey({ model: "llama3.1", prompt: "stale server entry" });
      const staleTimestamp = Date.now() - 3 * 60 * 60 * 1000; // 3h ago, beyond the 2h TTL
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          entry: { key, timestamp: staleTimestamp, data: { content: "should be ignored" } },
        }),
      }) as any;

      expect(await getCachedPromptResponse(key)).toBeNull();
    });
  });
});
