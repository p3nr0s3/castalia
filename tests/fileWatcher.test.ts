import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import type { Project } from "../lib/types";

// rescanProject reads/writes via lib/serverDb, not real DB files — mocked
// the same way tests/toolExecuteApproval.test.ts mocks it, so this suite
// exercises the sync/diff logic in isolation from actual persistence.
const dbState: { projects: Project[] } = { projects: [] };

vi.mock("../lib/serverDb", () => ({
  readServerDb: vi.fn(async () => ({ ...dbState })),
  writeServerDb: vi.fn(async (patch: { projects?: Project[] }) => {
    if (patch.projects) {
      for (const updated of patch.projects) {
        const idx = dbState.projects.findIndex((p) => p.id === updated.id);
        if (idx >= 0) dbState.projects[idx] = updated;
        else dbState.projects.push(updated);
      }
    }
  }),
}));

function baseProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj_1",
    name: "Test Project",
    files: [],
    watchedFolderEnabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("rescanProject", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "filewatcher-test-"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    dbState.projects = [];
    // Clean the temp dir between tests rather than making a fresh mkdtemp
    // each time — cheaper, and this suite already isolates by project id.
    const entries = await fs.readdir(tmpDir);
    await Promise.all(entries.map((e) => fs.rm(path.join(tmpDir, e), { recursive: true, force: true })));
  });

  it("does nothing if the project isn't found in the DB", async () => {
    const { rescanProject } = await import("../lib/fileWatcher");
    await expect(rescanProject("does-not-exist", tmpDir)).resolves.toBeUndefined();
    expect(dbState.projects).toHaveLength(0);
  });

  it("does nothing if the project's watcher was disabled between the fs event and this running", async () => {
    dbState.projects = [baseProject({ watchedFolderEnabled: false })];
    await fs.writeFile(path.join(tmpDir, "note.md"), "hello");
    const { rescanProject } = await import("../lib/fileWatcher");
    await rescanProject("proj_1", tmpDir);
    expect(dbState.projects[0].files).toEqual([]);
  });

  it("picks up a new plain-text file and marks it as watcher-owned", async () => {
    dbState.projects = [baseProject()];
    await fs.writeFile(path.join(tmpDir, "note.md"), "hello world");

    const { rescanProject } = await import("../lib/fileWatcher");
    await rescanProject("proj_1", tmpDir);

    const files = dbState.projects[0].files;
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("note.md");
    expect(files[0].textContent).toBe("hello world");
    expect(files[0].watchedRelativePath).toBe("note.md");
  });

  it("ignores files with unsupported extensions (e.g. binary-ish or unlisted types)", async () => {
    dbState.projects = [baseProject()];
    await fs.writeFile(path.join(tmpDir, "note.md"), "text");
    await fs.writeFile(path.join(tmpDir, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const { rescanProject } = await import("../lib/fileWatcher");
    await rescanProject("proj_1", tmpDir);

    const files = dbState.projects[0].files;
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("note.md");
  });

  it("skips node_modules and dotfolders/dotfiles", async () => {
    dbState.projects = [baseProject()];
    await fs.mkdir(path.join(tmpDir, "node_modules"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "node_modules", "junk.md"), "should be ignored");
    await fs.mkdir(path.join(tmpDir, ".git"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, ".git", "config.txt"), "should be ignored too");
    await fs.writeFile(path.join(tmpDir, ".hidden.md"), "also ignored");
    await fs.writeFile(path.join(tmpDir, "real.md"), "kept");

    const { rescanProject } = await import("../lib/fileWatcher");
    await rescanProject("proj_1", tmpDir);

    const files = dbState.projects[0].files;
    expect(files.map((f) => f.name)).toEqual(["real.md"]);
  });

  it("recurses into real subdirectories", async () => {
    dbState.projects = [baseProject()];
    await fs.mkdir(path.join(tmpDir, "sub", "nested"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "sub", "nested", "deep.md"), "deep content");

    const { rescanProject } = await import("../lib/fileWatcher");
    await rescanProject("proj_1", tmpDir);

    const files = dbState.projects[0].files;
    expect(files).toHaveLength(1);
    expect(files[0].watchedRelativePath).toBe(path.join("sub", "nested", "deep.md"));
  });

  it("removes a watcher-owned file from the project once deleted from disk", async () => {
    const filePath = path.join(tmpDir, "temp.md");
    await fs.writeFile(filePath, "will be deleted");
    dbState.projects = [baseProject()];

    const { rescanProject } = await import("../lib/fileWatcher");
    await rescanProject("proj_1", tmpDir);
    expect(dbState.projects[0].files).toHaveLength(1);

    await fs.rm(filePath);
    await rescanProject("proj_1", tmpDir);
    expect(dbState.projects[0].files).toHaveLength(0);
  });

  it("never touches manually-uploaded files (no watchedRelativePath) even when they share a name with a watched file", async () => {
    dbState.projects = [
      baseProject({
        files: [
          { id: "manual_1", name: "note.md", size: 5, type: "document", textContent: "manual version", uploadedAt: Date.now() },
        ],
      }),
    ];
    await fs.writeFile(path.join(tmpDir, "note.md"), "watched version");

    const { rescanProject } = await import("../lib/fileWatcher");
    await rescanProject("proj_1", tmpDir);

    const files = dbState.projects[0].files;
    // Both coexist: the manual upload is untouched, the watched file is
    // added alongside it — rescanProject only ever replaces the subset
    // of files that already have a watchedRelativePath.
    expect(files).toHaveLength(2);
    const manual = files.find((f) => f.id === "manual_1");
    const watched = files.find((f) => f.watchedRelativePath === "note.md");
    expect(manual?.textContent).toBe("manual version");
    expect(watched?.textContent).toBe("watched version");
  });

  it("skips the DB write entirely when nothing actually changed (content-based, not just count)", async () => {
    await fs.writeFile(path.join(tmpDir, "stable.md"), "unchanged content");
    dbState.projects = [baseProject()];

    const { rescanProject } = await import("../lib/fileWatcher");
    await rescanProject("proj_1", tmpDir);
    const firstUpdatedAt = dbState.projects[0].updatedAt;

    // Re-run without any real change — updatedAt must not bump, proving
    // the write was actually skipped rather than re-writing identical data.
    await new Promise((r) => setTimeout(r, 5));
    await rescanProject("proj_1", tmpDir);
    expect(dbState.projects[0].updatedAt).toBe(firstUpdatedAt);
  });

  it("does write when content changes, even if the file count stays the same", async () => {
    const filePath = path.join(tmpDir, "changing.md");
    await fs.writeFile(filePath, "version 1");
    dbState.projects = [baseProject()];

    const { rescanProject } = await import("../lib/fileWatcher");
    await rescanProject("proj_1", tmpDir);
    expect(dbState.projects[0].files[0].textContent).toBe("version 1");

    await fs.writeFile(filePath, "version 2");
    await rescanProject("proj_1", tmpDir);
    expect(dbState.projects[0].files[0].textContent).toBe("version 2");
  });

  it("skips a file over the size limit rather than truncating or crashing", async () => {
    dbState.projects = [baseProject()];
    // 2MB limit — write something safely over it.
    await fs.writeFile(path.join(tmpDir, "huge.md"), "x".repeat(3 * 1024 * 1024));
    await fs.writeFile(path.join(tmpDir, "normal.md"), "fine");

    const { rescanProject } = await import("../lib/fileWatcher");
    await rescanProject("proj_1", tmpDir);

    const files = dbState.projects[0].files;
    expect(files.map((f) => f.name)).toEqual(["normal.md"]);
  });
});
