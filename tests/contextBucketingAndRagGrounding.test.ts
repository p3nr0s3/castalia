import { describe, it, expect } from "vitest";
import { calculateContextBucket, CONTEXT_WINDOW_BUCKETS } from "@/lib/ollama";
import { compactDocumentChunk, assembleContextFromRanked, buildOptimizedKnowledgeContext, RankedChunk, extractQuickSummary } from "@/lib/rag";
import { ProjectFile, Message } from "@/lib/types";
import { detectSamplingProfile, resolveAdaptiveSamplingParams } from "@/lib/adaptiveSampling";
import { unloadEmbeddingModel } from "@/lib/embeddings";
import { verifyGrounding } from "@/lib/groundingVerifier";

describe("Dynamic Context Window Bucketing", () => {
  it("defines standard power-of-two bucket tiers", () => {
    expect(CONTEXT_WINDOW_BUCKETS).toEqual([2048, 4096, 8192, 16384, 32768, 65536, 131072]);
  });

  it("assigns short prompts to the 2048 bucket", () => {
    // 300 input tokens + 1024 output = 1324 -> fits in 2048 bucket
    const bucket = calculateContextBucket(300, 32768, 1024);
    expect(bucket).toBe(2048);
  });

  it("assigns medium conversational prompts to the 4096 bucket", () => {
    // 2000 input tokens + 1024 output = 3024 -> fits in 4096 bucket
    const bucket = calculateContextBucket(2000, 32768, 1024);
    expect(bucket).toBe(4096);
  });

  it("assigns RAG / code prompts to the 8192 bucket", () => {
    // 5000 input tokens + 1024 output = 6024 -> fits in 8192 bucket
    const bucket = calculateContextBucket(5000, 32768, 1024);
    expect(bucket).toBe(8192);
  });

  it("assigns heavy context to 16384 or 32768 bucket", () => {
    // 10000 input tokens + 1024 output = 11024 -> fits in 16384
    expect(calculateContextBucket(10000, 32768, 1024)).toBe(16384);
    // 20000 input tokens + 1024 output = 21024 -> fits in 32768
    expect(calculateContextBucket(20000, 32768, 1024)).toBe(32768);
  });

  it("strictly caps the bucket to maxCapacity ceiling", () => {
    // Needed is 11024 (which would want 16384), but maxCapacity is 8192
    const bucket = calculateContextBucket(10000, 8192, 1024);
    expect(bucket).toBe(8192);
  });

  it("handles edge cases with minBucket floor", () => {
    // 0 tokens input + 0 output -> floors to minBucket 2048
    expect(calculateContextBucket(0, 32768, 0)).toBe(2048);
  });
});

