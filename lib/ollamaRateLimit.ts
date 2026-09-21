/**
 * In-memory concurrency + burst guard + VRAM-aware queue semaphore for Ollama.
 *
 * Single-user/single-process architecture. Coordinates chat generation and embedding
 * requests to prevent VRAM thrashing (swap-thrash) when chat models and embedding
 * models compete for GPU memory simultaneously.
 */

export type OllamaOpType = "chat" | "embed";

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
}

interface QueuedRequest {
  id: string;
  type: OllamaOpType;
  resolve: (res: RateLimitResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

const MAX_CONCURRENT_GENERATIONS = 1;
const MAX_CONCURRENT_EMBEDDINGS = 1;
const MAX_REQUESTS_PER_WINDOW = 35;
const WINDOW_MS = 10_000; // 10 seconds
const DEFAULT_QUEUE_TIMEOUT_MS = 45_000;

let activeGenerations = 0;
let activeEmbeddings = 0;
let windowStart = Date.now();
let windowCount = 0;
let reqCounter = 0;
const waitQueue: QueuedRequest[] = [];

function canProceed(type: OllamaOpType): boolean {
  if (type === "embed") {
    // Embeddings should not run while chat generation is active to prevent unloading chat model from VRAM
    return activeGenerations === 0 && activeEmbeddings < MAX_CONCURRENT_EMBEDDINGS;
  }
  // Chat generations should not run while embeddings are actively processing
  return activeEmbeddings === 0 && activeGenerations < MAX_CONCURRENT_GENERATIONS;
}

function processNext(): void {
  if (waitQueue.length === 0) return;

  for (let i = 0; i < waitQueue.length; i++) {
    const candidate = waitQueue[i];
    if (canProceed(candidate.type)) {
      waitQueue.splice(i, 1);
      clearTimeout(candidate.timer);

      if (candidate.type === "embed") {
        activeEmbeddings++;
      } else {
        activeGenerations++;
      }
      windowCount++;
      candidate.resolve({ allowed: true });
      return;
    }
  }
}

/**
 * Asynchronously acquires an Ollama concurrency slot.
 * If another operation is using VRAM, queues up cleanly rather than rejecting immediately with 429.
 */
export async function acquireOllamaSlot(
  type: OllamaOpType = "chat",
  options?: { timeoutMs?: number }
): Promise<RateLimitResult> {
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

  if (canProceed(type)) {
    if (type === "embed") {
      activeEmbeddings++;
    } else {
      activeGenerations++;
    }
    windowCount++;
    return { allowed: true };
  }

  // Enqueue waiter
  const timeoutMs = options?.timeoutMs ?? DEFAULT_QUEUE_TIMEOUT_MS;
  return new Promise<RateLimitResult>((resolve) => {
    const id = `req_${++reqCounter}`;
    const timer = setTimeout(() => {
      const idx = waitQueue.findIndex((q) => q.id === id);
      if (idx !== -1) {
        waitQueue.splice(idx, 1);
        resolve({
          allowed: false,
          reason: `Ollama operation queue timeout (${timeoutMs / 1000}s). Server is busy with another model task.`,
          retryAfterMs: 3000,
        });
      }
    }, timeoutMs);

    waitQueue.push({ id, type, resolve, timer });
  });
}

/**
 * Releases an acquired slot and allows the next queued request in line to proceed.
 */
export function releaseOllamaSlot(type: OllamaOpType = "chat"): void {
  if (type === "embed") {
    activeEmbeddings = Math.max(0, activeEmbeddings - 1);
  } else {
    activeGenerations = Math.max(0, activeGenerations - 1);
  }
  processNext();
}

/**
 * Synchronous compatibility wrapper for legacy callers.
 */
export function tryAcquireGenerationSlot(): RateLimitResult {
  const now = Date.now();
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

/**
 * Synchronous compatibility wrapper for legacy callers.
 */
export function releaseGenerationSlot(): void {
  releaseOllamaSlot("chat");
}

/**
 * Diagnostic & testing helper to inspect queue depth and active requests.
 */
export function getOllamaQueueStats() {
  return {
    activeGenerations,
    activeEmbeddings,
    queueLength: waitQueue.length,
    windowCount,
  };
}

/**
 * Resets the queue state (for testing).
 */
export function resetOllamaQueue(): void {
  activeGenerations = 0;
  activeEmbeddings = 0;
  windowCount = 0;
  for (const q of waitQueue) {
    clearTimeout(q.timer);
    q.resolve({ allowed: false, reason: "Queue reset" });
  }
  waitQueue.length = 0;
}
