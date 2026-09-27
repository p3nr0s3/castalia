/**
 * Laya System-1 Decision Engine Client (NandhaKishorM/laya).
 * Non-autoregressive encoder-based decision engine (~30ms forward pass)
 * for sub-millisecond intent routing, task profiling, and safety guardrails.
 */

export type LayaQuestionType = "choice" | "noul" | "score";

export interface LayaChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface LayaNoulQuestion {
  type: "noul";
  instructions: string;
}

export interface LayaScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

export type LayaQuestion = LayaChoiceQuestion | LayaNoulQuestion | LayaScoreQuestion;

export interface LayaPredictionRequest {
  state: string | Record<string, any>;
  questions: Record<string, LayaQuestion>;
  model?: "multilingual" | "english" | "typed-decisions" | string;
  max_len?: number;
}

export interface LayaChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
}

export interface LayaNoulAnswer {
  type: "noul";
  noul: number; // 0.0 to 1.0 probability of "yes"
}

export interface LayaScoreAnswer {
  type: "score";
  score: number;
  confidence?: number;
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
}

export type LayaAnswer = LayaChoiceAnswer | LayaNoulAnswer | LayaScoreAnswer;

export interface LayaPredictionResponse {
  model?: string;
  answers: Record<string, LayaAnswer>;
  routing?: { model: string };
  latency_ms?: number;
}

export interface LayaTaskProfileResult {
  profile: "coding" | "rag" | "creative" | "general";
  confidence: number;
  needsDeepReasoning: boolean;
  rawAnswer?: LayaPredictionResponse;
}

import { apiFetch } from "./apiClient";

export const DEFAULT_LAYA_ENDPOINT = "http://127.0.0.1:8000";
export const DEFAULT_LAYA_TIMEOUT_MS = 1500;

function resolveLayaUrl(subpath: string, host: string): string {
  const cleanSubpath = subpath.replace(/^\/+/, "");
  // In browser, route through internal Next.js API proxy to avoid browser CORS preflight (405) errors
  if (typeof window !== "undefined") {
    return `/api/laya/${cleanSubpath}?host=${encodeURIComponent(host)}`;
  }
  return `${host.replace(/\/+$/, "")}/${cleanSubpath}`;
}

/**
 * Checks whether the Laya server is reachable and responsive.
 */
export async function checkLayaHealth(
  endpoint = DEFAULT_LAYA_ENDPOINT,
  timeoutMs = 1200
): Promise<{ online: boolean; latencyMs?: number; error?: string }> {
  const cleanEndpoint = endpoint.replace(/\/+$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();
  const fetchFn = typeof window !== "undefined" ? apiFetch : fetch;

  try {
    // 1. Try standard Laya GET /health endpoint first
    let response = await fetchFn(resolveLayaUrl("health", cleanEndpoint), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });

    // 2. If /health returned 404, fallback to probing POST /predict
    if (response.status === 404) {
      response = await fetchFn(resolveLayaUrl("predict", cleanEndpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: "ping",
          questions: {
            test: { type: "noul", instructions: "Is this a test?" },
          },
        }),
        signal: controller.signal,
      });
    }

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (response.ok) {
      return { online: true, latencyMs };
    }

    return {
      online: false,
      error: `Server returned HTTP ${response.status}: ${response.statusText}`,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    return {
      online: false,
      error: err.name === "AbortError" ? "Connection timed out" : (err.message || "Connection refused"),
    };
  }
}

/**
 * Dispatches a typed question set to the Laya Decision Engine.
 * Gracefully returns null if the server is offline or fails, without throwing.
 */
