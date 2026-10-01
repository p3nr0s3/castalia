// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { ServerSnapshots } from "../components/settings/ServerSnapshots";

const snap = (name: string, kind: string, extra = {}) => ({ name, kind, createdAt: Date.UTC(2026, 9, 1), bytes: 5000, conversations: 12, projects: 3, includesSecrets: false, ...extra });
let snapshots: any[];
let calls: { url: string; method: string; body?: any }[];

beforeEach(() => {
  calls = [];
  snapshots = [snap("lyra-auto-20261001-080000.json", "auto"), snap("lyra-manual-20260930-101010.json", "manual")];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string, init: any = {}) => {
      const method = init.method || "GET";
      calls.push({ url: String(url), method, body: init.body ? JSON.parse(init.body) : undefined });
      if (method === "GET" && url === "/api/backup") return new Response(JSON.stringify({ snapshots, backend: "sqlite", autoBackup: true }));
      if (method === "POST") {
        const b = JSON.parse(init.body);
        if (b.action === "snapshot") { snapshots = [snap("lyra-manual-20261001-121212.json", "manual"), ...snapshots]; return new Response(JSON.stringify({ snapshot: snapshots[0] })); }
        if (b.action === "restore") return new Response(JSON.stringify({ restored: { counts: { conversations: 12 }, preRestore: { name: "lyra-pre-restore-20261001-130000.json" } } }));
      }
      if (method === "DELETE") { snapshots = snapshots.filter((s) => !String(url).includes(s.name)); return new Response(JSON.stringify({ removed: true })); }
      if (String(url).includes("download=")) return new Response("{}", { headers: { "content-disposition": 'attachment; filename="x.json"' } });
      return new Response("{}", { status: 404 });
    })
  );
  (URL as any).createObjectURL = vi.fn(() => "blob:x");
  (URL as any).revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}); // jsdom cannot navigate/download
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ServerSnapshots", () => {
  it("lists snapshots with kind, counts and the storage backend", async () => {
    render(<ServerSnapshots includeSecrets={false} />);
    await waitFor(() => expect(screen.getByText("lyra-auto-20261001-080000.json")).toBeTruthy());
    expect(screen.getByText(/Otomatis · /)).toBeTruthy();
    expect(screen.getAllByText(/12 chat, 3 project/).length).toBe(2);
    expect(screen.getByText(/penyimpanan: sqlite/)).toBeTruthy();
  });

  it("creates a snapshot and refreshes the list", async () => {
    render(<ServerSnapshots includeSecrets={false} />);
    await waitFor(() => screen.getByText("lyra-auto-20261001-080000.json"));
    fireEvent.click(screen.getByText("Buat snapshot"));
    await waitFor(() => expect(screen.getByText("lyra-manual-20261001-121212.json")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toContain("Snapshot dibuat");
  });

  it("restores ONLY after the user confirms, in replace mode, and reports the undo snapshot", async () => {
    const confirm = vi.spyOn(window, "confirm");
    render(<ServerSnapshots includeSecrets={false} />);
    await waitFor(() => screen.getByText("lyra-auto-20261001-080000.json"));

    confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getAllByText("Pulihkan")[0]);
    expect(calls.some((c) => c.method === "POST" && c.body?.action === "restore")).toBe(false);

    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getAllByText("Pulihkan")[0]);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("lyra-pre-restore-20261001-130000.json"));
    const restore = calls.find((c) => c.body?.action === "restore")!;
    expect(restore.body).toEqual({ action: "restore", snapshot: "lyra-auto-20261001-080000.json", mode: "replace" });
    expect(String(confirm.mock.calls[0][0])).toMatch(/Sebelum pemulihan|dibatalkan/); // the warning explains the undo point
  });

  it("deletes only after confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<ServerSnapshots includeSecrets={false} />);
    await waitFor(() => screen.getByText("lyra-manual-20260930-101010.json"));
    fireEvent.click(screen.getAllByText("Hapus")[1]);
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getAllByText("Hapus")[1]);
    await waitFor(() => expect(screen.queryByText("lyra-manual-20260930-101010.json")).toBeNull());
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("the live download asks for keys only when the checkbox state says so", async () => {
    const { rerender } = render(<ServerSnapshots includeSecrets={false} />);
    await waitFor(() => screen.getByText("Unduh backup"));
    fireEvent.click(screen.getByText("Unduh backup"));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/backup?download=live")).toBe(true));
    rerender(<ServerSnapshots includeSecrets />);
    fireEvent.click(screen.getByText("Unduh backup + key"));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/backup?download=live&secrets=1")).toBe(true));
  });

  it("surfaces server errors instead of failing silently", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => new Response("{}", { status: 500 }));
    render(<ServerSnapshots includeSecrets={false} />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Gagal memuat snapshot"));
  });
});
