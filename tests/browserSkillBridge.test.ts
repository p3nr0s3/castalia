import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SpawnSyncReturns } from "child_process";
import { detectBsk, runBskCommand } from "../lib/browserSkillBridge";

// vitest hoists vi.mock calls above regular imports (same as
// tests/fileWatcher.test.ts mocking ../lib/serverDb), so the import
// above already resolves against this mocked child_process.
const spawnSyncMock = vi.fn();

vi.mock("child_process", () => ({
  spawnSync: (...args: any[]) => spawnSyncMock(...args),
}));

function fakeResult(overrides: Partial<SpawnSyncReturns<string>>): SpawnSyncReturns<string> {
  return {
    pid: 1234,
    output: [],
    stdout: "",
    stderr: "",
    status: 0,
    signal: null,
    error: undefined,
    ...overrides,
  } as SpawnSyncReturns<string>;
}

beforeEach(() => {
  spawnSyncMock.mockReset();
});

describe("detectBsk", () => {
  it("reports installed: true with the version string when the bare 'bsk' command resolves", () => {
    spawnSyncMock.mockReturnValueOnce(fakeResult({ status: 0, stdout: "bsk 0.4.2\n" }));

    const result = detectBsk();
    expect(result.installed).toBe(true);
    expect(result.command).toBe("bsk");
    expect(result.version).toBe("bsk 0.4.2");
  });

  it("falls back to the ~/.local/bin candidate when the bare command isn't found", () => {
    spawnSyncMock
      .mockReturnValueOnce(fakeResult({ status: null, error: new Error("ENOENT") }))
      .mockReturnValueOnce(fakeResult({ status: 0, stdout: "bsk 0.4.2\n" }));

    const result = detectBsk();
    expect(result.installed).toBe(true);
    expect(result.command).toContain(".local");
    expect(spawnSyncMock).toHaveBeenCalledTimes(2);
  });

  it("reports installed: false (not a thrown error) when no candidate resolves", () => {
    spawnSyncMock.mockReturnValue(fakeResult({ status: null, error: new Error("ENOENT") }));

    const result = detectBsk();
    expect(result.installed).toBe(false);
    expect(result.command).toBeUndefined();
  });

  it("treats a non-zero exit status as not installed, even with output on stdout", () => {
    spawnSyncMock.mockReturnValue(fakeResult({ status: 1, stdout: "command not found" }));

    const result = detectBsk();
    expect(result.installed).toBe(false);
  });

  it("never throws even if spawnSync itself throws synchronously", () => {
    spawnSyncMock.mockImplementation(() => {
      throw new Error("unexpected spawn failure");
    });

    expect(() => detectBsk()).not.toThrow();
    expect(detectBsk().installed).toBe(false);
  });
});

describe("runBskCommand", () => {
  it("reports success: true with stdout on a clean exit", () => {
    spawnSyncMock.mockReturnValueOnce(fakeResult({ status: 0, stdout: "done\n" }));

    const result = runBskCommand("bsk", ["doctor", "--json"]);
    expect(result.success).toBe(true);
    expect(result.stdout).toBe("done\n");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("passes args as an array to spawnSync, never a concatenated shell string", () => {
    spawnSyncMock.mockReturnValueOnce(fakeResult({ status: 0 }));

    runBskCommand("bsk", ["open", "https://example.com; rm -rf /"]);
    const [, calledArgs, calledOpts] = spawnSyncMock.mock.calls[0];
    expect(calledArgs).toEqual(["open", "https://example.com; rm -rf /"]);
    expect(calledOpts.shell).toBe(false);
  });

  it("reports success: false with stderr on a non-zero exit", () => {
    spawnSyncMock.mockReturnValueOnce(fakeResult({ status: 1, stderr: "no daemon running\n" }));

    const result = runBskCommand("bsk", ["open", "https://example.com"]);
    expect(result.success).toBe(false);
    expect(result.stderr).toBe("no daemon running\n");
    expect(result.exitCode).toBe(1);
  });

  it("detects a timeout (status null, signal present) and reports it distinctly from a normal failure", () => {
    spawnSyncMock.mockReturnValueOnce(fakeResult({ status: null, signal: "SIGTERM" }));

    const result = runBskCommand("bsk", ["open", "https://slow.example.com"], 5000);
    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
  });

  it("falls back to the spawn error message as stderr when the process never started", () => {
    spawnSyncMock.mockReturnValueOnce(fakeResult({ status: null, signal: null, error: new Error("ENOENT") }));

    const result = runBskCommand("bsk", ["open", "https://example.com"]);
    expect(result.success).toBe(false);
    expect(result.stderr).toBe("ENOENT");
    expect(result.timedOut).toBe(false);
  });

  it("truncates very large stdout instead of buffering it unbounded", () => {
    const huge = "x".repeat(600_000);
    spawnSyncMock.mockReturnValueOnce(fakeResult({ status: 0, stdout: huge }));

    const result = runBskCommand("bsk", ["read"]);
    expect(result.stdout.length).toBeLessThan(huge.length);
    expect(result.stdout).toContain("[output truncated]");
  });
});
