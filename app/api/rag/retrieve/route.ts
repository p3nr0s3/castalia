import { NextRequest, NextResponse } from "next/server";
import { buildOptimizedKnowledgeContextAsync } from "@/lib/rag";
import type { ProjectFile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side RAG Knowledge Retrieval Endpoint.
 *
 * Offloads BM25 tokenization, chunk caching, AST symbol extraction, HyDE inference,
 * and cross-encoder reranking from the browser client's main JavaScript thread to the
 * high-performance Node.js runtime on the server.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      files,
      userQuery = "",
      tokenBudget,
      embeddingOptions,
      ragOptions,
    } = body as {
      files?: ProjectFile[];
      userQuery?: string;
      tokenBudget?: number;
      embeddingOptions?: Parameters<typeof buildOptimizedKnowledgeContextAsync>[3];
      ragOptions?: Parameters<typeof buildOptimizedKnowledgeContextAsync>[4];
    };

    if (!files || !Array.isArray(files)) {
      return NextResponse.json(
        { success: false, error: "'files' array is required." },
        { status: 400 }
      );
    }

    if (files.length === 0) {
      return NextResponse.json({
        success: true,
        result: {
          contextText: "",
          matchedChunksCount: 0,
          totalFilesCount: 0,
          matchedFiles: [],
          totalEstimatedTokens: 0,
          isChunked: false,
        },
      });
    }

    // Safety guard: Limit maximum files in single retrieval batch
    if (files.length > 500) {
      return NextResponse.json(
        { success: false, error: "Too many files provided (max 500)." },
        { status: 400 }
      );
    }

    const result = await buildOptimizedKnowledgeContextAsync(
      files,
      userQuery,
      tokenBudget,
      embeddingOptions,
      ragOptions
    );

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to execute server RAG retrieval",
      },
      { status: 500 }
    );
  }
}
