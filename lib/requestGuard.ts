/**
 * Pure request-validation helpers used by middleware.ts.
 *
 * IMPORTANT: middleware runs on the Edge runtime. Nothing in this file may
 * import Node built-ins (crypto, net, buffer, ...) — `timingSafeEqual` from
 * "crypto" used to live in middleware.ts and made EVERY authenticated
 * request fail with HTTP 500 ("The edge runtime does not support Node.js
 * 'crypto' module"). tests/requestGuard.test.ts enforces this statically.
 */

/**
 * Constant-time string comparison using only plain JS. Both inputs are
 * padded to the longer length, so neither content nor length differences
 * short-circuit.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

function parseList(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

// Hosts whose names cannot be attacker-controlled DNS records:
//  - `.localhost` and `.local` (mDNS) never resolve through public DNS,
//  - the Pinggy tunnel domains are operated by Pinggy, not by a web attacker.
const TRUSTED_HOST_SUFFIXES = [".localhost", ".local", ".pinggy.link", ".pinggy.io", ".pinggy.net", ".pinggy-free.link"];

const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * DNS-rebinding defence. A page on evil.example can make the victim's
 * browser resolve evil.example to 127.0.0.1; the browser then treats calls
 * to this app as SAME-ORIGIN (Sec-Fetch-Site: same-origin, and it can read
 * the NEXT_PUBLIC token out of the JS bundle). The one thing it cannot fake
 * is the Host header: it is still "evil.example".
 *
 * Allowed: localhost names, IP literals (no DNS involved, so nothing to
 * rebind), single-label LAN names, mDNS/.localhost names, Pinggy tunnel
 * domains, and anything in ALLOWED_HOSTS (comma-separated; "example.com"
 * exact, ".example.com" / "*.example.com" suffix, "*" disables the check).
 */
export function isAllowedHost(hostHeader: string | null | undefined, allowedHostsEnv: string | undefined = process.env.ALLOWED_HOSTS): boolean {
  if (!hostHeader) return false;
  let hostname: string;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  hostname = hostname.replace(/\.$/, "");
  if (!hostname) return false;

  if (hostname === "localhost") return true;
  if (hostname.startsWith("[")) return true; // IPv6 literal
  if (IPV4_LITERAL.test(hostname)) return true;
  if (!hostname.includes(".")) return true; // single-label LAN hostname
  if (TRUSTED_HOST_SUFFIXES.some((s) => hostname.endsWith(s))) return true;

  for (const entry of parseList(allowedHostsEnv)) {
    if (entry === "*") return true;
    if (entry.startsWith("*.") || entry.startsWith(".")) {
      const suffix = entry.startsWith("*.") ? entry.slice(1) : entry;
      if (hostname.endsWith(suffix) || hostname === suffix.slice(1)) return true;
    } else if (hostname === entry) {
      return true;
    }
  }
  return false;
}

export interface OriginCheckInput {
  secFetchSite: string | null;
  origin: string | null;
  host: string | null;
  allowedExternalOrigin?: string | undefined;
}

/**
 * True if the request is acceptable for a state-changing/sensitive call:
 * it came from this app's own pages (same-origin), from a user-initiated
 * navigation (none), or from a non-browser client (no browser headers at
 * all). `same-site` is deliberately NOT accepted: any other local dev
 * server on another port of the same host is "same-site" to this app.
 */
export function isTrustedOrigin({ secFetchSite, origin, host, allowedExternalOrigin }: OriginCheckInput): boolean {
  if (allowedExternalOrigin && origin && origin === allowedExternalOrigin) return true;
  if (secFetchSite) return secFetchSite === "same-origin" || secFetchSite === "none";
  if (!origin) return true; // curl and other non-browser clients
  try {
    return new URL(origin).host === (host || "");
  } catch {
    return false; // e.g. Origin: null from sandboxed iframes / file://
  }
}
