import { ToolExecuteSchema } from "@/lib/schemas";
import { parseJsonBody } from "@/lib/routeValidation";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import os from "os";
import { runDiskTool } from "@/lib/diskToolOps";
import { resolveWithinHomeSafe } from "@/lib/pathSandbox";
import { MUTATING_TOOLS, authorizeMutatingTool } from "@/lib/toolApproval";

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
  return resolveWithinHomeSafe(inputPath, HOME_DIR);
}



export async function POST(req: NextRequest) {
  try {
    const parsed = await parseJsonBody(req, ToolExecuteSchema, {
      maxBytes: 12 * 1024 * 1024, // write_file carries whole file contents
      prefixPath: false,
      errorShape: (message) => ({ success: false, error: message }),
    });
    if (!parsed.ok) return parsed.response;
    const { tool, args, approvalToken } = parsed.data;

    if (MUTATING_TOOLS.has(tool)) {
      const auth = await authorizeMutatingTool({
        tool,
        args,
        approvalToken,
        expectedSource: "agent",
        sourceLabel: "an agent run",
      });
      if (!auth.ok) {
        return NextResponse.json({ success: false, tool, error: auth.error }, { status: auth.status });
      }
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
