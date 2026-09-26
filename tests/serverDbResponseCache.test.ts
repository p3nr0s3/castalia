import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";

// serverDb.ts caches its JSON-backend state in module-level variables
// (jsonCache, cacheJsonState) that persist across calls within one process
// — exactly what production wants (avoid re-reading disk every request),
// but it means two tests can't share a module instance and expect a clean
// slate. vi.resetModules() + a fresh dynamic import per test gives each
// test its own instance, matching the pattern tests/graphifyOps.test.ts
// uses for the same kind of module-level-state problem.
const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_FILE = path.join(DATA_DIR, "response-cache.json");

async function freshServerDb() {
  vi.resetModules();
  return import("../lib/serverDb");
}

describe("serverDb response cache (JSON-fallback backend)", () => {
  beforeEach(() => {
    if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
  });

  afterEach(() => {
    if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
  });

  it("returns null for a key that was never stored", async () => {
    const { getPersistedCacheEntry } = await freshServerDb();
    expect(await getPersistedCacheEntry("nope")).toBeNull();
  });

  it("stores and retrieves an entry by exact key, and persists it to disk", async () => {
    const { getPersistedCacheEntry, setPersistedCacheEntry } = await freshServerDb();

    await setPersistedCacheEntry({
      key: "k1",
      model: "llama3.1",
      timestamp: Date.now(),
      data: { content: "hello from disk" },
    });

    const entry = await getPersistedCacheEntry("k1");
    expect(entry?.data).toEqual({ content: "hello from disk" });

    // persistCacheJsonToDisk() (unexported) is fire-and-forget, same
    // pattern as writeServerDbJson's persistJsonToDisk — setPersistedCacheEntry
    // returns once in-memory state is updated, not once the write hits
    // disk. Give the write microtask a turn before reloading the module.
    await new Promise((r) => setTimeout(r, 50));

    // A second, independent module instance (simulating a server restart /
    // a different request) must be able to read what the first wrote —
    // this is the entire point of persisting beyond the in-memory Map.
    const { getPersistedCacheEntry: getAfterRestart } = await freshServerDb();
    const reloaded = await getAfterRestart("k1");
    expect(reloaded?.data).toEqual({ content: "hello from disk" });
  });

  it("treats an entry older than the TTL as a miss and evicts it", async () => {
    const { getPersistedCacheEntry, setPersistedCacheEntry } = await freshServerDb();
    const staleTimestamp = Date.now() - 3 * 60 * 60 * 1000; // 3h, beyond the 2h TTL

    await setPersistedCacheEntry({ key: "stale", timestamp: staleTimestamp, data: { content: "old" } });
    expect(await getPersistedCacheEntry("stale")).toBeNull();
  });

  it("finds the best semantic match above threshold, scoped to the given model", async () => {
    const { findPersistedSemanticCacheEntry, setPersistedCacheEntry } = await freshServerDb();

    await setPersistedCacheEntry({
      key: "sem1",
      model: "llama3.1",
      timestamp: Date.now(),
      embedding: [1, 0, 0],
      data: { content: "match candidate" },
    });
    await setPersistedCacheEntry({
      key: "sem2",
      model: "qwen2.5", // different model — must not match even with an identical embedding
      timestamp: Date.now(),
      embedding: [1, 0, 0],
      data: { content: "wrong model" },
    });

    const hit = await findPersistedSemanticCacheEntry({
      model: "llama3.1",
      queryEmbedding: [0.99, 0.01, 0],
      similarityThreshold: 0.9,
    });
    expect(hit?.data).toEqual({ content: "match candidate" });

    const miss = await findPersistedSemanticCacheEntry({
      model: "llama3.1",
      queryEmbedding: [0, 1, 0], // orthogonal — similarity ~0
      similarityThreshold: 0.9,
    });
    expect(miss).toBeNull();
  });

  it("evicts the oldest entries once past CACHE_MAX_ENTRIES", async () => {
    const { getPersistedCacheEntry, setPersistedCacheEntry } = await freshServerDb();

    // CACHE_MAX_ENTRIES is 500 in serverDb.ts; write past it with distinct,
    // REAL timestamps (base + i, not i alone — an epoch-ms value like `5`
    // is decades in the past relative to Date.now() and would make every
    // entry look TTL-expired, which is a different code path than eviction).
    const base = Date.now();
    for (let i = 0; i < 501; i++) {
      await setPersistedCacheEntry({ key: `e${i}`, timestamp: base + i, data: { content: `entry ${i}` } });
    }
    await new Promise((r) => setTimeout(r, 100));

    expect(await getPersistedCacheEntry("e0")).toBeNull(); // oldest, evicted
    const newest = await getPersistedCacheEntry("e500");
    expect(newest?.data).toEqual({ content: "entry 500" });
  }, 15000);

  it("clearPersistedCache empties the store", async () => {
    const { getPersistedCacheEntry, setPersistedCacheEntry, clearPersistedCache } = await freshServerDb();

    await setPersistedCacheEntry({ key: "k1", timestamp: Date.now(), data: { content: "x" } });
    await clearPersistedCache();

    expect(await getPersistedCacheEntry("k1")).toBeNull();
  });
});
