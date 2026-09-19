import { describe, it, expect } from "vitest";
import { evaluateVramPressure, OllamaRunningModel } from "../lib/ollama";

// evaluateVramPressure is deliberately pure (no fetch inside it) so these
// tests never need to mock network or a real Ollama instance — see
// lib/ollama.ts's comment on why this only reports on an ALREADY-RUNNING
// model (size vs size_vram from /api/ps) rather than predicting whether an
// unloaded model would fit; Ollama has no endpoint for the latter.

function runningModel(overrides: Partial<OllamaRunningModel> = {}): OllamaRunningModel {
  return {
    model: "llama3.1:8b",
    size: 8_000_000_000,
    size_vram: 8_000_000_000,
    ...overrides,
  };
}

describe("evaluateVramPressure", () => {
  it("returns not-constrained when the whole model fit in VRAM", () => {
    const result = evaluateVramPressure([runningModel()], "llama3.1:8b");
    expect(result).not.toBeNull();
    expect(result!.constrained).toBe(false);
    expect(result!.vramRatio).toBe(1);
  });

  it("flags constrained when a meaningful chunk spilled to CPU/system RAM", () => {
    const result = evaluateVramPressure(
      [runningModel({ size: 10_000_000_000, size_vram: 6_000_000_000 })],
      "llama3.1:8b"
    );
    expect(result).not.toBeNull();
    expect(result!.constrained).toBe(true);
    expect(result!.vramRatio).toBeCloseTo(0.6, 5);
  });

  it("does not flag a small rounding sliver as constrained (ratio just under 1.0)", () => {
    const result = evaluateVramPressure(
      [runningModel({ size: 10_000_000_000, size_vram: 9_900_000_000 })],
      "llama3.1:8b"
    );
    expect(result!.constrained).toBe(false);
  });

  it("matches by the model's `name` field too, not only `model`", () => {
    const result = evaluateVramPressure(
      [runningModel({ model: "llama3.1:8b", name: "llama3.1:8b-instruct-q4" })],
      "llama3.1:8b-instruct-q4"
    );
    expect(result).not.toBeNull();
  });

  it("returns null when the requested model isn't in the running list at all", () => {
    const result = evaluateVramPressure([runningModel()], "some-other-model:70b");
    expect(result).toBeNull();
  });

  it("returns null on an empty running-models list (e.g. /api/ps fetch failed)", () => {
    expect(evaluateVramPressure([], "llama3.1:8b")).toBeNull();
  });

  it("returns null rather than dividing by zero when size is 0/missing", () => {
    const result = evaluateVramPressure([runningModel({ size: 0 })], "llama3.1:8b");
    expect(result).toBeNull();
  });
});
