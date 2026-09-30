import fs from "fs";
import path from "path";

/**
 * Minimal .env loader for the helper scripts. They run BEFORE (or entirely
 * outside) Next.js, which is what normally loads .env.local — so a script that
 * only reads process.env cannot see values the README tells users to put in
 * .env.local. (scripts/tunnel.mjs did exactly that and refused to start even
 * with the token correctly configured.)
 *
 * Precedence, like Next.js: real environment > .env.local > .env
 */
/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const match = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    const quoted = value.match(/^(["'])(.*)\1$/);
    value = quoted ? quoted[2] : value.replace(/\s+#.*$/, "");
    out[match[1]] = value;
  }
  return out;
}

/**
 * @param {string} [cwd]
 * @param {Record<string, string | undefined>} [env]
 * @returns {Record<string, string>}
 */
export function loadEnv(cwd = process.cwd(), env = process.env) {
  /** @type {Record<string, string>} */
  const merged = {};
  for (const file of [".env", ".env.local"]) {
    const full = path.join(cwd, file);
    if (fs.existsSync(full)) Object.assign(merged, parseEnvFile(fs.readFileSync(full, "utf-8")));
  }
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined && v !== "") merged[k] = v;
  }
  return merged;
}
