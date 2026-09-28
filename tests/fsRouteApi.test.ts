import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/fs/route";

// This route sandboxes every path to the user's home directory
// (HOME_DIR = os.homedir(), fixed at module load — see app/api/fs/route.ts).
// lib/pathSandbox.ts's resolveWithinBase itself is unit-tested in
// tests/pathSandbox.test.ts; this file tests the route's actual HTTP
// surface — that GET/POST call it correctly, and that a sandbox violation
// comes back as 403 (not 500, which would leak that the path merely
// "failed" without telling the caller why).
describe("Filesystem Explorer API (/api/fs)", () => {
  // Real files under os.homedir() so resolveWithinHome's sandbox check
  // (which is hardcoded to os.homedir(), not overridable per-test) accepts
  // them. Using the real home directory is unavoidable here without
  // refactoring the route to accept an injectable base dir.
  let testDir: string;
  let testFile: string;

  beforeAll(async () => {
    testDir = await fs.mkdtemp(path.join(os.homedir(), ".castalia-fs-route-test-"));
    testFile = path.join(testDir, "hello.txt");
    await fs.writeFile(testFile, "hello world, this is a test file for the fs route");
    await fs.mkdir(path.join(testDir, "subdir"));
    await fs.writeFile(path.join(testDir, "subdir", "nested.txt"), "nested content");
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  function makeGetRequest(targetPath?: string): NextRequest {
    const url = new URL("http://localhost:3000/api/fs");
    if (targetPath) url.searchParams.set("path", targetPath);
    return new NextRequest(url);
  }

  function makePostRequest(body: Record<string, any>): NextRequest {
    return new NextRequest("http://localhost:3000/api/fs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  describe("GET (list directory)", () => {
    it("lists a real directory's contents, sorted directories-first then alphabetically", async () => {
      const res = await GET(makeGetRequest(testDir));
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.currentPath).toBe(path.normalize(testDir));
      const names = data.items.map((i: any) => i.name);
      expect(names).toContain("hello.txt");
      expect(names).toContain("subdir");
      // "subdir" (a directory) must sort before "hello.txt" despite 's' > 'h' alphabetically
      expect(names.indexOf("subdir")).toBeLessThan(names.indexOf("hello.txt"));
    });

    it("marks .txt files as readable text and reports their size", async () => {
      const res = await GET(makeGetRequest(testDir));
      const data = await res.json();
      const helloEntry = data.items.find((i: any) => i.name === "hello.txt");

      expect(helloEntry.isDirectory).toBe(false);
      expect(helloEntry.isReadableText).toBe(true);
      expect(helloEntry.size).toBeGreaterThan(0);
    });

    it("defaults to the home directory when no path is given", async () => {
      const res = await GET(makeGetRequest());
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.currentPath).toBe(path.normalize(os.homedir()));
    });

    it("rejects a path traversal attempt with 403, not 500", async () => {
      const res = await GET(makeGetRequest(path.join(testDir, "..", "..", "..", "etc")));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Access denied/);
    });

    it("rejects an absolute path outside the home directory with 403", async () => {
      // /etc is outside any normal user's home directory on Linux/macOS.
      const res = await GET(makeGetRequest("/etc"));
      expect(res.status).toBe(403);
    });

    it("returns 400 when the path points to a file, not a directory", async () => {
      const res = await GET(makeGetRequest(testFile));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/not a directory/);
    });
  });

  describe("POST action=read (read file content)", () => {
    it("reads a real file's content", async () => {
      const res = await POST(makePostRequest({ action: "read", filePath: testFile }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.content).toBe("hello world, this is a test file for the fs route");
      expect(data.name).toBe("hello.txt");
    });

    it("infers action=read from a bare filePath with no explicit action", async () => {
      const res = await POST(makePostRequest({ filePath: testFile }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.content).toContain("hello world");
    });

    it("rejects reading a directory as a file with 400", async () => {
      const res = await POST(makePostRequest({ action: "read", filePath: testDir }));
      expect(res.status).toBe(400);
    });

    it("rejects a file over maxFileSize with 400 and a human-readable size in the message", async () => {
      const bigFile = path.join(testDir, "big.txt");
      await fs.writeFile(bigFile, "x".repeat(1024)); // 1KB
      const res = await POST(makePostRequest({ action: "read", filePath: bigFile, maxFileSize: 100 }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/exceeds maximum/);
      await fs.rm(bigFile);
    });

    it("rejects a path traversal attempt in filePath with 403", async () => {
      const res = await POST(makePostRequest({ action: "read", filePath: "/etc/passwd" }));
      expect(res.status).toBe(403);
    });
  });

  describe("POST action=search (search within directory)", () => {
    it("finds a file by filename match", async () => {
      const res = await POST(makePostRequest({ action: "search", directoryPath: testDir, query: "hello" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.results.some((r: any) => r.name === "hello.txt")).toBe(true);
    });

    it("finds a file by content match, case-insensitively", async () => {
      const res = await POST(makePostRequest({ action: "search", directoryPath: testDir, query: "WORLD" }));
      const data = await res.json();
      expect(data.results.some((r: any) => r.name === "hello.txt")).toBe(true);
    });

    it("only searches the given directory, not subdirectories (matches the route's readdir-only behavior)", async () => {
      const res = await POST(makePostRequest({ action: "search", directoryPath: testDir, query: "nested" }));
      const data = await res.json();
      // "nested content" lives in testDir/subdir/nested.txt — outside a
      // single-level readdir of testDir itself.
      expect(data.results.some((r: any) => r.name === "nested.txt")).toBe(false);
    });

    it("returns an empty result set (not an error) for a query that matches nothing", async () => {
      const res = await POST(makePostRequest({ action: "search", directoryPath: testDir, query: "zzz_no_match_zzz" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.results).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("returns 400 for an action with none of the recognized shapes (no filePath, no directoryPath+query)", async () => {
      // The route's dispatch is `if (action === "read" || filePath)` then
      // `if (action === "search" && directoryPath && query)` — an
      // unrecognized action falls through to "Invalid action" only when it
      // also lacks a filePath (which would route it to "read" regardless
      // of the action string) and lacks directoryPath+query.
      const res = await POST(makePostRequest({ action: "delete" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Invalid action/);
    });

    it("routes to the read branch when filePath is present, even with an unrelated action value (documents the route's actual dispatch logic)", async () => {
      const res = await POST(makePostRequest({ action: "delete", filePath: testFile }));
      // Not a 400 "Invalid action" — `action === "read" || filePath` means
      // any truthy filePath takes the read path regardless of `action`.
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.content).toContain("hello world");
    });

    it("returns 500 (not 403) for a nonexistent file inside the sandbox — the path itself was allowed, the file just isn't there", async () => {
      const res = await POST(makePostRequest({ action: "read", filePath: path.join(testDir, "does-not-exist.txt") }));
      expect(res.status).toBe(500);
    });
  });
});
