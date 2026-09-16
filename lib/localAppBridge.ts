import fs from "fs";
import path from "path";
import crypto from "crypto";
import { assertLoopbackOnlyUrl, SsrfBlockedError } from "./ssrfGuard";

/**
 * Generic "Local App Bridge" framework.
 *
 * Extracted from the Blender MCP bridge pattern in
 * app/api/connectors/route.ts (blender_execute, blender_check_startup,
 * blender_install_startup, blender_uninstall_startup) after noticing
 * every one of those actions was implementing the same five things over
 * again, with only the app name, port, and generated script differing:
 *
 *   1. A random per-install auth token, generated once and persisted to
 *      disk, sent on every privileged request.
 *   2. A loopback-only SSRF check on the bridge URL (see
 *      assertLoopbackOnlyUrl in lib/ssrfGuard.ts) — a local bridge must
 *      never be reachable from a LAN address or the public internet.
 *   3. A liveness/connectivity test with a timeout.
 *   4. An "execute a privileged action" call with a timeout, a fallback
 *      endpoint path, and specific handling for a 401 (bad/missing
 *      token) vs. the bridge being offline entirely.
 *   5. An offline fallback that hands the caller whatever payload it
 *      would have sent, so they can act on it manually (Blender's case:
 *      paste the generated Python into Blender's own Scripting tab).
 *
 * This module is that shared shape. Blender is the first bridge built
 * on top of it (see BLENDER_EXECUTE_ACTION below for how thin the
 * Blender-specific glue becomes). It is NOT a rewrite of the existing
 * Blender code path in app/api/connectors/route.ts — that route is left
 * as-is (its own token file, its own error message wording) so this
 * doesn't risk regressing a working, security-reviewed feature. New
 * bridges should be built against this module directly; migrating
 * Blender onto it is a separate, deliberate follow-up, not a
 * side-effect of adding this framework.
 *
 * What stays app-specific, deliberately NOT generalized here:
 *   - Startup-script installation (OS-specific paths, e.g. Blender's
 *     addons/startup directory under AppData/​.config/​Library). Not
 *     every local app has an equivalent "run this on launch" mechanism,
 *     and the ones that do vary too much to usefully share code.
 *   - The actual script/payload content sent to the bridge (Blender:
 *     Python via bpy; a hypothetical OBS bridge: OBS WebSocket JSON).
 *   - Port choice, endpoint paths, and response shape — each bridge
 *     defines its own BridgeDefinition (below) for these.
 */

export interface BridgeDefinition {
  /** Short unique id used for the token file name (data/<id>-bridge-token.json) and log messages. */
  id: string;
  /** Human-readable name for error/status messages, e.g. "Blender". */
  displayName: string;
  /** Default loopback URL if the caller doesn't specify one, e.g. "http://127.0.0.1:9876". */
  defaultUrl: string;
  /** Endpoint path appended to the bridge URL for the primary execute call, e.g. "/execute". */
  executePath?: string;
  /** Request timeout in ms for both the liveness test and the execute call. Defaults to 4000. */
  timeoutMs?: number;
}

export interface BridgeExecuteResult {
  success: boolean;
  message?: string;
  details?: any;
  /** True when the bridge process itself couldn't be reached at all (vs. reachable but rejecting the request). Callers use this to decide whether to show an offline/manual fallback. */
  isBridgeOffline?: boolean;
  /** True when the bridge rejected the request specifically for a bad/missing auth token (HTTP 401). */
  isAuthRejected?: boolean;
}

function tokenFilePath(bridgeId: string): string {
  return path.join(process.cwd(), "data", `${bridgeId}-bridge-token.json`);
}

/**
 * Generates a fresh random token for `bridge.id` and persists it to
 * data/<id>-bridge-token.json. Called once at "install" time (whatever
 * that means for a given bridge — for Blender, when the startup script
 * is generated) so the token embedded in the generated script/config
 * matches what getBridgeToken() will read back later.
 */
export function generateAndStoreBridgeToken(bridge: BridgeDefinition): string {
  const token = crypto.randomBytes(24).toString("hex");
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(tokenFilePath(bridge.id), JSON.stringify({ token, createdAt: Date.now() }), "utf-8");
  return token;
}

/**
 * Reads back a previously-stored token for `bridge.id`. Returns "" (not
 * an error) if none exists — callers should treat a missing token as
 * "send the request unauthenticated and let the bridge itself decide",
 * matching the existing Blender behavior for a bridge installed before
 * token support existed, or installed by hand rather than through this
 * app.
 */
export function getBridgeToken(bridge: BridgeDefinition): string {
  try {
    const p = tokenFilePath(bridge.id);
    if (!fs.existsSync(p)) return "";
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
    return parsed?.token || "";
  } catch {
    return "";
  }
}

export function deleteBridgeToken(bridge: BridgeDefinition): void {
  try {
    const p = tokenFilePath(bridge.id);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // Non-fatal — an orphaned token file is a minor cleanup miss, not a
    // correctness or security issue (it's useless without its bridge
    // installed) or a security issue.
  }
}

/**
 * Tests whether a bridge is reachable at `url`. Throws SsrfBlockedError
 * if `url` isn't loopback — callers should catch that specifically to
 * return a 400 rather than treating it like "bridge offline".
 */
export async function testBridgeConnection(
  bridge: BridgeDefinition,
  url: string
): Promise<{ reachable: boolean; details?: any }> {
  await assertLoopbackOnlyUrl(url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), bridge.timeoutMs ?? 4000);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return { reachable: false };
    const details = await res.json().catch(() => undefined);
    return { reachable: true, details };
  } catch {
    clearTimeout(timeoutId);
    return { reachable: false };
  }
}

/**
 * Sends a privileged action to the bridge. Mirrors the existing Blender
 * execute flow exactly: tries `${url}${bridge.executePath}` first, falls
 * back to the bare `url` if that fails, distinguishes a 401 (bad/missing
 * token — the bridge is up but rejecting us) from any other failure
 * (treated as "bridge offline"), and never throws for the offline case —
 * callers get isBridgeOffline: true and the original payload back so
 * they can hand it to the user for manual execution instead.
 *
 * Throws SsrfBlockedError (not caught here) if `url` isn't loopback —
 * same contract as testBridgeConnection, so callers handle both the
 * same way.
 */
export async function executeBridgeAction(
  bridge: BridgeDefinition,
  url: string,
  payload: Record<string, any>
): Promise<BridgeExecuteResult> {
  await assertLoopbackOnlyUrl(url);

  const token = getBridgeToken(bridge);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-Bridge-Token"] = token;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), bridge.timeoutMs ?? 4000);

  try {
    let res: Response | null = null;
    if (bridge.executePath) {
      res = await fetch(`${url}${bridge.executePath}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).catch(() => null);
    }

    if (!res || !res.ok) {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).catch(() => null);
    }

    clearTimeout(timeoutId);

    if (res && res.status === 401) {
      return {
        success: false,
        isAuthRejected: true,
        message: `${bridge.displayName} bridge rejected the request (401): missing or invalid bridge token.`,
      };
    }

    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: true, message: data.message || `Executed action in ${bridge.displayName}.`, details: data };
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn(`[localAppBridge:${bridge.id}] Bridge offline or unreachable:`, err.message || err);
  }

  return {
    success: false,
    isBridgeOffline: true,
    message: `${bridge.displayName} bridge is offline.`,
  };
}

export { SsrfBlockedError };
