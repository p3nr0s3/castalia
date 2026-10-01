// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { SettingsModal, type SettingsSection } from "../components/SettingsModal";
import { DEFAULT_SETTINGS } from "../lib/constants";

/**
 * SettingsModal used to be one 4,400-line component with no tests at all. It is now a state hook
 * plus 12 lazily-loaded section components (components/settings/*Section.tsx) that receive the
 * hook's return value as `ctx`. TypeScript proves every destructured name exists; these tests prove
 * each tab actually renders (no undefined reference, no hook-order violation) and that tab
 * switching loads the right section.
 */

// A heading that only that tab renders (taken from real renders). The tabs load lazily, so
// seeing the heading proves the section chunk loaded AND rendered, not just the shell.
const SECTIONS: { id: SettingsSection; heading: string }[] = [
  { id: "personalization", heading: "Theme & Color Palette" },
  { id: "chat", heading: "Model Customization & Hyperparameters" },
  { id: "voice", heading: "Voice Call & Speech Synthesis Studio" },
  { id: "skills", heading: "Agentic Skills & Capabilities" },
  { id: "connectors", heading: "Custom Connectors & Bridges" },
  { id: "plugins", heading: "Plugins & Feature Suites" },
  { id: "memory", heading: "Persistent Memory & Context" },
  { id: "retrieval", heading: "Knowledge & Retrieval (RAG) Architecture" },
  { id: "cloud", heading: "Cloud Model API Keys" },
  { id: "server", heading: "Local Server Connections" },
  { id: "usage", heading: "Usage & Cost" },
  { id: "data", heading: "Backup & Data Management" },
  { id: "about", heading: "About & System Diagnostics" },
];

function renderModal(initialSection: SettingsSection) {
  return render(
    <SettingsModal
      isOpen
      onClose={() => {}}
      settings={DEFAULT_SETTINGS}
      onSaveSettings={() => {}}
      models={[]}
      onDataImported={() => {}}
      onClearAllChats={() => {}}
      initialSection={initialSection}
      onOpenDiskExplorer={() => {}}
    />
  );
}

beforeEach(() => {
  // The modal probes local services on mount; none exist in the test.
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as any;
  }
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SettingsModal (split into section components)", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <SettingsModal isOpen={false} onClose={() => {}} settings={DEFAULT_SETTINGS} onSaveSettings={() => {}} models={[]} onDataImported={() => {}} onClearAllChats={() => {}} />
    );
    expect(container.innerHTML).toBe("");
  });

  for (const { id, heading } of SECTIONS) {
    it(`opens the "${id}" tab without throwing and renders its content`, async () => {
      const errors: unknown[] = [];
      const spy = vi.spyOn(console, "error").mockImplementation((...a) => void errors.push(a));
      const { container } = renderModal(id);
      // Sections load through next/dynamic, so content appears asynchronously.
      await waitFor(() => expect(container.textContent || "").toContain(heading), { timeout: 4000 });
      expect(container.textContent || "").toContain("Settings & Preferences");
      spy.mockRestore();
      const fatal = errors.filter((e) => /not defined|Cannot read|Invalid hook|Rendered (more|fewer) hooks|is not a function/i.test(JSON.stringify(e, (_k, v) => (v instanceof Error ? v.message : v))));
      expect(fatal).toEqual([]);
    });
  }

  it("keeps only the selected tab mounted when the initial section changes", async () => {
    const { container, rerender } = renderModal("voice");
    await waitFor(() => expect(container.textContent || "").toContain("Voice Call & Speech Synthesis Studio"));
    rerender(
      <SettingsModal isOpen onClose={() => {}} settings={DEFAULT_SETTINGS} onSaveSettings={() => {}} models={[]} onDataImported={() => {}} onClearAllChats={() => {}} initialSection="cloud" onOpenDiskExplorer={() => {}} />
    );
    await waitFor(() => expect(container.textContent || "").toContain("Cloud Model API Keys"));
    expect(container.textContent || "").not.toContain("Voice Call & Speech Synthesis Studio");
  });
});
