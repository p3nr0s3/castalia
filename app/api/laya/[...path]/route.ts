import { NextRequest, NextResponse } from "next/server";
import { assertOllamaHostUrl, SsrfBlockedError } from "@/lib/ssrfGuard";
import { getCorsHeaders } from "@/lib/corsHeaders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = getCorsHeaders();

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function getLayaHost(req: NextRequest): string {
  const url = new URL(req.url);
  const hostParam = url.searchParams.get("host");
  let host = hostParam || process.env.LAYA_HOST_URL || "http://127.0.0.1:8000";

  // Force IPv4 127.0.0.1 instead of localhost to prevent Windows Node.js ::1 ECONNREFUSED
  try {
    const parsed = new URL(host);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
    }
    return parsed.origin;
  } catch {
    return host.replace("localhost", "127.0.0.1").replace(/\/+$/, "");
  }
}

async function validateLayaHost(host: string): Promise<NextResponse | null> {
  try {
    await assertOllamaHostUrl(host);
    return null;
  } catch (err: any) {
    if (err instanceof SsrfBlockedError) {
      return NextResponse.json({ error: err.message }, { status: 403, headers: CORS_HEADERS });
    }
    return NextResponse.json({ error: "Invalid host" }, { status: 400, headers: CORS_HEADERS });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const subpath = (params.path || []).join("/");
  const host = getLayaHost(req);
  const blocked = await validateLayaHost(host);
  if (blocked) return blocked;

  try {
    const targetUrl = `${host}/${subpath}`;
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: req.signal,
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to reach Laya service" },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const subpath = (params.path || []).join("/");
  const host = getLayaHost(req);
  const blocked = await validateLayaHost(host);
  if (blocked) return blocked;

  try {
    const body = await req.text();
    const targetUrl = `${host}/${subpath}`;
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      signal: req.signal,
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to dispatch request to Laya" },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}
