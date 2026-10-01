import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";
import { buildFtsQuery, makeSnippet, searchConversationsJs, tokenizeQuery } from "../lib/historySearch";
import type { Conversation } from "../lib/types";

const msg = (id: string, role: string, content: string) => ({ id, role, content, timestamp: 1 }) as any;
const conv = (id: string, title: string, messages: any[], updatedAt = 1): Conversation => ({ id, title, messages, createdAt: 1, updatedAt }) as any;

const CORPUS: Conversation[] = [
  conv("c1", "Kubernetes deploy", [msg("m1", "user", "How do I roll back a Kubernetes deployment?"), msg("m2", "assistant", "Use kubectl rollout undo deployment/app to revert.")], 10),
  conv("c2", "Resep nasi goreng", [msg("m3", "user", "Resep nasi goreng spesial dong"), msg("m4", "assistant", "Tumis bumbu, masukkan nasi, kecap manis.")], 20),
  conv("c3", "Café notes", [msg("m5", "user", "Crème brûlée at the café was great")], 30),
  conv("c4", "Empty", [msg("m6", "user", "")], 40),
];

describe("query handling", () => {
  it("tokenizes case/accent-insensitively and caps the term count", () => {
    expect(tokenizeQuery("  Crème   BRÛLÉE! ")).toEqual(["creme", "brulee"]);
    expect(tokenizeQuery("a b c d e f g h i j k")).toHaveLength(8);
    expect(tokenizeQuery("!!! ---")).toEqual([]);
  });

  it("builds an FTS5 expression that can never be interpreted as FTS syntax", () => {
    expect(buildFtsQuery("nasi goreng")).toBe('"nasi"* "goreng"*');
    // operators, column filters, quotes and parentheses are just text
    expect(buildFtsQuery('title:secret OR NEAR("x" y) "unbalanced')).toBe('"title"* "secret"* "or"* "near"* "x"* "y"* "unbalanced"*');
    expect(buildFtsQuery("   ")).toBeNull();
  });

  it("makes snippets with [[highlight]] markers and ellipses, never raw HTML", () => {
    const long = "x ".repeat(200) + "the Kubernetes rollout is fine " + "y ".repeat(200);
    const s = makeSnippet(long, ["kubernetes"]);
    expect(s).toContain("[[Kubernetes]]");
    expect(s.startsWith("…") && s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThan(260);
    expect(makeSnippet("<img src=x onerror=alert(1)> hello", ["hello"])).toBe("<img src=x onerror=alert(1)> [[hello]]"); // passed through as text
    expect(makeSnippet("", ["a"])).toBe("");
  });
});

describe("scan fallback (JSON backend)", () => {
  it("finds word-prefix matches and returns the best message per conversation", () => {
    const hits = searchConversationsJs(CORPUS, "kube roll");
    expect(hits.map((h) => h.conversationId)).toEqual(["c1"]);
    expect(hits[0]).toMatchObject({ title: "Kubernetes deploy", messageId: "m1" });
    expect(hits[0].snippet).toMatch(/\[\[Kube/);
  });

  it("requires ALL terms within one message (title counts), not anywhere in the chat", () => {
    expect(searchConversationsJs(CORPUS, "kubectl nasi")).toEqual([]);
    expect(searchConversationsJs(CORPUS, "kubernetes kubectl").map((h) => h.messageId)).toEqual(["m2"]);
  });

  it("ignores accents and case; does not match mid-word", () => {
    expect(searchConversationsJs(CORPUS, "CREME brulee")[0].conversationId).toBe("c3");
    expect(searchConversationsJs(CORPUS, "goreng")).toHaveLength(1);
    expect(searchConversationsJs(CORPUS, "oreng")).toEqual([]);
  });

  it("respects limit, skips empty messages, handles empty query", () => {
    expect(searchConversationsJs(CORPUS, "a")).toHaveLength(2); // words starting with "a": c1 and c3
    expect(searchConversationsJs(CORPUS, "a", 1)).toHaveLength(1);
    expect(searchConversationsJs(CORPUS, "")).toEqual([]);
    expect(searchConversationsJs([], "x")).toEqual([]);
  });
});

// The real backend (SQLite FTS5 on Node >= 22, JSON scan otherwise) through the route.
describe("GET /api/history/search (real serverDb)", () => {
  const prevDataDir = process.env.LYRA_DATA_DIR; // set per test file by tests/setup/isolateDataDir.ts
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "lyra-hist-"));
    process.env.LYRA_DATA_DIR = path.join(dir, "data");
  });
  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100)); // the JSON backend persists asynchronously; let it finish first
    if (prevDataDir === undefined) delete process.env.LYRA_DATA_DIR;
    else process.env.LYRA_DATA_DIR = prevDataDir;
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
  });

  const get = async (qs: string) => {
    const { GET } = await import("../app/api/history/search/route");
    return GET(new NextRequest(`http://localhost:3000/api/history/search?${qs}`));
  };

  it("indexes stored conversations, finds them, and re-indexes after an update or delete", async () => {
    const { writeServerDb, getStorageBackend } = await import("../lib/serverDb");
    await writeServerDb({ conversations: CORPUS });

    const r1 = await (await get("q=kubectl")).json();
    expect(r1.hits.map((h: any) => h.conversationId)).toEqual(["c1"]);
    expect(r1.engine).toBe(getStorageBackend() === "sqlite" ? "fts5" : "scan");
    expect(r1.hits[0].snippet).toContain("[[kubectl]]");

    // change a conversation: the index must notice
    const changed = conv("c2", "Resep nasi goreng", [msg("m3", "user", "Resep rendang padang"), msg("m4", "assistant", "Masak 4 jam.")], 99);
    await writeServerDb({ conversations: [changed] });
    expect((await (await get("q=rendang")).json()).hits.map((h: any) => h.conversationId)).toEqual(["c2"]);
    expect((await (await get("q=kecap")).json()).hits).toEqual([]);

    // remove everything
    await writeServerDb({ conversations: [], overwrite: true });
    expect((await (await get("q=kubectl")).json()).hits).toEqual([]);
  });

  it("returns 400 for a missing or oversized query and never 500s on hostile input", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get(`q=${"a".repeat(300)}`)).status).toBe(400);
    for (const q of ['"', "NEAR(", "title:x", "*", "-", "a OR"]) {
      const res = await get(`q=${encodeURIComponent(q)}`);
      expect(res.status, q).toBe(200);
    }
  });
});