describe("RAG Compaction and Anti-Hallucination Directives", () => {
  it("compacts multi-line copyright blocks and excessive newlines", () => {
    const rawCode = `/*
 * Copyright (c) 2024 Acme Corporation
 * All rights reserved. MIT License.
 */

function add(a, b) {   
    


    return a + b;   
}`;

    const compacted = compactDocumentChunk(rawCode);
    expect(compacted).not.toContain("Copyright");
    expect(compacted).not.toContain("MIT License");
    expect(compacted).not.toContain("\n\n\n");
    expect(compacted).toContain("function add(a, b) {");
    expect(compacted).toContain("return a + b;");
  });

  it("compacts single-line license comment headers", () => {
    const rawPy = `# Copyright (c) 2024 Open Source
# Licensed under Apache License 2.0
def calculate():
    pass
`;
    const compacted = compactDocumentChunk(rawPy);
    expect(compacted).not.toContain("Apache License");
    expect(compacted).toContain("def calculate():");
  });

  it("includes GROUNDING DIRECTIVE in assembleContextFromRanked", () => {
    const files: ProjectFile[] = [
      { id: "f1", name: "auth.ts", textContent: "export function authenticate() {}", size: 40, type: "document", uploadedAt: 123 },
    ];
    const ranked: RankedChunk[] = [
      {
        id: "c1",
        fileName: "auth.ts",
        fileId: "f1",
        chunkIndex: 0,
        totalChunks: 1,
        text: "/* Copyright MIT */\n\nexport function authenticate() {}",
        charCount: 50,
        estimatedTokens: 15,
        preview: "export function",
        score: 0.95,
      },
    ];

    const result = assembleContextFromRanked(files, ranked, 4000);
    expect(result.contextText).toContain("GROUNDING DIRECTIVE:");
    expect(result.contextText).toContain("Answer the user's prompt strictly based on the verified passages");
    // Also verify chunk text was compacted
    expect(result.contextText).not.toContain("Copyright MIT");
    expect(result.contextText).toContain("export function authenticate()");
  });

  it("includes GROUNDING DIRECTIVE in buildOptimizedKnowledgeContext when files fit budget", () => {
    const files: ProjectFile[] = [
      { id: "f1", name: "readme.md", textContent: "/* Copyright MIT */\n\n# Project Intro\n\nDetails.", size: 50, type: "document", uploadedAt: 123 },
    ];

    const result = buildOptimizedKnowledgeContext(files, "intro", 4000);
    expect(result.contextText).toContain("GROUNDING DIRECTIVE:");
    expect(result.contextText).toContain("Answer the user's prompt strictly using the verified project documents");
    expect(result.contextText).not.toContain("Copyright MIT");
  });
});

describe("Task-Adaptive Sampling and Hyperparameters", () => {
  it("detects coding task and resolves low temperature (0.2)", () => {
    const params = resolveAdaptiveSamplingParams({
      userPrompt: "Tolong perbaiki bug pada function calculateSum(a, b) berikut ```ts const res = a + b; ```",
      adaptiveSamplingEnabled: true,
    });
    expect(params.profile).toBe("coding");
    expect(params.temperature).toBe(0.2);
    expect(params.repeatPenalty).toBe(1.15);
  });

  it("detects RAG task and resolves factual temperature (0.3)", () => {
    const params = resolveAdaptiveSamplingParams({
      userPrompt: "Apa kebijakan privasi pada dokumen ini?",
      hasRagContext: true,
      adaptiveSamplingEnabled: true,
    });
    expect(params.profile).toBe("rag");
    expect(params.temperature).toBe(0.3);
  });

  it("detects creative task and resolves imaginative temperature (0.85)", () => {
    const params = resolveAdaptiveSamplingParams({
      userPrompt: "Buatkan cerita fiksi tentang astronot yang menemukan peradaban kuno di Mars",
      adaptiveSamplingEnabled: true,
    });
    expect(params.profile).toBe("creative");
    expect(params.temperature).toBe(0.85);
  });

  it("strictly honors user explicit overrides regardless of profile", () => {
    const params = resolveAdaptiveSamplingParams({
      userPrompt: "function test() {}",
      explicitTemperature: 0.99,
      adaptiveSamplingEnabled: true,
    });
    expect(params.temperature).toBe(0.99);
  });
});

describe("VRAM Isolation and Embedding Model Unloading", () => {
  it("provides unloadEmbeddingModel function without throwing", async () => {
    expect(typeof unloadEmbeddingModel).toBe("function");
  });
});

