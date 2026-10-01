import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

/**
 * Guards against committing private data. Runs in CI on every PR.
 *
 * Motivation: `data-backup/db.sqlite3-wal` (real chat history and project files) was once
 * committed to this public repository because the backup folder was not git-ignored.
 */
const ROOT = path.join(__dirname, "..");

function trackedFiles(): string[] | null {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\0")
      .filter(Boolean);
  } catch {
    return null; // not a git checkout (e.g. a source tarball) — nothing to check
  }
}

const FORBIDDEN: [RegExp, string][] = [
  [/(^|\/)data(-[^/]*)?\//, "runtime data directory (data/, data-backup/, …)"],
  // `git add -A` also adds a bare/mirror clone sitting inside the project folder (e.g. the lyra-clean.git
  // that git-filter-repo works in) as hundreds of ordinary files, including its whole object database.
  [/(^|\/)[^/]+\.git\//, "nested git repository (mirror / bare clone)"],
  [/(^|\/)objects\/pack\//, "git pack files"],
  [/(^|\/)[^/]*-backup\//, "backup directory"],
  [/\.(sqlite3?|db)(-wal|-shm|-journal)?$/i, "database file"],
  [/(^|\/)db\.json(\.migrated\.bak)?$/, "JSON database"],
  [/(^|\/)(response|embeddings)-cache\.json$/, "cache file derived from private content"],
  [/(^|\/)\.env(\.[^/]*)?$/, "environment file"],
  [/-bridge-token\.json$/, "bridge token"],
  [/\.(pem|p12|pfx|kdbx|ppk)$/i, "key/credential file"],
  [/(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/, "private key"],
];
const ALLOWED = new Set([".env.example"]);

// High-confidence secret formats (see lib/redaction.ts). Test fixtures and docs
// legitimately contain fake ones, so only scan product code/config.
// Files that contain these formats on purpose: they are the detectors themselves.
const SECRET_SCAN_ALLOWLIST = new Set(["lib/redaction.ts", "lib/memoryExtractor.ts"]);

const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bsk-ant-[A-Za-z0-9_-]{30,}/, "Anthropic key"],
  [/\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]{30,}/, "OpenAI key"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/\bgsk_[A-Za-z0-9]{40,}/, "Groq key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})/, "GitHub token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key block"],
];

describe("repository hygiene", () => {
  const files = trackedFiles();

  it.skipIf(files === null)("tracks no private data, databases, env files, or credentials", () => {
    const offenders = files!
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) => FORBIDDEN.filter(([re]) => re.test(f)).map(([, why]) => `${f}  (${why})`));
    expect(offenders, "commit-blocking files are tracked; `git rm --cached` them and extend .gitignore").toEqual([]);
  });

  it.skipIf(files === null)("contains no high-confidence secrets in product code or config", () => {
    const scan = files!.filter(
      (f) => !f.startsWith("tests/") && !SECRET_SCAN_ALLOWLIST.has(f) && !/\.(md|png|webp|svg|lock)$/i.test(f) && f !== "package-lock.json" && !f.startsWith("public/")
    );
    const hits: string[] = [];
    for (const f of scan) {
      let text: string;
      try {
        text = fs.readFileSync(path.join(ROOT, f), "utf-8");
      } catch {
        continue; // deleted in the working tree but still in the index
      }
      for (const [re, label] of SECRET_PATTERNS) if (re.test(text)) hits.push(`${f}: ${label}`);
    }
    expect(hits).toEqual([]);
  });

  it(".gitignore covers the patterns that caused the leak", () => {
    const gi = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf-8");
    for (const rule of ["/data/", "/data-*/", "/*-backup/", "*.sqlite3-*", ".env.local", "/*.git/"]) expect(gi).toContain(rule);
  });
});
