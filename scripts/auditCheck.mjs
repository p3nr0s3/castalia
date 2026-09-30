import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";

/**
 * CI helper: compares `npm audit --json` output with .github/audit-baseline.json.
 *
 * next@14 has known advisories with no patch in the 14.x line (see the security note
 * in next.config.mjs), so a plain `npm audit` is permanently red and therefore
 * ignored. This makes the signal useful again: advisories that were already
 * reviewed are listed in the baseline and pass; ANY advisory or package not in the
 * baseline fails the job, forcing a fresh look.
 *
 * To accept a new advisory after reviewing it, add its id (and the package, if new)
 * to .github/audit-baseline.json and update `reviewedOn`.
 */

/**
 * @param {any} audit parsed `npm audit --json`
 * @param {{ packages?: string[], advisories?: number[] }} baseline
 * @returns {{ packages: string[], advisories: number[], total: number }}
 */
export function findUnreviewed(audit, baseline) {
  const knownPackages = new Set(baseline.packages ?? []);
  const knownAdvisories = new Set(baseline.advisories ?? []);
  const vulns = audit?.vulnerabilities ?? {};
  /** @type {Set<string>} */
  const packages = new Set();
  /** @type {Set<number>} */
  const advisories = new Set();
  let total = 0;
  for (const [name, v] of Object.entries(vulns)) {
    total++;
    if (!knownPackages.has(name)) packages.add(name);
    for (const via of /** @type {any[]} */ (v.via ?? [])) {
      // String entries just point at another vulnerable package (already counted by name).
      if (typeof via === "object" && via && typeof via.source === "number" && !knownAdvisories.has(via.source)) {
        advisories.add(via.source);
      }
    }
  }
  return { packages: [...packages].sort(), advisories: [...advisories].sort((a, b) => a - b), total };
}

function main() {
  const baselinePath = fileURLToPath(new URL("../.github/audit-baseline.json", import.meta.url));
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
  const raw = fs.readFileSync(0, "utf-8");
  let audit;
  try {
    audit = JSON.parse(raw);
  } catch {
    console.error("auditCheck: input is not JSON (did `npm audit --json` fail, e.g. no network?).");
    process.exit(2);
  }
  if (audit?.error) {
    console.error(`auditCheck: npm audit reported an error: ${audit.error.summary ?? JSON.stringify(audit.error)}`);
    process.exit(2);
  }
  const result = findUnreviewed(audit, baseline);
  console.log(`npm audit: ${result.total} vulnerable package(s); baseline reviewed on ${baseline.reviewedOn}.`);
  if (result.packages.length === 0 && result.advisories.length === 0) {
    console.log("No advisories outside the reviewed baseline.");
    return;
  }
  console.log("\nNOT in the reviewed baseline:");
  if (result.packages.length) console.log(`  packages:   ${result.packages.join(", ")}`);
  if (result.advisories.length) console.log(`  advisories: ${result.advisories.join(", ")}  (https://github.com/advisories — search the GHSA via the npm advisory id)`);
  console.log("\nReview them, then add them to .github/audit-baseline.json (see scripts/auditCheck.mjs).");
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
