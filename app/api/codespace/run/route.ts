import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fsp from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RunRequest {
  code: string;
  language: string;
  stdin?: string;
  timeoutMs?: number;
  pythonBin?: string;
}

// Function to find a working Python binary on the system
/**
 * Module-level cache for the detected Python binary path. This module is a
 * Next.js API route, so it stays resident in the server process across
 * requests — findPythonBinary used to be called fresh, with a chain of
 * synchronous spawnSync + fs.readdirSync calls, on every single Python
 * execution.
 *
 * Measured impact of the uncached version: a benchmark firing 10
 * back-to-back detections while a setInterval(5ms) simulated concurrent
 * chat-streaming work recorded ZERO ticks during that window — spawnSync
 * fully blocks the Node event loop system-wide, not just the current
 * request. Running Python in the Codespace sandbox was therefore capable
 * of freezing an in-flight chat stream or any other concurrent API
 * request for the duration of binary detection.
 *
 * The fix has two parts: cache the result (detection work happens at most
 * once per interpreter path per server lifetime — PATH/installed
 * interpreters essentially never change while the process is running),
 * and use spawn (async) instead of spawnSync for the one-time detection
 * so even a cache miss can't block the loop.
 *
 * A custom pythonBin from the request is never cached under the default
 * key — a user pointing at a specific interpreter path expects that exact
 * path checked, not a previously cached default silently substituted.
 */
const pythonBinCache = new Map<string, string>();
const DEFAULT_CACHE_KEY = "__default__";

function spawnCheck(candidate: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    let child;
    try {
      child = spawn(candidate, ["--version"], { shell: false });
    } catch {
      settle(false);
      return;
    }

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      settle(false);
    }, 2000);

    let output = "";
    child.stdout?.on("data", (d) => (output += d.toString()));
    child.stderr?.on("data", (d) => (output += d.toString()));

    child.on("error", () => {
      clearTimeout(timer);
      settle(false);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        settle(false);
        return;
      }
      const lower = output.toLowerCase();
      settle(lower.includes("python") && !lower.includes("microsoft store") && !lower.includes("not found"));
    });
  });
}

async function listWindowsCandidates(): Promise<string[]> {
  const candidates: string[] = [];
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

  const pyDir = path.join(localAppData, "Programs", "Python");
  try {
    const subdirs = await fsp.readdir(pyDir);
    for (const subdir of subdirs) {
      const exe = path.join(pyDir, subdir, "python.exe");
      try {
        await fsp.access(exe);
        candidates.push(exe);
      } catch {}
    }
  } catch {}

  for (const pf of [programFiles, programFilesX86, "C:\\"]) {
    try {
      const items = await fsp.readdir(pf);
      for (const item of items) {
        if (/^python\d+$/i.test(item)) {
          const exe = path.join(pf, item, "python.exe");
          try {
            await fsp.access(exe);
            candidates.push(exe);
          } catch {}
        }
      }
    } catch {}
  }

  return candidates;
}

async function findPythonBinary(customBin?: string): Promise<string | null> {
  const trimmedCustom = customBin?.trim();
  const cacheKey = trimmedCustom || DEFAULT_CACHE_KEY;

  const cached = pythonBinCache.get(cacheKey);
  if (cached) return cached;

  const isWindows = process.platform === "win32";
  const candidates: string[] = [];

  if (trimmedCustom) candidates.push(trimmedCustom);
  if (process.env.PYTHON_PATH) candidates.push(process.env.PYTHON_PATH);

  if (isWindows) {
    candidates.push("python", "py", "python3");
    candidates.push(...(await listWindowsCandidates()));
  } else {
    candidates.push("python3", "python");
  }

  for (const candidate of candidates) {
    if (await spawnCheck(candidate)) {
      pythonBinCache.set(cacheKey, candidate);
      return candidate;
    }
  }

  return null;
}

// Minimal env passed to executed user code. Deliberately NOT `...process.env`
// spread — that would hand every secret the Next.js server process holds
// (APP_ACCESS_TOKEN, cloud provider API keys from .env.local, etc.) to
// whatever script gets run here. Only the handful of vars actually needed
// to find interpreters/binaries and behave predictably are passed through.
function buildChildEnv(): NodeJS.ProcessEnv {
  const passthroughKeys = [
    "PATH",
    "HOME",
    "USERPROFILE",
    "TEMP",
    "TMP",
    "SystemRoot",
    "windir",
    "PATHEXT",
    "ComSpec",
    "SystemDrive",
  ];
  const env: Record<string, string> = {};
  for (const key of passthroughKeys) {
    const val = process.env[key];
    if (val) env[key] = val;
  }
  env.PYTHONUNBUFFERED = "1";
  return { ...env, NODE_ENV: "development" };
}

