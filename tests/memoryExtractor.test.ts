import { describe, it, expect } from "vitest";
import {
  parseExtractionResponse,
  mergeExtractedMemories,
  containsCredential,
  containsSensitive,
  similarity,
  MAX_MEMORY_ITEMS,
} from "../lib/memoryExtractor";
import type { MemoryItem } from "../lib/types";

function mem(id: string, title: string, content: string, enabled = true): MemoryItem {
  return { id, category: "profile", title, content, updatedAt: 1000, enabled };
}

describe("parseExtractionResponse", () => {
  it("parses a clean JSON array", () => {
    const out = parseExtractionResponse('[{"category":"preference","title":"Editor","content":"Uses Neovim"}]');
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Editor");
  });

  it("recovers JSON wrapped in a markdown code fence", () => {
    const raw = '```json\n[{"category":"profile","title":"Role","content":"SOC analyst"}]\n```';
    expect(parseExtractionResponse(raw)[0].content).toBe("SOC analyst");
  });

  it("recovers JSON surrounded by prose", () => {
    const raw = 'Sure! Here is what I found:\n[{"category":"topic","title":"Interest","content":"Likes RAG"}]\nHope that helps.';
    expect(parseExtractionResponse(raw)).toHaveLength(1);
  });

  it("returns [] for an empty array response, the expected normal case", () => {
    expect(parseExtractionResponse("[]")).toEqual([]);
  });

  it("returns [] instead of throwing on malformed JSON", () => {
    expect(parseExtractionResponse("[{broken json")).toEqual([]);
    expect(parseExtractionResponse("not json at all")).toEqual([]);
    expect(parseExtractionResponse("")).toEqual([]);
  });

  it("drops entries missing a title or content", () => {
    const raw = '[{"category":"profile","title":"","content":"x"},{"category":"profile","title":"y","content":""}]';
    expect(parseExtractionResponse(raw)).toEqual([]);
  });

  it("rejects over-long content, which indicates a transcript summary rather than a fact", () => {
    const long = "a".repeat(400);
    expect(parseExtractionResponse(`[{"category":"other","title":"t","content":"${long}"}]`)).toEqual([]);
  });

  it("coerces an unknown category to 'other' rather than dropping the memory", () => {
    const out = parseExtractionResponse('[{"category":"nonsense","title":"t","content":"c"}]');
    expect(out[0].category).toBe("other");
  });
});

describe("credential and sensitive detection", () => {
  it("flags API keys, tokens, and key-value secrets", () => {
    expect(containsCredential("my key is sk-abcdefghij1234567890")).toBe(true);
    expect(containsCredential("ghp_abcdefghijklmnopqrstuvwxyz12")).toBe(true);
    expect(containsCredential("AKIAIOSFODNN7EXAMPLE")).toBe(true);
    expect(containsCredential("password: hunter2")).toBe(true);
  });

  it("does not flag ordinary prose", () => {
    expect(containsCredential("prefers concise answers in Bahasa Indonesia")).toBe(false);
  });

  it("flags personal identifiers as sensitive", () => {
    expect(containsSensitive("email rei@example.com")).toBe(true);
    expect(containsSensitive("nomor 081234567890")).toBe(true);
  });
});

describe("similarity", () => {
  it("scores near-identical facts highly", () => {
    expect(similarity("works as a SOC analyst", "user works as SOC analyst")).toBeGreaterThan(0.6);
  });

  it("scores unrelated facts low", () => {
    expect(similarity("prefers dark mode", "lives in Tangerang")).toBeLessThan(0.2);
  });

  it("ignores case and punctuation", () => {
    expect(similarity("Prefers dark mode.", "prefers dark mode")).toBe(1);
  });
});

describe("mergeExtractedMemories", () => {
  const opts = { includeSensitive: false, now: 5000 };

  it("adds a genuinely new memory", () => {
    const r = mergeExtractedMemories([], [{ category: "preference", title: "OS", content: "Uses Fedora Linux" }], opts);
    expect(r.added).toHaveLength(1);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].enabled).toBe(true);
  });

  it("never stores credentials, even with sensitive storage enabled", () => {
    const r = mergeExtractedMemories(
      [],
      [{ category: "other", title: "Key", content: "api_key: sk-abcdefghij1234567890" }],
      { includeSensitive: true, now: 5000 }
    );
    expect(r.items).toHaveLength(0);
    expect(r.rejected[0].reason).toBe("credential");
  });

  it("drops sensitive personal data when the user has not opted in", () => {
    const r = mergeExtractedMemories([], [{ category: "profile", title: "Email", content: "rei@example.com" }], opts);
    expect(r.rejected[0].reason).toBe("sensitive");
    expect(r.items).toHaveLength(0);
  });

  it("stores sensitive personal data when the user has opted in", () => {
    const r = mergeExtractedMemories(
      [],
      [{ category: "profile", title: "Email", content: "rei@example.com" }],
      { includeSensitive: true, now: 5000 }
    );
    expect(r.added).toHaveLength(1);
  });

  it("refreshes a near-duplicate instead of appending a second copy", () => {
    const existing = [mem("m1", "Role", "works as a SOC analyst")];
    const r = mergeExtractedMemories(
      existing,
      [{ category: "profile", title: "Role", content: "works as a SOC analyst L2 at Visionet" }],
      opts
    );
    expect(r.items).toHaveLength(1);
    expect(r.updated).toHaveLength(1);
    expect(r.items[0].content).toContain("L2");
    expect(r.items[0].id).toBe("m1"); // identity preserved
  });

  it("preserves the user's enabled/disabled choice when refreshing", () => {
    const existing = [mem("m1", "Role", "works as a SOC analyst", false)];
    const r = mergeExtractedMemories(
      existing,
      [{ category: "profile", title: "Role", content: "works as SOC analyst L2" }],
      opts
    );
    expect(r.items[0].enabled).toBe(false);
  });

  it("rejects an exact duplicate without touching updatedAt", () => {
    const existing = [mem("m1", "Role", "works as a SOC analyst")];
    const r = mergeExtractedMemories(
      existing,
      [{ category: "profile", title: "Role", content: "Works as a SOC analyst." }],
      opts
    );
    expect(r.rejected[0].reason).toBe("duplicate");
    expect(r.items[0].updatedAt).toBe(1000);
  });

  it("rejects beyond the cap rather than evicting curated memories", () => {
    const existing = Array.from({ length: MAX_MEMORY_ITEMS }, (_, i) =>
      mem(`m${i}`, `Title ${i}`, `distinct fact number ${i} about something`)
    );
    const r = mergeExtractedMemories(
      existing,
      [{ category: "other", title: "Brand new", content: "a completely unrelated novel observation" }],
      opts
    );
    expect(r.items).toHaveLength(MAX_MEMORY_ITEMS);
    expect(r.rejected[0].reason).toBe("capacity");
  });

  it("does not mutate the caller's existing array", () => {
    const existing = [mem("m1", "Role", "SOC analyst")];
    mergeExtractedMemories(existing, [{ category: "other", title: "New", content: "unrelated novel fact here" }], opts);
    expect(existing).toHaveLength(1);
  });
});
