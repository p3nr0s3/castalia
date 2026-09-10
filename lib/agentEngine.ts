import { AgentTask, AgentLog, Conversation, Message, Project, ApiKeysConfig } from "./types";
import { apiFetch } from "./apiClient";
import { streamChatCompletion } from "./ollama";

export const AGENT_PRESET_TEMPLATES = [
  {
    name: "📰 Morning AI & Tech News Digest",
    description: "Searches the web daily for top AI and tech breakthroughs and compiles a summary report.",
    prompt: "Search the web for the latest artificial intelligence breakthroughs, open-source models, and top tech news from today. Compile a structured summary report highlighting the top 5 stories, their importance, and key takeaways.",
    webSearch: true,
    scheduleType: "daily" as const,
    dailyTime: "08:00",
    intervalMinutes: 1440,
    temperature: 0.5,
  },
  {
    name: "📈 Crypto & Market Pulse",
    description: "Monitors market movements, financial news, and crypto trends with live web research.",
    prompt: "Search the latest market and cryptocurrency movements from today. Provide a concise market overview, key gainers/losers, major macro news, and practical analysis.",
    webSearch: true,
    scheduleType: "interval" as const,
    intervalMinutes: 360, // Every 6 hours
    dailyTime: "09:00",
    temperature: 0.4,
  },
  {
    name: "💡 Daily Startup & SaaS Idea Generator",
    description: "Brainstorms 3 novel software/AI product concepts with monetization strategies.",
    prompt: "Brainstorm 3 novel and practical AI/SaaS startup ideas solving real problems. For each idea include: Problem statement, Target audience, Proposed solution/architecture, and Monetization strategy.",
    webSearch: false,
    scheduleType: "daily" as const,
    dailyTime: "07:30",
    intervalMinutes: 1440,
    temperature: 0.85,
  },
  {
    name: "🎯 Daily Productivity & High-Impact Planner",
    description: "Formulates a structured productivity blueprint, prioritization, and deep-work strategy.",
    prompt: "Create a powerful daily action blueprint for a developer/builder. Include: Morning routine, Top 3 high-leverage tasks framework, Deep-work timeblocks, and an evening review checklist.",
    webSearch: false,
    scheduleType: "daily" as const,
    dailyTime: "07:00",
    intervalMinutes: 1440,
    temperature: 0.6,
  },
];

export function calculateNextRun(agent: AgentTask): number | undefined {
  if (!agent.enabled || agent.scheduleType === "manual") {
    return undefined;
  }

  const now = Date.now();

  if (agent.scheduleType === "interval") {
    const mins = agent.intervalMinutes && agent.intervalMinutes > 0 ? agent.intervalMinutes : 60;
    return now + mins * 60 * 1000;
  }

  if (agent.scheduleType === "daily" && agent.dailyTime) {
    const [hours, minutes] = agent.dailyTime.split(":").map(Number);
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);

    // If the scheduled time today has already passed, schedule for tomorrow
    if (target.getTime() <= now) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime();
  }

  return undefined;
}

