// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, act } from "@testing-library/react";
import { HistorySearchModal } from "../components/HistorySearchModal";
import { parseSnippet } from "../lib/historySearch";

const HITS = [
  { conversationId: "c1", title: "Kubernetes deploy", messageId: "m2", role: "assistant", snippet: "Use [[kubectl]] rollout undo", updatedAt: 1 },
  { conversationId: "c2", title: "Other", messageId: "m9", role: "user", snippet: "<img src=x onerror=alert(1)> [[kubectl]]", updatedAt: 2 },
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ hits: HITS, engine: "fts5" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const setup = (over: Partial<React.ComponentProps<typeof HistorySearchModal>> = {}) => {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(<HistorySearchModal isOpen onClose={onClose} onSelect={onSelect} {...over} />);
  return { onSelect, onClose, input: screen.getByLabelText("Kata kunci") as HTMLInputElement };
};
const type = async (input: HTMLInputElement, value: string) => {
  fireEvent.change(input, { target: { value } });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
};

describe("parseSnippet", () => {
  it("splits [[match]] markers into segments and leaves everything else as text", () => {
    expect(parseSnippet("a [[b]] c [[d]]")).toEqual([
      { text: "a ", match: false }, { text: "b", match: true }, { text: " c ", match: false }, { text: "d", match: true },
    ]);
    expect(parseSnippet("no markers")).toEqual([{ text: "no markers", match: false }]);
    expect(parseSnippet("")).toEqual([]);
  });
});

describe("HistorySearchModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<HistorySearchModal isOpen={false} onClose={() => {}} onSelect={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("does not search for fewer than 2 characters; debounces, then searches once", async () => {
    const { input } = setup();
    await type(input, "k");
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "ku" } });
    fireEvent.change(input, { target: { value: "kub" } });
    fireEvent.change(input, { target: { value: "kube" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=kube");
  });

  it("shows hits with highlighted terms as <mark>, and never interprets snippet text as HTML", async () => {
    const { input } = setup();
    await type(input, "kubectl");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    const marks = document.querySelectorAll("mark");
    expect(marks).toHaveLength(2);
    expect(marks[0].textContent).toBe("kubectl");
    expect(document.querySelector("img")).toBeNull(); // the <img onerror> payload stayed inert text
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeTruthy();
  });

  it("Enter opens the highlighted result; arrows move; Escape closes", async () => {
    const { input, onSelect, onClose } = setup();
    await type(input, "kubectl");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith("c1", "m2");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith("c2", "m9");
    fireEvent.keyDown(input, { key: "ArrowDown" }); // clamps at the end
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith("c2", "m9");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking a result selects it", async () => {
    const { input, onSelect } = setup();
    await type(input, "kubectl");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("option")[1]);
    expect(onSelect).toHaveBeenCalledWith("c2", "m9");
  });

  it("reports server errors and empty results distinctly", async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
    const { input } = setup();
    await type(input, "abc");
    await waitFor(() => expect(screen.getByText("boom")).toBeTruthy());
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ hits: [] }), { status: 200 }));
    await type(input, "abcd");
    await waitFor(() => expect(screen.getByText("Tidak ada hasil.")).toBeTruthy());
  });

  it("pre-fills from initialQuery and searches immediately (Sidebar hand-off)", async () => {
    setup({ initialQuery: "deploy" });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=deploy");
  });

  it("aborts the in-flight request when the query changes", async () => {
    let firstSignal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce(async (_u: string, init: any) => {
      firstSignal = init.signal;
      return new Promise(() => {}); // never resolves
    });
    const { input } = setup();
    await type(input, "first");
    await type(input, "second");
    expect(firstSignal?.aborted).toBe(true);
  });
});
