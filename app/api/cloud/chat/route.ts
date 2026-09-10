import { NextRequest, NextResponse } from "next/server";
import { Message } from "@/lib/types";
import { redactSensitiveContent } from "@/lib/redaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

// Helper to format messages with attachments
function formatMessagesText(messages: Message[]): { role: string; content: string }[] {
  const formatted: { role: string; content: string }[] = [];

  for (const msg of messages) {
    let msgContent = msg.content || "";
    if (msg.attachments && msg.attachments.length > 0) {
      const docAttachments = msg.attachments.filter((a) => a.type === "document");
      if (docAttachments.length > 0) {
        let docSection = "\n\n--- Attached Documents ---\n";
        for (const doc of docAttachments) {
          docSection += `\n[File: ${doc.name}]\n\`\`\`\n${doc.textContent || ""}\n\`\`\`\n`;
        }
        docSection += "--- End of Documents ---\n\n";
        msgContent = `${docSection}${msgContent}`;
      }
    }
    formatted.push({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msgContent,
    });
  }

  return formatted;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      provider,
      model,
      messages,
      systemPrompt,
      temperature = 0.7,
      topP = 0.9,
      apiKey,
      customBaseUrl,
    } = body;

    if (!provider || !model) {
      return NextResponse.json(
        { error: "Provider and Model are required." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!apiKey && provider !== "ollama") {
      return NextResponse.json(
        {
          error: `API key for ${provider.toUpperCase()} is required. Please add your API key in Settings -> Cloud AI Providers.`,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const formattedMessages = formatMessagesText(messages || []).map((m) => ({
      ...m,
      content: redactSensitiveContent(m.content).text,
    }));

    const redactedSystemPrompt =
      systemPrompt && systemPrompt.trim()
        ? redactSensitiveContent(systemPrompt).text
        : systemPrompt;

    // -------------------------------------------------------------
    // 1. GOOGLE GEMINI API (Stream SSE)
    // -------------------------------------------------------------
    if (provider === "gemini") {
      const geminiModel = model.replace(/^models\//, "");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${apiKey}`;

      const contents = formattedMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const geminiPayload: any = {
        contents,
        generationConfig: {
          temperature,
          topP,
        },
      };

      if (redactedSystemPrompt && redactedSystemPrompt.trim()) {
        geminiPayload.systemInstruction = {
          parts: [{ text: redactedSystemPrompt.trim() }],
        };
      }

      const geminiRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiPayload),
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        let errMsg = errText;
        try {
          const parsed = JSON.parse(errText);
          if (parsed.error?.message) errMsg = parsed.error.message;
        } catch {}
        return NextResponse.json(
          { error: `Google Gemini Error (${geminiRes.status}): ${errMsg}` },
          { status: geminiRes.status, headers: CORS_HEADERS }
        );
      }

      const stream = new ReadableStream({
        async start(controller) {
          const reader = geminiRes.body?.getReader();
          if (!reader) {
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data:")) continue;
                const jsonStr = trimmed.slice(5).trim();
                if (!jsonStr) continue;

                try {
                  const parsed = JSON.parse(jsonStr);
                  const candidate = parsed.candidates?.[0];
                  if (candidate?.content?.parts) {
                    for (const part of candidate.content.parts) {
                      if (part.thought) {
                        const chunk = JSON.stringify({
                          message: { reasoning: part.text || "" },
                          done: false,
                        }) + "\n";
                        controller.enqueue(new TextEncoder().encode(chunk));
                      } else if (part.text) {
                        const chunk = JSON.stringify({
                          message: { content: part.text },
                          done: false,
                        }) + "\n";
                        controller.enqueue(new TextEncoder().encode(chunk));
                      }
                    }
                  }

                  if (candidate?.finishReason) {
                    const doneChunk = JSON.stringify({
                      done: true,
                      eval_count: parsed.usageMetadata?.candidatesTokenCount,
                      prompt_eval_count: parsed.usageMetadata?.promptTokenCount,
                    }) + "\n";
                    controller.enqueue(new TextEncoder().encode(doneChunk));
                  }
                } catch {}
              }
            }
          } catch (streamErr) {
            controller.error(streamErr);
          } finally {
            controller.close();
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          Connection: "keep-alive",
        },
      });
    }

    // -------------------------------------------------------------
    // 2. ANTHROPIC CLAUDE API (Stream SSE)
    // -------------------------------------------------------------
    if (provider === "anthropic") {
      const url = "https://api.anthropic.com/v1/messages";

      const claudePayload: any = {
        model,
        messages: formattedMessages,
        max_tokens: 4096,
        temperature,
        top_p: topP,
        stream: true,
      };

      if (redactedSystemPrompt && redactedSystemPrompt.trim()) {
        claudePayload.system = redactedSystemPrompt.trim();
      }

      const claudeRes = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(claudePayload),
      });

      if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        let errMsg = errText;
        try {
          const parsed = JSON.parse(errText);
          if (parsed.error?.message) errMsg = parsed.error.message;
        } catch {}
        return NextResponse.json(
          { error: `Anthropic Claude Error (${claudeRes.status}): ${errMsg}` },
          { status: claudeRes.status, headers: CORS_HEADERS }
        );
      }

      const stream = new ReadableStream({
        async start(controller) {
          const reader = claudeRes.body?.getReader();
          if (!reader) {
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data:")) continue;
                const jsonStr = trimmed.slice(5).trim();
                if (!jsonStr || jsonStr === "[DONE]") continue;

                try {
                  const parsed = JSON.parse(jsonStr);
                  if (parsed.type === "content_block_delta") {
                    if (parsed.delta?.thinking) {
                      const chunk = JSON.stringify({
                        message: { reasoning: parsed.delta.thinking },
                        done: false,
                      }) + "\n";
                      controller.enqueue(new TextEncoder().encode(chunk));
                    } else if (parsed.delta?.text) {
                      const chunk = JSON.stringify({
                        message: { content: parsed.delta.text },
                        done: false,
                      }) + "\n";
                      controller.enqueue(new TextEncoder().encode(chunk));
                    }
                  } else if (parsed.type === "message_stop") {
                    const doneChunk = JSON.stringify({ done: true }) + "\n";
                    controller.enqueue(new TextEncoder().encode(doneChunk));
                  }
                } catch {}
              }
            }
          } catch (streamErr) {
            controller.error(streamErr);
          } finally {
            controller.close();
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          Connection: "keep-alive",
        },
      });
    }

    // -------------------------------------------------------------
    // 3. OPENAI / GROQ / DEEPSEEK / OPENROUTER / CUSTOM ENDPOINTS
    // -------------------------------------------------------------
    let endpointUrl = "https://api.openai.com/v1/chat/completions";
    const customHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };

    if (provider === "groq") {
      endpointUrl = "https://api.groq.com/openai/v1/chat/completions";
    } else if (provider === "deepseek") {
      endpointUrl = "https://api.deepseek.com/chat/completions";
    } else if (provider === "openrouter") {
      endpointUrl = "https://openrouter.ai/api/v1/chat/completions";
      customHeaders["HTTP-Referer"] = "http://localhost:3000";
      customHeaders["X-Title"] = "Ollama Local AI Hub";
    } else if (provider === "custom" && customBaseUrl) {
      endpointUrl = `${customBaseUrl.replace(/\/+$/, "")}/chat/completions`;
    }

    const messagesPayload: any[] = [];
    if (redactedSystemPrompt && redactedSystemPrompt.trim()) {
      messagesPayload.push({ role: "system", content: redactedSystemPrompt.trim() });
    }
    messagesPayload.push(...formattedMessages);

    const openaiPayload: any = {
      model,
      messages: messagesPayload,
      stream: true,
      temperature,
      top_p: topP,
    };

    const openAiRes = await fetch(endpointUrl, {
      method: "POST",
      headers: customHeaders,
      body: JSON.stringify(openaiPayload),
    });

    if (!openAiRes.ok) {
      const errText = await openAiRes.text();
      let errMsg = errText;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) errMsg = parsed.error.message;
      } catch {}
      return NextResponse.json(
        { error: `${provider.toUpperCase()} Error (${openAiRes.status}): ${errMsg}` },
        { status: openAiRes.status, headers: CORS_HEADERS }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = openAiRes.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data:")) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (!jsonStr) continue;
              if (jsonStr === "[DONE]") {
                const doneChunk = JSON.stringify({ done: true }) + "\n";
                controller.enqueue(new TextEncoder().encode(doneChunk));
                continue;
              }

              try {
                const parsed = JSON.parse(jsonStr);
                const delta = parsed.choices?.[0]?.delta;
                const token = delta?.content || "";
                const reasoningToken = delta?.reasoning_content || "";

                if (token || reasoningToken) {
                  const chunk = JSON.stringify({
                    message: {
                      content: token,
                      reasoning: reasoningToken,
                    },
                    done: false,
                  }) + "\n";
                  controller.enqueue(new TextEncoder().encode(chunk));
                }

                if (parsed.choices?.[0]?.finish_reason) {
                  const doneChunk = JSON.stringify({
                    done: true,
                    eval_count: parsed.usage?.completion_tokens,
                    prompt_eval_count: parsed.usage?.prompt_tokens,
                  }) + "\n";
                  controller.enqueue(new TextEncoder().encode(doneChunk));
                }
              } catch {}
            }
          }
        } catch (streamErr) {
          controller.error(streamErr);
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Cloud Model Proxy exception: ${err.message}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
