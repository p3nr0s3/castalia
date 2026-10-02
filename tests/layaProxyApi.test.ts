import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/laya/[...path]/route";
import { isAllowedLayaPath, isAllowedOllamaPath } from "../lib/proxyPaths";

describe("proxy path allow-lists", () => {
  it("accepts exactly the upstream APIs the client uses", () => {
    for (const p of ["api/chat", "api/generate", "api/embed", "api/embeddings", "api/tags", "api/show", "api/ps", "api/pull", "api/delete", "api/version", "v1/chat/completions", "v1/models"]) {
      expect(isAllowedOllamaPath(p), p).toBe(true);
    }
    for (const p of ["health", "predict", "v1/systemone"]) expect(isAllowedLayaPath(p), p).toBe(true);
  });

  it("rejects this app's own routes, traversal, and prefix tricks", () => {
    for (const p of ["api/tools/execute", "api/db", "api/fs", "api/chat/../db", "api/chatx", "API/chat", "api/chat/", "", "latest/meta-data"]) {
      expect(isAllowedOllamaPath(p), p).toBe(false);
    }
    for (const p of ["api/tools/execute", "predict/../x", "healthz", ""]) expect(isAllowedLayaPath(p), p).toBe(false);
  });
});

describe("/api/laya/[...path]", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });
  const mk = (method: string, segs: string[]) => ({
    req: new NextRequest(`http://localhost:3000/api/laya/${segs.join("/")}?host=${encodeURIComponent("http://127.0.0.1:3000")}`, {
      method,
      ...(method === "POST" ? { body: "{}" } : {}),
    }),
    params: { params: { path: segs } },
  });

  it("refuses to relay to this app's own routes via ?host=", async () => {
    const spy = vi.fn();
    global.fetch = spy as any;
    const { req, params } = mk("POST", ["api", "tools", "execute"]);
    expect((await POST(req, params)).status).toBe(403);
    expect((await GET(...Object.values(mk("GET", ["api", "db"])) as [any, any])).status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  it("still relays the real Laya endpoints", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })) as any;
    const { req, params } = mk("POST", ["predict"]);
    expect((await POST(req, params)).status).toBe(200);
  });
});
