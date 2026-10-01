// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { AgentModal } from "../components/AgentModal";
import { SettingsModal } from "../components/SettingsModal";
import { DEFAULT_SETTINGS } from "../lib/constants";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  window.matchMedia ||= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as any;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const fillAgent = () => {
  fireEvent.change(screen.getByPlaceholderText(/Daily Tech Digest/), { target: { value: "Digest" } });
  fireEvent.change(screen.getByPlaceholderText(/Describe the exact task/), { target: { value: "Summarise the news" } });
};

describe("Agent webhook field", () => {
  const mount = (onSave = vi.fn()) => {
    render(<AgentModal isOpen onClose={() => {}} onSaveAgent={onSave} models={[{ name: "llama3" } as any]} projects={[]} />);
    fillAgent();
    return { onSave, hook: screen.getByLabelText(/Notifikasi webhook/i) as HTMLInputElement };
  };

  it("flags non-https and malformed URLs", () => {
    const { hook } = mount();
    for (const bad of ["http://insecure.example/x", "javascript:alert(1)", "hooks.example.com/x", "https://has space.example"]) {
      fireEvent.change(hook, { target: { value: bad } });
      expect(screen.getByRole("alert"), bad).toBeTruthy();
    }
    fireEvent.change(hook, { target: { value: "https://hooks.example.com/ok" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refuses to save while the URL is invalid, then saves it (trimmed) once fixed", () => {
    const { onSave, hook } = mount();
    fireEvent.change(hook, { target: { value: "http://insecure.example/x" } });
    fireEvent.click(screen.getByText("Create Agent"));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(hook, { target: { value: "  https://hooks.example.com/ok  " } });
    fireEvent.click(screen.getByText("Create Agent"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: "Digest", notifyUrl: "https://hooks.example.com/ok" });
  });

  it("leaves notifyUrl undefined when the field is empty", () => {
    const { onSave } = mount();
    fireEvent.click(screen.getByText("Create Agent"));
    expect(onSave.mock.calls[0][0].notifyUrl).toBeUndefined();
  });
});

describe("Server scheduler toggle", () => {
  const open = () => {
    const onSave = vi.fn();
    const r = render(<SettingsModal isOpen onClose={() => {}} settings={DEFAULT_SETTINGS} onSaveSettings={onSave} models={[]} onDataImported={() => {}} onClearAllChats={() => {}} initialSection="server" onOpenDiskExplorer={() => {}} />);
    return { onSave, ...r };
  };

  it("defaults to ON (the setting is opt-out) and can be turned off", async () => {
    open();
    const box = (await waitFor(() => screen.getByLabelText("Jalankan agen terjadwal dari server"))) as HTMLInputElement;
    expect(DEFAULT_SETTINGS.serverScheduler).toBeUndefined();
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(box.checked).toBe(false);
  });
});
