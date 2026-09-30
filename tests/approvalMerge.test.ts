import { describe, it, expect } from "vitest";
import { mergePendingApprovals } from "../lib/serverDb";
import type { PendingApproval } from "../lib/types";

function baseApproval(overrides: Partial<PendingApproval> = {}): PendingApproval {
  const now = Date.now();
  return {
    id: "appr_1",
    source: "chat",
    toolName: "write_file",
    args: { path: "/tmp/notes.txt" },
    status: "approved",
    createdAt: now - 1000,
    resolvedAt: now - 500,
    ...overrides,
  };
}

describe("mergePendingApprovals is monotonic", () => {
  it("a stale client copy cannot un-consume, un-revert, or un-approve a server record", () => {
    const t = Date.now();
    const server = [baseApproval({ resolvedAt: t, result: { consumedAt: t + 5 }, reverted: true, revertedAt: t + 9 })];
    const staleClient = [baseApproval({ resolvedAt: t, status: "approved" })]; // same resolvedAt, no consumedAt
    const merged = mergePendingApprovals(server, staleClient)[0];
    expect(merged.result?.consumedAt).toBe(t + 5);
    expect(merged.reverted).toBe(true);

    const pendingStale = [baseApproval({ status: "pending", resolvedAt: undefined, createdAt: t + 100 })];
    const m2 = mergePendingApprovals([baseApproval({ status: "rejected", resolvedAt: t })], pendingStale)[0];
    expect(m2.status).toBe("rejected");
  });

  it("still lets a genuine pending → approved transition through and adds new records", () => {
    const t = Date.now();
    const out = mergePendingApprovals(
      [baseApproval({ status: "pending", resolvedAt: undefined, createdAt: t - 10 })],
      [baseApproval({ status: "approved", resolvedAt: t }), baseApproval({ id: "appr_2", createdAt: t })]
    );
    expect(out.find((a) => a.id === "appr_1")?.status).toBe("approved");
    expect(out.map((a) => a.id).sort()).toEqual(["appr_1", "appr_2"]);
  });
});
