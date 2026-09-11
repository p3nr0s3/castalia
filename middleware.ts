import { NextRequest, NextResponse } from "next/server";

/**
 * Gate for every /api/* route in this app.
 *
 * This app has no user accounts — it's a single-user local tool. But several
 * routes are dangerous if reachable by anyone other than the person running
 * this instance: /api/fs (reads anywhere under $HOME), /api/tools/execute
 * (writes files, can shell out to connectors like Blender), /api/connectors,
 * /api/db, /api/cloud/chat (forwards your cloud API keys), and the Ollama
 * proxy (lets a caller run arbitrary prompts against your local models).
 *
 * The check here is a shared static token, not real auth — its only purpose
 * is to make sure a request reaching these routes actually came from this
 * app's own frontend, not from anyone who stumbles onto the URL (this
 * matters most when scripts/tunnel.mjs is exposing the app publicly).
 *
 * Set APP_ACCESS_TOKEN in .env.local (server-side check) and
 * NEXT_PUBLIC_APP_ACCESS_TOKEN with the SAME value (so the browser client in
 * lib/apiClient.ts can send it). If APP_ACCESS_TOKEN is unset, the app falls
 * back to open access — this keeps local dev friction-free without a token
 * configured, but means you MUST set it before ever running the tunnel.
 *
 * /api/audio is a special case: it's loaded by native <audio>/<img> elements
 * (MusicPlayerWidget), which issue their own GET requests and cannot attach
 * an Authorization header. For this route only, a `?token=` query param is
 * accepted as an equivalent credential (lib/apiClient.ts's withAccessToken()
 * appends it). Every other route only accepts the header.
 */

const UNPROTECTED_METHODS = new Set(["OPTIONS"]);
const QUERY_TOKEN_ROUTES = ["/api/audio"];

export function middleware(req: NextRequest) {
  if (UNPROTECTED_METHODS.has(req.method)) {
    return NextResponse.next();
  }

  const requiredToken = process.env.APP_ACCESS_TOKEN;

  // No token configured: local dev with nothing at stake yet. Allow through,
  // but this is the exact gap that must be closed before using the tunnel.
  if (!requiredToken) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const { pathname, searchParams } = req.nextUrl;
  const allowsQueryToken = QUERY_TOKEN_ROUTES.some((route) => pathname.startsWith(route));
  const queryToken = allowsQueryToken ? searchParams.get("token") || "" : "";

  const providedToken = headerToken || queryToken;

  if (providedToken !== requiredToken) {
    return NextResponse.json(
      { error: "Unauthorized: missing or invalid access token." },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
