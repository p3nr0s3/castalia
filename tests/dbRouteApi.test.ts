import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// The route is a thin wrapper over readServerDb/writeServerDb (whose own
// persistence behavior is covered by tests/serverDbResponseCache.test.ts
// for the cache half and is otherwise exercised end-to-end). What this file
// pins down is the route's HTTP contract: the ?v= version short-circuit the
// multi-device sync relies on, response shape, and 500 handling. serverDb is
// mocked so these tests never read or write the developer's real
// data/db.json.
const readServerDb = vi.fn();
const writeServerDb = vi.fn();

vi.mock("@/lib/serverDb", () => ({
  readServerDb: (...args: any[]) => readServerDb(...args),
  writeServerDb: (...args: any[]) => writeServerDb(...args),
}));

import { GET, POST, OPTIONS } from "../app/api/db/route";

const fakeDb = (version: number) => ({
  conversations: [],
  projects: [],
  agents: [],
  settings: {},
  personas: [],
  pendingApprovals: [],
  lastUpdated: 1000,
  version,
});

describe("Database Sync API (/api/db)", () => {
  beforeEach(() => {
    readServerDb.mockReset();
    writeServerDb.mockReset();
  });

  describe("OPTIONS", () => {
    it("returns 204 with no body", async () => {
      const res = await OPTIONS();
      expect(res.status).toBe(204);
    });
  });

  describe("GET", () => {
    it("returns the full database with changed:true when no client version is given", async () => {
      readServerDb.mockResolvedValue(fakeDb(7));

      const res = await GET(new NextRequest("http://localhost:3000/api/db"));
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.changed).toBe(true);
      expect(data.version).toBe(7);
      expect(data.conversations).toEqual([]);
    });

    it("short-circuits to {changed:false, version} when ?v= matches the server version (the multi-device polling fast path)", async () => {
      readServerDb.mockResolvedValue(fakeDb(7));

      const res = await GET(new NextRequest("http://localhost:3000/api/db?v=7"));
      const data = await res.json();

      expect(data).toEqual({ changed: false, version: 7 });
      // The whole point of the fast path: no conversations/projects payload.
      expect(data.conversations).toBeUndefined();
    });

    it("returns the full database when ?v= is stale (client is behind)", async () => {
      readServerDb.mockResolvedValue(fakeDb(9));

      const res = await GET(new NextRequest("http://localhost:3000/api/db?v=7"));
      const data = await res.json();

      expect(data.changed).toBe(true);
      expect(data.version).toBe(9);
    });

    it("treats a non-numeric ?v= as a mismatch and returns the full database", async () => {
      readServerDb.mockResolvedValue(fakeDb(3));

      const res = await GET(new NextRequest("http://localhost:3000/api/db?v=abc"));
      const data = await res.json();

      // Number("abc") is NaN, which never equals a numeric version.
      expect(data.changed).toBe(true);
    });

    it("returns 500 with the error message when the read fails", async () => {
      readServerDb.mockRejectedValue(new Error("disk unavailable"));

      const res = await GET(new NextRequest("http://localhost:3000/api/db"));
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("disk unavailable");
    });
  });

  describe("POST", () => {
    function postRequest(body: any): NextRequest {
      return new NextRequest("http://localhost:3000/api/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    it("passes the request body to writeServerDb and returns the merged result with changed:true", async () => {
      writeServerDb.mockResolvedValue(fakeDb(8));
      const payload = { conversations: [{ id: "c1" }], version: 7 };

      const res = await POST(postRequest(payload));
      expect(res.status).toBe(200);

      expect(writeServerDb).toHaveBeenCalledWith(payload);
      const data = await res.json();
      expect(data.changed).toBe(true);
      expect(data.version).toBe(8);
    });

    it("returns 500 with the error message when the write fails", async () => {
      writeServerDb.mockRejectedValue(new Error("write conflict"));

      const res = await POST(postRequest({ conversations: [] }));
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("write conflict");
    });

    it("returns 500 (not an unhandled throw) for a malformed JSON body", async () => {
      const req = new NextRequest("http://localhost:3000/api/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not valid json",
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      expect(writeServerDb).not.toHaveBeenCalled();
    });
  });
});
