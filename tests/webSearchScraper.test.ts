import { describe, it, expect } from "vitest";
import {
  cleanHtml,
  extractMetaDescription,
  decodeBingUrl,
  cleanSearchQuery,
  detectQueryContext,
  filterAndScoreResults,
} from "../lib/webSearchEngine";
import { SearchSource } from "../lib/types";

describe("webSearchEngine utilities", () => {
  it("cleanHtml strips tags, scripts, styles, boilerplate, and decodes entities", () => {
    const rawHtml = `
      <html>
        <head>
          <script>console.log("secret tracker");</script>
          <style>body { color: red; }</style>
        </head>
        <body>
          <header><nav><a href="/">Home</a></nav></header>
          <main>
            <h1>Security Advisory &amp; Bug Report</h1>
            <p>Vulnerability in XZ package &lt;5.6.0&gt; found.</p>
          </main>
          <footer>Copyright &copy; 2026</footer>
        </body>
      </html>
    `;

    const cleaned = cleanHtml(rawHtml);
    expect(cleaned).not.toContain("secret tracker");
    expect(cleaned).not.toContain("body { color: red; }");
    expect(cleaned).not.toContain("<main>");
    expect(cleaned).toContain("Security Advisory & Bug Report");
    expect(cleaned).toContain("Vulnerability in XZ package <5.6.0> found.");
  });

  it("extractMetaDescription extracts meta description or og:description", () => {
    const htmlWithMeta = `
      <html>
        <head>
          <meta name="description" content="Official advisory for CVE-2024-3094 backdoor." />
        </head>
      </html>
    `;
    expect(extractMetaDescription(htmlWithMeta)).toBe(
      "Official advisory for CVE-2024-3094 backdoor."
    );

    const htmlWithOg = `
      <html>
        <head>
          <meta property="og:description" content="Next.js 15 brings React 19 support and faster compiler." />
        </head>
      </html>
    `;
    expect(extractMetaDescription(htmlWithOg)).toBe(
      "Next.js 15 brings React 19 support and faster compiler."
    );
  });

  it("decodeBingUrl cleanly decodes base64 Bing redirect links into destination URLs", () => {
    const bingLink =
      "https://www.bing.com/ck/a?!&&p=4256f3c1856f1023&u=a1aHR0cHM6Ly93d3cuY3ZlLm9yZy8&ntb=1";
    const decoded = decodeBingUrl(bingLink);
    expect(decoded).toBe("https://www.cve.org/");

    const normalLink = "https://example.com/page";
    expect(decodeBingUrl(normalLink)).toBe("https://example.com/page");
  });

  it("cleanSearchQuery identifies direct URLs and strips conversational prefixes", () => {
    const directUrl = cleanSearchQuery(
      "https://nvd.nist.gov/vuln/detail/CVE-2024-3094"
    );
    expect(directUrl.isUrl).toBe(true);
    expect(directUrl.targetUrl).toBe(
      "https://nvd.nist.gov/vuln/detail/CVE-2024-3094"
    );

    const query1 = cleanSearchQuery("tolong carikan cve-2024-3094 dong");
    expect(query1.isUrl).toBe(false);
    expect(query1.cleanQuery).toBe("cve-2024-3094");

    const query2 = cleanSearchQuery(
      "coba cari info tentang next.js 15 server actions"
    );
    expect(query2.isUrl).toBe(false);
    expect(query2.cleanQuery).toBe("next.js 15 server actions");

    const query3 = cleanSearchQuery(
      "search for latest quantum computing breakthroughs"
    );
    expect(query3.isUrl).toBe(false);
    expect(query3.cleanQuery).toBe("latest quantum computing breakthroughs");
  });

  it("reformulateSearchQuery optimizes natural questions into search keywords", () => {
    const q1 = cleanSearchQuery(
      "laptop apa yang cocok buat ngoding android studio budget 12 jutaan tahun ini?"
    );
    expect(q1.isUrl).toBe(false);
    expect(q1.cleanQuery).toContain("android studio");
    expect(q1.cleanQuery).toContain("2025");

    const q2 = cleanSearchQuery("apa perbedaan deepseek r1 dan openai o1?");
    expect(q2.isUrl).toBe(false);
    expect(q2.cleanQuery).toBe("deepseek r1 dan openai o1");
  });

  it("detectQueryContext classifies hardware intent and generates refined queries", () => {
    const ctx = detectQueryContext("rekomendasi laptop 10 jutaan");
    expect(ctx.intent).toBe("hardware");
    expect(ctx.coreSubjects).toContain("laptop");
    expect(ctx.isIndonesian).toBe(true);
    expect(ctx.locale.cc).toBe("ID");
    expect(ctx.refinedQueries.length).toBeGreaterThan(0);
    expect(ctx.refinedQueries[0]).toContain("laptop");
    expect(ctx.refinedQueries[0]).toContain("10 jutaan");
    expect(ctx.refinedQueries[0].startsWith("rekomendasi")).toBe(false);
  });

  it("filterAndScoreResults eliminates KBBI, letter templates, and unrelated items", () => {
    const ctx = detectQueryContext("rekomendasi laptop 10 jutaan");

    const candidateResults: SearchSource[] = [
      {
        title: 'Arti Kata "rekomendasi" Menurut KBBI - Kamus Besar Bahasa Indonesia',
        snippet: "Kata rekomendasi memiliki makna luas dalam bahasa Indonesia.",
        url: "https://kbbi.kemdikbud.go.id/entri/rekomendasi",
      },
      {
        title: "10 Contoh Surat Rekomendasi Beserta Format dan Cara Membuat",
        snippet: "Surat rekomendasi kerja adalah surat referensi resmi.",
        url: "https://example.com/surat-rekomendasi",
      },
      {
        title: "Pencarian Kata 'rekomendasi' | KBBI.co.id",
        snippet: "Definisi kata rekomendasi.",
        url: "https://kbbi.co.id/arti-kata/rekomendasi",
      },
      {
        title: "SSCASN - Sistem Seleksi Calon Aparatur Sipil Negara",
        snippet: "Portal resmi pendaftaran seleksi calon aparatur sipil negara.",
        url: "https://sscasn.bkn.go.id",
      },
      {
        title: "Contoh Review Jurnal Ilmiah yang Benar",
        snippet: "Panduan cara membuat review jurnal ilmiah dan formatnya.",
        url: "https://example.com/review-jurnal",
      },
      {
        title: "10 Rekomendasi Laptop 10 Jutaan Terbaik 2025",
        snippet: "Pilihan laptop terbaik di rentang harga 10 jutaan seperti Lenovo Ideapad Slim 5, Asus Vivobook 14, dan Acer Aspire 5.",
        url: "https://jagatreview.com/rekomendasi-laptop-10-jutaan",
      },
      {
        title: "Rekomendasi Laptop 10 Jutaan untuk Kerja dan Gaming",
        snippet: "Spesifikasi laptop harga 10 juta dengan Intel Core i5 dan RAM 16GB.",
        url: "https://gadgetren.com/laptop-10-juta",
      },
    ];

    const filtered = filterAndScoreResults(candidateResults, ctx);

    // Verified: All KBBI, letter templates, SSCASN, and academic journal reviews are 100% eliminated
    expect(filtered.some((r) => r.title.includes("KBBI"))).toBe(false);
    expect(filtered.some((r) => r.title.includes("Surat Rekomendasi"))).toBe(false);
    expect(filtered.some((r) => r.title.includes("SSCASN"))).toBe(false);
    expect(filtered.some((r) => r.title.includes("Review Jurnal"))).toBe(false);

    // Verified: True laptop review articles are preserved at the top
    expect(filtered.length).toBe(2);
    expect(filtered[0].title).toContain("Laptop 10 Jutaan");
    expect(filtered[0].url).toContain("jagatreview.com");
  });
});
