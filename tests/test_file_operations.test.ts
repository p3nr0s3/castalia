import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { runDiskTool } from "../lib/diskToolOps";
import { resolveWithinBase } from "../lib/pathSandbox";

describe("runDiskTool", () => {
  let dir: string;
  const resolvePath = (p?: string) => resolveWithinBase(dir, p);

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "disktool-"));
    await fs.writeFile(path.join(dir, "hello.txt"), "hello world\nsecond line");
    await fs.mkdir(path.join(dir, "sub"));
    await fs.writeFile(path.join(dir, "sub", "nested.txt"), "nested content with keyword");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("list_directory lists files and subdirectories", async () => {
    const { status, body } = await runDiskTool("list_directory", {}, resolvePath);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    const names = body.items.map((i: any) => i.name).sort();
    expect(names).toEqual(["hello.txt", "sub"]);
  });

  it("read_file returns file content", async () => {
    const { body } = await runDiskTool("read_file", { path: "hello.txt" }, resolvePath);
    expect(body.success).toBe(true);
    expect(body.content).toContain("hello world");
  });

  it("read_file refuses to read a directory", async () => {
    const { body } = await runDiskTool("read_file", { path: "sub" }, resolvePath);
    expect(body.success).toBe(false);
  });

  it("write_file creates a new file, including parent directories", async () => {
    const { body } = await runDiskTool(
      "write_file",
      { path: "new/deep/file.txt", content: "created by test" },
      resolvePath
    );
    expect(body.success).toBe(true);
    const written = await fs.readFile(path.join(dir, "new", "deep", "file.txt"), "utf-8");
    expect(written).toBe("created by test");
  });

  it("write_file refuses to escape the sandboxed base directory", async () => {
    await expect(
      runDiskTool("write_file", { path: "../outside.txt", content: "x" }, resolvePath)
    ).rejects.toThrow(/Access denied/);
  });

  it("delete_file removes a file", async () => {
    const { body } = await runDiskTool("delete_file", { path: "hello.txt" }, resolvePath);
    expect(body.success).toBe(true);
    await expect(fs.access(path.join(dir, "hello.txt"))).rejects.toThrow();
  });

  it("delete_file refuses to delete a directory", async () => {
    const { body } = await runDiskTool("delete_file", { path: "sub" }, resolvePath);
    expect(body.success).toBe(false);
  });

  it("search_files finds matches by filename and by content", async () => {
    const { body } = await runDiskTool("search_files", { query: "keyword" }, resolvePath);
    expect(body.success).toBe(true);
    expect(body.matches.some((m: any) => m.name === "nested.txt")).toBe(true);
  });
});
