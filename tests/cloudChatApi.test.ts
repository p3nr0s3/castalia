import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, OPTIONS } from "../app/api/cloud/chat/route";

// Covers the parts of the cloud proxy that matter for correctness and
// privacy without contacting any real provider (fetch is mocked):
// input validation, server-env-key-over-client-key precedence, secret
// redaction before the payload leaves the machine, per-provider routing
// (URL + auth header shape), and upstream-error relaying. The SSE
// translation loops for each provider are not exercised here — they're
// stream-format parsers that would need per-provider fixtures.
describe("Cloud Chat Proxy API (/api/cloud/chat)", () => {
  const originalFetch = global.fetch;
  const ENV_KEYS = [
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "OPENAI_API_KEY",
    "GROQ_API_KEY",
    "DEEPSEEK_API_KEY",
    "OPENROUTER_API_KEY",
  ];
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  function postRequest(body: Record<string, any>): NextRequest {
    return new NextRequest("http://localhost:3000/api/cloud/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  // A minimal upstream that satisfies `ok` and yields an empty stream, so
  // the route reaches its ReadableStream setup without needing real SSE.
  function okUpstream() {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({ start: (c) => c.close() }),
    });
  }

  function lastFetchCall(spy: ReturnType<typeof vi.fn>) {
    const [url, init] = spy.mock.calls[spy.mock.calls.length - 1];
    return { url: url as string, init: init as RequestInit, body: JSON.parse((init as any).body) };
  }

  it("OPTIONS returns 204", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
  });

  describe("input validation", () => {
    it("returns 400 when provider or model is missing", async () => {
      const res = await POST(postRequest({ provider: "openai", apiKey: "k", messages: [] }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Provider and Model are required/);
    });

    it("returns 400 with the env var name when no API key is available anywhere", async () => {
      const res = await POST(postRequest({ provider: "anthropic", model: "claude-x", messages: [] }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("ANTHROPIC_API_KEY");
    });

    it("returns 500 (not an unhandled throw) for a malformed JSON body", async () => {
      const req = new NextRequest("http://localhost:3000/api/cloud/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{broken",
      });
      const res = await POST(req);
      expect(res.status).toBe(500);
    });
  });

  describe("API key resolution", () => {
    it("uses the client-supplied key when no server env key is set", async () => {
      const spy = okUpstream();
      global.fetch = spy as any;

      await POST(postRequest({ provider: "openai", model: "gpt-x", apiKey: "client-key", messages: [] }));

      expect(lastFetchCall(spy).init.headers).toMatchObject({ Authorization: "Bearer client-key" });
    });

    it("prefers the server-side env key over a client-supplied one", async () => {
      process.env.OPENAI_API_KEY = "server-key";
      const spy = okUpstream();
      global.fetch = spy as any;

      await POST(postRequest({ provider: "openai", model: "gpt-x", apiKey: "client-key", messages: [] }));

      const headers = lastFetchCall(spy).init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer server-key");
    });

    it("accepts a request with no client key when the server env key exists", async () => {
      process.env.GROQ_API_KEY = "server-groq";
      const spy = okUpstream();
      global.fetch = spy as any;

      const res = await POST(postRequest({ provider: "groq", model: "llama", messages: [] }));
      expect(res.status).toBe(200);
    });
  });

  describe("provider routing", () => {
    it("sends OpenAI requests to api.openai.com with a Bearer token", async () => {
      const spy = okUpstream();
      global.fetch = spy as any;
      await POST(postRequest({ provider: "openai", model: "gpt-x", apiKey: "k", messages: [] }));
      expect(lastFetchCall(spy).url).toBe("https://api.openai.com/v1/chat/completions");
    });

    it("sends Groq, DeepSeek and OpenRouter requests to their own endpoints", async () => {
      const cases: [string, string][] = [
        ["groq", "https://api.groq.com/openai/v1/chat/completions"],
        ["deepseek", "https://api.deepseek.com/chat/completions"],
        ["openrouter", "https://openrouter.ai/api/v1/chat/completions"],
      ];
      for (const [provider, expectedUrl] of cases) {
        const spy = okUpstream();
        global.fetch = spy as any;
        await POST(postRequest({ provider, model: "m", apiKey: "k", messages: [] }));
        expect(lastFetchCall(spy).url).toBe(expectedUrl);
      }
    });

    it("builds the custom endpoint from customBaseUrl and trims trailing slashes", async () => {
      const spy = okUpstream();
      global.fetch = spy as any;
      await POST(
        postRequest({ provider: "custom", model: "m", apiKey: "k", customBaseUrl: "http://localhost:1234/v1///", messages: [] })
      );
      expect(lastFetchCall(spy).url).toBe("http://localhost:1234/v1/chat/completions");
    });

    it("sends Anthropic requests with x-api-key and the pinned anthropic-version header", async () => {
      const spy = okUpstream();
      global.fetch = spy as any;
      await POST(postRequest({ provider: "anthropic", model: "claude-x", apiKey: "ant-key", messages: [] }));

      const { url, init } = lastFetchCall(spy);
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      const headers = init.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("ant-key");
      expect(headers["anthropic-version"]).toBe("2023-06-01");
    });

    it("strips a leading 'models/' prefix from Gemini model names", async () => {
      const spy = okUpstream();
      global.fetch = spy as any;
      await POST(postRequest({ provider: "gemini", model: "models/gemini-x", apiKey: "g", messages: [] }));
      expect(lastFetchCall(spy).url).toContain("/models/gemini-x:streamGenerateContent");
      expect(lastFetchCall(spy).url).not.toContain("models/models/");
    });

    it("maps assistant messages to the 'model' role for Gemini", async () => {
      const spy = okUpstream();
      global.fetch = spy as any;
      await POST(
        postRequest({
          provider: "gemini",
          model: "g",
          apiKey: "k",
          messages: [
            { id: "1", role: "user", content: "hi", timestamp: 1 },
            { id: "2", role: "assistant", content: "hello", timestamp: 2 },
          ],
        })
      );
      const roles = lastFetchCall(spy).body.contents.map((c: any) => c.role);
      expect(roles).toEqual(["user", "model"]);
    });
  });

  describe("secret redaction before leaving the machine", () => {
    it("redacts an API key pasted into a user message", async () => {
      const spy = okUpstream();
      global.fetch = spy as any;
      // lib/redaction.ts's GITHUB_TOKEN rule requires 36+ chars after the
      // prefix (real GitHub token length) — a shorter fake would not match.
      const leaked = "ghp_" + "a".repeat(36);

      await POST(
        postRequest({
          provider: "openai",
          model: "gpt-x",
          apiKey: "k",
          messages: [{ id: "1", role: "user", content: `my token is ${leaked} please help`, timestamp: 1 }],
        })
      );

      const sent = JSON.stringify(lastFetchCall(spy).body);
      expect(sent).not.toContain(leaked);
    });

    it("redacts secrets inside the system prompt too", async () => {
      const spy = okUpstream();
      global.fetch = spy as any;
      const leaked = "ghp_" + "b".repeat(36);

      await POST(
        postRequest({
          provider: "openai",
          model: "gpt-x",
          apiKey: "k",
          systemPrompt: `You are helpful. Internal token: ${leaked}`,
          messages: [],
        })
      );

      const sent = JSON.stringify(lastFetchCall(spy).body);
      expect(sent).not.toContain(leaked);
    });

    it("leaves ordinary text untouched", async () => {
      const spy = okUpstream();
      global.fetch = spy as any;

      await POST(
        postRequest({
          provider: "openai",
          model: "gpt-x",
          apiKey: "k",
          messages: [{ id: "1", role: "user", content: "Explain how recursion works", timestamp: 1 }],
        })
      );

      const userMsg = lastFetchCall(spy).body.messages.find((m: any) => m.role === "user");
      expect(userMsg.content).toBe("Explain how recursion works");
    });
  });

  describe("message formatting", () => {
    it("prepends attached document text to the message content", async () => {
      const spy = okUpstream();
      global.fetch = spy as any;

      await POST(
        postRequest({
          provider: "openai",
          model: "gpt-x",
          apiKey: "k",
          messages: [
            {
              id: "1",
              role: "user",
              content: "Summarize this",
              timestamp: 1,
              attachments: [{ type: "document", name: "notes.txt", textContent: "line one of the doc" }],
            },
          ],
        })
      );

      const userMsg = lastFetchCall(spy).body.messages.find((m: any) => m.role === "user");
      expect(userMsg.content).toContain("[File: notes.txt]");
      expect(userMsg.content).toContain("line one of the doc");
      expect(userMsg.content).toContain("Summarize this");
    });

    it("adds the system prompt as the first message for OpenAI-compatible providers", async () => {
      const spy = okUpstream();
      global.fetch = spy as any;

      await POST(
        postRequest({
          provider: "openai",
          model: "gpt-x",
          apiKey: "k",
          systemPrompt: "Be terse.",
          messages: [{ id: "1", role: "user", content: "hi", timestamp: 1 }],
        })
      );

      const msgs = lastFetchCall(spy).body.messages;
      expect(msgs[0]).toEqual({ role: "system", content: "Be terse." });
    });

    it("puts the system prompt in the top-level 'system' field for Anthropic", async () => {
      const spy = okUpstream();
      global.fetch = spy as any;

      await POST(
        postRequest({
          provider: "anthropic",
          model: "claude-x",
          apiKey: "k",
          systemPrompt: "Be terse.",
          messages: [{ id: "1", role: "user", content: "hi", timestamp: 1 }],
        })
      );

      const body = lastFetchCall(spy).body;
      expect(body.system).toBe("Be terse.");
      expect(body.messages.every((m: any) => m.role !== "system")).toBe(true);
    });
  });

  describe("upstream error relaying", () => {
    it("relays the upstream status and the provider's own error message", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: "Invalid API key" } }),
      }) as any;

      const res = await POST(postRequest({ provider: "openai", model: "gpt-x", apiKey: "bad", messages: [] }));

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("OPENAI Error (401)");
      expect(data.error).toContain("Invalid API key");
    });

    it("falls back to the raw response text when the upstream error is not JSON", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => "Bad Gateway",
      }) as any;

      const res = await POST(postRequest({ provider: "groq", model: "m", apiKey: "k", messages: [] }));

      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain("Bad Gateway");
    });

    it("returns 500 when the fetch itself throws", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as any;

      const res = await POST(postRequest({ provider: "openai", model: "gpt-x", apiKey: "k", messages: [] }));
      expect(res.status).toBe(500);
    });
  });
});
