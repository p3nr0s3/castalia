import { describe, it, expect } from "vitest";
import { rankChunksBM25, buildOptimizedKnowledgeContext } from "../lib/rag";
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

describe("rankChunksBM25 — no-match behavior", () => {
  it("returns nothing when the query has real keywords but none appear in any chunk", () => {
    const chunks = [
      makeChunk("a", "Blender rigid body physics simulation setup"),
      makeChunk("b", "Ollama embedding model configuration guide"),
    ];

    // "quantum" and "recipe" appear in neither chunk.
    const ranked = rankChunksBM25(chunks, "quantum recipe", 5);

    expect(ranked).toEqual([]);
  });

  it("still returns chunks when at least one keyword matches", () => {
    const chunks = [
      makeChunk("a", "Blender rigid body physics simulation setup"),
      makeChunk("b", "Completely unrelated content about tax filing"),
    ];

    const ranked = rankChunksBM25(chunks, "blender physics", 5);

    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].id).toBe("a");
  });

  it("still returns chunks in original order when the query itself has no distinctive tokens (unchanged behavior)", () => {
    const chunks = [makeChunk("a", "First chunk"), makeChunk("b", "Second chunk")];

    // A query made entirely of stopwords tokenizes to an empty array —
    // this is a different case from "keywords present but no match",
    // and intentionally keeps its existing fallback (first topK, in order).
    const ranked = rankChunksBM25(chunks, "the of and", 5);

    expect(ranked.length).toBe(2);
  });
});

describe("buildOptimizedKnowledgeContext — no-match behavior", () => {
  it("returns an empty context (not a header with nothing under it) when nothing matches", () => {
    const files: ProjectFile[] = [
      {
        id: "f1",
        name: "notes.md",
        // Padded well past the small-file inline-inject threshold so this
        // exercises the chunked/ranked path, not the "inject everything" path.
        textContent: "Blender rigid body physics simulation setup. ".repeat(200),
        size: 1000,
        type: "document",
      } as ProjectFile,
    ];

    const result = buildOptimizedKnowledgeContext(files, "quantum recipe", 500);

    expect(result.contextText).toBe("");
    expect(result.isChunked).toBe(false);
    expect(result.matchedChunksCount).toBe(0);
    expect(result.retrievedChunks).toEqual([]);
  });

  it("still returns matched context when the query is relevant", () => {
    const files: ProjectFile[] = [
      {
        id: "f1",
        name: "notes.md",
        textContent: "Blender rigid body physics simulation setup. ".repeat(200),
        size: 1000,
        type: "document",
      } as ProjectFile,
    ];

    const result = buildOptimizedKnowledgeContext(files, "blender physics", 500);

    expect(result.contextText).not.toBe("");
    expect(result.matchedChunksCount).toBeGreaterThan(0);
  });
});
