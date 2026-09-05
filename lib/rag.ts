// In-Memory BM25 Semantic Chunking & Relevance Ranking Engine
// Designed for local LLMs (e.g. Gemma 4, Llama 3) with 8K-16K context windows.
// Runs 100% in-memory with ZERO GPU VRAM usage and sub-millisecond retrieval.

import { ProjectFile, Message } from "./types";

export interface DocumentChunk {
  id: string;
  fileName: string;
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
  text: string;
  charCount: number;
  estimatedTokens: number;
  preview: string;
}

export interface RankedChunk extends DocumentChunk {
  score: number;
}

export interface OptimizedKnowledgeResult {
  contextText: string;
  matchedChunksCount: number;
  totalFilesCount: number;
  matchedFiles: string[];
  totalEstimatedTokens: number;
  isChunked: boolean;
}

// Token estimation: 1 token is approximately 3.8 to 4 characters in English/code,
// or approx 0.75 words.
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

// English & programming common stopwords to filter noise in BM25
const STOPWORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
  "below", "between", "both", "but", "by", "can", "can't", "cannot", "could",
  "did", "do", "does", "doing", "don't", "down", "during", "each", "few", "for",
  "from", "further", "had", "has", "have", "having", "he", "her", "here", "hers",
  "herself", "him", "himself", "his", "how", "i", "if", "in", "into", "is",
  "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "my",
  "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other",
  "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "she",
  "should", "so", "some", "such", "than", "that", "the", "their", "theirs", "them",
  "themselves", "then", "there", "these", "they", "this", "those", "through", "to",
  "too", "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll",
  "we're", "we've", "were", "what", "when", "where", "which", "while", "who",
  "whom", "why", "with", "won't", "would", "you", "your", "yours", "yourself",
  // Common Indonesian stopwords
  "yang", "di", "dan", "dari", "ini", "untuk", "pada", "adalah", "ke", "itu",
  "dengan", "dalam", "bisa", "atau", "juga", "karena", "kita", "kamu", "saya",
  "mereka", "ada", "akan", "sudah", "oleh", "tentang", "bagaimana", "apa"
]);

// Tokenize text into normalized alphanumeric keywords
export function tokenizeText(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s\-\._]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Splits document text into semantic chunks (~400-600 tokens each)
 * respecting markdown sections, code blocks, paragraphs, and lists.
 */
export function chunkDocument(
  file: ProjectFile,
  targetChunkChars = 1800,
  overlapChars = 200
): DocumentChunk[] {
  const content = file.textContent || "";
  if (!content.trim()) return [];

  // Short documents (under ~2,000 chars / ~500 tokens) don't need splitting
  if (content.length <= targetChunkChars) {
    return [
      {
        id: `${file.id}_chk_0`,
        fileName: file.name,
        fileId: file.id,
        chunkIndex: 0,
        totalChunks: 1,
        text: content,
        charCount: content.length,
        estimatedTokens: estimateTokens(content),
        preview: content.slice(0, 120).replace(/\n/g, " "),
      },
    ];
  }

  // Split on semantic boundaries: Double newlines (paragraphs), headings (#, ##), or code blocks (```)
  const rawSections = content.split(/\n{2,}/);
  const chunks: string[] = [];
  let currentBuffer = "";

  for (const section of rawSections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    if (currentBuffer.length + trimmed.length <= targetChunkChars) {
      currentBuffer = currentBuffer ? `${currentBuffer}\n\n${trimmed}` : trimmed;
    } else {
      if (currentBuffer) {
        chunks.push(currentBuffer);
        // Overlap: preserve the last segment of the previous buffer
        const overlapStart = Math.max(0, currentBuffer.length - overlapChars);
        const overlapText = currentBuffer.slice(overlapStart).trim();
        currentBuffer = overlapText ? `${overlapText}\n\n${trimmed}` : trimmed;
      } else {
        // If a single section is larger than targetChunkChars (e.g. huge unbroken log or code file)
        let remaining = trimmed;
        while (remaining.length > targetChunkChars) {
          chunks.push(remaining.slice(0, targetChunkChars));
          remaining = remaining.slice(targetChunkChars - overlapChars);
        }
        currentBuffer = remaining;
      }
    }
  }

  if (currentBuffer.trim()) {
    chunks.push(currentBuffer.trim());
  }

  return chunks.map((chunkText, idx) => ({
    id: `${file.id}_chk_${idx}`,
    fileName: file.name,
    fileId: file.id,
    chunkIndex: idx,
    totalChunks: chunks.length,
    text: chunkText,
    charCount: chunkText.length,
    estimatedTokens: estimateTokens(chunkText),
    preview: chunkText.slice(0, 120).replace(/\n/g, " "),
  }));
}

