import { NextRequest, NextResponse } from "next/server";
import path from "path";
import os from "os";
import { runDiskTool } from "@/lib/diskToolOps";
import { resolveWithinBase } from "@/lib/pathSandbox";

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
 * outright. The approval gate lives in the CALLER (lib/agentEngine.ts) —
 * by the time a request reaches this route with a mutating tool, it must
 * already have been through the user's explicit approval. This route
 * re-checks and refuses mutating tools unless the request carries an
 * approval token proving that happened, so a bug in the caller's approval
 * logic can't silently turn into an unapproved write.
 */

const HOME_DIR = path.resolve(os.homedir());

function resolveWithinHome(inputPath?: string): string {
  return resolveWithinBase(HOME_DIR, inputPath);
}

const MUTATING_TOOLS = new Set(["write_file", "delete_file"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool, args = {}, approvalToken } = body;

    if (!tool) {
      return NextResponse.json({ success: false, error: "Missing 'tool' parameter in request body." }, { status: 400 });
    }

    if (MUTATING_TOOLS.has(tool)) {
      // approvalToken must be the id of an approval record the caller has
      // already confirmed is status "approved" — this route can't verify
      // that itself (approvals live in client-side state/db.json, not here),
      // so it only checks that SOME token was passed, forcing the caller to
      // go through its approval path rather than calling this directly.
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
