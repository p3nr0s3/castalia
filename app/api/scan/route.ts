import { NextRequest, NextResponse } from "next/server";
import { getCorsHeaders } from "@/lib/corsHeaders";
import { runOwaspScan } from "@/lib/owaspScanner";
import { assertPublicUrl, SsrfBlockedError } from "@/lib/ssrfGuard";

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

    // Same SSRF guard used for connectors: blocks loopback, RFC1918 private
    // ranges, link-local, and cloud metadata addresses. Without this, the
    // scanner is a generic authenticated proxy that fetches and reflects
    // back the content of anything reachable from the server — including
    // internal-only services (e.g. Ollama on :11434, or other localhost
    // admin panels) that were never meant to be exposed to the browser.
    try {
      await assertPublicUrl(url.trim());
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        return NextResponse.json(
          { error: `Target URL blocked: ${err.message}` },
          { status: 403, headers: CORS_HEADERS }
        );
      }
      throw err;
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
