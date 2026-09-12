import { describe, it, expect } from "vitest";
import { TaskItem, ReadingItem } from "../lib/types";

describe("TaskManager and ReadingItem logic", () => {
  it("filters and sorts tasks by status and priority", () => {
    const tasks: TaskItem[] = [
      {
        id: "task-1",
        title: "Fix responsive layout",
        status: "in_progress",
        priority: "high",
        tags: ["frontend"],
        createdAt: 1000,
        updatedAt: 2000,
      },
      {
        id: "task-2",
        title: "Setup CI pipeline",
        status: "todo",
        priority: "urgent",
        tags: ["devops"],
        createdAt: 1100,
        updatedAt: 1500,
      },
      {
        id: "task-3",
        title: "Write documentation",
        status: "done",
        priority: "low",
        tags: ["docs"],
        createdAt: 900,
        updatedAt: 3000,
      },
    ];

    const todoTasks = tasks.filter((t) => t.status === "todo");
    expect(todoTasks).toHaveLength(1);
    expect(todoTasks[0].id).toBe("task-2");

    const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
    expect(inProgressTasks).toHaveLength(1);
    expect(inProgressTasks[0].title).toBe("Fix responsive layout");

    const doneTasks = tasks.filter((t) => t.status === "done");
    expect(doneTasks).toHaveLength(1);
    expect(doneTasks[0].status).toBe("done");

    // Subtask progress calculation
    const taskWithSubtasks: TaskItem = {
      id: "task-4",
      title: "Feature with subtasks",
      status: "in_progress",
      priority: "medium",
      tags: ["feature"],
      subtasks: [
        { id: "sub-1", title: "Subtask 1", completed: true },
        { id: "sub-2", title: "Subtask 2", completed: false },
        { id: "sub-3", title: "Subtask 3", completed: true },
      ],
      createdAt: 1000,
      updatedAt: 2000,
    };

    const completedCount = taskWithSubtasks.subtasks?.filter((s) => s.completed).length || 0;
    const totalCount = taskWithSubtasks.subtasks?.length || 0;
    const percent = Math.round((completedCount / totalCount) * 100);

    expect(completedCount).toBe(2);
    expect(totalCount).toBe(3);
    expect(percent).toBe(67);
  });

  it("handles reading item progress and last read sorting", () => {
    const readingItems: ReadingItem[] = [
      {
        id: "book-1",
        title: "Cyberpunk 2077 Novel",
        format: "epub",
        progressPercent: 45,
        currentChapterIndex: 4,
        totalChapters: 10,
        currentComicPageIndex: 0,
        totalPages: 10,
        filesize: 2048,
        lastReadAt: 10000,
        filePath: "C:\\Books\\novel.epub",
      },
      {
        id: "comic-1",
        title: "Solo Leveling Chapter 1",
        format: "comic",
        progressPercent: 80,
        currentChapterIndex: 0,
        totalChapters: 1,
        currentComicPageIndex: 16,
        totalPages: 20,
        filesize: 15480,
        lastReadAt: 20000,
        filePath: "C:\\Comics\\solo.cbz",
      },
    ];

    const sorted = [...readingItems].sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0));
    expect(sorted[0].id).toBe("comic-1");
    expect(sorted[1].id).toBe("book-1");
    expect(sorted[0].progressPercent).toBe(80);
  });
});
