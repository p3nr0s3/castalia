import fs from "fs";
import os from "os";
import path from "path";
import { afterAll } from "vitest";

// Runs in every test file's worker before the file's own code. Gives the file a private, empty data
// directory so no test can read, modify or delete the developer's real data/ (chat database,
// response cache, embeddings cache, bridge tokens, backups). Tests that need a fresh directory of
// their own (to reset module state between tests) override LYRA_DATA_DIR themselves.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lyra-test-data-"));
process.env.LYRA_DATA_DIR = dir;

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100)); // the JSON backend persists asynchronously
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* a leftover temp directory is not a test failure */
  }
});
