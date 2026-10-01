import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";
import type { Conversation } from "../lib/types";

// Real serverDb + real files, in a throwaway working directory (data/ lives under process.cwd()).
const prevDataDir = process.env.LYRA_DATA_DIR; // set per test file by tests/setup/isolateDataDir.ts
let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lyra-backup-"));
  process.env.LYRA_DATA_DIR = path.join(dir, "data");
  // serverDb fixes DATA_DIR (and opens its database) when first imported; without this every test
  // would silently reuse the first test's database instead of the fresh directory.
  vi.resetModules();
});
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 120)); // let the JSON backend's async persist finish
  if (prevDataDir === undefined) delete process.env.LYRA_DATA_DIR;
    else process.env.LYRA_DATA_DIR = prevDataDir;
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
});

const conv = (id: string, updatedAt = 1, text = "hello"): Conversation =>
  ({ id, title: id, messages: [{ id: id + "m", role: "user", content: text, timestamp: updatedAt }], createdAt: 1, updatedAt }) as any;
const lib = async () => ({ db: await import("../lib/serverDb"), svc: await import("../lib/backupService") });

async function seed() {
  const { db } = await lib();
  await db.writeServerDb({
    conversations: [conv("c1"), conv("c2")],
    projects: [{ id: "p1", name: "P", createdAt: 1, updatedAt: 1, files: [] } as any],
    settings: { ...(await db.readServerDb()).settings, apiKeys: { openaiApiKey: "sk-live-secret-abcdefghijklmnop" } as any },
    pendingApprovals: [{ id: "ap1", source: "chat", toolName: "write_file", args: { path: "/x" }, status: "approved", createdAt: 1, resolvedAt: 1 } as any],
  });
}

describe("createBackup", () => {
  it("omits API keys by default, includes them only on request, and never includes approvals", async () => {
    await seed();
    const { db, svc } = await lib();
    const current = await db.readServerDb();
    const plain = svc.createBackup(current);
    expect(JSON.stringify(plain)).not.toContain("sk-live-secret");
    expect(plain.includesSecrets).toBe(false);
    const withKeys = svc.createBackup(current, { includeSecrets: true });
    expect(JSON.stringify(withKeys)).toContain("sk-live-secret");
    expect(withKeys.includesSecrets).toBe(true);
    expect(JSON.stringify(plain)).not.toContain("ap1");
    expect(plain.data.conversations).toHaveLength(2);
  });
});

describe("snapshots", () => {
  it("writes a validly named, owner-only snapshot and lists it with counts", async () => {
    await seed();
    const { svc } = await lib();
    const info = await svc.writeSnapshot("manual", { now: new Date(2026, 9, 1, 10, 30, 5) });
    expect(info.name).toBe("lyra-manual-20261001-103005.json");
    expect(info).toMatchObject({ kind: "manual", conversations: 2, projects: 1, includesSecrets: false });
    if (process.platform !== "win32") expect(fs.statSync(path.join(svc.backupDir(), info.name)).mode & 0o777).toBe(0o600);
    expect(svc.listSnapshots().map((s) => s.name)).toEqual([info.name]);
    expect(fs.readdirSync(svc.backupDir()).some((f) => f.endsWith(".tmp"))).toBe(false); // atomic write left no temp file
  });

  it("does not overwrite a snapshot taken in the same second", async () => {
    const { svc } = await lib();
    const now = new Date(2026, 9, 1, 10, 0, 0);
    const a = await svc.writeSnapshot("manual", { now });
    const b = await svc.writeSnapshot("manual", { now });
    expect(a.name).not.toBe(b.name);
    expect(svc.listSnapshots()).toHaveLength(2);
  });

  it("keeps the newest 7 automatic snapshots, 3 pre-restore ones, and every manual one", async () => {
    const { svc } = await lib();
    for (let i = 0; i < 10; i++) await svc.writeSnapshot("auto", { now: new Date(2026, 9, 1 + i) });
    for (let i = 0; i < 5; i++) await svc.writeSnapshot("pre-restore", { now: new Date(2026, 9, 1 + i) });
    for (let i = 0; i < 12; i++) await svc.writeSnapshot("manual", { now: new Date(2026, 9, 1 + i) });
    const by = (k: string) => svc.listSnapshots().filter((s) => s.kind === k).length;
    expect([by("auto"), by("pre-restore"), by("manual")]).toEqual([7, 3, 12]);
    // the survivors are the newest ones
    const autos = fs.readdirSync(svc.backupDir()).filter((f) => f.includes("-auto-")).sort();
    expect(autos[0]).toContain("20261004");
  });

  it("refuses names that could reach outside the backup folder", async () => {
    const { svc } = await lib();
    for (const bad of ["../db.json", "lyra-manual-20261001-103005.json/../../x", "lyra-evil-20261001-103005.json", "/etc/passwd", "lyra-auto-1-2.json", ""]) {
      expect(() => svc.snapshotPath(bad), bad).toThrow(/Invalid snapshot name/);
    }
  });

  it("automatic backup runs only when the last one is older than a day", async () => {
    const { svc } = await lib();
    const t0 = new Date(2026, 9, 1, 8, 0, 0);
    const first = await svc.runAutoBackupIfDue(t0);
    expect(first?.kind).toBe("auto");
    expect(await svc.runAutoBackupIfDue(new Date(t0.getTime() + 2 * 3600_000))).toBeNull();
    // file mtime is "now" for real files, so emulate age by asking as of a later time
    const later = await svc.runAutoBackupIfDue(new Date(Date.now() + 25 * 3600_000));
    expect(later?.kind).toBe("auto");
  });
});

