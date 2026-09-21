// In-Memory BM25 Semantic Chunking & Relevance Ranking Engine
// Designed for local LLMs (e.g. Gemma 4, Llama 3) with 8K-16K context windows.
// Runs 100% in-memory with ZERO GPU VRAM usage and sub-millisecond retrieval.

import { ProjectFile, Message, RetrievedChunkInfo } from "./types";
import { embedTexts, cosineSimilarity } from "./embeddings";
import { countTokens } from "./tokenizer";

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
  retrievedChunks?: RetrievedChunkInfo[];
}

export interface DynamicTokenBudgets {
  totalContext: number;
  knowledgeBudget: number;
  historyBudget: number;
  reserveBudget: number;
}

/**
 * Derives context window budgets dynamically from the model's actual num_ctx.
 * Eliminates hardcoded magic numbers (e.g. 3500, 6000) so large-context models (128K)
 * utilize full capacity while small-context models never overflow.
 */
export function calculateDynamicTokenBudgets(numCtx = 16384): DynamicTokenBudgets {
  const safeCtx = Math.max(1024, numCtx);
  // Reserve ~25% for generation output and prompt overhead (min 512, max 16384)
  const reserveBudget = Math.min(16384, Math.max(512, Math.floor(safeCtx * 0.25)));
  const usableCtx = safeCtx - reserveBudget;

  // Knowledge retrieval gets ~35% of usable context
  const knowledgeBudget = Math.max(500, Math.floor(usableCtx * 0.35));

  // Chat history gets ~65% of usable context
  const historyBudget = Math.max(500, usableCtx - knowledgeBudget);

  return {
    totalContext: safeCtx,
    knowledgeBudget,
    historyBudget,
    reserveBudget,
  };
}

/**
 * Counts exact tokens for text using js-tiktoken (cl100k_base).
 * Retained under the estimateTokens name for backward compatibility across all call sites.
 */
export function estimateTokens(text: string): number {
  return countTokens(text);
}

export { countTokens };

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

// Chunk tokenization cache. rankChunksBM25 re-tokenizes every chunk's full
// text on every single call — for a project with hundreds of chunks that's
// the same tokenization work repeated on every chat turn even though the
// chunk text itself hasn't changed (chunkDocument is deterministic for a
// given file's content, so the same content always produces byte-identical
// chunk text). Keyed by a cheap hash of the chunk text rather than chunk.id:
// chunk objects are rebuilt fresh on every call (not persisted), so an
// id-keyed cache would need explicit invalidation when a file's content
// changes; a content-hash key makes a stale hit structurally impossible —
// edited content simply hashes to a different key and misses.
const TOKEN_CACHE_MAX_ENTRIES = 5000;

function hashText(text: string): string {
  // Simple djb2 hash — this only needs to be cheap and collision-unlikely
  // for cache-key purposes, not cryptographic.
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `${text.length}:${hash}`;
}

/** Per-chunk term-frequency map, cached alongside the token list.
 *
 * rankChunksBM25 needs two things per chunk: the token count (for length
 * normalization) and "how many times does token X appear here" (for tf),
 * plus a membership test for document-frequency counting. Computing the
 * tf map on every call was redundant work, and the DF pass used
 * `tokens.includes(token)` — an O(chunkLength) linear scan run once per
 * (query token × chunk), which is what actually dominated ranking cost on
 * larger knowledge bases. Caching a Map gives O(1) membership and
 * frequency lookup, and is keyed by the same content hash as the token
 * cache so it invalidates identically when a file's content changes. */
interface ChunkTokenData {
  tokens: string[];
  tf: Map<string, number>;
}

const chunkDataCache = new Map<string, ChunkTokenData>();

function tokenizeChunkCached(text: string): string[] {
  return getChunkTokenData(text).tokens;
}

