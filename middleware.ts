import { NextRequest, NextResponse } from "next/server";

/**
 * Gate for every /api/* route in this app.
 *
 * This app has no user accounts — it's a single-user local tool. But several
 * routes are dangerous if reachable by anyone other than the person running
 * this instance: /api/fs (reads anywhere under $HOME), /api/tools/execute
 * (writes files, can shell out to connectors like Blender), /api/connectors,
 * /api/db, /api/cloud/chat (forwards your cloud API keys), the Ollama
 * proxy (lets a caller run arbitrary prompts against your local models),
 * and /api/codespace/run (spawns a real child process — Python/Node/
 * PowerShell/bash — on the host with the request body as the script).
 *
 * TWO INDEPENDENT LAYERS, because they close different gaps:
 *
 * 1. Bearer token (APP_ACCESS_TOKEN) — makes sure a request came from this
 *    app's own frontend, not from anyone who stumbles onto the URL. Its
 *    weakness: if APP_ACCESS_TOKEN is unset (the default when running
 *    `npm run dev` without a .env.local), this layer does nothing at all —
 *    see the "no token configured" branch below.
 *
 * 2. Cross-site request rejection (Sec-Fetch-Site / Origin) — a THIRD
 *    PARTY WEBSITE the user has open in another tab cannot get a form
 *    submission or fetch() through to this server, EVEN IF no token is
 *    configured. This is what actually stops the realistic attack: some
 *    other site the user visits while `npm run dev` is running submits a
 *    cross-site POST to http://127.0.0.1:3000/api/codespace/run with
 *    PowerShell/bash code as the payload — classic CSRF, except the
 *    "action" here is arbitrary code execution on the visitor's own
 *    machine, not a bank transfer. `Sec-Fetch-Site` is set by the browser
 *    itself on every fetch/navigation and cannot be forged by page
 *    JavaScript, so it's a real signal even when layer 1 is fully open.
 *
 * DANGEROUS_ROUTES gets layer 2 unconditionally — regardless of whether
 * APP_ACCESS_TOKEN is set — because the CSRF risk exists either way; the
 * token being configured only adds a second requirement on top, it
 * doesn't substitute for origin-checking. Every other /api/* route still
 * gets layer 1 only, same as before.
 *
 * Set APP_ACCESS_TOKEN in .env.local (server-side check) and
 * NEXT_PUBLIC_APP_ACCESS_TOKEN with the SAME value (so the browser client in
 * lib/apiClient.ts can send it). If APP_ACCESS_TOKEN is unset, the app falls
 * back to open access for layer 1 — this keeps local dev friction-free
 * without a token configured, but means you MUST set it before ever using
 * scripts/tunnel.mjs to expose the app publicly.
 *
 * /api/db/stream is a special case: it is loaded by
 * EventSource, which cannot attach an Authorization header. For this route only, a
 * `?token=` query param is accepted as an equivalent credential
 * (lib/apiClient.ts's withAccessToken() appends it). Every other route
 * only accepts the header.
 */

const UNPROTECTED_METHODS = new Set(["OPTIONS"]);
const QUERY_TOKEN_ROUTES = ["/api/db/stream"];

// Routes where a successful request means arbitrary code execution or a
// filesystem write on the host — these get CSRF protection unconditionally,
// not just when a bearer token happens to be configured.
const DANGEROUS_ROUTES = [
  "/api/codespace/run",
  "/api/tools/execute",
  "/api/tools/execute-agent",
  "/api/fs",
];

function isCrossSiteRequest(req: NextRequest): boolean {
  // Sec-Fetch-Site is set by the browser on every request and cannot be
  // set/overridden by page JavaScript — "cross-site" here means the request
  // originated from a different site than this server, which is exactly
  // the CSRF shape (some other open tab submitting to this app).
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite) {
    return secFetchSite === "cross-site";
  }

  // Older browsers / non-fetch clients (curl, some webviews) don't send
  // Sec-Fetch-Site at all. Fall back to comparing Origin against Host —
  // if there's no Origin header either, this is a same-origin navigation
  // or a non-browser client (curl without a spoofed Origin), not treated
  // as cross-site since the whole point is stopping BROWSER-based CSRF.
  const origin = req.headers.get("origin");
  if (!origin) return false;

  try {
    const originHost = new URL(origin).host;
    const requestHost = req.headers.get("host") || "";
    return originHost !== requestHost;
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
  if (UNPROTECTED_METHODS.has(req.method)) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  const isDangerousRoute = DANGEROUS_ROUTES.some((route) => pathname.startsWith(route));

  // Layer 2: unconditional cross-site rejection for dangerous routes, runs
  // BEFORE the token check so it also applies when no token is configured.
  if (isDangerousRoute && isCrossSiteRequest(req)) {
    return NextResponse.json(
      { error: "Forbidden: cross-site requests to this endpoint are rejected." },
      { status: 403 }
    );
  }

  const requiredToken = process.env.APP_ACCESS_TOKEN;

  // No token configured: local dev with nothing at stake yet. Allow through,
  // but this is the exact gap that must be closed before using the tunnel.
  if (!requiredToken) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const { searchParams } = req.nextUrl;
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
