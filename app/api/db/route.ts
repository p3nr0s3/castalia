import { NextRequest, NextResponse } from "next/server";
import { readServerDb, writeServerDb } from "@/lib/serverDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
};

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
    const db = await readServerDb();

    if (clientVersion && Number(clientVersion) === db.version) {
      return NextResponse.json({ changed: false, version: db.version }, { headers: CORS_HEADERS });
    }

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
