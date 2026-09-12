import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { BOOK_MIME_TYPES, BOOK_EXTENSIONS, getBookFormat } from "@/lib/bookUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const scanDir = searchParams.get("scanDir") || searchParams.get("dir");
    const readPath = searchParams.get("readPath") || searchParams.get("path");

    // 1. Scan directory for books and comics
    if (scanDir) {
      const normalizedDir = path.resolve(scanDir);
      let rootStats;
      try {
        rootStats = await fsp.stat(normalizedDir);
      } catch {
        return NextResponse.json({ error: `Direktori tidak ditemukan: ${scanDir}` }, { status: 404 });
      }

      if (!rootStats.isDirectory()) {
        return NextResponse.json({ error: "Path bukan sebuah direktori." }, { status: 400 });
      }

      const IGNORED_DIR_NAMES = new Set([
        "node_modules", ".git", ".next", "$RECYCLE.BIN", "System Volume Information",
      ]);
      const MAX_DEPTH = 6;
      const MAX_FILES = 1500;

      const books: Array<{
        name: string;
        path: string;
        format: "epub" | "comic" | "pdf" | "text";
        size: number;
        updatedAt: number;
      }> = [];

      const scan = async (dir: string, depth: number): Promise<void> => {
        if (depth > MAX_DEPTH || books.length >= MAX_FILES) return;

        let entries;
        try {
          entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }

        for (const entry of entries) {
          if (books.length >= MAX_FILES) break;

          if (entry.isDirectory()) {
            if (IGNORED_DIR_NAMES.has(entry.name) || entry.name.startsWith(".")) continue;
            await scan(path.join(dir, entry.name), depth + 1);
            continue;
          }

          const ext = path.extname(entry.name).toLowerCase();
          if (!BOOK_EXTENSIONS.has(ext)) continue;

          const fullPath = path.join(dir, entry.name);
          try {
            const stat = await fsp.stat(fullPath);
            const format = getBookFormat(entry.name);
            if (format !== "unknown") {
              books.push({
                name: entry.name,
                path: fullPath,
                format,
                size: stat.size,
                updatedAt: stat.mtimeMs,
              });
            }
          } catch {
            // unreadable file
          }
        }
      };

      await scan(normalizedDir, 0);

      // Sort alphabetically by name
      books.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

      return NextResponse.json({
        directory: normalizedDir,
        count: books.length,
        books,
      });
    }

    // 2. Stream book content
    if (readPath) {
      const normalizedFile = path.resolve(readPath);
      let stats;
      try {
        stats = await fsp.stat(normalizedFile);
      } catch {
        return NextResponse.json({ error: "File tidak ditemukan." }, { status: 404 });
      }

      if (!stats.isFile()) {
        return NextResponse.json({ error: "Path bukan sebuah file." }, { status: 400 });
      }

      const ext = path.extname(normalizedFile).toLowerCase();
      const mimeType = BOOK_MIME_TYPES[ext] || "application/octet-stream";

      // Stream file with range support
      const range = req.headers.get("range");
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunksize = end - start + 1;

        const fileStream = fs.createReadStream(normalizedFile, { start, end });
        // @ts-ignore
        return new NextResponse(fileStream, {
          status: 206,
          headers: {
            "Content-Range": `bytes ${start}-${end}/${stats.size}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(chunksize),
            "Content-Type": mimeType,
          },
        });
      }

      const fileStream = fs.createReadStream(normalizedFile);
      // @ts-ignore
      return new NextResponse(fileStream, {
        status: 200,
        headers: {
          "Content-Length": String(stats.size),
          "Content-Type": mimeType,
          "Accept-Ranges": "bytes",
          "Content-Disposition": `inline; filename="${encodeURIComponent(path.basename(normalizedFile))}"`,
        },
      });
    }

    return NextResponse.json(
      { error: "Missing required parameter 'scanDir' or 'readPath'." },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("Books API error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
