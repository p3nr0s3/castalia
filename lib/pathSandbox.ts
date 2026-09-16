import path from "path";

/**
 * Resolve `inputPath` against `baseDir` and guarantee the result stays
 * inside `baseDir`.
 *
 * This is the ONE place this check should live. It used to be duplicated
 * across app/api/fs/route.ts, app/api/tools/execute/route.ts, and
 * app/api/tools/execute-agent/route.ts — two of the three compared with
 * `path.sep` correctly, one didn't, which let a sibling directory whose
 * name happened to start with the same string as baseDir
 * (e.g. "/home/alice/proj" vs "/home/alice/proj-backup") pass as "inside".
 * Centralizing it means that class of bug can't reappear in just one copy.
 */
export function resolveWithinBase(baseDir: string, inputPath?: string): string {
  const normalizedBase = path.normalize(path.resolve(baseDir));

  if (!inputPath || inputPath.trim() === "" || inputPath === ".") {
    return normalizedBase;
  }

  const resolved = path.resolve(normalizedBase, inputPath);
  const normalizedResolved = path.normalize(resolved);

  const isBaseItself = normalizedResolved === normalizedBase;
  const isInsideBase = normalizedResolved.startsWith(normalizedBase + path.sep);

  if (!isBaseItself && !isInsideBase) {
    throw new Error(
      `Access denied: path '${inputPath}' (resolved: ${normalizedResolved}) falls outside the safe base directory (${normalizedBase}).`
    );
  }

  return resolved;
}

/**
 * Shared "is this a plain-text/code file we're willing to read as UTF-8
 * text" extension set. Originally duplicated between app/api/fs/route.ts
 * (file explorer) and lib/fileWatcher.ts (ambient project-folder
 * indexing) — centralized here so the two don't quietly drift apart on
 * which extensions are considered text.
 */
export const TEXT_FILE_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".csv", ".tsv", ".log", ".env", ".yml", ".yaml", ".xml",
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".html", ".htm", ".css",
  ".scss", ".sass", ".less", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".rs",
  ".go", ".php", ".rb", ".sql", ".sh", ".bash", ".bat", ".cmd", ".ps1", ".ini",
  ".toml", ".conf", ".cfg", ".dockerfile", ".gitignore", ".prisma", ".vue", ".svelte",
  ".markdown",
]);

export function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();
  if (basename === "dockerfile" || basename === "makefile" || basename === ".env") return true;
  return TEXT_FILE_EXTENSIONS.has(ext);
}
