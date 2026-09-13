import { NextRequest, NextResponse } from "next/server";
import { SearchSource } from "@/lib/types";
import { getCorsHeaders } from "@/lib/corsHeaders";
import {
  cleanSearchQuery,
  detectQueryContext,
  filterAndScoreResults,
  scrapePageContent,
  searchBingEngine,
  searchGoogleNews,
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
    const queryCtx = detectQueryContext(cleanQuery, query);
    const primarySearchQuery =
      queryCtx.refinedQueries.length > 0
        ? queryCtx.refinedQueries[0]
        : cleanQuery;

    let results: SearchSource[] = [];
    let usedEngine = "builtin";

    // 3. Precision Engine Routing by Query Intent
    if (queryCtx.intent === "news") {
      usedEngine = "google-news";
      // Fetch fresh, authentic news via Google News RSS
      const newsResults = await searchGoogleNews(cleanQuery, queryCtx.locale);
      const filteredNews = filterAndScoreResults(newsResults, queryCtx);
      results = filteredNews.slice(0, 5);

      // If news results are sparse (< 3), supplement with organic web search
      if (results.length < 3) {
        const organicNews = await searchBingEngine(primarySearchQuery, queryCtx.locale);
        const filteredOrganic = filterAndScoreResults(organicNews, queryCtx);
        for (const item of filteredOrganic) {
          if (!results.some((r) => r.url === item.url) && results.length < 5) {
            results.push(item);
          }
        }
      }
    } else if (queryCtx.intent === "hardware") {
      usedEngine = "builtin-hardware";
      // Hardware product reviews & price comparisons
      const organicHardware = await searchBingEngine(primarySearchQuery, queryCtx.locale);
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
      const organicSec = await searchBingEngine(primarySearchQuery, queryCtx.locale);
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
      // General web search & programming documentation
      const organic = await searchBingEngine(cleanQuery, queryCtx.locale);
      let filtered = filterAndScoreResults(organic, queryCtx);

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
