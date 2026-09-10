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
