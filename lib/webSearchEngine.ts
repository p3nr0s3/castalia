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
 * Smart Query Reformulation:
 * Converts conversational, long-winded user questions into precise, high-yield search keywords.
 * Also extracts direct URLs.
 */
export function reformulateSearchQuery(query: string): { isUrl: boolean; targetUrl?: string; cleanQuery: string } {
  const trimmed = (query || "").trim();
  const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    return { isUrl: true, targetUrl: urlMatch[0], cleanQuery: urlMatch[0] };
  }

  // 1. Remove polite greetings and conversational action prefixes
  let clean = trimmed
    .replace(/^(tolong|coba|bisakah|bisa|mohon|please|can you|help me|saya mau|saya ingin|mau tanya)\s+/i, "")
    .replace(/^(carikan|cari|search for|search|find|browsing|scraping|scrape|baca|cek|jelaskan|berikan info|kasih tahu)\s+(tentang|info tentang|informasi tentang|mengenai|soal|seputar|about)?\s*/i, "")
    .replace(/\s+(dong|ya|nih|kan|please|kok|sih)$/i, "")
    .trim();

  // If already short and specific (e.g. "CVE-2024-3094 xz"), return immediately
  const words = clean.split(/\s+/);
  if (words.length <= 4) {
    return { isUrl: false, cleanQuery: clean || trimmed };
  }

  // 2. Identify common question framing patterns and convert to keyword queries
  clean = clean
    .replace(/^(apa yang dimaksud dengan|apa itu|apakah itu|what is)\s+/i, "")
    .replace(/^(bagaimana cara|gimana cara|how to|cara)\s+/i, "")
    .replace(/^(kenapa|mengapa|why does|why is)\s+/i, "")
    .replace(/^(apa perbedaan|beda|difference between)\s+/i, "")
    .replace(/^(rekomendasi|laptop apa yang|tools apa yang)\s+/i, "rekomendasi ")
    .replace(/\?+$/, "")
    .trim();

  // 3. Normalize "tahun ini" / "this year" to current year
  clean = clean.replace(/\btahun ini\b/gi, "2025").replace(/\bthis year\b/gi, "2025");

  // 4. Remove unnecessary filler stop-words if query is lengthy
  if (clean.split(/\s+/).length > 6) {
    const stopWords = new Set([
      "yang", "untuk", "buat", "pada", "di", "ke", "dari", "dan", "atau", "adalah",
      "tersebut", "bisa", "akan", "agar", "supaya", "dengan", "dalam", "saat", "ketika",
      "the", "a", "an", "in", "on", "at", "for", "with", "by", "about", "and", "or"
    ]);
    const filtered = clean.split(/\s+/).filter((w) => !stopWords.has(w.toLowerCase()));
    if (filtered.length >= 3) {
      clean = filtered.join(" ");
    }
  }

  return { isUrl: false, cleanQuery: clean || trimmed };
}

// Keep cleanSearchQuery as an alias for backwards compatibility
export const cleanSearchQuery = reformulateSearchQuery;

/**
 * Scrapes target webpage content with hybrid direct HTML and Jina Reader fallback.
 * Isolates readable prose, handles JavaScript-rendered SPAs, and filters out noise.
 */
export async function scrapePageContent(url: string, maxChars: number = 2500): Promise<string | null> {
  let initialText: string | null = null;
  let metaDesc = "";

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
      },
      signal: AbortSignal.timeout(3500),
    });

    if (res.ok) {
      const html = await res.text();
      metaDesc = extractMetaDescription(html);

      // Look for dedicated article or main content tags first
      let contentHtml = html;
      const articleMatch =
        html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
        html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
      if (articleMatch && articleMatch[1].length > 300) {
        contentHtml = articleMatch[1];
      }

      const cleanText = cleanHtml(contentHtml);
      const isSpaShell =
        cleanText.length < 180 ||
        /enable javascript|javascript is disabled|needs javascript|loading\.\.\./i.test(cleanText);

      // If direct HTML is rich and not an SPA shell, return immediately
      if (!isSpaShell && cleanText.length > 180) {
        if (metaDesc && !cleanText.startsWith(metaDesc)) {
          return `${metaDesc}\n\n${cleanText}`.slice(0, maxChars);
        }
        return cleanText.slice(0, maxChars);
      }
      initialText = cleanText;
    }
  } catch {
    // Network or timeout error on direct fetch; proceed to Jina reader fallback
  }

  // Fallback to Jina Reader (executes client-side JS / SPAs into clean Markdown)
  try {
    const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(4500),
    });

    if (jinaRes.ok) {
      const jinaText = await jinaRes.text();
      const cleanJina = jinaText
        .replace(/^Title:[\s\S]*?Markdown Content:\s*/i, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (cleanJina.length > 150) {
        return cleanJina.slice(0, maxChars);
      }
    }
  } catch {
    // Jina fallback failed or timed out
  }

  if (metaDesc) return metaDesc;
  if (initialText && initialText.length > 40) return initialText.slice(0, maxChars);
  return null;
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
