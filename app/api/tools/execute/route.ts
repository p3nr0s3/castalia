import { NextRequest, NextResponse } from "next/server";
import path from "path";
import os from "os";
import { runDiskTool } from "@/lib/diskToolOps";
import { resolveWithinBase } from "@/lib/pathSandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This route is for manual chat's disk tools. Originally sandboxed to the
// project directory; widened to the user's home directory on request so
// manual chat can browse/read/write outside the project folder, matching
// the scope /api/fs and /api/tools/execute-agent already use.
const BASE_DIR = path.resolve(os.homedir());

function resolveSafePath(inputPath?: string): string {
  return resolveWithinBase(BASE_DIR, inputPath);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool, args = {} } = body;

    if (!tool) {
      return NextResponse.json({ success: false, error: "Missing 'tool' parameter in request body." }, { status: 400 });
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
