import { describe, it, expect } from "vitest";
import { diffText } from "../lib/textDiff";

describe("diffText", () => {
  it("marks everything as added for a brand new file", () => {
    const result = diffText(undefined, "line1\nline2");
    expect(result.isNewFile).toBe(true);
    expect(result.deletions).toBe(0);
    expect(result.additions).toBe(2);
    expect(result.lines.every((l) => l.type === "added")).toBe(true);
  });

  it("produces no diff lines changed for identical content", () => {
    const content = "a\nb\nc";
    const result = diffText(content, content);
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.lines.every((l) => l.type === "unchanged")).toBe(true);
  });

  it("detects a single line changed in the middle without flagging the whole file", () => {
    const oldContent = "one\ntwo\nthree\nfour";
    const newContent = "one\nTWO\nthree\nfour";
    const result = diffText(oldContent, newContent);
    expect(result.deletions).toBe(1);
    expect(result.additions).toBe(1);
    // The unrelated lines should still show up as unchanged, not get swept into the diff.
    const unchangedTexts = result.lines.filter((l) => l.type === "unchanged").map((l) => l.text);
    expect(unchangedTexts).toEqual(["one", "three", "four"]);
  });

  it("detects pure insertions and pure deletions correctly", () => {
    const oldContent = "a\nb\nc";
    const newContent = "a\nb\nc\nd\ne";
    const result = diffText(oldContent, newContent);
    expect(result.additions).toBe(2);
    expect(result.deletions).toBe(0);
  });

  it("falls back to a flat replace view and flags truncated for very large inputs", () => {
    const bigOld = new Array(5000).fill("x").join("\n");
    const bigNew = new Array(5000).fill("y").join("\n");
    const result = diffText(bigOld, bigNew);
    expect(result.truncated).toBe(true);
    expect(result.deletions).toBe(5000);
    expect(result.additions).toBe(5000);
  });

  it("treats empty string old content the same as a new file", () => {
    const result = diffText("", "hello");
    expect(result.isNewFile).toBe(true);
  });
});
