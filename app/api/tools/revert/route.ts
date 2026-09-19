import { NextRequest, NextResponse } from "next/server";
import path from "path";
import os from "os";
import { runDiskTool } from "@/lib/diskToolOps";
import { resolveOnLocalDisk, resolveWithinBase } from "@/lib/pathSandbox";
import { readServerDb, writeServerDb } from "@/lib/serverDb";
import { PendingApproval } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Undoes an already-executed write_file/delete_file approval by performing
 * the inverse operation, using `previousContent` captured on the approval
 * record at the moment it was created (see lib/agentEngine.ts and
 * app/page.tsx). One-shot: once `reverted` is set on the record it can't be
 * reverted again — mirrors the existing `consumedAt` one-shot pattern on
 * /api/tools/execute and /api/tools/execute-agent.
 *
 * The critical safety property this route enforces: it refuses to revert
 * if the file's *current* on-disk content no longer matches what the
 * original action wrote. Without that check, reverting an action from
 * (say) an hour ago would silently clobber any legitimate edit made to the
 * same file in between — a data-loss bug that would be invisible until
 * the user noticed their newer changes were gone. When the check fails,
 * this route refuses and reports it rather than guessing.
 */

const HOME_DIR = path.resolve(os.homedir());
function resolveWithinHome(inputPath?: string): string {
  return resolveWithinBase(HOME_DIR, inputPath);
}

const REVERTIBLE_TOOLS = new Set(["write_file", "delete_file"]);

function resolverFor(approval: PendingApproval): (inputPath?: string) => string {
  // Mirrors the sandboxing boundary each source is executed under: chat
  // approvals ran through /api/tools/execute (whole disk minus an
  // OS-critical denylist), agent approvals through /api/tools/execute-agent
  // (sandboxed to the home directory). Reverting must resolve the path
  // under the SAME rule the original action did.
  return approval.source === "agent" ? resolveWithinHome : resolveOnLocalDisk;
}

/** Reads a file's current content, or `undefined` if it doesn't exist / can't be read. */
async function tryReadCurrent(filePath: string, resolvePath: (p?: string) => string): Promise<string | undefined> {
  try {
    const result = await runDiskTool("read_file", { path: filePath }, resolvePath);
    if (result.body?.success) return result.body.content as string;
    return undefined;
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { approvalId } = body;

    if (!approvalId || typeof approvalId !== "string") {
      return NextResponse.json({ success: false, error: "Missing required 'approvalId'." }, { status: 400 });
    }

    const db = await readServerDb();
    const approval = db.pendingApprovals.find((a) => a.id === approvalId);

    if (!approval) {
      return NextResponse.json({ success: false, error: `Unknown approval id '${approvalId}'.` }, { status: 404 });
    }
    if (approval.status !== "approved") {
      return NextResponse.json(
        { success: false, error: `Approval '${approvalId}' was never approved (status: ${approval.status}) — nothing to revert.` },
        { status: 409 }
      );
    }
    if (!REVERTIBLE_TOOLS.has(approval.toolName)) {
      return NextResponse.json(
        { success: false, error: `Tool '${approval.toolName}' has no revert action (only write_file/delete_file do).` },
        { status: 400 }
      );
    }
    if (approval.reverted) {
      return NextResponse.json(
        { success: false, error: `Approval '${approvalId}' was already reverted at ${new Date(approval.revertedAt || 0).toLocaleString()}.` },
        { status: 409 }
      );
    }

    const resolvePath = resolverFor(approval);
    const targetPath = approval.args?.path;
    if (typeof targetPath !== "string") {
      return NextResponse.json({ success: false, error: "This approval has no recorded file path to revert." }, { status: 400 });
    }

    if (approval.toolName === "write_file") {
      const writtenContent = typeof approval.args?.content === "string" ? approval.args.content : "";
      const currentContent = await tryReadCurrent(targetPath, resolvePath);

      if (currentContent === undefined || currentContent !== writtenContent) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Refusing to revert: the file's current content no longer matches what this action wrote " +
              "(it's been changed again since, or no longer exists). Reverting automatically would risk " +
              "destroying that newer change. Edit the file manually if you still want the old version back.",
          },
          { status: 409 }
        );
      }

      if (approval.previousContent !== undefined) {
        // This write overwrote an existing file — restore its old content.
        await runDiskTool("write_file", { path: targetPath, content: approval.previousContent }, resolvePath);
      } else {
        // This write created a brand-new file — undo the creation.
        await runDiskTool("delete_file", { path: targetPath }, resolvePath);
      }
    } else {
      // delete_file
      if (approval.previousContent === undefined) {
        return NextResponse.json(
          {
            success: false,
            error: "This deletion's original content was never captured, so there's nothing to restore it from.",
          },
          { status: 409 }
        );
      }

      const currentContent = await tryReadCurrent(targetPath, resolvePath);
      if (currentContent !== undefined) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Refusing to revert: a file already exists at this path again (something else was written here " +
              "after the deletion). Restoring would overwrite it. Resolve manually if you still want the old file back.",
          },
          { status: 409 }
        );
      }

      await runDiskTool("write_file", { path: targetPath, content: approval.previousContent }, resolvePath);
    }

    const revertedApproval: PendingApproval = { ...approval, reverted: true, revertedAt: Date.now() };
    await writeServerDb({ pendingApprovals: [revertedApproval] });

    return NextResponse.json({ success: true, message: `Reverted ${approval.toolName} on '${targetPath}'.` });
  } catch (err: any) {
    console.error("[API Tools Revert] Error:", err);
    const isAccessDenied = typeof err?.message === "string" && err.message.startsWith("Access denied");
    return NextResponse.json(
      { success: false, error: err.message || "Failed to revert action." },
      { status: isAccessDenied ? 403 : 500 }
    );
  }
}
