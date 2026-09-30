import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { parseEnvFile, loadEnv } from "../scripts/loadEnv.mjs";

describe("scripts/loadEnv.mjs", () => {
  it("parses comments, quotes, export prefixes, inline comments and CRLF", () => {
    const parsed = parseEnvFile(
      ['# comment', 'A=1', 'export B="two words"', "C='x'", "D=val # trailing", "E=", "not a line", ""].join("\r\n")
    );
    expect(parsed).toEqual({ A: "1", B: "two words", C: "x", D: "val", E: "" });
  });

  it("reads .env.local (the place the README tells users to put the token) and respects precedence", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lyra-env-"));
    fs.writeFileSync(path.join(dir, ".env"), "APP_ACCESS_TOKEN=from-env\nONLY_ENV=1\n");
    fs.writeFileSync(path.join(dir, ".env.local"), "APP_ACCESS_TOKEN=from-local\nNEXT_PUBLIC_APP_ACCESS_TOKEN=from-local\n");
    try {
      const fromFiles = loadEnv(dir, {});
      expect(fromFiles.APP_ACCESS_TOKEN).toBe("from-local");
      expect(fromFiles.NEXT_PUBLIC_APP_ACCESS_TOKEN).toBe("from-local");
      expect(fromFiles.ONLY_ENV).toBe("1");
      expect(loadEnv(dir, { APP_ACCESS_TOKEN: "from-shell" }).APP_ACCESS_TOKEN).toBe("from-shell");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns an empty object when no env files exist", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lyra-env-empty-"));
    try {
      expect(loadEnv(dir, {})).toEqual({});
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("tunnel URL detection", () => {
  const re = /https:\/\/[a-zA-Z0-9.-]+\.pinggy(?:-free)?\.(?:link|net|io)\b/g;
  it("matches every known Pinggy free-tier URL shape", () => {
    for (const u of ["https://abc-1-2-3-4.a.free.pinggy.link", "https://abc.run.pinggy-free.link", "https://abc.free.pinggy.net", "https://abc.a.pinggy.link"]) {
      expect(`tunnel at ${u} ok`.match(re)?.[0], u).toBe(u);
    }
    expect("https://example.com".match(re)).toBeNull();
  });
});
