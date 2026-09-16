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
 * Universal Query Reformulation:
 * Converts conversational, long-winded user questions into precise, high-yield search keywords.
 * Peels greeting particles, polite requests, pronouns, actions, question words, and news framing.
 * Dynamically converts relative time references ("tahun ini", "this year") to the current calendar year.
 * Resolves conversational anaphora and short follow-up questions using multi-turn context history.
 */
export interface SearchContextHistory {
  previousQuery?: string;
  lastAssistantContent?: string;
}

export function reformulateSearchQuery(
  query: string,
  contextHistory?: SearchContextHistory
): { isUrl: boolean; targetUrl?: string; cleanQuery: string } {
  const trimmed = (query || "").trim();
  const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    return { isUrl: true, targetUrl: urlMatch[0], cleanQuery: urlMatch[0] };
  }

  const currentYear = new Date().getFullYear().toString();

  // 1. Remove trailing conversational slang, particles, and question marks
  let clean = trimmed
    .replace(/\s+(dong|ya|nih|kan|please|kok|sih|gan|bro|bray|lur|min|cuk|bang|om|dek|ygy|kek|deh|atuh|euy|lah|ta)$/i, "")
    .replace(/\?+$/, "");

  // 2. Iteratively peel conversational shell layers
  let prev = "";
  while (prev !== clean) {
    prev = clean;
    clean = clean
      // Layer 1: Greeting & Politeness (\\bp\\b matches single letter 'p' greeting without touching 'pasal')
      .replace(/^(halo|hai|hey|hi|permisi|assalamualaikum|\bp\b|gan|bro|bray|lur|min|cuk|bang|om|dek|tolong|coba|bisakah|bisa|mohon|please|can you|could you|help me|spill|infokan|bagi info|kasih tahu|kasih tau|tanya|mau tanya|nanya dong)\s*/i, "")
      // Layer 1b: Floating filler particles after actions (e.g. "spill dong")
      .replace(/^(dong|ya|nih|kan|please|kok|sih|deh|lah)\s*/i, "")
      // Layer 2: Persona & Speaker pronouns
      .replace(/^(saya|aku|kami|kita|gw|gue|gua|ane|ku|i|we)\s+(mau|ingin|pengen|butuh|perlu|minta|lagi nyari|sedang mencari|hendak)?\s*(tahu|tau|cari|baca|cek)?\s*/i, "")
      .replace(/^(saya|aku|kami|kita|gw|gue|gua|ane|ku|me|us)\s+/i, "")
      // Layer 3: Action & Search directive
      .replace(/^(carikan|cari|temukan|browsing|scraping|scrape|search for|search|find|lookup|baca|bacakan|cek|periksa|jelaskan|berikan|tampilkan|get me|give me|show me|tell me about|look up)\s*/i, "")
      .replace(/^(berita|kabar|info\b|informasi\b|news|updates?|articles?)(\s+(terbaru|terkini|terupdate|hari ini|latest|breaking))?(\s+(tentang|mengenai|soal|seputar|terkait|about|on|regarding))?\s*/i, "")
      .replace(/^(tentang|mengenai|soal|seputar|terkait|about|on|regarding|info tentang|informasi seputar)\s*/i, "")
      // Layer 4: Common Question Openers
      .replace(/^(apa yang dimaksud dengan|apa itu|apakah itu|apakah yang dimaksud|apa sih|what is|who is|siapa itu|siapakah)\s*/i, "")
      .replace(/^(bagaimana cara|gimana cara|cara|how to|gmn cara|tutorial cara|langkah-langkah)\s*/i, "")
      .replace(/^(kenapa|mengapa|why does|why is|kenape|kok bisa)\s*/i, "")
      .replace(/^(apa perbedaan antara|apa perbedaan|apa bedanya|perbedaan antara|perbedaan|difference between|vs)\s*/i, "")
      .replace(/^(rekomendasi|rekomen|saran|pilihan)\s*/i, "")
      .trim();
  }

  // 3. Multi-turn Conversational Entity & Anaphora Resolution
  if (contextHistory && (contextHistory.previousQuery || contextHistory.lastAssistantContent)) {
    const isAnaphoric = /\b(yang pertama|pertama|nomor 1|no 1|yang kedua|kedua|nomor 2|no 2|tersebut|tadi|yang tadi|di atas|itu|the first one|the second one|that one|previous)\b/i.test(trimmed);
    const isShortFollowup =
      clean.split(/\s+/).length <= 4 &&
      /\b(mitigasi|solusi|dampak|cara|exploit|patch|fix|kenapa|mengapa|detail|penjelasan|spek|harga|kelebihan|kekurangan|penyebab)(nya)?\b/i.test(
        clean
      );

    if (isAnaphoric || isShortFollowup) {
      // Look for CVE identifiers in the previous assistant message
      const rawMatches = (contextHistory.lastAssistantContent || "").match(/CVE-\d{4}-\d+/gi) || [];
      const uniqueCves = Array.from(new Set(rawMatches.map((m) => m.toUpperCase())));

      if (uniqueCves.length > 0) {
        if (/\b(yang pertama|pertama|nomor 1|no 1|the first one)\b/i.test(trimmed)) {
          const stripped = clean.replace(/\b(yang pertama|pertama|nomor 1|no 1|the first one)\b/gi, "").trim();
          clean = `${uniqueCves[0]} ${stripped}`.trim();
        } else if (/\b(yang kedua|kedua|nomor 2|no 2|the second one)\b/i.test(trimmed) && uniqueCves.length > 1) {
          const stripped = clean.replace(/\b(yang kedua|kedua|nomor 2|no 2|the second one)\b/gi, "").trim();
          clean = `${uniqueCves[1]} ${stripped}`.trim();
        } else {
          const stripped = clean.replace(/\b(tersebut|tadi|yang tadi|di atas|itu)\b/gi, "").trim();
          clean = `${uniqueCves[0]} ${stripped}`.trim();
        }
      } else if (contextHistory.previousQuery) {
        const prevClean = contextHistory.previousQuery
          .replace(/^(cari|carikan|search|tolong cari|browsing)\s+/i, "")
          .replace(/\s+(dong|ya|nih|kan)$/i, "")
          .trim();
        const stripped = clean.replace(/\b(tersebut|tadi|yang tadi|di atas|itu)\b/gi, "").trim();
        clean = `${prevClean} ${stripped}`.trim();
      }
    }
  }

  // If already short and specific (e.g. "Cybersecurity" or "CVE-2024-3094"), return immediately
  const words = clean.split(/\s+/);
  if (words.length <= 3 && clean.length > 0) {
    return { isUrl: false, cleanQuery: clean };
  }

  // 4. Dynamic Year Normalization
  clean = clean
    .replace(/\b(tahun ini|this year|saat ini|sekarang)\b/gi, currentYear)
    .trim();

  // 5. Remove unnecessary filler stop-words if query is lengthy (> 6 words)
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
 * Universal 2-Axis Query Routing & Entity Extraction:
 * Axis 1 (Temporal Mode): "realtime" (breaking news, current year) vs "evergreen" (guides, definitions, stable concepts).
 * Axis 2 (Domain): "security" (CVE, exploits, pentest), "shopping" (hardware, prices, specs), "technical" (code, libraries), "general" (all other topics: medical, legal, culinary, etc.).
 * Maps cleanly to existing intent types for backward compatibility, while locking queries dynamically to the current calendar year.
 */
