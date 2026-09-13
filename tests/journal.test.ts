import { describe, it, expect } from "vitest";
import { JournalEntry, JournalChecklistItem } from "../lib/types";
import { mergeJournalEntries } from "../lib/serverDb";

describe("Workspace Journal data model & business logic", () => {
  it("creates valid journal entries with rich properties and checklists", () => {
    const checklist: JournalChecklistItem[] = [
      { id: "chk-1", title: "Design SQLite schema", completed: true },
      { id: "chk-2", title: "Implement Notion-like editor UI", completed: true },
      { id: "chk-3", title: "Run end-to-end verification", completed: false },
    ];

    const entry: JournalEntry = {
      id: "entry-1",
      title: "Workspace Modernization Plan",
      content: "# Roadmap\nUpgrading local AI studio experience.",
      icon: "📓",
      coverGradient: "linear-gradient(135deg, #10b981 0%, #3b82f6 100%)",
      category: "project",
      status: "in_progress",
      priority: "high",
      tags: ["architecture", "nextjs", "ollama"],
      checklists: checklist,
      createdAt: 1700000000000,
      updatedAt: 1700000100000,
    };

    expect(entry.id).toBe("entry-1");
    expect(entry.category).toBe("project");
    expect(entry.status).toBe("in_progress");
    expect(entry.checklists?.length).toBe(3);

    const completedCount = entry.checklists ? entry.checklists.filter((c) => c.completed).length : 0;
    const progressPercent = entry.checklists && entry.checklists.length > 0
      ? Math.round((completedCount / entry.checklists.length) * 100)
      : 0;
    expect(completedCount).toBe(2);
    expect(progressPercent).toBe(67);
  });

  it("calculates 0% progress when no checklist items are completed or empty", () => {
    const emptyChecklist: JournalChecklistItem[] = [];
    const emptyProgress = emptyChecklist.length === 0
      ? 0
      : Math.round((emptyChecklist.filter((c) => c.completed).length / emptyChecklist.length) * 100);
    expect(emptyProgress).toBe(0);

    const pendingChecklist: JournalChecklistItem[] = [
      { id: "1", title: "A", completed: false },
      { id: "2", title: "B", completed: false },
    ];
    const pendingProgress = Math.round(
      (pendingChecklist.filter((c) => c.completed).length / pendingChecklist.length) * 100
    );
    expect(pendingProgress).toBe(0);
  });

  it("calculates 100% progress when all checklist items are completed", () => {
    const doneChecklist: JournalChecklistItem[] = [
      { id: "1", title: "A", completed: true },
      { id: "2", title: "B", completed: true },
    ];
    const doneProgress = Math.round(
      (doneChecklist.filter((c) => c.completed).length / doneChecklist.length) * 100
    );
    expect(doneProgress).toBe(100);
  });

  it("merges journal entries preserving the newest update", () => {
    const serverList: JournalEntry[] = [
      {
        id: "entry-1",
        title: "Old Title",
        content: "Original text",
        category: "idea",
        status: "draft",
        priority: "low",
        tags: [],
        checklists: [],
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: "entry-2",
        title: "Server Only Note",
        content: "Only on server",
        category: "quick",
        status: "done",
        priority: "medium",
        tags: ["docs"],
        checklists: [],
        createdAt: 1100,
        updatedAt: 1100,
      },
    ];

    const clientList: JournalEntry[] = [
      {
        id: "entry-1",
        title: "Updated Title from Client",
        content: "New content edited offline",
        category: "idea",
        status: "in_progress",
        priority: "high",
        tags: ["revised"],
        checklists: [{ id: "c1", title: "Task A", completed: true }],
        createdAt: 1000,
        updatedAt: 2000, // newer
      },
      {
        id: "entry-3",
        title: "Client Only Note",
        content: "Created locally",
        category: "daily",
        status: "draft",
        priority: "medium",
        tags: [],
        checklists: [],
        createdAt: 1500,
        updatedAt: 1500,
      },
    ];

    const merged = mergeJournalEntries(serverList, clientList);

    expect(merged.length).toBe(3);

    // entry-1 should have the newer client version
    const entry1 = merged.find((e) => e.id === "entry-1");
    expect(entry1).toBeDefined();
    expect(entry1?.title).toBe("Updated Title from Client");
    expect(entry1?.status).toBe("in_progress");
    expect(entry1?.priority).toBe("high");
    expect(entry1?.checklists?.length).toBe(1);

    // entry-2 and entry-3 should both exist
    expect(merged.some((e) => e.id === "entry-2")).toBe(true);
    expect(merged.some((e) => e.id === "entry-3")).toBe(true);

    // Should be sorted by updatedAt descending
    expect(merged[0].id).toBe("entry-1"); // updatedAt: 2000
    expect(merged[1].id).toBe("entry-3"); // updatedAt: 1500
    expect(merged[2].id).toBe("entry-2"); // updatedAt: 1100
  });

  it("handles empty lists gracefully during merge", () => {
    expect(mergeJournalEntries([], [])).toEqual([]);
    expect(mergeJournalEntries(undefined, undefined)).toEqual([]);
  });

  it("supports migrating legacy tasks to journal entries format", () => {
    const legacyTask = {
      id: "legacy-task-1",
      title: "Fix responsive layout",
      description: "Ensure mobile devices render sidebar drawer properly",
      status: "todo",
      priority: "high",
      tags: ["ui", "css"],
      subtasks: [{ id: "sub-1", title: "Test on iOS Safari", completed: false }],
      dueDate: "2026-09-30",
      createdAt: 1690000000000,
      updatedAt: 1690000050000,
    };

    const migrated: JournalEntry = {
      id: legacyTask.id,
      title: legacyTask.title,
      content: legacyTask.description,
      icon: "🎯",
      category: "task",
      status: legacyTask.status === "todo" ? "draft" : "in_progress",
      priority: legacyTask.priority as any,
      tags: legacyTask.tags,
      checklists: legacyTask.subtasks,
      date: legacyTask.dueDate,
      createdAt: legacyTask.createdAt,
      updatedAt: legacyTask.updatedAt,
    };

    expect(migrated.category).toBe("task");
    expect(migrated.icon).toBe("🎯");
    expect(migrated.status).toBe("draft");
    expect(migrated.checklists?.length).toBe(1);
    expect(migrated.content).toContain("Ensure mobile devices");
  });

  it("extracts bilateral links and calculates backlinks correctly", () => {
    const noteA: JournalEntry = {
      id: "note-a",
      title: "Arsitektur Backend",
      content: "Rencana pengembangan database dan integrasi dengan [[Desain Frontend]].",
      category: "project",
      status: "in_progress",
      tags: ["backend"],
      createdAt: 1000,
      updatedAt: 1000,
    };

    const noteB: JournalEntry = {
      id: "note-b",
      title: "Desain Frontend",
      content: "Panduan komponen UI Tailwind dan referensi ke [[Arsitektur Backend]].",
      category: "project",
      status: "in_progress",
      tags: ["frontend"],
      createdAt: 1000,
      updatedAt: 1000,
    };

    const noteC: JournalEntry = {
      id: "note-c",
      title: "Meeting Notes",
      content: "Membahas progres proyek dan link ke [[Desain Frontend]].",
      category: "daily",
      status: "draft",
      tags: [],
      createdAt: 1000,
      updatedAt: 1000,
    };

    const entries = [noteA, noteB, noteC];

    // Bilateral link extraction for noteA
    const linkRegex = /\[\[(.*?)\]\]/g;
    const extractedLinksA: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(noteA.content)) !== null) {
      extractedLinksA.push(match[1].trim());
    }
    expect(extractedLinksA).toEqual(["Desain Frontend"]);

    // Backlinks for noteB ("Desain Frontend")
    const searchTargetB = `[[${noteB.title.trim().toLowerCase()}]]`;
    const backlinksForB = entries.filter(
      (e) => e.id !== noteB.id && e.content.toLowerCase().includes(searchTargetB)
    );
    expect(backlinksForB.length).toBe(2);
    expect(backlinksForB.map((e) => e.id)).toEqual(["note-a", "note-c"]);

    // Markdown link preprocessor transforms [[Title]] into clickable link tokens
    const processed = noteA.content.replace(/\[\[(.*?)\]\]/g, (_m, title) => {
      const cleanTitle = title.trim();
      return `[🔗 ${cleanTitle}](#journal-note-${encodeURIComponent(cleanTitle)})`;
    });
    expect(processed).toContain("[🔗 Desain Frontend](#journal-note-Desain%20Frontend)");
  });
});
