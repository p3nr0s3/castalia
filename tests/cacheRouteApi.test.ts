import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findSemantic = vi.fn();
vi.mock("../lib/serverDb", () => ({
  getPersistedCacheEntry: vi.fn(),
  findPersistedSemanticCacheEntry: (...a: any[]) => findSemantic(...a),
  setPersistedCacheEntry: vi.fn(),
  clearPersistedCache: vi.fn(),
}));

import { POST } from "../app/api/cache/route";

const post = (body: any) =>
  POST(new NextRequest("http://localhost:3000/api/cache", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => findSemantic.mockReset());

describe("POST /api/cache semantic-lookup", () => {
  it("accepts a realistic 768-dim embedding (the size that made the GET form return HTTP 431)", async () => {
    findSemantic.mockResolvedValue({ key: "k", timestamp: 1, data: { content: "hi" } });
    const embedding = Array.from({ length: 768 }, (_, i) => Math.sin(i) * 0.1);
    expect(JSON.stringify(embedding).length).toBeGreaterThan(15000);
    const res = await post({ action: "semantic-lookup", model: "llama3", embedding, threshold: 0.96 });
    expect(res.status).toBe(200);
    expect((await res.json()).entry.key).toBe("k");
    expect(findSemantic).toHaveBeenCalledWith({ model: "llama3", queryEmbedding: embedding, similarityThreshold: 0.96 });
  });

  it("rejects missing model, empty / oversized / non-numeric embeddings", async () => {
    for (const body of [
      { action: "semantic-lookup", embedding: [1, 2] },
      { action: "semantic-lookup", model: "m", embedding: [] },
      { action: "semantic-lookup", model: "m", embedding: new Array(9000).fill(0.1) },
      { action: "semantic-lookup", model: "m", embedding: [1, "x"] },
      { action: "semantic-lookup", model: "m", embedding: [1, null] },
    ]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(findSemantic).not.toHaveBeenCalled();
  });
});
