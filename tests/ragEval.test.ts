import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { evaluateRetrieval, formatReport, makeBm25Retriever, type EvalCase, type EvalFile } from "../lib/ragEval";

const ROOT = path.join(__dirname, "..", "evals", "rag");
const corpus: EvalFile[] = fs
  .readdirSync(path.join(ROOT, "corpus"))
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((name) => ({ name, text: fs.readFileSync(path.join(ROOT, "corpus", name), "utf-8") }));
const golden = JSON.parse(fs.readFileSync(path.join(ROOT, "golden.json"), "utf-8")) as { cases: EvalCase[]; thresholds: { k: number; recallAtK: number; mrr: number } };

describe("metrics (injected retriever)", () => {
  const cases: EvalCase[] = [
    { id: "a", query: "qa", relevant: ["x.md"] },
    { id: "b", query: "qb", relevant: ["y.md", "z.md"] },
    { id: "c", query: "qc", relevant: ["w.md"], tag: "semantic" },
  ];
  const answers: Record<string, string[]> = { qa: ["x.md", "p.md"], qb: ["p.md", "z.md", "q.md"], qc: ["p.md", "q.md"] };

  it("computes recall@k, reciprocal rank and hit rate per case", async () => {
    const r = await evaluateRetrieval(cases, (q) => answers[q], 3);
    expect(r.results.map((x) => [x.firstHitRank, x.recallAtK, x.reciprocalRank])).toEqual([[1, 1, 1], [2, 0.5, 0.5], [null, 0, 0]]);
    expect(r.overall.mrr).toBeCloseTo((1 + 0.5 + 0) / 3, 6);
    expect(r.overall.recallAtK).toBeCloseTo((1 + 0.5 + 0) / 3, 6);
    expect(r.overall.hitRate).toBeCloseTo(2 / 3, 6);
  });

  it("only looks at the top k and splits results by tag", async () => {
    const r = await evaluateRetrieval(cases, (q) => answers[q], 1);
    expect(r.results[1].firstHitRank).toBeNull(); // z.md is at rank 2, outside k=1
    expect(Object.keys(r.byTag).sort()).toEqual(["lexical", "semantic"]);
    expect(r.byTag.semantic.cases).toBe(1);
  });

  it("handles no cases and a case with no relevant files", async () => {
    expect((await evaluateRetrieval([], () => [])).overall).toEqual({ cases: 0, recallAtK: 0, mrr: 0, hitRate: 0 });
    expect((await evaluateRetrieval([{ id: "e", query: "q", relevant: [] }], () => ["a"])).results[0].recallAtK).toBe(0);
  });

  it("formats a readable report", async () => {
    const out = formatReport(await evaluateRetrieval(cases, (q) => answers[q], 3));
    expect(out).toContain("RAG retrieval eval (k=3)");
    expect(out).toMatch(/✓ a/);
    expect(out).toMatch(/✗ c/);
  });
});

describe("golden set: BM25 retrieval quality gate", () => {
  it("has a corpus and cases that reference files that exist", () => {
    const names = new Set(corpus.map((f) => f.name));
    expect(corpus.length).toBeGreaterThanOrEqual(8);
    for (const c of golden.cases) for (const f of c.relevant) expect(names.has(f), `${c.id} → ${f}`).toBe(true);
  });

  it("meets the recall and MRR thresholds on the lexical cases", async () => {
    const report = await evaluateRetrieval(golden.cases, makeBm25Retriever(corpus), golden.thresholds.k);
    if (process.env.RAG_EVAL_VERBOSE) console.log("\n" + formatReport(report));
    const lexical = report.byTag.lexical;
    expect(lexical.recallAtK, "recall@k regressed — run `npm run eval:rag` to see which cases").toBeGreaterThanOrEqual(golden.thresholds.recallAtK);
    expect(lexical.mrr, "MRR regressed — run `npm run eval:rag` to see which cases").toBeGreaterThanOrEqual(golden.thresholds.mrr);
  });

  it("does not gate on the semantic cases, but still measures them (BM25 alone is expected to be weaker there)", async () => {
    const report = await evaluateRetrieval(golden.cases, makeBm25Retriever(corpus), golden.thresholds.k);
    expect(report.byTag.semantic.cases).toBeGreaterThanOrEqual(3);
    expect(report.byTag.semantic.mrr).toBeLessThanOrEqual(report.byTag.lexical.mrr);
  });
});
