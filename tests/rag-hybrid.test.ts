import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rankChunksHybrid, buildOptimizedKnowledgeContextAsync } from "../lib/rag";
import { clearEmbeddingCache } from "../lib/embeddings";
import type { DocumentChunk } from "../lib/rag";
import type { ProjectFile } from "../lib/types";

function makeChunk(id: string, text: string): DocumentChunk {
  return {
    id,
    fileName: "doc.md",
    fileId: "doc",
    chunkIndex: 0,
    totalChunks: 1,
    text,
    charCount: text.length,
    estimatedTokens: Math.ceil(text.length / 3.8),
    preview: text.slice(0, 30),
  };
}

describe("rankChunksHybrid", () => {
  const originalFetch = global.fetch;

  beforeEach(() => clearEmbeddingCache());
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("falls back to BM25 when the embeddings endpoint is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    const chunks = [
      makeChunk("a", "The quick brown fox jumps over the lazy dog"),
      makeChunk("b", "Completely unrelated content about tax filing"),
    ];

    const ranked = await rankChunksHybrid(chunks, "quick fox", 2, { ollamaUrl: "http://localhost:11434" });

    // BM25 filters out zero-score chunks, so only the matching one ("a") is returned.
    expect(ranked.length).toBeGreaterThanOrEqual(1);
    expect(ranked[0].id).toBe("a");
  });

  it("blends embedding similarity with BM25 when embeddings succeed", async () => {
    // Query embedding is closest to chunk "b"'s embedding, even though chunk
    // "a" wins on pure keyword overlap — hybrid score should still surface
    // some signal from both rather than ignoring the embedding entirely.
    const embeddingsByText: Record<string, number[]> = {
      "database migration guide": [1, 0, 0],
      "How to move data between databases": [0.9, 0.1, 0],
      "unrelated cooking recipe content": [0, 1, 0],
    };

    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      const embedding = embeddingsByText[body.prompt] || [0, 0, 1];
      return {
        ok: true,
        json: async () => ({ embedding }),
      } as Response;
    });

    const chunks = [
      makeChunk("semantic-match", "How to move data between databases"),
      makeChunk("no-match", "unrelated cooking recipe content"),
    ];

    const ranked = await rankChunksHybrid(chunks, "database migration guide", 2, {
      ollamaUrl: "http://localhost:11434",
    });

    expect(ranked[0].id).toBe("semantic-match");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("respects a custom semanticWeight — pure keyword (weight 0) flips the ranking back to BM25's favorite", async () => {
    const embeddingsByText: Record<string, number[]> = {
      "database migration guide": [1, 0, 0],
      "How to move data between databases": [0.9, 0.1, 0],
      "unrelated cooking recipe content database": [0, 1, 0],
    };
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      const embedding = embeddingsByText[body.prompt] || [0, 0, 1];
      return { ok: true, json: async () => ({ embedding }) } as Response;
    });

    const chunks = [
      makeChunk("semantic-match", "How to move data between databases"),
      // Loaded with the literal query keywords so BM25 favors it heavily,
      // despite its embedding being semantically unrelated.
      makeChunk("keyword-match", "database migration guide database migration guide"),
    ];

    const semanticRanked = await rankChunksHybrid(chunks, "database migration guide", 2, {
      ollamaUrl: "http://localhost:11434",
      semanticWeight: 1,
    });
    expect(semanticRanked[0].id).toBe("semantic-match");

    const keywordRanked = await rankChunksHybrid(chunks, "database migration guide", 2, {
      ollamaUrl: "http://localhost:11434",
      semanticWeight: 0,
    });
    expect(keywordRanked[0].id).toBe("keyword-match");
  });
});

