import { describe, it, expect } from "vitest";
import { POST } from "../app/api/codespace/run/route";
import { NextRequest } from "next/server";

function createMockRequest(body: Record<string, any>): NextRequest {
  return new NextRequest("http://localhost:3000/api/codespace/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Codespace Backend Runner API (/api/codespace/run)", () => {
  it("executes JavaScript code via Node.js runtime and returns stdout", async () => {
    const req = createMockRequest({
      code: `console.log("HELLO FROM CODESPACE RUNNER"); const sum = 10 + 32; console.log("SUM:" + sum);`,
      language: "javascript",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.output).toContain("HELLO FROM CODESPACE RUNNER");
    expect(data.output).toContain("SUM:42");
    expect(data.exitCode).toBe(0);
    expect(typeof data.executionTimeMs).toBe("number");
    expect(data.runner).toBe("node.js");
  });

  it("executes TypeScript code with native type stripping", async () => {
    const req = createMockRequest({
      code: `
        interface Result {
          status: string;
          code: number;
        }
        const res: Result = { status: "success", code: 200 };
        console.log("TS_STATUS:" + res.status);
      `,
      language: "typescript",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.output).toContain("TS_STATUS:success");
    expect(data.exitCode).toBe(0);
  });

  it("captures runtime errors and non-zero exit codes", async () => {
    const req = createMockRequest({
      code: `throw new Error("Deliberate Codespace Test Exception");`,
      language: "javascript",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
    expect(data.stderr).toContain("Deliberate Codespace Test Exception");
    expect(data.exitCode).not.toBe(0);
  });

  it("returns 400 when code is missing", async () => {
    const req = createMockRequest({
      language: "javascript",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("Missing or invalid 'code'");
  });

  it("returns structured notFound or runs when python is queried", async () => {
    const req = createMockRequest({
      code: `print("Python Test Execution")`,
      language: "python",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    // If native python exists on the system, it will succeed.
    // If not, it will return notFound: true with a descriptive message.
    if (data.notFound) {
      expect(data.success).toBe(false);
      expect(data.message).toContain("Pyodide");
    } else {
      expect(data.success).toBe(true);
      expect(data.output).toContain("Python Test Execution");
    }
  });
});
