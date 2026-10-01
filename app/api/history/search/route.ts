import { NextRequest, NextResponse } from "next/server";
import { searchHistory } from "@/lib/serverDb";
import { HistorySearchSchema } from "@/lib/schemas";
import { getCorsHeaders } from "@/lib/corsHeaders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = getCorsHeaders();

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** GET /api/history/search?q=term&limit=30 — full-text search across every stored conversation. */
export async function GET(req: NextRequest) {
  const parsed = HistorySearchSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400, headers: CORS_HEADERS });
  }
  try {
    const result = await searchHistory(parsed.data.q, parsed.data.limit);
    return NextResponse.json(result, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Search failed" }, { status: 500, headers: CORS_HEADERS });
  }
}
