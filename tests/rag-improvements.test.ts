import { describe, it, expect } from "vitest";
import {
  buildRetrievalQuery,
  rankChunksBM25,
  buildOptimizedKnowledgeContext,
  buildOptimizedKnowledgeContextAsync,
  tokenizeText,
  clearTokenCache,
} from "../lib/rag";
import type { DocumentChunk } from "../lib/rag";
import type { Message, ProjectFile } from "../lib/types";

function makeChunk(id: string, fileId: string, fileName: string, text: string): DocumentChunk {
  return {
    id,
    fileName,
    fileId,
    chunkIndex: 0,
    totalChunks: 1,
    text,
    charCount: text.length,
    estimatedTokens: Math.ceil(text.length / 3.8),
    preview: text.slice(0, 30),
  };
}

function msg(role: "user" | "assistant", content: string): Message {
  return { id: Math.random().toString(), role, content, timestamp: Date.now() };
}

describe("buildRetrievalQuery — multi-turn query expansion", () => {
  it("returns the query unchanged when there's no prior history", () => {
    expect(buildRetrievalQuery("how do I use it?", [])).toBe("how do I use it?");
    expect(buildRetrievalQuery("how do I use it?", undefined)).toBe("how do I use it?");
  });

  it("prepends recent user turns so a pronoun-only follow-up carries real keywords", () => {
    const history: Message[] = [
      msg("user", "tell me about the rigid body physics setup in Blender"),
      msg("assistant", "Sure, here's how it works..."),
      msg("user", "how do I use it?"), // current turn, last in the array
    ];

    const expanded = buildRetrievalQuery("how do I use it?", history);

    expect(expanded).toContain("rigid body physics");
    expect(expanded).toContain("how do I use it?");
    // current query stays last so exact-match/filename-bonus scoring still
    // favors what was actually just asked
    expect(expanded.endsWith("how do I use it?")).toBe(true);
  });

  it("only looks back the configured number of prior user turns", () => {
    const history: Message[] = [
      msg("user", "topic alpha unique keyword ALPHAMARK"),
      msg("assistant", "..."),
      msg("user", "topic beta unique keyword BETAMARK"),
      msg("assistant", "..."),
      msg("user", "topic gamma unique keyword GAMMAMARK"),
      msg("assistant", "..."),
      msg("user", "current question"),
    ];

    const expanded = buildRetrievalQuery("current question", history, 2);

    expect(expanded).not.toContain("ALPHAMARK");
    expect(expanded).toContain("BETAMARK");
    expect(expanded).toContain("GAMMAMARK");
  });

  it("measurably improves retrieval for a pronoun-only follow-up", () => {
    const chunks = [
      makeChunk("a", "f1", "blender.md", "Rigid body physics setup and collision shapes in Blender"),
      makeChunk("b", "f2", "taxes.md", "Completely unrelated content about annual tax filing"),
    ];

    // Without expansion: a pronoun-only query has no keywords to match on.
    const withoutExpansion = rankChunksBM25(chunks, "how do I use it?", 5);
    expect(withoutExpansion).toEqual([]);

    // With expansion: the prior turn's topic carries the query.
    const history: Message[] = [
      msg("user", "tell me about rigid body physics in blender"),
      msg("assistant", "..."),
      msg("user", "how do I use it?"),
    ];
    const expandedQuery = buildRetrievalQuery("how do I use it?", history);
    const withExpansion = rankChunksBM25(chunks, expandedQuery, 5);

    expect(withExpansion.length).toBeGreaterThan(0);
    expect(withExpansion[0].id).toBe("a");
  });
});

describe("tokenizeText caching — rankChunksBM25 correctness under repeated calls", () => {
  it("returns identical, correct results across repeated calls with the same chunk content", () => {
    clearTokenCache();
    const chunks = [
      makeChunk("a", "f1", "doc.md", "Blender rigid body physics"),
      makeChunk("b", "f1", "doc.md", "Completely unrelated tax content"),
    ];

    const first = rankChunksBM25(chunks, "blender physics", 5);
    const second = rankChunksBM25(chunks, "blender physics", 5);

    expect(first.map((c) => c.id)).toEqual(second.map((c) => c.id));
    expect(first[0].score).toBeCloseTo(second[0].score, 10);
  });

  it("does not confuse two different chunks that happen to share a text hash bucket boundary (length+hash sanity)", () => {
    clearTokenCache();
    const chunks = [
      makeChunk("a", "f1", "doc.md", "alpha keyword content one"),
      makeChunk("b", "f2", "doc2.md", "beta keyword content two"),
    ];

    const ranked = rankChunksBM25(chunks, "alpha", 5);
    expect(ranked.length).toBe(1);
    expect(ranked[0].id).toBe("a");
  });
});

describe("assembleContextFromRanked (via buildOptimizedKnowledgeContextAsync) — per-file diversity cap", () => {
  it("doesn't let a single file's chunks occupy every selected slot when other files also match", async () => {
    // Small chunkSizeChars + a large topK forces every file's chunks into
    // the final selection pool, so this isolates the diversity-cap logic
    // in assembleContextFromRanked from BM25's own top-K pre-filtering.
    const dominantParagraphs = Array.from(
      { length: 12 },
      (_, i) => `Blender physics paragraph ${i} about collision shapes.`
    ).join("\n\n");

    const files: ProjectFile[] = [
      { id: "dominant", name: "dominant.md", textContent: dominantParagraphs, size: 5000, type: "document" } as ProjectFile,
      { id: "other1", name: "other1.md", textContent: "Blender physics note about mass settings and tuning for accuracy.", size: 200, type: "document" } as ProjectFile,
      { id: "other2", name: "other2.md", textContent: "Blender physics note about damping settings and tuning for accuracy.", size: 200, type: "document" } as ProjectFile,
    ];

    const result = await buildOptimizedKnowledgeContextAsync(
      files,
      "blender physics",
      100,
      { ollamaUrl: "http://x", enabled: false },
      { chunkSizeChars: 60, chunkOverlapChars: 10, topK: 20 }
    );

    expect(result.isChunked).toBe(true);
    const filesRepresented = new Set(result.retrievedChunks?.map((c) => c.fileName));
    // Both smaller files should have made it into the final selection,
    // not just the dominant one.
    expect(filesRepresented.has("other1.md")).toBe(true);
    expect(filesRepresented.has("other2.md")).toBe(true);
  });

  it("still fills the full budget from one file when it's genuinely the only relevant one", async () => {
    const dominantParagraphs = Array.from(
      { length: 12 },
      (_, i) => `Blender physics paragraph ${i} about collision shapes.`
    ).join("\n\n");

    const files: ProjectFile[] = [
      { id: "dominant", name: "dominant.md", textContent: dominantParagraphs, size: 5000, type: "document" } as ProjectFile,
      { id: "unrelated", name: "unrelated.md", textContent: "Completely unrelated tax filing content and reporting.", size: 200, type: "document" } as ProjectFile,
    ];

    const result = await buildOptimizedKnowledgeContextAsync(
      files,
      "blender physics collision",
      100,
      { ollamaUrl: "http://x", enabled: false },
      { chunkSizeChars: 60, chunkOverlapChars: 10, topK: 20 }
    );

    expect(result.isChunked).toBe(true);
    expect(result.matchedChunksCount).toBeGreaterThan(3);
    const filesRepresented = new Set(result.retrievedChunks?.map((c) => c.fileName));
    expect(filesRepresented.has("dominant.md")).toBe(true);
    expect(filesRepresented.has("unrelated.md")).toBe(false);
  });
});
