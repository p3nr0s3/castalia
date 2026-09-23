import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl, SsrfBlockedError } from "@/lib/ssrfGuard";
import { testBridgeConnection, executeBridgeAction } from "@/lib/localAppBridge";

/**
 * Generic custom-bridge connector route.
 *
 * All previous hardcoded per-service integrations (GitHub API calls,
 * Slack/Discord-specific webhook shaping, Blender's Python bpy bridge and
 * its startup-script installer) have been removed. Connectors are now
 * entirely user-defined via Directory > Connectors > Add Custom Bridge
 * (see components/DirectoryModal.tsx and lib/types.ts's ConnectorItem.customBridgeType),
 * with exactly two supported shapes:
 *
 *   - "webhook": a plain POST with a JSON body to any public URL. Must
 *     resolve to a non-private address (assertPublicUrl) — this is the
 *     same SSRF policy the old Slack/Discord webhook code used, just no
 *     longer tied to those two specific services.
 *   - "local-http": a loopback-only HTTP bridge to a desktop app running
 *     on this machine, via lib/localAppBridge.ts (the same framework
 *     Blender's bridge was going to be migrated onto). Must resolve to
 *     127.0.0.1/::1 only.
 *
 * A user who wants to talk to a real service's actual API (GitHub, a
 * specific SaaS product, etc.) now does so by pointing a webhook bridge
 * at that service's own webhook/inbound-API endpoint, or by building
 * their own small local proxy and connecting to it as a local-http
 * bridge — this route no longer knows anything about specific third-party
 * APIs itself.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, apiKey, webhookUrl, endpoint, payload } = body;

    // =========================================================================
    // 1. TEST CONNECTIVITY FOR A CUSTOM BRIDGE
    // =========================================================================
    if (action === "test") {
      const bridgeType = body.customBridgeType || body.bridgeType;

      if (bridgeType === "local-http") {
        const targetUrl = (endpoint || "").trim().replace(/\/$/, "");
        if (!targetUrl) {
          return NextResponse.json({ success: false, error: "Please provide a bridge endpoint URL (e.g. http://127.0.0.1:PORT)." }, { status: 400 });
        }
        try {
          const { reachable, details } = await testBridgeConnection(
            { id: "custom", displayName: "Custom Bridge", defaultUrl: targetUrl },
            targetUrl
          );
          if (!reachable) {
            return NextResponse.json(
              { success: false, error: `Could not reach ${targetUrl}. Make sure the app/bridge is running and listening there.` },
              { status: 400 }
            );
          }
          return NextResponse.json({
            success: true,
            message: `Connected to ${targetUrl}${details?.version ? ` (v${details.version})` : ""}.`,
          });
        } catch (e) {
          if (e instanceof SsrfBlockedError) {
            return NextResponse.json({ success: false, error: e.message }, { status: 400 });
          }
          throw e;
        }
      }

      // Default / "webhook": test by sending a small test payload.
      const targetUrl = (webhookUrl || endpoint || "").trim();
      if (!targetUrl || !targetUrl.startsWith("http")) {
        return NextResponse.json({ success: false, error: "Please provide a valid webhook URL." }, { status: 400 });
      }
      try {
        await assertPublicUrl(targetUrl);
      } catch (e) {
        if (e instanceof SsrfBlockedError) {
          return NextResponse.json({ success: false, error: e.message }, { status: 400 });
        }
        throw e;
      }

      const testBody = payload || { text: "Test message from Castalia Workspace's custom bridge." };
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey.trim()}`;

      const res = await fetch(targetUrl, { method: "POST", headers, body: JSON.stringify(testBody) });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return NextResponse.json(
          { success: false, error: `Bridge returned ${res.status}: ${errText || "request rejected"}` },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: true, message: "Test message sent successfully!" });
    }

    // =========================================================================
    // 2. WEBHOOK DISPATCH (any public URL)
    // =========================================================================
    if (action === "webhook_send") {
      const targetUrl = (webhookUrl || payload?.webhookUrl || "").trim();
      if (!targetUrl || !targetUrl.startsWith("http")) {
        return NextResponse.json({ success: false, error: "A valid Webhook URL is required." }, { status: 400 });
      }
      try {
        await assertPublicUrl(targetUrl);
      } catch (e) {
        if (e instanceof SsrfBlockedError) {
          return NextResponse.json({ success: false, error: e.message }, { status: 400 });
        }
        throw e;
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey.trim()}`;

      const res = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload || { text: "Notification from Castalia Workspace" }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return NextResponse.json({ success: false, error: `Webhook rejected (${res.status}): ${errText}` }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: "Message dispatched to webhook successfully!" });
    }

    // =========================================================================
    // 3. LOCAL BRIDGE EXECUTE (loopback-only HTTP bridge to a local app)
    // =========================================================================
    if (action === "local_bridge_execute") {
      const targetUrl = (endpoint || "").trim().replace(/\/$/, "");
      if (!targetUrl) {
        return NextResponse.json({ success: false, error: "A bridge endpoint URL is required." }, { status: 400 });
      }

      try {
        const result = await executeBridgeAction(
          { id: "custom", displayName: "Custom Bridge", defaultUrl: targetUrl, executePath: "/execute" },
          targetUrl,
          payload || {}
        );

        if (result.isBridgeOffline) {
          return NextResponse.json({
            success: false,
            isBridgeOffline: true,
            message: result.message || `Bridge at ${targetUrl} is offline.`,
          });
        }
        if (result.isAuthRejected) {
          return NextResponse.json({ success: false, error: result.message }, { status: 401 });
        }
        return NextResponse.json({ success: result.success, message: result.message, details: result.details });
      } catch (e) {
        if (e instanceof SsrfBlockedError) {
          return NextResponse.json({ success: false, error: e.message }, { status: 400 });
        }
        throw e;
      }
    }

    return NextResponse.json({ success: false, error: `Unknown action '${action}'` }, { status: 400 });
  } catch (error: any) {
    console.error("Connectors API error:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 });
  }
}
