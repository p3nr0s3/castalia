import fs from "fs";
import path from "path";
import os from "os";

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

  // The checks above are purely lexical. A symlink INSIDE the base that points
  // outside of it (e.g. ~/notes -> /etc) passes them, so also compare the
  // real, symlink-resolved locations.
  const realBase = realPathOfNearestExisting(normalizedBase);
  const realTarget = realPathOfNearestExisting(normalizedResolved);
  if (realTarget !== realBase && !realTarget.startsWith(realBase + path.sep)) {
    throw new Error(
      `Access denied: path '${inputPath}' resolves through a symbolic link to ${realTarget}, which is outside the safe base directory (${normalizedBase}).`
    );
  }

  return resolved;
}

/**
 * realpath() of `p`, or — if `p` doesn't exist yet (e.g. a file about to be
 * created) — realpath() of its nearest existing ancestor with the missing
 * tail re-appended. Sync on purpose: path resolvers are sync throughout.
 */
export function realPathOfNearestExisting(p: string): string {
  let current = path.resolve(p);
  const tail: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...tail.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(p);
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

// ---------------------------------------------------------------------------
// Credential / secret locations
// ---------------------------------------------------------------------------

/** Home-relative locations that hold credentials. Never readable or writable by disk tools. */
const SENSITIVE_HOME_SUBPATHS = [
  ".ssh", ".aws", ".gnupg", ".kube", ".azure", ".config/gcloud", ".config/gh", ".docker/config.json",
  ".netrc", "_netrc", ".npmrc", ".pypirc", ".git-credentials", ".password-store", ".local/share/keyrings",
  ".mozilla", ".config/google-chrome", ".config/chromium", ".config/BraveSoftware",
  "AppData/Local/Google/Chrome/User Data", "AppData/Local/Microsoft/Edge/User Data",
  "AppData/Roaming/Mozilla", "AppData/Roaming/Microsoft/Credentials", "AppData/Roaming/Microsoft/Protect",
  "Library/Keychains", "Library/Application Support/Google/Chrome", "Library/Application Support/Firefox",
];

const PRIVATE_KEY_BASENAME = /^id_(?:rsa|dsa|ecdsa|ed25519)(?:_.*)?$/i;

const CASE_INSENSITIVE_FS = process.platform === "win32" || process.platform === "darwin";
const fold = (p: string) => (CASE_INSENSITIVE_FS ? p.toLowerCase() : p);

function isInside(target: string, root: string): boolean {
  const t = fold(path.normalize(target));
  const r = fold(path.normalize(root));
  return t === r || t.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

/**
 * Throws "Access denied: ..." if `resolvedPath` is a credential store (SSH /
 * cloud / browser / keychain locations under the home directory, private key
 * files), or one of THIS app's own secrets: `.env*` files in the app root and
 * its `data/` directory (API keys, bridge tokens, the whole chat database).
 *
 * Why it matters: read_file/list_directory/search_files run WITHOUT an
 * approval prompt, so a prompt-injected document or web page could otherwise
 * make the model read ~/.ssh/id_ed25519 or .env.local into the conversation
 * (and on to a cloud provider).
 */
export function assertNotSensitivePath(
  resolvedPath: string,
  homeDir: string = os.homedir(),
  appRoot: string = process.cwd()
): void {
  const deny = (why: string) => {
    throw new Error(`Access denied: '${resolvedPath}' is ${why}. Disk tools cannot touch it.`);
  };
  // Resolve the roots too: `candidate` is always absolute (with a drive letter on Windows),
  // so comparing it with an unresolved `\\home\\rei` never matched there.
  const home = path.resolve(homeDir);
  const root = path.resolve(appRoot);
  const variants = new Set([path.resolve(resolvedPath), realPathOfNearestExisting(resolvedPath)]);

  for (const candidate of variants) {
    for (const sub of SENSITIVE_HOME_SUBPATHS) {
      if (isInside(candidate, path.join(home, ...sub.split("/")))) deny("a credential store");
    }
    const base = path.basename(candidate);
    if (PRIVATE_KEY_BASENAME.test(base) && !base.toLowerCase().endsWith(".pub")) deny("a private key file");

    if (isInside(candidate, path.join(root, "data"))) deny("this app's private data directory");
    const rel = path.relative(root, candidate);
    if (!rel.startsWith("..") && !path.isAbsolute(rel) && !rel.includes(path.sep) && /^\.env(?:\..*)?$/i.test(rel)) {
      if (!/\.example$/i.test(rel)) deny("this app's environment file");
    }
  }
}

/**
 * Home-scoped resolver for the agent tools, file explorer, and folder
 * watcher: lexical containment + symlink check (resolveWithinBase) plus the
 * credential-location denylist.
 */
export function resolveWithinHomeSafe(inputPath: string | undefined, homeDir: string = path.resolve(os.homedir())): string {
  const resolved = resolveWithinBase(homeDir, inputPath);
  assertNotSensitivePath(resolved, homeDir);
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

/**
 * Manual chat's disk tools are intentionally NOT sandboxed to a base
 * directory (widened to the whole local filesystem per explicit user
 * request — see app/api/tools/execute/route.ts). The only thing still
 * blocked is a short denylist of OS-critical system directories where a
 * stray write_file/delete_file could brick the machine itself.
 *
 * This lived as a private copy inside execute/route.ts. It now also needs
 * to be reachable from app/api/tools/revert/route.ts (reverting a
 * chat-sourced write/delete has to resolve the path with the exact same
 * rules the original action was executed under) — centralized here for the
 * same reason resolveWithinBase is: two copies of a denylist can only ever
 * drift apart, never stay in sync by accident.
 */
const OS_CRITICAL_DENYLIST = [
  // Windows
  "C:\\Windows",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
  "C:\\ProgramData",
  // macOS / Linux, in case this is ever run there
  "/System",
  "/Library",
  "/usr",
  "/bin",
  "/sbin",
  "/lib",
  "/lib64",
  "/etc",
  "/private/etc",
  "/boot",
  "/proc",
  "/sys",
  "/dev",
  "/run",
].map((p) => fold(path.normalize(p)));

export function resolveOnLocalDisk(inputPath?: string, homeDir: string = os.homedir()): string {
  if (!inputPath || inputPath.trim() === "" || inputPath === ".") {
    return path.resolve(homeDir);
  }

  const resolved = path.resolve(inputPath);
  const normalizedLower = fold(path.normalize(resolved));

  const hitsDenylist = OS_CRITICAL_DENYLIST.some(
    (root) => normalizedLower === root || normalizedLower.startsWith(root + path.sep)
  );
  if (hitsDenylist) {
    throw new Error(
      `Access denied: '${resolved}' is inside a protected OS system directory. Disk tools cannot touch Windows/Program Files/system folders.`
    );
  }

  assertNotSensitivePath(resolved, homeDir);
  return resolved;
}
