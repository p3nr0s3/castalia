import { chunkDocument, rankChunksBM25 } from "./rag";
import type { ProjectFile } from "./types";

/**
 * Retrieval-quality measurement. The RAG stack has many tuned knobs (chunk size, BM25, RRF, reranking,
 * stitching); without a measurement, every change is a guess. Give it documents and questions with the
 * files that SHOULD answer them, and it reports how often and how high those files are retrieved.
 *
 * Metrics are computed at FILE level (the unit a user cares about: "did it find the right document?"):
 *  - recall@k: share of the relevant files found in the top k files, averaged over cases
 *  - MRR: mean of 1 / (rank of the first relevant file), 0 if none is retrieved
 *  - hit rate: share of cases with at least one relevant file in the top k
 */

export interface EvalFile {
  name: string;
  text: string;
}

export interface EvalCase {
  id: string;
  query: string;
  relevant: string[];
  /** Cases tagged "semantic" share no vocabulary with their answer; they are reported but can be excluded from gates. */
  tag?: string;
}

export interface CaseResult {
  id: string;
  query: string;
  tag?: string;
  relevant: string[];
  retrieved: string[];
  /** 1-based rank of the first relevant file, or null if none was retrieved. */
  firstHitRank: number | null;
  recallAtK: number;
  reciprocalRank: number;
}

export interface EvalSummary {
  cases: number;
  recallAtK: number;
  mrr: number;
  hitRate: number;
}

export interface EvalReport {
  k: number;
  results: CaseResult[];
  overall: EvalSummary;
  byTag: Record<string, EvalSummary>;
}

/** Returns file names, best first. Replace it to evaluate hybrid/semantic retrieval with real embeddings. */
export type Retriever = (query: string, k: number) => string[] | Promise<string[]>;

export function makeBm25Retriever(files: EvalFile[]): Retriever {
  const chunks = files.flatMap((f) =>
    chunkDocument({ id: f.name, name: f.name, size: f.text.length, type: "document", textContent: f.text, uploadedAt: 0 } as ProjectFile)
  );
  return (query, k) => {
    // Ask for more chunks than files wanted: several chunks of one file would otherwise crowd out the rest.
    const ranked = rankChunksBM25(chunks, query, Math.max(k * 4, 20));
    const seen: string[] = [];
    for (const c of ranked) if (!seen.includes(c.fileName)) seen.push(c.fileName);
    return seen.slice(0, k);
  };
}

function summarize(results: CaseResult[]): EvalSummary {
  const n = results.length;
  if (n === 0) return { cases: 0, recallAtK: 0, mrr: 0, hitRate: 0 };
  const avg = (f: (r: CaseResult) => number) => results.reduce((s, r) => s + f(r), 0) / n;
  return {
    cases: n,
    recallAtK: avg((r) => r.recallAtK),
    mrr: avg((r) => r.reciprocalRank),
    hitRate: avg((r) => (r.firstHitRank !== null ? 1 : 0)),
  };
}

export async function evaluateRetrieval(cases: EvalCase[], retrieve: Retriever, k = 5): Promise<EvalReport> {
  const results: CaseResult[] = [];
  for (const c of cases) {
    const retrieved = (await retrieve(c.query, k)).slice(0, k);
    const relevant = new Set(c.relevant);
    const found = retrieved.filter((f) => relevant.has(f));
    const idx = retrieved.findIndex((f) => relevant.has(f));
    results.push({
      id: c.id,
      query: c.query,
      tag: c.tag,
      relevant: c.relevant,
      retrieved,
      firstHitRank: idx === -1 ? null : idx + 1,
      recallAtK: relevant.size === 0 ? 0 : new Set(found).size / relevant.size,
      reciprocalRank: idx === -1 ? 0 : 1 / (idx + 1),
    });
  }
  const tags = [...new Set(results.map((r) => r.tag ?? "lexical"))];
  const byTag: Record<string, EvalSummary> = {};
  for (const t of tags) byTag[t] = summarize(results.filter((r) => (r.tag ?? "lexical") === t));
  return { k, results, overall: summarize(results), byTag };
}

export function formatReport(report: EvalReport): string {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const lines = [`RAG retrieval eval (k=${report.k})`, "─".repeat(72)];
  for (const r of report.results) {
    const mark = r.firstHitRank === 1 ? "✓" : r.firstHitRank ? "~" : "✗";
    lines.push(`${mark} ${r.id.padEnd(18)} rank=${String(r.firstHitRank ?? "-").padEnd(2)} [${r.tag ?? "lexical"}]  → ${r.retrieved.slice(0, 3).join(", ")}`);
  }
  lines.push("─".repeat(72));
  for (const [tag, s] of Object.entries(report.byTag)) {
    lines.push(`${tag.padEnd(9)} n=${String(s.cases).padEnd(3)} recall@${report.k}=${pct(s.recallAtK)}  MRR=${s.mrr.toFixed(2)}  hit=${pct(s.hitRate)}`);
  }
  return lines.join("\n");
}
