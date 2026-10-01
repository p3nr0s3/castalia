import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";

export type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** Default body cap for JSON routes. The database sync route needs far more and sets its own. */
export const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Reads a JSON request body with a hard size cap (req.json() buffers whatever it is
 * sent), then validates it against `schema`. Returns a ready-made 4xx response on
 * failure so a route is just `const r = await parseJsonBody(...); if (!r.ok) return r.response;`.
 *
 * `errorShape` lets routes keep their existing error contract (e.g. `{ success:false, error }`).
 */
export async function parseJsonBody<T>(
  req: NextRequest,
  schema: ZodType<T>,
  opts: {
    maxBytes?: number;
    headers?: HeadersInit;
    errorShape?: (message: string) => Record<string, unknown>;
    /** Prefix the failing field ("tool: …"). Turn off where the existing error text is part of the contract. */
    prefixPath?: boolean;
  } = {}
): Promise<ParseResult<T>> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
  const shape = opts.errorShape ?? ((message: string) => ({ error: message }));
  const fail = (status: number, message: string): ParseResult<T> => ({
    ok: false,
    response: NextResponse.json(shape(message), { status, headers: opts.headers }),
  });

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return fail(413, `Request body too large (limit ${maxBytes} bytes).`);

  let text: string;
  try {
    text = await req.text();
  } catch {
    return fail(400, "Could not read request body.");
  }
  // content-length can be absent or wrong (chunked uploads), so check the real size too.
  if (Buffer.byteLength(text, "utf-8") > maxBytes) return fail(413, `Request body too large (limit ${maxBytes} bytes).`);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(400, "Request body is not valid JSON.");
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.length && opts.prefixPath !== false ? `${issue.path.join(".")}: ` : "";
    return fail(400, `${where}${issue.message}`);
  }
  return { ok: true, data: parsed.data };
}
