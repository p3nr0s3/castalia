/**
 * CORS headers for API routes that used to hard-code
 * "Access-Control-Allow-Origin: *".
 *
 * This app's own frontend calls these routes same-origin, which needs no
 * CORS headers at all. A wildcard origin instead let ANY website open in
 * the user's browser call these routes cross-origin and read the response
 * — combined with middleware.ts falling back to open access when
 * APP_ACCESS_TOKEN is unset, that's a "drive-by localhost" exposure path
 * (a malicious page the user visits can reach http://127.0.0.1:3000/api/...
 * from JS and read what comes back).
 *
 * Default is now no CORS headers (cross-origin calls are blocked by the
 * browser). Set ALLOW_EXTERNAL_ORIGIN in .env.local to a specific origin
 * (e.g. a companion app on another device) to opt back in deliberately.
 */
export function getCorsHeaders(): Record<string, string> {
  const allowedOrigin = process.env.ALLOW_EXTERNAL_ORIGIN;
  if (!allowedOrigin) return {};

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    Vary: "Origin",
  };
}
