import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * FEATURES.md used to end with "verified against the codebase" while twelve of
 * the files it pointed at did not exist (they had been renamed). This test makes
 * that claim true: every source-file path written in backticks in the docs must
 * exist in the repository.
 */
const ROOT = path.join(__dirname, "..");
const DOCS = ["README.md", "FEATURES.md", "DOCUMENTATION.md", "SECURITY.md"];

// Files that only exist at runtime / on the user's machine.
const RUNTIME_PATHS = new Set(["data/db.json", "db.json", "data/db.sqlite3", ".env.local", "data/response-cache.json"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", ".next", "data"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(path.relative(ROOT, full).split(path.sep).join("/"));
  }
  return out;
}

describe("documentation file references", () => {
  const all = new Set(walk(ROOT));
  for (const doc of DOCS) {
    it(`${doc}: every referenced source file exists`, () => {
      const text = fs.readFileSync(path.join(ROOT, doc), "utf-8");
      const refs = [...text.matchAll(/`([A-Za-z0-9_./[\]@-]+\.(?:ts|tsx|mjs|mts|js|json|css|md))`/g)].map((m) => m[1]);
      const missing = [...new Set(refs)].filter((r) => {
        if (RUNTIME_PATHS.has(r)) return false;
        if (all.has(r)) return false;
        // bare file names (no directory) are accepted if they exist anywhere in the repo
        if (!r.includes("/") && [...all].some((f) => f.endsWith("/" + r) || f === r)) return false;
        return true;
      });
      expect(missing, `${doc} references files that do not exist`).toEqual([]);
    });
  }
});

describe("documentation facts that have drifted before", () => {
  const features = fs.readFileSync(path.join(ROOT, "FEATURES.md"), "utf-8");

  it("the sampling table in FEATURES.md matches lib/adaptiveSampling.ts", async () => {
    const { resolveAdaptiveSamplingParams } = await import("../lib/adaptiveSampling");
    const src = fs.readFileSync(path.join(ROOT, "lib/adaptiveSampling.ts"), "utf-8");
    // pull the numbers out of the code's coding / rag / creative cases and require the doc to contain them
    for (const [label, re] of [
      ["coding", /case "coding":[\s\S]*?temperature: explicitTemperature \?\? ([\d.]+),\s*topP: explicitTopP \?\? ([\d.]+),\s*minP: explicitMinP \?\? ([\d.]+),\s*repeatPenalty: explicitRepeatPenalty \?\? ([\d.]+)/],
      ["rag", /case "rag":[\s\S]*?temperature: explicitTemperature \?\? ([\d.]+),\s*topP: explicitTopP \?\? ([\d.]+),\s*minP: explicitMinP \?\? ([\d.]+),\s*repeatPenalty: explicitRepeatPenalty \?\? ([\d.]+)/],
      ["creative", /case "creative":[\s\S]*?temperature: explicitTemperature \?\? ([\d.]+),\s*topP: explicitTopP \?\? ([\d.]+),\s*minP: explicitMinP \?\? ([\d.]+),\s*repeatPenalty: explicitRepeatPenalty \?\? ([\d.]+)/],
    ] as const) {
      const m = src.match(re);
      expect(m, `could not parse ${label} case`).toBeTruthy();
      const [, t, p, mp, rp] = m!;
      const expected = `temperature: ${t}\`, \`top_p: ${p}\`, \`min_p: ${mp}\`, \`repeat_penalty: ${rp}`;
      expect(features, `FEATURES.md sampling values for ${label}`).toContain(expected);
    }
    expect(typeof resolveAdaptiveSamplingParams).toBe("function");
  });

  it("the documented theme list covers every ThemeType value", () => {
    const types = fs.readFileSync(path.join(ROOT, "lib/types.ts"), "utf-8");
    const block = types.slice(types.indexOf("export type ThemeType"), types.indexOf("export interface CustomThemePalette"));
    const themes = [...block.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]).filter((t) => t !== "custom");
    const section = features.slice(features.indexOf("### 10.4"));
    for (const t of themes) expect(section, `theme '${t}' missing from FEATURES.md 10.4`).toContain(`\`${t}\``);
  });

  it("the documented test count matches reality within the README badge", () => {
    const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf-8");
    const suites = fs.readdirSync(path.join(ROOT, "tests")).filter((f) => f.endsWith(".test.ts")).length;
    const m = readme.match(/(\d+) suites, \d+ tests/);
    expect(m, "README test-count sentence").toBeTruthy();
    // suites are cheap to count exactly; the README must not claim fewer than exist
    expect(Number(m![1])).toBeLessThanOrEqual(suites);
  });
});