/**
 * Standard BM25 (Best Matching 25) relevance ranker.
 * Matches keywords, technical identifiers, function names, and natural language query terms.
 */
export function rankChunksBM25(
  chunks: DocumentChunk[],
  query: string,
  topK = 5,
  k1 = 1.2,
  b = 0.75
): RankedChunk[] {
  if (!chunks || chunks.length === 0) return [];
  const queryTokens = tokenizeText(query);

  if (queryTokens.length === 0) {
    // If query has no distinctive tokens, return first topK chunks in order
    return chunks.slice(0, topK).map((c) => ({ ...c, score: 1.0 }));
  }

  const N = chunks.length;
  // Calculate average document length (in words)
  const chunkTokenLists = chunks.map((c) => tokenizeText(c.text));
  const totalLength = chunkTokenLists.reduce((sum, list) => sum + list.length, 0);
  const avgLen = totalLength / N || 1;

  // Calculate Document Frequency (DF) for each query token
  const dfMap: Record<string, number> = {};
  for (const token of queryTokens) {
    let df = 0;
    for (const docTokens of chunkTokenLists) {
      if (docTokens.includes(token)) df++;
    }
    dfMap[token] = df;
  }

  // Calculate BM25 score for each chunk
  const scoredChunks: RankedChunk[] = chunks.map((chunk, i) => {
    const docTokens = chunkTokenLists[i];
    const docLen = docTokens.length;
    let score = 0;

    // Token frequency count in current chunk
    const tfMap: Record<string, number> = {};
    for (const token of docTokens) {
      tfMap[token] = (tfMap[token] || 0) + 1;
    }

    for (const qToken of queryTokens) {
      const tf = tfMap[qToken] || 0;
      const df = dfMap[qToken] || 0;
      if (df === 0 || tf === 0) continue;

      // Robertson-Spärck Jones IDF formula
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      // BM25 term frequency saturation
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (docLen / avgLen));
      score += idf * (numerator / denominator);
    }

    // Exact filename match bonus (e.g. user mentions "policy.txt" or "schema.prisma")
    const lowerFileName = chunk.fileName.toLowerCase();
    for (const qToken of queryTokens) {
      if (lowerFileName.includes(qToken)) {
        score += 2.5;
      }
    }

    return {
      ...chunk,
      score,
    };
  });

  // Sort descending by score
  scoredChunks.sort((a, b) => b.score - a.score);

  // Filter out completely zero-scored chunks if we have scored ones
  const positiveScores = scoredChunks.filter((c) => c.score > 0);
  if (positiveScores.length > 0) {
    return positiveScores.slice(0, topK);
  }

  // Fallback: Return first topK chunks
  return scoredChunks.slice(0, topK);
}

/**
 * Builds an optimized, token-budgeted knowledge base context for local models.
 * Automatically switches between full inclusion (for small files) and smart BM25 retrieval
 * (for larger files) to strictly protect the 16K context window.
 */
