// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { SettingsModal } from "../components/SettingsModal";
import { DEFAULT_SETTINGS } from "../lib/constants";
import { storage } from "../lib/storage";

const conv = (model: string, p: number, c: number) =>
  ({ id: "c" + model, title: "t", createdAt: 1, updatedAt: Date.now(), model, messages: [{ id: "m" + model, role: "assistant", content: "x", timestamp: Date.now(), model, metrics: { promptEvalCount: p, evalCount: c } }] }) as any;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  window.matchMedia ||= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as any;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function open(onSave = vi.fn()) {
  return {
    onSave,
    ...render(
      <SettingsModal isOpen onClose={() => {}} settings={DEFAULT_SETTINGS} onSaveSettings={onSave} models={[]} onDataImported={() => {}} onClearAllChats={() => {}} initialSection={"usage" as any} onOpenDiskExplorer={() => {}} />
    ),
  };
}

describe("Usage & Cost tab", () => {
  it("shows an empty state when there is no usage", async () => {
    const { container } = open();
    await waitFor(() => expect(container.textContent).toContain("Belum ada data penggunaan"));
  });

  it("totals tokens from stored conversations and marks local models", async () => {
    storage.saveConversations([conv("llama3.1:8b", 1200, 300), conv("gpt-4o", 5000, 1000)], false);
    const { container, getByTestId } = open();
    await waitFor(() => expect(getByTestId("usage-totals").textContent).toContain("6200"));
    expect(getByTestId("usage-totals").textContent).toContain("1300"); // 300 + 1000 output
    expect(container.textContent).toContain("lokal");
    expect(container.textContent).toContain("Harga per juta token"); // only cloud models get a price row
  });

  it("turns a typed price into an estimated cost, and warns about unpriced cloud tokens until then", async () => {
    storage.saveConversations([conv("gpt-4o", 1_000_000, 1_000_000)], false);
    const { container, getByTestId } = open();
    await waitFor(() => expect(container.textContent).toContain("belum punya harga"));
    const inputs = container.querySelectorAll('input[type="number"]');
    expect(inputs.length).toBe(2);
    fireEvent.change(inputs[0], { target: { value: "2.5" } });
    fireEvent.change(inputs[1], { target: { value: "10" } });
    await waitFor(() => expect(getByTestId("usage-totals").textContent).toContain("$12.50"));
    expect(container.textContent).not.toContain("belum punya harga");
  });

  it("rejects negative and non-numeric prices", async () => {
    storage.saveConversations([conv("gpt-4o", 1000, 1000)], false);
    const { container } = open();
    await waitFor(() => expect(container.querySelectorAll('input[type="number"]').length).toBe(2));
    const input = container.querySelectorAll('input[type="number"]')[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-5" } });
    expect(input.value).toBe("");
  });
});