function getChunkTokenData(text: string): ChunkTokenData {
  const key = hashText(text);
  const cached = chunkDataCache.get(key);
  if (cached) return cached;

  const tokens = tokenizeText(text);
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  const data: ChunkTokenData = { tokens, tf };

  if (chunkDataCache.size >= TOKEN_CACHE_MAX_ENTRIES) {
    // Simple insertion-order eviction (Map preserves insertion order) —
    // no need for real LRU here, this just bounds memory for very long
    // sessions touching many distinct projects/files.
    const oldestKey = chunkDataCache.keys().next().value;
    if (oldestKey !== undefined) chunkDataCache.delete(oldestKey);
  }
  chunkDataCache.set(key, data);
  return data;
}

/** Test/debug hook — clears the module-level chunk tokenization cache. */
export function clearTokenCache(): void {
  chunkDataCache.clear();
}

/**
 * Expands the current turn's query with recent prior user turns before it
 * goes into retrieval (BM25/embedding), without touching what's actually
 * sent to the model as conversation history. Retrieval on the raw current
 * message alone does badly on natural follow-ups — "gimana cara pakainya?"
 * or "what about the second one" carry no retrievable keywords by
 * themselves; the topic lives in the turns before it. Concatenating a
 * short, truncated window of recent user messages ahead of the current
 * query gives BM25/embeddings something to match against while still
 * keeping the current query's own terms present (and last, so exact
 * matches/filename-bonus scoring still favors what was actually just
 * asked).
 */
export function buildRetrievalQuery(
  currentQuery: string,
  recentMessages: Message[] | undefined,
  lookback = 2
): string {
  if (!recentMessages || recentMessages.length === 0) return currentQuery;

  const priorUserTurns = recentMessages
    .filter((m) => m.role === "user")
    // Excludes the current turn itself (assumed to be the last user
    // message already present in recentMessages) — only what came before it.
    .slice(-(lookback + 1), -1)
    .map((m) => (m.content || "").slice(0, 200));

  if (priorUserTurns.length === 0) return currentQuery;

  return [...priorUserTurns, currentQuery].join("\n");
}

const CODE_FILE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "go", "rs", "java", "c", "cpp", "h", "hpp", "cs",
  "php", "rb", "swift", "kt", "scala", "sql", "sh", "bash",
  "zsh", "vue", "svelte", "json", "yaml", "yml", "toml"
]);

export function isCodeFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext ? CODE_FILE_EXTENSIONS.has(ext) : false;
}

