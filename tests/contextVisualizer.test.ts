import { describe, it, expect } from "vitest";
import { calculateContextBreakdown, formatTokenCount } from "../lib/contextVisualizer";
import { DEFAULT_SETTINGS } from "../lib/constants";
import { Conversation, Project } from "../lib/types";

describe("contextVisualizer", () => {
  it("calculates basic context breakdown with empty conversation", () => {
    const breakdown = calculateContextBreakdown({
      conversation: null,
      settings: DEFAULT_SETTINGS,
      currentInput: "",
    });

    expect(breakdown.totalMaxTokens).toBe(16384);
    expect(breakdown.historyTokens).toBe(0);
    expect(breakdown.ragTokens).toBe(0);
    expect(breakdown.inputTokens).toBe(0);
    expect(breakdown.systemPromptTokens).toBeGreaterThan(0);
    expect(breakdown.totalUsedTokens).toBe(breakdown.systemPromptTokens);
    expect(breakdown.remainingTokens).toBe(16384 - breakdown.systemPromptTokens);
    expect(breakdown.usagePercentage).toBeLessThan(10);
    expect(breakdown.isNearOverflow).toBe(false);
  });

  it("calculates history tokens and trims when history exceeds budget", () => {
    const longMessage = "This is a detailed test message for history context. ".repeat(100);
    const messages = Array.from({ length: 15 }, (_, i) => ({
      id: `msg_${i}`,
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: longMessage,
      timestamp: Date.now(),
    }));

    const mockConv: Conversation = {
      id: "conv_1",
      title: "Test Conversation",
      model: "gemma4",
      numCtx: 8192,
      messages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const breakdown = calculateContextBreakdown({
      conversation: mockConv,
      settings: DEFAULT_SETTINGS,
      currentInput: "What is next?",
    });

    expect(breakdown.totalMaxTokens).toBe(8192);
    // History budget is max(2000, 8192 * 0.45) = 3686
    expect(breakdown.historyBudget).toBe(3686);
    expect(breakdown.historyWasTrimmed).toBe(true);
    expect(breakdown.historyTokens).toBe(3686);
    expect(breakdown.inputTokens).toBeGreaterThan(0);
    expect(breakdown.totalUsedTokens).toBeGreaterThan(3686);
  });

  it("calculates RAG knowledge tokens from project files", () => {
    const mockProject: Project = {
      id: "proj_1",
      name: "Test Project",
      systemPrompt: "Project specialized instructions.",
      files: [
        {
          id: "f1",
          name: "guide.md",
          size: 1000,
          type: "document",
          textContent: "Important architecture notes for project knowledge. ".repeat(20),
          uploadedAt: Date.now(),
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const breakdown = calculateContextBreakdown({
      conversation: null,
      project: mockProject,
      settings: DEFAULT_SETTINGS,
      currentInput: "",
    });

    expect(breakdown.ragTokens).toBeGreaterThan(0);
    expect(breakdown.totalUsedTokens).toBe(breakdown.systemPromptTokens + breakdown.ragTokens);
  });

  it("formats token counts properly with K suffix", () => {
    expect(formatTokenCount(500)).toBe("500");
    expect(formatTokenCount(1000)).toBe("1K");
    expect(formatTokenCount(1500)).toBe("1.5K");
    expect(formatTokenCount(16384)).toBe("16.4K");
    expect(formatTokenCount(32768)).toBe("32.8K");
  });
});
