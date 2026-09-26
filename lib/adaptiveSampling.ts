/**
 * Task-Adaptive Sampling Engine.
 * Dynamically tunes inference hyperparameters based on prompt intent and task domain:
 * - Coding & Tool Calling: Low temperature (0.2), high determinism, strict syntax fidelity.
 * - RAG & Factual Retrieval: Controlled temperature (0.3), modest repetition penalty to stick to facts.
 * - Creative & Ideation: Higher temperature (0.85), diverse candidate sampling.
 * - General Chat: Balanced baseline (0.7).
 *
 * User explicit overrides at the conversation level ALWAYS take precedence.
 */

export type SamplingTaskProfile = "coding" | "rag" | "creative" | "general";

export interface SamplingHyperparameters {
  temperature: number;
  topP: number;
  minP: number;
  repeatPenalty: number;
  profile: SamplingTaskProfile;
  reason: string;
}

// Keywords that indicate coding, debugging, algorithmic, or technical syntax tasks
const CODE_SIGNALS = [
  "```",
  "function",
  "const ",
  "let ",
  "var ",
  "def ",
  "class ",
  "import ",
  "export ",
  "return ",
  "console.log",
  "bug",
  "fix",
  "error",
  "syntax",
  "refactor",
  "regex",
  "sql",
  "select ",
  "query",
  "typescript",
  "javascript",
  "python",
  "golang",
  "rust",
  "docker",
  "api",
  "endpoint",
  "json",
  "async ",
  "await ",
  "interface ",
  "struct ",
  "component",
  "koding",
  "kode",
  "skrip",
  "script",
  "algoritma",
  "debug",
];

// Keywords indicating creative writing, storytelling, poetry, or open brainstorming
const CREATIVE_SIGNALS = [
  "cerita",
  "story",
  "karang",
  "puisi",
  "poem",
  "novel",
  "imajinasi",
  "dongeng",
  "brainstorm",
  "ide kreatif",
  "lirik",
  "humor",
  "lelucon",
  "komedi",
  "fiksi",
  "fiction",
  "plot",
  "karakter fiktif",
];

export function detectSamplingProfile(options: {
  userPrompt: string;
  hasRagContext?: boolean;
  hasToolsActive?: boolean;
  hasCodeAttachments?: boolean;
}): { profile: SamplingTaskProfile; reason: string } {
  const { userPrompt, hasRagContext, hasToolsActive, hasCodeAttachments } = options;
  const lowerPrompt = (userPrompt || "").toLowerCase();

  // 1. Coding & Technical Tasks
  if (hasCodeAttachments || hasToolsActive) {
    return {
      profile: "coding",
      reason: hasToolsActive ? "Active tool execution enabled" : "Source code attachments present",
    };
  }

  // Count code signals in prompt
  let codeMatchCount = 0;
  for (const signal of CODE_SIGNALS) {
    if (lowerPrompt.includes(signal)) {
      codeMatchCount++;
      if (codeMatchCount >= 2 || signal === "```" || signal.startsWith("def ") || signal.startsWith("function")) {
        return {
          profile: "coding",
          reason: `Code/syntax tokens detected in prompt (${signal})`,
        };
      }
    }
  }

  // 2. RAG & Knowledge Retrieval
  if (hasRagContext) {
    return {
      profile: "rag",
      reason: "Grounded project knowledge attached",
    };
  }

  // 3. Creative & Open Ideation
  for (const signal of CREATIVE_SIGNALS) {
    if (lowerPrompt.includes(signal)) {
      return {
        profile: "creative",
        reason: `Creative intent detected (${signal})`,
      };
    }
  }

  // 4. Default / General Chat
  return {
    profile: "general",
    reason: "Standard conversational prompt",
  };
}

export function resolveAdaptiveSamplingParams(options: {
  userPrompt: string;
  hasRagContext?: boolean;
  hasToolsActive?: boolean;
  hasCodeAttachments?: boolean;
  baseTemperature?: number;
  baseTopP?: number;
  baseMinP?: number;
  baseRepeatPenalty?: number;
  explicitTemperature?: number;
  explicitTopP?: number;
  explicitMinP?: number;
  explicitRepeatPenalty?: number;
  adaptiveSamplingEnabled?: boolean;
}): SamplingHyperparameters {
  const {
    userPrompt,
    hasRagContext,
    hasToolsActive,
    hasCodeAttachments,
    baseTemperature = 0.7,
    baseTopP = 0.9,
    baseMinP = 0.05,
    baseRepeatPenalty = 1.1,
    explicitTemperature,
    explicitTopP,
    explicitMinP,
    explicitRepeatPenalty,
    adaptiveSamplingEnabled = true,
  } = options;

  const { profile, reason } = detectSamplingProfile({
    userPrompt,
    hasRagContext,
    hasToolsActive,
    hasCodeAttachments,
  });

  // If adaptive sampling is disabled or if user explicitly provided a temperature override,
  // honor user explicit parameters strictly.
  if (!adaptiveSamplingEnabled || explicitTemperature !== undefined) {
    return {
      temperature: explicitTemperature ?? baseTemperature,
      topP: explicitTopP ?? baseTopP,
      minP: explicitMinP ?? baseMinP,
      repeatPenalty: explicitRepeatPenalty ?? baseRepeatPenalty,
      profile: explicitTemperature !== undefined ? profile : "general",
      reason: explicitTemperature !== undefined ? "Manual user temperature override" : "Adaptive sampling disabled",
    };
  }

  switch (profile) {
    case "coding":
      return {
        temperature: explicitTemperature ?? 0.2,
        topP: explicitTopP ?? 0.85,
        minP: explicitMinP ?? 0.05,
        repeatPenalty: explicitRepeatPenalty ?? 1.15,
        profile,
        reason,
      };
    case "rag":
      return {
        temperature: explicitTemperature ?? 0.3,
        topP: explicitTopP ?? 0.9,
        minP: explicitMinP ?? 0.05,
        repeatPenalty: explicitRepeatPenalty ?? 1.15,
        profile,
        reason,
      };
    case "creative":
      return {
        temperature: explicitTemperature ?? 0.85,
        topP: explicitTopP ?? 0.95,
        minP: explicitMinP ?? 0.02,
        repeatPenalty: explicitRepeatPenalty ?? 1.05,
        profile,
        reason,
      };
    case "general":
    default:
      return {
        temperature: explicitTemperature ?? baseTemperature,
        topP: explicitTopP ?? baseTopP,
        minP: explicitMinP ?? baseMinP,
        repeatPenalty: explicitRepeatPenalty ?? baseRepeatPenalty,
        profile,
        reason,
      };
  }
}
