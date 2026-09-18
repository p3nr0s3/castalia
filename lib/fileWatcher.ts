import fs from "fs";
import path from "path";
import os from "os";
import { readServerDb, writeServerDb } from "./serverDb";
import { resolveWithinBase, isTextFile } from "./pathSandbox";
import type { Project, ProjectFile } from "./types";

// Ambient file-watcher: when a project has watchedFolderEnabled + a
// watchedFolderPath, the server watches that folder (sandboxed the same
// way disk tools are — see resolveWithinHome below) and keeps
// project.files synced with its plain-text contents automatically,
// without the user needing to re-upload anything through the Knowledge
// tab's manual Upload button.
//
// Scope decision: only plain-text-ish extensions are watched (the shared
// TEXT_FILE_EXTENSIONS set in lib/pathSandbox.ts, also used by the file
// explorer route). PDF/EPUB/CBZ parsing in documentParsers.ts uses the
// browser's File API (file.text(), the File constructor) and runs
// client-side during manual upload — there is no server-side equivalent
// today. Re-implementing binary parsing server-side to support watching
// PDFs is a materially bigger project; out of scope here. A watched
// folder containing a PDF simply ignores it (logged once, not per-poll)
// rather than failing the whole sync.

const MAX_WATCHED_FILE_BYTES = 2 * 1024 * 1024; // 2MB — same ballpark as a single manually-uploaded text file; larger files are skipped rather than silently truncated
const MAX_WATCHED_FILES_PER_SCAN = 500; // guards against a watched folder accidentally pointed at something huge — see listWatchableFilesRecursive
const DEBOUNCE_MS = 800; // fs.watch fires multiple events per single save (e.g. write + rename on some editors/OSes) — coalesce into one re-scan

const HOME_DIR = path.resolve(os.homedir());

function resolveWithinHome(inputPath: string): string {
  return resolveWithinBase(HOME_DIR, inputPath);
}

interface WatcherEntry {
  watcher: fs.FSWatcher;
  debounceTimer: NodeJS.Timeout | null;
  folderPath: string;
}

// Module-level registry, keyed by project id. Lives for the lifetime of
// the Node process (the Next.js dev/prod server) — there is deliberately
// no persistence of "which watchers were active" across a server restart
// beyond what's already in project.watchedFolderEnabled; startWatchersFromDb()
// below re-derives the active set from the DB on boot.
const activeWatchers = new Map<string, WatcherEntry>();

/**
 * Recursively lists watchable files under a folder, returning paths
 * relative to that folder. Skips node_modules, .git, and dotfolders —
 * the common case for a watched folder is a real working directory the
 * user is also using for other things, not a curated knowledge-only
 * folder, so noise-source directories need to be excluded by default.
 */
/**
 * Recursively lists watchable files under a folder, returning paths
 * relative to that folder. Skips node_modules, .git, and dotfolders —
 * the common case for a watched folder is a real working directory the
 * user is also using for other things, not a curated knowledge-only
 * folder, so noise-source directories need to be excluded by default.
 *
 * Async (fs.promises), not fs.readdirSync: this runs on every debounced
 * file-change event while the Next.js server is live. A sync recursive
 * walk blocks the whole Node event loop for its entire duration — every
 * other in-flight request (chat token streaming, the Ollama proxy, any
 * other API route) stalls until the scan finishes. For a folder with a
 * few dozen files that's not noticeable; for a large working directory
 * it's a real, repeated freeze on every save. Async I/O yields the event
 * loop between operations so a rescan running in the background doesn't
 * block anything else.
 *
 * Also capped at MAX_WATCHED_FILES_PER_SCAN: without a limit, a watched
 * folder accidentally pointed at something large (a big repo, a home
 * directory) triggers an unbounded walk + read of every text file on
 * every single debounce tick. Stops early and warns once per scan
 * rather than silently reading everything.
 */
