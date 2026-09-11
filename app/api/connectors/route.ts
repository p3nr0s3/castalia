import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { assertPublicUrl, assertBlenderUrl, SsrfBlockedError } from "@/lib/ssrfGuard";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, service, apiKey, webhookUrl, repo, endpoint, payload } = body;

    // =========================================================================
    // 1. TEST CONNECTIVITY FOR ANY SERVICE
    // =========================================================================
    if (action === "test") {
      if (service === "github") {
        const headers: Record<string, string> = {
          "User-Agent": "Ollama-Chat-Web",
          Accept: "application/vnd.github.v3+json",
        };
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey.trim()}`;
        }

        if (apiKey) {
          const res = await fetch("https://api.github.com/user", { headers });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return NextResponse.json(
              { success: false, error: err.message || `GitHub returned status ${res.status}` },
              { status: 400 }
            );
          }
          const data = await res.json();
          return NextResponse.json({
            success: true,
            message: `Authenticated as @${data.login} (${data.public_repos} public repos, ${data.followers} followers)`,
            user: data.login,
          });
        } else if (repo) {
          const res = await fetch(`https://api.github.com/repos/${repo.trim()}`, { headers });
          if (!res.ok) {
            return NextResponse.json(
              { success: false, error: `Repository '${repo}' not found or private` },
              { status: 400 }
            );
          }
          const data = await res.json();
          return NextResponse.json({
            success: true,
            message: `Repository found: ${data.full_name} (⭐ ${data.stargazers_count} stars, 🐛 ${data.open_issues_count} issues)`,
          });
        } else {
          return NextResponse.json(
            { success: false, error: "Please enter a GitHub Personal Access Token or Repository name." },
            { status: 400 }
          );
        }
      }

      if (service === "slack") {
        if (!webhookUrl || !webhookUrl.startsWith("http")) {
          return NextResponse.json(
            { success: false, error: "Please provide a valid Slack Incoming Webhook URL." },
            { status: 400 }
          );
        }
        try {
          await assertPublicUrl(webhookUrl.trim());
        } catch (e) {
          if (e instanceof SsrfBlockedError) {
            return NextResponse.json({ success: false, error: e.message }, { status: 400 });
          }
          throw e;
        }
        const res = await fetch(webhookUrl.trim(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: "🧪 *Ollama Workspace*: Slack connector test connection successful!",
          }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          return NextResponse.json(
            { success: false, error: `Slack returned ${res.status}: ${errText || "Invalid webhook"}` },
            { status: 400 }
          );
        }
        return NextResponse.json({
          success: true,
          message: "Test message sent to Slack channel successfully!",
        });
      }

      if (service === "discord") {
        if (!webhookUrl || !webhookUrl.startsWith("http")) {
          return NextResponse.json(
            { success: false, error: "Please provide a valid Discord Webhook URL." },
            { status: 400 }
          );
        }
        try {
          await assertPublicUrl(webhookUrl.trim());
        } catch (e) {
          if (e instanceof SsrfBlockedError) {
            return NextResponse.json({ success: false, error: e.message }, { status: 400 });
          }
          throw e;
        }
        const res = await fetch(webhookUrl.trim(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: "🧪 **Ollama Workspace**: Discord connector test connection successful!",
          }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          return NextResponse.json(
            { success: false, error: `Discord returned ${res.status}: ${errText || "Invalid webhook"}` },
            { status: 400 }
          );
        }
        return NextResponse.json({
          success: true,
          message: "Test message sent to Discord channel successfully!",
        });
      }

      if (service === "blender" || service === "blender-mcp") {
        const targetUrl = (endpoint || "http://127.0.0.1:9876").trim().replace(/\/$/, "");
        try {
          await assertBlenderUrl(targetUrl);
        } catch (e) {
          if (e instanceof SsrfBlockedError) {
            return NextResponse.json({ success: false, error: e.message }, { status: 400 });
          }
          throw e;
        }
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          const res = await fetch(targetUrl, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          }).catch(() => null);
          clearTimeout(timeoutId);

          if (res && res.ok) {
            const data = await res.json().catch(() => ({}));
            const ver = data.version ? ` (v${data.version})` : "";
            return NextResponse.json({
              success: true,
              message: `Connected to Blender MCP Bridge${ver} at ${targetUrl}! Live 3D Python execution ready.`,
            });
          }
        } catch {
          // Ignore
        }
        return NextResponse.json(
          {
            success: false,
            error: `Could not reach Blender at ${targetUrl}. Make sure Blender is running and the Python bridge script is active in the Scripting tab.`,
          },
          { status: 400 }
        );
      }

      if (service === "nocodb" || endpoint) {
        if (!endpoint || !endpoint.startsWith("http")) {
          return NextResponse.json(
            { success: false, error: "Please provide a valid endpoint URL." },
            { status: 400 }
          );
        }
        try {
          await assertPublicUrl(endpoint.trim());
        } catch (e) {
          if (e instanceof SsrfBlockedError) {
            return NextResponse.json({ success: false, error: e.message }, { status: 400 });
          }
          throw e;
        }
        const headers: Record<string, string> = {};
        if (apiKey) {
          headers["xc-token"] = apiKey.trim();
          headers["Authorization"] = `Bearer ${apiKey.trim()}`;
        }
        const startTime = Date.now();
        const res = await fetch(endpoint.trim(), { headers });
        const latency = Date.now() - startTime;
        return NextResponse.json({
          success: res.ok,
          message: `Endpoint responded with status ${res.status} (${latency}ms latency).`,
        });
      }

      return NextResponse.json({
        success: true,
        message: "Configuration saved and connector ready.",
      });
    }

    // =========================================================================
    // 2. GITHUB ACTIONS: FETCH REPO / ISSUES / FILES
    // =========================================================================
    if (action === "github_fetch") {
      const targetRepo = (repo || payload?.repo || "").trim().replace(/^https:\/\/github\.com\//, "");
      if (!targetRepo) {
        return NextResponse.json({ success: false, error: "Repository name is required (e.g. facebook/react)" }, { status: 400 });
      }

      const headers: Record<string, string> = {
        "User-Agent": "Ollama-Chat-Web",
        Accept: "application/vnd.github.v3+json",
      };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey.trim()}`;

      const fetchType = payload?.type || "info";

      if (fetchType === "issues") {
        const res = await fetch(`https://api.github.com/repos/${targetRepo}/issues?state=open&per_page=10`, { headers });
        if (!res.ok) {
          return NextResponse.json({ success: false, error: `Failed to fetch issues: status ${res.status}` }, { status: 400 });
        }
        const issues = await res.json();
        const simplified = issues.map((iss: any) => ({
          number: iss.number,
          title: iss.title,
          user: iss.user?.login,
          comments: iss.comments,
          url: iss.html_url,
          created_at: iss.created_at,
          bodySnippet: iss.body ? iss.body.slice(0, 200) + "..." : "",
        }));
        return NextResponse.json({ success: true, repo: targetRepo, issues: simplified });
      }

      if (fetchType === "file" || payload?.filePath) {
        const filePath = payload?.filePath || "README.md";
        const rawUrl = `https://raw.githubusercontent.com/${targetRepo}/HEAD/${filePath}`;
        const res = await fetch(rawUrl, { headers: { "User-Agent": "Ollama-Chat-Web" } });
        if (!res.ok) {
          return NextResponse.json({ success: false, error: `File '${filePath}' not found in repo '${targetRepo}'` }, { status: 400 });
        }
        const text = await res.text();
        return NextResponse.json({ success: true, repo: targetRepo, filePath, content: text });
      }

      // Default: repo info
      const res = await fetch(`https://api.github.com/repos/${targetRepo}`, { headers });
      if (!res.ok) {
        return NextResponse.json({ success: false, error: `Repository '${targetRepo}' not found` }, { status: 400 });
      }
      const data = await res.json();
      return NextResponse.json({
        success: true,
        repo: data.full_name,
        description: data.description,
        stars: data.stargazers_count,
        forks: data.forks_count,
        open_issues: data.open_issues_count,
        language: data.language,
        url: data.html_url,
      });
    }

    // =========================================================================
    // 3. GITHUB ACTIONS: CREATE ISSUE
    // =========================================================================
    if (action === "github_create_issue") {
      const targetRepo = (repo || payload?.repo || "").trim().replace(/^https:\/\/github\.com\//, "");
      if (!apiKey) {
        return NextResponse.json({ success: false, error: "GitHub Personal Access Token is required to create issues." }, { status: 400 });
      }
      if (!targetRepo || !payload?.title) {
        return NextResponse.json({ success: false, error: "Repository and issue title are required." }, { status: 400 });
      }

      const res = await fetch(`https://api.github.com/repos/${targetRepo}/issues`, {
        method: "POST",
        headers: {
          "User-Agent": "Ollama-Chat-Web",
          Authorization: `Bearer ${apiKey.trim()}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: payload.title,
          body: payload.body || "Issue generated via Ollama AI Workspace",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return NextResponse.json({ success: false, error: err.message || `Failed with status ${res.status}` }, { status: 400 });
      }

      const issueData = await res.json();
      return NextResponse.json({
        success: true,
        message: `Issue #${issueData.number} created successfully!`,
        url: issueData.html_url,
      });
    }

    // =========================================================================
    // 4. WEBHOOK DISPATCH (SLACK / DISCORD / GENERIC)
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

      const text = payload?.text || payload?.content || "Notification from Ollama Workspace";
      let postBody: any;

      if (service === "discord") {
        postBody = { content: text };
      } else {
        // Slack or generic
        postBody = { text: text };
      }

      const res = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postBody),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return NextResponse.json({ success: false, error: `Webhook rejected (${res.status}): ${errText}` }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: "Message dispatched to webhook successfully!",
      });
    }

    // =========================================================================
    // 5. BLENDER ACTIONS: EXECUTE PYTHON SCRIPT IN BLENDER
    // =========================================================================
    if (action === "blender_execute") {
      const targetUrl = (endpoint || "http://127.0.0.1:9876").trim().replace(/\/$/, "");
      const scriptCode = payload?.code || "";

      if (!scriptCode) {
        return NextResponse.json({ success: false, error: "Python code is required for Blender execution." }, { status: 400 });
      }

      try {
        await assertBlenderUrl(targetUrl);
      } catch (e) {
        if (e instanceof SsrfBlockedError) {
          return NextResponse.json({ success: false, error: e.message }, { status: 400 });
        }
        throw e;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        let res = await fetch(`${targetUrl}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: scriptCode }),
          signal: controller.signal,
        }).catch(() => null);

        // Fallback to base endpoint if /execute fails
        if (!res || !res.ok) {
          res = await fetch(targetUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: scriptCode }),
            signal: controller.signal,
          }).catch(() => null);
        }
        clearTimeout(timeoutId);

        if (res && res.ok) {
          const data = await res.json().catch(() => ({}));
          return NextResponse.json({
            success: true,
            message: data.message || "Executed Python script in Blender live scene!",
            details: data,
          });
        }
      } catch (err: any) {
        console.warn("Blender bridge offline or unreachable:", err.message);
      }

      // If Blender bridge is offline, return success: false with code so user can paste it manually
      return NextResponse.json({
        success: false,
        isBridgeOffline: true,
        message: "Blender bridge is offline. You can copy the generated Python script below and run it in Blender's Scripting workspace!",
        code: scriptCode,
      });
    }

    // =========================================================================
    // 6. BLENDER STARTUP AUTOMATION (AUTO-START ON LAUNCH)
    // =========================================================================
    if (
      action === "blender_check_startup" ||
      action === "blender_install_startup" ||
      action === "blender_uninstall_startup"
    ) {
      const getBlenderBasePaths = (): string[] => {
        const paths: string[] = [];
        const appData = process.env.APPDATA;
        if (appData) {
          const p = path.join(appData, "Blender Foundation", "Blender");
          if (fs.existsSync(p)) paths.push(p);
        }
        const home = process.env.HOME || process.env.USERPROFILE;
        if (home) {
          const linuxP = path.join(home, ".config", "blender");
          if (fs.existsSync(linuxP)) paths.push(linuxP);
          const macP = path.join(home, "Library", "Application Support", "Blender");
          if (fs.existsSync(macP)) paths.push(macP);
        }
        return paths;
      };

      const bases = getBlenderBasePaths();
      const versions: { version: string; startupDir: string; filePath: string; installed: boolean }[] = [];

      for (const base of bases) {
        try {
          const items = fs.readdirSync(base, { withFileTypes: true });
          for (const item of items) {
            if (item.isDirectory() && (/^\d+(\.\d+)?$/.test(item.name) || !isNaN(parseFloat(item.name)))) {
              const startupDir = path.join(base, item.name, "scripts", "startup");
              const filePath = path.join(startupDir, "blender_mcp_bridge.py");
              const installed = fs.existsSync(filePath);
              versions.push({ version: item.name, startupDir, filePath, installed });
            }
          }
        } catch (e) {}
      }

      // Default fallback if no version directories exist yet
      if (versions.length === 0 && process.env.APPDATA) {
        const fallbackBase = path.join(process.env.APPDATA, "Blender Foundation", "Blender", "5.2");
        const startupDir = path.join(fallbackBase, "scripts", "startup");
        const filePath = path.join(startupDir, "blender_mcp_bridge.py");
        versions.push({ version: "5.2", startupDir, filePath, installed: fs.existsSync(filePath) });
      }

      if (action === "blender_check_startup") {
        const isInstalled = versions.some((v) => v.installed);
        return NextResponse.json({
          success: true,
          installed: isInstalled,
          versions,
        });
      }

      if (action === "blender_install_startup") {
        const bridgeScript = `"""
Ollama AI Workspace - Blender 3D MCP Bridge
Auto-start bridge listener on port 9876.
Enables AI models (Gemma 4, etc.) to inject 3D meshes, materials, lights, and animations live.
"""

bl_info = {
    "name": "Ollama AI Workspace 3D Bridge",
    "author": "Antigravity & Ollama Chat Web",
    "version": (1, 0, 0),
    "blender": (4, 0, 0),
    "location": "Background Service (Port 9876)",
    "description": "Background HTTP listener on port 9876 for direct AI 3D injection",
    "category": "Development",
}

import bpy
import threading
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

# Stop previous server if active to prevent address collision
if 'mcp_server' in bpy.app.driver_namespace:
    try:
        bpy.app.driver_namespace['mcp_server'].shutdown()
        bpy.app.driver_namespace['mcp_server'].server_close()
        print("[AI Bridge] Previous server stopped.")
    except Exception:
        pass

class MCPHandler(BaseHTTPRequestHandler):
    def address_string(self):
        return str(self.client_address[0])

    def log_message(self, format, *args):
        pass

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self._cors()
        self.end_headers()
        ver = bpy.app.version_string
        resp = {
            'status': 'ready',
            'blender': True,
            'version': ver,
            'objects_count': len(bpy.data.objects),
            'last_error': bpy.app.driver_namespace.get('mcp_last_error')
        }
        self.wfile.write(json.dumps(resp).encode('utf-8'))

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            data = json.loads(body) if body else {}
            code = data.get('code', '')

            def run_bpy():
                try:
                    exec(code, {'bpy': bpy})
                    bpy.app.driver_namespace['mcp_last_error'] = None
                    print('[AI Bridge] Code executed successfully! Objects:', len(bpy.data.objects))
                except Exception as ex:
                    import traceback
                    traceback.print_exc()
                    bpy.app.driver_namespace['mcp_last_error'] = f"{type(ex).__name__}: {str(ex)}"
                    print('[AI Bridge] Execution error:', ex)

            if code:
                bpy.app.timers.register(run_bpy)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._cors()
            self.end_headers()
            self.wfile.write(b'{"success": true}')
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self._cors()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))

class ReusableServer(HTTPServer):
    allow_reuse_address = True

def start_server():
    try:
        server = ReusableServer(('127.0.0.1', 9876), MCPHandler)
        bpy.app.driver_namespace['mcp_server'] = server
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        print(f">>> [Ollama AI Workspace] Blender MCP Bridge LIVE on port 9876 (Blender {bpy.app.version_string}) <<<")
    except Exception as e:
        print('[AI Bridge] Startup error:', e)

start_server()
`;
        const installed: string[] = [];
        for (const v of versions) {
          try {
            fs.mkdirSync(v.startupDir, { recursive: true });
            fs.writeFileSync(v.filePath, bridgeScript, "utf-8");
            installed.push(v.filePath);
            v.installed = true;
          } catch (err: any) {
            console.error("Failed to write startup script:", err);
          }
        }

        return NextResponse.json({
          success: installed.length > 0,
          message: `Bridge auto-start installed for Blender (${versions.map((v) => v.version).join(", ")})!`,
          installedPaths: installed,
          versions,
        });
      }

      if (action === "blender_uninstall_startup") {
        let removedCount = 0;
        for (const v of versions) {
          try {
            if (fs.existsSync(v.filePath)) {
              fs.unlinkSync(v.filePath);
              removedCount++;
              v.installed = false;
            }
          } catch (err) {}
        }

        return NextResponse.json({
          success: true,
          message: `Removed bridge auto-start script from ${removedCount} location(s).`,
          versions,
        });
      }
    }

    return NextResponse.json({ success: false, error: `Unknown action '${action}'` }, { status: 400 });
  } catch (error: any) {
    console.error("Connectors API error:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 });
  }
}