export async function predictWithLaya(
  request: LayaPredictionRequest,
  options?: { endpoint?: string; timeoutMs?: number }
): Promise<LayaPredictionResponse | null> {
  const endpoint = (options?.endpoint || DEFAULT_LAYA_ENDPOINT).replace(/\/+$/, "");
  const timeoutMs = options?.timeoutMs ?? DEFAULT_LAYA_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fetchFn = typeof window !== "undefined" ? apiFetch : fetch;

  try {
    // Try standard Laya /v1/systemone endpoint first, falling back to /predict
    let res = await fetchFn(resolveLayaUrl("v1/systemone", endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (res.status === 404) {
      res = await fetchFn(resolveLayaUrl("predict", endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    }

    clearTimeout(timer);

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as LayaPredictionResponse;
    return data;
  } catch (_err) {
    clearTimeout(timer);
    // Silent graceful fallback
    return null;
  }
}

/**
 * Classifies a user prompt into a task profile and reasoning depth in ~30ms.
 * Uses Laya's multilingual model to support Indonesian, English, and mixed code.
 */
export async function classifyTaskProfileWithLaya(
  prompt: string,
  options?: { endpoint?: string; timeoutMs?: number }
): Promise<LayaTaskProfileResult | null> {
  const trimmed = (prompt || "").trim();
  if (!trimmed) return null;

  const questions: Record<string, LayaQuestion> = {
    profile: {
      type: "choice",
      instructions: "Identify the primary task profile of the user prompt.",
      criteria: {
        coding: "Programming code, fixing bugs, refactoring, writing scripts, regex, SQL, algorithms, terminal commands",
        rag: "Answering strictly based on uploaded files, reading documentation, querying knowledge base documents",
        creative: "Creative storytelling, writing poetry, imaginative roleplay, fictional dialogue, novel ideas, humor",
        general: "Casual chat, greeting, conceptual discussion, math calculations, common question",
      },
    },
    deep_reasoning: {
      type: "noul",
      instructions: "Does this prompt require complex multi-step reasoning, mathematical proof, or architectural analysis?",
    },
  };

  const response = await predictWithLaya(
    {
      state: trimmed.slice(0, 4000), // Laya reads up to 8192 tokens; 4000 chars is plenty for classification
      questions,
      model: "multilingual",
    },
    options
  );

  if (!response?.answers) return null;

  const profileAnswer = response.answers.profile as LayaChoiceAnswer | undefined;
  const reasoningAnswer = response.answers.deep_reasoning as LayaNoulAnswer | undefined;

  let resolvedProfile: "coding" | "rag" | "creative" | "general" = "general";
  let confidence = 0.5;

  if (profileAnswer && profileAnswer.type === "choice" && profileAnswer.choice) {
    const rawChoice = profileAnswer.choice.toLowerCase();
    if (rawChoice === "coding" || rawChoice === "rag" || rawChoice === "creative" || rawChoice === "general") {
      resolvedProfile = rawChoice;
      confidence = profileAnswer.confidence ?? 0.8;
    }
  }

  const needsDeepReasoning = Boolean(
    reasoningAnswer && reasoningAnswer.type === "noul" && typeof reasoningAnswer.noul === "number" && reasoningAnswer.noul >= 0.65
  );

  return {
    profile: resolvedProfile,
    confidence,
    needsDeepReasoning,
    rawAnswer: response,
  };
}

/**
 * Fast System-1 safety guardrail for mutating disk operations or terminal commands.
 * Returns risk score between 0.0 (safe) and 1.0 (dangerous).
 */
export async function evaluateToolSafetyWithLaya(
  toolName: string,
  args: Record<string, any>,
  options?: { endpoint?: string; timeoutMs?: number }
): Promise<{ isDangerous: boolean; riskScore: number; reason?: string } | null> {
  const summaryPayload = {
    tool: toolName,
    path: args?.path || args?.targetPath || args?.filePath,
    contentPreview: typeof args?.content === "string" ? args.content.slice(0, 300) : undefined,
    command: args?.command,
  };

  const questions: Record<string, LayaQuestion> = {
    is_destructive: {
      type: "noul",
      instructions: "Is this action dangerous, overwriting system-critical files, or executing destructive deletions?",
    },
    risk_level: {
      type: "score",
      instructions: "Score the security and operational risk level of this operation.",
      criteria: ["safe or standard project file edit", "medium impact configuration change", "critical or destructive deletion"],
    },
  };

  const response = await predictWithLaya(
    {
      state: summaryPayload,
      questions,
      model: "multilingual",
    },
    options
  );

  if (!response?.answers) return null;

  const destAnswer = response.answers.is_destructive as LayaNoulAnswer | undefined;
  const riskAnswer = response.answers.risk_level as LayaScoreAnswer | undefined;

  const prob = destAnswer?.type === "noul" ? destAnswer.noul : 0;
  const isDangerous = prob >= 0.5;

  return {
    isDangerous,
    riskScore: prob,
    reason: `Laya Security Risk: ${(prob * 100).toFixed(0)}% (score: ${riskAnswer?.score?.toFixed(1) ?? "n/a"})`,
  };
}
