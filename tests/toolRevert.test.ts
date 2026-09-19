import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { PendingApproval } from "../lib/types";

// Mirrors the mocking approach in tests/toolExecuteApproval.test.ts: isolate
// the revert route's decision logic from real disk I/O and the server DB.
// Unlike that file's flat "always succeeds" mock, runDiskTool here needs to
// answer read_file with different content per test — the whole point of
// revert's safety check is comparing current-on-disk content against what
// the original action recorded, so the mock has to be able to lie about
// what's currently on disk in both directions.
const dbState: { pendingApprovals: PendingApproval[] } = { pendingApprovals: [] };

vi.mock("../lib/serverDb", () => ({
  readServerDb: vi.fn(async () => ({ ...dbState })),
  getPendingApprovalById: vi.fn(async (id: string) => dbState.pendingApprovals.find((a) => a.id === id) || null),
  writeServerDb: vi.fn(async (patch: { pendingApprovals?: PendingApproval[] }) => {
    if (patch.pendingApprovals) {
      for (const updated of patch.pendingApprovals) {
        const idx = dbState.pendingApprovals.findIndex((a) => a.id === updated.id);
        if (idx >= 0) dbState.pendingApprovals[idx] = updated;
        else dbState.pendingApprovals.push(updated);
      }
    }
  }),
}));

// currentDiskContent === undefined means "file doesn't exist" (read_file fails).
let currentDiskContent: string | undefined;

const runDiskToolMock = vi.fn(async (tool: string, args: Record<string, any>, _resolvePath: (p?: string) => string) => {
  if (tool === "read_file") {
    if (currentDiskContent === undefined) {
      throw new Error("ENOENT: no such file");
    }
    return { status: 200, body: { success: true, content: currentDiskContent } };
  }
  if (tool === "write_file") {
    currentDiskContent = String(args.content);
    return { status: 200, body: { success: true, path: args.path } };
  }
  if (tool === "delete_file") {
    currentDiskContent = undefined;
    return { status: 200, body: { success: true, path: args.path } };
  }
  throw new Error(`unexpected tool in test mock: ${tool}`);
});

vi.mock("../lib/diskToolOps", () => ({
  runDiskTool: (tool: string, args: Record<string, any>, resolvePath: (p?: string) => string) =>
    runDiskToolMock(tool, args, resolvePath),
}));

function baseApproval(overrides: Partial<PendingApproval> = {}): PendingApproval {
  const now = Date.now();
  return {
    id: "appr_1",
    source: "chat",
    toolName: "write_file",
    args: { path: "/home/user/notes.txt", content: "new content" },
    status: "approved",
    createdAt: now - 5000,
    resolvedAt: now - 4000,
    previousContent: "old content",
    ...overrides,
  };
}

function makeReq(body: Record<string, any>): NextRequest {
  return new NextRequest("http://localhost:3000/api/tools/revert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  dbState.pendingApprovals = [];
  runDiskToolMock.mockClear();
  currentDiskContent = undefined;
});

