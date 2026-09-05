import { NextRequest, NextResponse } from "next/server";

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

function getOllamaHost(req: NextRequest): string {
  const url = new URL(req.url);
  const hostParam = url.searchParams.get("host");
  let host = hostParam || process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

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

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join("/");
  const host = getOllamaHost(req);
  const targetUrl = `${host}/${path}`;

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const data = await response.text();
    return new NextResponse(data, {
      status: response.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: `Could not reach Ollama server at ${host}. Make sure Ollama is running on your host machine: ${error.message}`,
      },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join("/");
  const host = getOllamaHost(req);
  const targetUrl = `${host}/${path}`;

  try {
    const body = await req.json();

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new NextResponse(errorText, {
        status: response.status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Handle Streaming Response for Mobile, Tunnels & Web
    if (response.body) {
      return new NextResponse(response.body, {
        status: response.status,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          Connection: "keep-alive",
        },
      });
    }

    const data = await response.text();
    return new NextResponse(data, {
      status: response.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: `Failed to proxy to Ollama server at ${host}. Details: ${error.message}`,
      },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join("/");
  const host = getOllamaHost(req);
  const targetUrl = `${host}/${path}`;

  try {
    const body = await req.json().catch(() => ({}));

    const response = await fetch(targetUrl, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.text();
    return new NextResponse(data, {
      status: response.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: `Failed to delete model on Ollama server at ${host}: ${error.message}`,
      },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}

