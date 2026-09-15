import dns from "dns/promises";
import net from "net";

/**
 * SSRF guard for app/api/connectors/route.ts.
 *
 * This route accepts URLs from the request body (webhook URLs, generic
 * endpoints) and fetches them server-side. Without this, the realistic
 * attack path isn't "a stranger curls this route directly" (middleware.ts's
 * bearer token already blocks that) — it's an autonomous agent reading
 * untrusted content (web search results, a RAG'd document) that contains
 * embedded instructions, then deciding on its own to call a connector
 * action with a URL taken from that content. Classic prompt-injection to
 * SSRF chain, not requiring the user's intent at all.
 *
 * Two policies:
 * - `assertPublicUrl`: for webhook_send, connector "test" (slack/discord),
 *   and the generic nocodb/endpoint branch. These should NEVER reach
 *   localhost, link-local, private RFC1918 ranges, or cloud metadata
 *   endpoints — there's no legitimate reason a Slack/Discord/NocoDB URL
 *   the user configured points there, and if content-controlled input got
 *   a URL into this field, that's exactly the case to block.
 * - `assertBlenderUrl`: for blender_execute/blender test. Blender's local
 *   Python bridge is BY DESIGN expected at 127.0.0.1 (or ::1) — that's the
 *   whole point of the feature, so it's allowed. But nothing else is: if
 *   this were unrestricted like the others, "blender" would become a
 *   second, differently-shaped SSRF hole (an attacker-controlled `endpoint`
 *   could point anywhere and this route would happily POST to it).
 *
 * Both resolve the hostname via DNS and check the resulting IP — a
 * hostname check alone doesn't stop DNS rebinding (a domain that resolves
 * to 127.0.0.1 or a metadata IP).
 */

export class SsrfBlockedError extends Error {}

/**
 * Decodes the embedded IPv4 address from an IPv4-mapped IPv6 address
 * ("::ffff:x.x.x.x"). Handles both forms Node can hand back: dotted-quad
 * (what dns.lookup typically returns) and the two-hex-group form that
 * new URL() normalizes a dotted-quad literal to (e.g. "::ffff:7f00:1").
 * Returns null if `ip` isn't an IPv4-mapped IPv6 address.
 */
function mappedIPv4(ip: string): string | null {
  const lower = ip.toLowerCase();
  if (!lower.startsWith("::ffff:")) return null;
  const suffix = lower.slice("::ffff:".length);

  if (net.isIP(suffix) === 4) return suffix;

  const hexGroups = suffix.split(":");
  if (hexGroups.length === 2 && /^[0-9a-f]{1,4}$/.test(hexGroups[0]) && /^[0-9a-f]{1,4}$/.test(hexGroups[1])) {
    const hi = parseInt(hexGroups[0], 16);
    const lo = parseInt(hexGroups[1], 16);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
  }
  return null;
}

function ipIsPrivateOrLocal(ip: string): boolean {
  const kind = net.isIP(ip);

  if (kind === 4) {
    const octets = ip.split(".").map(Number);
    const [a, b] = octets;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 169 && b === 254) return true; // link-local, includes cloud metadata (169.254.169.254)
    if (a === 0) return true; // "this network"
    return false;
  }

  if (kind === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true; // loopback
    if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local (fc00::/7)
    if (lower.startsWith("::ffff:")) {
      // IPv4-mapped IPv6 — check the embedded IPv4 address too.
      const mapped = mappedIPv4(lower);
      if (mapped) return ipIsPrivateOrLocal(mapped);
    }
    return false;
  }

  return false; // not a valid IP at all — let the caller's own fetch fail naturally
}

