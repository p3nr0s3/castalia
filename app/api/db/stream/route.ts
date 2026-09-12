import { NextRequest } from "next/server";
import { readServerDb } from "@/lib/serverDb";
import { getCorsHeaders } from "@/lib/corsHeaders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events endpoint replacing the old client-side 3-second
 * setInterval poll of GET /api/db. Same underlying signal (readServerDb()'s
 * `version` counter) — this just moves the "did anything change" check from
 * the client repeatedly asking, to the server pushing exactly once when it
 * actually has.
 *
 * This does NOT push the full database payload — only a `{ version }` event
 * whenever it changes. The client still does one GET /api/db?v=... fetch to
 * pull the actual data, same as before; this endpoint only replaces the
 * "when should I check" polling loop, not the data-fetching logic itself.
 * That keeps this change small and low-risk: syncWithServer()'s merge logic
 * in app/page.tsx is completely untouched.
 *
 * Internally this still checks readServerDb() on an interval (2s) — moving
 * that to true event-driven pushes would mean threading a change notification
 * through every writeServerDb() call site, which is a much larger change for
 * marginal benefit here (this is a single-user local app; the win from SSE
 * is fewer wasted round-trips when nothing changed, not sub-second latency).
 * The 2s internal check is not visible to the client as "polling" — the
 * client makes exactly one long-lived connection instead of ~20 requests/min.
 */

const CHECK_INTERVAL_MS = 2000;
const KEEPALIVE_MS = 25000; // comment-only SSE ping so proxies/load balancers don't time out the connection

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientVersion = Number(searchParams.get("v") || "0");

  const encoder = new TextEncoder();
  let lastSeenVersion = clientVersion;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller already closed (client disconnected) — stop trying.
          closed = true;
        }
      };

      const checkTimer = setInterval(async () => {
        if (closed) return;
        try {
          const db = await readServerDb();
          if (db.version !== lastSeenVersion) {
            lastSeenVersion = db.version;
            send("changed", { version: db.version });
          }
        } catch (err: any) {
          send("error", { message: err.message || "Failed to check database version" });
        }
      }, CHECK_INTERVAL_MS);

      const keepaliveTimer = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          closed = true;
        }
      }, KEEPALIVE_MS);

      // Send an immediate check on connect, in case something changed
      // between the client's last poll and this connection opening.
      readServerDb()
        .then((db) => {
          if (db.version !== lastSeenVersion) {
            lastSeenVersion = db.version;
            send("changed", { version: db.version });
          }
        })
        .catch(() => {});

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(checkTimer);
        clearInterval(keepaliveTimer);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      ...getCorsHeaders(),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
