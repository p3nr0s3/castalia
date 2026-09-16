import { spawnSync } from "child_process";
import os from "os";
import path from "path";

/**
 * BrowserSkill (`bsk`) detection + invocation primitive.
 *
 * Companion to lib/localAppBridge.ts, but for a fundamentally different
 * kind of local app. BrowserSkill (https://github.com/Tencent/BrowserSkill)
 * isn't a long-running HTTP server you fetch() the way the Blender MCP
 * bridge is — it's a CLI (`bsk`) that talks to its own local daemon over
 * IPC, which in turn drives a browser extension over a loopback
 * WebSocket. There's no single "port + endpoint path" to hit directly,
 * so localAppBridge's BridgeDefinition / executeBridgeAction shape
 * (built around fetch()) doesn't fit here. This module wraps a CLI
 * invocation (spawnSync) instead, following the same conventions already
 * used for the codespace runner in app/api/codespace/run/route.ts:
 * an argument array (never a shell string), shell: false, and a bounded
 * timeout.
 *
 * Scope of this first pass: availability detection and a generic,
 * argument-array command runner only. It does NOT yet know the actual
 * bsk subcommands for driving a browser (open/click/read/etc.) — those
 * are defined by BrowserSkill's own skill/SKILL.md and are meant to be
 * issued one at a time by an agent loop, not invoked as a single
 * black-box call. Wiring that up is a deliberate follow-up, once we've
 * read skill/SKILL.md and docs/scroll-to.md from the BrowserSkill repo
 * (or the output of `bsk --help` on a machine that has it installed)
 * rather than guessing at a command surface from the README alone.
 */

export interface BskStatus {
  installed: boolean;
  /** The command or path that resolved — e.g. "bsk", or the full path found under ~/.local/bin. */
  command?: string;
  /** Raw stdout+stderr from `bsk --version`. */
  version?: string;
}

const CANDIDATE_COMMANDS = ["bsk"];

/**
 * Extra candidate paths to check besides PATH, matching install.sh /
 * install.ps1's default install location (~/.local/bin) — the same spot
 * BrowserSkill's own docs say it installs to on macOS, Linux, and
 * Windows (via PowerShell). Checked after the bare "bsk" command so a
 * PATH-resolved install (the common case once a new shell has been
 * opened) is always preferred.
 */
function extraCandidatePaths(): string[] {
  const home = os.homedir();
  const localBin = path.join(home, ".local", "bin");
  const exeName = process.platform === "win32" ? "bsk.exe" : "bsk";
  return [path.join(localBin, exeName)];
}

/**
 * Checks whether the `bsk` CLI is installed and reachable, without
 * touching the browser/daemon/extension at all — `bsk --version` doesn't
 * require the daemon or extension to be running, only the CLI binary
 * itself. Mirrors findPythonBinary's approach in
 * app/api/codespace/run/route.ts: try each candidate with a short
 * timeout via spawnSync, shell: false, and treat any non-zero exit or
 * thrown error as "not this one" rather than a hard failure, so a
 * missing binary never surfaces as an unhandled exception to callers.
 */
export function detectBsk(): BskStatus {
  const candidates = [...CANDIDATE_COMMANDS, ...extraCandidatePaths()];

  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate, ["--version"], {
        timeout: 2000,
        encoding: "utf-8",
        shell: false,
      });

      if (result.status === 0) {
        const output = ((result.stdout || "") + (result.stderr || "")).trim();
        if (output) {
          return { installed: true, command: candidate, version: output };
        }
      }
    } catch {
      // Not found via this candidate — try the next one.
    }
  }

  return { installed: false };
}

export interface BskCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /**
   * Best-effort: true when the process appears to have been killed by
   * the timeout rather than exiting on its own (status is null and a
   * kill signal is present). A process an external actor killed for an
   * unrelated reason would look the same — this is a heuristic, not a
   * guarantee, same caveat as isTimedOut in the codespace runner.
   */
  timedOut: boolean;
}

const MAX_OUTPUT_CHARS = 500_000;

function truncate(text: string): string {
  return text.length > MAX_OUTPUT_CHARS
    ? text.slice(0, MAX_OUTPUT_CHARS) + "\n... [output truncated]"
    : text;
}

/**
 * Runs an arbitrary `bsk` subcommand with a bounded timeout. `args` is
 * always an argument array, never concatenated into a shell string
 * (shell: false), so there is no shell-injection surface here regardless
 * of what a caller passes as an argument value.
 *
 * This is intentionally generic — it doesn't know what a "browser task"
 * looks like. Callers supply the actual bsk subcommand and its args once
 * that command surface is defined (see the module docstring above).
 */
export function runBskCommand(command: string, args: string[], timeoutMs = 15000): BskCommandResult {
  const result = spawnSync(command, args, {
    timeout: timeoutMs,
    encoding: "utf-8",
    shell: false,
  });

  const timedOut = result.status === null && result.signal !== null;

  return {
    success: result.status === 0 && !timedOut,
    stdout: truncate(result.stdout || ""),
    stderr: truncate(result.stderr || (result.error ? result.error.message : "")),
    exitCode: result.status,
    timedOut,
  };
}
