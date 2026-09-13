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
 * Strips conversational filler, pronouns (e.g. "saya", "aku"), polite requests, and news framing prefixes.
 * Also extracts direct URLs.
 */
export function reformulateSearchQuery(query: string): { isUrl: boolean; targetUrl?: string; cleanQuery: string } {
  const trimmed = (query || "").trim();
  const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    return { isUrl: true, targetUrl: urlMatch[0], cleanQuery: urlMatch[0] };
  }

  // 1. Remove polite greetings, pronouns, actions, and news framing prefixes
  let clean = trimmed
    .replace(/\s+(dong|ya|nih|kan|please|kok|sih)$/i, "")
    .replace(/\?+$/, "");

  let prev = "";
  while (prev !== clean) {
    prev = clean;
    clean = clean
      .replace(/^(tolong|coba|bisakah|bisa|mohon|please|can you|could you|help me)\s+/i, "")
      .replace(/^(saya|aku|kami|kita)\s+(mau|ingin|butuh|perlu)?\s*(minta|cari|tanya|tahu)?\s*/i, "")
      .replace(/^(carikan|cari|temukan|search for|search|find|browsing|scraping|scrape|baca|cek|jelaskan|berikan info|kasih tahu|tampilkan|get me|give me|tell me about)\s*/i, "")
      .replace(/^(saya|aku|kami|kita|me|us)\s+/i, "")
      .replace(/^(berita|kabar|info|informasi|news|updates?|articles?)(\s+(terbaru|terkini|terupdate|hari ini|latest|breaking))?(\s+(tentang|mengenai|soal|seputar|terkait|about|on|regarding))?\s*/i, "")
      .replace(/^(tentang|mengenai|soal|seputar|terkait|about|regarding)\s+/i, "")
      .trim();
  }

  // If already short and specific (e.g. "Cybersecurity" or "CVE-2024-3094"), return immediately
  const words = clean.split(/\s+/);
  if (words.length <= 3 && clean.length > 0) {
    return { isUrl: false, cleanQuery: clean };
  }

  // 2. Identify common question framing patterns and convert to keyword queries
  clean = clean
    .replace(/^(apa yang dimaksud dengan|apa itu|apakah itu|what is)\s+/i, "")
    .replace(/^(bagaimana cara|gimana cara|how to|cara)\s+/i, "")
    .replace(/^(kenapa|mengapa|why does|why is)\s+/i, "")
    .replace(/^(apa perbedaan|beda|difference between)\s+/i, "")
    .replace(/^(laptop|tools|framework|library|aplikasi|software|hp|smartphone|pc)\s+apa\s+(yang\s+)?(cocok|bagus|terbaik)?\s*/i, "$1 terbaik ")
    .replace(/^rekomendasi\s+/i, "")
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
 * Contextual Query Analysis & Classification:
 * Detects user intent (news, hardware, security, coding, general), extracts core subject nouns,
 * determines regional language/locale, and generates high-accuracy targeted query expansions.
 */
export interface QueryContext {
  isIndonesian: boolean;
  locale: { lang: string; cc: string; acceptLang: string };
  intent: "news" | "hardware" | "security" | "coding" | "general";
  coreSubjects: string[];
  refinedQueries: string[];
}

