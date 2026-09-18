# Session Handover — ollama-chat-web

**Repo:** https://github.com/p3nr0s3/ollama-chat-web
**Local path:** `C:\Users\Rei\.gemini\antigravity\scratch\ollama-chat-web` (Windows)
**Stack:** Next.js 14.2.35 (App Router), TypeScript, Vitest (159 tests as of last check), self-hosted Ollama chat UI with RAG, agents, Blender MCP bridge (now generalized), codespace runner, knowledge graph, ambient file-watcher.

## Standing rules (apply automatically, don't re-ask)
- Every patch/change must be delivered as full runnable commands through `git add` → `commit` → `push`.
- Each logical change gets its own separate commit — never squash unrelated changes together.
- User's local repo and GitHub `origin/main` can drift — **always `git fetch origin` and diff against `origin/main` before assuming what's already there.** This bit us once this session (assumed nothing was committed; user had actually pushed 8 more commits, including work items from a prior handover).

## Repo state as of last sync (HEAD `61227a1` before this session's fix)
Commits already on `origin/main`, in order:
1. `c347d4f` — settings modal viewport fit
2. `c8ff09b` — Lucide → Phosphor icon swap (27 files, import-alias only)
3. `983a786` — DuckDuckGo added as parallel second search engine alongside Bing
4. `1b1c33e` — embedding cache persisted to disk + `keep_alive` tuning
5. `1021b6b` — modals code-split via `next/dynamic` + `optimizePackageImports`
6. `a40ea22` — `react-syntax-highlighter` upgraded to 16.1.1, `robot-companion.png` compressed
7. `20213d6` — security: restricted execute-agent approvals to `source=agent`
8. `83a6bbc` — per-project RAG settings exposed (chunk size/overlap, topK, semantic blend)
9. `4ee832f` — doc note: why the Aug-2026 Next.js critical CVEs don't apply to this codebase (no `/pages` router, no `next/image` usage — verified by grep, not just by reading the advisory)
10. `7111f8f` — **new feature**: ambient file-watcher for per-project knowledge folders (`lib/fileWatcher.ts`)
11. `61227a1` — **new feature**: generalized "Local App Bridge" framework extracted from the Blender-specific bridge pattern (`lib/localAppBridge.ts`) — now has a per-install random auth token (fixes the earlier unauthenticated-bridge finding)

Items 6–11 were done independently (by the user or another AI) following the deferred-items list from a prior handover — confirms that handover was useful, keep writing them.

## This session's work
**Bug fixed:** `next dev` was throwing a persistent `Module not found: Can't resolve 'fs'` warning on every compile, from `lib/embeddings.ts` (reachable via `lib/rag.ts` → `app/page.tsx`, a client component). Root cause: the file lazily `require()`s `fs`/`path` inside a `typeof window === "undefined"` runtime guard — safe at runtime, but `next build`'s production optimizer dead-code-eliminates that branch before module resolution (so it was silent in prod), while `next dev` does not perform the same elimination and still tries to resolve the module for the client bundle.

**Fix (patch: `fix-fs-dev-warning.patch`, delivered, not yet confirmed applied):** added a webpack `resolve.fallback = { fs: false, path: false }` for the client (`!isServer`) branch in `next.config.mjs`. Verified by actually running `next dev` in sandbox (not just `next build` — that was the gap that let this bug through initially) — warning is gone, page compiles and serves 200. Tests (159) and production build still pass.

**Commands still owed by user (verify before continuing):**
```
git apply --check fix-fs-dev-warning.patch
git apply fix-fs-dev-warning.patch
npm run dev   # confirm warning is gone
git add next.config.mjs
git commit -m "fix: stub fs/path fallback for client webpack config, silences dev-mode 'Module not found' warning from lib/embeddings.ts"
git push
```

## Reviewed but not yet fixed — next candidate
**`lib/fileWatcher.ts` — synchronous I/O blocks the Node event loop during rescans.**
`rescanProject()` uses `fs.readdirSync`/`statSync`/`readFileSync` (all sync) to walk a watched project folder on every file-change event (after an 800ms debounce). While a rescan runs, it blocks the *entire* Node process — including in-flight chat streaming, the Ollama proxy, and any other concurrent API request. Concretely:
1. Convert to `fs.promises` async equivalents — the main fix, should be done first.
2. `fs.watch(path, { recursive: true })` is only reliably recursive on Windows/macOS, not Linux — not urgent since the user is on Windows, but worth a comment/fix if this is ever deployed to Linux/WSL.
3. No cap on file count/depth scanned — if a watched folder is accidentally pointed at something large, every debounce tick does an unbounded synchronous walk. Suggested: skip+warn past ~500 files rather than scanning everything.

User has not yet said "go" on this — confirm before implementing.

## Other still-open items from the original deferred list
- Verify agent-loop prompt caching is truly append-only into Ollama (the "Smart Context & Static Prompt Cache" toggle only helps if `lib/ollama.ts` serializes the prompt as a stable, byte-identical-prefix each iteration during `runAgentToolLoop`). Not traced yet.
- New feature ideas discussed but not built: agent-action undo via shadow git snapshots (approval queue exists, no rollback), offline local Whisper STT (current voice mode uses browser's `webkitSpeechRecognition`, which is NOT offline — it calls Google's servers), hardware-aware local↔cloud model auto-fallback based on VRAM/battery state.
- A "workbench" visual-identity redesign (sage accent color, mono type, sharp corners, removing the uniform `rounded-2xl` SaaS-card look) was drafted but explicitly declined by the user in favor of the icon-only swap — available if he revisits full visual design later.

## Assumptions / gotchas for whoever picks this up
- Sandbox environment used for testing has **no outbound network access** to `bing.com`/`duckduckgo.com` — the DuckDuckGo scraper (item 3 above) was only verified via `tsc`/build, never against real DuckDuckGo HTML. If it returns 0 results in practice, get a `curl https://html.duckduckgo.com/html/?q=test` sample from the user's machine to fix the regex against real markup.
- User works solo, self-hosted, single-user by design (see `middleware.ts` comments) — don't propose multi-user/auth features without checking first, that's an explicit non-goal.
- Always `git fetch origin` before diagnosing "what's the current state" — see standing rule above.
