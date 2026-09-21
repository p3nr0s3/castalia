/**
 * Stream Render Throttler
 *
 * Micro-batches high-frequency token updates from fast local models (60-120+ tok/sec)
 * to match browser animation frames (~16-20ms). Prevents React re-render thrashing
 * and drops CPU load while preserving a silky smooth 60fps streaming visual.
 */

export interface StreamThrottler {
  push: (text: string) => void;
  flush: () => void;
  cancel: () => void;
}

export function createStreamThrottler(
  callback: (text: string) => void,
  throttleMs = 20
): StreamThrottler {
  let pendingText = "";
  let hasPending = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let rafId: number | null = null;

  const flush = () => {
    if (hasPending) {
      hasPending = false;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (typeof cancelAnimationFrame === "function" && rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      callback(pendingText);
    }
  };

  const cancel = () => {
    hasPending = false;
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (typeof cancelAnimationFrame === "function" && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const push = (text: string) => {
    pendingText = text;
    if (!hasPending) {
      hasPending = true;
      if (typeof requestAnimationFrame === "function") {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          flush();
        });
      } else {
        timerId = setTimeout(() => {
          timerId = null;
          flush();
        }, throttleMs);
      }
    }
  };

  return { push, flush, cancel };
}
