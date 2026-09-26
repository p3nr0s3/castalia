import { Message, OllamaModel, GenerationMetrics, ModelProvider, ApiKeysConfig, ModelPullProgress } from "./types";
import { apiFetch } from "./apiClient";
import { CLOUD_MODEL_PRESETS } from "./constants";
import { ReasoningStreamParser } from "./reasoningParser";
import { buildToolDirectivePrompt } from "./tools";
import { countTokens } from "./tokenizer";

export interface ChatStreamOptions {
  hostUrl?: string;
  provider?: ModelProvider;
  model: string;
  messages: Message[];
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  numCtx?: number;
  numPredict?: number;
  numKeep?: number;
  repeatPenalty?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  stop?: string[];
  seed?: number;
  keepAlive?: string;
  apiKeys?: ApiKeysConfig;
  signal?: AbortSignal;
  tools?: any[];
  format?: "json" | Record<string, any>;
  onToken: (chunk: string, liveStats?: { tokenCount: number; liveTps: number }) => void;
  onReasoning?: (reasoningChunk: string) => void;
  onToolCall?: (toolCall: { name: string; args: Record<string, any> }) => void;
  onError?: (err: Error) => void;
  onFinish?: (
    fullText: string,
    metrics?: GenerationMetrics,
    fullReasoning?: string,
    toolCalls?: { name: string; args: Record<string, any> }[]
  ) => void;
}

export function detectModelProvider(modelName: string): ModelProvider {
  const cloudMatch = CLOUD_MODEL_PRESETS.find((m) => m.id === modelName);
  if (cloudMatch) return cloudMatch.provider;

  if (modelName.startsWith("gemini-")) return "gemini";
  if (modelName.startsWith("gpt-") || modelName.startsWith("o1") || modelName.startsWith("o3")) return "openai";
  if (modelName.startsWith("claude-")) return "anthropic";
  if (modelName.startsWith("deepseek-")) return "deepseek";
  if (modelName.includes("groq") || modelName.startsWith("llama-3.3")) return "groq";

  return "ollama";
}

/**
 * Family-aware turn boundary and control stop tokens for open-weight models.
 * Truncates multi-turn role hallucination (e.g. model continuing to generate `\nUser:`)
 * before wasting GPU predict tokens and corrupting dialogue context.
 */
export function getFamilyStopTokens(modelName: string): string[] {
  const name = modelName.toLowerCase();
  const stops: string[] = ["\nUser:", "\nHuman:"];

  if (name.includes("llama-3") || name.includes("llama3")) {
    stops.push("<|eot_id|>", "<|start_header_id|>", "<|end_header_id|>");
  } else if (name.includes("qwen")) {
    stops.push("<|im_end|>", "<|im_start|>", "<|endoftext|>");
  } else if (name.includes("deepseek")) {
    stops.push("<｜end of sentence｜>", "<｜User｜>", "<｜Assistant｜>");
  } else if (name.includes("gemma")) {
    stops.push("<end_of_turn>", "<start_of_turn>");
  } else if (name.includes("mistral") || name.includes("mixtral")) {
    stops.push("</s>", "[INST]");
  }

  return stops;
}

export function getApiKeyForProvider(provider: ModelProvider, apiKeys?: ApiKeysConfig): string | undefined {
  if (!apiKeys) return undefined;
  switch (provider) {
    case "gemini":
      return apiKeys.geminiApiKey;
    case "openai":
      return apiKeys.openaiApiKey;
    case "anthropic":
      return apiKeys.anthropicApiKey;
    case "groq":
      return apiKeys.groqApiKey;
    case "deepseek":
      return apiKeys.deepseekApiKey;
    case "openrouter":
      return apiKeys.openrouterApiKey;
    case "custom":
      return apiKeys.customApiKey;
    default:
      return undefined;
  }
}

export async function checkOllamaHealth(hostUrl = "http://localhost:11434"): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/ollama/api/version?host=${encodeURIComponent(hostUrl)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchOllamaModels(hostUrl = "http://localhost:11434"): Promise<OllamaModel[]> {
  try {
    const res = await apiFetch(`/api/ollama/api/tags?host=${encodeURIComponent(hostUrl)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch models: ${res.statusText}`);
    }
    const data = await res.json();
    return data.models || [];
  } catch (err) {
    console.error("Error fetching Ollama models:", err);
    return [];
  }
}