export async function executeAgent(
  agent: AgentTask,
  options: {
    ollamaUrl: string;
    searxngUrl: string;
    projects: Project[];
    apiKeys?: ApiKeysConfig;
    onProgress?: (tokenChunk: string) => void;
  }
): Promise<{ updatedAgent: AgentTask; createdConversation?: Conversation }> {
  const startTime = Date.now();
  let searchSources: any[] = [];
  let searchContext = "";

  // 1. Web Search if enabled
  if (agent.webSearch) {
    try {
      const res = await apiFetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: agent.prompt,
          searxngUrl: options.searxngUrl,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          searchSources = data.results;
          searchContext = "\n\n=== LIVE REAL-TIME WEB SEARCH RESULTS (via SearXNG) ===\n";
          searchSources.forEach((src, idx) => {
            searchContext += `[${idx + 1}] "${src.title}"\nURL: ${src.url}\nSummary: ${src.snippet}\n\n`;
          });
          searchContext += "=== INSTRUCTIONS ===\n";
          searchContext += "Use the live web search results above to formulate your response. Include citations like [1], [2] when stating facts.\n\n";
        }
      }
    } catch (e) {
      console.warn("Agent web search error:", e);
    }
  }

  // 2. Build System Prompt & Project Context
  let effectiveSystemPrompt =
    agent.systemPrompt ||
    "You are an autonomous AI Agent executing scheduled workflows. Provide clear, well-structured, and high-value reports.";

  if (agent.targetProjectId) {
    const proj = options.projects.find((p) => p.id === agent.targetProjectId);
    if (proj) {
      if (proj.systemPrompt) effectiveSystemPrompt = `${effectiveSystemPrompt}\n\nProject Guidelines: ${proj.systemPrompt}`;
      if (proj.files && proj.files.length > 0) {
        effectiveSystemPrompt += "\n\n=== PROJECT KNOWLEDGE BASE ===\n";
        proj.files.forEach((f) => {
          effectiveSystemPrompt += `\n[File: ${f.name}]\n\`\`\`\n${f.textContent}\n\`\`\`\n`;
        });
        effectiveSystemPrompt += "=== END OF KNOWLEDGE BASE ===\n\n";
      }
    }
  }

  if (searchContext) {
    effectiveSystemPrompt += searchContext;
  }

  // 3. User Message & Assistant Placeholder
  const userMsg: Message = {
    id: `msg_agent_req_${Date.now()}`,
    role: "user",
    content: `[Automated Task Trigger]: ${agent.prompt}`,
    timestamp: Date.now(),
  };

  try {
    let fullOutput = "";
    let finalMetrics: any = undefined;

    await streamChatCompletion({
      hostUrl: options.ollamaUrl,
      model: agent.model,
      messages: [userMsg],
      systemPrompt: effectiveSystemPrompt,
      temperature: agent.temperature ?? 0.7,
      topP: agent.topP ?? 0.9,
      apiKeys: options.apiKeys,
      onToken: (token) => {
        fullOutput += token;
        if (options.onProgress) options.onProgress(token);
      },
      onFinish: (full, metrics) => {
        fullOutput = full || fullOutput;
        finalMetrics = metrics;
      },
    });

    const durationSec = Math.round((Date.now() - startTime) / 1000);
    const convId = `conv_agent_${Date.now()}`;

    const assistantMsg: Message = {
      id: `msg_agent_res_${Date.now()}`,
      role: "assistant",
      content: fullOutput,
      timestamp: Date.now(),
      model: agent.model,
      sources: searchSources.length > 0 ? searchSources : undefined,
      metrics: finalMetrics,
    };

    const newConversation: Conversation = {
      id: convId,
      title: `🤖 ${agent.name} (${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`,
      projectId: agent.targetProjectId,
      agentId: agent.id,
      isAgentGenerated: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: agent.model,
      systemPrompt: effectiveSystemPrompt,
      temperature: agent.temperature ?? 0.7,
      topP: agent.topP ?? 0.9,
      messages: [userMsg, assistantMsg],
    };

    const newLog: AgentLog = {
      id: `log_${Date.now()}`,
      agentId: agent.id,
      runAt: Date.now(),
      status: "success",
      summary: fullOutput.slice(0, 140).replace(/\n/g, " ") + "...",
      conversationId: convId,
      tokensGenerated: finalMetrics?.evalCount || 0,
      durationSeconds: durationSec,
    };

    const updatedAgent: AgentTask = {
      ...agent,
      status: "completed",
      lastRun: Date.now(),
      nextRun: calculateNextRun(agent),
      runCount: (agent.runCount || 0) + 1,
      logs: [newLog, ...(agent.logs || []).slice(0, 19)], // keep last 20 logs
      updatedAt: Date.now(),
    };

    // Send Browser Notification if allowed
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification(`🤖 AI Agent: ${agent.name}`, {
        body: `Execution completed in ${durationSec}s! Click to view report.`,
        icon: "/favicon.svg",
      });
    }

    return { updatedAgent, createdConversation: newConversation };
  } catch (error: any) {
    const newLog: AgentLog = {
      id: `log_${Date.now()}`,
      agentId: agent.id,
      runAt: Date.now(),
      status: "failed",
      summary: "Execution failed",
      error: error.message || "Unknown error",
      durationSeconds: Math.round((Date.now() - startTime) / 1000),
    };

    const updatedAgent: AgentTask = {
      ...agent,
      status: "failed",
      lastRun: Date.now(),
      nextRun: calculateNextRun(agent),
      logs: [newLog, ...(agent.logs || []).slice(0, 19)],
      updatedAt: Date.now(),
    };

    return { updatedAgent };
  }
}
