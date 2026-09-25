import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/constants";
import { buildOptimizedKnowledgeContextAsync } from "../lib/rag";
import type { ProjectFile } from "../lib/types";

// Guards documented defaults so README claims cannot silently drift:
// - Semantic RAG (embeddings + semantic response cache) stays OFF by default because it
//   needs an embedding model installed.
// - Stage-2 rerank runs with the in-memory lexical scorer and needs no network/LLM call.
const makeFile = (id: string, name: string, text: string): ProjectFile => ({
  id,
  name,
  size: text.length,
  type: "document",
  textContent: text,
  uploadedAt: 0,
});

describe("RAG defaults", () => {
  it("keeps semantic RAG opt-in", () => {
    expect(DEFAULT_SETTINGS.semanticRagEnabled).toBe(false);
  });

  const files = [
    makeFile("f1", "auth.ts", "export function verifyToken(token: string) { return token.length > 10; }\n".repeat(40)),
    makeFile("f2", "notes.md", "Grocery list: apples, oranges, bread. Tokens of appreciation.\n".repeat(40)),
  ];

  it("runs Stage-2 rerank offline (no embeddings, no LLM) and surfaces the relevant file first", async () => {
    const res = await buildOptimizedKnowledgeContextAsync(
      files,
      "verifyToken function",
      undefined,
      undefined,
      { topK: 2, rerank: { enabled: true } }
    );
    expect(res.contextText.length).toBeGreaterThan(0);
    expect(res.matchedFiles[0]).toBe("auth.ts");
  });

  it("still works when rerank is explicitly disabled", async () => {
    const res = await buildOptimizedKnowledgeContextAsync(
      files,
      "verifyToken function",
      undefined,
      undefined,
      { topK: 2, rerank: { enabled: false } }
    );
    expect(res.matchedFiles).toContain("auth.ts");
  });
});
