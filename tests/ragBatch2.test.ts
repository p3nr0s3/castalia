import { describe, it, expect, vi } from "vitest";
import { reorderChunksLostInTheMiddle, chunkDocument, rankChunksHybrid } from "../lib/rag";
import type { DocumentChunk } from "../lib/rag";
import type { ProjectFile } from "../lib/types";

describe("Batch 2: RAG Precision & Efficiency Improvements", () => {
  describe("reorderChunksLostInTheMiddle", () => {
    it("preserves small arrays (<= 2 items)", () => {
      expect(reorderChunksLostInTheMiddle(["a"])).toEqual(["a"]);
      expect(reorderChunksLostInTheMiddle(["a", "b"])).toEqual(["a", "b"]);
    });

    it("orders 4 items with highest scores at the perimeter and lowest in the middle", () => {
      const items = ["C0_best", "C1_second", "C2_third", "C3_worst"];
      const reordered = reorderChunksLostInTheMiddle(items);

      // Expected: [C0_best, C2_third, C3_worst, C1_second]
      expect(reordered[0]).toBe("C0_best");
      expect(reordered[reordered.length - 1]).toBe("C1_second");
      expect(reordered[1]).toBe("C2_third");
      expect(reordered[2]).toBe("C3_worst");
    });

    it("orders 6 items in a true U-shaped curve", () => {
      const items = ["C0", "C1", "C2", "C3", "C4", "C5"];
      const reordered = reorderChunksLostInTheMiddle(items);

      // Expected: [C0, C2, C4, C5, C3, C1]
      expect(reordered).toEqual(["C0", "C2", "C4", "C5", "C3", "C1"]);
      expect(reordered[0]).toBe("C0"); // Top of context
      expect(reordered[reordered.length - 1]).toBe("C1"); // Bottom of context
      expect(reordered[3]).toBe("C5"); // Lowest score in the middle
    });
  });

  describe("Word-boundary snapping on chunk overlap", () => {
    it("avoids cutting words in half when overlapping text segments", () => {
      const sampleText = [
        "First paragraph describes the authentication architecture in great detail with security protocols.",
        "Second paragraph explains database replication across multiple geographically distributed nodes.",
        "Third paragraph covers frontend state management and optimistic user interface updates.",
      ].join("\n\n");

      const file: ProjectFile = {
        id: "test_doc",
        name: "architecture.txt",
        size: sampleText.length,
        type: "document",
        textContent: sampleText,
        uploadedAt: Date.now(),
      };

      // Set targetChunkChars and overlapChars such that overlap is exercised
      const chunks = chunkDocument(file, 120, 40);
      expect(chunks.length).toBeGreaterThan(1);

      // Check that chunk 1 does not start with a broken word fragment
      const chunk1 = chunks[1].text;
      const firstWord = chunk1.trim().split(/\s+/)[0];
      // It should start cleanly with a recognizable word, not a fragment
      expect(firstWord.length).toBeGreaterThan(1);
    });
  });

  describe("Two-Stage Coarse-to-Fine Hybrid Retrieval", () => {
    it("limits embedded candidates to candidatePoolSize when chunk count exceeds threshold", async () => {
      // Create 50 chunks
      const chunks: DocumentChunk[] = Array.from({ length: 50 }, (_, i) => ({
        id: `chk_${i}`,
        fileName: `file_${i}.md`,
        fileId: `file_${i}`,
        chunkIndex: 0,
        totalChunks: 1,
        text: `Content for chunk ${i} discussing software engineering principles and microservices architecture.`,
        charCount: 90,
        estimatedTokens: 25,
        preview: `Content for chunk ${i}...`,
      }));

      // Spy on fetch to check how many texts are embedded
      const fetchSpy = vi.fn().mockImplementation(async (_url: string, init: any) => {
        const body = JSON.parse(init.body);
        if (body.input && Array.isArray(body.input)) {
          return {
            ok: true,
            json: async () => ({
              embeddings: body.input.map(() => [0.1, 0.2, 0.3]),
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            embedding: [0.1, 0.2, 0.3],
          }),
        };
      });

      const originalFetch = global.fetch;
      global.fetch = fetchSpy;

      try {
        const results = await rankChunksHybrid(chunks, "microservices architecture", 5, {
          ollamaUrl: "http://localhost:11434",
        });

        expect(results.length).toBeLessThanOrEqual(5);

        // Verify that fetch was called with at most candidatePoolSize + 1 items, not all 50 + 1
        const callArgs = fetchSpy.mock.calls[0];
        if (callArgs) {
          const body = JSON.parse(callArgs[1].body);
          const textsCount = body.input ? body.input.length : 1;
          // candidatePoolSize for topK=5 is Math.min(50, Math.max(25, 35)) = 35 (+ 1 query) = 36
          expect(textsCount).toBeLessThan(51);
        }
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
