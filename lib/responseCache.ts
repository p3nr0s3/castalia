import { GenerationMetrics, SearchSource, RetrievedChunkInfo, ToolCallExecution } from "./types";

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

  // FNV-1a 32-bit hash
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }

  // Second pass for better dispersion
  let h2 = 0x27d4eb2f;
  for (let i = payload.length - 1; i >= 0; i--) {
    h2 ^= payload.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193);
  }

  return `pc_${Math.abs(h).toString(16)}_${Math.abs(h2).toString(16)}`;
}

/**
 * Retrieves a cached response if present and unexpired.
 */
export function getCachedPromptResponse(key: string): CachedResponse | null {
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
 * Searches for a semantically similar cached response for the same model.
 * Returns the best cached response if cosine similarity >= threshold (default 0.96).
 */
export function findSemanticCachedResponse(params: {
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

  memoryCache.set(key, {
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
    timestamp: Date.now(),
  });
}

/**
 * Clears the prompt response cache.
 */
export function clearPromptCache(): void {
  memoryCache.clear();
}

