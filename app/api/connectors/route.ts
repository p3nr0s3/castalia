import { NextRequest, NextResponse } from "next/server";

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
        const targetUrl = (endpoint || "http://127.0.0.1:9876").trim();
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          const res = await fetch(targetUrl, { signal: controller.signal }).catch(() => null);
          clearTimeout(timeoutId);

          if (res) {
            return NextResponse.json({
              success: true,
              message: `Connected to Blender MCP Bridge at ${targetUrl}! Live 3D Python execution ready.`,
            });
          }
        } catch {
          // Ignore
        }
        return NextResponse.json(
          {
            success: false,
            error: `Could not reach Blender at ${targetUrl}. Start Blender and run the MCP Bridge script in the Scripting workspace.`,
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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${targetUrl}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: scriptCode }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
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

    return NextResponse.json({ success: false, error: `Unknown action '${action}'` }, { status: 400 });
  } catch (error: any) {
    console.error("Connectors API error:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 });
  }
}
