import { describe, it, expect } from "vitest";
import { ReasoningStreamParser } from "../lib/reasoningParser";

describe("ReasoningStreamParser", () => {
  it("passes normal tokens without think tags directly to onToken", () => {
    const parser = new ReasoningStreamParser();
    let tokens = "";
    let reasoning = "";

    parser.processChunk("Hello, ", {
      onToken: (t) => (tokens += t),
      onReasoning: (r) => (reasoning += r),
    });
    parser.processChunk("how are you?", {
      onToken: (t) => (tokens += t),
      onReasoning: (r) => (reasoning += r),
    });
    parser.flush({
      onToken: (t) => (tokens += t),
      onReasoning: (r) => (reasoning += r),
    });

    expect(tokens).toBe("Hello, how are you?");
    expect(reasoning).toBe("");
    expect(parser.isInThink()).toBe(false);
  });

  it("extracts complete think block into onReasoning and separates answer into onToken", () => {
    const parser = new ReasoningStreamParser();
    let tokens = "";
    let reasoning = "";

    parser.processChunk("<think>Analyzing user question...\nChecking database...</think>\nThe answer is 42.", {
      onToken: (t) => (tokens += t),
      onReasoning: (r) => (reasoning += r),
    });
    parser.flush({
      onToken: (t) => (tokens += t),
      onReasoning: (r) => (reasoning += r),
    });

    expect(reasoning).toBe("Analyzing user question...\nChecking database...");
    expect(tokens).toBe("The answer is 42.");
    expect(parser.isInThink()).toBe(false);
  });

  it("handles think opening tag split across chunks", () => {
    const parser = new ReasoningStreamParser();
    let tokens = "";
    let reasoning = "";

    parser.processChunk("<th", {
      onToken: (t) => (tokens += t),
      onReasoning: (r) => (reasoning += r),
    });
    expect(tokens).toBe("");
    expect(reasoning).toBe("");

    parser.processChunk("ink>Internal thought here", {
      onToken: (t) => (tokens += t),
      onReasoning: (r) => (reasoning += r),
    });
    expect(parser.isInThink()).toBe(true);
    expect(reasoning).toBe("Internal thought here");

    parser.processChunk("</think>Final result", {
      onToken: (t) => (tokens += t),
      onReasoning: (r) => (reasoning += r),
    });
    parser.flush({
      onToken: (t) => (tokens += t),
      onReasoning: (r) => (reasoning += r),
    });

    expect(tokens).toBe("Final result");
    expect(reasoning).toBe("Internal thought here");
  });

  it("handles think closing tag split across chunks", () => {
    const parser = new ReasoningStreamParser();
    let tokens = "";
    let reasoning = "";

    parser.processChunk("<think>Thought process</th", {
      onToken: (t) => (tokens += t),
      onReasoning: (r) => (reasoning += r),
    });
    expect(reasoning).toBe("Thought process");
    expect(tokens).toBe("");

    parser.processChunk("ink>\nOutput response", {
      onToken: (t) => (tokens += t),
      onReasoning: (r) => (reasoning += r),
    });
    parser.flush({
      onToken: (t) => (tokens += t),
      onReasoning: (r) => (reasoning += r),
    });

    expect(reasoning).toBe("Thought process");
    expect(tokens).toBe("Output response");
  });

  it("correctly handles '<' that is NOT part of a think tag without losing text", () => {
    const parser = new ReasoningStreamParser();
    let tokens = "";
    let reasoning = "";

    parser.processChunk("For any x <", {
      onToken: (t) => (tokens += t),
      onReasoning: (r) => (reasoning += r),
    });
    parser.processChunk(" 10, calculate y.", {
      onToken: (t) => (tokens += t),
      onReasoning: (r) => (reasoning += r),
    });
    parser.flush({
      onToken: (t) => (tokens += t),
      onReasoning: (r) => (reasoning += r),
    });

    expect(tokens).toBe("For any x < 10, calculate y.");
    expect(reasoning).toBe("");
  });
});
