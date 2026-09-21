import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { embedTexts, embedOne, clearEmbeddingCache, getEmbeddingCacheKeys } from "../lib/embeddings";

describe("lib/embeddings batching & LRU cache", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearEmbeddingCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("calls batch /api/embed once when uncached texts are supplied", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init: any) => {
      if (url.endsWith("/api/embed")) {
        const body = JSON.parse(init.body);
        expect(body.input).toEqual(["apple", "banana", "cherry"]);
        return {
          ok: true,
          json: async () => ({
            model: body.model,
            embeddings: [
              [0.1, 0.2],
              [0.3, 0.4],
              [0.5, 0.6],
            ],
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    global.fetch = fetchMock;

    const res = await embedTexts(["apple", "banana", "cherry"], {
      ollamaUrl: "http://localhost:11434",
      model: "nomic-embed-text",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
      [0.5, 0.6],
    ]);
  });

  it("serves subsequent repeated requests directly from LRU cache without hitting fetch", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          model: body.model,
          embeddings: [[0.1, 0.2]],
        }),
      } as Response;
    });

    global.fetch = fetchMock;

    // First call: hits fetch
    const res1 = await embedTexts(["item1"], { ollamaUrl: "http://localhost:11434" });
    expect(res1[0]).toEqual([0.1, 0.2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call: cached
    const res2 = await embedTexts(["item1"], { ollamaUrl: "http://localhost:11434" });
    expect(res2[0]).toEqual([0.1, 0.2]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // No new network call
  });

  it("touches entry on read so most recently read items move to the end of the LRU map", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      callCount++;
      const body = JSON.parse(init.body);
      const inputs = body.input || [body.prompt];
      return {
        ok: true,
        json: async () => ({
          embeddings: inputs.map((_: any, i: number) => [i + callCount]),
        }),
      } as Response;
    });

    // Populate item A, B, C
    await embedTexts(["A", "B", "C"], { ollamaUrl: "http://localhost:11434" });

    // Initial order of keys
    const keysBefore = getEmbeddingCacheKeys();
    expect(keysBefore).toHaveLength(3);
    const [keyA, keyB, keyC] = keysBefore;

    // Touch item A via read
    await embedTexts(["A"], { ollamaUrl: "http://localhost:11434" });

    // A should now be at the end (most recently used), leaving B as oldest
    const keysAfter = getEmbeddingCacheKeys();
    expect(keysAfter).toEqual([keyB, keyC, keyA]);
  });

  it("falls back to individual /api/embeddings if /api/embed returns 404", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init: any) => {
      if (url.endsWith("/api/embed")) {
        return { ok: false, status: 404 } as Response;
      }
      if (url.endsWith("/api/embeddings")) {
        const body = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            embedding: [body.prompt.length],
          }),
        } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    global.fetch = fetchMock;

    const res = await embedTexts(["cat", "dog"], {
      ollamaUrl: "http://localhost:11434",
    });

    expect(res).toEqual([[3], [3]]);
    // 1 attempt to /api/embed + 2 fallback calls to /api/embeddings
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
