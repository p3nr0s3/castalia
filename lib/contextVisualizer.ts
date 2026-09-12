import { Conversation, Project, AppSettings } from "./types";
import { estimateTokens } from "./rag";
import { buildToolDirectivePrompt } from "./tools";

export interface ContextBreakdown {
  systemPromptTokens: number;
  ragTokens: number;
  historyTokens: number;
  inputTokens: number;
  totalUsedTokens: number;
  totalMaxTokens: number;
  remainingTokens: number;
  usagePercentage: number;
  isNearOverflow: boolean;
  historyBudget: number;
  historyWasTrimmed: boolean;
}

export interface CalculateContextOptions {
  conversation: Conversation | null;
  project?: Project | null;
  settings: AppSettings;
  currentInput?: string;
  diskToolsActive?: boolean;
}

/**
 * Calculates live token consumption breakdown across all components of the prompt context:
 * - System Prompt (base prompt + persona + optional tool directives)
 * - Project RAG / Knowledge Context
 * - Chat Message History (accounting for historyBudget sliding window)
 * - Current User Input
 * - Remaining token budget against numCtx
 */
export function calculateContextBreakdown({
  conversation,
  project,
  settings,
  currentInput = "",
  diskToolsActive = false,
}: CalculateContextOptions): ContextBreakdown {
  const totalMaxTokens = conversation?.numCtx ?? project?.numCtx ?? settings.numCtx ?? 16384;
  const historyBudget = Math.max(2000, Math.floor(totalMaxTokens * 0.45));

  // 1. System Prompt Tokens
  let systemText = conversation?.systemPrompt || project?.systemPrompt || settings.defaultSystemPrompt || "";
  if (diskToolsActive) {
    systemText += `\n\n${buildToolDirectivePrompt()}`;
  }
  const systemPromptTokens = estimateTokens(systemText);

  // 2. RAG / Knowledge Chunks Tokens
  let ragTokens = 0;
  if (project?.files && project.files.length > 0) {
    const totalFilesTokens = project.files.reduce(
      (acc, file) => acc + estimateTokens(file.textContent || ""),
      0
    );
    // RAG engine caps retrieval budget to remaining context or 45% of totalMaxTokens
    const maxRagBudget = Math.floor(totalMaxTokens * 0.40);
    ragTokens = Math.min(totalFilesTokens, maxRagBudget);
  }

  // 3. Chat History Tokens
  let rawHistoryTokens = 0;
  let historyTokens = 0;
  let historyWasTrimmed = false;

  if (conversation?.messages && conversation.messages.length > 0) {
    for (const msg of conversation.messages) {
      const msgTokens = estimateTokens(msg.content || "") + 50; // buffer for role formatting
      rawHistoryTokens += msgTokens;
    }

    if (rawHistoryTokens > historyBudget) {
      historyTokens = historyBudget;
      historyWasTrimmed = true;
    } else {
      historyTokens = rawHistoryTokens;
    }
  }

  // 4. Current Input Tokens
  const inputTokens = currentInput.trim() ? estimateTokens(currentInput) + 50 : 0;

  // 5. Aggregation
  const totalUsedTokens = systemPromptTokens + ragTokens + historyTokens + inputTokens;
  const remainingTokens = Math.max(0, totalMaxTokens - totalUsedTokens);
  const usagePercentage = Math.min(100, Math.round((totalUsedTokens / totalMaxTokens) * 100));
  const isNearOverflow = usagePercentage >= 85;

  return {
    systemPromptTokens,
    ragTokens,
    historyTokens,
    inputTokens,
    totalUsedTokens,
    totalMaxTokens,
    remainingTokens,
    usagePercentage,
    isNearOverflow,
    historyBudget,
    historyWasTrimmed,
  };
}

/**
 * Format token count with K suffix for clean UI display (e.g. 1.4K, 16K)
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return tokens.toLocaleString();
}