describe("POST /api/tools/revert", () => {
  it("404s on an unknown approval id", async () => {
    const { POST } = await import("../app/api/tools/revert/route");
    const res = await POST(makeReq({ approvalId: "does-not-exist" }));
    expect(res.status).toBe(404);
    expect(runDiskToolMock).not.toHaveBeenCalled();
  });

  it("refuses an approval that was never approved (still pending)", async () => {
    dbState.pendingApprovals = [baseApproval({ status: "pending" })];
    const { POST } = await import("../app/api/tools/revert/route");
    const res = await POST(makeReq({ approvalId: "appr_1" }));
    expect(res.status).toBe(409);
    expect(runDiskToolMock).not.toHaveBeenCalled();
  });

  it("refuses a tool with no revert action (e.g. list_directory)", async () => {
    dbState.pendingApprovals = [baseApproval({ toolName: "list_directory" as any })];
    const { POST } = await import("../app/api/tools/revert/route");
    const res = await POST(makeReq({ approvalId: "appr_1" }));
    expect(res.status).toBe(400);
    expect(runDiskToolMock).not.toHaveBeenCalled();
  });

  it("refuses an approval that was already reverted — one-shot, no replay", async () => {
    dbState.pendingApprovals = [baseApproval({ reverted: true, revertedAt: Date.now() - 1000 })];
    const { POST } = await import("../app/api/tools/revert/route");
    const res = await POST(makeReq({ approvalId: "appr_1" }));
    expect(res.status).toBe(409);
    expect(runDiskToolMock).not.toHaveBeenCalled();
  });

  describe("write_file revert", () => {
    it("restores the old content when the current file still matches what was written", async () => {
      dbState.pendingApprovals = [baseApproval()];
      currentDiskContent = "new content"; // matches args.content — nothing changed since
      const { POST } = await import("../app/api/tools/revert/route");
      const res = await POST(makeReq({ approvalId: "appr_1" }));
      expect(res.status).toBe(200);
      expect(currentDiskContent).toBe("old content");
      expect(dbState.pendingApprovals[0].reverted).toBe(true);
      expect(dbState.pendingApprovals[0].revertedAt).toBeTruthy();
    });

    it("deletes the file instead when previousContent is undefined (it was a brand-new file)", async () => {
      dbState.pendingApprovals = [baseApproval({ previousContent: undefined })];
      currentDiskContent = "new content";
      const { POST } = await import("../app/api/tools/revert/route");
      const res = await POST(makeReq({ approvalId: "appr_1" }));
      expect(res.status).toBe(200);
      const deleteCalls = runDiskToolMock.mock.calls.filter((c) => c[0] === "delete_file");
      expect(deleteCalls.length).toBe(1);
    });

    it("refuses when the file has been changed again since — will not clobber a newer edit", async () => {
      dbState.pendingApprovals = [baseApproval()];
      currentDiskContent = "someone edited this after"; // no longer matches args.content
      const { POST } = await import("../app/api/tools/revert/route");
      const res = await POST(makeReq({ approvalId: "appr_1" }));
      expect(res.status).toBe(409);
      // Only the read_file safety check should have run — never write_file/delete_file.
      expect(runDiskToolMock).toHaveBeenCalledTimes(1);
      expect(runDiskToolMock.mock.calls[0][0]).toBe("read_file");
      expect(dbState.pendingApprovals[0].reverted).toBeFalsy();
    });

    it("refuses when the file no longer exists — can't verify it's safe to guess", async () => {
      dbState.pendingApprovals = [baseApproval()];
      currentDiskContent = undefined;
      const { POST } = await import("../app/api/tools/revert/route");
      const res = await POST(makeReq({ approvalId: "appr_1" }));
      expect(res.status).toBe(409);
      expect(runDiskToolMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("delete_file revert", () => {
    it("restores the deleted file when nothing now occupies that path", async () => {
      dbState.pendingApprovals = [
        baseApproval({ toolName: "delete_file", args: { path: "/home/user/gone.txt" }, previousContent: "the deleted content" }),
      ];
      currentDiskContent = undefined; // path is genuinely empty, as expected post-delete
      const { POST } = await import("../app/api/tools/revert/route");
      const res = await POST(makeReq({ approvalId: "appr_1" }));
      expect(res.status).toBe(200);
      expect(currentDiskContent).toBe("the deleted content");
      expect(dbState.pendingApprovals[0].reverted).toBe(true);
    });

    it("refuses when previousContent was never captured — nothing to restore from", async () => {
      dbState.pendingApprovals = [
        baseApproval({ toolName: "delete_file", args: { path: "/home/user/gone.txt" }, previousContent: undefined }),
      ];
      const { POST } = await import("../app/api/tools/revert/route");
      const res = await POST(makeReq({ approvalId: "appr_1" }));
      expect(res.status).toBe(409);
      expect(runDiskToolMock).not.toHaveBeenCalled();
    });

    it("refuses when a new file already occupies the path — won't overwrite it", async () => {
      dbState.pendingApprovals = [
        baseApproval({ toolName: "delete_file", args: { path: "/home/user/gone.txt" }, previousContent: "the deleted content" }),
      ];
      currentDiskContent = "something new was written here";
      const { POST } = await import("../app/api/tools/revert/route");
      const res = await POST(makeReq({ approvalId: "appr_1" }));
      expect(res.status).toBe(409);
      expect(runDiskToolMock).toHaveBeenCalledTimes(1);
      expect(runDiskToolMock.mock.calls[0][0]).toBe("read_file");
    });
  });

  it("resolves the path with the agent (home-dir) sandbox for source: \"agent\" approvals", async () => {
    dbState.pendingApprovals = [baseApproval({ source: "agent" })];
    currentDiskContent = "new content";
    const { POST } = await import("../app/api/tools/revert/route");
    await POST(makeReq({ approvalId: "appr_1" }));
    // Every runDiskTool call's 3rd arg is the resolvePath function for that
    // source — just confirm one was passed through, not which one (the
    // resolver functions themselves are covered by pathSandbox tests).
    expect(runDiskToolMock.mock.calls[0][2]).toBeTypeOf("function");
  });
});
