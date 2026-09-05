import { NextRequest, NextResponse } from "next/server";
import { SearchSource } from "@/lib/types";

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

export async function POST(req: NextRequest) {
  try {
    const { query, searxngUrl = "http://localhost:8080" } = await req.json();

    if (!query || !query.trim()) {
      return NextResponse.json({ results: [] }, { headers: CORS_HEADERS });
    }

    let host = searxngUrl.replace(/\/+$/, "");
    try {
      const parsed = new URL(host);
      if (parsed.hostname === "localhost") {
        parsed.hostname = "127.0.0.1";
        host = parsed.origin;
      }
    } catch {
      host = host.replace("localhost", "127.0.0.1");
    }

    const targetUrl = `${host}/search?q=${encodeURIComponent(query.trim())}&format=json&language=all`;

    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      if (res.status === 403 || res.status === 406) {
        return NextResponse.json(
          {
            error: "SearXNG JSON format is disabled. Add 'formats: [html, json]' under 'search:' in SearXNG settings.yml.",
            results: [],
          },
          { status: 400, headers: CORS_HEADERS }
        );
      }
      return NextResponse.json(
        { error: `SearXNG returned error: ${res.statusText}`, results: [] },
        { status: res.status, headers: CORS_HEADERS }
      );
    }

    const data = await res.json();
    const rawResults = data.results || [];

    // Filter and extract top 5 relevant results
    const results: SearchSource[] = rawResults.slice(0, 5).map((r: any) => ({
      title: r.title || "Untitled",
      url: r.url || "",
      snippet: r.content || r.snippet || "",
      engine: r.engine || "web",
    }));

    return NextResponse.json({ results }, { headers: CORS_HEADERS });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: `Could not connect to SearXNG at the configured URL. Make sure SearXNG is running in Docker: ${error.message}`,
        results: [],
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
