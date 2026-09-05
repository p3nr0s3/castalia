import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".webm": "audio/webm",
  ".opus": "audio/opus",
  ".wma": "audio/x-ms-wma",
};

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
};

const AUDIO_EXTENSIONS = new Set(Object.keys(MIME_TYPES));
const IMAGE_EXTENSIONS = new Set(Object.keys(IMAGE_MIME_TYPES));

// GET: Stream local audio file with HTTP Range support, serve cover art, or list audio files in directory
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetPath = searchParams.get("path");
    const scanDir = searchParams.get("dir");
    const coverPath = searchParams.get("cover");

    // 1. Serve cover art image
    if (coverPath) {
      const normalizedCover = path.resolve(coverPath);
      const ext = path.extname(normalizedCover).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) {
        return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
      }
      const stats = await fsp.stat(normalizedCover);
      if (!stats.isFile()) {
        return NextResponse.json({ error: "Cover file not found" }, { status: 404 });
      }
      const contentType = IMAGE_MIME_TYPES[ext] || "image/jpeg";
      const imageBuffer = await fsp.readFile(normalizedCover);
      return new NextResponse(imageBuffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    // 2. Scan directory for audio files and cover art
    if (scanDir) {
      const normalizedDir = path.resolve(scanDir);
      const stats = await fsp.stat(normalizedDir);
      if (!stats.isDirectory()) {
        return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
      }

      const entries = await fsp.readdir(normalizedDir, { withFileTypes: true });
      const imageFiles = entries
        .filter((e) => !e.isDirectory() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
        .map((e) => e.name);

      // Default folder cover art if found
      const defaultCover = imageFiles.find((f) =>
        /^(cover|folder|album|front|art)\.(jpg|jpeg|png|webp)$/i.test(f)
      );

      const audioFiles = entries
        .filter((e) => !e.isDirectory() && AUDIO_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
        .map((e) => {
          const baseName = e.name.replace(/\.[^/.]+$/, "");
          const ext = path.extname(e.name).toLowerCase().replace(".", "");

          // Find track-specific cover or fallback to default folder cover
          const trackCover = imageFiles.find((img) =>
            img.toLowerCase().startsWith(baseName.toLowerCase())
          ) || defaultCover;

          const coverUrl = trackCover
            ? `/api/audio?cover=${encodeURIComponent(path.join(normalizedDir, trackCover))}`
            : undefined;

          return {
            name: baseName,
            fullName: e.name,
            path: path.join(normalizedDir, e.name),
            format: ext.toUpperCase(),
            coverUrl,
          };
        });

      return NextResponse.json({ files: audioFiles });
    }

    // 2. Stream single audio file with Range support
    if (!targetPath) {
      return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
    }

    const normalizedPath = path.resolve(targetPath);
    const ext = path.extname(normalizedPath).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: "File is not a supported audio format" }, { status: 400 });
    }

    const stats = await fsp.stat(normalizedPath);
    if (!stats.isFile()) {
      return NextResponse.json({ error: "Target is not a file" }, { status: 400 });
    }

    const fileSize = stats.size;
    const contentType = MIME_TYPES[ext] || "audio/mpeg";
    const range = req.headers.get("range");

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const fileStream = fs.createReadStream(normalizedPath, { start, end });

      const stream = new ReadableStream({
        start(controller) {
          fileStream.on("data", (chunk) => controller.enqueue(chunk));
          fileStream.on("end", () => controller.close());
          fileStream.on("error", (err) => controller.error(err));
        },
      });

      return new NextResponse(stream as any, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize.toString(),
          "Content-Type": contentType,
        },
      });
    } else {
      const fileStream = fs.createReadStream(normalizedPath);
      const stream = new ReadableStream({
        start(controller) {
          fileStream.on("data", (chunk) => controller.enqueue(chunk));
          fileStream.on("end", () => controller.close());
          fileStream.on("error", (err) => controller.error(err));
        },
      });

      return new NextResponse(stream as any, {
        status: 200,
        headers: {
          "Content-Length": fileSize.toString(),
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
        },
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load audio" }, { status: 500 });
  }
}
