import { NextRequest, NextResponse } from "next/server";
import path from "path";
import os from "os";
import { runDiskTool } from "@/lib/diskToolOps";
import { resolveWithinBase } from "@/lib/pathSandbox";
import { readServerDb, writeServerDb } from "@/lib/serverDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Disk tool execution for autonomous agents. Unlike /api/tools/execute
 * (sandboxed to the project directory for manual chat), this is sandboxed
 * to the user's home directory — agents were explicitly asked to operate
 * across the whole disk, not just this project.
 *
 * The wider blast radius is why this route enforces something the manual
 * chat route doesn't need to: write_file and delete_file are refused here
 * outright unless approvalToken names a PendingApproval record that is
 * ACTUALLY status "approved" in the server DB, for THIS exact tool+args,
 * and hasn't already been consumed. This is a real check against
 * persisted state (via lib/serverDb.ts), not a presence-only check — a
 * bug in the caller (or a direct curl call with a made-up token) cannot
 * get a write/delete through.
 *
 * The approval is marked "consumed" (result field set) immediately after
 * a successful check, in the same request, so the same approval id can't
 * be replayed for a second execution.
 */

const HOME_DIR = path.resolve(os.homedir());

function resolveWithinHome(inputPath?: string): string {
  return resolveWithinBase(HOME_DIR, inputPath);
}

const MUTATING_TOOLS = new Set(["write_file", "delete_file"]);

// Consider an approval usable only within this window of being resolved —
// stops an old approved-but-forgotten record from being replayed much later
// against a since-changed file. 5 minutes is generous for a human clicking
// Approve and the agent resuming right after, per the pause/resume design.
const APPROVAL_FRESHNESS_MS = 5 * 60 * 1000;

function argsMatch(a: Record<string, any>, b: Record<string, any>): boolean {
  // Compare only the fields that matter for identifying "the same request" —
  // path is the security-relevant one. Content is intentionally excluded so
  // this doesn't break if content was re-serialized with different
  // whitespace; path is what determines blast radius.
  return (a?.path ?? null) === (b?.path ?? null);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool, args = {}, approvalToken } = body;

    if (!tool) {
      return NextResponse.json({ success: false, error: "Missing 'tool' parameter in request body." }, { status: 400 });
    }

    if (MUTATING_TOOLS.has(tool)) {
      if (!approvalToken) {
        return NextResponse.json(
          {
            success: false,
            tool,
            error: `Tool '${tool}' requires a resolved approval before execution. This route will not run it without an approvalToken.`,
          },
          { status: 403 }
        );
      }

      const db = await readServerDb();
      const approval = db.pendingApprovals.find((a) => a.id === approvalToken);

      if (!approval) {
        return NextResponse.json(
          { success: false, tool, error: `Unknown approval id '${approvalToken}'. Refusing to execute.` },
          { status: 403 }
        );
      }

      if (approval.source !== "agent") {
        return NextResponse.json(
          { success: false, tool, error: `Approval '${approvalToken}' was not issued for an agent run. Refusing to execute.` },
          { status: 403 }
        );
      }

      if (approval.status !== "approved") {
        return NextResponse.json(
          {
            success: false,
            tool,
            error: `Approval '${approvalToken}' is not approved (status: ${approval.status}). Refusing to execute.`,
          },
          { status: 403 }
        );
      }

      if (approval.toolName !== tool || !argsMatch(approval.args, args)) {
        return NextResponse.json(
          {
            success: false,
            tool,
            error: `Approval '${approvalToken}' does not match this request (approved for ${approval.toolName} on a different target). Refusing to execute.`,
          },
          { status: 403 }
        );
      }

      const resolvedAt = approval.resolvedAt ?? approval.createdAt;
      if (Date.now() - resolvedAt > APPROVAL_FRESHNESS_MS) {
        return NextResponse.json(
          { success: false, tool, error: `Approval '${approvalToken}' has expired. Ask the user to approve again.` },
          { status: 403 }
        );
      }

      if (approval.result?.consumedAt) {
        return NextResponse.json(
          { success: false, tool, error: `Approval '${approvalToken}' was already used and cannot be replayed.` },
          { status: 403 }
        );
      }

      // Mark consumed before executing — if the write below fails, the
      // approval is still burned rather than reusable, which is the safer
      // failure direction for a one-shot authorization.
      const consumedApproval = { ...approval, result: { ...(approval.result || {}), consumedAt: Date.now() } };
      await writeServerDb({ pendingApprovals: [consumedApproval] });
    }

    const { status, body: resultBody } = await runDiskTool(tool, args, resolveWithinHome);
    return NextResponse.json(resultBody, { status });
  } catch (err: any) {
    console.error("[API Tools Execute Agent] Error:", err);
    const isAccessDenied = typeof err?.message === "string" && err.message.startsWith("Access denied");
    return NextResponse.json(
      { success: false, error: err.message || "Failed to execute filesystem tool." },
      { status: isAccessDenied ? 403 : 500 }
    );
  }
}
