import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { PendingApproval } from "../lib/types";

// Both routes under test import readServerDb/writeServerDb from lib/serverDb
// and runDiskTool from lib/diskToolOps. Mocking these isolates the
// approval-gate logic (the security-relevant part) from real disk I/O and
// the on-disk/SQLite server DB — runDiskTool succeeding is not what these
// tests care about, only whether it gets CALLED at all for a mutating tool
// without a valid, fresh, unconsumed, matching approval.
const dbState: { pendingApprovals: PendingApproval[] } = { pendingApprovals: [] };

vi.mock("../lib/serverDb", () => ({
  readServerDb: vi.fn(async () => ({ ...dbState })),
  writeServerDb: vi.fn(async (patch: { pendingApprovals?: PendingApproval[] }) => {
    if (patch.pendingApprovals) {
      for (const updated of patch.pendingApprovals) {
        const idx = dbState.pendingApprovals.findIndex((a) => a.id === updated.id);
        if (idx >= 0) dbState.pendingApprovals[idx] = updated;
      }
    }
  }),
}));

const runDiskToolMock = vi.fn(async (_tool: string, _args: Record<string, any>, _resolvePath: (p?: string) => string) => ({
  status: 200,
  body: { success: true },
}));
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
    args: { path: "C:\\Users\\rei\\notes.txt" },
    status: "approved",
    createdAt: now - 1000,
    resolvedAt: now - 500,
    ...overrides,
  };
}

function makeReq(url: string, body: Record<string, any>): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  dbState.pendingApprovals = [];
  runDiskToolMock.mockClear();
});

