import { NextRequest, NextResponse } from "next/server";
import { runDiskTool } from "@/lib/diskToolOps";
import { resolveOnLocalDisk } from "@/lib/pathSandbox";
import { MUTATING_TOOLS, authorizeMutatingTool } from "@/lib/toolApproval";
import { explainSymbol, queryGraph, pathBetween, GraphifyError } from "@/lib/graphifyOps";

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
// Denylist + resolver now live in lib/pathSandbox.ts (resolveOnLocalDisk) so
// app/api/tools/revert/route.ts can resolve chat-sourced paths under the
// exact same rules without a second copy of the OS-critical-directories list.
const resolveSafePath = resolveOnLocalDisk;


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool, args = {}, approvalToken } = body;

    if (!tool) {
      return NextResponse.json({ success: false, error: "Missing 'tool' parameter in request body." }, { status: 400 });
    }

    if (MUTATING_TOOLS.has(tool)) {
      const auth = await authorizeMutatingTool({
        tool,
        args,
        approvalToken,
        expectedSource: "chat",
        sourceLabel: "manual chat",
      });
      if (!auth.ok) {
        return NextResponse.json({ success: false, tool, error: auth.error }, { status: auth.status });
      }
    }

    // Graphify tools answer questions about THIS project's own codebase via a
    // local code graph — read-only, no path resolution / disk sandbox involved,
    // so they're dispatched here rather than inside runDiskTool.
    if (tool === "graphify_explain" || tool === "graphify_query" || tool === "graphify_path") {
      try {
        let output: string;
        if (tool === "graphify_explain") {
          output = await explainSymbol(String(args.symbol ?? ""));
        } else if (tool === "graphify_query") {
          output = await queryGraph(String(args.question ?? ""));
        } else {
          output = await pathBetween(String(args.from ?? ""), String(args.to ?? ""));
        }
        return NextResponse.json({ success: true, tool, output });
      } catch (graphifyErr: any) {
        const message = graphifyErr instanceof GraphifyError ? graphifyErr.message : `Graphify tool failed: ${graphifyErr.message || graphifyErr}`;
        return NextResponse.json({ success: false, tool, error: message }, { status: 200 });
      }
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

