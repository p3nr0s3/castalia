/**
 * Pure helpers for scripts/launch.mjs (kept separate because launch.mjs starts
 * processes as soon as it is imported, which makes it untestable).
 */

const SECRET_ENV_KEY = /(?:_API_KEY|_SECRET|_PASSWORD|_TOKEN)$|^APP_ACCESS_TOKEN$/i;

/**
 * Environment for the Laya Python process: everything except credentials.
 * Laya is a third-party Python package; it has no use for the provider API keys
 * or the app's access token that the parent process carries.
 * (HF_TOKEN-style variables are dropped too — models are pulled by the user's
 * own `pip`/cache setup, not by this app.)
 *
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string>}
 */
export function sanitizeChildEnv(env) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (SECRET_ENV_KEY.test(key)) continue;
    out[key] = value;
  }
  return out;
}

/** @param {string} mode */
export function isLanMode(mode) {
  return mode.endsWith(":lan");
}
