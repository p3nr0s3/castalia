import { describe, it, expect, beforeEach } from "vitest";
import {
  computePromptCacheKey,
  getCachedPromptResponse,
  setCachedPromptResponse,
  clearPromptCache,
} from "../lib/responseCache";

describe("responseCache", () => {
  beforeEach(() => {
    clearPromptCache();
  });

  it("produces deterministic keys for identical parameters", () => {
    const key1 = computePromptCacheKey({
      model: "llama3.1",
      prompt: "Explain quantum computing in simple terms",
      systemPrompt: "You are a helpful assistant.",
      temperature: 0.7,
      topP: 0.9,
      numCtx: 16384,
    });

    const key2 = computePromptCacheKey({
      model: "llama3.1",
      prompt: "Explain quantum computing in simple terms",
      systemPrompt: "You are a helpful assistant.",
      temperature: 0.7,
      topP: 0.9,
      numCtx: 16384,
    });

    expect(key1).toBe(key2);
  });

  it("produces different keys when temperature or system prompt changes (cache invalidation)", () => {
    const baseKey = computePromptCacheKey({
      model: "llama3.1",
      prompt: "Explain quantum computing in simple terms",
      systemPrompt: "You are a helpful assistant.",
      temperature: 0.7,
    });

    const differentTempKey = computePromptCacheKey({
      model: "llama3.1",
      prompt: "Explain quantum computing in simple terms",
      systemPrompt: "You are a helpful assistant.",
      temperature: 0.2, // Changed temperature
    });

    const differentSystemKey = computePromptCacheKey({
      model: "llama3.1",
      prompt: "Explain quantum computing in simple terms",
      systemPrompt: "You are a strict physics professor.", // Changed system prompt
      temperature: 0.7,
    });

    expect(baseKey).not.toBe(differentTempKey);
    expect(baseKey).not.toBe(differentSystemKey);
  });

  it("stores, retrieves, and clears cached responses", () => {
    const key = computePromptCacheKey({
      model: "qwen2.5",
      prompt: "Write a hello world in Rust",
    });

    expect(getCachedPromptResponse(key)).toBeNull();

    setCachedPromptResponse(key, {
      content: "fn main() { println!(\"Hello, world!\"); }",
      reasoning: "Simple hello world",
    });

    const cached = getCachedPromptResponse(key);
    expect(cached).not.toBeNull();
    expect(cached?.content).toContain("Hello, world!");
    expect(cached?.reasoning).toBe("Simple hello world");

    clearPromptCache();
    expect(getCachedPromptResponse(key)).toBeNull();
  });
});
