import { NextRequest, NextResponse } from "next/server";
import path from "path";
import os from "os";
import { runDiskTool } from "@/lib/diskToolOps";
import { readServerDb, writeServerDb } from "@/lib/serverDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This route is for manual chat's disk tools. Originally sandboxed to the
// project directory, then widened to the user's home directory, then
// widened again (per explicit user request) to the WHOLE local filesystem —
// any drive, any path, no containment boundary anymore.
//
// The only thing still blocked is a short denylist of OS-critical system
// directories where a stray write_file/delete_file could break the machine
// itself (not the user's data — the operating system). This is not a
// security sandbox; it does not protect user files, other users' accounts,
// or anything else. It exists purely so a bad tool call can't brick Windows.
//
// mutating write_file/delete_file calls require approvalToken naming a
// PendingApproval record that is ACTUALLY status "approved" in the server
// DB (source: "chat"), for this exact tool+path, resolved recently, and not
// already consumed — verified against lib/serverDb.ts, not just "some
// token was present". Mirrors the same check in execute-agent/route.ts.
const DENYLISTED_ROOTS = [
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
  "/etc",
  "/boot",
].map((p) => path.normalize(p).toLowerCase());

function resolveSafePath(inputPath?: string): string {
  if (!inputPath || inputPath.trim() === "" || inputPath === ".") {
    return path.resolve(os.homedir());
  }

  const resolved = path.resolve(inputPath);
  const normalizedLower = path.normalize(resolved).toLowerCase();

  const hitsDenylist = DENYLISTED_ROOTS.some(
    (root) => normalizedLower === root || normalizedLower.startsWith(root + path.sep)
  );
  if (hitsDenylist) {
    throw new Error(
      `Access denied: '${resolved}' is inside a protected OS system directory. Disk tools cannot touch Windows/Program Files/system folders.`
    );
  }

  return resolved;
}

const MUTATING_TOOLS = new Set(["write_file", "delete_file"]);
const APPROVAL_FRESHNESS_MS = 5 * 60 * 1000;

function argsMatch(a: Record<string, any>, b: Record<string, any>): boolean {
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

      if (approval.source !== "chat") {
        return NextResponse.json(
          { success: false, tool, error: `Approval '${approvalToken}' was not issued for manual chat. Refusing to execute.` },
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
            error: `Approval '${approvalToken}' does not match this request. Refusing to execute.`,
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

      const consumedApproval = { ...approval, result: { ...(approval.result || {}), consumedAt: Date.now() } };
      await writeServerDb({ pendingApprovals: [consumedApproval] });
    }

    const { status, body: resultBody } = await runDiskTool(tool, args, resolveSafePath);
    return NextResponse.json(resultBody, { status });
  } catch (err: any) {
    console.error("[API Tools Execute] Error:", err);
    const isAccessDenied = typeof err?.message === "string" && err.message.startsWith("Access denied");
    return NextResponse.json(
      { success: false, error: err.message || "Failed to execute filesystem tool." },
      { status: isAccessDenied ? 403 : 200 }
    );
  }
}

