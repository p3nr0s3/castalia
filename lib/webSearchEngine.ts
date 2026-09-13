import { SearchSource } from "./types";

/**
 * Strips HTML tags, script, style, navigation, footer boilerplate,
 * and decodes standard HTML entities to extract clean readable text.
 */
export function cleanHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#0183;/g, "·")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts meta description or open-graph description from HTML.
 */
export function extractMetaDescription(html: string): string {
  if (!html) return "";
  const match =
    html.match(/<meta\b[^>]*?(?:name|property)=["'](?:description|og:description)["'][^>]*?content=["']([^"']+)["']/i) ||
    html.match(/<meta\b[^>]*?content=["']([^"']+)["'][^>]*?(?:name|property)=["'](?:description|og:description)["']/i);
  return match ? cleanHtml(match[1]) : "";
}

/**
 * Decodes Bing base64 redirect URLs (e.g. u=a1aHR0cHM6...) directly into target destination URLs.
 */
export function decodeBingUrl(rawUrl: string): string {
  try {
    const unescaped = rawUrl.replace(/&amp;/g, "&");
    const parsed = new URL(unescaped);
    const u = parsed.searchParams.get("u");
    if (u && u.startsWith("a1")) {
      const b64 = u.slice(2).replace(/-/g, "+").replace(/_/g, "/");
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      if (decoded.startsWith("http")) return decoded;
    }
  } catch {}
  return rawUrl;
}

/**
 * Strips conversational filler and common Indonesian/English search command phrases,
 * leaving pure search intent and keywords. Also extracts direct URLs.
 */
export function cleanSearchQuery(query: string): { isUrl: boolean; targetUrl?: string; cleanQuery: string } {
  const trimmed = (query || "").trim();
  const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    return { isUrl: true, targetUrl: urlMatch[0], cleanQuery: urlMatch[0] };
  }

  let clean = trimmed
    .replace(/^(tolong|coba|bisakah|bisa|mohon|please|can you|help me)\s+/i, "")
    .replace(/^(carikan|cari|search for|search|find|browsing|scrape|scraping|baca|cek)\s+(tentang|info tentang|informasi tentang|mengenai|soal|seputar|about)?\s*/i, "")
    .replace(/\s+(dong|ya|nih|kan|please|terbaru|terkini)$/i, "")
    .trim();

  if (!clean) clean = trimmed;
  return { isUrl: false, cleanQuery: clean };
}

/**
 * Scrapes target webpage content, isolating readable prose (<article> or <main>),
 * filtering out boilerplate, and skipping SPA stubs.
 */
export async function scrapePageContent(url: string, maxChars: number = 2500): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
      },
      signal: AbortSignal.timeout(4500),
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Look for dedicated article or main content tags first
    let contentHtml = html;
    const articleMatch =
      html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
      html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
    if (articleMatch && articleMatch[1].length > 300) {
      contentHtml = articleMatch[1];
    }

    const cleanText = cleanHtml(contentHtml);
    const metaDesc = extractMetaDescription(html);

    // If body text is too short (likely an SPA shell), use meta description if available
    if (cleanText.length < 150) {
      return metaDesc || (cleanText.length > 30 ? cleanText : null);
    }

    if (metaDesc && !cleanText.startsWith(metaDesc)) {
      return `${metaDesc}\n\n${cleanText}`.slice(0, maxChars);
    }

    return cleanText.slice(0, maxChars);
  } catch {
    return null;
  }
}

/**
 * Built-in search engine powered by high-speed organic result parsing.
 */
export async function searchBingEngine(cleanQuery: string): Promise<SearchSource[]> {
  try {
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(cleanQuery)}&setlang=en`;
    const res = await fetch(bingUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(4500),
    });

    if (!res.ok) return [];
    const html = await res.text();
    const results: SearchSource[] = [];

    const bAlgoRegex = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
    let bAlgoMatch: RegExpExecArray | null;

    while ((bAlgoMatch = bAlgoRegex.exec(html)) !== null) {
      const block = bAlgoMatch[1];
      const h2Match = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      const title = h2Match ? cleanHtml(h2Match[1]) : "";

      let decodedUrl = "";
      const linkRegex = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let linkMatch: RegExpExecArray | null;
      while ((linkMatch = linkRegex.exec(block)) !== null) {
        const href = linkMatch[1];
        const decoded = decodeBingUrl(href);
        if (decoded.startsWith("http") && !decoded.includes("bing.com") && !decoded.includes("microsoft.com")) {
          decodedUrl = decoded;
          break;
        }
      }

      const pMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const snippet = pMatch ? cleanHtml(pMatch[1]) : "";

      if (decodedUrl && title && !results.some((r) => r.url === decodedUrl)) {
        results.push({
          title,
          url: decodedUrl,
          snippet,
          engine: "builtin-bing",
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Searches Wikipedia's open public API for encyclopedia definitions and tech concepts.
 */
export async function searchWikipedia(query: string): Promise<SearchSource[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "OllamaChatApp/1.0 (local-ai-assistant)" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const hits = data?.query?.search || [];
    return hits.slice(0, 3).map((h: any) => ({
      title: `${h.title} (Wikipedia)`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, "_"))}`,
      snippet: cleanHtml(h.snippet || ""),
      engine: "wikipedia",
    }));
  } catch {
    return [];
  }
}
