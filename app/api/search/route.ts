import { NextRequest, NextResponse } from "next/server";
import { SearchSource } from "@/lib/types";
import { getCorsHeaders } from "@/lib/corsHeaders";
import {
  cleanSearchQuery,
  scrapePageContent,
  searchBingEngine,
  searchWikipedia,
} from "@/lib/webSearchEngine";

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
    const {
      query,
      searxngUrl = "http://localhost:8080",
      provider = "auto",
      deepScrape = true,
    } = body;

    if (!query || !query.trim()) {
      return NextResponse.json({ results: [] }, { headers: CORS_HEADERS });
    }

    const { isUrl, targetUrl, cleanQuery } = cleanSearchQuery(query);

    // 1. Direct URL Reader Mode: If query contains a direct URL, scrape it immediately
    if (isUrl && targetUrl) {
      const scrapedText = await scrapePageContent(targetUrl, 4000);
      const directSource: SearchSource = {
        title: targetUrl,
        url: targetUrl,
        snippet: scrapedText
          ? `${scrapedText.slice(0, 300)}...`
          : "Direct webpage reader content",
        deepContent: scrapedText || undefined,
        engine: "direct-scraper",
        scraped: Boolean(scrapedText),
      };
      return NextResponse.json(
        { results: [directSource], engine: "direct-scraper" },
        { headers: CORS_HEADERS }
      );
    }

    let results: SearchSource[] = [];
    let usedEngine = "builtin";

    // 2. Try SearXNG first if provider is 'auto' or 'searxng'
    if (provider === "searxng" || provider === "auto") {
      try {
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

        const targetSearchUrl = `${host}/search?q=${encodeURIComponent(
          cleanQuery
        )}&format=json&language=all`;

        const res = await fetch(targetSearchUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(1800),
        });

        if (res.ok) {
          const data = await res.json();
          const rawResults = data.results || [];
          if (rawResults.length > 0) {
            results = rawResults.slice(0, 5).map((r: any) => ({
              title: r.title || "Untitled",
              url: r.url || "",
              snippet: r.content || r.snippet || "",
              engine: r.engine ? `searxng-${r.engine}` : "searxng",
            }));
            usedEngine = "searxng";
          }
        }
      } catch {
        // SearXNG is unavailable or timed out; will fall back to built-in search
      }
    }

    // 3. Fall back to Built-in Web Search Engine (Zero Docker required)
    if (results.length === 0) {
      const organicResults = await searchBingEngine(cleanQuery);
      results = organicResults;
      usedEngine = "builtin-web";

      // If results are sparse (< 2), also query Wikipedia API
      if (results.length < 2) {
        const wikiResults = await searchWikipedia(cleanQuery);
        for (const w of wikiResults) {
          if (!results.some((r) => r.url === w.url)) {
            results.push(w);
          }
        }
      }
    }

    // 4. Deep Page Scraping (Reader Mode): fetch and extract full text for top results
    if (deepScrape && results.length > 0) {
      let scrapedCount = 0;
      const scrapeTasks = results.slice(0, 5).map(async (r) => {
        // Scrape up to 2-3 quality articles
        if (scrapedCount < 2 && r.url && r.url.startsWith("http")) {
          const content = await scrapePageContent(r.url, 2500);
          if (content && content.length >= 150) {
            scrapedCount++;
            return {
              ...r,
              deepContent: content,
              scraped: true,
            };
          }
        }
        return r;
      });

      results = await Promise.all(scrapeTasks);
    }

    return NextResponse.json(
      { results, engine: usedEngine, query: cleanQuery },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: `Search error: ${error.message}`,
        results: [],
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
