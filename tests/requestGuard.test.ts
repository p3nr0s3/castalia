import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { constantTimeEqual, isAllowedHost, isTrustedOrigin } from "../lib/requestGuard";
import { middleware } from "../middleware";

describe("edge-runtime safety (regression: token auth returned HTTP 500)", () => {
  const NODE_ONLY = /from\s+["'](?:node:)?(crypto|fs|path|os|net|dns|child_process|buffer|stream|http|https|zlib|util)(?:\/\w+)?["']|\bBuffer\b|require\(/;
  for (const file of ["middleware.ts", "lib/requestGuard.ts"]) {
    it(`${file} imports no Node built-ins and does not use Buffer`, () => {
      const src = fs
        .readFileSync(path.join(__dirname, "..", file), "utf-8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(src).not.toMatch(NODE_ONLY);
    });
  }
});

describe("constantTimeEqual", () => {
  it("compares equal and unequal strings, including different lengths and unicode", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("", "x")).toBe(false);
    expect(constantTimeEqual("tökén", "tökén")).toBe(true);
  });
});

describe("isAllowedHost", () => {
  it("allows loopback, IP literals, single-label and mDNS names, tunnel domains", () => {
    for (const h of ["localhost:3000", "LOCALHOST", "127.0.0.1:3000", "[::1]:3000", "192.168.1.101:3000", "mypc:3000", "mypc.local:3000", "app.localhost", "abc.a.free.pinggy.link", "x.run.pinggy-free.link"]) {
      expect(isAllowedHost(h, ""), h).toBe(true);
    }
  });

  it("rejects attacker-controlled DNS names (the DNS-rebinding shape)", () => {
    for (const h of ["evil.example", "evil.example:3000", "127.0.0.1.evil.example", "localhost.evil.com", "pinggy.link.evil.com", ""]) {
      expect(isAllowedHost(h, ""), h).toBe(false);
    }
    expect(isAllowedHost(null, "")).toBe(false);
    expect(isAllowedHost("bad host", "")).toBe(false);
  });

  it("honours ALLOWED_HOSTS (exact, suffix, wildcard)", () => {
    expect(isAllowedHost("chat.example.com", "chat.example.com")).toBe(true);
    expect(isAllowedHost("a.internal.corp", ".internal.corp")).toBe(true);
    expect(isAllowedHost("a.internal.corp", "*.internal.corp")).toBe(true);
    expect(isAllowedHost("other.example.com", "chat.example.com")).toBe(false);
    expect(isAllowedHost("anything.test", "*")).toBe(true);
  });
});

describe("isTrustedOrigin", () => {
  const base = { secFetchSite: null, origin: null, host: "localhost:3000" };
  it("accepts same-origin, user navigation, and non-browser clients", () => {
    expect(isTrustedOrigin({ ...base, secFetchSite: "same-origin" })).toBe(true);
    expect(isTrustedOrigin({ ...base, secFetchSite: "none" })).toBe(true);
    expect(isTrustedOrigin(base)).toBe(true);
    expect(isTrustedOrigin({ ...base, origin: "http://localhost:3000" })).toBe(true);
  });
  it("rejects cross-site AND same-site (another local port) and opaque origins", () => {
    expect(isTrustedOrigin({ ...base, secFetchSite: "cross-site" })).toBe(false);
    expect(isTrustedOrigin({ ...base, secFetchSite: "same-site" })).toBe(false);
    expect(isTrustedOrigin({ ...base, origin: "http://localhost:8080" })).toBe(false);
    expect(isTrustedOrigin({ ...base, origin: "null" })).toBe(false);
  });
  it("allows only the explicitly configured external origin", () => {
    const ext = { ...base, secFetchSite: "cross-site", allowedExternalOrigin: "https://companion.example" };
    expect(isTrustedOrigin({ ...ext, origin: "https://companion.example" })).toBe(true);
    expect(isTrustedOrigin({ ...ext, origin: "https://evil.example" })).toBe(false);
  });
});

