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
// Keyed by model:hash(text).
// Eviction policy: True LRU (Least Recently Used) via touch-on-read.
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
    // No cache file yet, or it's corrupt — start empty.
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
    // Best-effort
  }
}

function schedulePersist(): void {
  if (!IS_SERVER) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistCacheToDisk, PERSIST_DEBOUNCE_MS);
}

/** Test/debug hook — clears the module-level embedding cache. */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

/** Test hook to inspect keys in LRU order (oldest first). */
export function getEmbeddingCacheKeys(): string[] {
  return Array.from(embeddingCache.keys());
}

function hashText(text: string): string {
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

/**
 * Touch a cache entry on read to maintain true LRU order.
 */
function touchCache(key: string, value: number[]): void {
  embeddingCache.delete(key);
  embeddingCache.set(key, value);
}

/**
 * Insert or update a cache entry with true LRU eviction.
 */
function setCacheWithLru(key: string, value: number[]): void {
  if (embeddingCache.has(key)) {
    embeddingCache.delete(key);
  } else if (embeddingCache.size >= EMBEDDING_CACHE_MAX_ENTRIES) {
    const oldestKey = embeddingCache.keys().next().value;
    if (oldestKey !== undefined) {
      embeddingCache.delete(oldestKey);
    }
  }
  embeddingCache.set(key, value);
}

export async function embedOne(text: string, options: EmbeddingRequestOptions): Promise<number[] | null> {
  loadCacheFromDisk();
  const model = options.model || DEFAULT_EMBEDDING_MODEL;
  const key = cacheKey(text, model);
  const cached = embeddingCache.get(key);
  if (cached) {
    touchCache(key, cached);
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);

  try {
    const baseUrl = options.ollamaUrl.replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text, keep_alive: "5s" }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const embedding = Array.isArray(data?.embedding) ? data.embedding : null;

    if (embedding) {
      setCacheWithLru(key, embedding);
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
 * Attempt batch embedding using Ollama's newer `/api/embed` endpoint.
 * Returns array of embeddings or null if endpoint is unsupported or fails.
 */
async function embedBatchApi(
  texts: string[],
  options: EmbeddingRequestOptions
): Promise<(number[] | null)[] | null> {
  const model = options.model || DEFAULT_EMBEDDING_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);

  try {
    const baseUrl = options.ollamaUrl.replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: texts,
        keep_alive: "5s",
      }),
      signal: controller.signal,
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.embeddings) || data.embeddings.length !== texts.length) {
      return null;
    }

    return data.embeddings.map((emb: any) => (Array.isArray(emb) ? emb : null));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Embed several texts. Employs a batched `/api/embed` call for all uncached texts
 * in a single HTTP round-trip, falling back to parallel single `/api/embeddings`
 * calls if the batch endpoint is unavailable.
 *
 * Repeated calls with identical text + model are served from the LRU cache.
 */
export async function embedTexts(
  texts: string[],
  options: EmbeddingRequestOptions
): Promise<(number[] | null)[]> {
  loadCacheFromDisk();
  const model = options.model || DEFAULT_EMBEDDING_MODEL;

  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const key = cacheKey(text, model);
    const cached = embeddingCache.get(key);
    if (cached) {
      touchCache(key, cached);
      results[i] = cached;
    } else {
      uncachedIndices.push(i);
      uncachedTexts.push(text);
    }
  }

  // All hits served from cache!
  if (uncachedIndices.length === 0) {
    return results;
  }

  // Try batch `/api/embed` endpoint first for meaningful latency savings
  let batchEmbeddings: (number[] | null)[] | null = null;
  if (uncachedTexts.length > 0) {
    batchEmbeddings = await embedBatchApi(uncachedTexts, options);
  }

  if (batchEmbeddings && batchEmbeddings.length === uncachedTexts.length) {
    for (let j = 0; j < uncachedTexts.length; j++) {
      const idx = uncachedIndices[j];
      const emb = batchEmbeddings[j];
      results[idx] = emb;
      if (emb) {
        setCacheWithLru(cacheKey(uncachedTexts[j], model), emb);
      }
    }
    schedulePersist();
    return results;
  }

  // Fallback to individual `/api/embeddings` calls
  const individualResults = await Promise.all(
    uncachedTexts.map((t) => embedOne(t, options))
  );

  for (let j = 0; j < uncachedTexts.length; j++) {
    const idx = uncachedIndices[j];
    results[idx] = individualResults[j];
  }

  return results;
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

/**
 * Explicitly unloads an embedding model from Ollama VRAM by sending keep_alive: 0.
 * Frees GPU VRAM immediately for the chat model, preventing CPU layer spilling
 * on VRAM-constrained machines (<= 8GB VRAM).
 */
export async function unloadEmbeddingModel(
  ollamaUrl: string,
  model = DEFAULT_EMBEDDING_MODEL
): Promise<boolean> {
  try {
    const baseUrl = ollamaUrl.replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, keep_alive: 0 }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