// ============================================================================
// VRAM PRESSURE — a scoped, honest version of "hardware-aware fallback"
// ============================================================================
// What this deliberately does NOT do: predict whether a model that hasn't
// been loaded yet will fit in VRAM. Ollama has no endpoint that reports
// total or free system VRAM, and querying that portably across
// NVIDIA/AMD/Intel/Apple Silicon from a Node server isn't realistic without
// shelling out to vendor-specific tools that may not even be installed.
//
// What it DOES do: after a model has already been loaded and run, Ollama's
// own /api/ps reports `size` (the model's total footprint) alongside
// `size_vram` (how much of that Ollama actually managed to keep resident in
// VRAM — the rest silently spills to system RAM/CPU, which is why a model
// that "fits" on paper can still run far slower than expected). Comparing
// the two after the fact is a real, measured signal — not a guess — that
// this device is VRAM-constrained for this specific model.

export interface OllamaRunningModel {
  model: string;
  name?: string;
  size: number;
  size_vram: number;
  expires_at?: string;
}

export interface VramPressureResult {
  constrained: boolean;
  /** size_vram / size, 0..1. Lower means more of the model spilled to CPU/system RAM. */
  vramRatio: number;
  sizeBytes: number;
  vramBytes: number;
}

// Below this ratio, enough of the model is running outside VRAM that it's
// worth mentioning — chosen loosely (not derived from a fixed benchmark)
// as "more than a small rounding sliver has spilled to CPU".
const VRAM_PRESSURE_THRESHOLD = 0.85;

/** Pure — no I/O, so this is unit-testable without mocking fetch. */
export function evaluateVramPressure(models: OllamaRunningModel[], modelName: string): VramPressureResult | null {
  const running = models.find((m) => m.model === modelName || m.name === modelName);
  if (!running || !running.size || running.size_vram === undefined || running.size_vram === null) return null;

  const vramRatio = running.size_vram / running.size;
  return {
    constrained: vramRatio < VRAM_PRESSURE_THRESHOLD,
    vramRatio,
    sizeBytes: running.size,
    vramBytes: running.size_vram,
  };
}

