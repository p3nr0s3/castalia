import { spawn } from "child_process";
import qrcode from "qrcode-terminal";

const PORT = 3000;

if (!process.env.APP_ACCESS_TOKEN) {
  console.log("\n============================================================");
  console.log("🚫 REFUSING TO START TUNNEL: APP_ACCESS_TOKEN is not set.");
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
console.log("🌐 Starting Secure Public Internet Tunnel (Pinggy SSH)...");
console.log(`Forwarding traffic to local Next.js on port ${PORT}...`);
console.log("🔒 Access token check: ENABLED (APP_ACCESS_TOKEN is set)");
console.log("============================================================\n");

const sshProcess = spawn(
  "ssh",
  [
    "-p",
    "443",
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    `-R0:localhost:${PORT}`,
    "a.pinggy.io",
  ],
  {
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let linkFound = false;

const handleOutput = (data) => {
  const text = data.toString();
  const matches = text.match(/https:\/\/[a-zA-Z0-9-]+\.(?:free\.pinggy\.net|run\.pinggy-free\.link|a\.pinggy\.link)/g);

  if (matches && matches.length > 0 && !linkFound) {
    linkFound = true;
    const url = matches[0];

    console.log("\n🎉 TUNNEL IS LIVE & CONNECTED! 🎉");
    console.log("------------------------------------------------------------");
    console.log(`👉 Public HTTPS URL: \x1b[36m\x1b[1m${url}\x1b[0m`);
    console.log("------------------------------------------------------------\n");
    console.log("📱 Scan this QR Code with your phone camera to open:");

    qrcode.generate(url, { small: true });

    console.log("\n💡 You can now open this link from ANY phone or laptop outside!");
    console.log("⚠️  Keep this window OPEN while chatting. Press Ctrl + C to exit.\n");
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
