import { describe, it, expect } from "vitest";
import { getBookFormat } from "../lib/bookUtils";

describe("booksApi", () => {
  it("correctly identifies book formats by extension", () => {
    expect(getBookFormat("novel.epub")).toBe("epub");
    expect(getBookFormat("manga.cbz")).toBe("comic");
    expect(getBookFormat("comic.cbr")).toBe("comic");
    expect(getBookFormat("document.pdf")).toBe("pdf");
    expect(getBookFormat("notes.txt")).toBe("text");
    expect(getBookFormat("readme.md")).toBe("text");
    expect(getBookFormat("readme.markdown")).toBe("text");
    expect(getBookFormat("photo.jpg")).toBe("unknown");
    expect(getBookFormat("song.mp3")).toBe("unknown");
  });
});
