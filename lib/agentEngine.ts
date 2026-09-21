import { AgentTask, AgentLog, Conversation, Message, Project, ApiKeysConfig, PendingApproval } from "./types";
import { apiFetch } from "./apiClient";
import { streamChatCompletion } from "./ollama";
import { parseToolDirective, buildAgentToolDirectivePrompt, getNativeOllamaTools, READ_ONLY_TOOLS, MUTATING_TOOLS, ToolName } from "./tools";
import { executeAgentToolCall, ToolExecutionError } from "./toolEngine";

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

// ============================================================================
// Shared finalize helper — used both by a normal completed run and by a run
// resumed after an approval decision.
// ============================================================================
function finalizeAgentSuccess(
  agent: AgentTask,
  fullOutput: string,
  finalMetrics: any,
  startTime: number,
  effectiveSystemPrompt: string,
  userMsg: Message,
  searchSources: any[]
): { updatedAgent: AgentTask; createdConversation: Conversation } {
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
    logs: [newLog, ...(agent.logs || []).slice(0, 19)],
    updatedAt: Date.now(),
  };

  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    new Notification(`🤖 AI Agent: ${agent.name}`, {
      body: `Execution completed in ${durationSec}s! Click to view report.`,
      icon: "/favicon.svg",
    });
  }

  return { updatedAgent, createdConversation: newConversation };
}

function notifyApprovalNeeded(agent: AgentTask, toolName: string, args: Record<string, any>) {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    new Notification(`⏸️ Agent perlu persetujuan: ${agent.name}`, {
      body: `Ingin menjalankan ${toolName}(${JSON.stringify(args).slice(0, 80)}). Buka app untuk approve/reject.`,
      icon: "/favicon.svg",
      tag: `agent-approval-${agent.id}`,
    });
  }
}

/**
 * Tool-calling loop shared by a fresh agent run and a resumed one. Mutates
 * `history` in place across iterations. Returns either a finished output
 * (loop ended naturally or hit iteration limit) or a paused state with a
 * new PendingApproval the caller must persist and show to the user.
 */
async function runAgentToolLoop(
  agent: AgentTask,
  history: Message[],
  initialOutput: string,
  options: { ollamaUrl: string; apiKeys?: ApiKeysConfig; onProgress?: (t: string) => void; systemPrompt: string },
  initialToolCalls?: { name: string; args: any }[]
): Promise<
  | { paused: true; pendingApproval: PendingApproval; historySoFar: Message[]; outputSoFar: string }
  | { paused: false; fullOutput: string; finalMetrics: any }
> {
  let loopText = initialOutput;
  let workingHistory = [...history];
  const maxIterations = 5;
  let finalMetrics: any = undefined;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let toolName: ToolName | null = null;
    let args: Record<string, any> = {};

    if (iteration === 0 && initialToolCalls && initialToolCalls.length > 0) {
      toolName = initialToolCalls[0].name as ToolName;
      args = initialToolCalls[0].args;
    } else {
      const directive = parseToolDirective(loopText);
      if (directive) {
        toolName = directive.toolName;
        args = directive.args;
      }
    }

    if (!toolName) break;

    const isMutating = MUTATING_TOOLS.includes(toolName);

    if (isMutating) {
      // Pause here. Caller persists this approval and re-invokes
      // resumeAgentAfterApproval() once the user decides.
      let previousContent: string | undefined;
      if ((toolName === "write_file" || toolName === "delete_file") && typeof args.path === "string") {
        try {
          const readResult = await executeAgentToolCall("read_file", { path: args.path });
          previousContent = readResult.raw?.content;
        } catch {
          // write_file: file doesn't exist yet (new file) or isn't readable —
          // leave previousContent undefined, the diff preview treats that as
          // "new file". delete_file: same undefined-on-failure, but here it
          // also means this deletion can never be reverted later (nothing to
          // restore) — /api/tools/revert checks for exactly this.
        }
      }

      const pendingApproval: PendingApproval = {
        id: `approval_${agent.id}_${Date.now()}`,
        source: "agent",
        agentId: agent.id,
        agentName: agent.name,
        toolName,
        args,
        status: "pending",
        createdAt: Date.now(),
        previousContent,
      };
      notifyApprovalNeeded(agent, toolName, args);
      return { paused: true, pendingApproval, historySoFar: workingHistory, outputSoFar: loopText };
    }

    // Read-only tool: execute immediately.
    let toolResultText: string;
    try {
      const result = await executeAgentToolCall(toolName, args);
      toolResultText = JSON.stringify(result.raw).slice(0, 4000);
    } catch (toolErr: any) {
      toolResultText = `ERROR: ${toolErr.message || toolErr}`;
    }

    workingHistory = [
      ...workingHistory,
      { id: `msg_agent_asst_${iteration}_${Date.now()}`, role: "assistant", content: loopText, timestamp: Date.now() },
      {
        id: `msg_agent_toolres_${iteration}_${Date.now()}`,
        role: "user",
        content: `[TOOL_RESULT untuk ${toolName}]:\n${toolResultText}\n\nLanjutkan berdasarkan hasil ini. Jangan panggil tool yang sama dengan argumen sama persis lagi kalau sudah berhasil.`,
        timestamp: Date.now(),
      },
    ];

    let continuation = "";
    await streamChatCompletion({
      hostUrl: options.ollamaUrl,
      model: agent.model,
      messages: workingHistory,
      systemPrompt: options.systemPrompt,
      temperature: agent.temperature ?? 0.7,
      topP: agent.topP ?? 0.9,
      apiKeys: options.apiKeys,
      onToken: (token) => {
        continuation += token;
        if (options.onProgress) options.onProgress(token);
      },
      onFinish: (full, metrics) => {
        continuation = full || continuation;
        finalMetrics = metrics;
      },
    });

    loopText = continuation;
  }

  return { paused: false, fullOutput: loopText, finalMetrics };
}

