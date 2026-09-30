import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/cloud/chat/route";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
});

function post(body: Record<string, any>) {
  return POST(
    new NextRequest("http://localhost:3000/api/cloud/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}
const okStream = () => new Response("data: [DONE]\n\n", { status: 200 });

describe("cloud chat hardening", () => {
  it("sends the Gemini key in a header, never in the URL", async () => {
    const spy = vi.fn().mockResolvedValue(okStream());
    global.fetch = spy as any;
    await post({ provider: "gemini", model: "gemini-2.5-flash", apiKey: "AIza-secret-key", messages: [] });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).not.toContain("AIza-secret-key");
    expect(String(url)).not.toContain("key=");
    expect(init.headers["x-goog-api-key"]).toBe("AIza-secret-key");
  });

  it("rejects a Gemini model id that tries to address another endpoint", async () => {
    const spy = vi.fn();
    global.fetch = spy as any;
    const res = await post({ provider: "gemini", model: "x:generateContent?foo=/../../other", apiKey: "k", messages: [] });
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("sends temperature but NOT top_p to Anthropic (current models reject both together)", async () => {
    const spy = vi.fn().mockResolvedValue(okStream());
    global.fetch = spy as any;
    await post({ provider: "anthropic", model: "claude-sonnet-5-5", apiKey: "k", messages: [], temperature: 0.4, topP: 0.9 });
    const payload = JSON.parse(spy.mock.calls[0][1].body);
    expect(payload.temperature).toBe(0.4);
    expect(payload).not.toHaveProperty("top_p");
  });

  it("forwards the request's abort signal upstream so disconnects stop token spend", async () => {
    for (const provider of ["anthropic", "gemini", "openai"]) {
      const spy = vi.fn().mockResolvedValue(okStream());
      global.fetch = spy as any;
      await post({ provider, model: "m", apiKey: "k", messages: [] });
      expect(spy.mock.calls[0][1].signal, provider).toBeInstanceOf(AbortSignal);
    }
  });

  it("refuses a custom endpoint pointing at cloud metadata / link-local, without calling it", async () => {
    const spy = vi.fn();
    global.fetch = spy as any;
    for (const customBaseUrl of ["http://169.254.169.254/latest", "http://[fe80::1]:8000/v1"]) {
      const res = await post({ provider: "custom", model: "m", apiKey: "k", customBaseUrl, messages: [] });
      expect(res.status).toBe(403);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("still allows local/LAN custom endpoints, and never follows their redirects", async () => {
    const spy = vi.fn().mockResolvedValue(okStream());
    global.fetch = spy as any;
    await post({ provider: "custom", model: "m", apiKey: "k", customBaseUrl: "http://192.168.1.50:1234/v1", messages: [] });
    expect(spy.mock.calls[0][0]).toBe("http://192.168.1.50:1234/v1/chat/completions");
    expect(spy.mock.calls[0][1].redirect).toBe("manual");
  });

  it("does not throw when the upstream stream fails mid-way (close-after-error regression)", async () => {
    const failing = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n'));
        c.error(new Error("socket hang up"));
      },
    });
    global.fetch = vi.fn().mockResolvedValue(new Response(failing, { status: 200 })) as any;
    const res = await post({ provider: "openai", model: "m", apiKey: "k", messages: [] });
    const reader = res.body!.getReader();
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    await reader.read().catch(() => {});
    await reader.read().catch(() => {});
    await new Promise((r) => setTimeout(r, 20));
    process.off("unhandledRejection", onUnhandled);
    expect(unhandled).toHaveLength(0);
  });
});
