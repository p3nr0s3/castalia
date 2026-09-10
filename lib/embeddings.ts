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

async function embedOne(text: string, options: EmbeddingRequestOptions): Promise<number[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 4000);

  try {
    const res = await fetch(`${options.ollamaUrl.replace(/\/+$/, "")}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: options.model || DEFAULT_EMBEDDING_MODEL, prompt: text }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.embedding) ? data.embedding : null;
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
