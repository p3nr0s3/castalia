import { describe, it, expect } from "vitest";
import { getFamilyStopTokens } from "../lib/ollama";
import { DEFAULT_SETTINGS } from "../lib/constants";
import { countTokens } from "../lib/tokenizer";

describe("Batch 3: Inference Stability, Stop Sequences & Sampling", () => {
  describe("getFamilyStopTokens", () => {
    it("returns Llama 3 header and eot stop tokens for Llama 3 models", () => {
      const stops = getFamilyStopTokens("llama-3.2-3b-instruct");
      expect(stops).toContain("<|eot_id|>");
      expect(stops).toContain("<|start_header_id|>");
      expect(stops).toContain("<|end_header_id|>");
      expect(stops).toContain("\nUser:");
    });

    it("returns ChatML and Qwen stop tokens for Qwen models", () => {
      const stops = getFamilyStopTokens("qwen2.5:7b");
      expect(stops).toContain("<|im_end|>");
      expect(stops).toContain("<|im_start|>");
      expect(stops).toContain("\nUser:");
    });

    it("returns DeepSeek specific sentence tokens for DeepSeek models", () => {
      const stops = getFamilyStopTokens("deepseek-r1:14b");
      expect(stops).toContain("<｜end of sentence｜>");
      expect(stops).toContain("<｜User｜>");
      expect(stops).toContain("\nUser:");
    });

    it("returns Gemma turn tokens for Gemma models", () => {
      const stops = getFamilyStopTokens("gemma-2-9b");
      expect(stops).toContain("<end_of_turn>");
      expect(stops).toContain("<start_of_turn>");
      expect(stops).toContain("\nUser:");
    });

    it("returns general user/human turns for unknown models", () => {
      const stops = getFamilyStopTokens("custom-finance-model");
      expect(stops).toContain("\nUser:");
      expect(stops).toContain("\nHuman:");
    });
  });

  describe("min_p sampling configuration", () => {
    it("has minP configured in DEFAULT_SETTINGS as 0.05", () => {
      expect(DEFAULT_SETTINGS.minP).toBe(0.05);
    });
  });

  describe("num_keep KV cache pinning", () => {
    it("accurately computes token count for static system prompt pinning", () => {
      const prompt = "You are a specialized software engineer assistant.";
      const tokens = countTokens(prompt);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(50);
    });
  });
});