export function detectQueryContext(query: string, rawQuery?: string): QueryContext {
  const combinedText = `${rawQuery || ""} ${query}`.trim().toLowerCase();
  const trimmed = query.trim().toLowerCase();

  // Check language
  const isIndonesian =
    /\b(rekomendasi|terbaik|laptop|jutaan|juta|harga|hp|spek|spesifikasi|bagaimana|kenapa|apa|cara|yang|untuk|buat|dan|di|ini|terbaru|terkini|kabar|berita|murah|beli|pilihan)\b/i.test(
      combinedText
    );
  const locale = isIndonesian
    ? { lang: "id", cc: "ID", acceptLang: "id-ID,id;q=0.9,en-US;q=0.8" }
    : { lang: "en", cc: "US", acceptLang: "en-US,en;q=0.9" };

  let intent: "news" | "hardware" | "security" | "coding" | "general" = "general";
  const coreSubjects: string[] = [];
  const refinedQueries: string[] = [];

  // Check for News Intent markers
  const hasNewsMarker =
    /\b(berita|news|terbaru|terkini|kabar|hari ini|terupdate|breaking|headlines?|update|updates)\b/i.test(
      combinedText
    );

  // 1. Cybersecurity & CVE Intent
  const isSecurity =
    /\b(cve-\d{4}-\d+|cybersecurity|cyber security|keamanan siber|keamanan cyber|vulnerability|exploit|kerentanan|backdoor|zero-day|advisory|hacker|hacking|malware|ransomware|phishing|data breach|kebocoran data|infosec|soc|siem|pentest|penetration testing)\b/i.test(
      combinedText
    );

  if (isSecurity) {
    const cveMatch = combinedText.match(/cve-\d{4}-\d+/i);
    if (cveMatch) {
      coreSubjects.push(cveMatch[0].toUpperCase());
    } else if (/\b(cybersecurity|cyber security)\b/i.test(combinedText)) {
      coreSubjects.push("cybersecurity");
    } else if (/\b(keamanan siber|keamanan cyber)\b/i.test(combinedText)) {
      coreSubjects.push("keamanan siber");
    } else if (/\b(ransomware)\b/i.test(combinedText)) {
      coreSubjects.push("ransomware");
    } else if (/\b(data breach|kebocoran data)\b/i.test(combinedText)) {
      coreSubjects.push("data breach");
    } else {
      coreSubjects.push("vulnerability");
    }

    if (hasNewsMarker) {
      intent = "news";
    } else {
      intent = "security";
    }
  }

  // 2. Hardware & Product Purchase Intent
  if (intent === "general") {
    const hardwareKeywords = [
      "laptop",
      "notebook",
      "komputer",
      "pc",
      "smartphone",
      "hp",
      "tablet",
      "gpu",
      "vga",
      "rtx",
      "gtx",
      "processor",
      "intel",
      "ryzen",
      "ram",
      "ssd",
      "monitor",
      "gadget",
      "macbook",
      "tws",
      "headset",
    ];

    for (const hw of hardwareKeywords) {
      if (new RegExp(`\\b${hw}\\b`, "i").test(trimmed)) {
        intent = "hardware";
        coreSubjects.push(hw);
      }
    }
  }

  // 3. Coding & Developer Error Intent
  if (intent === "general") {
    if (
      /\b(error|exception|next\.js|react|vue|angular|tailwind|python|typescript|javascript|docker|golang|rust|api|syntax|bug)\b/i.test(
        trimmed
      )
    ) {
      intent = "coding";
      const codeKeywords = [
        "next.js",
        "react",
        "vue",
        "tailwind",
        "python",
        "docker",
        "typescript",
        "javascript",
      ];
      for (const ck of codeKeywords) {
        if (trimmed.includes(ck)) coreSubjects.push(ck);
      }
    }
  }

  // 4. Standalone News Intent
  if (intent === "general" && hasNewsMarker) {
    intent = "news";
    if (query && query.trim()) {
      coreSubjects.push(query.trim().toLowerCase());
    }
  }

  // 5. Targeted Query Expansions
  if (intent === "news") {
    const subj = coreSubjects[0] || query;
    if (isIndonesian) {
      refinedQueries.push(
        `${subj} berita terbaru terkini`,
        `${subj} kabar hari ini`,
        `${subj} update terkini`
      );
    } else {
      refinedQueries.push(
        `${subj} latest news`,
        `${subj} breaking news updates`,
        `${subj} today`
      );
    }
  } else if (intent === "hardware") {
    const subject = coreSubjects[0] || "laptop";
    const priceMatch = trimmed.match(/(\d+)\s*(jutaan|juta|jt|ribu|rb)/i);
    if (priceMatch) {
      const price = `${priceMatch[1]} ${priceMatch[2]}`;
      refinedQueries.push(
        `${subject} ${price} terbaik spesifikasi review`,
        `${subject} harga ${price} spesifikasi review`,
        `${subject} ${price} asus lenovo acer hp`
      );
    } else {
      refinedQueries.push(
        `${subject} terbaik 2025 review spesifikasi harga`,
        `${subject} terbaik review kelebihan kekurangan`
      );
    }
  } else if (intent === "security") {
    const subj = coreSubjects[0] || query;
    refinedQueries.push(
      `"${subj}" security advisory vulnerability details mitigation`,
      `"${subj}" nvd cve exploit details`
    );
  } else if (intent === "coding") {
    refinedQueries.push(
      `${query} documentation solution tutorial`,
      `${query} github example`
    );
  }

  return { isIndonesian, locale, intent, coreSubjects, refinedQueries };
}

