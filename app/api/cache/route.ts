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

/** POST { key, model?, timestamp, embedding?, data } — upserts one entry. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.key || typeof body.key !== "string") {
      return NextResponse.json({ error: "key is required" }, { status: 400, headers: CORS_HEADERS });
    }
    await setPersistedCacheEntry({
      key: body.key,
      model: body.model,
      timestamp: body.timestamp || Date.now(),
      embedding: body.embedding,
      data: body.data,
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
