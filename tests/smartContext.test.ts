import { describe, it, expect } from "vitest";
import { trimChatHistoryForBudget, formatUserEphemeralContext } from "../lib/rag";
import { Message } from "../lib/types";

describe("Smart Context: Context Shifting & Trimming", () => {
  it("returns all messages when total tokens fit within budget", () => {
    const messages: Message[] = [
      { id: "1", role: "user", content: "Hello", timestamp: 1 },
      { id: "2", role: "assistant", content: "Hi there!", timestamp: 2 },
    ];

    const result = trimChatHistoryForBudget(messages, 4000);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("1");
    expect(result[1].id).toBe("2");
  });

  it("preserves initial Anchor (Turn 0) and Tail Window when conversation overflows", () => {
    const messages: Message[] = [
      {
        id: "msg_anchor_user",
        role: "user",
        content: "CRITICAL SYSTEM INSTRUCTION: You are building a secure Next.js e-commerce app in TypeScript.",
        timestamp: 100,
      },
      {
        id: "msg_anchor_asst",
        role: "assistant",
        content: "Understood! I will strictly follow TypeScript and Next.js guidelines for this project.",
        timestamp: 101,
      },
      // Intermediate turns that will be omitted
      { id: "m3", role: "user", content: "What is 1 + 1?".repeat(20), timestamp: 102 },
      { id: "m4", role: "assistant", content: "It is 2.".repeat(20), timestamp: 103 },
      { id: "m5", role: "user", content: "Tell me about weather".repeat(20), timestamp: 104 },
      { id: "m6", role: "assistant", content: "Weather is nice.".repeat(20), timestamp: 105 },
      // Recent tail turns that must be kept
      { id: "msg_tail_1", role: "user", content: "Now write the payment gateway button component", timestamp: 106 },
      { id: "msg_tail_2", role: "assistant", content: "Here is the PaymentButton component in TypeScript...", timestamp: 107 },
    ];

    // Constrain budget so intermediate messages cannot all fit
    const trimmed = trimChatHistoryForBudget(messages, 300, { smartShift: true });

    // Anchor (Turn 0 user) must be preserved at index 0
    expect(trimmed[0].id).toBe("msg_anchor_user");
    expect(trimmed[0].content).toContain("CRITICAL SYSTEM INSTRUCTION");

    // Most recent tail turns must be present at the end
    const lastMsg = trimmed[trimmed.length - 1];
    expect(lastMsg.id).toBe("msg_tail_2");

    // A context shift notice must bridge the omitted middle turns
    const shiftNotice = trimmed.find((m) => m.id === "context_shift_notice");
    expect(shiftNotice).toBeDefined();
    expect(shiftNotice?.role).toBe("system");
    expect(shiftNotice?.content).toContain("Context Shift");
  });

  it("falls back to legacy newest-first trimming when smartShift is false", () => {
    const messages: Message[] = [
      { id: "m1", role: "user", content: "Oldest user message that should be dropped".repeat(10), timestamp: 1 },
      { id: "m2", role: "assistant", content: "Oldest assistant reply that should be dropped".repeat(10), timestamp: 2 },
      { id: "m3", role: "user", content: "Newest user message that must be kept", timestamp: 3 },
      { id: "m4", role: "assistant", content: "Newest assistant reply that must be kept", timestamp: 4 },
    ];

    const result = trimChatHistoryForBudget(messages, 100, { smartShift: false });

    // Legacy trimming keeps from newest backwards; oldest message is dropped
    expect(result.some((m) => m.id === "m1")).toBe(false);
    expect(result[result.length - 1].id).toBe("m4");
  });
});

describe("Smart Context: Ephemeral Context Injection", () => {
  it("returns untouched user query when dynamic context is empty or undefined", () => {
    expect(formatUserEphemeralContext("Hello world", undefined)).toBe("Hello world");
    expect(formatUserEphemeralContext("Hello world", "")).toBe("Hello world");
    expect(formatUserEphemeralContext("Hello world", "   ")).toBe("Hello world");
  });

  it("wraps user query with dynamic context formatted on the user turn", () => {
    const dynamicContext = "=== 16K CONTEXT-GUARD: RETRIEVED PROJECT KNOWLEDGE ===\nDoc: auth.ts";
    const userQuery = "How does login function work?";

    const formatted = formatUserEphemeralContext(userQuery, dynamicContext);
    expect(formatted).toContain(dynamicContext);
    expect(formatted).toContain("[User Query]:");
    expect(formatted).toContain(userQuery);
  });
});
