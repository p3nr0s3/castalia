import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

// Fake child_process.ChildProcess: an EventEmitter with stdout/stderr streams
// (also EventEmitters) so graphifyOps' .on("data"/"error"/"close") wiring can
// be driven directly from the test without spawning a real process.
// A fresh instance is created per spawn() call — sharing one instance across
// calls silently makes every call answer with whatever the LAST call's
// output was set to, which is a real trap here since ensureGraphBuilt's
// dedup logic means call order between concurrent tool calls isn't fixed.
class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

const spawnMock = vi.fn((_cmd: string, _args: string[]) => new FakeChild());

vi.mock("child_process", () => ({
  spawn: (cmd: string, args: string[]) => spawnMock(cmd, args),
}));

function succeed(child: FakeChild, stdout: string) {
  child.stdout.emit("data", Buffer.from(stdout));
  child.emit("close", 0);
}

function fail(child: FakeChild, code: number, stderr: string) {
  child.stderr.emit("data", Buffer.from(stderr));
  child.emit("close", code);
}

/** The FakeChild returned by the Nth spawn() call so far (0-indexed). */
function childOf(n: number): FakeChild {
  return spawnMock.mock.results[n].value as unknown as FakeChild;
}

/** The FakeChild from the spawn() call whose first CLI arg matches (e.g. "explain"). */
function childForCommand(cmdName: string): FakeChild {
  const idx = spawnMock.mock.calls.findIndex((c) => c[1][0] === cmdName);
  if (idx === -1) throw new Error(`no spawn call found for command "${cmdName}"`);
  return childOf(idx);
}

describe("graphifyOps", () => {
  beforeEach(() => {
    vi.resetModules();
    spawnMock.mockClear();
  });

  it("builds the graph once then runs explain, returning the CLI's stdout", async () => {
    const { explainSymbol } = await import("../lib/graphifyOps");

    const promise = explainSymbol("runDiskTool");

    // First spawn call is the `extract` build.
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0][1][0]).toBe("extract");
    succeed(childOf(0), "");

    // Second spawn call is the actual `explain`.
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
    expect(spawnMock.mock.calls[1][1][0]).toBe("explain");
    expect(spawnMock.mock.calls[1][1]).toContain("runDiskTool");
    succeed(childOf(1), "Node: runDiskTool()\n  ...");

    const result = await promise;
    expect(result).toContain("runDiskTool()");
  });

  it("dedupes concurrent build-triggering calls into a single extract", async () => {
    const { explainSymbol, queryGraph } = await import("../lib/graphifyOps");

    const p1 = explainSymbol("a");
    const p2 = queryGraph("what calls a?");

    // Only one extract in flight for both concurrent calls.
    expect(spawnMock.mock.calls.filter((c) => c[1][0] === "extract")).toHaveLength(1);
    succeed(childOf(0), "");

    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(3));
    succeed(childForCommand("explain"), "explain output");
    succeed(childForCommand("query"), "query output");

    await expect(p1).resolves.toBe("explain output");
    await expect(p2).resolves.toBe("query output");
  });

  it("raises a clear error when the graphify binary isn't on PATH", async () => {
    const { explainSymbol, GraphifyError } = await import("../lib/graphifyOps");

    const promise = explainSymbol("x");
    const err: NodeJS.ErrnoException = new Error("spawn graphify ENOENT");
    err.code = "ENOENT";
    childOf(0).emit("error", err);

    await expect(promise).rejects.toBeInstanceOf(GraphifyError);
    await expect(promise).rejects.toThrow(/pip install graphifyy/);
  });

  it("surfaces stderr when the CLI exits non-zero", async () => {
    const { explainSymbol } = await import("../lib/graphifyOps");

    const promise = explainSymbol("x");
    succeed(childOf(0), ""); // extract build succeeds

    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
    fail(childOf(1), 1, "no such node: x");

    await expect(promise).rejects.toThrow(/no such node: x/);
  });

  it("retries the build on the next call after a failed extract, instead of caching the failure", async () => {
    const { explainSymbol } = await import("../lib/graphifyOps");

    const firstAttempt = explainSymbol("x").catch((e) => e);
    fail(childOf(0), 1, "extraction blew up");
    await firstAttempt;

    const secondAttempt = explainSymbol("x");
    await vi.waitFor(() => expect(spawnMock.mock.calls.filter((c) => c[1][0] === "extract")).toHaveLength(2));
    succeed(childOf(1), "");
    await vi.waitFor(() => expect(spawnMock.mock.calls.filter((c) => c[1][0] === "explain")).toHaveLength(1));
    succeed(childForCommand("explain"), "ok this time");

    await expect(secondAttempt).resolves.toBe("ok this time");
  });
});
