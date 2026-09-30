import { NextRequest, NextResponse } from "next/server";
import { readServerDb, readServerDbVersion, writeServerDb } from "@/lib/serverDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getCorsHeaders } from "@/lib/corsHeaders";

const CORS_HEADERS = getCorsHeaders();

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

// GET: Fetch the central database or perform high-speed version check
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientVersion = searchParams.get("v");

    // Cheap path first: a client that is already up to date must not make the server
    // load and parse the entire database just to say "nothing changed".
    if (clientVersion) {
      const currentVersion = await readServerDbVersion();
      if (Number(clientVersion) === currentVersion) {
        return NextResponse.json({ changed: false, version: currentVersion }, { headers: CORS_HEADERS });
      }
    }
    const db = await readServerDb();

    return NextResponse.json({ changed: true, ...db }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to read database" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// POST: Update & Smart-Merge central synchronized database
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const updated = await writeServerDb(body);
    return NextResponse.json({ changed: true, ...updated }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update database" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
