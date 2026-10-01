import path from "path";

/**
 * Where this app keeps its private runtime data (database, caches, snapshots, bridge tokens).
 *
 * Defaults to `<working directory>/data`. Set `LYRA_DATA_DIR` to put it elsewhere (a different disk,
 * a Docker volume, …). Resolved on every call, not at import time, so tests can redirect it per test.
 *
 * The test suite sets LYRA_DATA_DIR to a throwaway folder for every test file (tests/setup/
 * isolateDataDir.ts). Before that, running `npm test` in a working copy used the REAL data/ folder:
 * one test deleted data/response-cache.json on every run and wrote its fixtures into the real
 * database, and the embeddings tests persisted fake vectors into the real embeddings cache.
 */
export function dataDir(): string {
  const override = process.env.LYRA_DATA_DIR;
  return override ? path.resolve(override) : path.join(process.cwd(), "data");
}
