import { describe, it, expect } from "vitest";
import { GET, OPTIONS } from "../app/api/browser/status/route";

describe("Browser status API (/api/browser/status)", () => {
  it("returns a well-formed status payload regardless of whether bsk is actually installed on this machine", async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(typeof data.installed).toBe("boolean");

    // The dev/CI machine running this suite almost certainly doesn't have
    // bsk installed, but we don't hard-assert installed: false — the
    // route's job is to report reality accurately, not a specific value.
    if (data.installed) {
      expect(typeof data.command).toBe("string");
      expect(typeof data.version).toBe("string");
    } else {
      expect(data.command).toBeUndefined();
      expect(data.version).toBeUndefined();
    }
  });

  it("responds to OPTIONS with 204 for CORS preflight", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
  });
});
