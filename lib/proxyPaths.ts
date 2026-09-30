/**
 * Path allow-lists for the two pass-through proxies (/api/ollama/*,
 * /api/laya/*).
 *
 * `?host=` on those routes is user-configurable (LAN or even cloud-hosted
 * Ollama), so the HOST check cannot be strict. Without a path check the
 * proxy is a confused deputy: `/api/ollama/api/codespace/run?host=http://
 * 127.0.0.1:3000` makes the SERVER call its own code-execution route, and
 * that server-to-server request carries no Sec-Fetch-Site/Origin headers,
 * so it sailed past the cross-site protection (verified end to end).
 * Restricting the relayed path to the upstream's real API closes that.
 */

const OLLAMA_PATH =
  /^(?:api\/(?:generate|chat|embed|embeddings|tags|show|ps|pull|push|create|copy|delete|version)|v1\/(?:chat\/completions|completions|embeddings|models(?:\/[A-Za-z0-9._:-]+)?))$/;

const LAYA_PATH = /^(?:health|predict|v1\/systemone)$/;

export function isAllowedOllamaPath(path: string): boolean {
  return OLLAMA_PATH.test(path);
}

export function isAllowedLayaPath(path: string): boolean {
  return LAYA_PATH.test(path);
}
