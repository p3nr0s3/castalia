#!/usr/bin/env bash
set -e  # berhenti di langkah pertama yang gagal, jangan lanjut paksa

echo "=== Cek HEAD ==="
git fetch origin
git log --oneline -1 origin/main   # harus 4b8fea4

echo "=== Patch 14: fix 2 bug UI di toolbar chat input ==="
git apply --check 14-chatinput-button-fixes.patch
git apply 14-chatinput-button-fixes.patch
cat > /tmp/cm5.txt << 'MSG'
fix(chat-input): disabled toggle buttons had no visual disabled state

Mic, Interactive Chat, Search, Disk Tools, and Thinking Mode toggle
buttons were all disabled via the HTML attribute during streaming, but
none of their className strings had a disabled: Tailwind variant -- they
stayed fully bright/colored as if active. Interactive Chat's emerald
green in particular looked completely clickable while streaming, with no
visual cue it wasn't. Added disabled:opacity-50 disabled:cursor-not-allowed
consistently, matching the pattern the attach button already used.

Also replaced the window.innerWidth < 768 "is this mobile" heuristic for
Enter-key behavior with an actual touch-capability check (matchMedia
pointer:coarse / navigator.maxTouchPoints). The old check misfired on any
narrow DESKTOP browser window (unmaximized, tiled, devtools open) -- Enter
would silently just insert a newline instead of sending/queuing, with a
real physical keyboard and no visible error. Likely the actual root cause
of "the enter/arrow button doesn't work" reports on desktop.

The queue arrow button correctly not appearing on an empty input (nothing
to queue) was checked and confirmed as intended, not a bug -- untouched.
MSG
git add components/ChatInput.tsx
git commit -F /tmp/cm5.txt
rm /tmp/cm5.txt

echo "=== Patch 15: lookup approval yang ditarget (bukan baca seluruh DB) ==="
git apply --check 15-targeted-approval-lookup.patch
git apply 15-targeted-approval-lookup.patch
npx tsc --noEmit
npx vitest run
cat > /tmp/cm6.txt << 'MSG'
perf(tools): targeted approval lookup instead of reading the whole DB

/api/tools/execute, /api/tools/execute-agent, and /api/tools/revert each
called readServerDb() just to check one PendingApproval by id -- but that
function composes the FULL ServerDatabase: every conversation (with every
message's full content), every project, every agent, every journal entry,
via sqliteReadAll's SELECT + JSON.parse per row in each table. None of
that has anything to do with checking one approval.

Added getPendingApprovalById() in lib/serverDb.ts: a real indexed
single-row SQL lookup on the SQLite path (SELECT data FROM
pending_approvals WHERE id = ?). Benchmarked on a synthetic
300-conversation/15-message-each history (~3MB JSON): ~3.3ms per
readServerDb() call vs ~0.0013ms for the targeted lookup -- about 2500x,
and it scales with total history size, so every tool call gets slower the
longer this app has been used.

The JSON-file fallback path (no better-sqlite3 available) has no per-row
indexing -- everything lives in one file -- so it falls back to the exact
same full-read-then-find the old code did there. No regression, just no
speedup for that path; SQLite users get the full benefit.

Updated the existing approval-gate test mocks (tests/toolExecuteApproval.test.ts,
tests/toolRevert.test.ts) to mock getPendingApprovalById instead of
readServerDb, matching what the routes actually call now. All existing
tests pass unchanged otherwise -- this is a pure performance change, no
behavior difference.
MSG
git add lib/serverDb.ts app/api/tools/execute/route.ts app/api/tools/execute-agent/route.ts app/api/tools/revert/route.ts tests/toolExecuteApproval.test.ts tests/toolRevert.test.ts
git commit -F /tmp/cm6.txt
rm /tmp/cm6.txt

echo "=== Push ==="
git push

echo "=== Selesai: 6 commit baru sudah di-push ke atas 4b8fea4 ==="
