import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/cloud/chat/route";
import { extractImageParts } from "../lib/cloudVision";
import type { Message } from "../lib/types";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const img = (over: Record<string, any> = {}) => ({ id: "a", name: "p.png", type: "image" as const, size: 10, mimeType: "image/png", base64: PNG, ...over });
const userMsg = (attachments: any[], content = "what is this?"): Message => ({ id: "m", role: "user", content, timestamp: 0, attachments }) as any;

async function send(provider: string, messages: Message[]) {
  const spy = vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n", { status: 200 }));
  global.fetch = spy as any;
  await POST(
    new NextRequest("http://localhost:3000/api/cloud/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model: "m", apiKey: "k", messages }),
    })
  );
  return JSON.parse(spy.mock.calls[0][1].body);
}

describe("cloud chat — image attachments reach the provider", () => {
  it("OpenAI-compatible: text + image_url data URI", async () => {
    const body = await send("openai", [userMsg([img()])]);
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "what is this?" },
      { type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } },
    ]);
  });

  it("Anthropic: base64 image block before the text", async () => {
    const body = await send("anthropic", [userMsg([img()])]);
    expect(body.messages[0].content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } },
      { type: "text", text: "what is this?" },
    ]);
  });

  it("Gemini: inlineData part", async () => {
    const body = await send("gemini", [userMsg([img()])]);
    expect(body.contents[0].parts).toEqual([{ inlineData: { mimeType: "image/png", data: PNG } }, { text: "what is this?" }]);
  });

  it("messages WITHOUT images keep plain string content (text-only backends reject arrays)", async () => {
    const openai = await send("openai", [userMsg([])]);
    expect(openai.messages[0].content).toBe("what is this?");
    const anthropic = await send("anthropic", [userMsg([])]);
    expect(anthropic.messages[0].content).toBe("what is this?");
    expect(anthropic.messages[0]).not.toHaveProperty("images");
  });
});

describe("extractImageParts limits", () => {
  it("falls back to dataUrl, normalises image/jpg, and keeps at most 4", () => {
    const parts = extractImageParts(
      userMsg([
        img({ base64: undefined, dataUrl: `data:image/jpg;base64,${PNG}`, mimeType: undefined }),
        ...Array.from({ length: 6 }, () => img()),
      ])
    );
    expect(parts).toHaveLength(4);
    expect(parts[0].mimeType).toBe("image/jpeg");
  });

  it("drops unsupported types (svg/html), non-base64 payloads and oversized images instead of forwarding them", () => {
    const parts = extractImageParts(
      userMsg([
        img({ mimeType: "image/svg+xml" }),
        img({ mimeType: "text/html" }),
        img({ base64: "not base64 !!! <script>" }),
        img({ base64: "A".repeat(7_000_001) }),
        img({ base64: undefined, dataUrl: undefined }),
        img(),
      ])
    );
    expect(parts).toHaveLength(1);
  });

  it("ignores documents and assistant-side attachments", async () => {
    expect(extractImageParts(userMsg([{ id: "d", name: "a.txt", type: "document", size: 1, textContent: "x" }]))).toHaveLength(0);
    const body = await send("openai", [{ ...userMsg([img()]), role: "assistant" } as any]);
    expect(body.messages[0].content).toBe("what is this?");
  });
});
