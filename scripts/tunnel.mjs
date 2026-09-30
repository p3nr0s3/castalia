import { spawn } from "child_process";
import qrcode from "qrcode-terminal";
import { loadEnv } from "./loadEnv.mjs";

// Read .env.local too (see scripts/loadEnv.mjs): checking process.env alone made
// this script refuse to start even when the token was configured as documented.
const env = loadEnv();
const PORT = Number(env.PORT) || 3000;

if (!env.APP_ACCESS_TOKEN) {
  console.log("\n============================================================");
  console.log("REFUSING TO START TUNNEL: APP_ACCESS_TOKEN is not set.");
  console.log("============================================================");
  console.log("This app has routes (/api/fs, /api/tools/execute, /api/connectors,");
  console.log("the Ollama proxy, etc.) that would be reachable by ANYONE with the");
  console.log("public URL if exposed without a token — including reading any file");
  console.log("under your home directory.");
  console.log("");
  console.log("Set APP_ACCESS_TOKEN and NEXT_PUBLIC_APP_ACCESS_TOKEN in .env.local");
  console.log("(see .env.example), rebuild/restart the dev server, then run the");
  console.log("tunnel again.\n");
  process.exit(1);
}

console.log("\n============================================================");
console.log("Starting Secure Public Internet Tunnel (Pinggy SSH)...");
console.log(`Forwarding traffic to local Next.js on port ${PORT}...`);
console.log("Access token check: ENABLED (APP_ACCESS_TOKEN is set)");
if (env.NEXT_PUBLIC_APP_ACCESS_TOKEN !== env.APP_ACCESS_TOKEN) {
  console.log("WARNING: NEXT_PUBLIC_APP_ACCESS_TOKEN is missing or different — the UI will get 401s.");
}
console.log("============================================================\n");

const sshProcess = spawn(
  "ssh",
  [
    "-p",
    "443",
    "-o",
    // accept-new: trust the tunnel host on first use, but refuse if its key ever
    // CHANGES. "no" silently accepted any key, so a network attacker could sit
    // in the middle of the tunnel and read the bearer token and all traffic.
    "StrictHostKeyChecking=accept-new",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    `-R0:127.0.0.1:${PORT}`,
    "a.pinggy.io",
  ],
  {
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let linkFound = false;

const handleOutput = (data) => {
  const text = data.toString();
  // Pinggy has used several free-tier domain shapes over time
  // (xxx.a.free.pinggy.link, xxx.run.pinggy-free.link, xxx.free.pinggy.net, ...).
  const matches = text.match(/https:\/\/[a-zA-Z0-9.-]+\.pinggy(?:-free)?\.(?:link|net|io)\b/g);

  if (matches && matches.length > 0 && !linkFound) {
    linkFound = true;
    const url = matches[0];

    console.log("\nTUNNEL IS LIVE & CONNECTED!");
    console.log("------------------------------------------------------------");
    console.log(`Public HTTPS URL: \x1b[36m\x1b[1m${url}\x1b[0m`);
    console.log("------------------------------------------------------------\n");
    console.log("Scan this QR Code with your phone camera to open:");

    qrcode.generate(url, { small: true });

    console.log("\nYou can now open this link from ANY phone or laptop outside!");
    console.log("Keep this window OPEN while chatting. Press Ctrl + C to exit.\n");
  }
};

sshProcess.stdout.on("data", handleOutput);
sshProcess.stderr.on("data", handleOutput);

sshProcess.on("close", (code) => {
  console.log(`\nTunnel disconnected (code ${code}).`);
});

process.on("SIGINT", () => {
  sshProcess.kill();
  process.exit();
});
