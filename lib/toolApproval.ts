import { getPendingApprovalById, writeServerDb } from "./serverDb";
import type { PendingApproval } from "./types";

/**
 * Shared server-side gate for mutating disk tools (write_file, delete_file).
 * Used by /api/tools/execute (source "chat") and /api/tools/execute-agent
 * (source "agent"), which used to carry two drifting copies of this logic.
 *
 * What this gate actually guarantees — and what it does not:
 *  - The request must name an approval record that is status "approved" in
 *    the server DB, for THIS tool and EXACTLY these arguments (path AND
 *    content — it used to compare only `path`, so an approval for "write
 *    notes.txt: A" could be spent on "write notes.txt: B"), resolved within
 *    the last 5 minutes, and not yet consumed.
 *  - It is consumed exactly once, including under concurrent requests.
 *  - It is NOT an authentication boundary: the approval record lives in the
 *    same DB a same-origin caller can write through /api/db. Keeping other
 *    websites and other hosts away from those routes is middleware.ts's job
 *    (Host allow-list, same-origin check, bearer token). The approval gate's
 *    job is to make the user's click the only thing the app's own UI/agent
 *    flow can act on, and to stop replays.
 */

export const MUTATING_TOOLS = new Set(["write_file", "delete_file"]);
export const APPROVAL_FRESHNESS_MS = 5 * 60 * 1000;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** True only if the requested args are identical to the args the user approved. */
export function approvalArgsMatch(approved: Record<string, any> | undefined, requested: Record<string, any> | undefined): boolean {
  return canonical(approved ?? {}) === canonical(requested ?? {});
}

// Approval ids currently being consumed. The consumed flag is persisted with
// an await, so two concurrent requests could both read "not consumed" before
// either write landed. Claiming the id synchronously right after the checks
// closes that window.
const inFlight = new Set<string>();

export type AuthorizeResult = { ok: true } | { ok: false; status: number; error: string };

export interface AuthorizeParams {
  tool: string;
  args: Record<string, any>;
  approvalToken?: string;
  expectedSource: PendingApproval["source"];
  /** Wording for the wrong-source error, e.g. "manual chat" / "an agent run". */
  sourceLabel: string;
}

const deny = (error: string): AuthorizeResult => ({ ok: false, status: 403, error });

export async function authorizeMutatingTool(p: AuthorizeParams): Promise<AuthorizeResult> {
  const { tool, args, approvalToken } = p;

  if (!approvalToken) {
    return deny(`Tool '${tool}' requires a resolved approval before execution. This route will not run it without an approvalToken.`);
  }

  const approval = await getPendingApprovalById(approvalToken);
  if (!approval) return deny(`Unknown approval id '${approvalToken}'. Refusing to execute.`);

  if (approval.source !== p.expectedSource) {
    return deny(`Approval '${approvalToken}' was not issued for ${p.sourceLabel}. Refusing to execute.`);
  }
  if (approval.status !== "approved") {
    return deny(`Approval '${approvalToken}' is not approved (status: ${approval.status}). Refusing to execute.`);
  }
  if (approval.toolName !== tool || !approvalArgsMatch(approval.args, args)) {
    return deny(`Approval '${approvalToken}' does not match this request (it was approved for ${approval.toolName} with different arguments). Refusing to execute.`);
  }

  const resolvedAt = approval.resolvedAt ?? approval.createdAt;
  if (Date.now() - resolvedAt > APPROVAL_FRESHNESS_MS) {
    return deny(`Approval '${approvalToken}' has expired. Ask the user to approve again.`);
  }
  if (approval.result?.consumedAt || inFlight.has(approvalToken)) {
    return deny(`Approval '${approvalToken}' was already used and cannot be replayed.`);
  }

  // Claim synchronously (no await between the checks above and this line).
  inFlight.add(approvalToken);
  try {
    // Burn the approval BEFORE executing: if the action then fails, the
    // approval is still spent — the safer direction for a one-shot grant.
    const consumed: PendingApproval = { ...approval, result: { ...(approval.result || {}), consumedAt: Date.now() } };
    await writeServerDb({ pendingApprovals: [consumed] });
  } finally {
    // From here on the persisted consumedAt is what blocks replays.
    inFlight.delete(approvalToken);
  }
  return { ok: true };
}
