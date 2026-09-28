import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkLayaHealth,
  predictWithLaya,
  classifyTaskProfileWithLaya,
  classifyWithLayaSafely,
  evaluateToolSafetyWithLaya,
  DEFAULT_LAYA_ENDPOINT,
} from "../lib/layaClient";
import { resolveAdaptiveSamplingParams } from "../lib/adaptiveSampling";

describe("Laya System-1 Decision Engine Integration", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("checkLayaHealth", () => {
    it("returns online: true and measured latency when server responds ok", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ answers: { test: { type: "noul", noul: 1.0 } } }),
      } as any);

      const health = await checkLayaHealth(DEFAULT_LAYA_ENDPOINT, 500);
      expect(health.online).toBe(true);
      expect(typeof health.latencyMs).toBe("number");
      expect(health.error).toBeUndefined();
    });

    it("returns online: false with error message when server responds with 500", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      } as any);

      const health = await checkLayaHealth(DEFAULT_LAYA_ENDPOINT, 500);
      expect(health.online).toBe(false);
      expect(health.error).toContain("503");
    });

    it("returns online: false when connection is refused or throws network error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

      const health = await checkLayaHealth(DEFAULT_LAYA_ENDPOINT, 500);
      expect(health.online).toBe(false);
      expect(health.error).toBe("ECONNREFUSED");
    });
  });

  describe("predictWithLaya", () => {
    it("successfully sends typed questions to /predict and parses response", async () => {
      const mockResponse = {
        model: "multilingual",
        latency_ms: 28.5,
        answers: {
          profile: {
            type: "choice",
            choice: "coding",
            confidence: 0.94,
          },
          deep_reasoning: {
            type: "noul",
            noul: 0.85,
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as any);

      const res = await predictWithLaya({
        state: "Tolong buatkan fungsi TypeScript untuk parse JSON",
        questions: {
          profile: {
            type: "choice",
            instructions: "Identify task profile",
            criteria: { coding: "Code and programming" },
          },
        },
      });

      expect(res).not.toBeNull();
      expect(res?.answers.profile.type).toBe("choice");
      if (res?.answers.profile.type === "choice") {
        expect(res.answers.profile.choice).toBe("coding");
        expect(res.answers.profile.confidence).toBe(0.94);
      }
    });

    it("gracefully returns null without throwing when server fails or times out", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

      const res = await predictWithLaya({
        state: "test prompt",
        questions: {},
      });

      expect(res).toBeNull();
    });
  });

  describe("classifyTaskProfileWithLaya", () => {
    it("returns null for empty or whitespace prompts", async () => {
      const res = await classifyTaskProfileWithLaya("   ");
      expect(res).toBeNull();
    });

    it("classifies coding task and triggers deep reasoning recommendations", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          model: "multilingual",
          answers: {
            profile: {
              type: "choice",
              choice: "coding",
              confidence: 0.96,
            },
            deep_reasoning: {
              type: "noul",
              noul: 0.88,
            },
          },
        }),
      } as any);

      const decision = await classifyTaskProfileWithLaya("Buatkan algoritma Dijkstra dan buktikan time complexity-nya");
      expect(decision).not.toBeNull();
      expect(decision?.profile).toBe("coding");
      expect(decision?.confidence).toBe(0.96);
      expect(decision?.needsDeepReasoning).toBe(true);
      expect(typeof decision?.latencyMs).toBe("number");
    });

    it("classifies creative task without deep reasoning", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          model: "multilingual",
          answers: {
            profile: {
              type: "choice",
              choice: "creative",
              confidence: 0.91,
            },
            deep_reasoning: {
              type: "noul",
              noul: 0.15,
            },
          },
        }),
      } as any);

      const decision = await classifyTaskProfileWithLaya("Tuliskan puisi pendek tentang senja di pantai");
      expect(decision).not.toBeNull();
      expect(decision?.profile).toBe("creative");
      expect(decision?.confidence).toBe(0.91);
      expect(decision?.needsDeepReasoning).toBe(false);
    });

    it("gracefully returns null on connection failure", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      const decision = await classifyTaskProfileWithLaya("Halo, apa kabar?");
      expect(decision).toBeNull();
    });
  });

  describe("classifyWithLayaSafely (extracted from the 3 duplicated app/page.tsx call sites)", () => {
    it("returns null immediately without calling fetch when layaEnabled is false", async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as any;

      const result = await classifyWithLayaSafely("Buatkan fungsi fibonacci", { layaEnabled: false });

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns null when layaEnabled is undefined (same default as settings.layaEnabled)", async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as any;

      const result = await classifyWithLayaSafely("Buatkan fungsi fibonacci", {});

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("calls classifyTaskProfileWithLaya with endpoint/timeout from settings when enabled", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          model: "multilingual",
          answers: {
            profile: { type: "choice", choice: "coding", confidence: 0.9 },
            deep_reasoning: { type: "noul", noul: 0.8 },
          },
        }),
      }) as any;

      const result = await classifyWithLayaSafely("Buatkan fungsi fibonacci", {
        layaEnabled: true,
        layaEndpoint: "http://localhost:9999",
        layaTimeoutMs: 500,
      });

      expect(result?.profile).toBe("coding");
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("http://localhost:9999"),
        expect.anything()
      );
    });

    it("swallows a thrown error and returns null instead of propagating (the exact behavior all 3 duplicated call sites relied on)", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(
        classifyWithLayaSafely("test", { layaEnabled: true })
      ).resolves.toBeNull();
    });
  });

  describe("evaluateToolSafetyWithLaya", () => {
    it("flags destructive delete_file operation as dangerous with high risk score", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          model: "multilingual",
          answers: {
            is_destructive: {
              type: "noul",
              noul: 0.95,
            },
            risk_level: {
              type: "score",
              score: 2.8,
            },
          },
        }),
      } as any);

      const safety = await evaluateToolSafetyWithLaya("delete_file", { path: "critical_system_file.env" });
      expect(safety).not.toBeNull();
      expect(safety?.isDangerous).toBe(true);
      expect(safety?.riskScore).toBe(0.95);
      expect(safety?.reason).toContain("95%");
    });

    it("evaluates safe read operation as non-dangerous", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          model: "multilingual",
          answers: {
            is_destructive: {
              type: "noul",
              noul: 0.05,
            },
            risk_level: {
              type: "score",
              score: 0.1,
            },
          },
        }),
      } as any);

      const safety = await evaluateToolSafetyWithLaya("read_file", { path: "README.md" });
      expect(safety).not.toBeNull();
      expect(safety?.isDangerous).toBe(false);
      expect(safety?.riskScore).toBe(0.05);
    });

    it("returns null safely on offline server", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Timeout"));

      const safety = await evaluateToolSafetyWithLaya("write_file", { path: "test.txt" });
      expect(safety).toBeNull();
    });
  });

  describe("Adaptive Sampling integration with Laya Profile Override", () => {
    it("uses Laya profile and reason when layaProfileOverride is provided", () => {
      const params = resolveAdaptiveSamplingParams({
        userPrompt: "Halo, tolong beri saya nasihat hidup",
        layaProfileOverride: "creative",
        layaReason: "Laya System-1 (creative, 94% conf)",
      });

      expect(params.profile).toBe("creative");
      expect(params.temperature).toBe(0.85); // Creative preset
      expect(params.topP).toBe(0.95);
      expect(params.reason).toBe("Laya System-1 (creative, 94% conf)");
    });

    it("falls back to heuristic detectSamplingProfile when layaProfileOverride is undefined", () => {
      const params = resolveAdaptiveSamplingParams({
        userPrompt: "```typescript\nconst x = 10;\n```",
      });

      expect(params.profile).toBe("coding");
      expect(params.temperature).toBe(0.2); // Coding preset
      expect(params.reason).toContain("Code/syntax tokens detected");
    });

    it("strictly preserves explicit user temperature even if Laya recommends a profile", () => {
      const params = resolveAdaptiveSamplingParams({
        userPrompt: "Tolong tuliskan puisi",
        explicitTemperature: 0.1,
        layaProfileOverride: "creative",
      });

      expect(params.temperature).toBe(0.1);
      expect(params.reason).toBe("Manual user temperature override");
    });
  });
});
