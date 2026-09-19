/**
 * In-memory concurrency + burst guard for the Ollama proxy.
 *
 * This app is single-user/single-process, so a simple in-memory counter is
 * enough — no Redis, no external store. Its job is narrow: stop multiple
 * tabs/projects/agents from all firing generation requests at the local
 * Ollama server at once and silently degrading (or hanging) with no
 * feedback to the user, and stop a runaway loop (e.g. a buggy agent retry)
 * from hammering the endpoint.
 *
 * This resets on server restart — that's fine, it's a live guard, not an
 * audit log.
 */

const MAX_CONCURRENT_GENERATIONS = 2;
const MAX_REQUESTS_PER_WINDOW = 20;
const WINDOW_MS = 10_000; // 10 seconds

let activeGenerations = 0;
let windowStart = Date.now();
let windowCount = 0;

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
}

/** Call before starting a generation request. Pair with releaseGenerationSlot() in a finally block. */
export function tryAcquireGenerationSlot(): RateLimitResult {
  const now = Date.now();

  // Reset burst window if it has elapsed
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }

  if (windowCount >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      reason: `Rate limit exceeded: more than ${MAX_REQUESTS_PER_WINDOW} requests in ${WINDOW_MS / 1000}s.`,
      retryAfterMs: WINDOW_MS - (now - windowStart),
    };
  }

  if (activeGenerations >= MAX_CONCURRENT_GENERATIONS) {
    return {
      allowed: false,
      reason: `Too many concurrent generation requests (limit: ${MAX_CONCURRENT_GENERATIONS}). Wait for one to finish.`,
    };
  }

  activeGenerations++;
  windowCount++;
  return { allowed: true };
}

export function releaseGenerationSlot(): void {
  activeGenerations = Math.max(0, activeGenerations - 1);
}
