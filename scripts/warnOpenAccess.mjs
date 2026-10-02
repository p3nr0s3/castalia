import { loadEnv } from "./loadEnv.mjs";

// Runs before Next.js has loaded env files, so read .env/.env.local ourselves.
const env = loadEnv();
const token = env.APP_ACCESS_TOKEN;
const publicToken = env.NEXT_PUBLIC_APP_ACCESS_TOKEN;

const bar = "============================================================";
const lan = process.argv.includes("--lan");

if (lan && !token) {
  console.log(`\n${bar}`);
  console.log("REFUSING TO START ON THE NETWORK: APP_ACCESS_TOKEN is not set.");
  console.log(bar);
  console.log("This script binds to 0.0.0.0, so anyone on your Wi-Fi/LAN could reach");
  console.log("/api/fs (reads your home directory) and /api/tools/execute (writes files)");
  console.log("with no credentials at all.");
  console.log("");
  console.log("Set APP_ACCESS_TOKEN and NEXT_PUBLIC_APP_ACCESS_TOKEN (same value) in");
  console.log(".env.local (generate one with: openssl rand -hex 32), or use `npm run dev`");
  console.log("(127.0.0.1 only). To override knowingly: ALLOW_OPEN_LAN=1");
  console.log(`${bar}\n`);
  if (env.ALLOW_OPEN_LAN !== "1") process.exit(1);
  console.log("ALLOW_OPEN_LAN=1 is set — continuing WITHOUT a token.\n");
}

if (!token) {
  console.log(`\n${bar}`);
  console.log("WARNING: APP_ACCESS_TOKEN is not set — /api/* routes have NO token check.");
  console.log(bar);
  console.log("Fine for solo use on 127.0.0.1 (the default bind). Cross-site requests and");
  console.log("foreign Host headers are still rejected, but it stops being fine the moment");
  console.log("this machine is reachable by anyone else (npm run *:lan, a tunnel, shared");
  console.log("Wi-Fi, a bridged VM): /api/fs reads your home directory and /api/tools/execute");
  console.log("writes files.");
  console.log("");
  console.log("Set APP_ACCESS_TOKEN and NEXT_PUBLIC_APP_ACCESS_TOKEN (same value) in");
  console.log("a .env.local file. See .env.example.");
  console.log(`${bar}\n`);
} else if (publicToken !== token) {
  console.log(`\n${bar}`);
  console.log("WARNING: APP_ACCESS_TOKEN is set but NEXT_PUBLIC_APP_ACCESS_TOKEN is");
  console.log(publicToken ? "different." : "missing.");
  console.log(bar);
  console.log("The browser sends NEXT_PUBLIC_APP_ACCESS_TOKEN; with a mismatch every API");
  console.log("call from the UI will be rejected with 401. Set both to the same value and");
  console.log("restart (for `next build`/`npm start`, rebuild too: it is inlined at build).");
  console.log(`${bar}\n`);
}