async function resolveAllIps(hostname: string): Promise<string[]> {
  // If it's already a literal IP, no DNS lookup needed.
  // url.hostname keeps the brackets for IPv6 literals (e.g. "[::1]"),
  // which net.isIP() does not recognize — strip them before the IP check
  // so bracketed IPv6 literals are treated as literal IPs (no DNS lookup)
  // instead of falling through to a DNS lookup on the literal string
  // "[::1]", which always fails and would incorrectly block a legitimate
  // IPv6 loopback/LAN URL.
  const bareHostname =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

  if (net.isIP(bareHostname)) return [bareHostname];

  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    return results.map((r) => r.address);
  } catch {
    // Unresolvable hostname — treat as blocked rather than silently letting
    // fetch() try anyway (fetch would fail on its own DNS lookup, but this
    // keeps the error message consistent and avoids a second lookup).
    throw new SsrfBlockedError(`Could not resolve hostname '${hostname}'.`);
  }
}

async function parseAndValidate(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(`'${rawUrl}' is not a valid URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError(`Only http/https URLs are allowed (got '${url.protocol}').`);
  }

  return url;
}

/** For webhook_send, slack/discord test, and the generic nocodb/endpoint branch. No local/private/metadata destinations allowed at all. */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  const url = await parseAndValidate(rawUrl);
  const ips = await resolveAllIps(url.hostname);

  for (const ip of ips) {
    if (ipIsPrivateOrLocal(ip)) {
      throw new SsrfBlockedError(
        `'${rawUrl}' resolves to a private/local address (${ip}). Webhook and endpoint URLs must point to a public host.`
      );
    }
  }
}

/** For blender_execute/blender test. ONLY localhost/loopback is allowed — that's the feature; anything else is refused. */
export async function assertBlenderUrl(rawUrl: string): Promise<void> {
  const url = await parseAndValidate(rawUrl);
  const ips = await resolveAllIps(url.hostname);

  const allLoopback = ips.length > 0 && ips.every((ip) => {
    const kind = net.isIP(ip);
    if (kind === 4) return ip.startsWith("127.");
    if (kind === 6) return ip.toLowerCase() === "::1";
    return false;
  });

  if (!allLoopback) {
    throw new SsrfBlockedError(
      `Blender's bridge must be on localhost (127.0.0.1 or ::1) — '${rawUrl}' does not resolve to loopback. Refusing to connect to a non-local Blender endpoint.`
    );
  }
}

function ipIsLinkLocalOrMetadata(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 169 && b === 254; // covers the 169.254.169.254 cloud metadata address
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true;
    if (lower.startsWith("::ffff:")) {
      const mapped = mappedIPv4(lower);
      if (mapped) return ipIsLinkLocalOrMetadata(mapped);
    }
  }
  return false;
}

/**
 * For the Ollama proxy's `?host=` query param (app/api/ollama/[...path]).
 * This one is deliberately NOT the same as assertPublicUrl: `?host=` is a
 * legitimate, user-configured feature for running Ollama on another
 * machine on the same LAN (settings.ollamaUrl gets passed straight
 * through as this param) — RFC1918 private addresses (192.168.x.x,
 * 10.x.x.x, 172.16-31.x.x) and loopback are expected, normal values here
 * and must stay allowed.
 *
 * What's NOT legitimate is link-local (169.254.x.x, which includes the
 * cloud metadata address 169.254.169.254) — nobody configures their
 * Ollama host to a link-local address on purpose, and an attacker
 * supplying `?host=169.254.169.254` to probe cloud metadata through this
 * proxy is the actual risk being closed here. Arbitrary external hosts
 * are also blocked, same reasoning as assertPublicUrl: this proxy has no
 * legitimate reason to relay to some third party's server.
 */
export async function assertOllamaHostUrl(rawUrl: string): Promise<void> {
  const url = await parseAndValidate(rawUrl);
  const ips = await resolveAllIps(url.hostname);

  for (const ip of ips) {
    if (ipIsLinkLocalOrMetadata(ip)) {
      throw new SsrfBlockedError(
        `'${rawUrl}' resolves to a link-local/metadata address (${ip}). Refusing to proxy to it.`
      );
    }
  }
}
