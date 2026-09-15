import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import dns from "dns/promises";
import {
  assertPublicUrl,
  assertBlenderUrl,
  assertOllamaHostUrl,
  SsrfBlockedError,
} from "../lib/ssrfGuard";

// dns.lookup is mocked per-test so we control what each hostname "resolves
// to" without needing real network access — these guards are DNS-resolved
// specifically to stop DNS rebinding, so the tests must exercise that path,
// not just literal-IP inputs.
function mockDns(hostname: string, ips: { address: string; family: 4 | 6 }[]) {
  vi.spyOn(dns, "lookup").mockImplementation(async (host: any) => {
    if (host === hostname) return ips as any;
    throw Object.assign(new Error(`ENOTFOUND ${host}`), { code: "ENOTFOUND" });
  });
}

describe("assertPublicUrl", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("allows a public host", async () => {
    mockDns("example.com", [{ address: "93.184.216.34", family: 4 }]);
    await expect(assertPublicUrl("https://example.com/webhook")).resolves.toBeUndefined();
  });

  it("blocks loopback", async () => {
    mockDns("localhost", [{ address: "127.0.0.1", family: 4 }]);
    await expect(assertPublicUrl("http://localhost/x")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("blocks literal loopback IP with no DNS lookup needed", async () => {
    await expect(assertPublicUrl("http://127.0.0.1:11434/api/tags")).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });

  it("blocks RFC1918 10.x.x.x", async () => {
    mockDns("internal.corp", [{ address: "10.0.0.5", family: 4 }]);
    await expect(assertPublicUrl("http://internal.corp/")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("blocks RFC1918 192.168.x.x", async () => {
    await expect(assertPublicUrl("http://192.168.1.1/")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("blocks RFC1918 172.16-31.x.x but allows 172.32+ (not in the private range)", async () => {
    await expect(assertPublicUrl("http://172.20.0.1/")).rejects.toBeInstanceOf(SsrfBlockedError);
    mockDns("outside-range.example", [{ address: "172.32.0.1", family: 4 }]);
    await expect(assertPublicUrl("http://outside-range.example/")).resolves.toBeUndefined();
  });

  it("blocks the cloud metadata address via link-local range", async () => {
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });

  it("blocks DNS rebinding: a public-looking hostname that resolves to a private IP", async () => {
    mockDns("attacker-controlled.example", [{ address: "127.0.0.1", family: 4 }]);
    await expect(assertPublicUrl("http://attacker-controlled.example/")).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });

  it("blocks IPv6 loopback and unique-local", async () => {
    await expect(assertPublicUrl("http://[::1]/")).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(assertPublicUrl("http://[fd00::1]/")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("blocks IPv4-mapped IPv6 addresses that embed a private IP", async () => {
    await expect(assertPublicUrl("http://[::ffff:127.0.0.1]/")).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });

  it("blocks non-http(s) schemes", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(assertPublicUrl("ftp://example.com/x")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects malformed URLs", async () => {
    await expect(assertPublicUrl("not a url")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("blocks unresolvable hostnames rather than letting fetch decide", async () => {
    vi.spyOn(dns, "lookup").mockRejectedValue(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));
    await expect(assertPublicUrl("http://does-not-exist.invalid/")).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });

  it("blocks if ANY resolved IP is private, even when another is public", async () => {
    mockDns("multi-homed.example", [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    await expect(assertPublicUrl("http://multi-homed.example/")).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });
});

describe("assertBlenderUrl", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("allows 127.0.0.1", async () => {
    await expect(assertBlenderUrl("http://127.0.0.1:9876")).resolves.toBeUndefined();
  });

  it("allows ::1", async () => {
    await expect(assertBlenderUrl("http://[::1]:9876")).resolves.toBeUndefined();
  });

  it("allows a hostname that resolves purely to loopback", async () => {
    mockDns("localhost", [{ address: "127.0.0.1", family: 4 }]);
    await expect(assertBlenderUrl("http://localhost:9876")).resolves.toBeUndefined();
  });

  it("blocks a public host — this is the feature, not a bug", async () => {
    mockDns("example.com", [{ address: "93.184.216.34", family: 4 }]);
    await expect(assertBlenderUrl("http://example.com:9876")).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });

  it("blocks a LAN address — only loopback is allowed for Blender", async () => {
    await expect(assertBlenderUrl("http://192.168.1.50:9876")).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });

  it("blocks a hostname resolving to a mix of loopback and non-loopback IPs", async () => {
    mockDns("mixed.example", [
      { address: "127.0.0.1", family: 4 },
      { address: "8.8.8.8", family: 4 },
    ]);
    await expect(assertBlenderUrl("http://mixed.example:9876")).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });
});

describe("assertOllamaHostUrl", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("allows loopback — legitimate default for a local Ollama", async () => {
    await expect(assertOllamaHostUrl("http://127.0.0.1:11434")).resolves.toBeUndefined();
  });

  it("allows RFC1918 LAN addresses — legitimate for a remote Ollama on the LAN", async () => {
    await expect(assertOllamaHostUrl("http://192.168.1.100:11434")).resolves.toBeUndefined();
    await expect(assertOllamaHostUrl("http://10.0.0.5:11434")).resolves.toBeUndefined();
  });

  it("blocks the cloud metadata / link-local address — the actual attack this guards", async () => {
    await expect(assertOllamaHostUrl("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });

  it("blocks IPv6 link-local", async () => {
    await expect(assertOllamaHostUrl("http://[fe80::1]:11434")).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });

  it("allows a public host (deliberately permissive — a cloud-hosted Ollama is a valid config)", async () => {
    mockDns("my-ollama.example.com", [{ address: "93.184.216.34", family: 4 }]);
    await expect(assertOllamaHostUrl("http://my-ollama.example.com:11434")).resolves.toBeUndefined();
  });
});
