import { NextRequest, NextResponse } from "next/server";
import path from "path";
import os from "os";
import { runDiskTool } from "@/lib/diskToolOps";

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
// mutating write_file/delete_file calls from this route always go through
// an approval step in the UI first (see app/page.tsx's disk-tool loop) —
// this route itself has no way to know whether that happened, it just
// executes whatever request reaches it.
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

