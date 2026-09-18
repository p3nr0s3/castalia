import { describe, it, expect } from "vitest";
import { reformulateSearchQuery } from "../lib/webSearchEngine";

function followup(prevAnswer: string, question: string, prevQuestion = "pertanyaan sebelumnya") {
  return reformulateSearchQuery(question, {
    previousQuery: prevQuestion,
    lastAssistantContent: prevAnswer,
  }).cleanQuery;
}

describe("multi-turn follow-up entity resolution", () => {
  it("resolves an ordinal against a numbered list of products", () => {
    const prev = "Tiga laptop terbaik: 1. ASUS Zenbook 14, 2. Lenovo Yoga 9i, 3. Dell XPS 13.";
    expect(followup(prev, "harga yang kedua berapa")).toContain("Lenovo Yoga 9i");
  });

  it("resolves an ordinal against a multi-line numbered list", () => {
    const prev = ["Rekomendasi framework:", "1. Next.js 15 — full-stack React", "2. Remix — web standards first", "3. SvelteKit — compiler based"].join("\n");
    expect(followup(prev, "kelebihan yang ketiga")).toContain("SvelteKit");
  });

  it("still resolves CVE identifiers, which outrank generic list extraction", () => {
    const prev = "Ada dua kerentanan: 1. CVE-2026-75604 dan 2. CVE-2026-11111.";
    const q = followup(prev, "jelaskan mitigasi yang pertama");
    expect(q).toContain("CVE-2026-75604");
    expect(q).not.toContain("CVE-2026-11111");
  });

  it("resolves bolded entities when the answer uses no numbered list", () => {
    const prev = "Kandidat utama adalah **Budi Santoso** dan **Siti Rahma**.";
    expect(followup(prev, "profil yang pertama")).toContain("Budi Santoso");
  });

  it("resolves bulleted entities as a last resort", () => {
    const prev = ["Opsi database:", "- PostgreSQL", "- MongoDB"].join("\n");
    expect(followup(prev, "kelebihan yang kedua")).toContain("MongoDB");
  });

  it("treats a bare 'tersebut' as referring to the answer's main subject", () => {
    const prev = "1. Kubernetes adalah orkestrator kontainer.";
    expect(followup(prev, "arsitektur tersebut bagaimana")).toContain("Kubernetes");
  });

  it("never leaks the anaphoric phrase itself into the search query", () => {
    const prev = "1. ASUS Zenbook 14, 2. Lenovo Yoga 9i.";
    const q = followup(prev, "harga yang kedua berapa");
    expect(q).not.toMatch(/\byang kedua\b/i);
    expect(q).not.toMatch(/\bkedua\b/i);
  });

  it("falls back to the cleaned previous question, not its raw conversational text", () => {
    // No extractable entity in the previous answer, so the previous
    // question supplies the subject — but it must be shell-peeled first.
    const prev = "Maaf, saya tidak menemukan informasi yang relevan.";
    const q = followup(prev, "kenapa tersebut", "tolong carikan dong info tentang inflasi Indonesia");
    expect(q).toContain("inflasi");
    expect(q).not.toMatch(/tolong|carikan|dong/i);
  });

  it("leaves a non-anaphoric question untouched by context resolution", () => {
    const prev = "1. ASUS Zenbook 14, 2. Lenovo Yoga 9i.";
    const q = followup(prev, "harga emas hari ini");
    expect(q).not.toContain("ASUS");
    expect(q).toContain("emas");
  });

  it("ignores an out-of-range ordinal rather than picking the wrong item", () => {
    // Only two items exist; asking for the third should fall back to the
    // main subject instead of silently returning undefined or crashing.
    const prev = "1. PostgreSQL, 2. MongoDB.";
    const q = followup(prev, "kelebihan yang ketiga");
    expect(q).toContain("PostgreSQL");
  });
});
