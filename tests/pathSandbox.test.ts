import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { resolveWithinBase } from "../lib/pathSandbox";

describe("resolveWithinBase", () => {
  let base: string;

  beforeAll(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), "sandbox-base-"));
    // Sibling directory whose name starts with the same string as `base`.
    // This is the exact shape of the bug: a naive `startsWith(base)` check
    // (no path separator) would wrongly treat this as "inside base".
    await fs.mkdir(base + "-sibling");
  });

  afterAll(async () => {
    await fs.rm(base, { recursive: true, force: true });
    await fs.rm(base + "-sibling", { recursive: true, force: true });
  });

  it("allows the base directory itself", () => {
    expect(resolveWithinBase(base)).toBe(path.normalize(base));
    expect(resolveWithinBase(base, ".")).toBe(path.normalize(base));
    expect(resolveWithinBase(base, "")).toBe(path.normalize(base));
  });

  it("allows a real subdirectory", () => {
    const result = resolveWithinBase(base, "sub/file.txt");
    expect(result).toBe(path.join(base, "sub", "file.txt"));
  });

  it("rejects ../ escaping the base directory", () => {
    expect(() => resolveWithinBase(base, "../outside.txt")).toThrow(/Access denied/);
  });

  it("rejects a sibling directory whose name shares the base as a string prefix", () => {
    // This is the regression case: base = "/tmp/sandbox-base-XXXX",
    // sibling = "/tmp/sandbox-base-XXXX-sibling". A bare `startsWith(base)`
    // check would incorrectly accept this.
    const escapeAttempt = path.join(base, "..", path.basename(base) + "-sibling", "secret.txt");
    expect(() => resolveWithinBase(base, escapeAttempt)).toThrow(/Access denied/);
  });

  it("rejects an absolute path outside the base directory", () => {
    expect(() => resolveWithinBase(base, "/etc/passwd")).toThrow(/Access denied/);
  });
});
