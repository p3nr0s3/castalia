// Thin client for Ollama's local embeddings endpoint, used to add a semantic
// scoring signal on top of the existing BM25 keyword ranker in rag.ts.
//
// This is intentionally optional and fails soft: if the embedding model
// isn't pulled, Ollama isn't reachable, or a request errors, callers fall
// back to pure BM25 — nothing here should ever be able to break retrieval,
// only improve it when available.

export interface EmbeddingRequestOptions {
  ollamaUrl: string;
  model?: string;
  /** Abort/timeout guard so a slow embedding call never stalls a chat send. */
  timeoutMs?: number;
}

const DEFAULT_EMBEDDING_MODEL = "nomic-embed-text";

// In-memory embedding cache. rankChunksHybrid re-embeds every project chunk
// on every chat turn even when the file content hasn't changed — for a
// project with many/large chunks this adds a full round of Ollama calls to
// every message before generation can even start. Keyed by a hash of the
// exact text + model (not chunk.id, which can be reused across edits — a
// content hash means a stale hit is structurally impossible). Capped with
// simple insertion-order eviction so long sessions with many distinct
// projects/files don't grow this unboundedly.
const EMBEDDING_CACHE_MAX_ENTRIES = 5000;
const embeddingCache = new Map<string, number[]>();

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
      body: JSON.stringify({ model, prompt: text }),
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