export async function POST(req: NextRequest) {
  let tempFilePath: string | null = null;
  const startTime = Date.now();

  try {
    const body: RunRequest = await req.json();
    const { code, language, stdin = "", timeoutMs = 15000, pythonBin } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing or invalid 'code' in request body." },
        { status: 400 }
      );
    }

    const normLang = (language || "").toLowerCase().trim();
    const safeTimeout = Math.min(Math.max(timeoutMs, 1000), 30000); // 1s to 30s
    const tempDir = path.join(os.tmpdir(), "codespace_runs");
    await fsp.mkdir(tempDir, { recursive: true });

    const runId = crypto.randomBytes(8).toString("hex");

    let executable: string;
    let runArgs: string[] = [];
    let runnerName = "";

    if (normLang === "python" || normLang === "py") {
      const pythonExe = await findPythonBinary(pythonBin);
      if (!pythonExe) {
        return NextResponse.json({
          success: false,
          notFound: true,
          error: "Python executable was not found on the host machine.",
          message:
            "Native Python is not installed or not in PATH. You can run this script using the In-Browser WebAssembly (Pyodide) interpreter or install Python on the host.",
        });
      }
      tempFilePath = path.join(tempDir, `script_${runId}.py`);
      await fsp.writeFile(tempFilePath, code, "utf-8");
      executable = pythonExe;
      runArgs = ["-u", tempFilePath];
      runnerName = `python (${path.basename(pythonExe)})`;
    } else if (normLang === "javascript" || normLang === "js") {
      tempFilePath = path.join(tempDir, `script_${runId}.mjs`);
      await fsp.writeFile(tempFilePath, code, "utf-8");
      executable = process.execPath;
      runArgs = [tempFilePath];
      runnerName = "node.js";
    } else if (normLang === "typescript" || normLang === "ts") {
      tempFilePath = path.join(tempDir, `script_${runId}.ts`);
      await fsp.writeFile(tempFilePath, code, "utf-8");
      executable = process.execPath;
      // Node 22/24 supports --experimental-strip-types
      runArgs = ["--experimental-strip-types", tempFilePath];
      runnerName = "node.js (typescript)";
    } else if (normLang === "shell" || normLang === "bash" || normLang === "sh" || normLang === "powershell") {
      const isWindows = process.platform === "win32";
      if (isWindows) {
        tempFilePath = path.join(tempDir, `script_${runId}.ps1`);
        await fsp.writeFile(tempFilePath, code, "utf-8");
        executable = "powershell.exe";
        runArgs = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", tempFilePath];
        runnerName = "powershell";
      } else {
        tempFilePath = path.join(tempDir, `script_${runId}.sh`);
        await fsp.writeFile(tempFilePath, code, "utf-8");
        executable = "bash";
        runArgs = [tempFilePath];
        runnerName = "bash";
      }
    } else {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported server execution language: '${language}'. Supported languages: python, javascript, typescript, shell.`,
        },
        { status: 400 }
      );
    }

    // Execute the process with timeout
    return await new Promise<NextResponse>((resolve) => {
      let stdout = "";
      let stderr = "";
      let isTimedOut = false;

      const child = spawn(executable, runArgs, {
        cwd: tempDir,
        env: buildChildEnv(),
      });

      const timer = setTimeout(() => {
        isTimedOut = true;
        child.kill("SIGKILL");
      }, safeTimeout);

      if (stdin && child.stdin) {
        child.stdin.write(stdin);
        child.stdin.end();
      }

      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
        // Prevent buffer explosion
        if (stdout.length > 500000) {
          stdout = stdout.slice(0, 500000) + "\n... [Output truncated at 500KB]";
          child.kill("SIGTERM");
        }
      });

      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > 500000) {
          stderr = stderr.slice(0, 500000) + "\n... [Stderr truncated at 500KB]";
          child.kill("SIGTERM");
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        const executionTimeMs = Date.now() - startTime;
        resolve(
          NextResponse.json({
            success: false,
            error: err.message,
            output: stdout,
            stderr,
            executionTimeMs,
            runner: runnerName,
          })
        );
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const executionTimeMs = Date.now() - startTime;

        if (isTimedOut) {
          resolve(
            NextResponse.json({
              success: false,
              timedOut: true,
              error: `Execution timed out after ${safeTimeout / 1000}s.`,
              output: stdout,
              stderr: stderr + `\n[Process terminated: Execution exceeded ${safeTimeout / 1000}s timeout]`,
              exitCode: null,
              executionTimeMs,
              runner: runnerName,
            })
          );
        } else {
          resolve(
            NextResponse.json({
              success: code === 0,
              output: stdout,
              error: code === 0 ? null : stderr || `Process exited with code ${code}`,
              stderr,
              exitCode: code,
              executionTimeMs,
              runner: runnerName,
            })
          );
        }
      });
    });
  } catch (err: any) {
    const executionTimeMs = Date.now() - startTime;
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Internal server error during code execution.",
        executionTimeMs,
      },
      { status: 500 }
    );
  } finally {
    // Cleanup temporary script file
    if (tempFilePath) {
      try {
        await fsp.unlink(tempFilePath);
      } catch {}
    }
  }
}