// Regex to identify top-level code constructs (functions, classes, interfaces, types)
const CODE_CONSTRUCT_START_REGEX =
  /^(\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\b|\s*(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>|\s*(?:export\s+)?(?:class|interface|type|enum|struct|impl|trait)\b|\s*(?:async\s+)?def\s+\w+|\s*class\s+\w+|\s*func\s+(?:\([^)]+\)\s+)?\w+|\s*(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?(?:fn|struct|enum|trait|impl|type)\b)/;

function chunkCodeDocument(
  file: ProjectFile,
  targetChunkChars = 1800,
  overlapChars = 200
): DocumentChunk[] {
  const content = file.textContent || "";
  const lines = content.split("\n");
  const chunks: string[] = [];
  let currentLines: string[] = [];
  let currentLength = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBoundary = CODE_CONSTRUCT_START_REGEX.test(line);

    // If we hit a code boundary and already have accumulated enough content, close the chunk
    if (isBoundary && currentLength >= Math.floor(targetChunkChars * 0.65)) {
      if (currentLines.length > 0) {
        chunks.push(currentLines.join("\n"));
        // Calculate overlap lines from the end of the previous chunk
        const overlapLines: string[] = [];
        let overlapCount = 0;
        for (let j = currentLines.length - 1; j >= 0; j--) {
          if (overlapCount + currentLines[j].length + 1 > overlapChars) break;
          overlapLines.unshift(currentLines[j]);
          overlapCount += currentLines[j].length + 1;
        }
        currentLines = overlapLines;
        currentLength = overlapCount;
      }
    }

    currentLines.push(line);
    currentLength += line.length + 1;

    // Hard ceiling if single block exceeds targetChunkChars
    if (currentLength >= targetChunkChars) {
      chunks.push(currentLines.join("\n"));
      const overlapLines: string[] = [];
      let overlapCount = 0;
      for (let j = currentLines.length - 1; j >= 0; j--) {
        if (overlapCount + currentLines[j].length + 1 > overlapChars) break;
        overlapLines.unshift(currentLines[j]);
        overlapCount += currentLines[j].length + 1;
      }
      currentLines = overlapLines;
      currentLength = overlapCount;
    }
  }

  if (currentLines.length > 0 && currentLines.some((l) => l.trim().length > 0)) {
    const lastChunk = currentLines.join("\n").trim();
    if (lastChunk.length > 0) {
      chunks.push(lastChunk);
    }
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
 * Splits document text into semantic chunks (~400-600 tokens each)
 * respecting markdown sections, code blocks, paragraphs, and lists.
 * For source code files, uses language-aware boundary chunking.
 */
export function chunkDocument(
  file: ProjectFile,
  targetChunkChars = 1800,
  overlapChars = 200
): DocumentChunk[] {
  const content = file.textContent || "";
  if (!content.trim()) return [];

  // Short documents (under targetChunkChars) don't need splitting
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

  // Language-aware chunking for code file types
  if (isCodeFile(file.name)) {
    const codeChunks = chunkCodeDocument(file, targetChunkChars, overlapChars);
    if (codeChunks.length > 0) return codeChunks;
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
  // Per-chunk token list + term-frequency map, both served from the
  // content-hash cache (see getChunkTokenData) so neither the tokenization
  // nor the tf counting is redone on every call.
  const chunkData = chunks.map((c) => getChunkTokenData(c.text));
  const totalLength = chunkData.reduce((sum, d) => sum + d.tokens.length, 0);
  const avgLen = totalLength / N || 1;

  // Document Frequency per query token. Uses the cached tf map's O(1)
  // membership test rather than a linear scan of each chunk's token array.
  const dfMap: Record<string, number> = {};
  for (const token of queryTokens) {
    let df = 0;
    for (const data of chunkData) {
      if (data.tf.has(token)) df++;
    }
    dfMap[token] = df;
  }

  // Pass 1: content-only BM25 score per chunk.
  const contentScores: number[] = chunks.map((_chunk, i) => {
    const { tokens: docTokens, tf: tfMap } = chunkData[i];
    const docLen = docTokens.length;
    let score = 0;

    for (const qToken of queryTokens) {
      const tf = tfMap.get(qToken) || 0;
      const df = dfMap[qToken] || 0;
      if (df === 0 || tf === 0) continue;

      // Robertson-Spärck Jones IDF formula
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      // BM25 term frequency saturation
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (docLen / avgLen));
      score += idf * (numerator / denominator);
    }
    return score;
  });

  // Pass 2: filename-match bonus, scaled to this query's own score range.
  //
  // This used to be a flat "+2.5 per matching query token" added to the
  // content score. The problem: BM25 scores aren't on a fixed scale —
  // they grow with query length and vary with corpus statistics. A
  // single-token query might top out around 2, so +2.5 per matched token
  // let the filename completely outrank actual content relevance; a
  // long query might score 15, where the same +2.5 barely registered.
  // The bonus meant something different for every query.
  //
  // Scaling it against the best content score for this query makes it a
  // consistent nudge: a chunk whose filename matches the whole query can
  // gain at most FILENAME_BONUS_RATIO of the top content score, so it can
  // outrank a near-tie but never a chunk that's genuinely far more
  // relevant. maxContentScore of 0 (nothing matched on content) leaves
  // the bonus at 0 too, which is correct — a filename match alone
  // shouldn't manufacture relevance out of nothing.
  const FILENAME_BONUS_RATIO = 0.35;
  const maxContentScore = contentScores.reduce((m, s) => (s > m ? s : m), 0);

  const scoredChunks: RankedChunk[] = chunks.map((chunk, i) => {
    let score = contentScores[i];

    if (maxContentScore > 0) {
      const lowerFileName = chunk.fileName.toLowerCase();
      let matched = 0;
      for (const qToken of queryTokens) {
        if (lowerFileName.includes(qToken)) matched++;
      }
      if (matched > 0) {
        const coverage = matched / queryTokens.length;
        score += coverage * FILENAME_BONUS_RATIO * maxContentScore;
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

  // No chunk matched any query keyword at all (as opposed to the
  // queryTokens.length === 0 case above, where the query itself carried
  // no signal). Previously this fell through to "return the first topK
  // chunks in original order" — meaning a query with zero relevance to
  // the project's files still got chunks stuffed into context, wasting
  // token budget and risking the model straining to connect unrelated
  // content to the question. Returning nothing here is the correct
  // signal: retrieval genuinely found nothing, so don't force it.
  return [];
}

function assembleContextFromRanked(
  files: ProjectFile[],
  ranked: RankedChunk[],
  tokenBudget: number
): OptimizedKnowledgeResult {
  // If retrieval genuinely found nothing relevant, don't emit a "here
  // are the relevant passages" header with nothing under it — that
  // still costs tokens and can read to the model like the search came
  // back empty-handed rather than like there was nothing to search for.
  // Match the shape of the "no files" early-return in the caller.
  if (ranked.length === 0) {
    return {
      contextText: "",
      matchedChunksCount: 0,
      totalFilesCount: files.length,
      matchedFiles: [],
      totalEstimatedTokens: 0,
      isChunked: false,
      retrievedChunks: [],
    };
  }

  // Per-file diversity cap: without this, a single long/keyword-dense file
  // can occupy every selected slot, starving other genuinely relevant
  // files that only contributed one or two good chunks each. First pass
  // takes the best-scoring chunks up to a per-file cap; anything skipped
  // for exceeding the cap is deferred, not dropped — a second pass fills
  // any budget still remaining from the deferred pool in score order, so
  // a project with only one relevant file still gets its full budget used
  // (the cap only matters when there's genuine competition between files).
  const MAX_CHUNKS_PER_FILE_FIRST_PASS = 3;
  let accumulatedTokens = 0;
  const selectedChunks: RankedChunk[] = [];
  const matchedFileSet = new Set<string>();
  const perFileCount = new Map<string, number>();
  const deferred: RankedChunk[] = [];

  for (const chunk of ranked) {
    const countForFile = perFileCount.get(chunk.fileId) || 0;
    if (countForFile >= MAX_CHUNKS_PER_FILE_FIRST_PASS) {
      deferred.push(chunk);
      continue;
    }
    if (accumulatedTokens + chunk.estimatedTokens <= tokenBudget || selectedChunks.length === 0) {
      selectedChunks.push(chunk);
      accumulatedTokens += chunk.estimatedTokens;
      matchedFileSet.add(chunk.fileName);
      perFileCount.set(chunk.fileId, countForFile + 1);
    } else {
      deferred.push(chunk);
    }
  }

  for (const chunk of deferred) {
    if (accumulatedTokens + chunk.estimatedTokens > tokenBudget) break;
    selectedChunks.push(chunk);
    accumulatedTokens += chunk.estimatedTokens;
    matchedFileSet.add(chunk.fileName);
  }

  // Keep final order score-descending (the two-pass selection above can
  // interleave first-pass and deferred-pass picks out of score order).
  selectedChunks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  let contextText = "\n\n=== RETRIEVED PROJECT KNOWLEDGE ===\n";
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
  const retrievedChunks: RetrievedChunkInfo[] = selectedChunks.map((c) => ({
    id: c.id,
    fileName: c.fileName,
    chunkIndex: c.chunkIndex,
    totalChunks: c.totalChunks,
    score: c.score !== undefined ? Math.round(c.score * 100) / 100 : undefined,
    textSnippet: c.text.slice(0, 300),
    estimatedTokens: c.estimatedTokens,
  }));

  return {
    contextText,
    matchedChunksCount: selectedChunks.length,
    totalFilesCount: files.length,
    matchedFiles: Array.from(matchedFileSet),
    totalEstimatedTokens: accumulatedTokens,
    isChunked: true,
    retrievedChunks,
  };
}

/**
 * Hybrid retrieval: blends the existing BM25 keyword score with cosine
 * similarity over embeddings from a local Ollama embedding model
 * (default: nomic-embed-text). Falls back to pure BM25 if embeddings are
 * unavailable for any reason (model not pulled, Ollama unreachable,
 * request timeout) — this never throws and never returns worse results
 * than the existing BM25-only path.
 */
export async function rankChunksHybrid(
  chunks: DocumentChunk[],
  query: string,
  topK: number,
  embeddingOptions: { ollamaUrl: string; embeddingModel?: string; semanticWeight?: number }
): Promise<RankedChunk[]> {
  // Full BM25 ranking (unsliced) so we have a score for every chunk to blend with.
  const bm25Ranked = rankChunksBM25(chunks, query, chunks.length);
  if (!query.trim() || chunks.length === 0) return bm25Ranked.slice(0, topK);

  const [queryEmbedding, ...chunkEmbeddings] = await embedTexts(
    [query, ...chunks.map((c) => c.text)],
    { ollamaUrl: embeddingOptions.ollamaUrl, model: embeddingOptions.embeddingModel }
  );

  if (!queryEmbedding) return bm25Ranked.slice(0, topK);

  const maxBm25 = Math.max(...bm25Ranked.map((c) => c.score), 1e-9);
  const bm25ScoreById = new Map(bm25Ranked.map((c) => [c.id, c.score / maxBm25]));
  const chunkEmbeddingById = new Map(chunks.map((c, i) => [c.id, chunkEmbeddings[i]]));

  // Default blend keeps the semantic signal leading (catches
  // paraphrases/synonyms BM25 misses) while keyword score still counts so
  // exact identifiers/filenames aren't drowned out by embedding similarity
  // alone. Clamped to [0, 1] so a bad config value (e.g. from a stale
  // project setting) can't produce a negative or >1 weight.
  const semanticWeight = Math.min(1, Math.max(0, embeddingOptions.semanticWeight ?? 0.55));
  const keywordWeight = 1 - semanticWeight;

  const hybridScored: RankedChunk[] = chunks.map((chunk) => {
    const emb = chunkEmbeddingById.get(chunk.id);
    const semanticScore = emb ? cosineSimilarity(queryEmbedding, emb) : 0;
    const keywordScore = bm25ScoreById.get(chunk.id) || 0;
    const score = semanticWeight * semanticScore + keywordWeight * keywordScore;
    return { ...chunk, score };
  });

  hybridScored.sort((a, b) => b.score - a.score);
  return hybridScored.slice(0, topK);
}

/**
 * Async, embeddings-aware counterpart to buildOptimizedKnowledgeContext.
 * Same behavior and return shape; the only difference is CASE 2 (large
 * document sets) uses rankChunksHybrid instead of rankChunksBM25 alone when
 * `embeddingOptions.enabled` is true.
 */
export async function buildOptimizedKnowledgeContextAsync(
  files: ProjectFile[],
  userQuery = "",
  tokenBudget?: number,
  embeddingOptions?: {
    ollamaUrl: string;
    embeddingModel?: string;
    enabled?: boolean;
    semanticWeight?: number;
  },
  ragOptions?: { chunkSizeChars?: number; chunkOverlapChars?: number; topK?: number }
): Promise<OptimizedKnowledgeResult> {
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

  const effectiveBudget = tokenBudget ?? calculateDynamicTokenBudgets().knowledgeBudget;
  const totalTokens = files.reduce((acc, f) => acc + estimateTokens(f.textContent || ""), 0);

  if (totalTokens <= effectiveBudget) {
    return buildOptimizedKnowledgeContext(files, userQuery, effectiveBudget);
  }

  const chunkSizeChars = ragOptions?.chunkSizeChars ?? 1800;
  const chunkOverlapChars = ragOptions?.chunkOverlapChars ?? 200;
  const topK = ragOptions?.topK ?? 8;

  const allChunks: DocumentChunk[] = [];
  for (const file of files) {
    allChunks.push(...chunkDocument(file, chunkSizeChars, chunkOverlapChars));
  }

  const ranked =
    embeddingOptions?.enabled && embeddingOptions.ollamaUrl
      ? await rankChunksHybrid(allChunks, userQuery, topK, embeddingOptions)
      : rankChunksBM25(allChunks, userQuery, topK);

  return assembleContextFromRanked(files, ranked, effectiveBudget);
}

/**
 * Builds an optimized, token-budgeted knowledge base context for local models.
 * Automatically switches between full inclusion (for small files) and smart BM25 retrieval
 * (for larger files) dynamically sized to model context capability.
 */
export function buildOptimizedKnowledgeContext(
  files: ProjectFile[],
  userQuery = "",
  tokenBudget?: number
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

  const effectiveBudget = tokenBudget ?? calculateDynamicTokenBudgets().knowledgeBudget;

  // Calculate total tokens across all loaded files
  const totalTokens = files.reduce((acc, f) => acc + estimateTokens(f.textContent || ""), 0);

  // CASE 1: All files together are already small enough to fit within budget.
  // Inject with 100% full fidelity without chunking.
  if (totalTokens <= effectiveBudget) {
    let contextText = "\n\n=== PROJECT KNOWLEDGE BASE ===\n";
    contextText += "The following persistent knowledge files belong to this project. Refer to them whenever relevant:\n";
    for (const file of files) {
      contextText += `\n[Project Document: ${file.name}]\n\`\`\`\n${file.textContent}\n\`\`\`\n`;
    }
    contextText += "=== END OF PROJECT KNOWLEDGE BASE ===\n\n";

    const retrievedChunks: RetrievedChunkInfo[] = files.map((f, i) => ({
      id: `file_${f.id || i}`,
      fileName: f.name,
      chunkIndex: 0,
      totalChunks: 1,
      textSnippet: (f.textContent || "").slice(0, 300),
      estimatedTokens: estimateTokens(f.textContent || ""),
    }));

    return {
      contextText,
      matchedChunksCount: files.length,
      totalFilesCount: files.length,
      matchedFiles: files.map((f) => f.name),
      totalEstimatedTokens: totalTokens,
      isChunked: false,
      retrievedChunks,
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

  return assembleContextFromRanked(files, ranked, effectiveBudget);
}

/**
 * Extracts a concise recap of omitted messages for context shift notices.
 */
export function extractQuickSummary(messages: Message[]): string {
  if (!messages || messages.length === 0) return "";
  const points: string[] = [];
  for (const m of messages) {
    const rolePrefix = m.role === "user" ? "User asked" : "Discussed";
    const firstLine = (m.content || "").trim().split("\n")[0];
    const snippet = firstLine.slice(0, 140).trim();
    if (snippet) {
      points.push(`- ${rolePrefix}: "${snippet}${snippet.length >= 140 ? "..." : ""}"`);
    }
  }
  return points.slice(0, 5).join("\n");
}

/**
 * Trims conversation history to strictly fit inside the allocated chat history budget.
 * Supports Smart Context Shift (Anchor + Tail window):
 * - If smartShift is enabled (default true) and messages exceed budget:
 *   - Preserves Turn 0 (Anchor: initial user message + first assistant response) so the model never forgets the original objective/instructions.
 *   - Fills remaining budget with the most recent messages (Tail Window).
 *   - Compresses omitted middle turns with a summary recap instead of dropping information silently.
 */
export function trimChatHistoryForBudget(
  messages: Message[],
  maxHistoryTokens?: number,
  options?: { smartShift?: boolean; condensedSummary?: string }
): Message[] {
  if (!messages || messages.length <= 1) return messages;

  const smartShift = options?.smartShift ?? true;
  const effectiveMaxTokens = maxHistoryTokens ?? calculateDynamicTokenBudgets().historyBudget;

  // Calculate total tokens of all messages
  let totalTokens = 0;
  for (const msg of messages) {
    totalTokens += estimateTokens(msg.content) + 50;
  }

  // If already within budget, return as is
  if (totalTokens <= effectiveMaxTokens) {
    return messages;
  }

  // If smartShift is disabled or messages length is small, use legacy newest-to-oldest sliding window
  if (!smartShift || messages.length <= 3) {
    let accumulated = 0;
    const kept: Message[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgTokens = estimateTokens(msg.content) + 50;
      if (accumulated + msgTokens <= effectiveMaxTokens || kept.length === 0) {
        kept.unshift(msg);
        accumulated += msgTokens;
      } else {
        break;
      }
    }
    return kept;
  }

  // Smart Context Shift: Anchor (Turn 0) + Tail Window
  // Reserve up to 25% of history budget for Anchor turn (first user + assistant)
  const anchorBudget = Math.floor(effectiveMaxTokens * 0.25);
  const anchorMessages: Message[] = [];
  let anchorTokens = 0;

  // Check first message (user prompt)
  const firstMsg = messages[0];
  const firstMsgTokens = estimateTokens(firstMsg.content) + 50;
  if (firstMsgTokens <= anchorBudget) {
    anchorMessages.push(firstMsg);
    anchorTokens += firstMsgTokens;

    // Check if second message (first assistant reply) also fits inside anchor budget
    if (messages.length > 1 && messages[1].role === "assistant") {
      const secondMsg = messages[1];
      const secondMsgTokens = estimateTokens(secondMsg.content) + 50;
      if (anchorTokens + secondMsgTokens <= anchorBudget) {
        anchorMessages.push(secondMsg);
        anchorTokens += secondMsgTokens;
      }
    }
  }

  // The remaining budget is for the Tail Window (recent messages)
  const tailBudget = effectiveMaxTokens - anchorTokens;
  let tailTokens = 0;
  const tailMessages: Message[] = [];

  const anchorCount = anchorMessages.length;
  // Pick from newest backwards, stopping before anchorCount
  for (let i = messages.length - 1; i >= anchorCount; i--) {
    const msg = messages[i];
    const msgTokens = estimateTokens(msg.content) + 50;
    if (tailTokens + msgTokens <= tailBudget || tailMessages.length === 0) {
      tailMessages.unshift(msg);
      tailTokens += msgTokens;
    } else {
      break;
    }
  }

  // Check if any middle messages were skipped
  const firstTailIndex = messages.indexOf(tailMessages[0]);
  const omittedCount = firstTailIndex > anchorCount ? firstTailIndex - anchorCount : 0;

  if (omittedCount > 0) {
    const omittedTurns = messages.slice(anchorCount, firstTailIndex);
    const summary = options?.condensedSummary || extractQuickSummary(omittedTurns);
    const summarySection = summary ? `\nSummary of condensed dialogue:\n${summary}\n` : " ";

    const shiftNoticeMessage: Message = {
      id: "context_shift_notice",
      role: "system",
      content: `[Context Shift: ${omittedCount} earlier dialogue turns were condensed to fit context window.${summarySection}Retaining initial objective anchor above and recent context below.]`,
      timestamp: Date.now(),
    };
    return [...anchorMessages, shiftNoticeMessage, ...tailMessages];
  }

  return [...anchorMessages, ...tailMessages];
}

/**
 * Wraps user input with ephemeral dynamic context (RAG chunks, web search, or connector text)
 * to be injected into the user turn rather than polluting the static system prompt.
 */
export function formatUserEphemeralContext(
  userQuery: string,
  dynamicContext?: string
): string {
  if (!dynamicContext || !dynamicContext.trim()) {
    return userQuery;
  }

  return `${dynamicContext.trim()}\n\n---\n[User Query]:\n${userQuery}`;
}