/**
 * Filter and Rank Results by Strict Semantic Relevance:
 * Discards irrelevant spam, definition farms (KBBI), and mismatched topics.
 */
export function filterAndScoreResults(
  results: SearchSource[],
  context: QueryContext
): SearchSource[] {
  const scored: { item: SearchSource; score: number }[] = [];

  const universalSpamBlacklist = [
    "kbbi",
    "arti kata",
    "kamus besar",
    "definisi kata",
    "pronomina",
    "kata ganti",
    "arti dari",
    "sinonim",
    "antonim",
    "surat rekomendasi",
    "contoh surat",
    "format surat",
    "surat lamaran",
    "beasiswa",
    "pengertian rekomendasi",
    "perbedaan surat",
    "contoh review jurnal",
    "reviu atau review",
    "pengertian review",
    "definisi review",
    "sscasn",
    "petugas haji",
    "penerimaan polri",
  ];

  const trustedHardwareDomains = [
    "jagatreview.com",
    "gadgetren.com",
    "pricebook.co.id",
    "kompas.com",
    "detik.com",
    "carisinyal.com",
    "idntimes.com",
    "duniagames.co.id",
    "tokopedia.com",
    "shopee.co.id",
    "bhinneka.com",
    "myhartono.com",
    "erablue.id",
    "techradar.com",
    "tomshardware.com",
    "notebookcheck.net",
  ];

  const trustedNewsDomains = [
    "antaranews.com",
    "kompas.com",
    "detik.com",
    "cnnindonesia.com",
    "tempo.co",
    "bisnis.com",
    "cnbcindonesia.com",
    "reuters.com",
    "apnews.com",
    "theverge.com",
    "bleepingcomputer.com",
    "thehackernews.com",
    "securityweek.com",
    "darkreading.com",
    "ojk.go.id",
    "bssn.go.id",
    "kominfo.go.id",
  ];

  const trustedSecurityDomains = [
    "nvd.nist.gov",
    "cve.org",
    "cvefeed.io",
    "opencve.io",
    "github.com",
    "redhat.com",
    "debian.org",
    "bleepingcomputer.com",
    "thehackernews.com",
    "mitre.org",
    "krebsonsecurity.com",
    "securityweek.com",
    "darkreading.com",
    "ojk.go.id",
    "bssn.go.id",
  ];

  for (const item of results) {
    const lowerTitle = (item.title || "").toLowerCase();
    const lowerSnippet = (item.snippet || "").toLowerCase();
    const lowerUrl = (item.url || "").toLowerCase();
    const combined = `${lowerTitle} ${lowerSnippet} ${lowerUrl}`;

    // 1. Universal Spam & Irrelevant Template Elimination
    const isSpam = universalSpamBlacklist.some((b) => combined.includes(b));
    if (isSpam) continue;

    // 2. Core Subject Guard (for hardware and security)
    if (context.intent === "hardware" || context.intent === "security") {
      if (context.coreSubjects.length > 0) {
        const hasSubject = context.coreSubjects.some(
          (sub) => lowerTitle.includes(sub) || lowerSnippet.includes(sub)
        );
        if (!hasSubject) continue;
      }
    }

    // 3. Score calculation
    let score = 50;

    // Google News engine boost
    if (item.engine === "google-news") {
      score += 60;
    }

    // Core subject matches
    for (const sub of context.coreSubjects) {
      if (lowerTitle.includes(sub)) score += 50;
      if (lowerSnippet.includes(sub)) score += 25;
    }

    // Secondary matches
    const secondaryKeywords = [
      "rekomendasi",
      "terbaik",
      "spesifikasi",
      "spek",
      "harga",
      "review",
      "juta",
      "jutaan",
      "cve",
      "advisory",
      "solution",
      "berita",
      "terbaru",
      "terkini",
      "update",
      "news",
    ];
    for (const kw of secondaryKeywords) {
      if (lowerTitle.includes(kw)) score += 15;
      if (lowerSnippet.includes(kw)) score += 5;
    }

    // Domain authority boost
    if (context.intent === "news") {
      if (trustedNewsDomains.some((d) => lowerUrl.includes(d))) {
        score += 45;
      }
    } else if (context.intent === "hardware") {
      if (trustedHardwareDomains.some((d) => lowerUrl.includes(d))) {
        score += 45;
      }
    } else if (context.intent === "security") {
      if (trustedSecurityDomains.some((d) => lowerUrl.includes(d))) {
        score += 45;
      }
    }

    scored.push({ item, score });
  }

  // Sort descending by relevance score
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}

