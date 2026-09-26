import { RetrievedChunkInfo, GroundingReport } from "./types";

const COMMON_STOPWORDS = new Set([
  "adalah", "pada", "yang", "untuk", "dengan", "dari", "dalam", "akan", "ini", "itu", "dan", "atau",
  "oleh", "sebagai", "dapat", "bisa", "juga", "hanya", "tidak", "belum", "sudah", "kami", "kita",
  "saya", "anda", "mereka", "secara", "berdasarkan", "menurut", "seperti", "fungsi", "file", "berikut",
  "menggunakan", "adanya", "tersebut", "tentang", "antara", "the", "and", "that", "this", "with",
  "from", "into", "during", "including", "until", "against", "among", "throughout", "despite", "towards",
  "upon", "concerning", "to", "in", "for", "on", "by", "about", "like", "through", "over", "before", "between",
  "after", "since", "without", "under", "within", "along", "following", "across", "behind", "beyond", "plus",
  "except", "but", "up", "out", "around", "down", "off", "above", "near"
]);

/**
 * A word-overlap heuristic treats every non-stopword token equally, but
 * generic technical vocabulary ("context", "window", "token") repeats across
 * nearly every sentence in a codebase's chunks and carries little signal:
 * a claim can score high overlap purely from restating common terms while
 * getting the one specific fact (a number, an identifier) wrong. This is a
 * cheap proxy for IDF (inverse document frequency) without needing a real
 * corpus index — words that appear in fewer chunks are weighted higher.
 */
function buildTokenWeights(chunkTexts: string[]): Map<string, number> {
  const docFreq = new Map<string, number>();
  for (const text of chunkTexts) {
    const seenInThisChunk = new Set(
      text.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter((w) => w.length > 2 && !COMMON_STOPWORDS.has(w))
    );
    for (const w of seenInThisChunk) {
      docFreq.set(w, (docFreq.get(w) || 0) + 1);
    }
  }
  const numChunks = Math.max(1, chunkTexts.length);
  const weights = new Map<string, number>();
  for (const [word, freq] of docFreq) {
    // A word in every chunk gets weight ~1 (baseline); a word in only one
    // chunk out of many gets weight up to ~3 (capped, so a single rare typo
    // can't single-handedly flip the verdict).
    weights.set(word, Math.min(3, 1 + Math.log((numChunks + 1) / (freq + 0.5))));
  }
  return weights;
}

/** A bare integer/decimal, or a hex/version-like token (e.g. "8192", "3.14", "0x1F"). */
const NUMERIC_TOKEN_RE = /^(?:0x[0-9a-f]+|\d+(?:\.\d+)?)$/i;

interface SentenceVerdict {
  verified: boolean;
  // true when the sentence asserts at least one number that appears nowhere
  // in the retrieved chunks — this is checked independently of the general
  // overlap ratio because a fabricated number can hide behind a high overlap
  // score built from surrounding generic words (see PR discussion / the
  // "99999" false-positive case this rewrite fixes).
  hasUnsupportedNumber: boolean;
  overlapRatio: number;
}

function evaluateSentence(
  sentence: string,
  combinedChunkText: string,
  chunkNumbers: Set<string>,
  tokenWeights: Map<string, number>
): SentenceVerdict {
  const rawTokens = sentence
    .toLowerCase()
    .split(/[^a-zA-Z0-9_.]+/) // keep '.' so decimals like "8.5" survive tokenizing
    .filter((w) => w.length > 0);

  const wordTokens = rawTokens.filter((w) => w.length > 2 && !NUMERIC_TOKEN_RE.test(w) && !COMMON_STOPWORDS.has(w));
  const numberTokens = rawTokens.filter((w) => NUMERIC_TOKEN_RE.test(w) && w.length >= 2); // skip lone digits like "a 1-off"

  if (wordTokens.length === 0 && numberTokens.length === 0) {
    return { verified: true, hasUnsupportedNumber: false, overlapRatio: 1 };
  }

  let matchedWeight = 0;
  let totalWeight = 0;
  for (const w of wordTokens) {
    const weight = tokenWeights.get(w) ?? 1;
    totalWeight += weight;
    if (combinedChunkText.includes(w)) matchedWeight += weight;
  }
  const overlapRatio = totalWeight > 0 ? matchedWeight / totalWeight : (wordTokens.length === 0 ? 1 : 0);

  // A number the model states but that appears in none of the retrieved
  // chunks is a specific, checkable fabrication — e.g. citing "99999" as a
  // context-window bucket size when the chunks only ever mention powers of
  // two. Unlike prose paraphrase, there's no legitimate reason a grounded
  // answer would introduce a number absent from its own source material.
  const hasUnsupportedNumber = numberTokens.some((n) => !chunkNumbers.has(n));

  const verified = overlapRatio >= 0.25 && !hasUnsupportedNumber;
  return { verified, hasUnsupportedNumber, overlapRatio };
}

