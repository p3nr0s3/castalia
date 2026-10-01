import type { Conversation } from "./types";

/**
 * Full-text search over chat history. Pure helpers shared by the SQLite FTS5 path in
 * lib/serverDb.ts (searchHistory) and the JSON-backend fallback, so both return the same shape
 * and follow the same matching rules: every term must match (as a word PREFIX) within ONE message
 * (conversation title counts as part of each of its messages), case- and accent-insensitive.
 */

export interface HistoryHit {
  conversationId: string;
  title: string;
  messageId: string;
  role: string;
  /** Plain text excerpt; matches are wrapped in [[ ]] (the UI turns those into <mark>, never raw HTML). */
  snippet: string;
  updatedAt: number;
}

const MAX_TERMS = 8;
/** Longest message body that gets indexed. Keeps one pasted log file from dominating the index. */
export const MAX_INDEXED_CHARS = 50_000;

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function tokenizeQuery(q: string): string[] {
  return fold(q)
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean)
    .slice(0, MAX_TERMS);
}

/**
 * FTS5 MATCH expression for a free-text query. Every term is a quoted prefix token ("term"*), so user
 * input can never be interpreted as FTS syntax (NEAR, column filters, AND/OR, unbalanced quotes…),
 * which is what makes a raw `MATCH ?` with user text throw.
 */
export function buildFtsQuery(q: string): string | null {
  const terms = tokenizeQuery(q);
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(" ");
}

export function makeSnippet(text: string, terms: string[], radius = 70): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const lower = fold(flat);
  // fold() can change string length for decomposed characters; bail to the plain start if it did.
  const aligned = lower.length === flat.length;
  let first = -1;
  if (aligned) for (const t of terms) { const i = lower.indexOf(t); if (i !== -1 && (first === -1 || i < first)) first = i; }
  const start = Math.max(0, (first === -1 ? 0 : first) - radius);
  const end = Math.min(flat.length, (first === -1 ? 0 : first) + radius * 2);
  let out = flat.slice(start, end);
  if (aligned && terms.length) {
    const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "giu");
    out = out.replace(re, "[[$1]]");
  }
  return `${start > 0 ? "…" : ""}${out}${end < flat.length ? "…" : ""}`;
}

function rowMatches(haystackFolded: string, terms: string[]): boolean {
  // word-prefix match, like FTS5 "term"*
  return terms.every((t) => new RegExp(`(^|[^\\p{L}\\p{N}_])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").test(haystackFolded));
}

/** Fallback search (JSON backend). Best message per conversation, newest conversations first on ties. */
export function searchConversationsJs(conversations: Conversation[], q: string, limit = 30): HistoryHit[] {
  const terms = tokenizeQuery(q);
  if (terms.length === 0) return [];
  const hits: (HistoryHit & { score: number })[] = [];
  for (const conv of conversations) {
    const title = conv.title || "";
    let best: (HistoryHit & { score: number }) | null = null;
    for (const msg of conv.messages || []) {
      const content = (msg.content || "").slice(0, MAX_INDEXED_CHARS);
      if (!content) continue;
      const hay = fold(`${title} ${content}`);
      if (!rowMatches(hay, terms)) continue;
      const titleHits = terms.filter((t) => fold(title).includes(t)).length;
      const occurrences = terms.reduce((n, t) => n + (hay.split(t).length - 1), 0);
      const score = titleHits * 5 + occurrences;
      if (!best || score > best.score) {
        best = { conversationId: conv.id, title, messageId: msg.id, role: msg.role, snippet: makeSnippet(content, terms), updatedAt: conv.updatedAt || 0, score };
      }
    }
    if (best) hits.push(best);
  }
  hits.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);
  return hits.slice(0, limit).map(({ score: _score, ...h }) => h);
}

/** Splits a snippet containing [[match]] markers into plain segments (rendered with <mark>, never as HTML). */
export function parseSnippet(snippet: string): { text: string; match: boolean }[] {
  const out: { text: string; match: boolean }[] = [];
  const re = /\[\[([\s\S]*?)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(snippet))) {
    if (m.index > last) out.push({ text: snippet.slice(last, m.index), match: false });
    out.push({ text: m[1], match: true });
    last = m.index + m[0].length;
  }
  if (last < snippet.length) out.push({ text: snippet.slice(last), match: false });
  return out;
}
