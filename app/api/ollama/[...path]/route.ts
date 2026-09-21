import { NextRequest, NextResponse } from "next/server";
import { acquireOllamaSlot, releaseOllamaSlot, OllamaOpType } from "@/lib/ollamaRateLimit";
import { assertOllamaHostUrl, SsrfBlockedError } from "@/lib/ssrfGuard";

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

/**
 * Validates the resolved Ollama host before this route relays anything to
 * it. `?host=` is user-configurable (settings.ollamaUrl for a remote
 * Ollama on the LAN), so RFC1918/loopback stay allowed — see
 * assertOllamaHostUrl's own comment for why this is a different policy
 * than the other SSRF guards in this app. Returns an error NextResponse to
 * short-circuit with if validation fails, or null if the host is fine.
 */
async function validateOllamaHost(host: string): Promise<NextResponse | null> {
  try {
    await assertOllamaHostUrl(host);
    return null;
  } catch (err: any) {
    if (err instanceof SsrfBlockedError) {
      return NextResponse.json({ error: err.message }, { status: 403, headers: CORS_HEADERS });
    }
    throw err;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join("/");
  const host = getOllamaHost(req);
  const targetUrl = `${host}/${path}`;

  const blocked = await validateOllamaHost(host);
  if (blocked) return blocked;

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

  const blocked = await validateOllamaHost(host);
  if (blocked) return blocked;

  // Guard chat generations and embeddings with a concurrency + VRAM queue semaphore
  const isGenerationEndpoint = path === "api/generate" || path === "api/chat";
  const isEmbeddingEndpoint = path === "api/embeddings" || path === "api/embed";
  const opType: OllamaOpType | null = isGenerationEndpoint ? "chat" : isEmbeddingEndpoint ? "embed" : null;

  let slotAcquired = false;
  if (opType) {
    const limit = await acquireOllamaSlot(opType, { timeoutMs: 35000 });
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: limit.reason,
          retryAfterMs: limit.retryAfterMs,
        },
        {
          status: 429,
          headers: {
            ...CORS_HEADERS,
            ...(limit.retryAfterMs ? { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } : {}),
          },
        }
      );
    }
    slotAcquired = true;
  }

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
      const [streamForClient, streamForRelease] = response.body.tee();
      slotAcquired = false; // ownership of the release transfers to the reader below

      (async () => {
        const reader = streamForRelease.getReader();
        try {
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        } catch {
          // Ignore — client aborts or upstream errors still fall through to release.
        } finally {
          if (opType) {
            releaseOllamaSlot(opType);
          }
        }
      })();

      return new NextResponse(streamForClient, {
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
  } finally {
    if (slotAcquired && opType) {
      releaseOllamaSlot(opType);
    }
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join("/");
  const host = getOllamaHost(req);
  const targetUrl = `${host}/${path}`;

  const blocked = await validateOllamaHost(host);
  if (blocked) return blocked;

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

