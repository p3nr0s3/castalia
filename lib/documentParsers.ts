/**
 * Integrated Document & Comic Parsers
 * Supports client-side extraction of:
 * - EPUB (.epub) via JSZip + XML OPF/Spine parsing
 * - Comic Book Archives (.cbz, .cbr) via JSZip + natural numeric image sorting
 * - Portable Document Format (.pdf) via native object URL
 * - Plain Text & Markdown (.txt, .md) with intelligent chapter splitting
 */

import JSZip from "jszip";

export type DocumentFormat = "epub" | "comic" | "pdf" | "text" | "unknown";

export interface DocumentChapter {
  id: string;
  title: string;
  href?: string;
  content: string; // Plain text
  rawHtml?: string; // HTML if from EPUB
}

export interface ComicPage {
  index: number;
  filename: string;
  url: string;
}

export interface ParsedDocument {
  id: string;
  title: string;
  format: DocumentFormat;
  filesize: number;
  chapters?: DocumentChapter[];
  totalWords?: number;
  pages?: ComicPage[];
  pdfUrl?: string;
  rawText?: string;
}

/**
 * Natural numerical sort for filenames so that
 * page1.jpg, page2.jpg, page10.jpg sort in true chronological order.
 */
export function naturalSortFilenames(filenames: string[]): string[] {
  return [...filenames].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

/**
 * Normalizes relative paths inside zip archives (resolving ../ and ./)
 */
export function normalizeZipPath(path: string): string {
  const parts = path.split("/");
  const stack: string[] = [];
  for (const p of parts) {
    if (p === "." || !p) continue;
    if (p === "..") {
      if (stack.length > 0) stack.pop();
    } else {
      stack.push(p);
    }
  }
  return stack.join("/");
}

/**
 * Fast pure-regex HTML-to-text converter that strips scripts, styles, and tags
 * and unescapes basic HTML entities. Works universally in browser and Node environments.
 */
export function extractTextFromHtml(html: string): string {
  if (!html) return "";
  const clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();
  return clean;
}

/**
 * Extracts candidate chapter title from HTML using <h1>, <h2>, or <title>.
 */
export function extractTitleFromHtml(html: string, fallback: string): string {
  if (!html) return fallback;
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match && h1Match[1]) {
    const title = extractTextFromHtml(h1Match[1]).trim();
    if (title && title.length < 120) return title;
  }
  const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (h2Match && h2Match[1]) {
    const title = extractTextFromHtml(h2Match[1]).trim();
    if (title && title.length < 120) return title;
  }
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    const title = extractTextFromHtml(titleMatch[1]).trim();
    if (title && title.length < 120) return title;
  }
  return fallback;
}

/**
 * Parses an EPUB file into structured chapters and metadata.
 */
export async function parseEpub(
  data: Blob | File | ArrayBuffer | Uint8Array,
  fallbackTitle = "Untitled Book"
): Promise<ParsedDocument> {
  const zip = await JSZip.loadAsync(data);

  // 1. Locate container.xml to find the root package file (.opf)
  let opfPath = "";
  const containerEntry = zip.file("META-INF/container.xml");
  if (containerEntry) {
    const containerXml = await containerEntry.async("text");
    const match = containerXml.match(/full-path\s*=\s*["']([^"']+)["']/i);
    if (match && match[1]) {
      opfPath = match[1];
    }
  }

  // Fallback: search for any .opf file in the archive
  if (!opfPath) {
    const opfFiles = Object.keys(zip.files).filter((f) => f.endsWith(".opf"));
    if (opfFiles.length > 0) {
      opfPath = opfFiles[0];
    }
  }

  if (!opfPath || !zip.file(opfPath)) {
    throw new Error("Invalid EPUB: package manifest (.opf) not found.");
  }

  const opfText = await zip.file(opfPath)!.async("text");
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";

  // Extract Book Title
  let title = fallbackTitle;
  const titleMatch = opfText.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
  if (titleMatch && titleMatch[1]) {
    const parsed = extractTextFromHtml(titleMatch[1]).trim();
    if (parsed) title = parsed;
  }

  // Parse Manifest (id -> href)
  const manifest: Record<string, string> = {};
  const itemRegex = /<item\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(opfText)) !== null) {
    manifest[m[1]] = m[2];
  }
  const itemRegexAlt = /<item\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((m = itemRegexAlt.exec(opfText)) !== null) {
    manifest[m[2]] = m[1];
  }

  // Parse Spine (reading order)
  const spineItemIds: string[] = [];
  const spineRegex = /<itemref\b[^>]*\bidref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((m = spineRegex.exec(opfText)) !== null) {
    spineItemIds.push(m[1]);
  }

  // Load chapters sequentially
  const chapters: DocumentChapter[] = [];
  let totalWords = 0;

  for (let i = 0; i < spineItemIds.length; i++) {
    const id = spineItemIds[i];
    const rawHref = manifest[id];
    if (!rawHref) continue;

    const decodedHref = decodeURIComponent(rawHref.split("#")[0]);
    const fullPath = opfDir ? `${opfDir}${decodedHref}` : decodedHref;
    const normalizedPath = normalizeZipPath(fullPath);

    const fileEntry = zip.file(normalizedPath) || zip.file(decodedHref) || zip.file(rawHref);

    if (fileEntry) {
      const htmlContent = await fileEntry.async("text");
      const cleanText = extractTextFromHtml(htmlContent);
      // Only keep chapters that have some readable content or title
      if (cleanText.length > 5 || htmlContent.includes("<img")) {
        const chapterTitle = extractTitleFromHtml(htmlContent, `Chapter ${chapters.length + 1}`);
        const words = cleanText ? cleanText.split(/\s+/).filter(Boolean).length : 0;
        totalWords += words;

        chapters.push({
          id: `ch_${chapters.length + 1}`,
          title: chapterTitle,
          href: decodedHref,
          content: cleanText,
          rawHtml: htmlContent,
        });
      }
    }
  }

  if (chapters.length === 0) {
    throw new Error("No readable chapters found inside EPUB archive.");
  }

  return {
    id: `epub_${Date.now()}`,
    title,
    format: "epub",
    filesize: 0,
    chapters,
    totalWords,
  };
}

