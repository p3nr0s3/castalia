import { describe, it, expect, vi, afterEach } from "vitest";
import { searchDuckDuckGoLiteEngine } from "../lib/webSearchEngine";

function ddgLiteResultHtml(title: string, uddgTarget: string, snippet: string): string {
  return `
    <tr>
      <td>1.&nbsp;</td>
      <td>
        <a rel="nofollow" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(uddgTarget)}&amp;rut=1" class="result-link">${title}</a>
      </td>
    </tr>
    <tr>
      <td>&nbsp;</td>
      <td class="result-snippet">${snippet}</td>
    </tr>
  `;
}

function stubFetchOnce(html: string, ok = true) {
  const fetchSpy = vi.fn().mockResolvedValue({ ok, text: async () => html });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchDuckDuckGoLiteEngine", () => {
  it("extracts title, decoded URL, and snippet from DuckDuckGo Lite table markup", async () => {
    const html = `<html><body><table>${ddgLiteResultHtml(
      "TypeScript Official Documentation",
      "https://www.typescriptlang.org/",
      "TypeScript is JavaScript with syntax for types."
    )}</table></body></html>`;
    stubFetchOnce(html);

    const results = await searchDuckDuckGoLiteEngine("typescript documentation");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("TypeScript Official Documentation");
    expect(results[0].url).toBe("https://www.typescriptlang.org/");
    expect(results[0].snippet).toBe("TypeScript is JavaScript with syntax for types.");
    expect(results[0].engine).toBe("builtin-duckduckgo-lite");
  });

  it("extracts multiple results and dedupes identical URLs", async () => {
    const html = `<html><body><table>
      ${ddgLiteResultHtml("Site A", "https://site-a.com/", "First description")}
      ${ddgLiteResultHtml("Site B", "https://site-b.com/", "Second description")}
      ${ddgLiteResultHtml("Site A Duplicate", "https://site-a.com/", "Duplicate description")}
    </table></body></html>`;
    stubFetchOnce(html);

    const results = await searchDuckDuckGoLiteEngine("multiple sites test");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.url)).toEqual(["https://site-a.com/", "https://site-b.com/"]);
  });

  it("returns an empty array on non-ok HTTP responses", async () => {
    stubFetchOnce("", false);
    const results = await searchDuckDuckGoLiteEngine("error query");
    expect(results).toEqual([]);
  });

  it("returns an empty array on fetch network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const results = await searchDuckDuckGoLiteEngine("offline query");
    expect(results).toEqual([]);
  });
});
