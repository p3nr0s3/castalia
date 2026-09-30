import { GenerationMetrics, SearchSource, RetrievedChunkInfo, ToolCallExecution } from "./types";
import { apiFetch } from "./apiClient";

export interface CachedResponse {
  key: string;
  content: string;
  reasoning?: string;
  sources?: SearchSource[];
  retrievedChunks?: RetrievedChunkInfo[];
  toolExecutions?: ToolCallExecution[];
  metrics?: GenerationMetrics;
  servedFromCache?: boolean;
  timestamp: number;
  model?: string;
  queryEmbedding?: number[];
  embedding?: number[];
}

export interface PromptCacheKeyParams {
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  numCtx?: number;
  seed?: number;
  attachmentsSignature?: string;
  diskToolsActive?: boolean;
}

const MAX_CACHE_ENTRIES = 60;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const memoryCache = new Map<string, CachedResponse>();

/**
 * FNV-1a, 64-bit, returned as 16 zero-padded hex chars.
 *
 * Why this shape:
 *  - A 64-bit state makes an accidental collision between two different
 *    prompts astronomically unlikely (~2^-64 per pair). The previous
 *    implementation ran two 32-bit passes with the same multiplier, which
 *    is not the same as one independent 64-bit hash.
 *  - It stays synchronous and dependency-free. SubtleCrypto would be a
 *    stronger hash but is async, which would turn computePromptCacheKey
 *    into a Promise and ripple into the send-message path for no practical
 *    gain: this key only has to resist collisions between the user's own
 *    prompts, not adversarial input.
 * BigInt.asUintN re-truncates to 64 bits after each multiply, matching the
 * reference algorithm's wraparound. Constants are built with BigInt("0x...")
 * rather than 0x...n literals so older TS targets don't reject the syntax.
 * Iterates UTF-16 code units (charCodeAt), so it matches the reference
 * vectors for ASCII input; non-ASCII input hashes consistently but is not
 * the byte-wise UTF-8 FNV — irrelevant here since it is only ever compared
 * against itself.
 */
export function fnv1a64Hex(input: string): string {
  const FNV_OFFSET_BASIS_64 = BigInt("0xcbf29ce484222325");
  const FNV_PRIME_64 = BigInt("0x100000001b3");
  let h = FNV_OFFSET_BASIS_64;
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = BigInt.asUintN(64, h * FNV_PRIME_64);
  }
  return h.toString(16).padStart(16, "0");
}

/**
 * Computes a deterministic hash key for prompt caching.
 * Any change to model, prompt, system prompt, temperature, topP, numCtx, or tool settings
 * produces a different key, ensuring automatic cache invalidation.
 */
export function computePromptCacheKey(params: PromptCacheKeyParams): string {
  const payload = JSON.stringify({
    m: params.model,
    p: params.prompt.trim(),
    s: (params.systemPrompt || "").trim(),
    t: params.temperature ?? 0.7,
    tp: params.topP ?? 0.9,
    ctx: params.numCtx ?? 16384,
    seed: params.seed ?? 0,
    att: params.attachmentsSignature || "",
    dt: Boolean(params.diskToolsActive),
  });

  return `pc_${fnv1a64Hex(payload)}`;
}

/**
 * Retrieves a cached response if present and unexpired — in-memory only,
 * synchronous. This is the fast path: a hit costs a Map lookup, no
 * network round-trip. Use this when a synchronous answer is acceptable
 * (e.g. the entry was almost certainly just written by this same tab).
 */
export function getCachedPromptResponseSync(key: string): CachedResponse | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }

  return entry;
}

/**
 * Retrieves a cached response, checking the in-memory Map first (instant)
 * and falling back to the server-persisted cache (lib/serverDb.ts's
 * response_cache table/file) on a miss. The in-memory Map alone loses
 * every entry on page reload or a new tab — this fallback is what lets a
 * cache hit survive that. A server hit repopulates the in-memory Map so
 * the *next* lookup for the same key is instant again.
 *
 * Network failures (server down, offline) degrade to a cache miss rather
 * than throwing — this is a performance optimization, never something a
 * caller should have to handle as an error.
 */
