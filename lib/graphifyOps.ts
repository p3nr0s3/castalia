// lib/graphifyOps.ts
//
// Wraps the `graphify` CLI (PyPI package `graphifyy`) so the model can answer
// architecture questions about THIS project's own codebase by traversing a
// locally-built code graph instead of guessing from training data.
//
// Scope decision: queries this app's own codebase graph only, not an
// arbitrary user-selected folder. Smaller, ships now, generalizable later
// if actually needed.
//
// IMPORTANT: uses child_process.spawn (async), never spawnSync — see the
// e61a596 lesson ("perf(sandbox): stop Python code execution from freezing
// the entire server"). A synchronous child process here would block the
// whole Next.js server process for every concurrent request, not just the
// one that triggered the tool call.

import { spawn } from "child_process";
import path from "path";

const PROJECT_ROOT = process.cwd();
const GRAPH_PATH = path.join(PROJECT_ROOT, "graphify-out", "graph.json");
const CLI_TIMEOUT_MS = 30_000;
const QUERY_BUDGET_TOKENS = 800; // keeps output safely under the 4000-char cap on tool-result text fed back to the model

export class GraphifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphifyError";
  }
}

function runGraphifyCli(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("graphify", args, { cwd: PROJECT_ROOT });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new GraphifyError(`graphify ${args[0]} timed out after ${CLI_TIMEOUT_MS / 1000}s.`));
    }, CLI_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(
          new GraphifyError(
            "The 'graphify' binary isn't on PATH. Install it with: pip install graphifyy --break-system-packages"
          )
        );
      } else {
        reject(new GraphifyError(`Failed to start graphify: ${err.message}`));
      }
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new GraphifyError(stderr.trim() || `graphify ${args[0]} exited with code ${code}.`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// Build the graph once per server-process lifetime. Concurrent calls that
// arrive while a build is already in flight share the same promise instead
// of triggering redundant extractions.
let graphBuildPromise: Promise<void> | null = null;

async function ensureGraphBuilt(): Promise<void> {
  if (!graphBuildPromise) {
    graphBuildPromise = runGraphifyCli(["extract", PROJECT_ROOT, "--code-only"])
      .then(() => undefined)
      .catch((err) => {
        // Let the next call retry instead of caching a permanent failure.
        graphBuildPromise = null;
        throw err;
      });
  }
  return graphBuildPromise;
}

export async function explainSymbol(symbol: string): Promise<string> {
  await ensureGraphBuilt();
  return runGraphifyCli(["explain", symbol, "--graph", GRAPH_PATH]);
}

export async function queryGraph(question: string): Promise<string> {
  await ensureGraphBuilt();
  return runGraphifyCli(["query", question, "--budget", String(QUERY_BUDGET_TOKENS), "--graph", GRAPH_PATH]);
}

export async function pathBetween(from: string, to: string): Promise<string> {
  await ensureGraphBuilt();
  return runGraphifyCli(["path", from, to, "--graph", GRAPH_PATH]);
}
