import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getCachedFileChunks,
  clearChunkCache,
  chunkDocument,
  rankChunksHybrid,
  buildOptimizedKnowledgeContextAsync,
  DocumentChunk,
} from "../lib/rag";
import { clearEmbeddingCache } from "../lib/embeddings";
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

describe("Pre-Indexed DocumentChunk Cache (getCachedFileChunks)", () => {
  beforeEach(() => {
    clearChunkCache();
  });

  it("returns identical chunks to chunkDocument", () => {
    const file: ProjectFile = {
      id: "f1",
      name: "example.ts",
      textContent: "export function hello() {\n  return 'world';\n}\n\nexport function goodbye() {\n  return 'bye';\n}",
      size: 100,
      type: "document",
      uploadedAt: Date.now(),
    };

    const uncached = chunkDocument(file, 50, 10);
    const cached = getCachedFileChunks(file, 50, 10);

    expect(cached).toEqual(uncached);
    expect(cached.length).toBe(uncached.length);
  });

  it("serves repeated requests from memory cache", () => {
    const file: ProjectFile = {
      id: "f2",
      name: "data.txt",
      textContent: "Alpha line\n\nBeta line\n\nGamma line",
      size: 50,
      type: "document",
      uploadedAt: Date.now(),
    };

    const first = getCachedFileChunks(file);
    const second = getCachedFileChunks(file);

    expect(first).toEqual(second);
  });

  it("automatically invalidates and re-chunks when file textContent changes", () => {
    const file: ProjectFile = {
      id: "f3",
      name: "notes.md",
      textContent: "Initial content",
      size: 15,
      type: "document",
      uploadedAt: Date.now(),
    };

    const first = getCachedFileChunks(file);
    expect(first[0].text).toBe("Initial content");

    const modifiedFile: ProjectFile = {
      ...file,
      textContent: "Updated new content",
    };

    const second = getCachedFileChunks(modifiedFile);
    expect(second[0].text).toBe("Updated new content");
  });

  it("re-chunks when chunk size or overlap parameters change", () => {
    const file: ProjectFile = {
      id: "f4",
      name: "long.md",
      textContent: "Paragraph 1\n\nParagraph 2\n\nParagraph 3\n\nParagraph 4",
      size: 100,
      type: "document",
      uploadedAt: Date.now(),
    };

    const largeChunks = getCachedFileChunks(file, 1000, 50);
    const smallChunks = getCachedFileChunks(file, 20, 5);

    expect(smallChunks.length).toBeGreaterThan(largeChunks.length);
  });

  it("clearChunkCache empties the cache", () => {
    const file: ProjectFile = {
      id: "f5",
      name: "file.md",
      textContent: "Content line",
      size: 20,
      type: "document",
      uploadedAt: Date.now(),
    };

    getCachedFileChunks(file);
    clearChunkCache();
    const fresh = getCachedFileChunks(file);
    expect(fresh[0].text).toBe("Content line");
  });
});