/**
 * Optional second pass for sentences the fast heuristic can't confidently
 * call either way (see BORDERLINE_LOW/HIGH below). Sends the ambiguous
 * sentence plus the retrieved context to a local Ollama model with a
 * single-shot yes/no-style JSON prompt — same call shape as
 * lib/rag.ts's scorePassagesWithLocalModel (Stage-2 reranking), reused here
 * rather than duplicated as a new pattern. Never blocks the heuristic path:
 * any failure (no ollamaUrl configured, network error, malformed response,
 * timeout) falls back to the heuristic's own verdict.
 */
async function verifyBorderlineSentencesWithLLM(
  sentences: { sentence: string; verdict: SentenceVerdict }[],
  combinedChunkText: string,
  options: { ollamaUrl: string; model?: string; timeoutMs?: number }
): Promise<Map<string, boolean>> {
  const overrides = new Map<string, boolean>();
  if (sentences.length === 0 || !options.ollamaUrl) return overrides;

  const model = options.model || "llama3.2";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 3000);

  try {
    const baseUrl = options.ollamaUrl.replace(/\/+$/, "");
    // Cap context sent to the verifier prompt — this is a lightweight
    // sanity check, not a full re-grounding, so a truncated context window
    // is an acceptable tradeoff for keeping the call fast.
    const contextExcerpt = combinedChunkText.slice(0, 4000);
    const items = sentences.map((s, i) => ({ id: String(i + 1), claim: s.sentence.slice(0, 300) }));

    const prompt = `You are a strict fact-checker. For each numbered CLAIM below, decide if it is directly supported by the CONTEXT — meaning a careful reading of the context confirms the claim, even if worded differently (paraphrase is fine). Reply "false" if the claim states something the context does not support, contradicts, or is silent on.

CONTEXT:
${contextExcerpt}

CLAIMS:
${items.map((it) => `${it.id}. ${it.claim}`).join("\n")}

Respond with ONLY a JSON object mapping each claim id to true or false, e.g. {"1": true, "2": false}. No other text.`;

    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        format: "json",
        stream: false,
        options: { temperature: 0.0, num_predict: Math.min(200, items.length * 20 + 40) },
        keep_alive: "5s",
      }),
      signal: controller.signal,
    });

    if (!res.ok) return overrides;
    const data = await res.json();
    const rawResponse = typeof data?.response === "string" ? data.response.trim() : "";
    if (!rawResponse) return overrides;

    let parsed: any;
    try {
      parsed = JSON.parse(rawResponse);
    } catch {
      return overrides;
    }
    if (!parsed || typeof parsed !== "object") return overrides;

    for (const it of items) {
      const val = parsed[it.id];
      if (typeof val === "boolean") {
        overrides.set(it.claim, val);
      }
    }
    return overrides;
  } catch {
    return overrides;
  } finally {
    clearTimeout(timeout);
  }
}

// A sentence whose heuristic overlap ratio falls in this band is genuinely
// ambiguous — clearly-grounded (>=HIGH) and clearly-unsupported (<LOW)
// sentences skip the LLM call entirely, so only the uncertain middle costs
// the extra latency.
const BORDERLINE_LOW = 0.15;
const BORDERLINE_HIGH = 0.45;

/**
 * Post-generation Citation & Hallucination Verifier.
 * Evaluates whether an LLM generation in a RAG turn is strictly grounded in the
 * retrieved project chunks, or if it hallucinated non-existent files, claims,
 * or specific facts (numbers) not present in the source material.
 *
 * `llmFallback`, if provided, sends only the sentences the fast heuristic is
 * unsure about (see BORDERLINE_LOW/HIGH) to a local model for a second
 * opinion — this makes the function async when used, but it degrades
 * gracefully to the pure-heuristic result (still synchronous-shaped
 * internally) if omitted, unreachable, or it fails.
 */
