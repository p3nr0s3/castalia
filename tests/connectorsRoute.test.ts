import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// lib/localAppBridge already has its own unit test suite
// (tests/localAppBridge.test.ts) — this suite only verifies that the
// connectors route wires request params to it correctly for the
// local-http path, and exercises the webhook path's own logic directly
// (it's simple enough not to warrant a separate module).
const testBridgeConnectionMock = vi.fn();
const executeBridgeActionMock = vi.fn();
vi.mock("../lib/localAppBridge", () => ({
  testBridgeConnection: (...args: any[]) => testBridgeConnectionMock(...args),
  executeBridgeAction: (...args: any[]) => executeBridgeActionMock(...args),
}));

function makeReq(body: Record<string, any>): NextRequest {
  return new NextRequest("http://localhost:3000/api/connectors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  testBridgeConnectionMock.mockReset();
  executeBridgeActionMock.mockReset();
});

describe("POST /api/connectors — action: test (webhook)", () => {
  it("requires a valid http(s) URL", async () => {
    const { POST } = await import("../app/api/connectors/route");
    const res = await POST(makeReq({ action: "test", customBridgeType: "webhook", webhookUrl: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("rejects a private/loopback webhook URL (webhooks must be public)", async () => {
    const { POST } = await import("../app/api/connectors/route");
    const res = await POST(makeReq({ action: "test", customBridgeType: "webhook", webhookUrl: "http://127.0.0.1:8080/hook" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/localhost|private|loopback/i);
  });

  it("succeeds when the webhook responds ok", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("../app/api/connectors/route");
    const res = await POST(makeReq({ action: "test", customBridgeType: "webhook", webhookUrl: "https://example.com/hook" }));
    const data = await res.json();
    expect(data.success).toBe(true);

    vi.unstubAllGlobals();
  });

  it("reports failure when the webhook rejects the request", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "Forbidden" });
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("../app/api/connectors/route");
    const res = await POST(makeReq({ action: "test", customBridgeType: "webhook", webhookUrl: "https://example.com/hook" }));
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("403");

    vi.unstubAllGlobals();
  });

  it("sends the apiKey as a Bearer token when provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("../app/api/connectors/route");
    await POST(makeReq({ action: "test", customBridgeType: "webhook", webhookUrl: "https://example.com/hook", apiKey: "secret123" }));

    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers["Authorization"]).toBe("Bearer secret123");

    vi.unstubAllGlobals();
  });
});

describe("POST /api/connectors — action: test (local-http)", () => {
  it("requires an endpoint URL", async () => {
    const { POST } = await import("../app/api/connectors/route");
    const res = await POST(makeReq({ action: "test", customBridgeType: "local-http", endpoint: "" }));
    expect(res.status).toBe(400);
  });

  it("succeeds when the bridge is reachable", async () => {
    testBridgeConnectionMock.mockResolvedValue({ reachable: true, details: { version: "1.2.3" } });
    const { POST } = await import("../app/api/connectors/route");

    const res = await POST(makeReq({ action: "test", customBridgeType: "local-http", endpoint: "http://127.0.0.1:9999" }));
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain("1.2.3");
  });

  it("reports failure when the bridge is not reachable", async () => {
    testBridgeConnectionMock.mockResolvedValue({ reachable: false });
    const { POST } = await import("../app/api/connectors/route");

    const res = await POST(makeReq({ action: "test", customBridgeType: "local-http", endpoint: "http://127.0.0.1:9999" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 with the guard's message when the endpoint is rejected as non-loopback", async () => {
    const { SsrfBlockedError } = await import("../lib/ssrfGuard");
    testBridgeConnectionMock.mockRejectedValue(new SsrfBlockedError("blocked for testing"));
    const { POST } = await import("../app/api/connectors/route");

    const res = await POST(makeReq({ action: "test", customBridgeType: "local-http", endpoint: "http://192.168.1.50:9999" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("blocked for testing");
  });
});

describe("POST /api/connectors — action: webhook_send", () => {
  it("requires a valid webhook URL", async () => {
    const { POST } = await import("../app/api/connectors/route");
    const res = await POST(makeReq({ action: "webhook_send", webhookUrl: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects a private webhook URL", async () => {
    const { POST } = await import("../app/api/connectors/route");
    const res = await POST(makeReq({ action: "webhook_send", webhookUrl: "http://10.0.0.5/hook", payload: { text: "hi" } }));
    expect(res.status).toBe(400);
  });

  it("dispatches the given payload as-is", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("../app/api/connectors/route");
    await POST(makeReq({ action: "webhook_send", webhookUrl: "https://example.com/hook", payload: { text: "custom message" } }));

    const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(sentBody).toEqual({ text: "custom message" });

    vi.unstubAllGlobals();
  });

  it("falls back to a default payload when none is given", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("../app/api/connectors/route");
    await POST(makeReq({ action: "webhook_send", webhookUrl: "https://example.com/hook" }));

    const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(sentBody.text).toBeTruthy();

    vi.unstubAllGlobals();
  });
});

describe("POST /api/connectors — action: local_bridge_execute", () => {
  it("requires an endpoint", async () => {
    const { POST } = await import("../app/api/connectors/route");
    const res = await POST(makeReq({ action: "local_bridge_execute", endpoint: "", payload: {} }));
    expect(res.status).toBe(400);
  });

  it("passes the payload through to executeBridgeAction", async () => {
    executeBridgeActionMock.mockResolvedValue({ success: true, message: "done", details: { ok: true } });
    const { POST } = await import("../app/api/connectors/route");

    await POST(makeReq({ action: "local_bridge_execute", endpoint: "http://127.0.0.1:9999", payload: { foo: "bar" } }));

    expect(executeBridgeActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ defaultUrl: "http://127.0.0.1:9999" }),
      "http://127.0.0.1:9999",
      { foo: "bar" }
    );
  });

  it("returns success: true with details on success", async () => {
    executeBridgeActionMock.mockResolvedValue({ success: true, message: "Executed.", details: { x: 1 } });
    const { POST } = await import("../app/api/connectors/route");

    const res = await POST(makeReq({ action: "local_bridge_execute", endpoint: "http://127.0.0.1:9999", payload: {} }));
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.details).toEqual({ x: 1 });
  });

  it("surfaces isBridgeOffline with success: false rather than an error status", async () => {
    executeBridgeActionMock.mockResolvedValue({ success: false, isBridgeOffline: true, message: "offline" });
    const { POST } = await import("../app/api/connectors/route");

    const res = await POST(makeReq({ action: "local_bridge_execute", endpoint: "http://127.0.0.1:9999", payload: {} }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.isBridgeOffline).toBe(true);
  });

  it("returns 401 when the bridge rejects auth", async () => {
    executeBridgeActionMock.mockResolvedValue({ success: false, isAuthRejected: true, message: "bad token" });
    const { POST } = await import("../app/api/connectors/route");

    const res = await POST(makeReq({ action: "local_bridge_execute", endpoint: "http://127.0.0.1:9999", payload: {} }));
    expect(res.status).toBe(401);
  });

  it("returns 400 with the guard's message when the endpoint is rejected as non-loopback", async () => {
    const { SsrfBlockedError } = await import("../lib/ssrfGuard");
    executeBridgeActionMock.mockRejectedValue(new SsrfBlockedError("blocked for testing"));
    const { POST } = await import("../app/api/connectors/route");

    const res = await POST(makeReq({ action: "local_bridge_execute", endpoint: "http://192.168.1.50:9999", payload: {} }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/connectors — unknown action", () => {
  it("returns 400 for an unrecognized action", async () => {
    const { POST } = await import("../app/api/connectors/route");
    const res = await POST(makeReq({ action: "github_fetch", repo: "facebook/react" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Unknown action");
  });
});
