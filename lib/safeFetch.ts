import http from "http";
import https from "https";
import dns from "dns/promises";
import net from "net";
import zlib from "zlib";
import { Readable, Transform } from "stream";
import { isPublicIp } from "./ipPolicy";
import { SsrfBlockedError } from "./ssrfGuard";

/**
 * fetch() replacement for server-side requests to URLs that are influenced
 * by untrusted input (webhook URLs, scraped pages, scan targets, custom
 * provider endpoints).
 *
 * lib/ssrfGuard.ts's assertPublicUrl() only validates the hostname it is
 * handed once. The subsequent fetch() then (a) resolves DNS AGAIN — a
 * rebinding host can answer "public" the first time and "127.0.0.1" the
 * second — and (b) silently follows redirects, so a public URL can bounce
 * the request to http://169.254.169.254/. safeFetch closes both gaps:
 *
 *  - the hostname is resolved exactly once per hop, every resolved address
 *    is checked against `policy`, and the TCP connection is PINNED to the
 *    validated address (no second lookup);
 *  - redirects are followed manually (max `maxRedirects`), and each hop goes
 *    through the same resolve → check → pin sequence;
 *  - response bodies are capped at `maxBodyBytes`.
 *
 * Only string/Buffer request bodies are supported; that covers every caller.
 */

export type IpPolicy = (ip: string) => boolean;

export interface SafeFetchOptions {
  method?: string;
  headers?: HeadersInit;
  body?: string | Buffer | Uint8Array | null;
  signal?: AbortSignal | null;
  /** Default: isPublicIp (only globally-routable unicast addresses). */
  policy?: IpPolicy;
  maxRedirects?: number;
  maxBodyBytes?: number;
  /** Injectable for tests. Must return every address the name resolves to. */
  resolve?: (hostname: string) => Promise<string[]>;
}

const DEFAULT_MAX_BODY = 8 * 1024 * 1024;

async function defaultResolve(hostname: string): Promise<string[]> {
  const res = await dns.lookup(hostname, { all: true, verbatim: true });
  return res.map((r) => r.address);
}

async function resolveAndCheck(
  hostname: string,
  policy: IpPolicy,
  resolve: (h: string) => Promise<string[]>
): Promise<string> {
  const bare = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  let ips: string[];
  if (net.isIP(bare)) {
    ips = [bare];
  } else {
    try {
      ips = await resolve(bare);
    } catch {
      throw new SsrfBlockedError(`Could not resolve hostname '${hostname}'.`);
    }
  }
  if (ips.length === 0) throw new SsrfBlockedError(`Could not resolve hostname '${hostname}'.`);
  for (const ip of ips) {
    if (!policy(ip)) {
      throw new SsrfBlockedError(`'${hostname}' resolves to a disallowed address (${ip}).`);
    }
  }
  return ips[0];
}

function capBytes(limit: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk, _enc, cb) {
      seen += chunk.length;
      if (seen > limit) cb(new Error(`Response body exceeded ${limit} bytes.`));
      else cb(null, chunk);
    },
  });
}

function requestOnce(
  url: URL,
  pinnedIp: string,
  method: string,
  headers: Headers,
  body: Buffer | null,
  signal: AbortSignal | null | undefined
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === "https:";
    const mod = isHttps ? https : http;
    const family = net.isIP(pinnedIp) === 6 ? 6 : 4;
    const hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;

    const hdrs: Record<string, string> = {};
    headers.forEach((v, k) => (hdrs[k] = v));
    if (body) hdrs["content-length"] = String(body.length);

    const req = mod.request(
      {
        protocol: url.protocol,
        hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers: hdrs,
        // Pin: never consult DNS again. TLS SNI / cert validation still use `hostname`.
        lookup: (_h: string, opts: any, cb: any) => {
          if (opts && opts.all) cb(null, [{ address: pinnedIp, family }]);
          else cb(null, pinnedIp, family);
        },
      } as https.RequestOptions,
      resolve
    );

    const onAbort = () => req.destroy(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
      req.on("close", () => signal.removeEventListener("abort", onAbort));
    }
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function toResponse(res: http.IncomingMessage, maxBodyBytes: number, url: string): Response {
  const headers = new Headers();
  for (const [k, v] of Object.entries(res.headers)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else headers.set(k, v);
  }

  let stream: Readable = res;
  const enc = String(res.headers["content-encoding"] || "").toLowerCase();
  const decoder =
    enc === "gzip" || enc === "x-gzip"
      ? zlib.createGunzip()
      : enc === "deflate"
        ? zlib.createInflate()
        : enc === "br"
          ? zlib.createBrotliDecompress()
          : null;
  if (decoder) {
    headers.delete("content-encoding");
    headers.delete("content-length");
    stream = res.pipe(decoder);
    res.on("error", (e) => decoder.destroy(e));
  }
  const capped = stream.pipe(capBytes(maxBodyBytes));
  stream.on("error", (e) => capped.destroy(e));

  const status = res.statusCode || 500;
  const nullBody = status === 204 || status === 205 || status === 304;
  const out = new Response(nullBody ? null : (Readable.toWeb(capped) as ReadableStream), {
    status,
    statusText: res.statusMessage || "",
    headers,
  });
  Object.defineProperty(out, "url", { value: url });
  return out;
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<Response> {
  const policy = options.policy ?? isPublicIp;
  const resolve = options.resolve ?? defaultResolve;
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY;

  let method = (options.method || "GET").toUpperCase();
  let headers = new Headers(options.headers);
  if (!headers.has("accept-encoding")) headers.set("accept-encoding", "gzip, deflate, br");
  let body: Buffer | null =
    options.body == null ? null : Buffer.isBuffer(options.body) ? options.body : Buffer.from(options.body as any);

  let current = rawUrl;
  for (let hop = 0; ; hop++) {
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      throw new SsrfBlockedError(`'${current}' is not a valid URL.`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new SsrfBlockedError(`Only http/https URLs are allowed (got '${url.protocol}').`);
    }

    const pinned = await resolveAndCheck(url.hostname, policy, resolve);
    const res = await requestOnce(url, pinned, method, headers, body, options.signal);

    const status = res.statusCode || 0;
    const location = res.headers.location;
    if ([301, 302, 303, 307, 308].includes(status) && location) {
      res.resume(); // discard redirect body
      if (hop >= maxRedirects) throw new SsrfBlockedError(`Too many redirects (limit ${maxRedirects}).`);
      const next = new URL(location, url);
      if (next.origin !== url.origin) headers.delete("authorization");
      if (status === 303 || ((status === 301 || status === 302) && method === "POST")) {
        method = "GET";
        body = null;
        headers.delete("content-type");
      }
      current = next.toString();
      continue;
    }
    return toResponse(res, maxBodyBytes, current);
  }
}
