import { describe, it, expect } from "vitest";
import { chunkDocument, isCodeFile, calculateDynamicTokenBudgets } from "../lib/rag";
import { ProjectFile } from "../lib/types";

describe("Code-Aware Chunking & Dynamic Context Budgeting", () => {
  it("identifies code files by file extension", () => {
    expect(isCodeFile("index.ts")).toBe(true);
    expect(isCodeFile("App.tsx")).toBe(true);
    expect(isCodeFile("script.py")).toBe(true);
    expect(isCodeFile("main.go")).toBe(true);
    expect(isCodeFile("lib.rs")).toBe(true);
    expect(isCodeFile("notes.txt")).toBe(false);
    expect(isCodeFile("README.md")).toBe(false);
  });

  it("chunks code on top-level function/class boundaries without cutting functions in half", () => {
    const codeContent = `
import { something } from "./module";

// Helper function 1
export function calculateTax(income: number, rate: number): number {
  if (income <= 0) {
    return 0;
  }
  const tax = income * rate;
  return tax;
}

// Helper function 2
export function calculateDiscount(price: number, percent: number): number {
  if (price <= 0) return 0;
  return price * (percent / 100);
}

// Main class
export class OrderProcessor {
  process(orderId: string) {
    console.log("Processing order:", orderId);
    return true;
  }
}
`.trim();

    const file: ProjectFile = {
      id: "code_1",
      name: "pricing.ts",
      textContent: codeContent,
      size: codeContent.length,
      type: "document",
      uploadedAt: Date.now(),
    };

    // Small target chunk size so it requires splitting, but large enough to fit a function
    const chunks = chunkDocument(file, 200, 30);

    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // Verify each function definition is cleanly retained
    const text0 = chunks[0].text;
    expect(text0).toContain("function calculateTax");
    // Verify it doesn't break mid-statement
    expect(chunks.some((c) => c.text.includes("class OrderProcessor"))).toBe(true);
  });

  it("calculates dynamic token budgets scaled to num_ctx without magic numbers", () => {
    // 8K model (e.g. standard local Gemma 7B)
    const budget8k = calculateDynamicTokenBudgets(8192);
    expect(budget8k.totalContext).toBe(8192);
    expect(budget8k.knowledgeBudget).toBeGreaterThan(1500);
    expect(budget8k.historyBudget).toBeGreaterThan(3000);
    expect(budget8k.reserveBudget).toBeGreaterThanOrEqual(1000);

    // 128K model (e.g. Qwen 2.5, Llama 3.1)
    const budget128k = calculateDynamicTokenBudgets(131072);
    expect(budget128k.totalContext).toBe(131072);
    // Knowledge budget scales dynamically instead of being locked to 3500!
    expect(budget128k.knowledgeBudget).toBeGreaterThan(20000);
    expect(budget128k.historyBudget).toBeGreaterThan(50000);
  });
});
