#!/usr/bin/env node
/**
 * Cross-platform unified launcher for Lyra + Laya System-1 Decision Engine.
 * Compatible with Windows, Linux, and macOS.
 *
 * Usage:
 *   node scripts/launch.mjs [dev|dev:lan|start|start:lan]
 */

import { spawn, execSync, execFileSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { sanitizeChildEnv, isLanMode } from "./launchHelpers.mjs";

const mode = process.argv[2] || "dev";
const isWindows = process.platform === "win32";

const COLOR_CYAN = "\x1b[36m";
const COLOR_MAGENTA = "\x1b[35m";
const COLOR_GREEN = "\x1b[32m";
const COLOR_YELLOW = "\x1b[33m";
const COLOR_RED = "\x1b[31m";
const COLOR_RESET = "\x1b[0m";
const COLOR_BOLD = "\x1b[1m";

function logLyra(msg) {
  console.log(`${COLOR_CYAN}${COLOR_BOLD}[Lyra]${COLOR_RESET} ${msg}`);
}

function logLaya(msg) {
  console.log(`${COLOR_MAGENTA}${COLOR_BOLD}[Laya]${COLOR_RESET} ${msg}`);
}

/**
 * Pings http://127.0.0.1:8000/health to check if Laya is responding.
 */
function probeLayaHealth(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(
      "http://127.0.0.1:8000/health",
      { timeout: timeoutMs },
      (res) => {
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Detects the best available Python executable that has 'laya' and 'uvicorn' installed.
 */
function findPythonWithLaya() {
  const root = process.cwd();
  const candidates = isWindows
    ? [
        path.join(root, ".venv", "Scripts", "python.exe"),
        path.join(root, "venv", "Scripts", "python.exe"),
        path.join(root, "env", "Scripts", "python.exe"),
        "python",
        "py",
        "python3",
      ]
    : [
        path.join(root, ".venv", "bin", "python"),
        path.join(root, "venv", "bin", "python"),
        path.join(root, "env", "bin", "python"),
        "python3",
        "python",
      ];

  for (const cmd of candidates) {
    // If it's a file path, verify existence first
    if ((cmd.includes("/") || cmd.includes("\\")) && !fs.existsSync(cmd)) {
      continue;
    }

    try {
      // execFileSync (no shell): a path such as C:\Users\John Doe\lyra\.venv\... contains a
      // space, and the old `execSync(`${cmd} --version`)` split it in two, failed, and made the
      // launcher conclude "Python not found" without saying why.
      execFileSync(cmd, ["--version"], { stdio: "ignore" });

      // Check if laya and uvicorn are importable
      execFileSync(cmd, ["-c", "import laya, uvicorn"], { stdio: "ignore" });
      return { pythonCmd: cmd, hasLaya: true };
    } catch {
      // Either command not found or laya not installed
      try {
        execFileSync(cmd, ["--version"], { stdio: "ignore" });
        // Python exists but laya is missing
        return { pythonCmd: cmd, hasLaya: false };
      } catch {
        // Skip non-existent binary
      }
    }
  }

  return null;
}

let layaProcess = null;
let nextProcess = null;
let isShuttingDown = false;

function shutdownAll(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logLyra("Menghentikan seluruh layanan (Lyra + Laya)...");

  if (layaProcess && layaProcess.pid) {
    try {
      if (isWindows) {
        // Cleanly terminate process tree on Windows
        execSync(`taskkill /pid ${layaProcess.pid} /t /f`, { stdio: "ignore" });
      } else {
        layaProcess.kill("SIGTERM");
      }
    } catch {}
    layaProcess = null;
  }

  if (nextProcess && nextProcess.pid) {
    try {
      if (isWindows) {
        execSync(`taskkill /pid ${nextProcess.pid} /t /f`, { stdio: "ignore" });
      } else {
        nextProcess.kill("SIGTERM");
      }
    } catch {}
    nextProcess = null;
  }

  process.exit(exitCode);
}

process.on("SIGINT", () => shutdownAll(0));
process.on("SIGTERM", () => shutdownAll(0));
process.on("exit", () => shutdownAll(0));

/**
 * The npm "pre" hooks (predev, prestart) only exist for `dev` and `start`, so the
 * token warning never ran for dev:lan / start:lan or any *:all mode — exactly the
 * modes that expose the app. Run the same check here; it exits non-zero when a
 * *:lan mode has no APP_ACCESS_TOKEN.
 */
function runAccessCheck() {
  const script = fileURLToPath(new URL("./warnOpenAccess.mjs", import.meta.url));
  try {
    execFileSync(process.execPath, [script, ...(isLanMode(mode) ? ["--lan"] : [])], { stdio: "inherit" });
  } catch {
    process.exit(1);
  }
}

async function main() {
  runAccessCheck();
  console.log("");
  console.log(`${COLOR_BOLD}${COLOR_CYAN}====================================================${COLOR_RESET}`);
  console.log(`${COLOR_BOLD}${COLOR_CYAN}  Lyra + Laya System-1 Unified Launcher             ${COLOR_RESET}`);
  console.log(`${COLOR_BOLD}${COLOR_CYAN}====================================================${COLOR_RESET}`);
  console.log("");

  // 1. Check if Laya is already running
  const alreadyRunning = await probeLayaHealth(800);

  if (alreadyRunning) {
    logLaya(`${COLOR_GREEN}Server Laya sudah aktif di http://127.0.0.1:8000 (menggunakan instance yang ada).${COLOR_RESET}`);
  } else {
    // Look for Python with Laya
    const pyInfo = findPythonWithLaya();

    if (!pyInfo) {
      logLaya(`${COLOR_YELLOW}Python tidak ditemukan di sistem. Laya System-1 dinonaktifkan (fallback ke heuristik lokal).${COLOR_RESET}`);
    } else if (!pyInfo.hasLaya) {
      logLaya(`${COLOR_YELLOW}Python terdeteksi (${pyInfo.pythonCmd}), tetapi paket 'laya[serve]' belum terpasang.${COLOR_RESET}`);
      logLaya(`${COLOR_YELLOW}Untuk mengaktifkan Laya System-1, jalankan: pip install "laya[serve]"${COLOR_RESET}`);
      logLyra(`Tetap melanjutkan Lyra dengan mode fallback otomatis.`);
    } else {
      logLaya(`Memulai server Laya System-1 via ${pyInfo.pythonCmd} di port 8000...`);

      const layaEnv = {
        // No provider API keys / access token for the third-party Python process.
        ...sanitizeChildEnv(process.env),
        LAYA_HOST: "127.0.0.1",
        LAYA_PORT: "8000",
        LAYA_LOG_LEVEL: "info",
        // OPTIMIZATION: Only preload the multilingual model (saves ~1.8 GB RAM by avoiding english + typed-decisions)
        LAYA_MODELS: process.env.LAYA_MODELS || "multilingual",
        // OPTIMIZATION: Cap PyTorch thread pool to 2 threads to reduce CPU/RAM overhead
        LAYA_THREADS: process.env.LAYA_THREADS || "2",
        PYTHONUNBUFFERED: "1",
      };

      layaProcess = spawn(pyInfo.pythonCmd, ["-m", "laya.serve"], {
        env: layaEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });

      layaProcess.stdout.on("data", (chunk) => {
        const text = chunk.toString().trim();
        if (text) {
          console.log(`${COLOR_MAGENTA}[Laya]${COLOR_RESET} ${text}`);
        }
      });

      layaProcess.stderr.on("data", (chunk) => {
        const text = chunk.toString().trim();
        if (text) {
          console.log(`${COLOR_MAGENTA}[Laya]${COLOR_RESET} ${text}`);
        }
      });

      layaProcess.on("exit", (code) => {
        if (!isShuttingDown && code !== 0) {
          logLaya(`${COLOR_RED}Server Laya berhenti dengan kode ${code}.${COLOR_RESET}`);
        }
      });

      // Wait up to 10 seconds for Laya to become responsive
      logLaya("Menunggu server Laya siap...");
      let ready = false;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        ready = await probeLayaHealth(400);
        if (ready) break;
      }

      if (ready) {
        logLaya(`${COLOR_GREEN}Server Laya siap menerima inferensi di http://127.0.0.1:8000!${COLOR_RESET}`);
      } else {
        logLaya(`${COLOR_YELLOW}Laya masih memuat model di latar belakang; Lyra siap beroperasi dengan fallback.${COLOR_RESET}`);
      }
    }
  }

  console.log("");
  // 2. Start Next.js Lyra
  let nextArgs = ["next", "dev", "-H", "127.0.0.1", "-p", "3000"];
  if (mode === "dev:lan") {
    nextArgs = ["next", "dev", "-H", "0.0.0.0", "-p", "3000"];
  } else if (mode === "start") {
    nextArgs = ["next", "start", "-H", "127.0.0.1", "-p", "3000"];
  } else if (mode === "start:lan") {
    nextArgs = ["next", "start", "-H", "0.0.0.0", "-p", "3000"];
  }

  logLyra(`Memulai antarmuka Lyra (mode: ${mode})...`);

  const env = {
    ...process.env,
    // OPTIMIZATION: Keep Node.js V8 heap capped to prevent memory bloat in dev mode
    NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=768",
    // Hint to Lyra client that Laya is running in one-step mode
    NEXT_PUBLIC_AUTO_LAYA: "true",
  };

  if (isWindows) {
    const fullCmd = `npx.cmd ${nextArgs.join(" ")}`;
    nextProcess = spawn(fullCmd, {
      stdio: "inherit",
      shell: true,
      env,
    });
  } else {
    nextProcess = spawn("npx", nextArgs, {
      stdio: "inherit",
      env,
    });
  }

  nextProcess.on("exit", (code) => {
    shutdownAll(code || 0);
  });
}

main().catch((err) => {
  console.error("Launcher error:", err);
  shutdownAll(1);
});
