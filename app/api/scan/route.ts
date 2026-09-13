import { NextRequest, NextResponse } from "next/server";
import { getCorsHeaders } from "@/lib/corsHeaders";
import { runOwaspScan } from "@/lib/owaspScanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = getCorsHeaders();

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string" || !url.trim()) {
      return NextResponse.json(
        { error: "Target URL is required (e.g. https://example.com)" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const scanResult = await runOwaspScan(url.trim());

    return NextResponse.json(
      {
        success: true,
        scan: scanResult,
      },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: `Scan failed: ${error.message || "Unknown scan error"}`,
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