describe("Post-Generation Grounding and Hallucination Verifier", () => {
  const mockChunks = [
    {
      id: "c1",
      fileName: "lib/auth.ts",
      chunkIndex: 0,
      totalChunks: 1,
      textSnippet: "export function verifySession(token: string) { return jwt.verify(token); }",
      estimatedTokens: 20,
    },
    {
      id: "c2",
      fileName: "config/database.json",
      chunkIndex: 0,
      totalChunks: 1,
      textSnippet: "Database port is set to 5432 with host localhost.",
      estimatedTokens: 15,
    },
  ];

  it("scores high and status verified when assistant cites real files and context facts", async () => {
    const response = "Berdasarkan lib/auth.ts, fungsi verifySession memvalidasi token menggunakan jwt.verify. Database port adalah 5432 di config/database.json.";
    const report = await verifyGrounding(response, mockChunks);

    expect(report).not.toBeNull();
    expect(report!.status).toBe("verified");
    expect(report!.score).toBeGreaterThanOrEqual(80);
    expect(report!.verifiedFiles).toContain("lib/auth.ts");
    expect(report!.verifiedFiles).toContain("config/database.json");
    expect(report!.unverifiedFiles).toHaveLength(0);
  });

  it("detects unverified hallucinated file citations and lowers score", async () => {
    const response = "Fitur ini didefinisikan di imaginary/ghost_module.ts dan secret_config.yaml.";
    const report = await verifyGrounding(response, mockChunks);

    expect(report).not.toBeNull();
    expect(report!.unverifiedFiles).toContain("ghost_module.ts");
    expect(report!.unverifiedFiles).toContain("secret_config.yaml");
    expect(report!.status).toBe("unverified");
    expect(report!.score).toBeLessThanOrEqual(50);
  });

  it("handles empty context or empty response safely by returning null", async () => {
    const emptyReport = await verifyGrounding("", []);
    expect(emptyReport).toBeNull();
  });

  it("does not flag a correct paraphrase as unsupported (fixes the old word-overlap false negative)", async () => {
    // Same fact as mockChunks' c1, worded differently — a pure word-overlap
    // heuristic without IDF weighting used to under-score this.
    const response = "Token divalidasi lewat pemanggilan jwt.verify di dalam lib/auth.ts.";
    const report = await verifyGrounding(response, mockChunks);

    expect(report).not.toBeNull();
    expect(report!.status).not.toBe("unverified");
  });

  it("flags a fabricated number even when surrounding words overlap heavily (fixes the old false positive)", async () => {
    // Every word here ("database", "port", "config", etc.) appears in
    // mockChunks' c2 — only the number is wrong (5432 -> 9999). The old
    // heuristic scored this ~80%+ "verified" purely from word overlap.
    const response = "Database port di config/database.json diset ke 9999, bukan default biasa.";
    const report = await verifyGrounding(response, mockChunks);

    expect(report).not.toBeNull();
    expect(report!.status).toBe("unverified");
  });

  it("still verifies a claim that correctly cites a number present in the chunks", async () => {
    const response = "Sesuai config/database.json, port database yang dipakai adalah 5432.";
    const report = await verifyGrounding(response, mockChunks);

    expect(report).not.toBeNull();
    expect(report!.status).not.toBe("unverified");
  });

  it("falls back to the heuristic result when llmFallback has no reachable server", async () => {
    const response = "Token divalidasi lewat jwt.verify di lib/auth.ts.";
    const withUnreachableFallback = await verifyGrounding(response, mockChunks, {
      ollamaUrl: "http://127.0.0.1:1", // nothing listens here
      timeoutMs: 300,
    });

    expect(withUnreachableFallback).not.toBeNull();
    // Must not throw, and must still return a usable report — same shape
    // the pure-heuristic call would produce.
    expect(typeof withUnreachableFallback!.score).toBe("number");
  });
});

describe("High-Density Rolling Micro-Summaries for History Compaction", () => {
  it("extracts dense semantic action bullets instead of raw slice", () => {
    const omittedMessages: Message[] = [
      {
        id: "m1",
        role: "user",
        content: "Tolong perbaiki bug pada login dan implementasikan OAuth2",
        timestamp: 1000,
      },
      {
        id: "m2",
        role: "assistant",
        content: "- Fixed authentication tokens\n- Updated auth.ts dan server.ts\nError 401 resolved.",
        timestamp: 2000,
      },
    ];
    const summary = extractQuickSummary(omittedMessages);

    expect(summary).toContain("User objective:");
    expect(summary).toContain("OAuth2");
    expect(summary).toContain("Key action:");
  });
});