async function listWatchableFilesRecursive(rootDir: string): Promise<string[]> {
  const results: string[] = [];
  let truncated = false;

  async function walk(currentDir: string): Promise<void> {
    if (results.length >= MAX_WATCHED_FILES_PER_SCAN) {
      truncated = true;
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= MAX_WATCHED_FILES_PER_SCAN) {
        truncated = true;
        return;
      }
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && isTextFile(fullPath)) {
        results.push(path.relative(rootDir, fullPath));
      }
    }
  }

  await walk(rootDir);

  if (truncated) {
    console.warn(
      `[fileWatcher] '${rootDir}' has more than ${MAX_WATCHED_FILES_PER_SCAN} watchable files — stopped scanning early. Point the watched folder at something more specific if you need full coverage.`
    );
  }

  return results;
}

async function readFileAsProjectFile(rootDir: string, relativePath: string): Promise<ProjectFile | null> {
  const fullPath = path.join(rootDir, relativePath);
  try {
    const stat = await fs.promises.stat(fullPath);
    if (stat.size > MAX_WATCHED_FILE_BYTES) {
      console.warn(`[fileWatcher] Skipping '${relativePath}': ${stat.size} bytes exceeds the ${MAX_WATCHED_FILE_BYTES}-byte watched-file limit.`);
      return null;
    }
    const textContent = await fs.promises.readFile(fullPath, "utf-8");
    return {
      id: `watched_${relativePath.replace(/[\\/]/g, "_")}`,
      name: path.basename(relativePath),
      size: stat.size,
      type: "document",
      textContent,
      uploadedAt: stat.mtimeMs,
      watchedRelativePath: relativePath,
    };
  } catch (err: any) {
    console.warn(`[fileWatcher] Failed to read '${relativePath}': ${err.message || err}`);
    return null;
  }
}

/**
 * Full re-scan of a project's watched folder: reads every watchable file
 * currently on disk, replaces the project's watcher-owned files with
 * that fresh set, and leaves manually-uploaded files (no
 * watchedRelativePath) untouched. Writes the merged project back via
 * writeServerDb.
 *
 * Race note: writeServerDb's project merge is whole-object (by
 * updatedAt), not field-level (see lib/serverDb.ts's mergeProjects) — if
 * the client pushes an unrelated edit to this exact project in the same
 * instant, one write can clobber the other. Acceptable for a
 * single-user local tool; re-reading the project fresh right before
 * writing (rather than holding a stale in-memory copy) narrows the
 * window as much as is practical without a bigger locking mechanism.
 */
export async function rescanProject(projectId: string, folderPath: string): Promise<void> {
  const db = await readServerDb();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project || !project.watchedFolderEnabled) return; // watcher was stopped/project deleted between the fs event firing and this running

  const relativePaths = await listWatchableFilesRecursive(folderPath);
  const freshWatchedFiles: ProjectFile[] = (
    await Promise.all(relativePaths.map((rel) => readFileAsProjectFile(folderPath, rel)))
  ).filter((f): f is ProjectFile => f !== null);

  const manuallyUploadedFiles = (project.files || []).filter((f) => !f.watchedRelativePath);
  const mergedFiles = [...manuallyUploadedFiles, ...freshWatchedFiles];

  // Skip the write entirely if nothing actually changed (compares
  // file identity + content, not just count) — avoids bumping
  // updatedAt and pushing a DB version change on every debounce tick
  // when e.g. an editor touched a file's mtime without changing content.
  const previousWatched = (project.files || []).filter((f) => f.watchedRelativePath);
  const unchanged =
    previousWatched.length === freshWatchedFiles.length &&
    previousWatched.every((old) => {
      const fresh = freshWatchedFiles.find((f) => f.watchedRelativePath === old.watchedRelativePath);
      return fresh && fresh.textContent === old.textContent;
    });
  if (unchanged) return;

  const updatedProject: Project = { ...project, files: mergedFiles, updatedAt: Date.now() };
  await writeServerDb({ projects: [updatedProject] });
}

