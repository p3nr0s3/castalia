import { NextRequest, NextResponse } from "next/server";
import { SearchSource } from "@/lib/types";
import { getCorsHeaders } from "@/lib/corsHeaders";
import {
  cleanSearchQuery,
  detectQueryContext,
  filterAndScoreResults,
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

    // 2. Contextual Query Analysis (Language, Intent, Core Subjects)
    const queryCtx = detectQueryContext(cleanQuery);
    const primarySearchQuery =
      queryCtx.intent === "hardware" && queryCtx.refinedQueries.length > 0
        ? queryCtx.refinedQueries[0]
        : cleanQuery;

    let results: SearchSource[] = [];
    let usedEngine = "builtin";

    // 3. Try SearXNG first if provider is 'auto' or 'searxng'
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
          primarySearchQuery
        )}&format=json&language=${queryCtx.locale.lang}`;

        const res = await fetch(targetSearchUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(1800),
        });

        if (res.ok) {
          const data = await res.json();
          const rawResults = data.results || [];
          if (rawResults.length > 0) {
            const mapped: SearchSource[] = rawResults.map((r: any) => ({
              title: r.title || "Untitled",
              url: r.url || "",
              snippet: r.content || r.snippet || "",
              engine: r.engine ? `searxng-${r.engine}` : "searxng",
            }));
            const filtered = filterAndScoreResults(mapped, queryCtx);
            if (filtered.length > 0) {
              results = filtered.slice(0, 5);
              usedEngine = "searxng";
            }
          }
        }
      } catch {
        // SearXNG is unavailable or timed out; will fall back to built-in search
      }
    }

    // 4. Fall back to Precision Built-in Web Search Engine (Zero Docker required)
    if (results.length === 0) {
      usedEngine = "builtin-web";
      // First attempt with primary query and regional locale
      const rawOrganic = await searchBingEngine(primarySearchQuery, queryCtx.locale);
      let filteredOrganic = filterAndScoreResults(rawOrganic, queryCtx);

      // If results are sparse (< 2) and we have alternative refined queries, execute second targeted search
      if (filteredOrganic.length < 2 && queryCtx.refinedQueries.length > 1) {
        const secondQuery = queryCtx.refinedQueries[1];
        const secondOrganic = await searchBingEngine(secondQuery, queryCtx.locale);
        const secondFiltered = filterAndScoreResults(secondOrganic, queryCtx);

        // Merge without duplicate URLs
        for (const item of secondFiltered) {
          if (!filteredOrganic.some((r) => r.url === item.url)) {
            filteredOrganic.push(item);
          }
        }
      }

      // If still empty (e.g. strict filter was too aggressive), fall back to original clean query without strict subject drop
      if (filteredOrganic.length === 0) {
        const fallbackOrganic = await searchBingEngine(cleanQuery, queryCtx.locale);
        // Exclude hard blacklist terms (KBBI, surat rekomendasi) even in fallback
        filteredOrganic = filterAndScoreResults(fallbackOrganic, {
          ...queryCtx,
          coreSubjects: [],
        });
      }

      results = filteredOrganic.slice(0, 5);

      // 5. Wikipedia: Only query for general or security encyclopedia concepts, NEVER for hardware shopping
      if (results.length < 2 && queryCtx.intent !== "hardware") {
        const wikiResults = await searchWikipedia(cleanQuery);
        for (const w of wikiResults) {
          if (!results.some((r) => r.url === w.url)) {
            results.push(w);
          }
        }
      }
    }

    // 6. Deep Page Scraping (Reader Mode): fetch and extract full text for top results with content validation
    if (deepScrape && results.length > 0) {
      let scrapedCount = 0;
      const scrapeTasks = results.map(async (r) => {
        if (scrapedCount < 2 && r.url && r.url.startsWith("http")) {
          const content = await scrapePageContent(r.url, 2500);
          if (content && content.length >= 150) {
            // Validate that scraped content is actually about the core subject
            if (queryCtx.coreSubjects.length > 0) {
              const lowerContent = content.toLowerCase();
              const hasSubject = queryCtx.coreSubjects.some((s) =>
                lowerContent.includes(s)
              );
              if (!hasSubject) {
                return r;
              }
            }

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
      {
        results,
        engine: usedEngine,
        query: primarySearchQuery,
        intent: queryCtx.intent,
      },
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
