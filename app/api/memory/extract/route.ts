import { NextRequest, NextResponse } from "next/server";
import { assertOllamaHostUrl, SsrfBlockedError } from "@/lib/ssrfGuard";
import {
  buildExtractionPrompt,
  parseExtractionResponse,
  mergeExtractedMemories,
} from "@/lib/memoryExtractor";
import type { MemoryItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auto-memory extraction endpoint.
 *
 * Runs after a chat turn completes, when MemoryConfig.generateFromChats is
 * on. Deliberately a separate request rather than part of the chat stream:
 * extraction must never delay the user's answer, and a failure here must
 * never surface as a broken reply. The caller fires this and ignores the
 * outcome apart from updating stored memories on success.
 *
 * All the decision logic (what counts as durable, credential filtering,
 * dedup, capacity) lives in lib/memoryExtractor.ts and is unit-tested
 * without a model. This route only handles the model call itself.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userMessage,
      assistantMessage,
      existingMemories = [],
      includeSensitive = false,
      ollamaUrl,
      model,
    } = body as {
      userMessage?: string;
      assistantMessage?: string;
      existingMemories?: MemoryItem[];
      includeSensitive?: boolean;
      ollamaUrl?: string;
      model?: string;
    };

    if (!userMessage || !assistantMessage) {
      return NextResponse.json(
        { success: false, error: "userMessage and assistantMessage are required." },
        { status: 400 }
      );
    }
    if (!model) {
      return NextResponse.json({ success: false, error: "model is required." }, { status: 400 });
    }

    const hostUrl = (ollamaUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
    try {
      await assertOllamaHostUrl(hostUrl);
    } catch (e) {
      if (e instanceof SsrfBlockedError) {
        return NextResponse.json({ success: false, error: e.message }, { status: 400 });
      }
      throw e;
    }

    const prompt = buildExtractionPrompt(userMessage, assistantMessage, existingMemories);

    // Bounded so a slow or stuck model can't leave extraction requests
    // piling up behind every chat turn.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    let raw = "";
    try {
      const res = await fetch(`${hostUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: "user", content: prompt }],
          // Low temperature: this is an extraction task, not a creative
          // one — sampling variety here just produces inconsistent
          // memories across turns.
          options: { temperature: 0.1 },
        }),
      });
      if (!res.ok) {
        return NextResponse.json(
          { success: false, error: `Ollama returned ${res.status}` },
          { status: 502 }
        );
      }
      const data = await res.json();
      raw = data?.message?.content || "";
    } catch (err: any) {
      const reason = err?.name === "AbortError" ? "extraction timed out" : err?.message || "request failed";
      return NextResponse.json({ success: false, error: reason }, { status: 504 });
    } finally {
      clearTimeout(timeout);
    }

    const extracted = parseExtractionResponse(raw);
    if (extracted.length === 0) {
      // The common, healthy outcome — most exchanges teach nothing durable.
      return NextResponse.json({ success: true, changed: false, items: existingMemories });
    }

    const merged = mergeExtractedMemories(existingMemories, extracted, { includeSensitive });
    const changed = merged.added.length > 0 || merged.updated.length > 0;

    return NextResponse.json({
      success: true,
      changed,
      items: merged.items,
      added: merged.added.length,
      updated: merged.updated.length,
      rejected: merged.rejected.map((r) => r.reason),
    });
  } catch (error: any) {
    console.error("Memory extraction error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
