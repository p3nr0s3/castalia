import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { streamChatCompletion } from "../lib/ollama";
import { buildProjectSymbolGraph, type DocumentChunk } from "../lib/rag";
import {
  generateAndStoreBridgeToken,
  getBridgeToken,
  testBridgeConnection,
  executeBridgeAction,
} from "../lib/localAppBridge";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

function ndjson(lines: object[], opts: { status?: number } = {}): Response {
  return new Response(lines.map((l) => JSON.stringify(l)).join("\n") + "\n", { status: opts.status ?? 200 });
}

describe("streamChatCompletion — errors reported inside a 200 stream", () => {
  const base = { provider: "ollama" as const, model: "llama3.1:8b", messages: [{ id: "1", role: "user" as const, content: "hi", timestamp: 0 }] };

  it("throws the Ollama error instead of silently returning a truncated answer", async () => {
    global.fetch = vi.fn().mockImplementation(async () =>
      ndjson([
        { message: { content: "Partial answer " }, done: false },
        { error: "llama runner process has terminated: signal: killed" },
      ])
    ) as any;
    const tokens: string[] = [];
    const onError = vi.fn();
    await expect(streamChatCompletion({ ...base, onToken: (t: string) => tokens.push(t), onError } as any)).rejects.toThrow(/runner process has terminated/);
    expect(tokens.join("")).toBe("Partial answer ");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("still completes a normal stream and reports metrics", async () => {
    global.fetch = vi.fn().mockImplementation(async () =>
      ndjson([
        { message: { content: "Hello" }, done: false },
        { message: { content: " world" }, done: false },
        { done: true, eval_count: 10, eval_duration: 1e9 },
      ])
    ) as any;
    const onFinish = vi.fn();
    const out = await streamChatCompletion({ ...base, onToken: () => {}, onFinish } as any);
    expect(out).toBe("Hello world");
    expect(onFinish.mock.calls[0][1].evalTps).toBe(10);
  });
});

describe("buildProjectSymbolGraph — symbol names are data, not regex", () => {
  const chunk = (id: string, text: string, defined: string[] = []): DocumentChunk => ({
    id, fileName: id + ".ts", fileId: id, chunkIndex: 0, totalChunks: 1, text, charCount: text.length,
    estimatedTokens: 10, preview: text.slice(0, 10), symbolsDefined: defined,
  });

  it("finds references to `$`-prefixed identifiers (they never matched before)", () => {
    const g = buildProjectSymbolGraph([chunk("store", "export const $store = 1", ["$store"]), chunk("use", "import { $store } from './store'; $store.set(2)")]);
    expect(g.chunkReferencedSymbols.get("use")).toContain("$store");
  });

  it("does not throw on names containing regex metacharacters, and does not over-match substrings", () => {
    expect(() =>
      buildProjectSymbolGraph([chunk("a", "def f(): pass", ["a+b", "(x", "f("]), chunk("b", "call a+b and (x and f(")])
    ).not.toThrow();
    const g = buildProjectSymbolGraph([chunk("d", "function parse(){}", ["parse"]), chunk("u", "reparse(); parser.run()")]);
    expect(g.chunkReferencedSymbols.get("u")).toBeUndefined();
  });
});

describe("localAppBridge hardening", () => {
  let dir: string;
  const cwd = process.cwd();
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "lyra-bridge-"));
    process.chdir(dir);
  });
  afterAll(() => {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.skipIf(process.platform === "win32")("stores the bridge token with owner-only permissions", () => {
    const token = generateAndStoreBridgeToken({ id: "perm-test", displayName: "T", defaultUrl: "http://127.0.0.1:1" });
    const mode = fs.statSync(path.join(dir, "data", "perm-test-bridge-token.json")).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(getBridgeToken({ id: "perm-test", displayName: "T", defaultUrl: "" })).toBe(token);
  });

  it("refuses bridge ids that would escape the data directory", () => {
    for (const id of ["../evil", "a/b", "a\\b", "", "x".repeat(65), "with space"]) {
      expect(() => generateAndStoreBridgeToken({ id, displayName: "T", defaultUrl: "" }), id).toThrow(/Invalid bridge id/);
    }
    expect(getBridgeToken({ id: "../evil", displayName: "T", defaultUrl: "" })).toBe("");
  });

  it("never follows redirects (the X-Bridge-Token header would be forwarded)", async () => {
    const spy = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://attacker.example/" } }));
    global.fetch = spy as any;
    const bridge = { id: "redir-test", displayName: "R", defaultUrl: "http://127.0.0.1:9", executePath: "/execute" };
    expect((await testBridgeConnection(bridge, "http://127.0.0.1:9")).reachable).toBe(false);
    const res = await executeBridgeAction(bridge, "http://127.0.0.1:9", { a: 1 });
    expect(res.isBridgeOffline).toBe(true);
    for (const call of spy.mock.calls) expect(call[1].redirect).toBe("manual");
  });
});
