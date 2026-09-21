import type { MemoryItem, MemoryItemCategory } from "./types";

/**
 * Auto-memory extraction: turning a finished chat exchange into durable
 * MemoryItems.
 *
 * Context: `MemoryConfig.generateFromChats` existed as a persisted setting
 * with a toggle in MemoryModal, but nothing ever read it — flipping it did
 * literally nothing. The injection side was already built (see the
 * "PERSISTENT USER MEMORY & CONTEXT" block in app/page.tsx); only the
 * production side was missing. This module is that missing half.
 *
 * Everything here is deliberately pure and synchronous. The single LLM call
 * lives in the API route, so the parts that decide *what is worth
 * remembering* and *whether we already know it* stay unit-testable without
 * a model in the loop — that's where precision actually comes from, and
 * where silent regressions would otherwise hide.
 */

const VALID_CATEGORIES: MemoryItemCategory[] = ["preference", "profile", "project", "topic", "other"];

/** Upper bound on stored memories. Every enabled item is injected into the
 * system prompt on every turn, so an unbounded list quietly eats the
 * context window and degrades the very answers memory is meant to improve. */
export const MAX_MEMORY_ITEMS = 60;

/** Patterns for content that must never be written to long-term storage,
 * regardless of what the model proposes. This is a floor, not a
 * replacement for the user's own `includeSensitive` setting: credentials
 * are excluded even when the user has opted into sensitive storage,
 * because a leaked key in a prompt-injected page is a different risk class
 * from a personal detail the user chose to save. */
const CREDENTIAL_PATTERNS: RegExp[] = [
  /\b(sk|pk|rk)[-_][A-Za-z0-9]{16,}\b/,          // provider-style API keys
  /\bghp_[A-Za-z0-9]{20,}\b/,                     // GitHub tokens
  /\bAKIA[0-9A-Z]{16}\b/,                         // AWS access key IDs
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, // JWTs
  /\b[0-9]{12,19}\b/,                             // card-like number runs
  /\b(password|passwd|api[_ ]?key|secret|token|private[_ ]?key)\b\s*[:=]\s*\S+/i,
];

/** Softer signals — personal data the user may legitimately want stored,
 * but only when they've explicitly enabled sensitive memory. */
const SENSITIVE_PATTERNS: RegExp[] = [
  /\b\d{16}\b/,
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/,                  // email addresses
  /\b(\+62|62|0)8[1-9][0-9]{6,11}\b/,             // Indonesian phone numbers
  /\b(nik|ktp|npwp|passport|paspor)\b/i,
];

export function containsCredential(text: string): boolean {
  return CREDENTIAL_PATTERNS.some((re) => re.test(text));
}

export function containsSensitive(text: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(text));
}

/**
 * Normalizes a memory's text for equality comparison. Case, punctuation,
 * and filler whitespace shouldn't make "Prefers dark mode" and
 * "prefers dark mode." two separate memories.
 */
export function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Token-overlap similarity (Jaccard) between two memory strings. Used to
 * catch near-duplicates that aren't byte-identical — "works as a SOC
 * analyst" vs "user works as SOC analyst L2" should not both be stored.
 */