// Both /api/tools/execute and /api/tools/execute-agent implement the same
// gate independently (by design — different path sandboxes) so both must
// be exercised the same way to catch the two implementations drifting.
describe.each([
  { name: "manual chat route", modulePath: "../app/api/tools/execute/route", url: "http://localhost:3000/api/tools/execute" },
  { name: "agent route", modulePath: "../app/api/tools/execute-agent/route", url: "http://localhost:3000/api/tools/execute-agent" },
])("$name — mutating tool approval gate", ({ modulePath, url }) => {
  it("refuses write_file with no approvalToken at all", async () => {
    const { POST } = await import(modulePath);
    const req = makeReq(url, { tool: "write_file", args: { path: "x.txt" } });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(runDiskToolMock).not.toHaveBeenCalled();
  });

  it("refuses an approvalToken that doesn't exist in the server DB", async () => {
    const { POST } = await import(modulePath);
    const req = makeReq(url, {
      tool: "write_file",
      args: { path: "x.txt" },
      approvalToken: "does-not-exist",
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(runDiskToolMock).not.toHaveBeenCalled();
  });

  it("refuses an approval that is still pending (not yet approved)", async () => {
    dbState.pendingApprovals = [baseApproval({ status: "pending" })];
    const { POST } = await import(modulePath);
    const req = makeReq(url, {
      tool: "write_file",
      args: { path: "C:\\Users\\rei\\notes.txt" },
      approvalToken: "appr_1",
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(runDiskToolMock).not.toHaveBeenCalled();
  });

  it("refuses an approval that was rejected", async () => {
    dbState.pendingApprovals = [baseApproval({ status: "rejected" })];
    const { POST } = await import(modulePath);
    const req = makeReq(url, {
      tool: "write_file",
      args: { path: "C:\\Users\\rei\\notes.txt" },
      approvalToken: "appr_1",
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(runDiskToolMock).not.toHaveBeenCalled();
  });

  it("refuses when the tool name doesn't match the approval (approved for write_file, requesting delete_file)", async () => {
    dbState.pendingApprovals = [baseApproval({ toolName: "write_file" })];
    const { POST } = await import(modulePath);
    const req = makeReq(url, {
      tool: "delete_file",
      args: { path: "C:\\Users\\rei\\notes.txt" },
      approvalToken: "appr_1",
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(runDiskToolMock).not.toHaveBeenCalled();
  });

  it("refuses when the path doesn't match — cannot hijack an approval for file A to write file B", async () => {
    dbState.pendingApprovals = [baseApproval({ args: { path: "C:\\Users\\rei\\a.txt" } })];
    const { POST } = await import(modulePath);
    const req = makeReq(url, {
      tool: "write_file",
      args: { path: "C:\\Users\\rei\\b.txt" },
      approvalToken: "appr_1",
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(runDiskToolMock).not.toHaveBeenCalled();
  });

  it("refuses an approval older than the 5-minute freshness window", async () => {
    const now = Date.now();
    dbState.pendingApprovals = [
      baseApproval({ resolvedAt: now - 6 * 60 * 1000 }),
    ];
    const { POST } = await import(modulePath);
    const req = makeReq(url, {
      tool: "write_file",
      args: { path: "C:\\Users\\rei\\notes.txt" },
      approvalToken: "appr_1",
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(runDiskToolMock).not.toHaveBeenCalled();
  });

  it("refuses an approval already consumed — cannot replay it for a second execution", async () => {
    dbState.pendingApprovals = [baseApproval({ result: { consumedAt: Date.now() - 1000 } })];
    const { POST } = await import(modulePath);
    const req = makeReq(url, {
      tool: "write_file",
      args: { path: "C:\\Users\\rei\\notes.txt" },
      approvalToken: "appr_1",
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(runDiskToolMock).not.toHaveBeenCalled();
  });

  it("accepts a fresh, approved, matching, unconsumed approval exactly once", async () => {
    dbState.pendingApprovals = [baseApproval()];
    const { POST } = await import(modulePath);
    const req = makeReq(url, {
      tool: "write_file",
      args: { path: "C:\\Users\\rei\\notes.txt" },
      approvalToken: "appr_1",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(runDiskToolMock).toHaveBeenCalledTimes(1);

    // The approval must now be marked consumed so this exact request can't
    // be replayed a second time with the same token.
    expect(dbState.pendingApprovals[0].result?.consumedAt).toBeTruthy();
  });

  it("second execution attempt with the same now-consumed token is refused", async () => {
    dbState.pendingApprovals = [baseApproval()];
    const { POST } = await import(modulePath);
    const req1 = makeReq(url, {
      tool: "write_file",
      args: { path: "C:\\Users\\rei\\notes.txt" },
      approvalToken: "appr_1",
    });
    const firstRes = await POST(req1);
    expect(firstRes.status).toBe(200);

    const req2 = makeReq(url, {
      tool: "write_file",
      args: { path: "C:\\Users\\rei\\notes.txt" },
      approvalToken: "appr_1",
    });
    const secondRes = await POST(req2);
    expect(secondRes.status).toBe(403);
    // Only the first request's execution should have reached runDiskTool.
    expect(runDiskToolMock).toHaveBeenCalledTimes(1);
  });

  it("non-mutating tools (e.g. read_file) never require an approval", async () => {
    const { POST } = await import(modulePath);
    const req = makeReq(url, { tool: "read_file", args: { path: "C:\\Users\\rei\\notes.txt" } });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(runDiskToolMock).toHaveBeenCalledTimes(1);
  });
});

// Source restriction is specific to the manual-chat route's threat model
// (see its own comment: an approval must have been issued via "chat", not
// created by/for the agent flow) — verified separately since the agent
// route does not implement this restriction.
describe("manual chat route — approval source restriction", () => {
  it("refuses an approval whose source is \"agent\", not \"chat\"", async () => {
    dbState.pendingApprovals = [baseApproval({ source: "agent" })];
    const { POST } = await import("../app/api/tools/execute/route");
    const req = makeReq("http://localhost:3000/api/tools/execute", {
      tool: "write_file",
      args: { path: "C:\\Users\\rei\\notes.txt" },
      approvalToken: "appr_1",
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(runDiskToolMock).not.toHaveBeenCalled();
  });
});
