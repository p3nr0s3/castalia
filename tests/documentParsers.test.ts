import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  extractTextFromHtml,
  extractTitleFromHtml,
  naturalSortFilenames,
  normalizeZipPath,
  parseTextDocument,
  parseComic,
  parseEpub,
} from "../lib/documentParsers";

describe("documentParsers", () => {
  describe("extractTextFromHtml", () => {
    it("strips tags and scripts correctly", () => {
      const html = `<div><h1>Chapter 1</h1><script>alert('hack')</script><p>Hello &amp; welcome to &quot;Ollama Reader&quot;!</p></div>`;
      const text = extractTextFromHtml(html);
      expect(text).toContain("Chapter 1");
      expect(text).not.toContain("alert");
      expect(text).toContain('Hello & welcome to "Ollama Reader"!');
    });

    it("handles entities and breaks", () => {
      const html = `<p>Line 1<br/>Line 2&nbsp;&lt;special&gt;&#39;s</p>`;
      const text = extractTextFromHtml(html);
      expect(text).toContain("Line 1");
      expect(text).toContain("Line 2 <special>'s");
    });
  });

  describe("extractTitleFromHtml", () => {
    it("extracts h1 or h2 as title", () => {
      expect(extractTitleFromHtml("<h1>The Great Adventure</h1>", "Fallback")).toBe("The Great Adventure");
      expect(extractTitleFromHtml("<h2>Prologue</h2>", "Fallback")).toBe("Prologue");
      expect(extractTitleFromHtml("<p>Just a paragraph</p>", "Fallback")).toBe("Fallback");
    });
  });

  describe("naturalSortFilenames", () => {
    it("sorts comic filenames numerically rather than strictly lexicographically", () => {
      const input = ["page10.jpg", "page1.jpg", "page2.jpg", "page20.jpg", "page3.jpg"];
      const sorted = naturalSortFilenames(input);
      expect(sorted).toEqual(["page1.jpg", "page2.jpg", "page3.jpg", "page10.jpg", "page20.jpg"]);
    });
  });

  describe("normalizeZipPath", () => {
    it("resolves .. and . segments in zip paths", () => {
      expect(normalizeZipPath("OEBPS/../OEBPS/chapter1.xhtml")).toBe("OEBPS/chapter1.xhtml");
      expect(normalizeZipPath("OEBPS/text/./section1.html")).toBe("OEBPS/text/section1.html");
      expect(normalizeZipPath("a/b/c/../../d.xhtml")).toBe("a/d.xhtml");
    });
  });

  describe("parseTextDocument", () => {
    it("splits markdown with headers into chapters", async () => {
      const md = `# Chapter 1: Beginnings\nOnce upon a time in local AI.\n\n# Chapter 2: The Agent\nAgents can now read books!`;
      const parsed = await parseTextDocument(md, "story.md");
      expect(parsed.format).toBe("text");
      expect(parsed.chapters?.length).toBe(2);
      expect(parsed.chapters?.[0].title).toBe("Chapter 1: Beginnings");
      expect(parsed.chapters?.[1].title).toBe("Chapter 2: The Agent");
    });
  });

  describe("parseComic", () => {
    it("unpacks zip of images and sorts pages", async () => {
      const zip = new JSZip();
      zip.file("p2.png", "dummy-image-bytes-2");
      zip.file("p1.png", "dummy-image-bytes-1");
      zip.file("p10.png", "dummy-image-bytes-10");
      zip.file("readme.txt", "not an image");

      const zipBytes = await zip.generateAsync({ type: "uint8array" });
      const comic = await parseComic(zipBytes, "TestManga.cbz");

      expect(comic.format).toBe("comic");
      expect(comic.title).toBe("TestManga");
      expect(comic.pages?.length).toBe(3);
      expect(comic.pages?.[0].filename).toBe("p1.png");
      expect(comic.pages?.[1].filename).toBe("p2.png");
      expect(comic.pages?.[2].filename).toBe("p10.png");
    });
  });

  describe("parseEpub", () => {
    it("reads OPF manifest and spine to extract chapters", async () => {
      const zip = new JSZip();
      zip.file(
        "META-INF/container.xml",
        `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
      );
      zip.file(
        "OEBPS/content.opf",
        `<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>Epub Sample Book</dc:title>
          </metadata>
          <manifest>
            <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml" />
            <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml" />
          </manifest>
          <spine>
            <itemref idref="ch1" />
            <itemref idref="ch2" />
          </spine>
        </package>`
      );
      zip.file("OEBPS/ch1.xhtml", `<html><body><h1>Chapter One</h1><p>First chapter contents.</p></body></html>`);
      zip.file("OEBPS/ch2.xhtml", `<html><body><h1>Chapter Two</h1><p>Second chapter contents.</p></body></html>`);

      const epubBytes = await zip.generateAsync({ type: "uint8array" });
      const doc = await parseEpub(epubBytes);

      expect(doc.format).toBe("epub");
      expect(doc.title).toBe("Epub Sample Book");
      expect(doc.chapters?.length).toBe(2);
      expect(doc.chapters?.[0].title).toBe("Chapter One");
      expect(doc.chapters?.[0].content).toContain("First chapter contents.");
      expect(doc.chapters?.[1].title).toBe("Chapter Two");
    });
  });
});
