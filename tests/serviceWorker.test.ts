import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";

/** Loads public/sw.js into a sandbox that mimics a ServiceWorkerGlobalScope and returns its handlers. */
function loadSw() {
  const listeners: Record<string, (e: any) => void> = {};
  const cachesData = new Map<string, Map<string, any>>();
  const caches = {
    open: async (name: string) => {
      if (!cachesData.has(name)) cachesData.set(name, new Map());
      const store = cachesData.get(name)!;
      return { match: async (r: any) => store.get(typeof r === "string" ? r : r.url), put: async (r: any, res: any) => void store.set(r.url, res), addAll: async (urls: string[]) => urls.forEach((u) => store.set(u, { ok: true, url: u })) };
    },
    keys: async () => [...cachesData.keys()],
    delete: async (k: string) => cachesData.delete(k),
    match: async (u: string) => { for (const s of cachesData.values()) if (s.has(u)) return s.get(u); return undefined; },
  };
  const network = vi.fn(async (_r: any) => ({ ok: true, clone() { return this; }, tag: "network" }));
  const self: any = { location: { origin: "http://localhost:3000" }, addEventListener: (t: string, fn: any) => (listeners[t] = fn), skipWaiting: vi.fn(), clients: { claim: vi.fn() } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "public", "sw.js"), "utf-8"), { self, caches, fetch: network, URL, Promise });
  const fetchEvent = (url: string, init: { method?: string; mode?: string; headers?: Record<string, string> } = {}) => {
    const responded: { promise?: Promise<any> } = {};
    const request = { url, method: init.method || "GET", mode: init.mode || "no-cors", headers: { has: (h: string) => h.toLowerCase() in (init.headers || {}) } };
    listeners.fetch({ request, respondWith: (p: Promise<any>) => (responded.promise = Promise.resolve(p)) });
    return responded;
  };
  /** Fires a lifecycle event and waits for whatever the worker passed to event.waitUntil(). */
  const lifecycle = async (type: "install" | "activate") => {
    let pending: Promise<any> | undefined;
    listeners[type]({ waitUntil: (p: Promise<any>) => (pending = p) });
    await pending;
  };
  return { listeners, caches, cachesData, network, self, fetchEvent, lifecycle };
}

const O = "http://localhost:3000";

describe("service worker (public/sw.js)", () => {
  it("never intercepts API calls, SSE, other origins, non-GET requests or range requests", () => {
    const { fetchEvent, network } = loadSw();
    for (const [url, init] of [
      [`${O}/api/db`, {}], [`${O}/api/db/stream?token=x`, {}], [`${O}/api/codespace/run`, { method: "POST" }],
      ["https://cdn.jsdelivr.net/pyodide/pyodide.js", {}], [`${O}/_next/static/a.js`, { method: "POST" }], [`${O}/manifest.json`, { headers: { range: "bytes=0-1" } }],
    ] as const) {
      expect(fetchEvent(url, init as any).promise, url).toBeUndefined();
    }
    expect(network).not.toHaveBeenCalled();
  });

  it("navigations: network first, and /offline.html only when the network fails", async () => {
    const { fetchEvent, network, lifecycle, cachesData } = loadSw();
    await lifecycle("install");
    const online = await fetchEvent(`${O}/`, { mode: "navigate" }).promise;
    expect((online as any).tag).toBe("network");
    network.mockRejectedValueOnce(new Error("offline"));
    const offline = await fetchEvent(`${O}/`, { mode: "navigate" }).promise;
    expect((offline as any).url).toBe("/offline.html");
    // HTML is never stored
    expect([...cachesData.values()].some((s) => s.has(`${O}/`))).toBe(false);
  });

  it("hashed build assets are cache-first: fetched once, then served from cache", async () => {
    const { fetchEvent, network } = loadSw();
    const url = `${O}/_next/static/chunks/app-abc123.js`;
    await fetchEvent(url).promise;
    await fetchEvent(url).promise;
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("does not cache failed responses", async () => {
    const { fetchEvent, network } = loadSw();
    network.mockResolvedValue({ ok: false, clone() { return this; } } as any);
    const url = `${O}/_next/static/chunks/missing.js`;
    await fetchEvent(url).promise;
    await fetchEvent(url).promise;
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("install precaches the offline page; activate removes only old Lyra caches", async () => {
    const { lifecycle, cachesData, self } = loadSw();
    await lifecycle("install");
    expect(cachesData.get("lyra-sw-v1-shell")!.has("/offline.html")).toBe(true);
    expect(self.skipWaiting).toHaveBeenCalled();
    cachesData.set("lyra-sw-v0-static", new Map());
    cachesData.set("someone-elses-cache", new Map());
    await lifecycle("activate");
    expect([...cachesData.keys()].sort()).toEqual(["lyra-sw-v1-shell", "someone-elses-cache"]);
    expect(self.clients.claim).toHaveBeenCalled();
  });
});

describe("PWA assets", () => {
  it("ships the offline page and a manifest that can be installed", () => {
    const root = path.join(__dirname, "..", "public");
    expect(fs.existsSync(path.join(root, "offline.html"))).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf-8"));
    expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
    expect(manifest.icons.length).toBeGreaterThan(0);
    // every precached file must exist, or cache.addAll() rejects and the worker never installs
    const sw = fs.readFileSync(path.join(root, "sw.js"), "utf-8");
    const assets = JSON.parse(/SHELL_ASSETS = (\[.*?\]);/.exec(sw)![1].replace(/OFFLINE_URL/g, '"/offline.html"'));
    for (const a of assets) expect(fs.existsSync(path.join(root, a)), a).toBe(true);
  });
});
