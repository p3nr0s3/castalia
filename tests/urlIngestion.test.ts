import { describe, it, expect, vi, afterEach } from "vitest";
import { POST, OPTIONS } from "../app/api/projects/ingest-url/route";
import { NextRequest } from "next/server";
import * as webSearchEngine from "@/lib/webSearchEngine";

function createMockRequest(body: Record<string, any>): NextRequest {
  return new NextRequest("http://localhost:3000/api/projects/ingest-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("URL Ingestion API (/api/projects/ingest-url)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles OPTIONS preflight request with 204", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
  });

  it("returns 400 when url is missing or empty", async () => {
    const req1 = createMockRequest({});
    const res1 = await POST(req1);
    expect(res1.status).toBe(400);
    const data1 = await res1.json();
    expect(data1.success).toBe(false);
    expect(data1.error).toMatch(/valid URL/i);

    const req2 = createMockRequest({ url: "   " });
    const res2 = await POST(req2);
    expect(res2.status).toBe(400);
  });

  it("returns 400 when url is not a valid http/https URL", async () => {
    const req1 = createMockRequest({ url: "not-a-valid-url" });
    const res1 = await POST(req1);
    expect(res1.status).toBe(400);

    const req2 = createMockRequest({ url: "ftp://files.example.com/doc.pdf" });
    const res2 = await POST(req2);
    expect(res2.status).toBe(400);
    const data2 = await res2.json();
    expect(data2.error).toMatch(/http:\/\/ and https:\/\//i);

    const req3 = createMockRequest({ url: "file:///etc/passwd" });
    const res3 = await POST(req3);
    expect(res3.status).toBe(400);
  });

  it("blocks SSRF loopback addresses with status 403", async () => {
    const req = createMockRequest({ url: "http://127.0.0.1:11434/api/tags" });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/SSRF Blocked/i);
  });

  it("blocks SSRF private RFC1918 addresses with status 403", async () => {
    const req1 = createMockRequest({ url: "http://192.168.1.1/admin" });
    const res1 = await POST(req1);
    expect(res1.status).toBe(403);
    const data1 = await res1.json();
    expect(data1.error).toMatch(/SSRF Blocked/i);

    const req2 = createMockRequest({ url: "http://10.0.0.5:8080/metrics" });
    const res2 = await POST(req2);
    expect(res2.status).toBe(403);
  });

  it("blocks SSRF cloud metadata IP (169.254.169.254) with status 403", async () => {
    const req = createMockRequest({ url: "http://169.254.169.254/latest/meta-data/" });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/SSRF Blocked/i);
  });

  it("returns 422 when scraped content is empty or unextractable", async () => {
    vi.spyOn(webSearchEngine, "scrapePageContent").mockResolvedValueOnce(null);

    const req = createMockRequest({ url: "https://example.com/empty-page" });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/Could not extract readable/i);
  });

  it("successfully ingests public web docs and extracts title from Markdown header", async () => {
    const mockContent = `# Tokio Async Runtime Documentation

Tokio is an asynchronous runtime for the Rust programming language.
It provides the building blocks needed for writing network applications.

## Key Features
- Multi-threaded work-stealing scheduler
- Asynchronous TCP, UDP, and Unix domain sockets
- Timers and high-resolution time measurement
`;

    vi.spyOn(webSearchEngine, "scrapePageContent").mockResolvedValueOnce(mockContent);

    const req = createMockRequest({ url: "https://tokio.rs/tokio/tutorial" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.title).toBe("Tokio Async Runtime Documentation");
    expect(data.url).toBe("https://tokio.rs/tokio/tutorial");

    expect(data.file).toBeDefined();
    expect(data.file.name).toBe("tokio_async_runtime_documentation.md");
    expect(data.file.type).toBe("document");
    expect(data.file.textContent).toContain("# Tokio Async Runtime Documentation");
    expect(data.file.textContent).toContain("**Source URL**: [https://tokio.rs/tokio/tutorial]");
    expect(data.file.textContent).toContain("Multi-threaded work-stealing scheduler");
    expect(data.file.size).toBeGreaterThan(100);
    expect(data.file.uploadedAt).toBeGreaterThan(0);
  });

  it("derives fallback document title from URL pathname when no # heading is found", async () => {
    const mockContent = `This is a comprehensive guide to understanding database transaction isolation levels.
Read committed, repeatable read, and serializable are the main ANSI SQL isolation levels.
Each level prevents certain anomalies like dirty reads, non-repeatable reads, and phantom reads.`;

    vi.spyOn(webSearchEngine, "scrapePageContent").mockResolvedValueOnce(mockContent);

    const req = createMockRequest({ url: "https://postgresguide.com/acid/isolation.html" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.title).toBe("postgresguide.com - isolation");
    expect(data.file.name).toBe("postgresguide_com_-_isolation.md");
    expect(data.file.textContent).toContain("postgresguide.com - isolation");
    expect(data.file.textContent).toContain("**Source URL**: [https://postgresguide.com/acid/isolation.html]");
  });

  it("derives fallback document title from hostname when pathname has no components", async () => {
    const mockContent = `Welcome to the official developer documentation portal.
Explore guides, API references, tutorials, and SDKs.`;

    vi.spyOn(webSearchEngine, "scrapePageContent").mockResolvedValueOnce(mockContent);

    const req = createMockRequest({ url: "https://developer.mozilla.org/" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.title).toBe("developer.mozilla.org");
    expect(data.file.name).toBe("developer_mozilla_org.md");
  });
});