export async function executeAgent(
  agent: AgentTask,
  options: {
    ollamaUrl: string;
    projects: Project[];
    apiKeys?: ApiKeysConfig;
    onProgress?: (tokenChunk: string) => void;
  }
): Promise<{
  updatedAgent: AgentTask;
  createdConversation?: Conversation;
  pendingApproval?: PendingApproval;
  /** Saved so resumeAgentAfterApproval can pick this run back up. */
  pausedContext?: { history: Message[]; effectiveSystemPrompt: string; userMsg: Message; searchSources: any[] };
}> {
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
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          searchSources = data.results;
          const now = new Date();
          const formattedDate = now.toLocaleDateString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          });

          searchContext = `\n\n=== TEMPORAL GROUNDING & CURRENT REAL-TIME ===\n`;
          searchContext += `Current Date: ${formattedDate} (${now.toISOString().split("T")[0]}).\n`;
          searchContext += `Current Year: ${now.getFullYear()}.\n`;
          searchContext += `CRITICAL TEMPORAL DIRECTIVE: You are an autonomous agent operating in ${now.getFullYear()}. The real-time web search and news results below reflect current live information. Do NOT assume a past knowledge cutoff.\n\n`;
          searchContext += "=== LIVE REAL-TIME WEB & SCRAPED PAGE CONTENT ===\n";
          searchSources.forEach((src, idx) => {
            searchContext += `[${idx + 1}] "${src.title}"\nURL: ${src.url}\nSummary: ${src.snippet}\n`;
            if (src.deepContent) {
              searchContext += `Scraped Content:\n${src.deepContent}\n`;
            }
            searchContext += "\n";
          });
          searchContext += "=== INSTRUCTIONS ===\n";
          searchContext += "Use the live web search and scraped web page content above to formulate your response. Include citations like [1], [2] when stating facts.\n\n";
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
      if (proj.memories && proj.memories.length > 0) {
        const activeMems = proj.memories.filter((m) => m.enabled);
        if (activeMems.length > 0) {
          effectiveSystemPrompt += `\n\n=== PROJECT MEMORIES: ${proj.name.toUpperCase()} ===\n`;
          activeMems.forEach((m) => {
            effectiveSystemPrompt += `- ${m.title}: ${m.content}\n`;
          });
          effectiveSystemPrompt += "=== END OF PROJECT MEMORIES ===\n\n";
        }
      }
    }
  }

  if (agent.diskToolsActive) {
    effectiveSystemPrompt += `\n\n${buildAgentToolDirectivePrompt()}`;
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
    let initialToolCalls: { name: string; args: any }[] | undefined = undefined;

    await streamChatCompletion({
      hostUrl: options.ollamaUrl,
      model: agent.model,
      messages: [userMsg],
      systemPrompt: effectiveSystemPrompt,
      tools: agent.diskToolsActive ? getNativeOllamaTools() : undefined,
      temperature: agent.temperature ?? 0.7,
      topP: agent.topP ?? 0.9,
      apiKeys: options.apiKeys,
      onToken: (token) => {
        fullOutput += token;
        if (options.onProgress) options.onProgress(token);
      },
      onFinish: (full, metrics, _reasoning, toolCalls) => {
        fullOutput = full || fullOutput;
        finalMetrics = metrics;
        initialToolCalls = toolCalls;
      },
    });

    // Tool-calling loop (only relevant if diskToolsActive and model emitted a tool call or directive)
    if (agent.diskToolsActive) {
      const loopResult = await runAgentToolLoop(
        agent,
        [userMsg],
        fullOutput,
        { ollamaUrl: options.ollamaUrl, apiKeys: options.apiKeys, onProgress: options.onProgress, systemPrompt: effectiveSystemPrompt },
        initialToolCalls
      );

      if (loopResult.paused) {
        const pausedAgent: AgentTask = {
          ...agent,
          status: "awaiting_approval",
          updatedAt: Date.now(),
        };
        return {
          updatedAgent: pausedAgent,
          pendingApproval: loopResult.pendingApproval,
          pausedContext: {
            history: loopResult.historySoFar,
            effectiveSystemPrompt,
            userMsg,
            searchSources,
          },
        };
      }

      fullOutput = loopResult.fullOutput;
      finalMetrics = loopResult.finalMetrics || finalMetrics;
    }

    const { updatedAgent, createdConversation } = finalizeAgentSuccess(
      agent,
      fullOutput,
      finalMetrics,
      startTime,
      effectiveSystemPrompt,
      userMsg,
      searchSources
    );
    return { updatedAgent, createdConversation };
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

/**
 * Called after the user approves or rejects a PendingApproval. Executes
 * (or skips) the mutating tool, feeds the result back to the model, and
 * continues the tool loop from where it paused — which may pause again
 * on a second mutating call, finish normally, or fail.
 */
export async function resumeAgentAfterApproval(
  agent: AgentTask,
  approval: PendingApproval,
  decision: "approved" | "rejected",
  pausedContext: { history: Message[]; effectiveSystemPrompt: string; userMsg: Message; searchSources: any[] },
  options: { ollamaUrl: string; apiKeys?: ApiKeysConfig; onProgress?: (tokenChunk: string) => void }
): Promise<{
  updatedAgent: AgentTask;
  createdConversation?: Conversation;
  pendingApproval?: PendingApproval;
  pausedContext?: { history: Message[]; effectiveSystemPrompt: string; userMsg: Message; searchSources: any[] };
}> {
  const startTime = Date.now();
  let toolResultText: string;

  if (decision === "rejected") {
    toolResultText = `DITOLAK oleh user. Tool '${approval.toolName}' tidak dijalankan. Lanjutkan tanpa hasil ini, atau jelaskan ke user kenapa langkah ini diperlukan jika masih relevan.`;
  } else {
    try {
      const result = await executeAgentToolCall(approval.toolName, approval.args, approval.id);
      toolResultText = JSON.stringify(result.raw).slice(0, 4000);
    } catch (toolErr: any) {
      toolResultText = `ERROR: ${toolErr instanceof ToolExecutionError ? toolErr.message : String(toolErr)}`;
    }
  }

  const updatedHistory: Message[] = [
    ...pausedContext.history,
    {
      id: `msg_agent_toolres_resume_${Date.now()}`,
      role: "user",
      content: `[TOOL_RESULT untuk ${approval.toolName}]:\n${toolResultText}\n\nLanjutkan berdasarkan hasil ini.`,
      timestamp: Date.now(),
    },
  ];

  let continuation = "";
  let finalMetrics: any = undefined;
  try {
    await streamChatCompletion({
      hostUrl: options.ollamaUrl,
      model: agent.model,
      messages: updatedHistory,
      systemPrompt: pausedContext.effectiveSystemPrompt,
      temperature: agent.temperature ?? 0.7,
      topP: agent.topP ?? 0.9,
      apiKeys: options.apiKeys,
      onToken: (token) => {
        continuation += token;
        if (options.onProgress) options.onProgress(token);
      },
      onFinish: (full, metrics) => {
        continuation = full || continuation;
        finalMetrics = metrics;
      },
    });

    const loopResult = await runAgentToolLoop(agent, updatedHistory, continuation, {
      ollamaUrl: options.ollamaUrl,
      apiKeys: options.apiKeys,
      onProgress: options.onProgress,
      systemPrompt: pausedContext.effectiveSystemPrompt,
    });

    if (loopResult.paused) {
      const pausedAgent: AgentTask = { ...agent, status: "awaiting_approval", updatedAt: Date.now() };
      return {
        updatedAgent: pausedAgent,
        pendingApproval: loopResult.pendingApproval,
        pausedContext: {
          history: loopResult.historySoFar,
          effectiveSystemPrompt: pausedContext.effectiveSystemPrompt,
          userMsg: pausedContext.userMsg,
          searchSources: pausedContext.searchSources,
        },
      };
    }

    const { updatedAgent, createdConversation } = finalizeAgentSuccess(
      agent,
      loopResult.fullOutput,
      loopResult.finalMetrics || finalMetrics,
      startTime,
      pausedContext.effectiveSystemPrompt,
      pausedContext.userMsg,
      pausedContext.searchSources
    );
    return { updatedAgent, createdConversation };
  } catch (error: any) {
    const newLog: AgentLog = {
      id: `log_${Date.now()}`,
      agentId: agent.id,
      runAt: Date.now(),
      status: "failed",
      summary: "Execution failed after approval resume",
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
