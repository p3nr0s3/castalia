import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqual, isAllowedHost, isTrustedOrigin } from "@/lib/requestGuard";

/**
 * Gate for this app's HTTP surface. Three independent layers, because they
 * close different gaps (a single-user local tool still gets attacked by
 * OTHER websites the user has open, not just by other machines):
 *
 * 1. Host allow-list (all paths) — stops DNS rebinding. See isAllowedHost.
 *    Without it, any website can make the browser treat this app as
 *    same-origin and read the NEXT_PUBLIC token out of the JS bundle, so
 *    layers 2 and 3 would both be bypassed.
 *
 * 2. Same-origin requirement (sensitive routes, and every state-changing
 *    method on any /api route) — stops classic CSRF. Uses Sec-Fetch-Site
 *    (set by the browser, unforgeable by page JS) and falls back to
 *    Origin-vs-Host. Only `same-origin` / `none` pass; `same-site` does not.
 *
 * 3. Bearer token (APP_ACCESS_TOKEN) — keeps non-browser callers out when
 *    the port is reachable by other machines. If APP_ACCESS_TOKEN is unset
 *    this layer is OFF (local dev); set it before using `npm run tunnel` or
 *    any *:lan script. Layers 1–2 still apply either way.
 *
 * /api/db/stream is loaded by EventSource, which cannot attach an
 * Authorization header, so for that route only a `?token=` query param is
 * accepted as an equivalent credential (lib/apiClient.ts withAccessToken()).
 *
 * Middleware runs on the Edge runtime: no Node built-ins here or in
 * lib/requestGuard.ts (they made every authenticated request return 500).
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const QUERY_TOKEN_ROUTES = ["/api/db/stream"];

// Routes where even a cross-site READ/probe is unwanted: they expose the
// filesystem, the database, or execute sensitive tools. Same-origin is required for
// every method, not just mutating ones.
const SENSITIVE_ROUTES = ["/api/tools", "/api/fs", "/api/db", "/api/connectors"];

function forbidden(pathname: string, message: string): NextResponse {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: message }, { status: 403 });
  }
  return new NextResponse(message, { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host");

  // Layer 1
  if (!isAllowedHost(host)) {
    return forbidden(
      pathname,
      "Forbidden: unexpected Host header. If you deliberately serve this app under another hostname, add it to ALLOWED_HOSTS in .env.local."
    );
  }

  // Pages only need the Host check; everything below is for the API.
  if (!pathname.startsWith("/api/")) return NextResponse.next();
  if (req.method === "OPTIONS") return NextResponse.next();

  // Layer 2
  const needsSameOrigin =
    !SAFE_METHODS.has(req.method) || SENSITIVE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  if (
    needsSameOrigin &&
    !isTrustedOrigin({
      secFetchSite: req.headers.get("sec-fetch-site"),
      origin: req.headers.get("origin"),
      host,
      allowedExternalOrigin: process.env.ALLOW_EXTERNAL_ORIGIN || undefined,
    })
  ) {
    return forbidden(pathname, "Forbidden: cross-site requests to this endpoint are rejected.");
  }

  // Layer 3
  const requiredToken = process.env.APP_ACCESS_TOKEN;
  if (!requiredToken) return NextResponse.next();

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const allowsQueryToken = QUERY_TOKEN_ROUTES.some((route) => pathname.startsWith(route));
  const queryToken = allowsQueryToken ? req.nextUrl.searchParams.get("token") || "" : "";
  const providedToken = headerToken || queryToken;

  if (!constantTimeEqual(providedToken, requiredToken)) {
    return NextResponse.json({ error: "Unauthorized: missing or invalid access token." }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  // Everything except static assets: pages need the Host check too (they
  // serve the bundle that embeds NEXT_PUBLIC_APP_ACCESS_TOKEN).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
