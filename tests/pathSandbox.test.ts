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

import {
  assertNotSensitivePath,
  resolveOnLocalDisk,
  resolveWithinHomeSafe,
  realPathOfNearestExisting,
} from "../lib/pathSandbox";

describe("symlink containment", () => {
  let base: string;
  let outside: string;
  // Creating symlinks needs Developer Mode or admin rights on Windows (EPERM otherwise).
  // That is a limit of the test machine, not of the code under test, so skip there.
  let symlinksAvailable = true;

  beforeAll(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), "sandbox-link-base-"));
    outside = await fs.mkdtemp(path.join(os.tmpdir(), "sandbox-link-outside-"));
    await fs.writeFile(path.join(outside, "secret.txt"), "top secret");
    await fs.mkdir(path.join(base, "real"));
    try {
      await fs.symlink(outside, path.join(base, "escape"), "dir");
    } catch (err: any) {
      if (err?.code !== "EPERM" && err?.code !== "EACCES") throw err;
      symlinksAvailable = false;
    }
  });
  afterAll(async () => {
    await fs.rm(base, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  it("rejects a path that goes through a symlink pointing outside the base", (ctx) => {
    if (!symlinksAvailable) return ctx.skip();
    expect(() => resolveWithinBase(base, "escape/secret.txt")).toThrow(/symbolic link/);
    expect(() => resolveWithinBase(base, "escape/new-file.txt")).toThrow(/Access denied/);
  });

  it("still allows normal and not-yet-existing paths inside the base", () => {
    expect(resolveWithinBase(base, "real/a.txt")).toBe(path.join(base, "real", "a.txt"));
    expect(resolveWithinBase(base, "real/deeper/new/file.txt")).toBe(path.join(base, "real", "deeper", "new", "file.txt"));
  });

  it("realPathOfNearestExisting appends the missing tail to the real ancestor", async () => {
    const real = await fs.realpath(base);
    expect(realPathOfNearestExisting(path.join(base, "nope", "x.txt"))).toBe(path.join(real, "nope", "x.txt"));
  });
});

describe("credential locations", () => {
  const home = path.join(path.sep, "home", "rei");
  const app = path.join(path.sep, "srv", "lyra");

  it("blocks credential stores, private keys, and this app's own secrets", () => {
    for (const p of [
      path.join(home, ".ssh", "id_ed25519"),
      path.join(home, ".ssh"),
      path.join(home, ".aws", "credentials"),
      path.join(home, ".config", "gcloud", "x.json"),
      path.join(home, "projects", "deploy", "id_rsa"),
      path.join(app, ".env.local"),
      path.join(app, ".env"),
      path.join(app, "data", "db.sqlite3"),
    ]) {
      expect(() => assertNotSensitivePath(p, home, app), p).toThrow(/Access denied/);
    }
  });

  it("allows ordinary files, public keys, .env.example and lookalike names", () => {
    for (const p of [
      path.join(home, "projects", "app", "index.ts"),
      path.join(home, ".ssh-notes.txt"),
      path.join(home, "sshd_config.md"),
      path.join(home, "keys", "id_rsa.pub"),
      path.join(app, ".env.example"),
      path.join(app, "lib", ".env"), // only the app-root env file is the app's own secret
      path.join(app, "database", "x.json"),
    ]) {
      expect(() => assertNotSensitivePath(p, home, app), p).not.toThrow();
    }
  });

  it("resolveOnLocalDisk (chat tools) blocks the user's credential stores and allows ordinary paths", () => {
    expect(() => resolveOnLocalDisk(path.join(os.homedir(), ".ssh", "id_rsa"))).toThrow(/Access denied/);
    expect(() => resolveOnLocalDisk(path.join(os.tmpdir(), "ok.txt"))).not.toThrow();
  });

  it.skipIf(process.platform === "win32")("resolveOnLocalDisk applies the POSIX OS denylist", () => {
    expect(() => resolveOnLocalDisk("/proc/self/environ")).toThrow(/Access denied/);
    expect(() => resolveOnLocalDisk("/dev/null")).toThrow(/Access denied/);
    expect(() => resolveOnLocalDisk("/etc/passwd")).toThrow(/Access denied/);
  });

  it.skipIf(process.platform !== "win32")("resolveOnLocalDisk applies the Windows OS denylist", () => {
    expect(() => resolveOnLocalDisk("C:\\Windows\\System32\\drivers\\etc\\hosts")).toThrow(/Access denied/);
    expect(() => resolveOnLocalDisk("C:\\Program Files\\App\\x.dll")).toThrow(/Access denied/);
  });

  it("resolveWithinHomeSafe applies containment and the denylist together", () => {
    const h = os.homedir();
    expect(() => resolveWithinHomeSafe(".ssh/id_rsa", h)).toThrow(/Access denied/);
    expect(() => resolveWithinHomeSafe("/etc/passwd", h)).toThrow(/Access denied/);
    expect(resolveWithinHomeSafe("projects/x.ts", h)).toBe(path.join(path.resolve(h), "projects", "x.ts"));
  });
});
