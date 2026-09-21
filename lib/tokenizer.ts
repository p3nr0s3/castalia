import { getEncoding, Tiktoken } from "js-tiktoken";

let tokenizerInstance: Tiktoken | null = null;

function getTokenizer(): Tiktoken | null {
  if (!tokenizerInstance) {
    try {
      tokenizerInstance = getEncoding("cl100k_base");
    } catch (e) {
      console.warn("Failed to initialize js-tiktoken cl100k_base encoder:", e);
      return null;
    }
  }
  return tokenizerInstance;
}

// In-memory cache for token count of frequent/repeated text fragments
const TOKEN_COUNT_CACHE = new Map<string, number>();
const MAX_TOKEN_COUNT_CACHE = 4000;

function hashSimple(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return `${str.length}:${hash}`;
}

/**
 * Counts exact BPE tokens for text using js-tiktoken (cl100k_base).
 * Falls back to character-based heuristic if tokenizer fails.
 */
export function countTokens(text: string | undefined | null): number {
  if (!text) return 0;
  if (text.length === 0) return 0;

  // Short-circuit cache for repeated strings
  const cacheKey = hashSimple(text);
  const cached = TOKEN_COUNT_CACHE.get(cacheKey);
  if (cached !== undefined) {
    // Touch on read for LRU
    TOKEN_COUNT_CACHE.delete(cacheKey);
    TOKEN_COUNT_CACHE.set(cacheKey, cached);
    return cached;
  }

  let count: number;
  const tokenizer = getTokenizer();
  if (tokenizer) {
    try {
      const tokens = tokenizer.encode(text);
      count = tokens.length;
    } catch {
      // Fallback in case of invalid unicode or parsing error
      count = Math.ceil(text.length / 3.8);
    }
  } else {
    count = Math.ceil(text.length / 3.8);
  }

  if (TOKEN_COUNT_CACHE.size >= MAX_TOKEN_COUNT_CACHE) {
    const oldest = TOKEN_COUNT_CACHE.keys().next().value;
    if (oldest !== undefined) TOKEN_COUNT_CACHE.delete(oldest);
  }
  TOKEN_COUNT_CACHE.set(cacheKey, count);

  return count;
}

/**
 * Clear the token count cache (useful for testing).
 */
export function clearTokenCountCache(): void {
  TOKEN_COUNT_CACHE.clear();
}