describe("restoreBackup", () => {
  it("replace: swaps the data, snapshots the previous state first, and keeps the API keys on this machine", async () => {
    await seed();
    const { db, svc } = await lib();
    const backup = svc.createBackup(await db.readServerDb()); // keyless
    await db.writeServerDb({ conversations: [conv("junk1"), conv("junk2"), conv("junk3")], overwrite: true });
    expect((await db.readServerDb()).conversations).toHaveLength(3);

    const result = await svc.restoreBackup(backup, "replace");
    expect(result.counts.conversations).toBe(2);
    const after = await db.readServerDb();
    expect(after.conversations.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
    expect((after.settings as any).apiKeys.openaiApiKey).toBe("sk-live-secret-abcdefghijklmnop"); // not wiped by a keyless backup

    // the undo point holds what was there BEFORE the restore (the 3 junk chats)
    const undo = svc.readSnapshot(result.preRestore.name);
    expect(undo.data.conversations.map((c: any) => c.id).sort()).toEqual(["junk1", "junk2", "junk3"]);
  });

  it("merge: adds missing items and keeps the newer copy of items that exist on both sides", async () => {
    const { db, svc } = await lib();
    await db.writeServerDb({ conversations: [conv("shared", 500, "NEWER local"), conv("only-local", 1)] });
    const backup = svc.createBackup({ ...(await db.readServerDb()), conversations: [conv("shared", 100, "OLDER backup"), conv("only-backup", 1)] } as any);
    await svc.restoreBackup(backup, "merge");
    const after = await db.readServerDb();
    expect(after.conversations.map((c) => c.id).sort()).toEqual(["only-backup", "only-local", "shared"]);
    expect(after.conversations.find((c) => c.id === "shared")!.messages[0].content).toBe("NEWER local");
  });

  it("does not touch pending approvals (a restore must not resurrect an approved write)", async () => {
    await seed();
    const { db, svc } = await lib();
    const backup = svc.createBackup(await db.readServerDb());
    await db.writeServerDb({ pendingApprovals: [{ id: "ap2", source: "chat", toolName: "delete_file", args: {}, status: "rejected", createdAt: 2, resolvedAt: 2 } as any], overwrite: true });
    await svc.restoreBackup(backup, "replace");
    const ids = (await db.readServerDb()).pendingApprovals.map((a) => a.id);
    expect(ids).toEqual(["ap2"]);
  });
});

describe("/api/backup", () => {
  const call = async (method: string, qs = "", body?: unknown) => {
    const route = await import("../app/api/backup/route");
    const req = new NextRequest(`http://localhost:3000/api/backup${qs}`, {
      method,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    return (route as any)[method](req) as Promise<Response>;
  };

  it("lists, snapshots, downloads, restores from a snapshot, and deletes", async () => {
    await seed();
    const snap = await (await call("POST", "", { action: "snapshot" })).json();
    const name = snap.snapshot.name;
    expect((await (await call("GET")).json()).snapshots.map((s: any) => s.name)).toContain(name);

    const dl = await call("GET", `?download=${name}`);
    expect(dl.headers.get("content-disposition")).toContain(name);
    expect((await dl.json()).data.conversations).toHaveLength(2);

    const { db } = await lib();
    await db.writeServerDb({ conversations: [], overwrite: true });
    const restored = await call("POST", "", { action: "restore", snapshot: name, mode: "replace" });
    expect(restored.status).toBe(200);
    expect((await db.readServerDb()).conversations).toHaveLength(2);

    expect((await call("DELETE", `?name=${name}`)).status).toBe(200);
    expect((await call("DELETE", `?name=${name}`)).status).toBe(404);
  });

  it("live download omits keys unless asked, and says so in the file name", async () => {
    await seed();
    const plain = await call("GET", "?download=live");
    expect(JSON.stringify(await plain.json())).not.toContain("sk-live-secret");
    const keyed = await call("GET", "?download=live&secrets=1");
    expect(keyed.headers.get("content-disposition")).toContain("WITH-KEYS");
    expect(JSON.stringify(await keyed.json())).toContain("sk-live-secret");
  });

  it("restores an uploaded backup file and rejects malformed ones with 400", async () => {
    await seed();
    const { svc, db } = await lib();
    const file = svc.createBackup(await db.readServerDb());
    await db.writeServerDb({ conversations: [], overwrite: true });
    expect((await call("POST", "", { action: "restore", backup: file, mode: "replace" })).status).toBe(200);
    expect((await db.readServerDb()).conversations).toHaveLength(2);

    expect((await call("POST", "", { action: "restore", backup: { format: "something-else" } })).status).toBe(400);
    expect((await call("POST", "", { action: "restore", mode: "replace" })).status).toBe(400); // neither snapshot nor backup
    expect((await call("POST", "", { action: "restore", snapshot: "lyra-manual-20200101-000000.json", backup: file })).status).toBe(400); // both
    expect((await call("POST", "", { action: "explode" })).status).toBe(400);
  });

  it("returns 400/404 for traversal names and unknown snapshots", async () => {
    expect((await call("GET", "?download=..%2F..%2Fetc%2Fpasswd")).status).toBe(400);
    expect((await call("GET", "?download=lyra-manual-20200101-000000.json")).status).toBe(404);
    expect((await call("DELETE", "?name=../x")).status).toBe(400);
    expect((await call("POST", "", { action: "restore", snapshot: "lyra-manual-20200101-000000.json" })).status).toBe(404);
  });
});
