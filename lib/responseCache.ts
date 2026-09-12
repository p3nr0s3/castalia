import { GenerationMetrics, SearchSource, RetrievedChunkInfo, ToolCallExecution } from "./types";

export interface CachedResponse {
  key: string;
  content: string;
  reasoning?: string;
  sources?: SearchSource[];
  retrievedChunks?: RetrievedChunkInfo[];
  toolExecutions?: ToolCallExecution[];
  metrics?: GenerationMetrics;
  timestamp: number;
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
    metrics: data.metrics ? { ...data.metrics, evalTps: 999, totalSeconds: 0.01 } : undefined,
    timestamp: Date.now(),
  });
}

/**
 * Clears the prompt response cache.
 */
export function clearPromptCache(): void {
  memoryCache.clear();
}
