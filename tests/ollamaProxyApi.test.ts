import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, DELETE, OPTIONS } from "../app/api/ollama/[...path]/route";
import { resetOllamaQueue } from "../lib/ollamaRateLimit";

// This route proxies to Ollama with three layers of protection worth
// testing directly (unit tests for the pieces already exist elsewhere):
// SSRF host validation (lib/ssrfGuard.ts), a concurrency semaphore for
// chat/embed endpoints (lib/ollamaRateLimit.ts), and response streaming
// via ReadableStream.tee(). Mocks `fetch` throughout — no real Ollama
// server is contacted.
describe("Ollama Proxy API (/api/ollama/[...path])", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetOllamaQueue();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    resetOllamaQueue();
  });

  function makeRequest(
    method: string,
    pathSegments: string[],
    options: { host?: string; body?: any } = {}
  ): { req: NextRequest; params: { params: { path: string[] } } } {
    const url = new URL(`http://localhost:3000/api/ollama/${pathSegments.join("/")}`);
    if (options.host) url.searchParams.set("host", options.host);
    const req = new NextRequest(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    return { req, params: { params: { path: pathSegments } } };
  }

  describe("OPTIONS (CORS preflight)", () => {
    it("returns 204 with no body", async () => {
      const res = await OPTIONS();
      expect(res.status).toBe(204);
    });
  });

  describe("host resolution", () => {
    it("rewrites 'localhost' to '127.0.0.1' to avoid Windows ::1 ECONNREFUSED", async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => JSON.stringify({ models: [] }),
        headers: new Headers({ "Content-Type": "application/json" }),
      });
      global.fetch = fetchSpy as any;

      const { req, params } = makeRequest("GET", ["api", "tags"], { host: "http://localhost:11434" });
      await GET(req, params);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("http://127.0.0.1:11434"),
        expect.anything()
      );
    });

    it("defaults to 127.0.0.1:11434 when no host is given and OLLAMA_HOST is unset", async () => {
      const originalEnv = process.env.OLLAMA_HOST;
      delete process.env.OLLAMA_HOST;

      const fetchSpy = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => "{}",
        headers: new Headers(),
      });
      global.fetch = fetchSpy as any;

      const { req, params } = makeRequest("GET", ["api", "tags"]);
      await GET(req, params);

      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("127.0.0.1:11434"), expect.anything());
      if (originalEnv !== undefined) process.env.OLLAMA_HOST = originalEnv;
    });
  });

  describe("SSRF guard", () => {
    it("blocks a host resolving to a link-local/metadata address with 403, before calling fetch", async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as any;

      const { req, params } = makeRequest("GET", ["api", "tags"], { host: "http://169.254.169.254" });
      const res = await GET(req, params);

      expect(res.status).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    it("relays a successful response with the same status and body", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => JSON.stringify({ models: [{ name: "llama3.1" }] }),
        headers: new Headers({ "Content-Type": "application/json" }),
      }) as any;

      const { req, params } = makeRequest("GET", ["api", "tags"]);
      const res = await GET(req, params);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.models[0].name).toBe("llama3.1");
    });

    it("returns 502 (not an unhandled throw) when Ollama is unreachable", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as any;

      const { req, params } = makeRequest("GET", ["api", "tags"]);
      const res = await GET(req, params);

      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toMatch(/Could not reach Ollama/);
    });
  });

  describe("POST — non-generation endpoints bypass the rate limiter", () => {
    it("does not acquire a concurrency slot for an arbitrary (non chat/embed) path", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "{}",
        body: null,
      }) as any;

      const { req, params } = makeRequest("POST", ["api", "pull"], { body: { name: "llama3.1" } });
      const res = await POST(req, params);

      expect(res.status).toBe(200);
    });
  });

  describe("POST — generation/embedding endpoints go through the rate limiter", () => {
    it("acquires and releases a slot for a non-streaming api/generate response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ response: "hi" }),
        body: null, // non-streaming path
      }) as any;

      const { req, params } = makeRequest("POST", ["api", "generate"], { body: { model: "llama3.1", prompt: "hi" } });
      const res = await POST(req, params);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.response).toBe("hi");
    });

    it("relays a non-2xx upstream error without retrying or throwing", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: "model not found" }),
        body: null,
      }) as any;

      const { req, params } = makeRequest("POST", ["api", "generate"], { body: { model: "nonexistent", prompt: "hi" } });
      const res = await POST(req, params);

      expect(res.status).toBe(404);
    });

    it("returns 502 and still releases its slot when the fetch to Ollama throws", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("socket hang up")) as any;

      const { req, params } = makeRequest("POST", ["api", "chat"], { body: { model: "llama3.1", messages: [] } });
      const res = await POST(req, params);
      expect(res.status).toBe(502);

      // If the slot weren't released on the throw path, a second request
      // would either hang or be rejected by the queue — this proves the
      // `finally` release ran.
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "{}",
        body: null,
      }) as any;
      const { req: req2, params: params2 } = makeRequest("POST", ["api", "chat"], { body: { model: "llama3.1", messages: [] } });
      const res2 = await POST(req2, params2);
      expect(res2.status).toBe(200);
    });

    it("streams a response body through without buffering it whole (tee-based passthrough)", async () => {
      const chunks = ['{"response":"a"}\n', '{"response":"b"}\n'];
      const stream = new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
          controller.close();
        },
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: stream,
      }) as any;

      const { req, params } = makeRequest("POST", ["api", "generate"], { body: { model: "llama3.1", prompt: "hi", stream: true } });
      const res = await POST(req, params);

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/event-stream");

      const reader = res.body!.getReader();
      let received = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += new TextDecoder().decode(value);
      }
      expect(received).toContain('"response":"a"');
      expect(received).toContain('"response":"b"');
    });
  });

  describe("DELETE", () => {
    it("relays a successful delete", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => JSON.stringify({ status: "deleted" }),
      }) as any;

      const { req, params } = makeRequest("DELETE", ["api", "delete"], { body: { name: "llama3.1" } });
      const res = await DELETE(req, params);

      expect(res.status).toBe(200);
    });

    it("tolerates a missing/invalid JSON body instead of throwing", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => "{}",
      }) as any;

      const req = new NextRequest("http://localhost:3000/api/ollama/api/delete", { method: "DELETE" });
      const res = await DELETE(req, { params: { path: ["api", "delete"] } });

      expect(res.status).toBe(200);
    });

    it("returns 502 when the upstream delete call fails", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("timeout")) as any;

      const { req, params } = makeRequest("DELETE", ["api", "delete"], { body: { name: "llama3.1" } });
      const res = await DELETE(req, params);

      expect(res.status).toBe(502);
    });
  });
});