describe("middleware", () => {
  const saved = { t: process.env.APP_ACCESS_TOKEN, e: process.env.ALLOW_EXTERNAL_ORIGIN, h: process.env.ALLOWED_HOSTS };
  afterEach(() => {
    for (const [k, v] of [["APP_ACCESS_TOKEN", saved.t], ["ALLOW_EXTERNAL_ORIGIN", saved.e], ["ALLOWED_HOSTS", saved.h]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  function req(pathname: string, init: { method?: string; headers?: Record<string, string> } = {}) {
    return new NextRequest(`http://localhost:3000${pathname}`, {
      method: init.method || "GET",
      headers: { host: "localhost:3000", ...(init.headers || {}) },
    });
  }
  const status = (res: Response) => (res.headers.get("x-middleware-next") === "1" ? 200 : res.status);

  it("accepts the CORRECT token (regression: this used to be a 500)", () => {
    process.env.APP_ACCESS_TOKEN = "secret123";
    expect(status(middleware(req("/api/cache", { headers: { authorization: "Bearer secret123" } })))).toBe(200);
  });

  it("rejects wrong / missing / same-length-wrong tokens with 401", () => {
    process.env.APP_ACCESS_TOKEN = "secret123";
    expect(middleware(req("/api/cache")).status).toBe(401);
    expect(middleware(req("/api/cache", { headers: { authorization: "Bearer nope" } })).status).toBe(401);
    expect(middleware(req("/api/cache", { headers: { authorization: "Bearer secret124" } })).status).toBe(401);
  });

  it("only accepts ?token= on the SSE route", () => {
    process.env.APP_ACCESS_TOKEN = "secret123";
    expect(status(middleware(req("/api/db/stream?token=secret123")))).toBe(200);
    expect(middleware(req("/api/cache?token=secret123")).status).toBe(401);
  });

  it("is open when no token is configured (local dev)", () => {
    delete process.env.APP_ACCESS_TOKEN;
    expect(status(middleware(req("/api/cache")))).toBe(200);
  });

  it("blocks a spoofed Host on API routes AND on pages (DNS rebinding)", () => {
    delete process.env.APP_ACCESS_TOKEN;
    expect(middleware(req("/api/codespace/run", { method: "POST", headers: { host: "evil.example:3000", "sec-fetch-site": "same-origin" } })).status).toBe(403);
    expect(middleware(req("/", { headers: { host: "evil.example:3000" } })).status).toBe(403);
    expect(status(middleware(req("/", { headers: { host: "127.0.0.1:3000" } })))).toBe(200);
  });

  it("blocks cross-site AND same-site state-changing calls on ANY api route (incl. /api/db, /api/cache, the Ollama proxy)", () => {
    delete process.env.APP_ACCESS_TOKEN;
    for (const p of ["/api/db", "/api/cache", "/api/ollama/api/chat", "/api/cloud/chat", "/api/projects/watcher", "/api/codespace/run"]) {
      for (const site of ["cross-site", "same-site"]) {
        expect(middleware(req(p, { method: "POST", headers: { "sec-fetch-site": site } })).status, `${p} ${site}`).toBe(403);
      }
    }
  });

  it("lets the app's own same-origin calls through", () => {
    delete process.env.APP_ACCESS_TOKEN;
    expect(status(middleware(req("/api/db", { method: "POST", headers: { "sec-fetch-site": "same-origin" } })))).toBe(200);
  });

  it("requires same-origin even for GET on sensitive routes, but not for harmless ones", () => {
    delete process.env.APP_ACCESS_TOKEN;
    expect(middleware(req("/api/fs?path=/", { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect(status(middleware(req("/api/cache?key=x", { headers: { "sec-fetch-site": "cross-site" } })))).toBe(200);
  });

  it("checks Origin against Host when Sec-Fetch-Site is absent (older browsers)", () => {
    delete process.env.APP_ACCESS_TOKEN;
    expect(middleware(req("/api/db", { method: "POST", headers: { origin: "http://evil.example" } })).status).toBe(403);
    expect(status(middleware(req("/api/db", { method: "POST", headers: { origin: "http://localhost:3000" } })))).toBe(200);
  });
});
