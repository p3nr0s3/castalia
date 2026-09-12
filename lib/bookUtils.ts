import path from "path";

export const BOOK_MIME_TYPES: Record<string, string> = {
  ".epub": "application/epub+zip",
  ".cbz": "application/vnd.comicbook+zip",
  ".cbr": "application/vnd.comicbook-rar",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".markdown": "text/markdown; charset=utf-8",
};

export const BOOK_EXTENSIONS = new Set(Object.keys(BOOK_MIME_TYPES));

export function getBookFormat(filename: string): "epub" | "comic" | "pdf" | "text" | "unknown" {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".epub") return "epub";
  if (ext === ".cbz" || ext === ".cbr") return "comic";
  if (ext === ".pdf") return "pdf";
  if (ext === ".txt" || ext === ".md" || ext === ".markdown") return "text";
  return "unknown";
}
