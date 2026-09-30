import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Uses the real serverDb in an isolated working directory (it keeps data/ under process.cwd()).
describe("readServerDbVersion (real backend)", () => {
  const cwd = process.cwd();
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "lyra-dbver-"));
    process.chdir(dir);
  });
  afterAll(() => {
    process.chdir(cwd);
    try {
      // On Windows the SQLite file may still be open (there is no close hook), which makes
      // deletion fail with EPERM/EBUSY. A leftover temp directory is not a test failure.
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {}
  });

  it("tracks the same version number as readServerDb and increments on write", async () => {
    const { readServerDb, readServerDbVersion, writeServerDb } = await import("../lib/serverDb");
    const v0 = await readServerDbVersion();
    expect(v0).toBe((await readServerDb()).version);
    await writeServerDb({ journalEntries: [{ id: "j1", title: "t", content: "", icon: "", category: "daily", status: "draft", priority: "low", tags: [], checklists: [], createdAt: 1, updatedAt: 1 } as any] });
    const v1 = await readServerDbVersion();
    expect(v1).toBeGreaterThan(v0);
    expect(v1).toBe((await readServerDb()).version);
  });
});