export interface QueryContext {
  isIndonesian: boolean;
  locale: { lang: string; cc: string; acceptLang: string };
  temporalMode: "realtime" | "evergreen";
  domain: "security" | "shopping" | "technical" | "general";
  intent: "news" | "hardware" | "security" | "coding" | "general";
  coreSubjects: string[];
  refinedQueries: string[];
  yearTarget: number;
}

export function detectQueryContext(query: string, rawQuery?: string): QueryContext {
  const currentYear = new Date().getFullYear();
  const combinedText = `${rawQuery || ""} ${query}`.trim().toLowerCase();
  const trimmed = query.trim().toLowerCase();

  // Language & Regional Locale Detection
  const isIndonesian =
    /\b(rekomendasi|terbaik|laptop|jutaan|juta|harga|hp|spek|spesifikasi|bagaimana|kenapa|apa|cara|yang|untuk|buat|dan|di|ini|terbaru|terkini|kabar|berita|murah|beli|pilihan|obat|pasal|anak)\b/i.test(
      combinedText
    );
  const locale = isIndonesian
    ? { lang: "id", cc: "ID", acceptLang: "id-ID,id;q=0.9,en-US;q=0.8" }
    : { lang: "en", cc: "US", acceptLang: "en-US,en;q=0.9" };

  // Axis 1: Temporal Mode Detection
  const isRealtime =
    new RegExp(
      `\\b(berita|news|terbaru|terkini|kabar|hari ini|terupdate|breaking|headlines?|update|updates|teranyar|rilis terbaru|latest|today|recent|${currentYear})\\b`,
      "i"
    ).test(combinedText);
  const temporalMode: "realtime" | "evergreen" = isRealtime ? "realtime" : "evergreen";

  // Axis 2: Domain Target Detection
  let domain: "security" | "shopping" | "technical" | "general" = "general";
  const coreSubjects: string[] = [];
  const refinedQueries: string[] = [];

  // Security Domain: matches standalone \bcve\b as well as CVE identifiers and infosec vocabulary
  const isSecurity =
    /\b(cve|cve-\d{4}-\d+|vulnerability|vulnerabilities|exploit|exploits|kerentanan|backdoor|zero-day|0-day|advisory|hacker|hacking|malware|ransomware|phishing|data breach|kebocoran data|infosec|cybersecurity|cyber security|keamanan siber|keamanan cyber|soc|siem|pentest|penetration testing|threat)\b/i.test(
      combinedText
    );

  // Shopping & Hardware Domain
  const isShopping =
    /\b(laptop|notebook|komputer|pc|smartphone|hp|handphone|tablet|gpu|vga|rtx|gtx|processor|intel|ryzen|ram|ssd|monitor|gadget|macbook|tws|headset|harga|spesifikasi|spek|diskon|murah|jutaan|juta|beli|price|review)\b/i.test(
      combinedText
    );

  // Technical & Developer Domain
  const isTechnical =
    /\b(error|exception|bug|syntax|api|sdk|next\.js|react|vue|angular|tailwind|python|typescript|javascript|golang|rust|docker|kubernetes|linux|database|sql|postgres|mysql|redis|git|github|npm|pip)\b/i.test(
      combinedText
    );

  if (isSecurity) {
    domain = "security";
    const cveMatch = combinedText.match(/cve-\d{4}-\d+/i);
    if (cveMatch) {
      coreSubjects.push(cveMatch[0].toUpperCase());
    } else if (/\bcve\b/i.test(combinedText)) {
      coreSubjects.push("cve");
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
  } else if (isShopping) {
    domain = "shopping";
    const hwMatch = combinedText.match(
      /\b(laptop|notebook|pc|smartphone|hp|tablet|gpu|rtx|gtx|processor|ram|ssd|monitor|gadget|macbook|tws|headset)\b/i
    );
    if (hwMatch) coreSubjects.push(hwMatch[1].toLowerCase());
    else coreSubjects.push("gadget");
  } else if (isTechnical) {
    domain = "technical";
    const codeKeywords = [
      "next.js",
      "react",
      "vue",
      "tailwind",
      "python",
      "docker",
      "typescript",
      "javascript",
      "golang",
      "rust",
      "sql",
    ];
    for (const ck of codeKeywords) {
      if (combinedText.includes(ck)) coreSubjects.push(ck);
    }
  }

  // Unified Intent Mapping for backward compatibility
  let intent: "news" | "hardware" | "security" | "coding" | "general" = "general";
  if (domain === "shopping") {
    // Shopping always uses product specs/reviews, even if user says "terbaru"
    intent = "hardware";
  } else if (domain === "technical") {
    intent = "coding";
  } else if (domain === "security") {
    // If security + realtime (e.g. "cari cve terbaru") -> route to news (Google News RSS + fresh advisories)
    // If security + evergreen (e.g. "detail CVE-2024-3094") -> route to security databases
    intent = isRealtime ? "news" : "security";
  } else if (temporalMode === "realtime") {
    intent = "news";
  }

  // Targeted Query Expansions with dynamic calendar year
  const subject = coreSubjects[0] || query;
  if (domain === "security" && temporalMode === "realtime") {
    if (coreSubjects.includes("cve") || coreSubjects.some((s) => s.startsWith("CVE-"))) {
      refinedQueries.push(
        `"CVE-${currentYear}" OR "CVE-${currentYear - 1}" latest vulnerability advisory`,
        `"CVE-${currentYear}" critical exploit details nvd cvefeed`,
        `cybersecurity vulnerability advisory ${currentYear}`
      );
    } else {
      if (isIndonesian) {
        refinedQueries.push(
          `${subject} berita terbaru terkini ${currentYear}`,
          `${subject} kabar hari ini`,
          `${subject} update terkini`
        );
      } else {
        refinedQueries.push(
          `${subject} latest news ${currentYear}`,
          `${subject} breaking news updates today`,
          `${subject} current update`
        );
      }
    }
  } else if (temporalMode === "realtime") {
    if (isIndonesian) {
      refinedQueries.push(
        `${subject} berita terbaru terkini ${currentYear}`,
        `${subject} kabar hari ini`,
        `${subject} update terkini`
      );
    } else {
      refinedQueries.push(
        `${subject} latest news ${currentYear}`,
        `${subject} breaking news updates today`,
        `${subject} current update`
      );
    }
  } else if (domain === "shopping") {
    const priceMatch = combinedText.match(/(\d+)\s*(jutaan|juta|jt|ribu|rb)/i);
    if (priceMatch) {
      const price = `${priceMatch[1]} ${priceMatch[2]}`;
      refinedQueries.push(
        `${subject} ${price} terbaik spesifikasi review ${currentYear}`,
        `${subject} harga ${price} spesifikasi review`,
        `${subject} ${price} asus lenovo acer hp`
      );
    } else {
      refinedQueries.push(
        `${subject} terbaik ${currentYear} review spesifikasi harga`,
        `${subject} terbaik review kelebihan kekurangan`
      );
    }
  } else if (domain === "security") {
    refinedQueries.push(
      `"${subject}" security advisory vulnerability details mitigation`,
      `"${subject}" nvd cve exploit details`
    );
  } else if (domain === "technical") {
    refinedQueries.push(
      `${query} documentation solution tutorial`,
      `${query} github example`
    );
  } else {
    refinedQueries.push(
      `${query} penjelasan panduan informasi`,
      `${query}`
    );
  }

  return {
    isIndonesian,
    locale,
    temporalMode,
    domain,
    intent,
    coreSubjects,
    refinedQueries,
    yearTarget: currentYear,
  };
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

  const trustedTechnicalDomains = [
    "stackoverflow.com",
    "developer.mozilla.org",
    "github.com",
    "github.io",
    "nextjs.org",
    "react.dev",
    "vuejs.org",
    "angular.dev",
    "tailwindcss.com",
    "npmjs.com",
    "pypi.org",
    "docs.python.org",
    "docs.docker.com",
    "kubernetes.io",
    "postgresql.org",
    "dev.to",
    "medium.com",
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
    if (context.intent === "hardware" || context.domain === "security" || context.intent === "security") {
      if (context.coreSubjects.length > 0) {
        const hasSubject = context.coreSubjects.some(
          (sub) => lowerTitle.includes(sub) || lowerSnippet.includes(sub)
        );
        if (!hasSubject && context.domain === "security") {
          // Allow relevant infosec keywords if specific subject tag isn't verbatim
          const hasSecKw = /\b(cve|vulnerability|exploit|zero-day|0-day|keamanan|hacker|malware|cybersecurity)\b/i.test(combined);
          if (!hasSecKw) continue;
        } else if (!hasSubject) {
          continue;
        }
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

    // Temporal recency scoring (boost current year, penalize stale years on realtime queries)
    const currentYearNum = new Date().getFullYear();
    const currentYearStr = currentYearNum.toString();
    const prevYearStr = (currentYearNum - 1).toString();
    if (context.temporalMode === "realtime") {
      if (lowerTitle.includes(currentYearStr) || lowerSnippet.includes(currentYearStr)) {
        score += 40;
      } else if (lowerTitle.includes(prevYearStr) || lowerSnippet.includes(prevYearStr)) {
        score += 20;
      }
      const olderYears: string[] = [];
      for (let y = currentYearNum - 6; y <= currentYearNum - 2; y++) {
        olderYears.push(String(y));
      }
      for (const y of olderYears) {
        if (lowerTitle.includes(y) && !lowerTitle.includes(currentYearStr)) {
          score -= 30;
        }
      }
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
    if (context.intent === "news" || context.temporalMode === "realtime") {
      if (trustedNewsDomains.some((d) => lowerUrl.includes(d))) {
        score += 45;
      }
    }
    if (context.intent === "hardware" || context.domain === "shopping") {
      if (trustedHardwareDomains.some((d) => lowerUrl.includes(d))) {
        score += 45;
      }
    }
    if (context.intent === "security" || context.domain === "security") {
      if (trustedSecurityDomains.some((d) => lowerUrl.includes(d))) {
        score += 45;
      }
    }
    if (context.intent === "coding" || context.domain === "technical") {
      if (trustedTechnicalDomains.some((d) => lowerUrl.includes(d))) {
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

    if (results.length === 0 && /unusual traffic|verify you are a human|are you a robot/i.test(html)) {
      console.warn("[search] Bing appears to have blocked/challenged this request (0 results parsed).");
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Decodes DuckDuckGo's HTML-endpoint redirect URLs (//duckduckgo.com/l/?uddg=...)
 * directly into target destination URLs.
 */
export function decodeDuckDuckGoUrl(rawUrl: string): string {
  try {
    const withScheme = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
    const parsed = new URL(withScheme);
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) {
      const decoded = decodeURIComponent(uddg);
      if (decoded.startsWith("http")) return decoded;
    }
  } catch {}
  return rawUrl;
}

/**
 * Independent second organic-search source (DuckDuckGo's no-JS HTML endpoint).
 * Run alongside searchBingEngine so a block/markup-change/degraded response on
 * one engine doesn't leave the whole search with zero or low-quality results —
 * the two sources are merged and deduped by the caller.
 */
export async function searchDuckDuckGoEngine(
  cleanQuery: string,
  locale?: { lang: string; cc: string; acceptLang: string }
): Promise<SearchSource[]> {
  try {
    const acceptLang = locale?.acceptLang || "en-US,en;q=0.9";
    const region = locale?.lang === "id" ? "id-id" : "us-en";

    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}&kl=${region}`;

    const res = await fetch(ddgUrl, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": acceptLang,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `q=${encodeURIComponent(cleanQuery)}&kl=${region}`,
      signal: AbortSignal.timeout(4500),
    });

    if (!res.ok) return [];
    const html = await res.text();
    const results: SearchSource[] = [];

    const resultRegex = /<div class="result[^"]*results_links[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
    let match: RegExpExecArray | null;

    while ((match = resultRegex.exec(html)) !== null) {
      const block = match[1];
      const linkMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;

      const decodedUrl = decodeDuckDuckGoUrl(linkMatch[1]);
      const title = cleanHtml(linkMatch[2]);

      const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
      const snippet = snippetMatch ? cleanHtml(snippetMatch[1]) : "";

      if (decodedUrl.startsWith("http") && title && !results.some((r) => r.url === decodedUrl)) {
        results.push({
          title,
          url: decodedUrl,
          snippet,
          engine: "builtin-duckduckgo",
        });
      }
    }

    if (results.length === 0 && /anomaly|unusual activity/i.test(html)) {
      console.warn("[search] DuckDuckGo appears to have blocked/challenged this request (0 results parsed).");
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Runs Bing and DuckDuckGo in parallel and merges/dedupes the results, so a
 * block or markup change on one engine doesn't starve the whole query — the
 * two unofficial scrapers cover each other's blind spots instead of being
 * tried one after another with the same failure mode.
 */
export async function searchDualEngine(
  cleanQuery: string,
  locale?: { lang: string; cc: string; acceptLang: string }
): Promise<SearchSource[]> {
  const [bingSettled, ddgSettled] = await Promise.allSettled([
    searchBingEngine(cleanQuery, locale),
    searchDuckDuckGoEngine(cleanQuery, locale),
  ]);

  const bing = bingSettled.status === "fulfilled" ? bingSettled.value : [];
  const ddg = ddgSettled.status === "fulfilled" ? ddgSettled.value : [];

  const merged: SearchSource[] = [...bing];
  for (const item of ddg) {
    if (!merged.some((r) => r.url === item.url)) {
      merged.push(item);
    }
  }
  return merged;
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

