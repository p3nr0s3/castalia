import { describe, it, expect } from "vitest";
import {
  cleanHtml,
  extractMetaDescription,
  decodeBingUrl,
  cleanSearchQuery,
} from "../lib/webSearchEngine";

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
    expect(extractMetaDescription(htmlWithMeta)).toBe("Official advisory for CVE-2024-3094 backdoor.");

    const htmlWithOg = `
      <html>
        <head>
          <meta property="og:description" content="Next.js 15 brings React 19 support and faster compiler." />
        </head>
      </html>
    `;
    expect(extractMetaDescription(htmlWithOg)).toBe("Next.js 15 brings React 19 support and faster compiler.");
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
    const directUrl = cleanSearchQuery("https://nvd.nist.gov/vuln/detail/CVE-2024-3094");
    expect(directUrl.isUrl).toBe(true);
    expect(directUrl.targetUrl).toBe("https://nvd.nist.gov/vuln/detail/CVE-2024-3094");

    const query1 = cleanSearchQuery("tolong carikan cve-2024-3094 dong");
    expect(query1.isUrl).toBe(false);
    expect(query1.cleanQuery).toBe("cve-2024-3094");

    const query2 = cleanSearchQuery("coba cari info tentang next.js 15 server actions");
    expect(query2.isUrl).toBe(false);
    expect(query2.cleanQuery).toBe("next.js 15 server actions");

    const query3 = cleanSearchQuery("search for latest quantum computing breakthroughs");
    expect(query3.isUrl).toBe(false);
    expect(query3.cleanQuery).toBe("latest quantum computing breakthroughs");
  });

  it("reformulateSearchQuery optimizes natural questions into search keywords", () => {
    const q1 = cleanSearchQuery("laptop apa yang cocok buat ngoding android studio budget 12 jutaan tahun ini?");
    expect(q1.isUrl).toBe(false);
    expect(q1.cleanQuery).toContain("android studio");
    expect(q1.cleanQuery).toContain("2025");

    const q2 = cleanSearchQuery("apa perbedaan deepseek r1 dan openai o1?");
    expect(q2.isUrl).toBe(false);
    expect(q2.cleanQuery).toBe("deepseek r1 dan openai o1");
  });
});