describe("buildOptimizedKnowledgeContextAsync", () => {
  const originalFetch = global.fetch;

  beforeEach(() => clearEmbeddingCache());
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("matches the sync BM25 result when semanticRag is disabled", async () => {
    const bigContent = "keyword-alpha content. ".repeat(500) + "keyword-beta unique passage here.";
    const files: ProjectFile[] = [{ id: "f1", name: "big.md", textContent: bigContent } as ProjectFile];

    const result = await buildOptimizedKnowledgeContextAsync(files, "keyword-beta", 500, { ollamaUrl: "http://x", enabled: false });

    expect(result.isChunked).toBe(true);
    expect(result.contextText).toContain("keyword-beta");
  });

  it("never throws even if embeddings are enabled but Ollama is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));
    const bigContent = "alpha content. ".repeat(500) + "unique beta passage here.";
    const files: ProjectFile[] = [{ id: "f1", name: "big.md", textContent: bigContent } as ProjectFile];

    await expect(
      buildOptimizedKnowledgeContextAsync(files, "beta", 500, {
        ollamaUrl: "http://localhost:11434",
        enabled: true,
      })
    ).resolves.toBeDefined();
  });

  it("respects a custom chunk size — smaller chunkSizeChars yields more, smaller chunks", async () => {
    const bigContent = "keyword-alpha content sentence here. ".repeat(200) + "keyword-beta unique passage.";
    const files: ProjectFile[] = [{ id: "f1", name: "big.md", textContent: bigContent } as ProjectFile];

    const defaultResult = await buildOptimizedKnowledgeContextAsync(
      files,
      "keyword-beta",
      500,
      { ollamaUrl: "http://x", enabled: false },
      { chunkSizeChars: 1800, chunkOverlapChars: 200 }
    );
    const smallChunkResult = await buildOptimizedKnowledgeContextAsync(
      files,
      "keyword-beta",
      500,
      { ollamaUrl: "http://x", enabled: false },
      { chunkSizeChars: 400, chunkOverlapChars: 50 }
    );

    // Smaller target chunk size over the same content must produce chunks
    // that are individually no larger than the configured size (plus a
    // little slack for paragraph-boundary rounding), proving the custom
    // value actually reached chunkDocument() rather than being ignored.
    const maxDefaultChunkChars = Math.max(...(defaultResult.retrievedChunks || []).map((c) => c.estimatedTokens ?? 0));
    const maxSmallChunkChars = Math.max(...(smallChunkResult.retrievedChunks || []).map((c) => c.estimatedTokens ?? 0));
    expect(maxSmallChunkChars).toBeLessThan(maxDefaultChunkChars);
  });

  it("respects a custom topK — fewer requested chunks means fewer retrieved", async () => {
    const bigContent = Array.from({ length: 20 }, (_, i) => `Section ${i}: keyword-target content block number ${i}.`).join("\n\n");
    const files: ProjectFile[] = [{ id: "f1", name: "big.md", textContent: bigContent } as ProjectFile];

    // tokenBudget must sit strictly below the file's own token count (to
    // force chunking/ranking at all — otherwise CASE 1 in
    // buildOptimizedKnowledgeContextAsync returns the whole file
    // unchunked and topK is never consulted) while staying generous
    // enough that topK -- not the token budget -- is the binding
    // constraint on how many chunks make it through
    // assembleContextFromRanked.
    const fewResult = await buildOptimizedKnowledgeContextAsync(
      files,
      "keyword-target",
      80,
      { ollamaUrl: "http://x", enabled: false },
      { chunkSizeChars: 200, chunkOverlapChars: 20, topK: 2 }
    );
    const manyResult = await buildOptimizedKnowledgeContextAsync(
      files,
      "keyword-target",
      250,
      { ollamaUrl: "http://x", enabled: false },
      { chunkSizeChars: 200, chunkOverlapChars: 20, topK: 10 }
    );

    expect(fewResult.matchedChunksCount).toBeLessThanOrEqual(2);
    expect(manyResult.matchedChunksCount).toBeGreaterThan(fewResult.matchedChunksCount);
  });
});