function scheduleRescan(projectId: string): void {
  const entry = activeWatchers.get(projectId);
  if (!entry) return;
  if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
  entry.debounceTimer = setTimeout(() => {
    rescanProject(projectId, entry.folderPath).catch((err) =>
      console.error(`[fileWatcher] Rescan failed for project ${projectId}:`, err)
    );
  }, DEBOUNCE_MS);
}

/**
 * Starts watching a project's configured folder. Safe to call again for
 * an already-watched project (e.g. the folder path changed) — the old
 * watcher is stopped first. Throws if the resolved path escapes the
 * home-directory sandbox or does not exist/is not a directory, so the
 * API route can surface a clear 400 rather than the watcher silently
 * never firing.
 */
/**
 * Guards against the one platform combination where recursive watching
 * fails *silently* rather than throwing: Linux before Node 20.13.0.
 *
 * `fs.watch(path, { recursive: true })` has long worked on macOS and
 * Windows, but on Linux recursive support only landed in Node 20.13.0.
 * On older Node/Linux the call still succeeds and still fires events for
 * files directly inside the watched folder — it just never reports
 * anything in subdirectories. That's the worst failure mode available:
 * the watcher looks healthy, the UI shows it active, and nested files
 * quietly never sync. Failing loudly at start time is far better than
 * letting a user trust a half-working index.
 */
function assertRecursiveWatchSupported(): void {
  if (process.platform !== "linux") return;

  const [major, minor] = process.versions.node.split(".").map(Number);
  const supported = major > 20 || (major === 20 && minor >= 13);
  if (supported) return;

  throw new Error(
    `Recursive folder watching requires Node 20.13.0 or newer on Linux (running ${process.versions.node}). ` +
      `On this version subdirectories would be silently skipped, so the watcher is refusing to start rather than ` +
      `indexing only part of the folder. Upgrade Node, or point the watcher at a flat folder with no subdirectories.`
  );
}

export function startWatcher(project: Project): void {
  if (!project.watchedFolderPath) throw new Error("watchedFolderPath is required to start a watcher.");

  const resolvedPath = resolveWithinHome(project.watchedFolderPath);
  const stat = fs.statSync(resolvedPath); // throws ENOENT if missing — surfaced to the caller
  if (!stat.isDirectory()) throw new Error(`'${project.watchedFolderPath}' is not a directory.`);

  stopWatcher(project.id);

  assertRecursiveWatchSupported();

  const watcher = fs.watch(resolvedPath, { recursive: true }, (_eventType, filename) => {
    // filename can be null on some platforms/edge cases (e.g. some
    // network filesystems) — treat that as "something changed,
    // rescan everything" rather than trying to be surgical about it.
    if (filename && !isTextFile(filename)) return;
    scheduleRescan(project.id);
  });

  watcher.on("error", (err) => {
    console.error(`[fileWatcher] Watcher error for project ${project.id} ('${resolvedPath}'):`, err);
  });

  activeWatchers.set(project.id, { watcher, debounceTimer: null, folderPath: resolvedPath });

  // Initial full scan on start, not just on the next change event —
  // otherwise enabling the watcher on a folder that already has files
  // does nothing until something changes.
  scheduleRescan(project.id);
}

export function stopWatcher(projectId: string): void {
  const entry = activeWatchers.get(projectId);
  if (!entry) return;
  if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
  entry.watcher.close();
  activeWatchers.delete(projectId);
}

export function isWatcherActive(projectId: string): boolean {
  return activeWatchers.has(projectId);
}

/**
 * Re-derives the active watcher set from the DB. Intended to be called
 * once at server startup (see its call site) so watchers configured in
 * a previous server run resume automatically — fs.watch instances don't
 * survive a process restart, and there is no other mechanism that would
 * restart them.
 */
export async function startWatchersFromDb(): Promise<void> {
  const db = await readServerDb();
  for (const project of db.projects) {
    if (project.watchedFolderEnabled && project.watchedFolderPath) {
      try {
        startWatcher(project);
      } catch (err: any) {
        console.error(`[fileWatcher] Failed to resume watcher for project ${project.id} on startup:`, err.message || err);
      }
    }
  }
}
