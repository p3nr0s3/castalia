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
  symbolsDefined?: string[];
  symbolsReferenced?: string[];
  stitchedPartRange?: [number, number];
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

// File-level DocumentChunk cache: avoids re-chunking files across consecutive turns
// when file textContent and chunking options remain unchanged.
const fileChunkCache = new Map<string, DocumentChunk[]>();
const FILE_CHUNK_CACHE_MAX_ENTRIES = 2000;

/**
 * Retrieves pre-computed document chunks for a project file from memory cache,
 * or computes and caches them if missing or if file content has changed.
 */
export function getCachedFileChunks(
  file: ProjectFile,
  targetChunkChars = 1800,
  overlapChars = 200
): DocumentChunk[] {
  const content = file.textContent || "";
  const key = `${file.id || file.name}:${hashText(content)}:${targetChunkChars}:${overlapChars}`;
  const cached = fileChunkCache.get(key);
  if (cached) {
    return [...cached];
  }

  const chunks = chunkDocument(file, targetChunkChars, overlapChars);
  if (fileChunkCache.size >= FILE_CHUNK_CACHE_MAX_ENTRIES) {
    const oldestKey = fileChunkCache.keys().next().value;
    if (oldestKey !== undefined) fileChunkCache.delete(oldestKey);
  }
  fileChunkCache.set(key, chunks);
  return [...chunks];
}

