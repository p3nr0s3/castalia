import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { resolveWithinBase } from "@/lib/pathSandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Helper to determine if file is text/code readable
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".csv", ".tsv", ".log", ".env", ".yml", ".yaml", ".xml",
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".html", ".htm", ".css",
  ".scss", ".sass", ".less", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".rs",
  ".go", ".php", ".rb", ".sql", ".sh", ".bash", ".bat", ".cmd", ".ps1", ".ini",
  ".toml", ".conf", ".cfg", ".dockerfile", ".gitignore", ".prisma", ".vue", ".svelte"
]);

function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();
  if (basename === "dockerfile" || basename === "makefile" || basename === ".env") return true;
  return TEXT_EXTENSIONS.has(ext);
}

// Security: every path this route touches must stay inside the user's home directory.
// This is a file explorer by design (browsing outside the project dir is intended),
// but it must never reach outside $HOME — no /etc, no other users' homes, no root fs.
const HOME_DIR = path.resolve(os.homedir());

function resolveWithinHome(inputPath: string): string {
  return resolveWithinBase(HOME_DIR, inputPath);
}

// GET: List directory contents
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetPath = searchParams.get("path") || os.homedir();

    const normalizedPath = resolveWithinHome(targetPath);
    const stats = await fs.stat(normalizedPath);

    if (!stats.isDirectory()) {
      return NextResponse.json({ error: "Specified path is not a directory." }, { status: 400 });
    }

    const entries = await fs.readdir(normalizedPath, { withFileTypes: true });

    const items = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(normalizedPath, entry.name);
        try {
          const itemStat = await fs.stat(fullPath);
          return {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            size: itemStat.size,
            updatedAt: itemStat.mtimeMs,
            isReadableText: !entry.isDirectory() && isTextFile(fullPath),
          };
        } catch {
          return {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            size: 0,
            updatedAt: 0,
            isReadableText: false,
          };
        }
      })
    );

    // Sort: directories first, then alphabetical
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    const parentPath = path.dirname(normalizedPath) !== normalizedPath ? path.dirname(normalizedPath) : null;

    return NextResponse.json({
      currentPath: normalizedPath,
      parentPath,
      homePath: os.homedir(),
      items,
    });
  } catch (err: any) {
    const isAccessDenied = typeof err?.message === "string" && err.message.startsWith("Access denied");
    return NextResponse.json(
      { error: err.message || "Failed to list directory" },
      { status: isAccessDenied ? 403 : 500 }
    );
  }
}

// POST: Read file content or search directory
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, filePath, directoryPath, query, maxFileSize = 2 * 1024 * 1024 } = body;

    // Action 1: Read specific file from disk
    if (action === "read" || filePath) {
      const targetFile = resolveWithinHome(filePath);
      const stat = await fs.stat(targetFile);

      if (stat.isDirectory()) {
        return NextResponse.json({ error: "Cannot read a directory as a file." }, { status: 400 });
      }

      if (stat.size > maxFileSize) {
        return NextResponse.json(
          { error: `File size (${(stat.size / 1024 / 1024).toFixed(2)} MB) exceeds maximum allowed text limit (2 MB).` },
          { status: 400 }
        );
      }

      const content = await fs.readFile(targetFile, "utf-8");

      return NextResponse.json({
        name: path.basename(targetFile),
        path: targetFile,
        size: stat.size,
        content,
        updatedAt: stat.mtimeMs,
      });
    }

    // Action 2: Search within directory
    if (action === "search" && directoryPath && query) {
      const dir = resolveWithinHome(directoryPath);
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const matchedFiles = [];

      for (const entry of entries) {
        if (!entry.isDirectory() && isTextFile(path.join(dir, entry.name))) {
          const fullPath = path.join(dir, entry.name);
          try {
            const fileText = await fs.readFile(fullPath, "utf-8");
            if (
              entry.name.toLowerCase().includes(query.toLowerCase()) ||
              fileText.toLowerCase().includes(query.toLowerCase())
            ) {
              matchedFiles.push({
                name: entry.name,
                path: fullPath,
                snippet: fileText.slice(0, 300),
              });
            }
          } catch {
            // Ignore unreadable files
          }
        }
      }

      return NextResponse.json({ results: matchedFiles });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (err: any) {
    const isAccessDenied = typeof err?.message === "string" && err.message.startsWith("Access denied");
    return NextResponse.json(
      { error: err.message || "Filesystem operation failed" },
      { status: isAccessDenied ? 403 : 500 }
    );
  }
}
