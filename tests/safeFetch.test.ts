import { describe, it, expect, afterEach } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { safeFetch } from "../lib/safeFetch";
import { SsrfBlockedError } from "../lib/ssrfGuard";

const servers: http.Server[] = [];
function listen(host: string, handler: http.RequestListener): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = http.createServer(handler);
    s.once("error", reject);
    s.listen(0, host, () => {
      servers.push(s);
      resolve((s.address() as AddressInfo).port);
    });
  });
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(() => r(null)))));
});

// In these tests "allowed" means exactly 127.0.0.1, so we can exercise the
// guard against real sockets without needing public network access.
const only127_0_0_1 = (ip: string) => ip === "127.0.0.1";

describe("safeFetch", () => {
  it("fetches an allowed address and returns a normal Response", async () => {
    const port = await listen("127.0.0.1", (_q, r) => {
      r.setHeader("content-type", "text/plain");
      r.end("hello");
    });
    const res = await safeFetch(`http://127.0.0.1:${port}/x`, { policy: only127_0_0_1 });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello");
  });

  it("blocks a literal address the policy rejects, before connecting", async () => {
    await expect(safeFetch("http://127.0.0.1:9/", { policy: () => false })).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("pins the connection to the address it validated (no second DNS lookup)", async () => {
    let seenHost = "";
    const port = await listen("127.0.0.1", (q, r) => {
      seenHost = String(q.headers.host);
      r.end("ok");
    });
    let lookups = 0;
    // A rebinding resolver: 1st answer is allowed, any further answer would be forbidden.
    const resolve = async () => (++lookups === 1 ? ["127.0.0.1"] : ["10.0.0.1"]);
    const res = await safeFetch(`http://rebind.test:${port}/`, { policy: only127_0_0_1, resolve });
    expect(await res.text()).toBe("ok");
    expect(lookups).toBe(1);
    expect(seenHost).toBe(`rebind.test:${port}`);
  });

  it("rejects a hostname if ANY resolved address is disallowed", async () => {
    await expect(
      safeFetch("http://mixed.test/", { policy: only127_0_0_1, resolve: async () => ["127.0.0.1", "10.0.0.1"] })
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("follows redirects only while every hop stays allowed", async () => {
    const dst = await listen("127.0.0.1", (_q, r) => r.end("final"));
    const src = await listen("127.0.0.1", (_q, r) => {
      r.statusCode = 302;
      r.setHeader("location", `http://127.0.0.1:${dst}/landed`);
      r.end();
    });
    const res = await safeFetch(`http://127.0.0.1:${src}/`, { policy: only127_0_0_1 });
    expect(await res.text()).toBe("final");
  });

  it.skipIf(process.platform !== "linux")("blocks a redirect into a forbidden address (the classic SSRF bypass)", async () => {
    let secretHit = false;
    const secret = await listen("127.0.0.2", (_q, r) => {
      secretHit = true;
      r.end("SECRET");
    });
    const src = await listen("127.0.0.1", (_q, r) => {
      r.statusCode = 302;
      r.setHeader("location", `http://127.0.0.2:${secret}/`);
      r.end();
    });
    await expect(safeFetch(`http://127.0.0.1:${src}/`, { policy: only127_0_0_1 })).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(secretHit).toBe(false);
  });

  it("stops after maxRedirects", async () => {
    const port = await listen("127.0.0.1", (q, r) => {
      r.statusCode = 302;
      r.setHeader("location", q.url || "/");
      r.end();
    });
    await expect(
      safeFetch(`http://127.0.0.1:${port}/loop`, { policy: only127_0_0_1, maxRedirects: 3 })
    ).rejects.toThrow(/Too many redirects/);
  });

  it("caps the response body size", async () => {
    const port = await listen("127.0.0.1", (_q, r) => r.end("x".repeat(10_000)));
    const res = await safeFetch(`http://127.0.0.1:${port}/`, { policy: only127_0_0_1, maxBodyBytes: 1000 });
    await expect(res.text()).rejects.toThrow();
  });

  it("sends a POST body and drops it on a 303 redirect", async () => {
    const got: string[] = [];
    const dst = await listen("127.0.0.1", (q, r) => {
      got.push(`${q.method}:${q.headers["content-length"] ?? "none"}`);
      r.end("done");
    });
    const src = await listen("127.0.0.1", (q, r) => {
      let b = "";
      q.on("data", (d) => (b += d));
      q.on("end", () => {
        got.push(`${q.method}:${b}`);
        r.statusCode = 303;
        r.setHeader("location", `http://127.0.0.1:${dst}/`);
        r.end();
      });
    });
    const res = await safeFetch(`http://127.0.0.1:${src}/`, { method: "POST", body: "payload", policy: only127_0_0_1 });
    expect(await res.text()).toBe("done");
    expect(got[0]).toBe("POST:payload");
    expect(got[1].startsWith("GET:")).toBe(true);
  });

  it("honours an AbortSignal", async () => {
    const port = await listen("127.0.0.1", () => {
      /* never respond */
    });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 50);
    await expect(safeFetch(`http://127.0.0.1:${port}/`, { policy: only127_0_0_1, signal: ac.signal })).rejects.toThrow();
  });
});