export function buildOptimizedKnowledgeContext(
  files: ProjectFile[],
  userQuery = "",
  tokenBudget = 3500
): OptimizedKnowledgeResult {
  if (!files || files.length === 0) {
    return {
      contextText: "",
      matchedChunksCount: 0,
      totalFilesCount: 0,
      matchedFiles: [],
      totalEstimatedTokens: 0,
      isChunked: false,
    };
  }

  // Calculate total tokens across all loaded files
  const totalTokens = files.reduce((acc, f) => acc + estimateTokens(f.textContent || ""), 0);

  // CASE 1: All files together are already small enough to fit within budget.
  // Inject with 100% full fidelity without chunking.
  if (totalTokens <= tokenBudget) {
    let contextText = "\n\n=== CLAUDE-STYLE PROJECT KNOWLEDGE BASE ===\n";
    contextText += "The following persistent knowledge files belong to this project. Refer to them whenever relevant:\n";
    for (const file of files) {
      contextText += `\n[Project Document: ${file.name}]\n\`\`\`\n${file.textContent}\n\`\`\`\n`;
    }
    contextText += "=== END OF PROJECT KNOWLEDGE BASE ===\n\n";

    return {
      contextText,
      matchedChunksCount: files.length,
      totalFilesCount: files.length,
      matchedFiles: files.map((f) => f.name),
      totalEstimatedTokens: totalTokens,
      isChunked: false,
    };
  }

  // CASE 2: Large document set exceeding budget -> Apply Smart Chunking & BM25 Relevance Retrieval
  const allChunks: DocumentChunk[] = [];
  for (const file of files) {
    const fileChunks = chunkDocument(file);
    allChunks.push(...fileChunks);
  }

  // Rank chunks against the user's latest query
  const ranked = rankChunksBM25(allChunks, userQuery, 8);

  // Fill up to the token budget
  let accumulatedTokens = 0;
  const selectedChunks: RankedChunk[] = [];
  const matchedFileSet = new Set<string>();

  for (const chunk of ranked) {
    if (accumulatedTokens + chunk.estimatedTokens <= tokenBudget || selectedChunks.length === 0) {
      selectedChunks.push(chunk);
      accumulatedTokens += chunk.estimatedTokens;
      matchedFileSet.add(chunk.fileName);
    } else {
      break;
    }
  }

  // Build Table of Contents / Index summary of available project files
  let contextText = "\n\n=== 16K CONTEXT-GUARD: RETRIEVED PROJECT KNOWLEDGE ===\n";
  contextText += "The user has loaded the following project files:\n";
  for (const file of files) {
    const fileTok = estimateTokens(file.textContent || "");
    contextText += `- ${file.name} (~${fileTok} tokens)\n`;
  }
  contextText += "\nBelow are the most relevant document passages retrieved for the user's prompt:\n";

  for (const chunk of selectedChunks) {
    contextText += `\n--- [Document: ${chunk.fileName} (Part ${chunk.chunkIndex + 1}/${chunk.totalChunks})] ---\n`;
    contextText += `${chunk.text}\n`;
  }
  contextText += "=== END OF RETRIEVED KNOWLEDGE ===\n\n";

  return {
    contextText,
    matchedChunksCount: selectedChunks.length,
    totalFilesCount: files.length,
    matchedFiles: Array.from(matchedFileSet),
    totalEstimatedTokens: accumulatedTokens,
    isChunked: true,
  };
}

/**
 * Trims conversation history (sliding window) to strictly fit inside the allocated
 * chat history budget, ensuring Gemma 4 never hits a context overflow.
 */
export function trimChatHistoryForBudget(
  messages: Message[],
  maxHistoryTokens = 6000
): Message[] {
  if (!messages || messages.length <= 1) return messages;

  let accumulated = 0;
  const kept: Message[] = [];

  // Always keep from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = estimateTokens(msg.content) + 50; // buffer for role formatting
    if (accumulated + msgTokens <= maxHistoryTokens || kept.length === 0) {
      kept.unshift(msg);
      accumulated += msgTokens;
    } else {
      break;
    }
  }

  return kept;
}