/**
 * Built-in search engine powered by high-speed organic result parsing with locale awareness.
 */
export async function searchBingEngine(
  cleanQuery: string,
  locale?: { lang: string; cc: string; acceptLang: string }
): Promise<SearchSource[]> {
  try {
    const lang = locale?.lang || "id";
    const cc = locale?.cc || "ID";
    const acceptLang = locale?.acceptLang || "id-ID,id;q=0.9,en-US;q=0.8";

    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(
      cleanQuery
    )}&setlang=${lang}&cc=${cc}`;

    const res = await fetch(bingUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": acceptLang,
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
        if (
          decoded.startsWith("http") &&
          !decoded.includes("bing.com") &&
          !decoded.includes("microsoft.com")
        ) {
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

/**
 * Real-time News Search powered by Google News RSS feed.
 * Zero-API key, lightning fast, provides timestamped articles and verified news publishers.
 */
export async function searchGoogleNews(
  query: string,
  locale?: { lang: string; cc: string; acceptLang: string }
): Promise<SearchSource[]> {
  try {
    const isId = locale?.lang === "id" || locale?.cc === "ID";
    const hl = isId ? "id" : "en-US";
    const gl = isId ? "ID" : "US";
    const ceid = isId ? "ID:id" : "US:en";

    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
      query
    )}&hl=${hl}&gl=${gl}&ceid=${ceid}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return [];
    const xml = await res.text();
    const results: SearchSource[] = [];

    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null && results.length < 8) {
      const block = match[1];

      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
      const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
      const sourceMatch = block.match(
        /<source\b[^>]*?(?:url="([^"]*)")?[^>]*>([\s\S]*?)<\/source>/i
      );

      let title = titleMatch ? cleanHtml(titleMatch[1]) : "";
      let link = linkMatch ? cleanHtml(linkMatch[1]) : "";
      const pubDate = pubDateMatch ? cleanHtml(pubDateMatch[1]) : "";
      const sourceName = sourceMatch ? cleanHtml(sourceMatch[2]) : "";

      if (!title || !link) continue;

      // Extract cleanly formatted date
      let formattedDate = "";
      if (pubDate) {
        try {
          const d = new Date(pubDate);
          if (!isNaN(d.getTime())) {
            formattedDate = d.toLocaleDateString(isId ? "id-ID" : "en-US", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
          }
        } catch {
          formattedDate = pubDate;
        }
      }

      // Format snippet with publisher and publication date
      const metaParts: string[] = [];
      if (sourceName) metaParts.push(`Sumber: ${sourceName}`);
      if (formattedDate) metaParts.push(formattedDate);
      const metaPrefix = metaParts.length > 0 ? `[${metaParts.join(" • ")}] ` : "";

      const snippet = `${metaPrefix}${title}. Berita terkini mengenai ${query}.`;

      results.push({
        title,
        url: link,
        snippet,
        engine: "google-news",
      });
    }

    return results;
  } catch {
    return [];
  }
}

