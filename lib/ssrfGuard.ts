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
      // IPv4-mapped IPv6 — check the embedded IPv4 address too
      const mapped = lower.replace("::ffff:", "");
      if (net.isIP(mapped) === 4) return ipIsPrivateOrLocal(mapped);
    }
    return false;
  }

  return false; // not a valid IP at all — let the caller's own fetch fail naturally
}

async function resolveAllIps(hostname: string): Promise<string[]> {
  // If it's already a literal IP, no DNS lookup needed.
  if (net.isIP(hostname)) return [hostname];

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
