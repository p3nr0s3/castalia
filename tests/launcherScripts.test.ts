import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { sanitizeChildEnv, isLanMode } from "../scripts/launchHelpers.mjs";

const script = path.join(__dirname, "..", "scripts", "warnOpenAccess.mjs");

function run(args: string[], env: Record<string, string>, cwdFiles: Record<string, string> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lyra-warn-"));
  for (const [name, content] of Object.entries(cwdFiles)) fs.writeFileSync(path.join(dir, name), content);
  try {
    // Start from a minimal env so a token in the developer's own shell can't leak into the test.
    return spawnSync(process.execPath, [script, ...args], {
      cwd: dir,
      env: { PATH: process.env.PATH || "", ...env } as unknown as NodeJS.ProcessEnv,
      encoding: "utf-8",
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("warnOpenAccess.mjs --lan (used by predev:lan / prestart:lan / launch.mjs)", () => {
  it("refuses to start (exit 1) when exposing the app without a token", () => {
    const r = run(["--lan"], {});
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/REFUSING TO START ON THE NETWORK/);
  });

  it("starts when the token is in .env.local (the documented place), not only in the shell", () => {
    const r = run(["--lan"], {}, { ".env.local": "APP_ACCESS_TOKEN=abc\nNEXT_PUBLIC_APP_ACCESS_TOKEN=abc\n" });
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/REFUSING|WARNING/);
  });

  it("allows an explicit, loudly-announced override", () => {
    const r = run(["--lan"], { ALLOW_OPEN_LAN: "1" });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/continuing WITHOUT a token/);
  });

  it("only warns (exit 0) for the localhost-only modes, and flags a token mismatch", () => {
    const open = run([], {});
    expect(open.status).toBe(0);
    expect(open.stdout).toMatch(/NO token check/);
    const mismatch = run([], { APP_ACCESS_TOKEN: "a", NEXT_PUBLIC_APP_ACCESS_TOKEN: "b" });
    expect(mismatch.status).toBe(0);
    expect(mismatch.stdout).toMatch(/different/);
  });
});

describe("launch helpers", () => {
  it("strips credentials from the env handed to the Laya Python process, keeps the rest", () => {
    const out = sanitizeChildEnv({
      PATH: "/usr/bin", HOME: "/home/u", LAYA_PORT: "8000", PYTHONUNBUFFERED: "1",
      OPENAI_API_KEY: "sk-x", ANTHROPIC_API_KEY: "sk-ant-x", APP_ACCESS_TOKEN: "t", NEXT_PUBLIC_APP_ACCESS_TOKEN: "t",
      HF_TOKEN: "hf_x", DB_PASSWORD: "p", STRIPE_SECRET: "s", UNDEFINED_ONE: undefined,
    });
    expect(Object.keys(out).sort()).toEqual(["HOME", "LAYA_PORT", "PATH", "PYTHONUNBUFFERED"]);
  });

  it("recognises the LAN modes", () => {
    expect(["dev:lan", "start:lan"].every(isLanMode)).toBe(true);
    expect(["dev", "start", "dev:all"].some(isLanMode)).toBe(false);
  });
});

describe("package.json wiring", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"));
  const npmrc = fs.readFileSync(path.join(__dirname, "..", ".npmrc"), "utf-8");

  it("does not rely on pre/post hooks while .npmrc has ignore-scripts=true (npm skips them)", () => {
    if (!/^\s*ignore-scripts\s*=\s*true/m.test(npmrc)) return;
    const hooks = Object.keys(pkg.scripts).filter((n) => /^(pre|post)/.test(n) && pkg.scripts[n.replace(/^(pre|post)/, "")]);
    expect(hooks, "hooks that npm silently ignores").toEqual([]);
  });

  it("every script that starts the server runs the access check directly, and LAN ones use --lan", () => {
    for (const name of ["dev", "start", "dev:lan", "start:lan"]) {
      expect(pkg.scripts[name], name).toContain("node scripts/warnOpenAccess.mjs");
    }
    for (const name of Object.keys(pkg.scripts)) {
      if (pkg.scripts[name].includes("0.0.0.0")) expect(pkg.scripts[name], name).toContain("warnOpenAccess.mjs --lan");
    }
  });

  it("launcher-based scripts (which run the check themselves) pass a :lan mode where needed", () => {
    expect(pkg.scripts["dev:all:lan"]).toContain("launch.mjs dev:lan");
    expect(pkg.scripts["prod:all:lan"]).toContain("launch.mjs start:lan");
  });
});