/** Test/debug hook — clears the module-level DocumentChunk cache. */
export function clearChunkCache(): void {
  fileChunkCache.clear();
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

/**
 * Extracts top-level declared symbols (functions, classes, interfaces, types, structs, enums)
 * from a code snippet across common programming languages (TypeScript, JavaScript, Python, Go, Rust).
 */
export function extractDefinedSymbols(code: string): string[] {
  if (!code) return [];
  const symbols = new Set<string>();
  const lines = code.split("\n");

  const patterns: RegExp[] = [
    // JS/TS functions: function foo(, export default function foo(
    /(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*[\(<]/,
    // JS/TS arrow functions: const foo = ( or const foo = async (
    /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/,
    // JS/TS class, interface, type, enum
    /(?:export\s+)?(?:class|interface|type|enum)\s+([a-zA-Z0-9_$]+)/,
    // Python def / class
    /(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/,
    /class\s+([a-zA-Z0-9_]+)\s*[:\(]/,
    // Go func (receiver)? name(
    /func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(/,
    // Rust fn, struct, enum, trait
    /(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?(?:fn|struct|enum|trait)\s+([a-zA-Z0-9_]+)/,
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*")
    ) {
      continue;
    }
    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        const sym = match[1];
        if (sym.length > 1 && !STOPWORDS.has(sym.toLowerCase())) {
          symbols.add(sym);
        }
      }
    }
  }

  return Array.from(symbols);
}

export interface ProjectSymbolGraph {
  /** Map lowercased symbol name -> list of chunk IDs that define it */
  symbolToChunkIds: Map<string, string[]>;
  /** Map chunk ID -> list of symbols defined in it */
  chunkDefinedSymbols: Map<string, string[]>;
  /** Map chunk ID -> list of external defined symbols referenced in it */
  chunkReferencedSymbols: Map<string, string[]>;
}

/**
 * Builds an in-memory cross-file symbol call and reference graph from document chunks.
 */
export function buildProjectSymbolGraph(chunks: DocumentChunk[]): ProjectSymbolGraph {
  const symbolToChunkIds = new Map<string, string[]>();
  const chunkDefinedSymbols = new Map<string, string[]>();

  // Pass 1: Index all defined symbols
  for (const chunk of chunks) {
    const defined = chunk.symbolsDefined || [];
    if (defined.length > 0) {
      chunkDefinedSymbols.set(chunk.id, defined);
      for (const sym of defined) {
        const key = sym.toLowerCase();
        const existing = symbolToChunkIds.get(key) || [];
        existing.push(chunk.id);
        symbolToChunkIds.set(key, existing);
      }
    }
  }

  // Pass 2: Map cross-chunk references to project-defined symbols
  const chunkReferencedSymbols = new Map<string, string[]>();
  const definedSymbolNames = Array.from(symbolToChunkIds.keys());

  for (const chunk of chunks) {
    const selfDefined = new Set((chunk.symbolsDefined || []).map((s) => s.toLowerCase()));
    const referenced = new Set<string>();

    const chunkLower = chunk.text.toLowerCase();
    for (const symKey of definedSymbolNames) {
      if (selfDefined.has(symKey)) continue;
      // Fast check before regex
      if (!chunkLower.includes(symKey)) continue;

      const regex = new RegExp(`\\b${symKey}\\b`, "i");
      if (regex.test(chunk.text)) {
        const defChunkId = symbolToChunkIds.get(symKey)?.[0];
        const origName =
          chunkDefinedSymbols.get(defChunkId || "")?.find((s) => s.toLowerCase() === symKey) || symKey;
        referenced.add(origName);
      }
    }

    if (referenced.size > 0) {
      const refList = Array.from(referenced);
      chunkReferencedSymbols.set(chunk.id, refList);
      chunk.symbolsReferenced = refList;
    }
  }

  return { symbolToChunkIds, chunkDefinedSymbols, chunkReferencedSymbols };
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
    symbolsDefined: extractDefinedSymbols(chunkText),
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

  const isCode = isCodeFile(file.name);

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
        symbolsDefined: isCode ? extractDefinedSymbols(content) : undefined,
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
        // Overlap: preserve the last segment of the previous buffer with word-boundary snapping
        const rawOverlapStart = Math.max(0, currentBuffer.length - overlapChars);
        let overlapStart = rawOverlapStart;
        if (overlapStart > 0 && overlapStart < currentBuffer.length) {
          const nextSpace = currentBuffer.indexOf(" ", overlapStart);
          const nextNl = currentBuffer.indexOf("\n", overlapStart);
          const candidate = Math.min(
            nextSpace === -1 ? Infinity : nextSpace,
            nextNl === -1 ? Infinity : nextNl
          );
          if (candidate !== Infinity && candidate - rawOverlapStart < 30) {
            overlapStart = candidate + 1;
          }
        }
        const overlapText = currentBuffer.slice(overlapStart).trim();
        currentBuffer = overlapText ? `${overlapText}\n\n${trimmed}` : trimmed;
      } else {
        // If a single section is larger than targetChunkChars (e.g. huge unbroken log or code file)
        let remaining = trimmed;
        while (remaining.length > targetChunkChars) {
          chunks.push(remaining.slice(0, targetChunkChars));
          let nextStart = targetChunkChars - overlapChars;
          if (nextStart > 0 && nextStart < remaining.length) {
            const nextSpace = remaining.indexOf(" ", nextStart);
            if (nextSpace !== -1 && nextSpace - nextStart < 30) {
              nextStart = nextSpace + 1;
            }
          }
          remaining = remaining.slice(nextStart);
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
    symbolsDefined: isCode ? extractDefinedSymbols(chunkText) : undefined,
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

    // Pass 3: Symbol definition bonus
    // If a chunk explicitly defines a symbol queried by the user, grant it an authoritative definition boost
    const SYMBOL_DEF_BONUS_RATIO = 0.45;
    if (maxContentScore > 0 && chunk.symbolsDefined && chunk.symbolsDefined.length > 0) {
      let symMatched = 0;
      const lowerSymbols = chunk.symbolsDefined.map((s) => s.toLowerCase());
      for (const qToken of queryTokens) {
        if (lowerSymbols.some((s) => s === qToken || s.includes(qToken))) {
          symMatched++;
        }
      }
      if (symMatched > 0) {
        const coverage = symMatched / queryTokens.length;
        score += coverage * SYMBOL_DEF_BONUS_RATIO * maxContentScore;
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

/**
 * Merges text of two overlapping or adjacent chunks, removing duplicate overlap text.
 */
export function mergeChunkTexts(text1: string, text2: string, maxOverlap = 600): string {
  if (!text1) return text2 || "";
  if (!text2) return text1 || "";
  const minCheck = 10;
  const maxSearch = Math.min(text1.length, text2.length, maxOverlap);
  for (let len = maxSearch; len >= minCheck; len--) {
    const suffix = text1.slice(text1.length - len);
    if (text2.startsWith(suffix)) {
      return text1 + text2.slice(len);
    }
  }
  return `${text1.trimEnd()}\n\n${text2.trimStart()}`;
}

/**
 * Stitches consecutive chunks from the same file into single contiguous passages.
 * When chunks (e.g. Part 1 and Part 2) are selected together:
 * - Deduplicates the overlap between them
 * - Avoids fragmented document headers that break code/syntax across lines
 * - Recalculates estimated tokens and preserves symbol definitions
 */
export function stitchAdjacentChunks(chunks: RankedChunk[]): RankedChunk[] {
  if (!chunks || chunks.length <= 1) return chunks;

  // Group chunks by fileId
  const byFile = new Map<string, RankedChunk[]>();
  for (const chunk of chunks) {
    const list = byFile.get(chunk.fileId) || [];
    list.push(chunk);
    byFile.set(chunk.fileId, list);
  }

  const stitched: RankedChunk[] = [];

  for (const [, fileChunks] of byFile.entries()) {
    // Sort ascending by chunkIndex
    fileChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    let current: RankedChunk | null = null;
    let startPart = 1;
    let endPart = 1;

    for (const chunk of fileChunks) {
      if (!current) {
        current = { ...chunk };
        startPart = current.chunkIndex + 1;
        endPart = startPart;
        continue;
      }

      // Check if this chunk is immediately consecutive to current
      if (chunk.chunkIndex === endPart) {
        // Consecutive! Merge chunk into current
        const mergedText = mergeChunkTexts(current.text, chunk.text);
        const mergedDefs: string[] = Array.from(
          new Set([...(current.symbolsDefined || []), ...(chunk.symbolsDefined || [])])
        );
        const mergedRefs: string[] = Array.from(
          new Set([...(current.symbolsReferenced || []), ...(chunk.symbolsReferenced || [])])
        );

        endPart = chunk.chunkIndex + 1;
        current = {
          ...current,
          id: `${current.id}+${chunk.id}`,
          text: mergedText,
          charCount: mergedText.length,
          estimatedTokens: estimateTokens(mergedText),
          preview: mergedText.slice(0, 120).replace(/\n/g, " "),
          score: Math.max(current.score ?? 0, chunk.score ?? 0),
          symbolsDefined: mergedDefs.length > 0 ? mergedDefs : undefined,
          symbolsReferenced: mergedRefs.length > 0 ? mergedRefs : undefined,
          stitchedPartRange: [startPart, endPart],
        };
      } else {
        // Not consecutive, push current and start new
        stitched.push(current);
        current = { ...chunk };
        startPart = current.chunkIndex + 1;
        endPart = startPart;
      }
    }

    if (current) {
      stitched.push(current);
    }
  }

  // Restore descending score order
  stitched.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return stitched;
}

function assembleContextFromRanked(
  files: ProjectFile[],
  ranked: RankedChunk[],
  tokenBudget: number,
  symbolGraph?: ProjectSymbolGraph,
  allProjectChunks?: DocumentChunk[],
  options?: { stitchAdjacent?: boolean }
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

  // Pass 3: Graph-Augmented Retrieval Expansion
  // If budget permits, pull in definitions of referenced symbols that were not yet included
  if (symbolGraph && accumulatedTokens < tokenBudget * 0.85) {
    const chunkById = new Map((allProjectChunks || ranked).map((c) => [c.id, c]));
    const selectedIds = new Set(selectedChunks.map((c) => c.id));

    for (const chunk of [...selectedChunks]) {
      const refs = chunk.symbolsReferenced || [];
      for (const ref of refs) {
        const targetChunkIds = symbolGraph.symbolToChunkIds.get(ref.toLowerCase()) || [];
        for (const targetId of targetChunkIds) {
          if (!selectedIds.has(targetId)) {
            const rawDefChunk = chunkById.get(targetId);
            if (rawDefChunk && accumulatedTokens + rawDefChunk.estimatedTokens <= tokenBudget) {
              const defChunk: RankedChunk = {
                ...rawDefChunk,
                score: (rawDefChunk as any).score ?? 0.5,
              };
              selectedChunks.push(defChunk);
              selectedIds.add(targetId);
              accumulatedTokens += defChunk.estimatedTokens;
              matchedFileSet.add(defChunk.fileName);
            }
          }
        }
      }
    }
  }

  // Keep final order score-descending (the two-pass selection above can
  // interleave first-pass and deferred-pass picks out of score order).
  selectedChunks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // Pass 4: Adjacent Chunk Stitching (Boundary Optimization)
  // Merge consecutive chunks from the same file into unified passages with overlap deduplication.
  const finalChunks = options?.stitchAdjacent
    ? stitchAdjacentChunks(selectedChunks)
    : selectedChunks;

  let contextText = "\n\n=== RETRIEVED PROJECT KNOWLEDGE ===\n";
  contextText += `Relevant source files (${matchedFileSet.size}): ${Array.from(matchedFileSet).join(", ")}\n`;
  contextText += "\nBelow are the most relevant document passages retrieved for the user's prompt:\n";

  // Reorder chunks using U-shaped perimeter order ("Lost in the Middle") so highest-scoring
  // passages sit at the top and bottom of the context window rather than in the degraded middle.
  const contextOrderedChunks = reorderChunksLostInTheMiddle(finalChunks);
  for (const chunk of contextOrderedChunks) {
    const defs =
      chunk.symbolsDefined && chunk.symbolsDefined.length > 0
        ? ` (Defines: ${chunk.symbolsDefined.slice(0, 5).join(", ")})`
        : "";
    const refs =
      chunk.symbolsReferenced && chunk.symbolsReferenced.length > 0
        ? ` (References: ${chunk.symbolsReferenced.slice(0, 5).join(", ")})`
        : "";
    const symHeader = defs || refs ? `${defs}${refs}` : "";
    const partLabel = chunk.stitchedPartRange
      ? `Parts ${chunk.stitchedPartRange[0]}-${chunk.stitchedPartRange[1]}/${chunk.totalChunks}`
      : `Part ${chunk.chunkIndex + 1}/${chunk.totalChunks}`;
    contextText += `\n--- [Document: ${chunk.fileName} (${partLabel})${symHeader}] ---\n`;
    contextText += `${chunk.text}\n`;
  }
  const retrievedChunks: RetrievedChunkInfo[] = finalChunks.map((c) => ({
    id: c.id,
    fileName: c.fileName,
    chunkIndex: c.chunkIndex,
    totalChunks: c.totalChunks,
    score: c.score !== undefined ? Math.round(c.score * 100) / 100 : undefined,
    textSnippet: c.text.slice(0, 300),
    estimatedTokens: c.estimatedTokens,
    symbolsDefined: c.symbolsDefined,
    linkedSymbols: c.symbolsReferenced,
    stitchedPartRange: c.stitchedPartRange,
  }));

  const totalEstimatedTokens = finalChunks.reduce((acc, c) => acc + c.estimatedTokens, 0);

  return {
    contextText,
    matchedChunksCount: finalChunks.length,
    totalFilesCount: files.length,
    matchedFiles: Array.from(matchedFileSet),
    totalEstimatedTokens,
    isChunked: true,
    retrievedChunks,
  };
}

/**
 * Reorders an array of ranked chunks using a U-shaped perimeter order ("Lost in the Middle").
 * The highest-scoring chunk is placed at the very top (index 0).
 * The second highest-scoring chunk is placed at the very bottom (closest to user prompt).
 * Lower-scoring chunks are placed in the middle.
 */
export function reorderChunksLostInTheMiddle<T>(items: T[]): T[] {
  if (items.length <= 2) return [...items];

  const front: T[] = [];
  const back: T[] = [];

  for (let i = 0; i < items.length; i++) {
    if (i % 2 === 0) {
      front.push(items[i]);
    } else {
      back.unshift(items[i]);
    }
  }

  return [...front, ...back];
}

/**
 * Constructs a prompt for generating a hypothetical document (HyDE)
 * to expand the semantic space of user queries.
 */
export function buildHydePrompt(query: string): string {
  return `Write a concise technical documentation passage or code snippet that directly answers or implements the following query. Do not include greetings, explanations, or conversational preamble—output only the hypothetical code or documentation paragraph:\n\nQuery: ${query.trim()}`;
}

/**
 * Generates a hypothetical answer/document snippet for a query using a local model.
 * Fails soft (returns null) on timeout or connection error.
 */
export async function generateHypotheticalDocument(
  query: string,
  options: {
    ollamaUrl: string;
    model?: string;
    timeoutMs?: number;
  }
): Promise<string | null> {
  if (!query || !query.trim() || !options.ollamaUrl) return null;

  const model = options.model || "llama3.2";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);

  try {
    const baseUrl = options.ollamaUrl.replace(/\/+$/, "");
    const prompt = buildHydePrompt(query);

    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 180,
        },
        keep_alive: "5s",
      }),
      signal: controller.signal,
    });

    if (!res.ok) return null;
    const data = await res.json();
    const responseText = typeof data?.response === "string" ? data.response.trim() : null;
    return responseText || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface HybridEmbeddingOptions {
  ollamaUrl: string;
  embeddingModel?: string;
  enabled?: boolean;
  semanticWeight?: number;
  rrfK?: number;
  hyde?: {
    enabled?: boolean;
    model?: string;
    hypotheticalDocument?: string;
    timeoutMs?: number;
  };
}

/**
 * Hybrid retrieval: blends the existing BM25 keyword score with cosine
 * similarity over embeddings from a local Ollama embedding model
 * (default: nomic-embed-text). Supports Reciprocal Rank Fusion (RRF)
 * and Hypothetical Document Embeddings (HyDE).
 * Falls back to pure BM25 if embeddings are unavailable.
 */
export async function rankChunksHybrid(
  chunks: DocumentChunk[],
  query: string,
  topK: number,
  embeddingOptions: HybridEmbeddingOptions
): Promise<RankedChunk[]> {
  // Full BM25 ranking (unsliced) so we have a score for every chunk to blend with.
  const bm25Ranked = rankChunksBM25(chunks, query, chunks.length);
  if (!query.trim() || chunks.length === 0) return bm25Ranked.slice(0, topK);

  // Stage 1: Coarse Candidate Selection
  // For small collections (<= 35 chunks), evaluate all directly.
  // For large collections, select top candidate pool (BM25 matches prioritized, supplemented by initial chunks).
  const candidatePoolSize = Math.min(chunks.length, Math.max(topK * 5, 35));
  let candidateChunks: DocumentChunk[] = chunks;

  if (chunks.length > candidatePoolSize) {
    const candidateIds = new Set<string>();
    const candidates: DocumentChunk[] = [];

    for (const bm of bm25Ranked) {
      if (candidates.length >= candidatePoolSize) break;
      if (!candidateIds.has(bm.id)) {
        candidateIds.add(bm.id);
        candidates.push(bm);
      }
    }

    for (const c of chunks) {
      if (candidates.length >= candidatePoolSize) break;
      if (!candidateIds.has(c.id)) {
        candidateIds.add(c.id);
        candidates.push(c);
      }
    }

    candidateChunks = candidates;
  }

  // Stage 2: Fine Semantic Embedding & Reciprocal Rank Fusion (RRF)
  let semanticSearchText = query;

  if (embeddingOptions.hyde?.enabled) {
    let hypoDoc = embeddingOptions.hyde.hypotheticalDocument;
    if (!hypoDoc && embeddingOptions.ollamaUrl) {
      hypoDoc = (await generateHypotheticalDocument(query, {
        ollamaUrl: embeddingOptions.ollamaUrl,
        model: embeddingOptions.hyde.model,
        timeoutMs: embeddingOptions.hyde.timeoutMs,
      })) || undefined;
    }

    if (hypoDoc) {
      // Concatenate query + hypothetical document to preserve original search terms
      // while expanding vector embedding into answer/document semantic space
      semanticSearchText = `${query}\n\n${hypoDoc}`;
    }
  }

  const [queryEmbedding, ...chunkEmbeddings] = await embedTexts(
    [semanticSearchText, ...candidateChunks.map((c) => c.text)],
    { ollamaUrl: embeddingOptions.ollamaUrl, model: embeddingOptions.embeddingModel }
  );

  if (!queryEmbedding) return bm25Ranked.slice(0, topK);

  // 1-based BM25 ranks
  const bm25RankById = new Map<string, number>();
  bm25Ranked.forEach((c, idx) => {
    bm25RankById.set(c.id, idx + 1);
  });

  // Calculate semantic similarities for all candidate chunks
  const semanticScored = candidateChunks.map((chunk, idx) => {
    const emb = chunkEmbeddings[idx];
    const similarity = emb ? cosineSimilarity(queryEmbedding, emb) : 0;
    return { chunk, similarity };
  });

  // Sort candidates descending by cosine similarity to assign dense semantic ranks
  semanticScored.sort((a, b) => b.similarity - a.similarity);
  const semanticRankById = new Map<string, number>();
  semanticScored.forEach((item, idx) => {
    semanticRankById.set(item.chunk.id, idx + 1);
  });

  // RRF smoothing parameter k (standard default 60)
  const k = embeddingOptions.rrfK ?? 60;
  const semanticWeight = Math.min(1, Math.max(0, embeddingOptions.semanticWeight ?? 0.55));
  const keywordWeight = 1 - semanticWeight;

  const hybridScored: RankedChunk[] = candidateChunks.map((chunk) => {
    const bm25Rank = bm25RankById.get(chunk.id);
    const semRank = semanticRankById.get(chunk.id);

    // Standard RRF formula: 1 / (k + rank)
    const bm25Rrf = bm25Rank !== undefined && keywordWeight > 0 ? 1 / (k + bm25Rank) : 0;
    const semRrf = semRank !== undefined && semanticWeight > 0 ? 1 / (k + semRank) : 0;

    // Normalizing by (k + 1) scales the theoretical maximum (rank 1 in both signals) to 1.0
    const score = (k + 1) * (keywordWeight * bm25Rrf + semanticWeight * semRrf);
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
    rrfK?: number;
    hyde?: {
      enabled?: boolean;
      model?: string;
      hypotheticalDocument?: string;
      timeoutMs?: number;
    };
  },
  ragOptions?: {
    chunkSizeChars?: number;
    chunkOverlapChars?: number;
    topK?: number;
    rrfK?: number;
    stitchAdjacent?: boolean;
    hyde?: {
      enabled?: boolean;
      model?: string;
      hypotheticalDocument?: string;
      timeoutMs?: number;
    };
  }
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
    return buildOptimizedKnowledgeContext(files, userQuery, effectiveBudget, {
      stitchAdjacent: ragOptions?.stitchAdjacent,
    });
  }

  const chunkSizeChars = ragOptions?.chunkSizeChars ?? 1800;
  const chunkOverlapChars = ragOptions?.chunkOverlapChars ?? 200;
  const topK = ragOptions?.topK ?? 8;

  const allChunks: DocumentChunk[] = [];
  for (const file of files) {
    allChunks.push(...getCachedFileChunks(file, chunkSizeChars, chunkOverlapChars));
  }

  const symbolGraph = buildProjectSymbolGraph(allChunks);

  const effectiveEmbeddingOptions = embeddingOptions
    ? {
        ...embeddingOptions,
        rrfK: embeddingOptions.rrfK ?? ragOptions?.rrfK,
        hyde: embeddingOptions.hyde ?? ragOptions?.hyde,
      }
    : undefined;

  const ranked =
    effectiveEmbeddingOptions?.enabled && effectiveEmbeddingOptions.ollamaUrl
      ? await rankChunksHybrid(allChunks, userQuery, topK, effectiveEmbeddingOptions)
      : rankChunksBM25(allChunks, userQuery, topK);

  return assembleContextFromRanked(files, ranked, effectiveBudget, symbolGraph, allChunks, {
    stitchAdjacent: ragOptions?.stitchAdjacent,
  });
}

/**
 * Builds an optimized, token-budgeted knowledge base context for local models.
 * Automatically switches between full inclusion (for small files) and smart BM25 retrieval
 * (for larger files) dynamically sized to model context capability.
 */
export function buildOptimizedKnowledgeContext(
  files: ProjectFile[],
  userQuery = "",
  tokenBudget?: number,
  ragOptions?: { stitchAdjacent?: boolean }
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

    const retrievedChunks: RetrievedChunkInfo[] = files.map((f, i) => {
      const isCode = isCodeFile(f.name);
      return {
        id: `file_${f.id || i}`,
        fileName: f.name,
        chunkIndex: 0,
        totalChunks: 1,
        textSnippet: (f.textContent || "").slice(0, 300),
        estimatedTokens: estimateTokens(f.textContent || ""),
        symbolsDefined: isCode ? extractDefinedSymbols(f.textContent || "") : undefined,
      };
    });

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
    const fileChunks = getCachedFileChunks(file);
    allChunks.push(...fileChunks);
  }

  const symbolGraph = buildProjectSymbolGraph(allChunks);

  // Rank chunks against the user's latest query
  const ranked = rankChunksBM25(allChunks, userQuery, 8);

  return assembleContextFromRanked(files, ranked, effectiveBudget, symbolGraph, allChunks, {
    stitchAdjacent: ragOptions?.stitchAdjacent,
  });
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
