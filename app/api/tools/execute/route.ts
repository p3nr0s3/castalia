import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { runDiskTool } from "@/lib/diskToolOps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This route is for manual chat's disk tools — sandboxed to the project
// directory. Agents use /api/tools/execute-agent instead, which is
// sandboxed to the home directory and adds an approval gate for
// write_file/delete_file.
const BASE_DIR = path.resolve(process.cwd());

function resolveSafePath(inputPath?: string): string {
  if (!inputPath || inputPath.trim() === "" || inputPath === ".") {
    return BASE_DIR;
  }

  let resolvedPath = path.resolve(BASE_DIR, inputPath);

  const normalizedBase = path.normalize(BASE_DIR);
  const normalizedResolved = path.normalize(resolvedPath);

  if (!normalizedResolved.startsWith(normalizedBase)) {
    throw new Error(`Path traversal detected: The resolved path '${inputPath}' (normalized: ${normalizedResolved}) falls outside the safe base directory (${normalizedBase}).`);
  }

  return resolvedPath;
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
    return NextResponse.json({
      success: false,
      error: err.message || "Failed to execute filesystem tool.",
    });
  }
}
