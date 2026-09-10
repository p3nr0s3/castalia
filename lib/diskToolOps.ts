import fs from "fs/promises";
import path from "path";

/**
 * Shared implementation for the 5 disk tools (list_directory, read_file,
 * write_file, search_files, delete_file). Both execution routes
 * (project-scoped for manual chat, home-scoped for agents) call into this
 * with their own `resolvePath` function — the path containment boundary is
 * decided by the caller, everything else about *how* each tool behaves is
 * shared so the two routes can't drift apart.
 */

export const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  ".vscode",
  ".idea",
  "$RECYCLE.BIN",
  "System Volume Information",
]);

export type ResolvePathFn = (inputPath?: string) => string;

export async function runDiskTool(
  tool: string,
  args: Record<string, any>,
  resolvePath: ResolvePathFn
): Promise<{ status: number; body: any }> {
  if (tool === "list_directory") {
    const targetDir = resolvePath(args.path);
    const recursive = Boolean(args.recursive);
    const maxItems = typeof args.maxItems === "number" ? Math.min(args.maxItems, 200) : 60;

    const stat = await fs.stat(targetDir);
    if (!stat.isDirectory()) {
      return { status: 200, body: { success: false, tool, error: `Path '${targetDir}' is not a directory.` } };
    }

    const results: Array<{ name: string; path: string; type: "file" | "directory"; size?: number; modifiedAt?: number }> = [];

    const scanDir = async (dir: string, depth = 0): Promise<void> => {
      if (results.length >= maxItems || depth > 3) return;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxItems) break;
        if (IGNORED_DIRS.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        try {
          const itemStat = await fs.stat(fullPath);
          if (entry.isDirectory()) {
            results.push({ name: entry.name, path: fullPath, type: "directory", modifiedAt: itemStat.mtimeMs });
            if (recursive) await scanDir(fullPath, depth + 1);
          } else {
            results.push({ name: entry.name, path: fullPath, type: "file", size: itemStat.size, modifiedAt: itemStat.mtimeMs });
          }
        } catch {
          // Ignore unreadable or locked files
        }
      }
    };

    await scanDir(targetDir);
    return { status: 200, body: { success: true, tool, path: targetDir, totalItems: results.length, items: results } };
  }

  if (tool === "read_file") {
    if (!args.path) return { status: 200, body: { success: false, tool, error: "Missing required argument 'path'." } };

    const targetFile = resolvePath(args.path);
    const maxBytes = typeof args.maxBytes === "number" ? args.maxBytes : 2 * 1024 * 1024;

    const stat = await fs.stat(targetFile);
    if (stat.isDirectory()) {
      return { status: 200, body: { success: false, tool, error: `Cannot read directory '${targetFile}' as a file. Use list_directory instead.` } };
    }

    let content = "";
    let isTruncated = false;

    if (stat.size > maxBytes) {
      const handle = await fs.open(targetFile, "r");
      const buffer = Buffer.alloc(maxBytes);
      await handle.read(buffer, 0, maxBytes, 0);
      await handle.close();
      content = buffer.toString("utf-8");
      isTruncated = true;
    } else {
      content = await fs.readFile(targetFile, "utf-8");
    }

    const lineCount = content.split("\n").length;
    return {
      status: 200,
      body: {
        success: true,
        tool,
        path: targetFile,
        size: stat.size,
        lines: lineCount,
        isTruncated,
        content: isTruncated ? `${content}\n\n[Warning: File truncated to ${maxBytes} bytes due to size limit]` : content,
      },
    };
  }

  if (tool === "write_file") {
    if (!args.path) return { status: 200, body: { success: false, tool, error: "Missing required argument 'path'." } };
    if (args.content === undefined || args.content === null) {
      return { status: 200, body: { success: false, tool, error: "Missing required argument 'content'." } };
    }

    const targetFile = resolvePath(args.path);
    const dir = path.dirname(targetFile);
    await fs.mkdir(dir, { recursive: true });

    const textContent = String(args.content);
    await fs.writeFile(targetFile, textContent, "utf-8");
    const bytesWritten = Buffer.byteLength(textContent, "utf-8");

    return {
      status: 200,
      body: {
        success: true,
        tool,
        path: targetFile,
        bytesWritten,
        lines: textContent.split("\n").length,
        message: `File '${path.basename(targetFile)}' written successfully (${bytesWritten} bytes).`,
      },
    };
  }

  if (tool === "delete_file") {
    if (!args.path) return { status: 200, body: { success: false, tool, error: "Missing required argument 'path'." } };

    const targetFile = resolvePath(args.path);
    const stat = await fs.stat(targetFile);
    if (stat.isDirectory()) {
      return { status: 200, body: { success: false, tool, error: `Refusing to delete a directory ('${targetFile}'). Only single files can be deleted.` } };
    }

    await fs.unlink(targetFile);
    return { status: 200, body: { success: true, tool, path: targetFile, message: `File '${path.basename(targetFile)}' deleted.` } };
  }

  if (tool === "search_files") {
    if (!args.query) return { status: 200, body: { success: false, tool, error: "Missing required argument 'query'." } };

    const targetDir = resolvePath(args.path);
    const queryLower = String(args.query).toLowerCase();
    const maxResults = typeof args.maxResults === "number" ? Math.min(args.maxResults, 100) : 25;

    const matches: Array<{ name: string; path: string; type: "file" | "directory"; matchedBy: "name" | "content"; snippet?: string }> = [];

    const searchDir = async (dir: string, depth = 0): Promise<void> => {
      if (matches.length >= maxResults || depth > 5) return;
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (matches.length >= maxResults) break;
        if (IGNORED_DIRS.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        const nameMatches = entry.name.toLowerCase().includes(queryLower);

        if (entry.isDirectory()) {
          if (nameMatches) matches.push({ name: entry.name, path: fullPath, type: "directory", matchedBy: "name" });
          await searchDir(fullPath, depth + 1);
        } else {
          if (nameMatches) {
            matches.push({ name: entry.name, path: fullPath, type: "file", matchedBy: "name" });
          } else {
            try {
              const fstat = await fs.stat(fullPath);
              if (fstat.size < 500 * 1024) {
                const text = await fs.readFile(fullPath, "utf-8");
                const idx = text.toLowerCase().indexOf(queryLower);
                if (idx !== -1) {
                  const start = Math.max(0, idx - 40);
                  const end = Math.min(text.length, idx + queryLower.length + 60);
                  const snippet = text.slice(start, end).replace(/\r?\n/g, " ");
                  matches.push({ name: entry.name, path: fullPath, type: "file", matchedBy: "content", snippet: `...${snippet}...` });
                }
              }
            } catch {}
          }
        }
      }
    };

    await searchDir(targetDir);
    return { status: 200, body: { success: true, tool, query: args.query, searchedPath: targetDir, totalMatches: matches.length, matches } };
  }

  return {
    status: 400,
    body: { success: false, error: `Unrecognized tool '${tool}'. Available tools: list_directory, read_file, write_file, search_files, delete_file.` },
  };
}
