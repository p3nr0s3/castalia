// lib/textDiff.ts
//
// Line-based diff, built specifically for previewing write_file approvals
// (not a general-purpose diff library — kept small and dependency-free).
// Uses classic LCS (longest common subsequence) over lines, which is plenty
// for the file sizes disk tools already cap out at (write_file has no
// explicit size cap today, but approval previews render at most a few
// hundred lines before truncating — see MAX_DIFF_LINES below).

export type DiffLineType = "unchanged" | "added" | "removed";

export interface DiffLine {
  type: DiffLineType;
  text: string;
  /** 1-based line number in the OLD content. Undefined for "added" lines. */
  oldLineNo?: number;
  /** 1-based line number in the NEW content. Undefined for "removed" lines. */
  newLineNo?: number;
}

export interface DiffResult {
  lines: DiffLine[];
  additions: number;
  deletions: number;
  /** True if the diff was cut short because one side had too many lines to diff cheaply. */
  truncated: boolean;
  /** True if oldContent was undefined/empty and newContent is not — i.e. this is a new file, not an edit. */
  isNewFile: boolean;
}

const MAX_DIFF_LINES = 4000; // guard against pathological O(n*m) LCS blowup on huge files

function computeLcsDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const n = oldLines.length;
  const m = newLines.length;

  // dp[i][j] = length of LCS of oldLines[i:] and newLines[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: "unchanged", text: oldLines[i], oldLineNo: i + 1, newLineNo: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "removed", text: oldLines[i], oldLineNo: i + 1 });
      i++;
    } else {
      result.push({ type: "added", text: newLines[j], newLineNo: j + 1 });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: "removed", text: oldLines[i], oldLineNo: i + 1 });
    i++;
  }
  while (j < m) {
    result.push({ type: "added", text: newLines[j], newLineNo: j + 1 });
    j++;
  }
  return result;
}

export function diffText(oldContent: string | undefined, newContent: string): DiffResult {
  const isNewFile = oldContent === undefined || oldContent === "";
  const oldLines = isNewFile ? [] : oldContent.split("\n");
  const newLines = newContent.split("\n");

  if (oldLines.length > MAX_DIFF_LINES || newLines.length > MAX_DIFF_LINES) {
    // Too big to diff cheaply in the browser — fall back to a flat "everything
    // replaced" view rather than hanging on an O(n*m) table.
    const lines: DiffLine[] = [
      ...oldLines.map((text, idx) => ({ type: "removed" as const, text, oldLineNo: idx + 1 })),
      ...newLines.map((text, idx) => ({ type: "added" as const, text, newLineNo: idx + 1 })),
    ];
    return { lines, additions: newLines.length, deletions: oldLines.length, truncated: true, isNewFile };
  }

  const lines = computeLcsDiff(oldLines, newLines);
  const additions = lines.filter((l) => l.type === "added").length;
  const deletions = lines.filter((l) => l.type === "removed").length;
  return { lines, additions, deletions, truncated: false, isNewFile };
}