describe("Reciprocal Rank Fusion (RRF) in rankChunksHybrid", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearEmbeddingCache();
    clearChunkCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("assigns the highest RRF score (1.0) to a chunk that is rank 1 in both lexical and semantic search", async () => {
    const embeddingsByText: Record<string, number[]> = {
      "distributed consensus": [1, 0, 0],
      "Raft distributed consensus algorithm": [1, 0, 0],
      "Paxos algorithm overview": [0.8, 0.2, 0],
    };

    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      const embedding = embeddingsByText[body.prompt] || [0, 0, 1];
      return { ok: true, json: async () => ({ embedding }) } as Response;
    });

    const chunks = [
      makeChunk("raft", "Raft distributed consensus algorithm"),
      makeChunk("paxos", "Paxos algorithm overview"),
    ];

    const ranked = await rankChunksHybrid(chunks, "distributed consensus", 2, {
      ollamaUrl: "http://localhost:11434",
    });

    expect(ranked[0].id).toBe("raft");
    // Under normalized RRF, rank 1 in both BM25 and semantic yields (k+1)*(w_bm25/(k+1) + w_sem/(k+1)) = 1.0
    expect(ranked[0].score).toBeCloseTo(1.0, 5);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("resists keyword stuffing distortions by fusing based on ordinal rank rather than score spikes", async () => {
    // Chunk A is semantically exact match (rank 1 semantic), with normal keyword presence (rank 2 BM25).
    // Chunk B has extreme keyword stuffing (repeated 6x to maximize raw BM25 score).
    const embeddingsByText: Record<string, number[]> = {
      "neural network training": [1, 0, 0],
      "neural network deep learning backpropagation and optimization": [0.95, 0.05, 0],
      "training training training training training training network network": [0.1, 0.9, 0],
    };

    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      const embedding = embeddingsByText[body.prompt] || [0, 0, 1];
      return { ok: true, json: async () => ({ embedding }) } as Response;
    });

    const chunks = [
      makeChunk("sem-prime", "neural network deep learning backpropagation and optimization"),
      makeChunk("kw-stuffed", "training training training training training training network network"),
    ];

    // With semantic weight leading (0.6 > 0.4), RRF rank position ensures sem-prime wins
    // regardless of how high kw-stuffed's raw BM25 score spiked.
    const ranked = await rankChunksHybrid(chunks, "neural network training", 2, {
      ollamaUrl: "http://localhost:11434",
      semanticWeight: 0.6,
      rrfK: 60,
    });

    expect(ranked[0].id).toBe("sem-prime");
    expect(ranked[1].id).toBe("kw-stuffed");
  });

  it("strictly honors semanticWeight: 0 (pure lexical BM25 ranking)", async () => {
    const embeddingsByText: Record<string, number[]> = {
      "database replication": [1, 0, 0],
      "semantically similar text": [0.99, 0.01, 0],
      "database replication exact keyword match": [0.1, 0.9, 0],
    };

    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      const embedding = embeddingsByText[body.prompt] || [0, 0, 1];
      return { ok: true, json: async () => ({ embedding }) } as Response;
    });

    const chunks = [
      makeChunk("sem", "semantically similar text"),
      makeChunk("kw", "database replication exact keyword match"),
    ];

    const ranked = await rankChunksHybrid(chunks, "database replication", 2, {
      ollamaUrl: "http://localhost:11434",
      semanticWeight: 0,
    });

    expect(ranked[0].id).toBe("kw");
  });

  it("strictly honors semanticWeight: 1 (pure dense semantic ranking)", async () => {
    const embeddingsByText: Record<string, number[]> = {
      "database replication": [1, 0, 0],
      "semantically similar text": [0.99, 0.01, 0],
      "database replication exact keyword match": [0.1, 0.9, 0],
    };

    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      const embedding = embeddingsByText[body.prompt] || [0, 0, 1];
      return { ok: true, json: async () => ({ embedding }) } as Response;
    });

    const chunks = [
      makeChunk("sem", "semantically similar text"),
      makeChunk("kw", "database replication exact keyword match"),
    ];

    const ranked = await rankChunksHybrid(chunks, "database replication", 2, {
      ollamaUrl: "http://localhost:11434",
      semanticWeight: 1,
    });

    expect(ranked[0].id).toBe("sem");
  });

  it("respects custom rrfK parameter", async () => {
    const embeddingsByText: Record<string, number[]> = {
      "query": [1, 0, 0],
      "doc1": [0.9, 0.1, 0],
      "doc2": [0.5, 0.5, 0],
    };

    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      const embedding = embeddingsByText[body.prompt] || [0, 0, 1];
      return { ok: true, json: async () => ({ embedding }) } as Response;
    });

    const chunks = [
      makeChunk("doc1", "doc1 text query"),
      makeChunk("doc2", "doc2 text"),
    ];

    const rankedK20 = await rankChunksHybrid(chunks, "query", 2, {
      ollamaUrl: "http://localhost:11434",
      rrfK: 20,
    });

    const rankedK60 = await rankChunksHybrid(chunks, "query", 2, {
      ollamaUrl: "http://localhost:11434",
      rrfK: 60,
    });

    expect(rankedK20[0].id).toBe("doc1");
    expect(rankedK60[0].id).toBe("doc1");
    // With different k, the second rank's normalized score ratio varies:
    // With k=20: (20+1)/(20+2) = 21/22 ≈ 0.9545
    // With k=60: (60+1)/(60+2) = 61/62 ≈ 0.9838
    expect(rankedK20[1].score).not.toEqual(rankedK60[1].score);
  });
});