export async function fetchRunningOllamaModels(hostUrl = "http://localhost:11434"): Promise<OllamaRunningModel[]> {
  try {
    const res = await apiFetch(`/api/ollama/api/ps?host=${encodeURIComponent(hostUrl)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.models || [];
  } catch {
    return [];
  }
}

/** Convenience glue: fetch + evaluate in one call, for callers that don't need the raw list. */
export async function checkVramPressure(hostUrl: string, modelName: string): Promise<VramPressureResult | null> {
  const models = await fetchRunningOllamaModels(hostUrl);
  return evaluateVramPressure(models, modelName);
}

export async function streamChatCompletion({
  hostUrl = "http://localhost:11434",
  provider,
  model,
  messages,
  systemPrompt,
  temperature = 0.7,
  topP = 0.9,
  topK,
  minP,
  numCtx,
  numPredict,
  numKeep,
  repeatPenalty,
  presencePenalty,
  frequencyPenalty,
  stopSequences,
  stop,
  seed,
  keepAlive,
  apiKeys,
  signal,
  tools,
  format,
  onToken,
  onReasoning,
  onToolCall,
  onError,
  onFinish,
}: ChatStreamOptions): Promise<string> {
  let fullResponse = "";
  let fullReasoning = "";

  const resolvedProvider = provider || detectModelProvider(model);

  // -------------------------------------------------------------
  // CLOUD AI MODELS (Gemini, Claude, OpenAI, Groq, DeepSeek, Custom)
  // -------------------------------------------------------------
  if (resolvedProvider !== "ollama") {
    try {
      const apiKey = getApiKeyForProvider(resolvedProvider, apiKeys);
      const customBaseUrl = apiKeys?.customBaseUrl;

      const res = await apiFetch("/api/cloud/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: resolvedProvider,
          model,
          messages,
          systemPrompt,
          temperature,
          topP,
          apiKey,
          customBaseUrl,
        }),
        signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        let parsedError = errorText;
        try {
          const json = JSON.parse(errorText);
          if (json.error) parsedError = json.error;
        } catch {}
        throw new Error(parsedError || `${resolvedProvider.toUpperCase()} request failed (${res.status})`);
      }

      if (!res.body) {
        throw new Error("No response stream received from Cloud Model API");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const startTime = performance.now();
      let tokenChunkCount = 0;
      let finalMetrics: GenerationMetrics | undefined;
      const reasoningParser = new ReasoningStreamParser();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const parsed = JSON.parse(trimmed);

            if (parsed.message?.reasoning) {
              const rToken = parsed.message.reasoning;
              fullReasoning += rToken;
              if (onReasoning) onReasoning(rToken);
            }

            if (parsed.message?.content) {
              const contentChunk = parsed.message.content;
              reasoningParser.processChunk(contentChunk, {
                onToken: (t) => {
                  fullResponse += t;
                  tokenChunkCount++;
                  const elapsedSec = (performance.now() - startTime) / 1000;
                  const liveTps = elapsedSec > 0.1 ? Math.round((tokenChunkCount / elapsedSec) * 10) / 10 : 0;
                  onToken(t, { tokenCount: tokenChunkCount, liveTps });
                },
                onReasoning: (r) => {
                  fullReasoning += r;
                  if (onReasoning) onReasoning(r);
                },
              });
            }

            if (parsed.done) {
              const totalSec = (performance.now() - startTime) / 1000;
              finalMetrics = {
                evalCount: parsed.eval_count || tokenChunkCount,
                promptEvalCount: parsed.prompt_eval_count,
                evalTps: totalSec > 0 ? Math.round((tokenChunkCount / totalSec) * 10) / 10 : 0,
                totalSeconds: Math.round(totalSec * 100) / 100,
              };
            }
          } catch {}
        }
      }

      reasoningParser.flush({
        onToken: (t) => {
          fullResponse += t;
          tokenChunkCount++;
          onToken(t);
        },
        onReasoning: (r) => {
          fullReasoning += r;
          if (onReasoning) onReasoning(r);
        },
      });

      if (onFinish) {
        onFinish(fullResponse, finalMetrics, fullReasoning || undefined);
      }
      return fullResponse;
    } catch (err: any) {
      if (err.name === "AbortError") {
        if (onFinish) onFinish(fullResponse, undefined, fullReasoning || undefined);
        return fullResponse;
      }
      if (onError) onError(err);
      throw err;
    }
  }

  // -------------------------------------------------------------
  // LOCAL OLLAMA MODELS
  // -------------------------------------------------------------
  try {
    const formattedMessages = [];

    if (systemPrompt && systemPrompt.trim()) {
      formattedMessages.push({
        role: "system",
        content: systemPrompt.trim(),
      });
    }

    for (const msg of messages) {
      if (msg.content || (msg.attachments && msg.attachments.length > 0)) {
        let msgContent = msg.content || "";
        const imageBase64s: string[] = [];

        if (msg.attachments && msg.attachments.length > 0) {
          const docAttachments = msg.attachments.filter((a) => a.type === "document");
          const imgAttachments = msg.attachments.filter((a) => a.type === "image");

          for (const img of imgAttachments) {
            if (img.base64) imageBase64s.push(img.base64);
          }

          if (docAttachments.length > 0) {
            let docSection = "\n\n--- Attached Documents ---\n";
            for (const doc of docAttachments) {
              docSection += `\n[File: ${doc.name} (${formatBytes(doc.size)})]\n`;
              docSection += "```\n" + (doc.textContent || "") + "\n```\n";
            }
            docSection += "--- End of Documents ---\n\n";
            msgContent = `${docSection}${msgContent}`;
          }
        }

        const ollamaMsg: { role: string; content: string; images?: string[] } = {
          role: msg.role,
          content: msgContent,
        };

        if (imageBase64s.length > 0) {
          ollamaMsg.images = imageBase64s;
        }

        formattedMessages.push(ollamaMsg);
      }
    }

    const optionsPayload: Record<string, any> = {
      temperature,
      top_p: topP,
    };
    if (topK !== undefined) optionsPayload.top_k = topK;
    if (minP !== undefined) optionsPayload.min_p = minP;
    const resolvedCtx = numCtx ?? (await resolveEffectiveNumCtx(model, undefined, hostUrl));
    optionsPayload.num_ctx = resolvedCtx;
    if (numPredict !== undefined) optionsPayload.num_predict = numPredict;
    if (repeatPenalty !== undefined) optionsPayload.repeat_penalty = repeatPenalty;
    if (presencePenalty !== undefined) optionsPayload.presence_penalty = presencePenalty;
    if (frequencyPenalty !== undefined) optionsPayload.frequency_penalty = frequencyPenalty;
    if (seed !== undefined) optionsPayload.seed = seed;

    // Pin static system prompt in KV cache automatically if num_keep is not set
    if (numKeep !== undefined) {
      optionsPayload.num_keep = numKeep;
    } else if (systemPrompt && systemPrompt.trim()) {
      optionsPayload.num_keep = countTokens(systemPrompt);
    }

    // Merge family-aware turn boundaries with user stop sequences
    const userStops = stopSequences || stop || [];
    const familyStops = getFamilyStopTokens(model);
    const mergedStops = Array.from(new Set([...userStops, ...familyStops]));
    if (mergedStops.length > 0) optionsPayload.stop = mergedStops;

    const payload: Record<string, any> = {
      model,
      messages: formattedMessages,
      stream: true,
      options: optionsPayload,
    };
    if (format) {
      payload.format = format;
    }
    if (tools && tools.length > 0) {
      payload.tools = tools;
    }
    if (keepAlive) {
      payload.keep_alive = keepAlive;
    }

    let res = await apiFetch(`/api/ollama/api/chat?host=${encodeURIComponent(hostUrl)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });

    // If custom format schema fails on older Ollama, fallback gracefully to format: "json"
    if (!res.ok && payload.format && typeof payload.format === "object") {
      payload.format = "json";
      res = await apiFetch(`/api/ollama/api/chat?host=${encodeURIComponent(hostUrl)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });
    }

    // If the model does not support native tools, retry with tool directive fallback gracefully
    if (!res.ok && payload.tools) {
      const errClone = await res.clone().text();
      if (errClone.toLowerCase().includes("does not support tools") || res.status === 400) {
        delete payload.tools;
        const directive = buildToolDirectivePrompt();
        if (formattedMessages.length > 0 && formattedMessages[0].role === "system") {
          formattedMessages[0].content = `${formattedMessages[0].content}\n\n${directive}`;
        } else {
          formattedMessages.unshift({ role: "system", content: directive });
        }
        res = await apiFetch(`/api/ollama/api/chat?host=${encodeURIComponent(hostUrl)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal,
        });
      }
    }

    if (!res.ok) {
      const errorText = await res.text();
      let parsedError = errorText;
      try {
        const json = JSON.parse(errorText);
        if (json.error) parsedError = json.error;
      } catch {}
      throw new Error(parsedError || `Ollama request failed with code ${res.status}`);
    }

    if (!res.body) {
      throw new Error("No response body received from Ollama stream");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const startTime = performance.now();
    let tokenChunkCount = 0;
    let finalMetrics: GenerationMetrics | undefined;
    const accumulatedToolCalls: { name: string; args: Record<string, any> }[] = [];
    const reasoningParser = new ReasoningStreamParser();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsed = JSON.parse(trimmed);

          const reasoningChunk = parsed.message?.thinking || parsed.message?.reasoning;
          if (reasoningChunk) {
            fullReasoning += reasoningChunk;
            if (onReasoning) onReasoning(reasoningChunk);
          }

          // Parse native Ollama tool calls
          const rawToolCalls = parsed.message?.tool_calls;
          if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
            for (const tc of rawToolCalls) {
              const fnName = tc.function?.name || tc.name;
              let fnArgs = tc.function?.arguments ?? tc.arguments ?? {};
              if (typeof fnArgs === "string") {
                try {
                  fnArgs = JSON.parse(fnArgs);
                } catch {}
              }
              if (fnName) {
                accumulatedToolCalls.push({ name: fnName, args: fnArgs });
                if (onToolCall) onToolCall({ name: fnName, args: fnArgs });
              }
            }
          }

          if (parsed.message?.content) {
            const contentChunk = parsed.message.content;
            reasoningParser.processChunk(contentChunk, {
              onToken: (t) => {
                fullResponse += t;
                tokenChunkCount++;
                const elapsedSec = (performance.now() - startTime) / 1000;
                const liveTps = elapsedSec > 0.1 ? Math.round((tokenChunkCount / elapsedSec) * 10) / 10 : 0;
                onToken(t, { tokenCount: tokenChunkCount, liveTps });
              },
              onReasoning: (r) => {
                fullReasoning += r;
                if (onReasoning) onReasoning(r);
              },
            });
          }

          if (parsed.done) {
            if (parsed.eval_count && parsed.eval_duration) {
              const evalTps = parsed.eval_count / (parsed.eval_duration / 1e9);
              const promptEvalTps =
                parsed.prompt_eval_count && parsed.prompt_eval_duration
                  ? parsed.prompt_eval_count / (parsed.prompt_eval_duration / 1e9)
                  : undefined;

              finalMetrics = {
                evalCount: parsed.eval_count,
                evalDuration: parsed.eval_duration,
                evalTps: Math.round(evalTps * 10) / 10,
                promptEvalCount: parsed.prompt_eval_count,
                promptEvalDuration: parsed.prompt_eval_duration,
                promptEvalTps: promptEvalTps ? Math.round(promptEvalTps * 10) / 10 : undefined,
                totalDuration: parsed.total_duration,
                totalSeconds: parsed.total_duration
                  ? Math.round((parsed.total_duration / 1e9) * 100) / 100
                  : undefined,
              };
            } else {
              const totalSec = (performance.now() - startTime) / 1000;
              finalMetrics = {
                evalCount: tokenChunkCount,
                evalTps: totalSec > 0 ? Math.round((tokenChunkCount / totalSec) * 10) / 10 : 0,
                totalSeconds: Math.round(totalSec * 100) / 100,
              };
            }
            break;
          }
        } catch {}
      }
    }

    reasoningParser.flush({
      onToken: (t) => {
        fullResponse += t;
        tokenChunkCount++;
        onToken(t);
      },
      onReasoning: (r) => {
        fullReasoning += r;
        if (onReasoning) onReasoning(r);
      },
    });

    if (onFinish) {
      onFinish(
        fullResponse,
        finalMetrics,
        fullReasoning || undefined,
        accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined
      );
    }

    return fullResponse;
  } catch (err: any) {
    if (err.name === "AbortError") {
      if (onFinish) onFinish(fullResponse, undefined, fullReasoning || undefined);
      return fullResponse;
    }

    if (onError) {
      onError(err);
    } else {
      console.error("Stream completion error:", err);
    }
    throw err;
  }
}

