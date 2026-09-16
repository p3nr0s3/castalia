import { NextRequest, NextResponse } from "next/server";
import { SearchSource } from "@/lib/types";
import { getCorsHeaders } from "@/lib/corsHeaders";
import { assertPublicUrl, SsrfBlockedError } from "@/lib/ssrfGuard";
import {
  cleanSearchQuery,
  detectQueryContext,
  filterAndScoreResults,
  scrapePageContent,
  searchBingEngine,
  searchDualEngine,
  searchGoogleNews,
  searchWikipedia,
} from "@/lib/webSearchEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = getCorsHeaders();

interface SearchCacheItem {
  timestamp: number;
  payload: {
    results: SearchSource[];
    engine: string;
    query: string;
    intent: string;
  };
}

const SEARCH_CACHE = new Map<string, SearchCacheItem>();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
const MAX_CACHE_ENTRIES = 120;

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
      deepScrape = true,
    } = body;

    if (!query || !query.trim()) {
      return NextResponse.json({ results: [] }, { headers: CORS_HEADERS });
    }

    const { isUrl, targetUrl, cleanQuery } = cleanSearchQuery(query);

    // 1. Direct URL Reader Mode: If query contains a direct URL, scrape it immediately
    if (isUrl && targetUrl) {
      // The URL here comes straight from what the user (or a prompt-injected
      // agent reading untrusted content) typed as the search query — same
      // risk shape as /api/scan's target URL, so it gets the same guard.
      try {
        await assertPublicUrl(targetUrl.trim());
      } catch (err) {
        if (err instanceof SsrfBlockedError) {
          return NextResponse.json(
            { error: `Direct URL blocked: ${err.message}` },
            { status: 403, headers: CORS_HEADERS }
          );
        }
        throw err;
      }

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
    const queryCtx = detectQueryContext(cleanQuery, query);
    const primarySearchQuery =
      queryCtx.refinedQueries.length > 0
        ? queryCtx.refinedQueries[0]
        : cleanQuery;

    // Check In-Memory TTL Cache (0ms response for repeated queries)
    const cacheKey = `${queryCtx.locale.lang}:${queryCtx.intent}:${cleanQuery.toLowerCase()}`;
    const cached = SEARCH_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
      return NextResponse.json(cached.payload, {
        headers: { ...CORS_HEADERS, "X-Cache": "HIT" },
      });
    }

    let results: SearchSource[] = [];
    let usedEngine = "builtin";

    // 3. Precision Engine Routing by Query Intent
    if (queryCtx.intent === "news") {
      usedEngine = "google-news";
      // 1. Fetch fresh real-time news via Google News RSS (top 3)
      const newsResults = await searchGoogleNews(cleanQuery, queryCtx.locale);
      const filteredNews = filterAndScoreResults(newsResults, queryCtx);
      results = filteredNews.slice(0, 3);

      // 2. Hybrid enhancement: fetch 1-2 organic direct news articles (which can be deep-scraped)
      const organicNews = await searchDualEngine(primarySearchQuery, queryCtx.locale);
      const filteredOrganic = filterAndScoreResults(organicNews, queryCtx);
      for (const item of filteredOrganic) {
        if (!results.some((r) => r.url === item.url) && results.length < 5) {
          results.push(item);
        }
      }
    } else if (queryCtx.intent === "hardware") {
      usedEngine = "builtin-hardware";
      // Hardware product reviews & price comparisons
      const organicHardware = await searchDualEngine(primarySearchQuery, queryCtx.locale);
      let filteredHardware = filterAndScoreResults(organicHardware, queryCtx);

      // Second query attempt if first is sparse
      if (filteredHardware.length < 2 && queryCtx.refinedQueries.length > 1) {
        const secondOrganic = await searchBingEngine(
          queryCtx.refinedQueries[1],
          queryCtx.locale
        );
        const secondFiltered = filterAndScoreResults(secondOrganic, queryCtx);
        for (const item of secondFiltered) {
          if (!filteredHardware.some((r) => r.url === item.url)) {
            filteredHardware.push(item);
          }
        }
      }
      results = filteredHardware.slice(0, 5);
    } else if (queryCtx.intent === "security") {
      usedEngine = "builtin-security";
      // Cybersecurity & CVE advisories
      const organicSec = await searchDualEngine(primarySearchQuery, queryCtx.locale);
      let filteredSec = filterAndScoreResults(organicSec, queryCtx);

      if (filteredSec.length < 3 && queryCtx.refinedQueries.length > 1) {
        const secondSec = await searchBingEngine(
          queryCtx.refinedQueries[1],
          queryCtx.locale
        );
        const secondFiltered = filterAndScoreResults(secondSec, queryCtx);
        for (const item of secondFiltered) {
          if (!filteredSec.some((r) => r.url === item.url)) {
            filteredSec.push(item);
          }
        }
      }
      results = filteredSec.slice(0, 5);
    } else {
      usedEngine = "builtin-web";
      // General web search & programming documentation.
      // Was using bare `cleanQuery` here — silently discarding the refined
      // query (e.g. "<query> documentation solution tutorial") that
      // detectQueryContext() builds specifically for "coding"/"general"
      // intent. Every other intent branch (news/hardware/security) already
      // uses primarySearchQuery; this was the one gap, and it covers the
      // two most common intents (anything that isn't shopping or a
      // realtime/security query lands here).
      const organic = await searchDualEngine(primarySearchQuery, queryCtx.locale);
      let filtered = filterAndScoreResults(organic, queryCtx);

      // If the refined query came up short, retry with the plain cleanQuery
      // as a fallback — the refinement can occasionally over-narrow things.
      if (filtered.length < 2 && primarySearchQuery !== cleanQuery) {
        const plainOrganic = await searchBingEngine(cleanQuery, queryCtx.locale);
        const plainFiltered = filterAndScoreResults(plainOrganic, queryCtx);
        for (const item of plainFiltered) {
          if (!filtered.some((r) => r.url === item.url)) {
            filtered.push(item);
          }
        }
      }

      // Wikipedia concept search for encyclopedic definitions
      if (filtered.length < 3) {
        const wikiResults = await searchWikipedia(cleanQuery);
        for (const w of wikiResults) {
          if (!filtered.some((r) => r.url === w.url)) {
            filtered.push(w);
          }
        }
      }
      results = filtered.slice(0, 5);
    }

    // 4. Deep Page Scraping (Reader Mode): fetch and extract full text for top results
    if (deepScrape && results.length > 0) {
      let scrapedCount = 0;
      const scrapeTasks = results.map(async (r) => {
        // Only scrape standard URLs (skip Google News redirect URLs to avoid SPA hangs)
        if (
          scrapedCount < 2 &&
          r.url &&
          r.url.startsWith("http") &&
          !r.url.includes("news.google.com/rss/articles")
        ) {
          let isUrlSafe = true;
          try {
            await assertPublicUrl(r.url);
          } catch {
            isUrlSafe = false;
          }
          const content = isUrlSafe ? await scrapePageContent(r.url, 2500) : null;
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

    const responsePayload = {
      results,
      engine: usedEngine,
      query: primarySearchQuery,
      intent: queryCtx.intent,
    };

    // Store in In-Memory Cache with eviction
    if (SEARCH_CACHE.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = SEARCH_CACHE.keys().next().value;
      if (oldestKey) SEARCH_CACHE.delete(oldestKey);
    }
    SEARCH_CACHE.set(cacheKey, { timestamp: Date.now(), payload: responsePayload });

    return NextResponse.json(responsePayload, {
      headers: { ...CORS_HEADERS, "X-Cache": "MISS" },
    });
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
