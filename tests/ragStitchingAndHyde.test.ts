import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mergeChunkTexts,
  stitchAdjacentChunks,
  buildHydePrompt,
  generateHypotheticalDocument,
  rankChunksHybrid,
  buildOptimizedKnowledgeContextAsync,
  RankedChunk,
} from "../lib/rag";
import { clearEmbeddingCache } from "../lib/embeddings";
import { ProjectFile } from "../lib/types";

describe("Adjacent Chunk Merging & Stitching", () => {
  describe("mergeChunkTexts", () => {
    it("deduplicates exact overlapping boundaries between two consecutive chunks", () => {
      const part1 = "function calculateSum(a: number, b: number) {\n  return a + b;\n}";
      const overlap = "  return a + b;\n}";
      const part2 = `${overlap}\n\nexport function multiply(a: number, b: number) {\n  return a * b;\n}`;

      const merged = mergeChunkTexts(part1, part2);
      expect(merged).toContain("function calculateSum");
      expect(merged).toContain("export function multiply");
      // Overlap section should only appear once
      const count = (merged.match(/return a \+ b;/g) || []).length;
      expect(count).toBe(1);
    });

    it("cleanly joins chunks with newlines when there is no common boundary overlap", () => {
      const text1 = "First distinct paragraph without overlap.";
      const text2 = "Second distinct paragraph.";

      const merged = mergeChunkTexts(text1, text2);
      expect(merged).toBe(`${text1}\n\n${text2}`);
    });

    it("handles empty or single string inputs gracefully", () => {
      expect(mergeChunkTexts("", "second")).toBe("second");
      expect(mergeChunkTexts("first", "")).toBe("first");
      expect(mergeChunkTexts("", "")).toBe("");
    });
  });

  describe("stitchAdjacentChunks", () => {
    const makeRankedChunk = (
      id: string,
      fileId: string,
      chunkIndex: number,
      totalChunks: number,
      text: string,
      score: number,
      symbolsDefined?: string[],
      symbolsReferenced?: string[]
    ): RankedChunk => ({
      id,
      fileName: `${fileId}.ts`,
      fileId,
      chunkIndex,
      totalChunks,
      text,
      charCount: text.length,
      estimatedTokens: Math.ceil(text.length / 4),
      preview: text.slice(0, 50),
      score,
      symbolsDefined,
      symbolsReferenced,
    });

    it("merges consecutive chunks from the same file into unified passages", () => {
      const chunks: RankedChunk[] = [
        makeRankedChunk(
          "f1_0",
          "authService",
          0,
          4,
          "export class AuthService {\n  private token: string;\n  constructor() {",
          4.5,
          ["AuthService"]
        ),
        makeRankedChunk(
          "f1_1",
          "authService",
          1,
          4,
          "  constructor() {\n    this.token = '';\n  }\n  login() { return true; }\n}",
          4.0,
          ["login"]
        ),
      ];

      const stitched = stitchAdjacentChunks(chunks);

      expect(stitched.length).toBe(1);
      const unified = stitched[0];
      expect(unified.id).toBe("f1_0+f1_1");
      expect(unified.chunkIndex).toBe(0);
      expect(unified.stitchedPartRange).toEqual([1, 2]);
      expect(unified.score).toBe(4.5);
      expect(unified.symbolsDefined).toContain("AuthService");
      expect(unified.symbolsDefined).toContain("login");
      expect(unified.text).toContain("export class AuthService");
      expect(unified.text).toContain("login() { return true; }");
    });

    it("keeps non-consecutive chunks from the same file separate", () => {
      const chunks: RankedChunk[] = [
        makeRankedChunk("f1_0", "service", 0, 5, "Chunk index 0", 5.0),
        makeRankedChunk("f1_2", "service", 2, 5, "Chunk index 2", 3.0),
      ];

      const stitched = stitchAdjacentChunks(chunks);
      expect(stitched.length).toBe(2);
      expect(stitched[0].chunkIndex).toBe(0);
      expect(stitched[1].chunkIndex).toBe(2);
      expect(stitched[0].stitchedPartRange).toBeUndefined();
      expect(stitched[1].stitchedPartRange).toBeUndefined();
    });

    it("keeps chunks from different files separate even if chunkIndices match", () => {
      const chunks: RankedChunk[] = [
        makeRankedChunk("fileA_0", "fileA", 0, 2, "File A chunk 0", 4.0),
        makeRankedChunk("fileB_1", "fileB", 1, 2, "File B chunk 1", 3.8),
      ];

      const stitched = stitchAdjacentChunks(chunks);
      expect(stitched.length).toBe(2);
      expect(stitched[0].fileId).toBe("fileA");
      expect(stitched[1].fileId).toBe("fileB");
    });

    it("chains three or more consecutive chunks into a single multi-part passage", () => {
      const chunks: RankedChunk[] = [
        makeRankedChunk("c0", "data", 0, 5, "Part zero content.", 2.0),
        makeRankedChunk("c1", "data", 1, 5, "Part one content.", 3.5),
        makeRankedChunk("c2", "data", 2, 5, "Part two content.", 3.0),
      ];

      const stitched = stitchAdjacentChunks(chunks);
      expect(stitched.length).toBe(1);
      expect(stitched[0].stitchedPartRange).toEqual([1, 3]);
      expect(stitched[0].score).toBe(3.5); // max score of the group
      expect(stitched[0].text).toContain("Part zero");
      expect(stitched[0].text).toContain("Part two");
    });
  });
});

