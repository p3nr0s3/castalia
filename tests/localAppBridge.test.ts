import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  generateAndStoreBridgeToken,
  getBridgeToken,
  deleteBridgeToken,
  testBridgeConnection,
  executeBridgeAction,
  SsrfBlockedError,
} from "../lib/localAppBridge";
import type { BridgeDefinition } from "../lib/localAppBridge";

// generateAndStoreBridgeToken/getBridgeToken write to
// <process.cwd()>/data/<id>-bridge-token.json. Redirect process.cwd() to
// an isolated temp dir for the duration of this suite so tests never
// touch the real project's data/ folder (which may hold real tokens/db
// state) and don't leave files behind.
let tmpCwd: string;
const realCwd = process.cwd();

const testBridge: BridgeDefinition = {
  id: "test-app",
  displayName: "Test App",
  defaultUrl: "http://127.0.0.1:9999",
  executePath: "/execute",
};

beforeEach(() => {
  tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(tmpCwd);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpCwd, { recursive: true, force: true });
});

describe("token lifecycle", () => {
  it("returns empty string when no token has been generated yet", () => {
    expect(getBridgeToken(testBridge)).toBe("");
  });

  it("generates, persists, and reads back a token", () => {
    const token = generateAndStoreBridgeToken(testBridge);
    expect(token).toHaveLength(48); // 24 bytes hex-encoded
    expect(getBridgeToken(testBridge)).toBe(token);
  });

  it("generating a new token overwrites the previous one", () => {
    const first = generateAndStoreBridgeToken(testBridge);
    const second = generateAndStoreBridgeToken(testBridge);
    expect(second).not.toBe(first);
    expect(getBridgeToken(testBridge)).toBe(second);
  });

  it("deleteBridgeToken removes the token file, and getBridgeToken falls back to empty", () => {
    generateAndStoreBridgeToken(testBridge);
    expect(getBridgeToken(testBridge)).not.toBe("");
    deleteBridgeToken(testBridge);
    expect(getBridgeToken(testBridge)).toBe("");
  });

  it("deleteBridgeToken on a token that was never created is a harmless no-op", () => {
    expect(() => deleteBridgeToken(testBridge)).not.toThrow();
  });

  it("tokens for different bridge ids are stored independently", () => {
    const bridgeA: BridgeDefinition = { ...testBridge, id: "app-a" };
    const bridgeB: BridgeDefinition = { ...testBridge, id: "app-b" };
    const tokenA = generateAndStoreBridgeToken(bridgeA);
    const tokenB = generateAndStoreBridgeToken(bridgeB);
    expect(getBridgeToken(bridgeA)).toBe(tokenA);
    expect(getBridgeToken(bridgeB)).toBe(tokenB);
    expect(tokenA).not.toBe(tokenB);
  });
});

describe("testBridgeConnection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a non-loopback URL before making any request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(testBridgeConnection(testBridge, "http://192.168.1.50:9999")).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports reachable: true with parsed JSON details on a 200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok", version: "1.0" }) })
    );
    const result = await testBridgeConnection(testBridge, "http://127.0.0.1:9999");
    expect(result.reachable).toBe(true);
    expect(result.details).toEqual({ status: "ok", version: "1.0" });
  });

  it("reports reachable: false on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const result = await testBridgeConnection(testBridge, "http://127.0.0.1:9999");
    expect(result.reachable).toBe(false);
  });

  it("reports reachable: false (not a thrown error) when the connection fails entirely", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await testBridgeConnection(testBridge, "http://127.0.0.1:9999");
    expect(result.reachable).toBe(false);
  });
});

describe("executeBridgeAction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a non-loopback URL before making any request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(executeBridgeAction(testBridge, "http://evil.example:9999", {})).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("succeeds via the primary executePath endpoint", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "done" }) });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await executeBridgeAction(testBridge, "http://127.0.0.1:9999", { code: "print(1)" });
    expect(result.success).toBe(true);
    expect(result.message).toBe("done");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("http://127.0.0.1:9999/execute");
  });

  it("falls back to the bare URL when the executePath endpoint fails", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: "done via fallback" }) });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await executeBridgeAction(testBridge, "http://127.0.0.1:9999", { code: "print(1)" });
    expect(result.success).toBe(true);
    expect(result.message).toBe("done via fallback");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][0]).toBe("http://127.0.0.1:9999");
  });

  it("skips the executePath attempt entirely when the bridge defines none", async () => {
    const bridgeNoPath: BridgeDefinition = { ...testBridge, executePath: undefined };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "ok" }) });
    vi.stubGlobal("fetch", fetchSpy);

    await executeBridgeAction(bridgeNoPath, "http://127.0.0.1:9999", {});
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("http://127.0.0.1:9999");
  });

  it("reports isAuthRejected on a 401, distinct from isBridgeOffline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const result = await executeBridgeAction(testBridge, "http://127.0.0.1:9999", {});
    expect(result.success).toBe(false);
    expect(result.isAuthRejected).toBe(true);
    expect(result.isBridgeOffline).toBeUndefined();
  });

  it("reports isBridgeOffline (not a thrown error) when the bridge is entirely unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await executeBridgeAction(testBridge, "http://127.0.0.1:9999", { code: "x" });
    expect(result.success).toBe(false);
    expect(result.isBridgeOffline).toBe(true);
  });

  it("sends the stored bridge token as X-Bridge-Token when one exists", async () => {
    const token = generateAndStoreBridgeToken(testBridge);
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchSpy);

    await executeBridgeAction(testBridge, "http://127.0.0.1:9999", {});
    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers["X-Bridge-Token"]).toBe(token);
  });

  it("omits the token header entirely when no token has been generated", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchSpy);

    await executeBridgeAction(testBridge, "http://127.0.0.1:9999", {});
    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers["X-Bridge-Token"]).toBeUndefined();
  });
});
