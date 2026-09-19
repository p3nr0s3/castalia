import { describe, it, expect, vi, afterEach } from "vitest";
import { searchDuckDuckGoEngine, decodeDuckDuckGoUrl } from "../lib/webSearchEngine";

// Fixture markup mirrors the structure confirmed against several
// independently-maintained DuckDuckGo HTML-endpoint scrapers (Rust crates,
// HuggingFace spaces) as of 2026: outer `.result.results_links...` div,
// inner `.links_main.result__body` div, `result__a` title link,
// `result__snippet` description link. This scraper had ZERO tests before
// this file — the previous regex's exact-3-closing-</div> assumption had
// never been checked against anything, real or synthetic.
function ddgResultHtml(title: string, uddgTarget: string, snippet: string, extraWrapperDiv = false): string {
  const inner = `
    <h2 class="result__title">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(uddgTarget)}&amp;rut=abc">${title}</a>
    </h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(uddgTarget)}&amp;rut=abc">${snippet}</a>
  `;
  // extraWrapperDiv simulates a markup change (one more nesting level) that
  // would have broken the old "exactly 3 closing </div>" regex silently.
  const body = extraWrapperDiv
    ? `<div class="extra_ab_test_wrapper"><div class="links_main links_deep result__body">${inner}</div></div>`
    : `<div class="links_main links_deep result__body">${inner}</div>`;
  return `<div class="result results_links results_links_deep web-result">${body}</div>`;
}

function stubFetchOnce(html: string, ok = true) {
  const fetchSpy = vi.fn().mockResolvedValue({ ok, text: async () => html });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("decodeDuckDuckGoUrl", () => {
  it("decodes a //duckduckgo.com/l/?uddg=... redirect into the real target URL", () => {
    const raw = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.rust-lang.org%2F&rut=abc123";
    expect(decodeDuckDuckGoUrl(raw)).toBe("https://www.rust-lang.org/");
  });

  it("returns the input unchanged if it's not a recognizable redirect", () => {
    expect(decodeDuckDuckGoUrl("https://example.com/direct")).toBe("https://example.com/direct");
  });
});

describe("searchDuckDuckGoEngine", () => {
  it("extracts title, decoded URL, and snippet from standard result markup", async () => {
    const html = `<html><body><div id="links">${ddgResultHtml(
      "Rust Programming Language",
      "https://www.rust-lang.org/",
      "A language empowering everyone."
    )}</div></body></html>`;
    stubFetchOnce(html);

    const results = await searchDuckDuckGoEngine("rust programming language");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Rust Programming Language");
    expect(results[0].url).toBe("https://www.rust-lang.org/");
    expect(results[0].snippet).toBe("A language empowering everyone.");
    expect(results[0].engine).toBe("builtin-duckduckgo");
  });

  it("still parses correctly when an extra wrapper div is added around the result body", async () => {
    // This is the regression test for the actual bug fixed: the old regex
    // required exactly 3 consecutive closing </div> tags and would have
    // matched nothing here (needs 4), silently returning zero results.
    const html = `<html><body>${ddgResultHtml(
      "Extra Nesting Site",
      "https://example.com/nested",
      "Should still be found.",
      /* extraWrapperDiv */ true
    )}</body></html>`;
    stubFetchOnce(html);

    const results = await searchDuckDuckGoEngine("nested markup test");
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe("https://example.com/nested");
  });

  it("extracts multiple results and dedupes identical URLs", async () => {
    const html = `<html><body>
      ${ddgResultHtml("Result A", "https://a.example.com/", "First result.")}
      ${ddgResultHtml("Result B", "https://b.example.com/", "Second result.")}
      ${ddgResultHtml("Result A Duplicate", "https://a.example.com/", "Same URL as the first.")}
    </body></html>`;
    stubFetchOnce(html);

    const results = await searchDuckDuckGoEngine("multi result test");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.url)).toEqual(["https://a.example.com/", "https://b.example.com/"]);
  });

  it("returns an empty array (not a throw) when DuckDuckGo serves a bot-challenge page", async () => {
    const html = `<html><body><div class="anomaly-modal">Unfortunately, bots use DuckDuckGo too. Please complete the challenge.</div></body></html>`;
    stubFetchOnce(html);

    const results = await searchDuckDuckGoEngine("blocked query");
    expect(results).toEqual([]);
  });

  it("returns an empty array (not a throw) when no result containers are found at all", async () => {
    const html = `<html><body><p>Totally different markup, e.g. after a redesign.</p></body></html>`;
    stubFetchOnce(html);

    const results = await searchDuckDuckGoEngine("no matches");
    expect(results).toEqual([]);
  });

  it("returns an empty array when the HTTP response itself is not ok", async () => {
    stubFetchOnce("", false);
    const results = await searchDuckDuckGoEngine("http error");
    expect(results).toEqual([]);
  });

  it("returns an empty array (not a throw) on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network unreachable"))
    );
    const results = await searchDuckDuckGoEngine("network failure");
    expect(results).toEqual([]);
  });

  it("skips a malformed result block that has no result__a link, without stopping the rest", async () => {
    const malformed = `<div class="result results_links results_links_deep web-result"><div class="links_main result__body"><p>no link here</p></div></div>`;
    const good = ddgResultHtml("Valid Result", "https://valid.example.com/", "This one is fine.");
    stubFetchOnce(`<html><body>${malformed}${good}</body></html>`);

    const results = await searchDuckDuckGoEngine("partial malformed test");
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe("https://valid.example.com/");
  });
});
