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
 * Post-generation Citation & Hallucination Verifier.
 * Evaluates whether an LLM generation in a RAG turn is strictly grounded in the
 * retrieved project chunks, or if it hallucinated non-existent files and claims.
 */
export function verifyGrounding(
  generatedText: string,
  retrievedChunks?: RetrievedChunkInfo[]
): GroundingReport | null {
  if (!generatedText || !retrievedChunks || retrievedChunks.length === 0) {
    return null;
  }

  const chunkFileNames = Array.from(new Set(retrievedChunks.map((c) => c.fileName.toLowerCase())));
  const combinedChunkText = retrievedChunks.map((c) => `${c.fileName} ${c.textSnippet}`).join(" ").toLowerCase();

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

  let verifiedClaims = 0;
  for (const sentence of sentences) {
    const rawTokens = sentence
      .toLowerCase()
      .split(/[^a-zA-Z0-9_]+/)
      .filter((w) => w.length > 2 && !COMMON_STOPWORDS.has(w));

    if (rawTokens.length === 0) {
      verifiedClaims++;
      continue;
    }

    let matchCount = 0;
    for (const w of rawTokens) {
      if (combinedChunkText.includes(w)) {
        matchCount++;
      }
    }

    const overlapRatio = matchCount / rawTokens.length;
    if (overlapRatio >= 0.25) {
      verifiedClaims++;
    }
  }

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