export function formatBytes(bytes?: number, decimals = 1): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export async function pullOllamaModel(
  modelName: string,
  hostUrl = "http://localhost:11434",
  onProgress?: (progress: ModelPullProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await apiFetch(`/api/ollama/api/pull?host=${encodeURIComponent(hostUrl)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: modelName.trim(), stream: true }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Failed to pull model: ${res.statusText}`);
  }

  if (!res.body) {
    throw new Error("No response body from Ollama pull stream");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.error) {
          throw new Error(parsed.error);
        }
        if (onProgress) {
          const total = parsed.total;
          const completed = parsed.completed;
          const percent = total && completed ? Math.round((completed / total) * 100) : undefined;
          onProgress({
            status: parsed.status || "pulling",
            digest: parsed.digest,
            total,
            completed,
            percent,
          });
        }
      } catch (err: any) {
        if (err.message && !err.message.includes("JSON")) {
          throw err;
        }
      }
    }
  }
}

export async function deleteOllamaModel(
  modelName: string,
  hostUrl = "http://localhost:11434"
): Promise<boolean> {
  const res = await apiFetch(`/api/ollama/api/delete?host=${encodeURIComponent(hostUrl)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: modelName.trim() }),
  });

  return res.ok;
}

/**
 * Predictive model pre-warming: pre-loads an Ollama model into VRAM
 * before the user finishes typing (e.g. on input focus or after typing starts).
 * Cuts cold-load latency on the first token.
 */
export async function prewarmModel(
  model: string,
  hostUrl = "http://localhost:11434",
  keepAlive = "10m"
): Promise<boolean> {
  if (!model || model.startsWith("gemini") || model.startsWith("gpt") || model.startsWith("claude")) {
    return false;
  }
  try {
    const res = await apiFetch(`/api/ollama/api/generate?host=${encodeURIComponent(hostUrl)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model.trim(), keep_alive: keepAlive }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// In-memory cache for model context capabilities fetched from /api/show
const MODEL_CONTEXT_CACHE = new Map<string, number>();

/**
 * Fetches context length from Ollama's /api/show or falls back to known defaults.
 */
export async function fetchModelContextLimit(
  model: string,
  hostUrl = "http://localhost:11434"
): Promise<number | null> {
  const cacheKey = `${hostUrl}:${model}`;
  if (MODEL_CONTEXT_CACHE.has(cacheKey)) {
    return MODEL_CONTEXT_CACHE.get(cacheKey)!;
  }

  try {
    const res = await apiFetch(`/api/ollama/api/show?host=${encodeURIComponent(hostUrl)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model.trim() }),
    });
    if (!res.ok) return null;
    const data = await res.json();

    // Check model_info for *.context_length
    if (data.model_info && typeof data.model_info === "object") {
      for (const [k, v] of Object.entries(data.model_info)) {
        if (k.endsWith(".context_length") && typeof v === "number" && v > 0) {
          MODEL_CONTEXT_CACHE.set(cacheKey, v);
          return v;
        }
      }
    }

    // Check parameters for num_ctx
    if (data.parameters && typeof data.parameters === "string") {
      const match = data.parameters.match(/num_ctx\s+(\d+)/);
      if (match && match[1]) {
        const parsed = parseInt(match[1], 10);
        if (!isNaN(parsed) && parsed > 0) {
          MODEL_CONTEXT_CACHE.set(cacheKey, parsed);
          return parsed;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Known architecture context window capabilities used as fallback when /api/show
 * is unreachable or does not specify context_length.
 */
export function getFamilyContextLimit(modelName: string): number {
  const lower = modelName.toLowerCase();
  if (lower.includes("llama-3") || lower.includes("llama3")) {
    return 131072;
  }
  if (lower.includes("qwen2.5") || lower.includes("qwen-2.5") || lower.includes("qwq")) {
    return 131072;
  }
  if (lower.includes("qwen2") || lower.includes("qwen-2")) {
    return 32768;
  }
  if (lower.includes("deepseek-r1") || lower.includes("deepseek-v3") || lower.includes("deepseek")) {
    return 65536;
  }
  if (lower.includes("phi-3") || lower.includes("phi-4") || lower.includes("phi3") || lower.includes("phi4")) {
    return 131072;
  }
  if (lower.includes("mistral") || lower.includes("mixtral") || lower.includes("codestral")) {
    return 32768;
  }
  if (lower.includes("gemma-2") || lower.includes("gemma2") || lower.includes("gemma")) {
    return 8192;
  }
  if (lower.includes("command-r")) {
    return 131072;
  }
  return 16384; // Safe baseline for modern local models
}

/**
 * Synchronously resolves effective context window from cache or family capability,
 * bounded by safe VRAM limit.
 */
export function resolveEffectiveNumCtxSync(
  model: string,
  explicitNumCtx?: number,
  hostUrl = "http://localhost:11434",
  maxSafeVramCtx = 32768
): number {
  if (explicitNumCtx && explicitNumCtx > 0) {
    return explicitNumCtx;
  }
  const cacheKey = `${hostUrl}:${model}`;
  const cached = MODEL_CONTEXT_CACHE.get(cacheKey);
  const detected = cached ?? getFamilyContextLimit(model);
  return Math.min(detected, maxSafeVramCtx);
}

/**
 * Asynchronously resolves effective context window by querying /api/show or fallback,
 * bounded by safe VRAM limit.
 */
export async function resolveEffectiveNumCtx(
  model: string,
  explicitNumCtx?: number,
  hostUrl = "http://localhost:11434",
  maxSafeVramCtx = 32768
): Promise<number> {
  if (explicitNumCtx && explicitNumCtx > 0) {
    return explicitNumCtx;
  }
  let detected = await fetchModelContextLimit(model, hostUrl);
  if (!detected) {
    detected = getFamilyContextLimit(model);
  }
  return Math.min(detected, maxSafeVramCtx);
}

/**
 * Power-of-two context window tiers (2K to 128K).
 * Bucketing prevents Ollama/llama.cpp from reallocating the KV cache
 * on every single turn (which would bust prefix caching), while dynamically
 * freeing gigabytes of VRAM on turns that do not need a full 16K/32K window.
 */
export const CONTEXT_WINDOW_BUCKETS = [2048, 4096, 8192, 16384, 32768, 65536, 131072] as const;

/**
 * Calculates the most memory-efficient power-of-two context window bucket for an inference turn.
 * @param estimatedInputTokens Total tokens in prompt (system prompt + history + RAG chunks + user turn)
 * @param maxCapacity Upper bound context limit (e.g. model maximum or user explicit setting)
 * @param expectedOutputTokens Reserved tokens for generation (default: 1024)
 * @param minBucket Minimum context size to prevent premature truncation (default: 2048)
 */
export function calculateContextBucket(
  estimatedInputTokens: number,
  maxCapacity = 32768,
  expectedOutputTokens = 1024,
  minBucket = 2048
): number {
  const needed = Math.max(minBucket, estimatedInputTokens + expectedOutputTokens);
  const ceiling = Math.max(minBucket, maxCapacity);

  for (const bucket of CONTEXT_WINDOW_BUCKETS) {
    if (bucket >= needed) {
      return Math.min(bucket, ceiling);
    }
  }
  return ceiling;
}

