import { Message, OllamaModel, GenerationMetrics, ModelProvider, ApiKeysConfig, ModelPullProgress } from "./types";
import { CLOUD_MODEL_PRESETS } from "./constants";

export interface ChatStreamOptions {
  hostUrl?: string;
  provider?: ModelProvider;
  model: string;
  messages: Message[];
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  numCtx?: number;
  numPredict?: number;
  repeatPenalty?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  stop?: string[];
  seed?: number;
  apiKeys?: ApiKeysConfig;
  signal?: AbortSignal;
  onToken: (chunk: string, liveStats?: { tokenCount: number; liveTps: number }) => void;
  onReasoning?: (reasoningChunk: string) => void;
  onError?: (err: Error) => void;
  onFinish?: (fullText: string, metrics?: GenerationMetrics, fullReasoning?: string) => void;
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
    const res = await fetch(`/api/ollama/api/version?host=${encodeURIComponent(hostUrl)}`, {
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
    const res = await fetch(`/api/ollama/api/tags?host=${encodeURIComponent(hostUrl)}`, {
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

export async function streamChatCompletion({
  hostUrl = "http://localhost:11434",
  provider,
  model,
  messages,
  systemPrompt,
  temperature = 0.7,
  topP = 0.9,
  topK,
  numCtx,
  numPredict,
  repeatPenalty,
  presencePenalty,
  frequencyPenalty,
  stopSequences,
  stop,
  seed,
  apiKeys,
  signal,
  onToken,
  onReasoning,
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

      const res = await fetch("/api/cloud/chat", {
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
              const token = parsed.message.content;
              fullResponse += token;
              tokenChunkCount++;

              const elapsedSec = (performance.now() - startTime) / 1000;
              const liveTps = elapsedSec > 0.1 ? Math.round((tokenChunkCount / elapsedSec) * 10) / 10 : 0;
              onToken(token, { tokenCount: tokenChunkCount, liveTps });
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
    if (numCtx !== undefined) optionsPayload.num_ctx = numCtx;
    if (numPredict !== undefined) optionsPayload.num_predict = numPredict;
    if (repeatPenalty !== undefined) optionsPayload.repeat_penalty = repeatPenalty;
    if (presencePenalty !== undefined) optionsPayload.presence_penalty = presencePenalty;
    if (frequencyPenalty !== undefined) optionsPayload.frequency_penalty = frequencyPenalty;
    if (seed !== undefined) optionsPayload.seed = seed;
    const effectiveStop = stopSequences || stop;
    if (effectiveStop && effectiveStop.length > 0) optionsPayload.stop = effectiveStop;

    const payload = {
      model,
      messages: formattedMessages,
      stream: true,
      options: optionsPayload,
    };

    const res = await fetch(`/api/ollama/api/chat?host=${encodeURIComponent(hostUrl)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });

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

          if (parsed.message?.content) {
            const token = parsed.message.content;
            fullResponse += token;
            tokenChunkCount++;

            const elapsedSec = (performance.now() - startTime) / 1000;
            const liveTps = elapsedSec > 0.1 ? Math.round((tokenChunkCount / elapsedSec) * 10) / 10 : 0;
            onToken(token, { tokenCount: tokenChunkCount, liveTps });
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

    if (onFinish) {
      onFinish(fullResponse, finalMetrics, fullReasoning || undefined);
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
  const res = await fetch(`/api/ollama/api/pull?host=${encodeURIComponent(hostUrl)}`, {
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
  const res = await fetch(`/api/ollama/api/delete?host=${encodeURIComponent(hostUrl)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: modelName.trim() }),
  });

  return res.ok;
}

