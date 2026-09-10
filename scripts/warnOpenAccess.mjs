import fs from "fs";
import path from "path";

// Best-effort: also pick up APP_ACCESS_TOKEN from .env.local, since this
// runs before Next.js has loaded env files.
function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) out[match[1]] = (match[2] || "").trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const envFile = loadDotEnvLocal();
const token = process.env.APP_ACCESS_TOKEN || envFile.APP_ACCESS_TOKEN;

if (!token) {
  console.log("\n============================================================");
  console.log("⚠️  APP_ACCESS_TOKEN is not set — /api/* routes are OPEN.");
  console.log("============================================================");
  console.log("This is fine for solo local dev. It stops being fine the moment");
  console.log("this machine is reachable by anyone else — shared Wi-Fi, a");
  console.log("coworking space, a VM with a bridged network interface, etc.");
  console.log("Reachable-without-a-token means /api/fs can read any file under");
  console.log("$HOME, and /api/tools/execute can write or delete files there.");
  console.log("");
  console.log("Set APP_ACCESS_TOKEN and NEXT_PUBLIC_APP_ACCESS_TOKEN (same value)");
  console.log("in .env.local to close this. See .env.example.");
  console.log("============================================================\n");
}
