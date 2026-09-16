// Thin client for Ollama's local embeddings endpoint, used to add a semantic
// scoring signal on top of the existing BM25 keyword ranker in rag.ts.
//
// This is intentionally optional and fails soft: if the embedding model
// isn't pulled, Ollama isn't reachable, or a request errors, callers fall
// back to pure BM25 — nothing here should ever be able to break retrieval,
// only improve it when available.
//
// NOTE: this module is imported from rag.ts, which is also imported from
// client components (app/page.tsx) — so the disk-persistence code below
// must never statically import 'fs'/'path' (that breaks the browser
// webpack build, which can't resolve Node's fs module). It's required
// lazily, only inside the `typeof window === "undefined"` (server) branch.

export interface EmbeddingRequestOptions {
  ollamaUrl: string;
  model?: string;
  /** Abort/timeout guard so a slow embedding call never stalls a chat send. */
  timeoutMs?: number;
}

const DEFAULT_EMBEDDING_MODEL = "nomic-embed-text";
const IS_SERVER = typeof window === "undefined";

// In-memory embedding cache, backed by data/embeddings-cache.json on disk
// (server-side only — in the browser this is just the in-memory Map).
// rankChunksHybrid re-embeds every project chunk on every chat turn even
// when the file content hasn't changed — for a project with many/large
// chunks this adds a full round of Ollama calls to every message before
// generation can even start. Keyed by a hash of the exact text + model (not
// chunk.id, which can be reused across edits — a content hash means a stale
// hit is structurally impossible). Capped with simple insertion-order
// eviction so long sessions with many distinct projects/files don't grow
// this unboundedly.
//
// Without disk persistence this cache was thrown away on every dev-server
// restart, forcing a full project re-embed (one Ollama call per chunk) on
// the very next query — this file keeps it warm across restarts, keyed by
// content hash so edited files simply miss and re-embed individually rather
// than invalidating anything else.
const EMBEDDING_CACHE_MAX_ENTRIES = 5000;
const embeddingCache = new Map<string, number[]>();

const PERSIST_DEBOUNCE_MS = 2000;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let loadedFromDisk = false;

function loadCacheFromDisk(): void {
  if (!IS_SERVER || loadedFromDisk) return;
  loadedFromDisk = true;
  try {
    const fs = require("fs");
    const path = require("path");
    const cacheFile = path.join(process.cwd(), "data", "embeddings-cache.json");
    const raw = fs.readFileSync(cacheFile, "utf8");
    const parsed = JSON.parse(raw) as Record<string, number[]>;
    for (const key of Object.keys(parsed)) {
      if (Array.isArray(parsed[key])) embeddingCache.set(key, parsed[key]);
    }
  } catch {
    // No cache file yet, or it's corrupt — start empty. Never let a bad
    // cache file break embedding/retrieval.
  }
}

function persistCacheToDisk(): void {
  if (!IS_SERVER) return;
  try {
    const fs = require("fs");
    const path = require("path");
    const dataDir = path.join(process.cwd(), "data");
    const cacheFile = path.join(dataDir, "embeddings-cache.json");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const obj: Record<string, number[]> = {};
    embeddingCache.forEach((value, key) => {
      obj[key] = value;
    });
    fs.writeFileSync(cacheFile, JSON.stringify(obj), "utf8");
  } catch {
    // Best-effort — a failed write just means the cache stays in-memory
    // only for this process, same as before this change.
  }
}

function schedulePersist(): void {
  if (!IS_SERVER) return;
  if (persistTimer) clearTimeout(persistTimer);
  // Debounced: embedTexts() calls embedOne() once per chunk, often dozens
  // per query — write once after the batch settles instead of once per
  // chunk, so indexing a whole project doesn't turn into dozens of disk
  // writes on the request path.
  persistTimer = setTimeout(persistCacheToDisk, PERSIST_DEBOUNCE_MS);
}

/** Test/debug hook — clears the module-level embedding cache. */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

function hashText(text: string): string {
  // Fast non-cryptographic hash (FNV-1a) — this is a cache key, not a
  // security boundary, so collision resistance only needs to be good
  // enough to avoid accidental hits, which FNV-1a comfortably provides
  // for this volume of distinct chunks.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36) + ":" + text.length;
}

function cacheKey(text: string, model: string): string {
  return `${model}:${hashText(text)}`;
}

async function embedOne(text: string, options: EmbeddingRequestOptions): Promise<number[] | null> {
  loadCacheFromDisk();
  const model = options.model || DEFAULT_EMBEDDING_MODEL;
  const key = cacheKey(text, model);
  const cached = embeddingCache.get(key);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 4000);

  try {
    const res = await fetch(`${options.ollamaUrl.replace(/\/+$/, "")}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // keep_alive kept short on purpose: the chat model and the embedding
      // model are usually two different Ollama models competing for the
      // same VRAM budget. If both ask to stay resident, every RAG-enabled
      // turn forces Ollama to swap one out to load the other, and then
      // swap back for the next chat turn — a load/unload cycle on *every*
      // message. The embedding model is small and cheap to reload, so we
      // let it drop from VRAM almost immediately after use instead of
      // holding a slot the chat model needs back.
      body: JSON.stringify({ model, prompt: text, keep_alive: "5s" }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const embedding = Array.isArray(data?.embedding) ? data.embedding : null;

    if (embedding) {
      if (embeddingCache.size >= EMBEDDING_CACHE_MAX_ENTRIES) {
        // Evict oldest entry (Map preserves insertion order) rather than
        // clearing everything — keeps recently-used project chunks warm.
        const oldestKey = embeddingCache.keys().next().value;
        if (oldestKey !== undefined) embeddingCache.delete(oldestKey);
      }
      embeddingCache.set(key, embedding);
      schedulePersist();
    }

    return embedding;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Embed several texts. Returns one entry per input, in order; an entry is
 * `null` if that particular embedding call failed (missing model, timeout,
 * network error) — callers should treat `null` as "no semantic signal for
 * this text", not throw.
 *
 * Repeated calls with the same text + model (the common case: unchanged
 * project files across chat turns) are served from the in-memory cache
 * above instead of re-hitting Ollama.
 */
export async function embedTexts(texts: string[], options: EmbeddingRequestOptions): Promise<(number[] | null)[]> {
  return Promise.all(texts.map((t) => embedOne(t, options)));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
