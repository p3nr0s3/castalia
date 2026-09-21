import { describe, it, expect } from "vitest";
import { MEMORY_EXTRACTION_JSON_SCHEMA } from "../lib/memoryExtractor";
import { buildToolDirectivePrompt, getNativeOllamaTools } from "../lib/tools";
import { detectModelProvider } from "../lib/ollama";

describe("Batch 1: Structured Outputs & Prompt Deduplication", () => {
  it("exports a valid JSON Schema for memory extraction", () => {
    expect(MEMORY_EXTRACTION_JSON_SCHEMA).toBeDefined();
    expect(MEMORY_EXTRACTION_JSON_SCHEMA.type).toBe("array");
    expect(MEMORY_EXTRACTION_JSON_SCHEMA.items).toBeDefined();
    expect(MEMORY_EXTRACTION_JSON_SCHEMA.items.type).toBe("object");
    expect(MEMORY_EXTRACTION_JSON_SCHEMA.items.required).toEqual(["category", "title", "content"]);
  });

  it("produces clean native tools schema without directive prompt formatting", () => {
    const nativeTools = getNativeOllamaTools();
    expect(Array.isArray(nativeTools)).toBe(true);
    expect(nativeTools.length).toBeGreaterThan(0);
    const readFileTool = nativeTools.find((t) => t.function.name === "read_file");
    expect(readFileTool).toBeDefined();
    expect(readFileTool?.function.parameters.type).toBe("object");
    expect(readFileTool?.function.parameters.required).toContain("path");
  });

  it("detects model provider correctly for native tool vs directive routing", () => {
    expect(detectModelProvider("llama3.1:8b")).toBe("ollama");
    expect(detectModelProvider("qwen2.5:7b")).toBe("ollama");
    expect(detectModelProvider("mistral:7b")).toBe("ollama");
    expect(detectModelProvider("deepseek-chat")).toBe("deepseek");
    expect(detectModelProvider("gemini-2.5-flash")).toBe("gemini");
    expect(detectModelProvider("gpt-4o")).toBe("openai");
    expect(detectModelProvider("claude-3-5-sonnet")).toBe("anthropic");
  });

  it("ensures buildToolDirectivePrompt produces valid fallback instructions", () => {
    const directive = buildToolDirectivePrompt();
    expect(directive).toContain("[TOOL_CALL:");
    expect(directive).toContain("read_file");
    expect(directive).toContain("write_file");
  });
});
