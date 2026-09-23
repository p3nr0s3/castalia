import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeLexicalCrossScore,
  buildRerankBatchPrompt,
  scorePassagesWithLocalModel,
  rerankChunks,
  buildOptimizedKnowledgeContextAsync,
  RankedChunk,
} from "../lib/rag";
import { ProjectFile } from "../lib/types";

describe("Stage-2 Cross-Encoder Re-Ranker", () => {
  const makeChunk = (
    id: string,
    fileName: string,
    text: string,
    score = 0.5,
    symbolsDefined?: string[],
    symbolsReferenced?: string[]
  ): RankedChunk => ({
    id,
    fileName,
    fileId: fileName.replace(/\.[^.]+$/, ""),
    chunkIndex: 0,
    totalChunks: 1,
    text,
    charCount: text.length,
    estimatedTokens: Math.ceil(text.length / 4),
    preview: text.slice(0, 60),
    score,
    symbolsDefined,
    symbolsReferenced,
  });

  describe("In-Memory Cross-Scorer (computeLexicalCrossScore)", () => {
    it("returns 0.5 for empty query or blank text", () => {
      const chunk = makeChunk("c1", "test.ts", "const x = 1;");
      expect(computeLexicalCrossScore("", chunk)).toBe(0.5);
      expect(computeLexicalCrossScore("   ", chunk)).toBe(0.5);
      expect(computeLexicalCrossScore("query", { ...chunk, text: "" })).toBe(0.5);
    });

    it("evaluates query keyword coverage", () => {
      const highCoverageChunk = makeChunk(
        "c_high",
        "service.ts",
        "The authentication service validates user tokens, handles refresh tokens, and manages sessions."
      );
      const lowCoverageChunk = makeChunk(
        "c_low",
        "other.ts",
        "This file only manages database connection pools and database transactions."
      );

      const query = "authentication tokens sessions";
      const scoreHigh = computeLexicalCrossScore(query, highCoverageChunk);
      const scoreLow = computeLexicalCrossScore(query, lowCoverageChunk);

      expect(scoreHigh).toBeGreaterThan(scoreLow);
      expect(scoreHigh).toBeGreaterThanOrEqual(0.5);
    });

    it("rewards exact multi-word phrase proximity", () => {
      const contiguousChunk = makeChunk(
        "c_contiguous",
        "auth.ts",
        "We implement custom token validation middleware for all incoming API routes."
      );
      const scatteredChunk = makeChunk(
        "c_scattered",
        "docs.md",
        "Token generation is done here. In another unrelated section, validation is mentioned. And middleware is configured elsewhere."
      );

      const query = "token validation middleware";
      const scoreContiguous = computeLexicalCrossScore(query, contiguousChunk);
      const scoreScattered = computeLexicalCrossScore(query, scatteredChunk);

      expect(scoreContiguous).toBeGreaterThan(scoreScattered);
    });

    it("rewards AST symbol definition affinity over mere references", () => {
      const definingChunk = makeChunk(
        "c_def",
        "engine.ts",
        "export function executePipeline(tasks: Task[]) { return tasks.map(run); }",
        0.5,
        ["executePipeline"]
      );
      const referencingChunk = makeChunk(
        "c_ref",
        "caller.ts",
        "// We invoke executePipeline here to process tasks\nconst result = executePipeline(queue);",
        0.5,
        undefined,
        ["executePipeline"]
      );

      const query = "executePipeline";
      const scoreDef = computeLexicalCrossScore(query, definingChunk);
      const scoreRef = computeLexicalCrossScore(query, referencingChunk);

      expect(scoreDef).toBeGreaterThan(scoreRef);
    });

    it("awards file name alignment bonus", () => {
      const matchingFileChunk = makeChunk(
        "c1",
        "rateLimiter.ts",
        "export function checkLimit(ip: string) { return true; }"
      );
      const genericFileChunk = makeChunk(
        "c2",
        "utils.ts",
        "export function checkLimit(ip: string) { return true; }"
      );

      const query = "rateLimiter limit";
      const scoreMatching = computeLexicalCrossScore(query, matchingFileChunk);
      const scoreGeneric = computeLexicalCrossScore(query, genericFileChunk);

      expect(scoreMatching).toBeGreaterThan(scoreGeneric);
    });
  });

  describe("Batch Prompt Generation (buildRerankBatchPrompt)", () => {
    it("formats compact numbered passages and specifies JSON contract", () => {
      const candidates = [
        { numId: "1", text: "export function auth() {}", fileName: "auth.ts" },
        { numId: "2", text: "export function cache() {}", fileName: "cache.ts" },
      ];

      const prompt = buildRerankBatchPrompt("auth system", candidates);

      expect(prompt).toContain('Query: "auth system"');
      expect(prompt).toContain("[Passage 1 - auth.ts]");
      expect(prompt).toContain("[Passage 2 - cache.ts]");
      expect(prompt).toContain('{"scores": {"1": 0.95, "2": 0.15}}');
    });
  });

  describe("Local LLM Batch Cross-Scorer (scorePassagesWithLocalModel)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("calls Ollama /api/generate with format: 'json' and parses scores", async () => {
      const chunk1 = makeChunk("c_1", "auth.ts", "export function auth() {}");
      const chunk2 = makeChunk("c_2", "cache.ts", "export function cache() {}");

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            scores: {
              "1": 0.92,
              "2": 0.18,
            },
          }),
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const scores = await scorePassagesWithLocalModel("auth", [chunk1, chunk2], {
        ollamaUrl: "http://127.0.0.1:11434",
        model: "llama3.2",
      });

      expect(scores).not.toBeNull();
      expect(scores?.["c_1"]).toBe(0.92);
      expect(scores?.["c_2"]).toBe(0.18);

      // Verify request payload
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:11434/api/generate");
      const body = JSON.parse(opts.body);
      expect(body.format).toBe("json");
      expect(body.options.temperature).toBe(0.0);
    });

    it("supports direct key-value scores JSON without 'scores' wrapper", async () => {
      const chunk1 = makeChunk("chunk_alpha", "db.ts", "export const db = {};");

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            "1": 0.88,
          }),
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const scores = await scorePassagesWithLocalModel("db", [chunk1], {
        ollamaUrl: "http://127.0.0.1:11434",
      });

      expect(scores?.["chunk_alpha"]).toBe(0.88);
    });

    it("fails soft and returns null on HTTP error or malformed JSON", async () => {
      const chunk1 = makeChunk("c1", "a.ts", "code");

      // 1. HTTP 500 error
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
        })
      );
      let scores = await scorePassagesWithLocalModel("query", [chunk1], {
        ollamaUrl: "http://127.0.0.1:11434",
      });
      expect(scores).toBeNull();

      // 2. Malformed non-JSON string
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            response: "not a valid json object",
          }),
        })
      );
      scores = await scorePassagesWithLocalModel("query", [chunk1], {
        ollamaUrl: "http://127.0.0.1:11434",
      });
      expect(scores).toBeNull();
    });
  });

  describe("rerankChunks (Score Blending & Pruning)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("blends local LLM re-ranker score with stage-1 score", async () => {
      // Chunk A had higher Stage-1 score (0.8), but LLM rates it irrelevant (0.1)
      const chunkA = makeChunk("cA", "noisy.ts", "keyword keyword keyword irrelevant noise", 0.8);
      // Chunk B had moderate Stage-1 score (0.5), but LLM rates it highly relevant (0.95)
      const chunkB = makeChunk("cB", "exact.ts", "export function targetImplementation() {}", 0.5);

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            scores: {
              "1": 0.1, // chunkA
              "2": 0.95, // chunkB
            },
          }),
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const reranked = await rerankChunks([chunkA, chunkB], "targetImplementation", 2, {
        ollamaUrl: "http://127.0.0.1:11434",
        blendAlpha: 0.7,
      });

      expect(reranked.length).toBe(2);
      // Chunk B should be re-ranked to position 0
      expect(reranked[0].id).toBe("cB");
      // Check blended score calculation:
      // chunkB: 0.7 * 0.95 + 0.3 * 0.5 = 0.665 + 0.15 = 0.815
      expect(reranked[0].score).toBe(0.815);
      // chunkA: 0.7 * 0.1 + 0.3 * 0.8 = 0.07 + 0.24 = 0.31
      expect(reranked[1].id).toBe("cA");
      expect(reranked[1].score).toBe(0.31);
    });

    it("falls back to in-memory cross-scoring when Ollama is unavailable", async () => {
      const chunkA = makeChunk("cA", "other.ts", "completely unrelated text", 0.7);
      const chunkB = makeChunk(
        "cB",
        "auth.ts",
        "export function verifyToken(jwt: string) { return jwt.isValid; }",
        0.4,
        ["verifyToken"]
      );

      // No ollamaUrl passed -> strictly in-memory cross-encoder fallback
      const reranked = await rerankChunks([chunkA, chunkB], "verifyToken", 2, {
        blendAlpha: 0.8,
      });

      expect(reranked.length).toBe(2);
      // chunkB defines verifyToken and matches query, so it gets re-ranked to top
      expect(reranked[0].id).toBe("cB");
      expect(reranked[0].score).toBeGreaterThan(reranked[1].score ?? 0);
    });

    it("filters out chunks below minScore threshold while keeping at least top 1", async () => {
      const chunk1 = makeChunk("c1", "a.ts", "some text", 0.6);
      const chunk2 = makeChunk("c2", "b.ts", "other text", 0.2);

      // Filter with threshold 0.5
      const passed = await rerankChunks([chunk1, chunk2], "some text", 2, {
        minScore: 0.5,
      });
      // chunk1 passes, chunk2 pruned
      expect(passed.length).toBe(1);
      expect(passed[0].id).toBe("c1");

      // High threshold that would filter everything: safety guarantee keeps top 1
      const safeFloor = await rerankChunks([chunk1, chunk2], "unrelated query", 2, {
        minScore: 0.99,
      });
      expect(safeFloor.length).toBe(1);
    });
  });

  describe("End-to-End RAG Context Assembly with Re-Ranking", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("performs Stage-2 Cross-Encoder re-ranking in buildOptimizedKnowledgeContextAsync", async () => {
      const pad = "// padding text to trigger chunked budget mode\n".repeat(60);
      const files: ProjectFile[] = [
        {
          id: "auth_file",
          name: "authService.ts",
          textContent: `${pad}\nexport function authenticateSession(token: string) {\n  return token.length > 10;\n}`,
          size: 3500,
          type: "document",
          uploadedAt: Date.now(),
        },
        {
          id: "payment_file",
          name: "paymentService.ts",
          textContent: `${pad}\nexport function processPayment(amount: number) {\n  return amount > 0;\n}`,
          size: 3500,
          type: "document",
          uploadedAt: Date.now(),
        },
      ];

      // Mock Ollama to give authService a high score and paymentService a low score
      const fetchMock = vi.fn().mockImplementation(async (url: string, opts: any) => {
        return {
          ok: true,
          json: async () => ({
            response: JSON.stringify({
              scores: {
                "1": 0.95,
                "2": 0.1,
              },
            }),
          }),
        };
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await buildOptimizedKnowledgeContextAsync(
        files,
        "authenticateSession",
        500,
        {
          ollamaUrl: "http://127.0.0.1:11434",
          enabled: false, // Pure Stage-1 BM25 coarse filtering
        },
        {
          topK: 2,
          chunkSizeChars: 400,
          chunkOverlapChars: 50,
          rerank: {
            enabled: true,
            minScore: 0.3,
          },
        }
      );

      expect(result.isChunked).toBe(true);
      expect(result.matchedChunksCount).toBeGreaterThan(0);
      // Top chunk should be from authService.ts
      expect(result.retrievedChunks?.[0]?.fileName).toBe("authService.ts");
      expect(result.contextText).toContain("authService.ts");
    });
  });
});
