import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl, SsrfBlockedError } from "@/lib/ssrfGuard";
import { scrapePageContent } from "@/lib/webSearchEngine";
import { getCorsHeaders } from "@/lib/corsHeaders";
import { ProjectFile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = getCorsHeaders();

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function deriveDocumentTitle(url: URL, text: string): string {
  // Try extracting a title header from the text
  const headingMatch = text.match(/^#\s+(.+)$/m);
  if (headingMatch && headingMatch[1].trim()) {
    return headingMatch[1].trim().slice(0, 80);
  }

  // Derive from pathname
  const pathParts = url.pathname.split("/").filter(Boolean);
  if (pathParts.length > 0) {
    const last = pathParts[pathParts.length - 1].replace(/\.(html?|php|md|aspx?)$/i, "");
    if (last) {
      return `${url.hostname} - ${last}`;
    }
  }

  return url.hostname;
}

function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { url } = body as { url?: string };

    if (!url || typeof url !== "string" || !url.trim()) {
      return NextResponse.json(
        { success: false, error: "A valid URL string is required." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const trimmedUrl = url.trim();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmedUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return NextResponse.json(
          { success: false, error: "Only http:// and https:// URLs are supported." },
          { status: 400, headers: CORS_HEADERS }
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid URL format." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // SSRF Guard to prevent SSRF against loopback, private networks, or cloud metadata
    try {
      await assertPublicUrl(parsedUrl.toString());
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        return NextResponse.json(
          { success: false, error: `SSRF Blocked: ${err.message}` },
          { status: 403, headers: CORS_HEADERS }
        );
      }
      throw err;
    }

    // Scrape clean content (with Jina SPA fallback if direct HTML is thin)
    const scrapedText = await scrapePageContent(parsedUrl.toString(), 30000);
    if (!scrapedText || scrapedText.trim().length < 50) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not extract readable article or documentation content from this URL.",
        },
        { status: 422, headers: CORS_HEADERS }
      );
    }

    const title = deriveDocumentTitle(parsedUrl, scrapedText);
    const safeBaseName = sanitizeFileName(title) || "webpage_doc";
    const fileName = `${safeBaseName}.md`;

    const textContent = `# ${title}\n\n**Source URL**: [${parsedUrl.toString()}](${parsedUrl.toString()})\n**Ingested At**: ${new Date().toISOString()}\n\n---\n\n${scrapedText.trim()}\n`;

    const file: ProjectFile = {
      id: `url_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: fileName,
      size: Buffer.byteLength(textContent, "utf8"),
      type: "document",
      textContent,
      uploadedAt: Date.now(),
    };

    return NextResponse.json(
      {
        success: true,
        file,
        title,
        url: parsedUrl.toString(),
      },
      { headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to ingest URL." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