export async function getCachedPromptResponse(key: string): Promise<CachedResponse | null> {
  const local = getCachedPromptResponseSync(key);
  if (local) return local;

  try {
    const res = await apiFetch(`/api/cache?key=${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const { entry } = await res.json();
    if (!entry?.data) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;

    const cached: CachedResponse = { ...entry.data, key, timestamp: entry.timestamp };
    memoryCache.set(key, cached);
    return cached;
  } catch {
    return null;
  }
}

/**
 * Calculates cosine similarity between two numeric embedding vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
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
 * Searches for a semantically similar cached response for the same model,
 * in-memory only, synchronous. See getCachedPromptResponseSync for why a
 * sync variant exists alongside the async one below.
 */
export function findSemanticCachedResponseSync(params: {
  model: string;
  queryEmbedding: number[];
  similarityThreshold?: number;
}): CachedResponse | null {
  if (!params.queryEmbedding || params.queryEmbedding.length === 0) return null;
  const threshold = params.similarityThreshold ?? 0.96;
  let bestMatch: CachedResponse | null = null;
  let bestScore = -1;

  for (const entry of memoryCache.values()) {
    if (entry.model && entry.model !== params.model) continue;
    const emb = entry.embedding || entry.queryEmbedding;
    if (!emb || emb.length === 0) continue;

    // Check TTL
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) continue;

    const score = cosineSimilarity(params.queryEmbedding, emb);
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  return bestMatch;
}

/**
 * Semantic cache lookup with the same in-memory-first, server-fallback
 * shape as getCachedPromptResponse — see its comment for the rationale.
 */
export async function findSemanticCachedResponse(params: {
  model: string;
  queryEmbedding: number[];
  similarityThreshold?: number;
}): Promise<CachedResponse | null> {
  const local = findSemanticCachedResponseSync(params);
  if (local) return local;

  try {
    // POST, not GET: a 768-dim embedding (nomic-embed-text) is ~17 KB once
    // JSON-encoded, which exceeds Node's 16 KB request-header limit when put
    // in the query string — the server answered HTTP 431 and the persisted
    // semantic tier never produced a single hit.
    const res = await apiFetch("/api/cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "semantic-lookup",
        model: params.model,
        embedding: params.queryEmbedding,
        ...(params.similarityThreshold !== undefined ? { threshold: params.similarityThreshold } : {}),
      }),
    });
    if (!res.ok) return null;
    const { entry } = await res.json();
    if (!entry?.data) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;

    const cached: CachedResponse = { ...entry.data, key: entry.key, timestamp: entry.timestamp };
    memoryCache.set(cached.key, cached);
    return cached;
  } catch {
    return null;
  }
}

/**
 * Saves a completed generation response to prompt cache.
 */
export function setCachedPromptResponse(
  key: string,
  data: {
    content: string;
    reasoning?: string;
    sources?: SearchSource[];
    retrievedChunks?: RetrievedChunkInfo[];
    toolExecutions?: ToolCallExecution[];
    metrics?: GenerationMetrics;
    model?: string;
    embedding?: number[];
  }
): void {
  // Evict oldest if full
  if (memoryCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }

  const timestamp = Date.now();
  const entry: CachedResponse = {
    key,
    content: data.content,
    reasoning: data.reasoning,
    sources: data.sources,
    retrievedChunks: data.retrievedChunks,
    toolExecutions: data.toolExecutions,
    metrics: data.metrics ? { ...data.metrics } : undefined,
    model: data.model,
    queryEmbedding: data.embedding,
    embedding: data.embedding,
    servedFromCache: true,
    timestamp,
  };
  memoryCache.set(key, entry);

  // Fire-and-forget persist to the server so this entry survives a reload.
  // Never awaited by callers — a slow/offline write here must not delay
  // the response the user is already looking at. Failures are swallowed:
  // worst case the entry only lives as long as this tab's in-memory Map,
  // same behavior as before this persistence layer existed.
  persistCacheEntryToServer(entry).catch(() => {});
}

async function persistCacheEntryToServer(entry: CachedResponse): Promise<void> {
  try {
    await apiFetch("/api/cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: entry.key,
        model: entry.model,
        timestamp: entry.timestamp,
        embedding: entry.embedding,
        data: {
          content: entry.content,
          reasoning: entry.reasoning,
          sources: entry.sources,
          retrievedChunks: entry.retrievedChunks,
          toolExecutions: entry.toolExecutions,
          metrics: entry.metrics,
          model: entry.model,
          servedFromCache: true,
        },
      }),
    });
  } catch {
    // Offline or server unavailable — the in-memory cache still works for
    // this tab's lifetime; only cross-reload persistence is lost.
  }
}

/**
 * Clears the prompt response cache (in-memory only — the current tab).
 */
export function clearPromptCache(): void {
  memoryCache.clear();
}

/**
 * Clears the persisted server-side cache in addition to the in-memory one.
 * Use this for an explicit user-facing "Clear cache" action; clearPromptCache
 * alone (unchanged, still synchronous) is enough for internal/test use where
 * only this tab's state matters.
 */
export async function clearPromptCacheEverywhere(): Promise<void> {
  clearPromptCache();
  try {
    await apiFetch("/api/cache", { method: "DELETE" });
  } catch {
    // Server unreachable — in-memory cache is still cleared, which is the
    // part the user can observe immediately; the persisted copy will
    // simply age out via CACHE_TTL_MS on its own.
  }
}