export function similarity(a: string, b: string): number {
  const ta = new Set(normalizeForCompare(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeForCompare(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  ta.forEach((t) => {
    if (tb.has(t)) inter++;
  });
  return inter / (ta.size + tb.size - inter);
}

const DUPLICATE_THRESHOLD = 0.6;

export interface ExtractedMemory {
  category: MemoryItemCategory;
  title: string;
  content: string;
}

/**
 * Parses the model's extraction response. Models wrap JSON in prose or
 * code fences often enough that naive JSON.parse fails in normal
 * operation, so this recovers the first well-formed array it can find and
 * returns [] rather than throwing — a failed extraction must never break
 * the chat turn it was triggered from.
 */
export function parseExtractionResponse(raw: string): ExtractedMemory[] {
  if (!raw || !raw.trim()) return [];

  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  if (!text.startsWith("[")) {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return [];
    text = text.slice(start, end + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: ExtractedMemory[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const title = typeof e.title === "string" ? e.title.trim() : "";
    const content = typeof e.content === "string" ? e.content.trim() : "";
    if (!title || !content) continue;
    // A "memory" longer than a couple of sentences is almost always the
    // model summarizing the conversation instead of isolating a durable
    // fact — storing those poisons the prompt with transcript noise.
    if (content.length > 300 || title.length > 80) continue;

    const rawCat = typeof e.category === "string" ? e.category.toLowerCase().trim() : "other";
    const category = (VALID_CATEGORIES as string[]).includes(rawCat)
      ? (rawCat as MemoryItemCategory)
      : "other";

    out.push({ category, title, content });
  }
  return out;
}

export interface MergeOptions {
  includeSensitive: boolean;
  maxItems?: number;
  now?: number;
}

export interface MergeResult {
  items: MemoryItem[];
  added: ExtractedMemory[];
  updated: ExtractedMemory[];
  rejected: { memory: ExtractedMemory; reason: "credential" | "sensitive" | "duplicate" | "capacity" }[];
}

/**
 * Folds newly extracted memories into the existing set.
 *
 * Rules, in order: credentials are dropped unconditionally; sensitive
 * personal data is dropped unless the user opted in; a near-duplicate of
 * an existing memory refreshes that memory's content instead of appending
 * a second copy (this is what keeps recall precise over months of use);
 * anything beyond the cap is rejected rather than silently evicting an
 * older memory the user may have curated by hand.
 */
export function mergeExtractedMemories(
  existing: MemoryItem[],
  extracted: ExtractedMemory[],
  opts: MergeOptions
): MergeResult {
  const now = opts.now ?? Date.now();
  const maxItems = opts.maxItems ?? MAX_MEMORY_ITEMS;
  const items = existing.map((m) => ({ ...m }));
  const result: MergeResult = { items, added: [], updated: [], rejected: [] };

  for (const mem of extracted) {
    const blob = `${mem.title} ${mem.content}`;

    if (containsCredential(blob)) {
      result.rejected.push({ memory: mem, reason: "credential" });
      continue;
    }
    if (!opts.includeSensitive && containsSensitive(blob)) {
      result.rejected.push({ memory: mem, reason: "sensitive" });
      continue;
    }

    const dupIndex = items.findIndex(
      (m) =>
        similarity(m.title, mem.title) >= DUPLICATE_THRESHOLD ||
        similarity(m.content, mem.content) >= DUPLICATE_THRESHOLD
    );

    if (dupIndex >= 0) {
      // Refresh rather than duplicate. Keeps the user's enabled/disabled
      // choice and original id intact so their curation isn't undone.
      const prev = items[dupIndex];
      if (normalizeForCompare(prev.content) !== normalizeForCompare(mem.content)) {
        items[dupIndex] = { ...prev, content: mem.content, updatedAt: now };
        result.updated.push(mem);
      } else {
        result.rejected.push({ memory: mem, reason: "duplicate" });
      }
      continue;
    }

    if (items.length >= maxItems) {
      result.rejected.push({ memory: mem, reason: "capacity" });
      continue;
    }

    items.push({
      id: `mem_auto_${now}_${items.length}_${Math.random().toString(36).slice(2, 8)}`,
      category: mem.category,
      title: mem.title,
      content: mem.content,
      updatedAt: now,
      enabled: true,
    });
    result.added.push(mem);
  }

  return result;
}

/**
 * Builds the extraction prompt. Shows the model what is already known so
 * it doesn't re-propose the same facts every turn, and is explicit that
 * returning an empty array is the correct answer for ordinary exchanges —
 * without that instruction models invent a "memory" for every turn just to
 * appear useful, which is how auto-memory features end up full of noise.
 */
export function buildExtractionPrompt(
  userMessage: string,
  assistantMessage: string,
  existingMemories: MemoryItem[]
): string {
  const known = existingMemories
    .slice(0, 40)
    .map((m) => `- ${m.title}: ${m.content}`)
    .join("\n");

  return `You extract durable, long-term facts about the user from a conversation.

ALREADY KNOWN (do not repeat these):
${known || "(nothing yet)"}

CONVERSATION:
User: ${userMessage.slice(0, 2000)}
Assistant: ${assistantMessage.slice(0, 2000)}

Extract ONLY facts that will still be true and useful weeks from now:
- stable preferences ("prefers concise answers", "uses Fedora Linux")
- profile facts ("works as a SOC analyst", "based in Tangerang")
- ongoing projects and their constraints
- long-running topics of interest

Do NOT extract:
- anything only true for this one exchange ("is currently debugging X")
- the assistant's own suggestions or explanations
- general knowledge that isn't about the user
- passwords, API keys, tokens, card numbers, or other credentials

Return a JSON array, nothing else. Return [] if nothing durable was learned —
that is the normal and expected result for most exchanges.

Format: [{"category":"preference|profile|project|topic|other","title":"short label","content":"the fact, one sentence"}]`;
}

export const MEMORY_EXTRACTION_JSON_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: ["preference", "profile", "project", "topic", "other"],
      },
      title: { type: "string" },
      content: { type: "string" },
    },
    required: ["category", "title", "content"],
  },
};