export async function verifyGrounding(
  generatedText: string,
  retrievedChunks?: RetrievedChunkInfo[],
  llmFallback?: { ollamaUrl: string; model?: string; timeoutMs?: number }
): Promise<GroundingReport | null> {
  if (!generatedText || !retrievedChunks || retrievedChunks.length === 0) {
    return null;
  }

  const chunkFileNames = Array.from(new Set(retrievedChunks.map((c) => c.fileName.toLowerCase())));
  const chunkTexts = retrievedChunks.map((c) => `${c.fileName} ${c.textSnippet}`);
  const combinedChunkText = chunkTexts.join(" ").toLowerCase();
  const tokenWeights = buildTokenWeights(chunkTexts);

  const chunkNumbers = new Set(
    (combinedChunkText.match(/\b(?:0x[0-9a-f]+|\d+(?:\.\d+)?)\b/gi) || []).map((n) => n.toLowerCase())
  );

  // 1. Extract file references mentioned in the generated answer
  // Matches e.g. "auth.ts", "utils/db.js", "README.md", "app/page.tsx"
  const fileRegex = /\b([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]{1,6})\b/g;
  const rawMatches = generatedText.match(fileRegex) || [];

  const verifiedFiles = new Set<string>();
  const unverifiedFiles = new Set<string>();

  for (const match of rawMatches) {
    const baseName = match.split("/").pop()?.toLowerCase();
    if (!baseName || baseName.length < 3) continue;
    // Skip version or numeric extensions like "1.0", "v2.5"
    if (/^\d+\.\d+$/.test(baseName) || baseName.startsWith("v")) continue;

    const matchedKnownFile = chunkFileNames.find((cf) => cf === baseName || cf.endsWith(`/${baseName}`));
    if (matchedKnownFile) {
      verifiedFiles.add(matchedKnownFile);
    } else if (/\.(?:ts|tsx|js|jsx|json|py|md|html|css|sql|go|rs|cpp|c|java|yml|yaml)$/i.test(baseName)) {
      unverifiedFiles.add(baseName);
    }
  }

  // 2. Statement-level claim verification against chunk text
  const sentences = generatedText
    .split(/(?:\.\s+|\n+[-*]\s*|\n+\d+\.\s*|\n{2,})/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  const verdicts = sentences.map((sentence) => ({
    sentence,
    verdict: evaluateSentence(sentence, combinedChunkText, chunkNumbers, tokenWeights),
  }));

  if (llmFallback?.ollamaUrl) {
    const borderline = verdicts.filter(
      (v) => v.verdict.overlapRatio >= BORDERLINE_LOW && v.verdict.overlapRatio < BORDERLINE_HIGH && !v.verdict.hasUnsupportedNumber
    );
    if (borderline.length > 0) {
      const overrides = await verifyBorderlineSentencesWithLLM(
        borderline.map((b) => ({ sentence: b.sentence.slice(0, 300), verdict: b.verdict })),
        combinedChunkText,
        llmFallback
      );
      for (const v of verdicts) {
        const key = v.sentence.slice(0, 300);
        if (overrides.has(key)) {
          v.verdict = { ...v.verdict, verified: overrides.get(key)! };
        }
      }
    }
  }

  const verifiedClaims = verdicts.filter((v) => v.verdict.verified).length;

  const totalClaims = Math.max(1, sentences.length);
  const claimRatio = verifiedClaims / totalClaims;

  // Penalize score if model fabricated unverified project files
  const filePenalty = unverifiedFiles.size * 25;
  const baseScore = verifiedFiles.size > 0
    ? Math.round(0.6 * (claimRatio * 100) + 0.4 * 100)
    : Math.round(claimRatio * 100);

  const rawScore = Math.max(0, Math.min(100, baseScore - filePenalty));

  let status: "verified" | "partial" | "unverified" = "partial";
  if (rawScore >= 75 && unverifiedFiles.size === 0) {
    status = "verified";
  } else if (rawScore < 45 || unverifiedFiles.size > 0) {
    status = "unverified";
  }

  const verifiedList = Array.from(verifiedFiles);
  const unverifiedList = Array.from(unverifiedFiles);

  const summary = `Grounding: ${rawScore}% • ${verifiedList.length} verified file(s) cited${
    unverifiedList.length > 0 ? ` • Warning: ${unverifiedList.length} unverified file(s) (${unverifiedList.join(", ")})` : ""
  }`;

  return {
    score: rawScore,
    verifiedFiles: verifiedList,
    unverifiedFiles: unverifiedList,
    verifiedCitationCount: verifiedClaims,
    totalClaimsCount: totalClaims,
    status,
    summary,
  };
}
