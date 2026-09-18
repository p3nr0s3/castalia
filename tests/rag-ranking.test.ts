import { describe, it, expect, beforeEach } from "vitest";
import { rankChunksBM25, clearTokenCache } from "../lib/rag";
import type { DocumentChunk } from "../lib/rag";

function makeChunk(id: string, fileName: string, text: string): DocumentChunk {
  return {
    id,
    fileName,
    fileId: fileName,
    chunkIndex: 0,
    totalChunks: 1,
    text,
    charCount: text.length,
    estimatedTokens: Math.ceil(text.length / 3.8),
    preview: text.slice(0, 30),
  };
}

beforeEach(() => clearTokenCache());

describe("filename bonus scaling", () => {
  it("does not let a filename match outrank far more relevant content on a short query", () => {
    // The old implementation added a flat +2.5 per matching query token.
    // On a single-token query, content scores top out low enough that the
    // flat bonus alone decided the ranking — a file merely *named* after
    // the term beat a chunk that actually discussed it at length.
    const chunks = [
      makeChunk("named", "database.md", "unrelated filler content about gardening and weather patterns"),
      makeChunk("substantive", "notes.md", "database database database tuning and database replication internals"),
    ];

    const ranked = rankChunksBM25(chunks, "database", 5);
    expect(ranked[0].id).toBe("substantive");
  });

  it("still lets a filename match break a near-tie in its favor", () => {
    const chunks = [
      makeChunk("plain", "misc.md", "schema migration notes here"),
      makeChunk("named", "schema.md", "schema migration notes here"),
    ];

    const ranked = rankChunksBM25(chunks, "schema migration", 5);
    expect(ranked[0].id).toBe("named");
  });

  it("never manufactures relevance from a filename alone when no content matches", () => {
    // A filename-only hit with zero content signal should not surface a
    // chunk — retrieval genuinely found nothing, and rankChunksBM25
    // returns [] rather than padding context with irrelevant text.
    const chunks = [
      makeChunk("named-only", "kubernetes.md", "this file discusses baking sourdough bread at home"),
    ];

    const ranked = rankChunksBM25(chunks, "kubernetes", 5);
    expect(ranked).toEqual([]);
  });

  it("scales the bonus by how much of the query the filename covers", () => {
    // Partial filename coverage should be worth less than full coverage,
    // all else equal.
    const base = "alpha beta gamma delta content body text";
    const chunks = [
      makeChunk("full", "alpha-beta.md", base),
      makeChunk("partial", "alpha-only.md", base),
    ];

    const ranked = rankChunksBM25(chunks, "alpha beta", 5);
    const full = ranked.find((c) => c.id === "full")!;
    const partial = ranked.find((c) => c.id === "partial")!;
    expect(full.score).toBeGreaterThan(partial.score);
  });
});

describe("BM25 correctness with cached term frequencies", () => {
  it("ranks by term frequency saturation, not raw count", () => {
    const chunks = [
      makeChunk("once", "a.md", "retrieval happens here with plenty of other surrounding words to pad length"),
      makeChunk("many", "b.md", "retrieval retrieval retrieval retrieval with other surrounding words to pad length"),
    ];

    const ranked = rankChunksBM25(chunks, "retrieval", 5);
    expect(ranked[0].id).toBe("many");
    // Saturation means 4x the term count must NOT yield 4x the score.
    const many = ranked.find((c) => c.id === "many")!;
    const once = ranked.find((c) => c.id === "once")!;
    expect(many.score).toBeLessThan(once.score * 4);
  });

  it("weights rare terms above common ones via IDF", () => {
    const chunks = [
      makeChunk("c1", "a.md", "common common common rareterm padding words here"),
      makeChunk("c2", "b.md", "common common common padding words here also"),
      makeChunk("c3", "c.md", "common common common more padding words here"),
    ];

    // "rareterm" appears in 1 of 3 chunks, "common" in all 3 — the chunk
    // holding the rare term must win on a query containing both.
    const ranked = rankChunksBM25(chunks, "common rareterm", 5);
    expect(ranked[0].id).toBe("c1");
  });

  it("produces identical scores on a repeated call (cache is not corrupting state)", () => {
    const chunks = [
      makeChunk("a", "a.md", "vector index tuning and shard rebalancing notes"),
      makeChunk("b", "b.md", "vector similarity search over embedded documents"),
    ];

    const first = rankChunksBM25(chunks, "vector index", 5);
    const second = rankChunksBM25(chunks, "vector index", 5);

    expect(second.map((c) => c.id)).toEqual(first.map((c) => c.id));
    expect(second.map((c) => c.score)).toEqual(first.map((c) => c.score));
  });
});
