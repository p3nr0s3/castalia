import { NextResponse } from "next/server";
import { getCorsHeaders } from "@/lib/corsHeaders";
import { detectBsk } from "@/lib/browserSkillBridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = getCorsHeaders();

/**
 * GET /api/browser/status -> { installed, command?, version? }
 *
 * Read-only availability check for the BrowserSkill (`bsk`) CLI — see
 * lib/browserSkillBridge.ts for why this is a separate, CLI-based check
 * rather than the fetch()-based liveness test lib/localAppBridge.ts uses
 * for the Blender MCP bridge. This route deliberately does nothing else
 * yet: no browser action is wired up here, only "is the CLI on this
 * machine at all" — enough for the Directory/Connectors UI to show an
 * accurate installed/not-installed state instead of guessing.
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const status = await detectBsk();
    return NextResponse.json(status, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { installed: false, error: err?.message || "Failed to check BrowserSkill (bsk) availability." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
