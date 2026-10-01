import { z } from "zod";
import { CacheUpsertSchema, SemanticLookupSchema } from "@/lib/schemas";
import { parseJsonBody } from "@/lib/routeValidation";
import { NextRequest, NextResponse } from "next/server";
import {
  getPersistedCacheEntry,
  findPersistedSemanticCacheEntry,
  setPersistedCacheEntry,
  clearPersistedCache,
} from "@/lib/serverDb";
import { getCorsHeaders } from "@/lib/corsHeaders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = getCorsHeaders();

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/cache?key=<exact key>
 * GET /api/cache?model=<model>&embedding=<JSON array>&threshold=<number>
 *
 * lib/responseCache.ts (client, in-memory Map) calls this only on a
 * memory-cache MISS — this is the second tier, not the first, so a
 * network round-trip here only ever happens when the fast path already
 * failed. Two independent server-side lookup modes because they're two
 * different queries, not one general "search":
 * - ?key= is the same deterministic-hash exact match the in-memory Map
 *   does (see computePromptCacheKey), O(1) either backend.
 * - ?model=&embedding= is the cosine-similarity semantic match, and is
 *   only ever requested when the caller already knows it wants semantic
 *   matching (settings.semanticRagEnabled) — this route doesn't decide
 *   that policy, it just answers whichever query it's asked.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    if (key) {
      const entry = await getPersistedCacheEntry(key);
      return NextResponse.json({ entry }, { headers: CORS_HEADERS });
    }

    const model = searchParams.get("model");
    const embeddingRaw = searchParams.get("embedding");
    if (model && embeddingRaw) {
      let queryEmbedding: number[];
      try {
        queryEmbedding = JSON.parse(embeddingRaw);
      } catch {
        return NextResponse.json({ error: "embedding must be a JSON array" }, { status: 400, headers: CORS_HEADERS });
      }
      const threshold = searchParams.get("threshold");
      const entry = await findPersistedSemanticCacheEntry({
        model,
        queryEmbedding,
        similarityThreshold: threshold ? Number(threshold) : undefined,
      });
      return NextResponse.json({ entry }, { headers: CORS_HEADERS });
    }

    return NextResponse.json(
      { error: "Provide either ?key= or ?model=&embedding=" },
      { status: 400, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to read cache" }, { status: 500, headers: CORS_HEADERS });
  }
}

/**
 * POST { key, model?, timestamp, embedding?, data } — upserts one entry.
 * POST { action: "semantic-lookup", model, embedding, threshold? } — cosine lookup (body, not query string).
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = await parseJsonBody(req, z.record(z.string(), z.unknown()), {
      headers: CORS_HEADERS,
      maxBytes: 8 * 1024 * 1024,
    });
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    // Semantic lookup by POST body. The embedding is far too large for a query
    // string (768 floats ≈ 17 KB > Node's 16 KB header limit → HTTP 431).
    if (body.action === "semantic-lookup") {
      const lookup = SemanticLookupSchema.safeParse(body);
      if (!lookup.success) {
        return NextResponse.json(
          { error: "semantic-lookup requires a model string and a non-empty numeric embedding array (max 8192 dims)" },
          { status: 400, headers: CORS_HEADERS }
        );
      }
      const entry = await findPersistedSemanticCacheEntry({
        model: lookup.data.model,
        queryEmbedding: lookup.data.embedding,
        similarityThreshold: lookup.data.threshold,
      });
      return NextResponse.json({ entry }, { headers: CORS_HEADERS });
    }

    const upsert = CacheUpsertSchema.safeParse(body);
    if (!upsert.success) {
      return NextResponse.json({ error: upsert.error.issues[0].message }, { status: 400, headers: CORS_HEADERS });
    }
    await setPersistedCacheEntry({
      key: upsert.data.key,
      model: upsert.data.model,
      timestamp: upsert.data.timestamp || Date.now(),
      embedding: upsert.data.embedding,
      data: upsert.data.data,
    });
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to write cache" }, { status: 500, headers: CORS_HEADERS });
  }
}

/** DELETE — clears the entire persisted cache (the client's "Clear cache" action). */
export async function DELETE() {
  try {
    await clearPersistedCache();
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to clear cache" }, { status: 500, headers: CORS_HEADERS });
  }
}
