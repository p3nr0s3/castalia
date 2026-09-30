import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { findUnreviewed } from "../scripts/auditCheck.mjs";

const audit = (vulns: Record<string, any>) => ({ vulnerabilities: vulns });
const baseline = { packages: ["next", "postcss"], advisories: [1, 2, 3] };

describe("findUnreviewed", () => {
  it("passes when everything reported is in the baseline (string `via` entries are just links)", () => {
    const r = findUnreviewed(
      audit({ next: { via: [{ source: 1 }, { source: 2 }, "postcss"] }, postcss: { via: [{ source: 3 }] } }),
      baseline
    );
    expect(r).toEqual({ packages: [], advisories: [], total: 2 });
  });

  it("flags a NEW advisory on an already-known package (a package-name allowlist would hide it)", () => {
    const r = findUnreviewed(audit({ next: { via: [{ source: 1 }, { source: 999 }] } }), baseline);
    expect(r.advisories).toEqual([999]);
    expect(r.packages).toEqual([]);
  });

  it("flags a new vulnerable package and its advisories", () => {
    const r = findUnreviewed(audit({ lodash: { via: [{ source: 4242 }] } }), baseline);
    expect(r.packages).toEqual(["lodash"]);
    expect(r.advisories).toEqual([4242]);
  });

  it("handles an empty / malformed report and an empty baseline", () => {
    expect(findUnreviewed({}, baseline)).toEqual({ packages: [], advisories: [], total: 0 });
    expect(findUnreviewed(audit({ next: { via: [{ source: 1 }] } }), {}).advisories).toEqual([1]);
  });
});

describe("audit CLI + checked-in baseline", () => {
  const script = path.join(__dirname, "..", "scripts", "auditCheck.mjs");
  const run = (stdin: string) => spawnSync(process.execPath, [script], { input: stdin, encoding: "utf-8" });

  it("the baseline file is well-formed", () => {
    const b = JSON.parse(fs.readFileSync(path.join(__dirname, "..", ".github", "audit-baseline.json"), "utf-8"));
    expect(b.reviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(b.packages.every((p: unknown) => typeof p === "string")).toBe(true);
    expect(b.advisories.every((n: unknown) => Number.isInteger(n))).toBe(true);
  });

  it("exits 0 for a clean report, 1 for an unreviewed advisory, 2 for garbage or an npm error", () => {
    expect(run(JSON.stringify({ vulnerabilities: {} })).status).toBe(0);
    const bad = run(JSON.stringify({ vulnerabilities: { evilpkg: { via: [{ source: 1 }] } } }));
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/evilpkg/);
    expect(run("not json").status).toBe(2);
    expect(run(JSON.stringify({ error: { summary: "request failed" } })).status).toBe(2);
  });

  it("the CI audit job no longer hides failures behind continue-on-error", () => {
    const ci = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ci.yml"), "utf-8");
    expect(ci).not.toMatch(/continue-on-error/);
    expect(ci).toContain("scripts/auditCheck.mjs");
  });
});
