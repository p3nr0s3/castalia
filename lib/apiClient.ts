/**
 * Shared wrapper for calling this app's own /api/* routes.
 *
 * Why this exists: every internal API route (fs, tools/execute, connectors,
 * db, cloud/chat, audio, search) is protected by middleware.ts, which checks
 * for a bearer token before letting the request through. That token lives in
 * NEXT_PUBLIC_APP_ACCESS_TOKEN (public on purpose — this is a client-side
 * app with no server-rendered secret store, and the token's only job is to
 * stop a request from reaching these routes unless it came from this app's
 * own UI. It is NOT a substitute for not exposing this app publicly).
 *
 * Always call internal API routes through apiFetch (not raw fetch) so the
 * header is never forgotten on a new call site.
 */

function getAccessToken(): string {
  return process.env.NEXT_PUBLIC_APP_ACCESS_TOKEN || "";
}

// Only set by the server-side agent scheduler (lib/agentScheduler.ts). In a browser relative URLs
// resolve against the page; in a Node process they need an absolute base, and the call must carry
// the access token like any other caller. Left empty everywhere else, so nothing else changes.
let serverBaseUrl = "";
let serverToken = "";
export function configureServerApi(baseUrl: string, token = ""): void {
  serverBaseUrl = baseUrl.replace(/\/+$/, "");
  serverToken = token;
}

export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = serverToken || getAccessToken();
  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const target = serverBaseUrl && input.startsWith("/") ? `${serverBaseUrl}${input}` : input;
  return fetch(target, { ...init, headers });
}

/**
 * Appends the access token as a `?token=` query param instead of an
 * Authorization header. Needed for URLs handed directly to native browser
 * elements (`<audio src>`, `<img src>`) — those issue their own GET requests
 * and cannot attach custom headers. middleware.ts only honours `?token=` on the
 * SSE route (/api/db/stream), so this is NOT a general fallback for other routes. Not used for apiFetch calls,
 * which use the (safer, not URL/log-visible) header instead.
 */
export function withAccessToken(url: string): string {
  const token = getAccessToken();
  if (!token) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}
