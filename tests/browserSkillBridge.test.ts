import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

// child_process.spawn is mocked (not spawnSync — the module under test was
// rewritten from spawnSync to async spawn; see lib/browserSkillBridge.ts's
// file header for why) so these tests never depend on a real `bsk` binary
// being installed on whatever machine runs the suite.
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "child_process";
import { detectBsk, runBskCommand, clearBskDetectionCache } from "../lib/browserSkillBridge";

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

/** Queues one spawn() call to behave a certain way; returns the fake child. */
function mockSpawnOnce(behavior: (child: FakeChildProcess) => void): FakeChildProcess {
  const child = new FakeChildProcess();
  (spawn as any).mockImplementationOnce(() => {
    // Defer so the caller's .on()/.stdout.on() listeners are attached
    // before we emit anything.
    setTimeout(() => behavior(child), 0);
    return child;
  });
  return child;
}

function mockSpawnThrowsOnce(err: Error) {
  (spawn as any).mockImplementationOnce(() => {
    throw err;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearBskDetectionCache();
});

describe("detectBsk", () => {
  it("reports installed: true with the version string when the bare 'bsk' command resolves", async () => {
    mockSpawnOnce((child) => {
      child.stdout.emit("data", Buffer.from("bsk 0.4.2\n"));
      child.emit("close", 0);
    });

    const result = await detectBsk();
    expect(result.installed).toBe(true);
    expect(result.command).toBe("bsk");
    expect(result.version).toBe("bsk 0.4.2");
  });

  it("falls back to the ~/.local/bin candidate when the bare command isn't found", async () => {
    mockSpawnOnce((child) => {
      const err: any = new Error("spawn bsk ENOENT");
      err.code = "ENOENT";
      child.emit("error", err);
    });
    mockSpawnOnce((child) => {
      child.stdout.emit("data", Buffer.from("bsk 0.4.2\n"));
      child.emit("close", 0);
    });

    const result = await detectBsk();
    expect(result.installed).toBe(true);
    expect(result.command).toContain(".local");
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it("reports installed: false (not a thrown error) when no candidate resolves", async () => {
    mockSpawnOnce((child) => {
      const err: any = new Error("ENOENT");
      err.code = "ENOENT";
      child.emit("error", err);
    });
    mockSpawnOnce((child) => {
      const err: any = new Error("ENOENT");
      err.code = "ENOENT";
      child.emit("error", err);
    });

    const result = await detectBsk();
    expect(result.installed).toBe(false);
    expect(result.command).toBeUndefined();
  });

  it("treats a non-zero exit status as not installed, even with output on stdout", async () => {
    mockSpawnOnce((child) => {
      child.stdout.emit("data", Buffer.from("command not found"));
      child.emit("close", 1);
    });
    mockSpawnOnce((child) => {
      child.emit("close", 1);
    });

    const result = await detectBsk();
    expect(result.installed).toBe(false);
  });

  it("never throws even if spawn itself throws synchronously", async () => {
    mockSpawnThrowsOnce(new Error("unexpected spawn failure"));
    mockSpawnThrowsOnce(new Error("unexpected spawn failure"));

    await expect(detectBsk()).resolves.not.toThrow();
    clearBskDetectionCache();
    mockSpawnThrowsOnce(new Error("unexpected spawn failure"));
    mockSpawnThrowsOnce(new Error("unexpected spawn failure"));
    const result = await detectBsk();
    expect(result.installed).toBe(false);
  });

  it("caches the result — a second call doesn't spawn again", async () => {
    mockSpawnOnce((child) => {
      child.stdout.emit("data", Buffer.from("bsk 0.4.2\n"));
      child.emit("close", 0);
    });

    await detectBsk();
    await detectBsk();
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});

describe("runBskCommand", () => {
  it("reports success: true with stdout on a clean exit", async () => {
    mockSpawnOnce((child) => {
      child.stdout.emit("data", Buffer.from("done\n"));
      child.emit("close", 0);
    });

    const result = await runBskCommand("bsk", ["doctor", "--json"]);
    expect(result.success).toBe(true);
    expect(result.stdout).toBe("done\n");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("passes args as an array to spawn, never a concatenated shell string", async () => {
    mockSpawnOnce((child) => {
      child.emit("close", 0);
    });

    await runBskCommand("bsk", ["open", "https://example.com; rm -rf /"]);
    const [calledCmd, calledArgs, calledOpts] = (spawn as any).mock.calls[0];
    expect(calledCmd).toBe("bsk");
    expect(calledArgs).toEqual(["open", "https://example.com; rm -rf /"]);
    expect(calledOpts.shell).toBe(false);
  });

  it("reports success: false with stderr on a non-zero exit", async () => {
    mockSpawnOnce((child) => {
      child.stderr.emit("data", Buffer.from("no daemon running\n"));
      child.emit("close", 1);
    });

    const result = await runBskCommand("bsk", ["open", "https://example.com"]);
    expect(result.success).toBe(false);
    expect(result.stderr).toBe("no daemon running\n");
    expect(result.exitCode).toBe(1);
  });

  it("kills the process and reports timedOut when it runs past the timeout", async () => {
    vi.useFakeTimers();
    const child = mockSpawnOnce(() => {
      // Deliberately never emits close/error — simulates a hung process.
    });

    const resultPromise = runBskCommand("bsk", ["open", "https://slow.example.com"], 5000);
    await vi.advanceTimersByTimeAsync(5001);
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    vi.useRealTimers();
  });

  it("falls back to the spawn error message as stderr when the process never started", async () => {
    mockSpawnOnce((child) => {
      child.emit("error", new Error("ENOENT"));
    });

    const result = await runBskCommand("bsk", ["open", "https://example.com"]);
    expect(result.success).toBe(false);
    expect(result.stderr).toBe("ENOENT");
    expect(result.timedOut).toBe(false);
  });

  it("truncates very large stdout instead of buffering it unbounded", async () => {
    const huge = "x".repeat(600_000);
    mockSpawnOnce((child) => {
      child.stdout.emit("data", Buffer.from(huge));
      child.emit("close", 0);
    });

    const result = await runBskCommand("bsk", ["read"]);
    expect(result.stdout.length).toBeLessThan(huge.length);
    expect(result.stdout).toContain("[output truncated]");
  });
});