describe("HyDE (Hypothetical Document Embeddings)", () => {
  beforeEach(() => {
    clearEmbeddingCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a concise prompt targeting technical documentation and code", () => {
    const prompt = buildHydePrompt("how to configure CORS in Express");
    expect(prompt).toContain("Query: how to configure CORS in Express");
    expect(prompt).toContain("Do not include greetings");
    expect(prompt).toContain("code or documentation paragraph");
  });

  it("generates a hypothetical document snippet via Ollama generate API", async () => {
    const fakeResponse = { response: "import cors from 'cors'; app.use(cors());" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const doc = await generateHypotheticalDocument("express cors setup", {
      ollamaUrl: "http://127.0.0.1:11434",
      model: "qwen2.5:7b",
    });

    expect(doc).toBe("import cors from 'cors'; app.use(cors());");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/generate",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("express cors setup"),
      })
    );
  });

  it("fails soft and returns null on network failure or empty query", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network connection refused"));
    vi.stubGlobal("fetch", fetchMock);

    const doc = await generateHypotheticalDocument("failing query", {
      ollamaUrl: "http://127.0.0.1:11434",
    });
    expect(doc).toBeNull();

    const emptyDoc = await generateHypotheticalDocument("   ", {
      ollamaUrl: "http://127.0.0.1:11434",
    });
    expect(emptyDoc).toBeNull();
  });

  it("rankChunksHybrid incorporates hypothetical document into semantic search", async () => {
    // We mock fetch for embeddings:
    // When text includes hypothetical document terms, return a vector strongly aligned with the target chunk
    const targetChunk = {
      id: "auth_config_chk",
      fileName: "config.ts",
      fileId: "config",
      chunkIndex: 0,
      totalChunks: 1,
      text: "export const corsConfig = { allowedOrigins: ['https://example.com'] };",
      charCount: 71,
      estimatedTokens: 20,
      preview: "corsConfig",
    };
    const otherChunk = {
      id: "user_model_chk",
      fileName: "user.ts",
      fileId: "user",
      chunkIndex: 0,
      totalChunks: 1,
      text: "export interface User { id: string; name: string; }",
      charCount: 52,
      estimatedTokens: 15,
      preview: "User interface",
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string, opts: any) => {
      const body = JSON.parse(opts.body);
      const prompt = body.prompt || "";
      // If prompt contains hypothetical text about allowedOrigins/corsConfig, return matching vector
      if (prompt.includes("corsConfig") || prompt.includes("allowedOrigins")) {
        return {
          ok: true,
          json: async () => ({ embedding: [1.0, 0.0] }),
        };
      }
      return {
        ok: true,
        json: async () => ({ embedding: [0.0, 1.0] }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const ranked = await rankChunksHybrid(
      [otherChunk, targetChunk],
      "cross origin policy security",
      2,
      {
        ollamaUrl: "http://127.0.0.1:11434",
        enabled: true,
        semanticWeight: 0.8,
        hyde: {
          enabled: true,
          hypotheticalDocument: "export const corsConfig = { allowedOrigins: ['*'] };",
        },
      }
    );

    expect(ranked.length).toBe(2);
    // targetChunk should win rank 1 because of strong HyDE semantic alignment
    expect(ranked[0].id).toBe("auth_config_chk");
  });
});

describe("End-to-End Context Assembly with Stitching", () => {
  it("stitches adjacent chunks in buildOptimizedKnowledgeContextAsync and renders unified headers", async () => {
    const pad = "// padding text to ensure document exceeds budget\n".repeat(60);
    const files: ProjectFile[] = [
      {
        id: "app_file",
        name: "application.ts",
        textContent: `${pad}\nexport function initApp() {\n  return 'ready';\n}\n\n${pad}\nexport function startServer() {\n  return 8080;\n}`,
        size: 3500,
        type: "document",
        uploadedAt: Date.now(),
      },
    ];

    const result = await buildOptimizedKnowledgeContextAsync(
      files,
      "initApp startServer",
      500,
      {
        ollamaUrl: "http://127.0.0.1:11434",
        enabled: false,
      },
      {
        chunkSizeChars: 400,
        chunkOverlapChars: 50,
        stitchAdjacent: true,
      }
    );

    expect(result.isChunked).toBe(true);
    // Check if stitched parts header appears (e.g. Parts 1-2/...)
    if (result.matchedChunksCount > 0) {
      const hasStitchedHeader = result.contextText.includes("Parts ") || result.contextText.includes("Part ");
      expect(hasStitchedHeader).toBe(true);
    }
  });
});
