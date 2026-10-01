import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// `npm run eval:rag` — runs the retrieval evaluation and prints the per-question report.
// Sets the env var here so it works the same in PowerShell, cmd and bash.
// vitest's package "exports" do not expose its bin, so address it by path.
const vitest = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const r = spawnSync(process.execPath, [vitest, "run", "tests/ragEval.test.ts"], {
  stdio: "inherit",
  env: { ...process.env, RAG_EVAL_VERBOSE: "1" },
});
process.exit(r.status ?? 1);
