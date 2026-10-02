import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/rag/retrieve/route";
import { retrieveKnowledgeContextAsync } from "../lib/rag";
import type { ProjectFile } from "../lib/types";

function makeReq(body: Record<string, any>): NextRequest {
  return new NextRequest("http://localhost:3000/api/rag/retrieve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/rag/retrieve", () => {
  it("returns 400 when files parameter is missing or not an array", async () => {
    const res = await POST(makeReq({ userQuery: "test query" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("'files' array is required");
  });

  it("returns 400 when files parameter exceeds maximum cap of 500", async () => {
    const hugeFilesList = Array.from({ length: 501 }, (_, i) => ({
      id: `f_${i}`,
      name: `file_${i}.txt`,
      textContent: "Sample text content",
      size: 19,
    }));
    const res = await POST(makeReq({ files: hugeFilesList }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("Too many files provided");
  });

  it("returns empty result structure immediately when files is an empty array", async () => {
    const res = await POST(makeReq({ files: [], userQuery: "anything" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result).toEqual({
      contextText: "",
      matchedChunksCount: 0,
      totalFilesCount: 0,
      matchedFiles: [],
      totalEstimatedTokens: 0,
      isChunked: false,
    });
  });

  it("retrieves and ranks relevant chunks for files matching the user query", async () => {
    const files: ProjectFile[] = [
      {
        id: "f1",
        name: "auth_service.py",
        type: "document",
        uploadedAt: 1700000000000,
        textContent: "def authenticate_user(token: str):\n    return verify_jwt_token(token)\n",
        size: 70,
      },
      {
        id: "f2",
        name: "billing_engine.py",
        type: "document",
        uploadedAt: 1700000000000,
        textContent: "def process_invoice(amount: float):\n    charge_credit_card(amount)\n",
        size: 65,
      },
    ];

    const res = await POST(
      makeReq({
        files,
        userQuery: "How does token authentication work?",
        tokenBudget: 4000,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.contextText).toContain("auth_service.py");
    expect(data.result.contextText).toContain("authenticate_user");
    expect(data.result.matchedFiles).toContain("auth_service.py");
    expect(data.result.totalEstimatedTokens).toBeGreaterThan(0);
  });
});

describe("retrieveKnowledgeContextAsync client helper", () => {
  it("returns empty context without calling fetch when files array is empty", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await retrieveKnowledgeContextAsync([]);
    expect(result.contextText).toBe("");
    expect(result.matchedChunksCount).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("falls back to local buildOptimizedKnowledgeContextAsync when server request fails", async () => {
    const files: ProjectFile[] = [
      {
        id: "f_fallback",
        name: "math_utils.ts",
        type: "document",
        uploadedAt: 1700000000000,
        textContent: "export function fibonacci(n: number): number { return n <= 1 ? n : fibonacci(n-1) + fibonacci(n-2); }",
        size: 100,
      },
    ];

    // Mock fetch to simulate offline or network error
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network offline"));

    const result = await retrieveKnowledgeContextAsync(files, "fibonacci sequence calculation", 3000);

    expect(result).toBeDefined();
    expect(result.contextText).toContain("math_utils.ts");
    expect(result.contextText).toContain("fibonacci");

    fetchSpy.mockRestore();
  });
});
