import net from "net";

/**
 * IP classification helpers shared by lib/ssrfGuard.ts and lib/safeFetch.ts.
 *
 * `isPublicIp` is deliberately an ALLOW-list ("is this globally routable
 * unicast?") rather than a deny-list of a few known-private ranges: every
 * special-purpose block we forgot to list (CGNAT, multicast, "::", NAT64,
 * 6to4, documentation ranges, ...) is then blocked by default.
 */

function stripBrackets(ip: string): string {
  return ip.startsWith("[") && ip.endsWith("]") ? ip.slice(1, -1) : ip;
}

/** Parses an IPv6 literal into 8 16-bit groups, or null if it isn't valid IPv6. */
export function parseIPv6(input: string): number[] | null {
  let ip = stripBrackets(input.trim().toLowerCase());
  const zone = ip.indexOf("%");
  if (zone !== -1) ip = ip.slice(0, zone);
  if (net.isIP(ip) !== 6) return null;

  let v4Groups: number[] | null = null;
  const lastColon = ip.lastIndexOf(":");
  const tail = ip.slice(lastColon + 1);
  if (tail.includes(".")) {
    const o = tail.split(".").map(Number);
    v4Groups = [(o[0] << 8) | o[1], (o[2] << 8) | o[3]];
    ip = ip.slice(0, lastColon + 1) + "0:0";
  }

  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;

  const groups = [...head, ...Array(fill).fill("0"), ...rest].map((g) => parseInt(g, 16));
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g))) return null;
  if (v4Groups) {
    groups[6] = v4Groups[0];
    groups[7] = v4Groups[1];
  }
  return groups;
}

function v4FromGroups(hi: number, lo: number): string {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
}

/** If `g` is an IPv4-mapped IPv6 address (::ffff:a.b.c.d), returns the embedded IPv4. */
function mappedV4(g: number[]): string | null {
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4FromGroups(g[6], g[7]);
  return null;
}

function isPublicIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return false; // "this network", RFC1918, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT (also Tailscale)
  if (a === 169 && b === 254) return false; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // RFC1918
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF protocol / TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay anycast
  if (a === 192 && b === 168) return false; // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/** True only for globally-routable unicast addresses. Anything unparsable is NOT public. */
export function isPublicIp(rawIp: string): boolean {
  const ip = stripBrackets(rawIp);
  const kind = net.isIP(ip.split("%")[0]);
  if (kind === 4) return isPublicIPv4(ip);
  if (kind !== 6) return false;

  const g = parseIPv6(ip);
  if (!g) return false;

  const mapped = mappedV4(g);
  if (mapped) return isPublicIPv4(mapped);
  if (g.slice(0, 6).every((x) => x === 0)) return false; // "::", "::1", deprecated IPv4-compatible
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isPublicIPv4(v4FromGroups(g[6], g[7])); // NAT64 well-known prefix
  }
  if (g[0] === 0x2002) return isPublicIPv4(v4FromGroups(g[1], g[2])); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return false; // Teredo
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  return (g[0] & 0xe000) === 0x2000; // only 2000::/3 is global unicast
}

export function isLoopbackIp(rawIp: string): boolean {
  const ip = stripBrackets(rawIp);
  const kind = net.isIP(ip.split("%")[0]);
  if (kind === 4) return ip.startsWith("127.");
  if (kind !== 6) return false;
  const g = parseIPv6(ip);
  if (!g) return false;
  const mapped = mappedV4(g);
  if (mapped) return mapped.startsWith("127.");
  return g.slice(0, 7).every((x) => x === 0) && g[7] === 1;
}

export function isLinkLocalIp(rawIp: string): boolean {
  const ip = stripBrackets(rawIp);
  const kind = net.isIP(ip.split("%")[0]);
  if (kind === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 169 && b === 254;
  }
  if (kind !== 6) return false;
  const g = parseIPv6(ip);
  if (!g) return false;
  const mapped = mappedV4(g);
  if (mapped) return isLinkLocalIp(mapped);
  return (g[0] & 0xffc0) === 0xfe80; // fe80::/10 (fe80–febf)
}