/**
 * Parses a CBZ (or ZIP-based CBR) comic archive into sorted image pages.
 */
export async function parseComic(
  data: Blob | File | ArrayBuffer | Uint8Array,
  filename = "Comic.cbz"
): Promise<ParsedDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error(
      "Gagal membuka arsip komik. Jika file berekstensi .cbr dengan kompresi RAR, silakan konversi ke .cbz (ZIP) agar dapat dibaca di web browser."
    );
  }

  const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif"];

  const imageFilenames = Object.keys(zip.files).filter((name) => {
    if (zip.files[name].dir) return false;
    if (name.startsWith("__MACOSX") || name.split("/").some((part) => part.startsWith("."))) {
      return false;
    }
    const lower = name.toLowerCase();
    return imageExtensions.some((ext) => lower.endsWith(ext));
  });

  if (imageFilenames.length === 0) {
    throw new Error("Tidak ditemukan file gambar di dalam arsip komik (.jpg, .png, .webp, dsb).");
  }

  const sortedNames = naturalSortFilenames(imageFilenames);

  const pages: ComicPage[] = [];
  for (let i = 0; i < sortedNames.length; i++) {
    const fname = sortedNames[i];
    const blob = await zip.files[fname].async("blob");
    const url =
      typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(blob)
        : `blob:${fname}`;

    pages.push({
      index: i + 1,
      filename: fname,
      url,
    });
  }

  const cleanTitle = filename.replace(/\.(cbz|cbr|zip)$/i, "");

  return {
    id: `comic_${Date.now()}`,
    title: cleanTitle,
    format: "comic",
    filesize: 0,
    pages,
  };
}

/**
 * Parses plain text or markdown documents, splitting into chapters by headers or word limits.
 */
export async function parseTextDocument(
  text: string,
  filename = "Document.txt"
): Promise<ParsedDocument> {
  const cleanTitle = filename.replace(/\.(txt|md|markdown)$/i, "");
  const isMarkdown =
    filename.toLowerCase().endsWith(".md") || filename.toLowerCase().endsWith(".markdown");

  const chapters: DocumentChapter[] = [];

  if (isMarkdown) {
    const headerRegex = /^#{1,2}\s+(.+)$/gm;
    const matches: { index: number; title: string }[] = [];
    let match: RegExpExecArray | null;
    while ((match = headerRegex.exec(text)) !== null) {
      matches.push({ index: match.index, title: match[1].trim() });
    }

    if (matches.length > 1) {
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
        const sectionContent = text.slice(start, end).trim();
        chapters.push({
          id: `sec_${i + 1}`,
          title: matches[i].title,
          content: sectionContent,
        });
      }
    }
  }

  if (chapters.length === 0) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 3500) {
      const chunkSize = 2500;
      let chNum = 1;
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunkWords = words.slice(i, i + chunkSize);
        chapters.push({
          id: `part_${chNum}`,
          title: `Part ${chNum}`,
          content: chunkWords.join(" "),
        });
        chNum++;
      }
    } else {
      chapters.push({
        id: "part_1",
        title: cleanTitle,
        content: text,
      });
    }
  }

  const totalWords = chapters.reduce(
    (sum, ch) => sum + (ch.content ? ch.content.split(/\s+/).filter(Boolean).length : 0),
    0
  );

  return {
    id: `text_${Date.now()}`,
    title: cleanTitle,
    format: "text",
    filesize: text.length,
    chapters,
    totalWords,
    rawText: text,
  };
}
